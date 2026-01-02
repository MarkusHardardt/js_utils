(function (root) {
    "use strict";
    const SqlHelper = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor') : root.Executor;
    const Client = isNodeJS ? require('./Client') : root.Client;
    const mysql = isNodeJS ? require('mysql') : false;

    class Adapter {
        constructor(connection, verbose) {
            this._con = connection;
            this._verbose = verbose === true;
            this._columns = [];
            this._joins = [];
            this._wheres = [];
            this._values = [];
        }
        close() {
            this._con.release();
            delete this._con;
        }
        clear() {
            this._values.splice(0, this._values.length);
            this._columns.splice(0, this._columns.length);
            this._joins.splice(0, this._joins.length);
            this._wheres.splice(0, this._wheres.length);
        }
        addColumn(expression) {
            this._columns.push(expression);
        }
        addJoin(expression) {
            this._joins.push(expression);
        }
        addWhere(expression, and) {
            this._wheres.push({ expr: expression, opr: and !== false ? ' AND ' : ' OR ' });
        }
        addValue(column, data) {
            var values = this._values, value;
            for (var i = 0, l = values.length; i < l; i++) {
                value = values[i];
                if (value.column === column) {
                    if (Array.isArray(value.data)) {
                        value.data.push(data);
                    } else {
                        value.data = [value.data, data];
                    }
                    return;
                }
            }
            this._values.push({ column, data, apostrophes: false });
        }
        query(queryString, onSuccess, onError) {
            if (this._verbose) {
                console.log(queryString);
            }
            this._con.query(queryString, (error, results, fields) => {
                if (error) {
                    if (typeof onError === 'function') {
                        onError(error);
                    }
                } else {
                    if (typeof onSuccess === 'function') {
                        onSuccess(results, fields);
                    }
                }
            });
        }
        startTransaction(onSuccess, onError) {
            this.query('START TRANSACTION', onSuccess, onError);
        }
        rollbackTransaction(onSuccess, onError) {
            this.query('ROLLBACK', onSuccess, onError);
        }
        commitTransaction(onSuccess, onError) {
            this.query('COMMIT', onSuccess, onError);
        }
        formatSelect(table, group, order, limit) {
            let query = 'SELECT', l, columns = this._columns, joins = this._joins, wheres = this._wheres, expr;
            // COLUMNS
            for (let i = 0, l = columns.length; i < l; i++) {
                if (i > 0) {
                    query += ',';
                }
                query += ' ';
                query += columns[i];
            }
            // TABLE
            query += ' FROM ';
            query += table;
            // JOINS
            for (let i = 0, l = joins.length; i < l; i++) {
                query += ' ';
                query += joins[i];
            }
            // WHERE
            l = wheres.length;
            if (l > 0) {
                query += ' WHERE ';
                for (let i = 0; i < l; i++) {
                    expr = wheres[i];
                    if (i > 0) {
                        query += expr.opr;
                    }
                    query += expr.expr;
                }
            }
            // GROUP
            if (typeof group === 'string') {
                query += ' GROUP BY ';
                query += group;
            }
            // ORDER
            if (typeof order === 'string') {
                query += ' ORDER BY ';
                query += order;
            }
            // LIMIT
            if (typeof limit === 'number') {
                query += ' LIMIT ';
                query += limit;
            }
            // clear, perform query, check for errors and return result
            this.clear();
            return query;
        }
        performSelect(table, group, order, limit, onSuccess, onError) {
            const query = this.formatSelect(table, group, order, limit);
            this.query(query, onSuccess, onError);
        }
        formatInsert(table) {
            let insert = 'INSERT INTO ';
            insert += table;
            insert += ' (';
            // COLUMN NAMES
            let max = 1, i, l, values = this._values, value, data;
            for (let i = 0, l = values.length; i < l; i++) {
                value = values[i];
                if (i > 0) {
                    insert += ', ';
                }
                insert += value.column;
                data = value.data;
                if (Array.isArray(data) && data.length > max) {
                    max = data.length;
                }
            }
            insert += ') VALUES';
            if (max === 1) {
                insert += '(';
                // COLUMN VALUES
                for (let i = 0, l = values.length; i < l; i++) {
                    value = values[i];
                    if (i > 0) {
                        insert += ', ';
                    }
                    data = value.data;
                    if (data === null) {
                        insert += 'NULL';
                    } else {
                        if (value.apostrophes) {
                            insert += "'";
                        }
                        insert += data;
                        if (value.apostrophes) {
                            insert += "'";
                        }
                    }
                }
                insert += ')';
                this.clear();
                return insert;
            } else {
                const inserts = [];
                for (let d = 0; d < max; d++) {
                    let query = '(';
                    // COLUMN VALUES
                    for (i = 0, l = values.length; i < l; i++) {
                        value = values[i];
                        if (i > 0) {
                            query += ', ';
                        }
                        data = value.data[d];
                        if (data === null) {
                            query += 'NULL';
                        } else {
                            if (value.apostrophes) {
                                query += "'";
                            }
                            query += data;
                            if (value.apostrophes) {
                                query += "'";
                            }
                        }
                    }
                    query += ')';
                    inserts.push(query);
                }
                this.clear();
                let queries = [], query = insert, idx = 0, count = inserts.length, nxt;
                while (idx < count) {
                    query += inserts[idx];
                    if (idx < count - 1) {
                        nxt = inserts[idx + 1];
                        if (query.length + 1 + nxt.length > this._maxAllowedPacket) {
                            queries.push(query);
                            query = insert;
                        } else {
                            query += ',';
                        }
                    } else {
                        queries.push(query);
                    }
                    idx++;
                }
                return queries;
            }
        }
        performInsert(table, onSuccess, onError) {
            const query = this.formatInsert(table);
            if (typeof query === 'string') {
                this.query(query, onSuccess, onError);
            } else if (Array.isArray(query)) {
                const that = this, tasks = [];
                tasks.parallel = false;
                for (let i = 0, l = query.length; i < l; i++) {
                    (function () {
                        // closure
                        const q = query[i];
                        tasks.push((onSuc, onErr) => that.query(q, onSuc, onErr));
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            }
        }
        formatUpdate(table, order, limit) {
            let query = 'UPDATE ';
            query += table;
            query += ' SET ';
            let values = this._values, value, data, i, l;
            // COLUMN NAMES AND VALUES
            for (i = 0, l = values.length; i < l; i++) {
                value = values[i];
                if (i > 0) {
                    query += ', ';
                }
                query += value.column;
                query += ' = ';
                data = Array.isArray(value.data) ? value.data[0] : value.data;
                if (data === null) {
                    query += 'NULL';
                } else {
                    if (value.apostrophes) {
                        query += "'";
                    }
                    query += data;
                    if (value.apostrophes) {
                        query += "'";
                    }
                }
            }
            // WHERE
            var wheres = this._wheres, expr;
            if (wheres.length > 0) {
                query += ' WHERE ';
                for (i = 0, l = wheres.length; i < l; i++) {
                    expr = wheres[i];
                    if (i > 0) {
                        query += expr.opr;
                    }
                    query += expr.expr;
                }
            }
            // ORDER
            if (typeof order === 'string') {
                query += ' ORDER BY ';
                query += order;
            }
            // LIMIT
            if (typeof limit === 'number') {
                query += ' LIMIT ';
                query += limit;
            }
            // clear, perform query, check for errors and return result
            this.clear();
            return query;
        }
        performUpdate(table, order, limit, onSuccess, onError) {
            var query = this.formatUpdate(table, order, limit);
            this.query(query, onSuccess, onError);
        }
        formatDelete(table, order, limit) {
            var query = 'DELETE FROM ';
            query += table;
            // WHERE
            var wheres = this._wheres, expr, i, l = wheres.length;
            if (l > 0) {
                query += ' WHERE ';
                for (i = 0; i < l; i++) {
                    expr = wheres[i];
                    if (i > 0) {
                        query += expr.opr;
                    }
                    query += expr.expr;
                }
            }
            // ORDER
            if (typeof order === 'string') {
                query += ' ORDER BY ';
                query += order;
            }
            // LIMIT
            if (typeof limit === 'number') {
                query += ' LIMIT ';
                query += limit;
            }
            // clear, perform query, check for errors and return result
            this.clear();
            return query;
        }
        performDelete(table, order, limit, onSuccess, onError) {
            var query = this.formatDelete(table, order, limit);
            this.query(query, onSuccess, onError);
        }
        /**
         * This returns an array containing objects like this: <code>
         * {
         *   name : 'name of the folder or file',
         *   path : 'full database path',
         *   folder : 'true if name ends with delimiter'
         * }
         * </code>
         */
        getChildNodes(table, column, delimiter, path, onSuccess, onError) {
            var delim = SqlHelper.escape(delimiter);
            var col = 'DISTINCT IF(LOCATE(';
            col += delim;
            col += ', ';
            col += table;
            col += '.';
            col += column;
            col += ', ';
            col += path.length + 1;
            col += ') > 0, SUBSTRING(';
            col += table;
            col += '.';
            col += column;
            col += ', ';
            col += path.length + 1;
            col += ', (LOCATE(';
            col += delim;
            col += ', ';
            col += table;
            col += '.';
            col += column;
            col += ', ';
            col += path.length + 1;
            col += ') - ';
            col += path.length;
            col += ')), SUBSTRING(';
            col += table;
            col += '.';
            col += column;
            col += ', ';
            col += path.length + 1;
            col += ', LENGTH(';
            col += table;
            col += '.';
            col += column;
            col += '))) AS child';
            this.addColumn(col);
            this.addWhere('LOCATE(' + SqlHelper.escape(path) + ', ' + table + '.' + column + ') = 1');
            this.performSelect(table, undefined, undefined, undefined, function (i_results, i_fields) {
                var nodes = [], i, l, child, pos, hasChildren;
                for (i = 0, l = i_results.length; i < l; i++) {
                    child = i_results[i].child;
                    pos = child.indexOf(delimiter);
                    hasChildren = pos === (child.length - delimiter.length);
                    nodes.push({
                        name: hasChildren ? child.substr(0, pos) : child,
                        path: path + child,
                        folder: hasChildren
                    });
                }
                onSuccess(nodes);
            }, onError);
        }
        getTrendData() {
            console.error('ERROR! Not implemented: getTrendData()');
        }
    }

    class Proxy {
        constructor(url, onResponse) {
            this._url = url;
            var that = this;
            if (!true) { // TODO: Make this running, but only if still required (is this not just debug stuff to test SQL statements in the browser?)
                Client.fetch(url, JsonFX.stringify({ connect: true }, false), response => {
                    const result = JsonFX.parse(response, false, false);
                    that._id = result.id;
                    onResponse(result.config);
                }, error => console.error(`DEBUG_SQL_PROXY: connect-error: ${error}`));
                return;
            } else {
                $.ajax({
                    type: 'POST',
                    url,
                    data: {
                        connect: true
                    },
                    success: function (i_result, i_textStatus, i_jqXHR) {
                        that._id = i_result.id;
                        // console.log('DEBUG_SQL_PROXY: connected [id: ' + i_result + ']');
                        onResponse(i_result.config);
                    },
                    error: function (i_jqXHR, i_textStatus, i_errorThrown) {
                        console.error('DEBUG_SQL_PROXY: connect-error');
                    },
                    timeout: 10000
                });
            }
        }
        query(i_query, i_callback) {
            var url = this._url, id = this._id;
            if (url) {
                if (!true) { // TODO: Make this running, but only if still required (is this not just debug stuff to test SQL statements in the browser?)
                    Client.fetch(url, JsonFX.stringify({ query: i_query, id }, false), response => {
                        try {
                            i_callback(undefined, JSON.parse(response), undefined);
                        } catch (exc) {
                            i_callback(exc, undefined, undefined);
                        }
                    }, error => i_callback(error, undefined, undefined));
                    return;
                }
                $.ajax({
                    type: 'POST',
                    url: url,
                    data: {
                        query: i_query,
                        id: id
                    },
                    success: function (i_result, i_textStatus, i_jqXHR) {
                        try {
                            i_callback(undefined, JSON.parse(i_result), undefined);
                        }
                        catch (exc) {
                            i_callback(exc, undefined, undefined);
                        }
                    },
                    error: function (i_jqXHR, i_textStatus, i_errorThrown) {
                        i_callback(i_errorThrown, undefined, undefined);
                    },
                    timeout: 10000
                });
            }
            else {
                i_callback(new Error('sql-sql-proxy connection already released!'), undefined, undefined);
            }
        }
        release() {
            var url = this._url, id = this._id;
            if (url) {
                if (!true) { // TODO: Make this running, but only if still required (is this not just debug stuff to test SQL statements in the browser?)
                    Client.fetch(url, JsonFX.stringify({ release: true, id }, false), response => {
                        // Nothing to do
                    }, error => console.error(`DEBUG_SQL_PROXY: release-error [${id}], error: ${error}`));
                    return;
                }
                $.ajax({
                    type: 'POST',
                    url: url,
                    data: {
                        release: true,
                        id: id
                    },
                    success: function (i_result, i_textStatus, i_jqXHR) {
                        // console.log('DEBUG_SQL_PROXY: released [id: ' + i_result +
                        // ']');
                    },
                    error: function (i_jqXHR, i_textStatus, i_errorThrown) {
                        console.error('DEBUG_SQL_PROXY: release-error [' + id + ']');
                    },
                    timeout: 10000
                });
            }
            else {
                console.error('debug-sql-proxy connection already released!');
            }
            delete this._url;
            delete this._id;
        }
    }

    class Instance {
        constructor(config, verbose) {
            if (mysql) {
                const helper = mysql.createPool(config);
                this.createAdapter = (onSuccess, onError) => {
                    helper.getConnection((onErr, connection) => {
                        if (onErr) {
                            onError(onErr);
                        } else {
                            onSuccess(new Adapter(connection, verbose));
                        }
                    });
                };
                this.getConnection = (onSuccess, onError) => {
                    helper.getConnection(function (onErr, connection) {
                        if (onErr) {
                            onError(onErr);
                        } else {
                            onSuccess(connection);
                        }
                    });
                };
            } else { // TODO: What is this for? 
                this.createAdapter = (onSuccess, onError) => {
                    // TODO what is i_config ???
                    const proxy = new Proxy(config, result => onSuccess(new Adapter(proxy, verbose), result));
                };
                this.getConnection = function (onSuccess, onError) {
                    throw new Error('mysql.getConnection() only available on server side!');
                };
            }
        }
    }
    SqlHelper.Instance = Instance;

    function escape(value) {
        return mysql ? mysql.escape(value) : root.SqlString.escape(value);
    }
    SqlHelper.escape = escape;

    if (isNodeJS) {
        module.exports = SqlHelper;
    }
    else {
        root.SqlHelper = SqlHelper;
    }

}(globalThis));