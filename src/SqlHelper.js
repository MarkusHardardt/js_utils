(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Executor = isNodeJS ? require('./Executor') : root.Executor;
    const Client = isNodeJS ? require('./Client') : root.Client;
    const mysql = isNodeJS ? require('mysql') : false;

    function SqlHelper(config, verbose) {
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
    };

    SqlHelper.escape = function (value) {
        return mysql ? mysql.escape(value) : root.SqlString.escape(value);
    };

    function Proxy(url, onResponse) {
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
    };

    Proxy.prototype = {
        query: function (i_query, i_callback) {
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
        },
        release: function () {
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
    };

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
        addColumn(i_expression) {
            this._columns.push(i_expression);
        }
        addJoin(i_expression) {
            this._joins.push(i_expression);
        }
        addWhere(i_expression, i_and) {
            this._wheres.push({
                expr: i_expression,
                opr: i_and !== false ? ' AND ' : ' OR '
            });
        }
        // TODO i_apostrophes used? escape add's them anyway ...
        addValue(i_column, i_data, i_apostrophes) {
            var values = this._values, value;
            for (var i = 0, l = values.length; i < l; i++) {
                value = values[i];
                if (value.column === i_column) {
                    if (Array.isArray(value.data)) {
                        value.data.push(i_data);
                    }
                    else {
                        value.data = [value.data, i_data];
                    }
                    return;
                }
            }
            this._values.push({
                column: i_column,
                data: i_data,
                apostrophes: false
                // i_apostrophes !== false
            });
        }
        query(i_query, onSuccess, onError) {
            if (this._verbose) {
                console.log(i_query);
            }
            this._con.query(i_query, function (i_exception, i_results, i_fields) {
                if (i_exception) {
                    if (typeof onError === 'function') {
                        onError(i_exception);
                    }
                }
                else {
                    if (typeof onSuccess === 'function') {
                        onSuccess(i_results, i_fields);
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
        formatSelect(i_table, i_group, i_order, i_limit) {
            var query = 'SELECT', i, l, columns = this._columns, joins = this._joins, wheres = this._wheres, expr;
            // COLUMNS
            for (i = 0, l = columns.length; i < l; i++) {
                if (i > 0) {
                    query += ',';
                }
                query += ' ';
                query += columns[i];
            }
            // TABLE
            query += ' FROM ';
            query += i_table;
            // JOINS
            for (i = 0, l = joins.length; i < l; i++) {
                query += ' ';
                query += joins[i];
            }
            // WHERE
            l = wheres.length;
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
            // GROUP
            if (typeof i_group === 'string') {
                query += ' GROUP BY ';
                query += i_group;
            }
            // ORDER
            if (typeof i_order === 'string') {
                query += ' ORDER BY ';
                query += i_order;
            }
            // LIMIT
            if (typeof i_limit === 'number') {
                query += ' LIMIT ';
                query += i_limit;
            }
            // clear, perform query, check for errors and return result
            this.clear();
            return query;
        }
        performSelect(i_table, i_group, i_order, i_limit, onSuccess, onError) {
            var query = this.formatSelect(i_table, i_group, i_order, i_limit);
            this.query(query, onSuccess, onError);
        }
        formatInsert(i_table) {
            var insert = 'INSERT INTO ';
            insert += i_table;
            insert += ' (';
            // COLUMN NAMES
            var max = 1, i, l, values = this._values, value, data;
            for (i = 0, l = values.length; i < l; i++) {
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
                for (i = 0, l = values.length; i < l; i++) {
                    value = values[i];
                    if (i > 0) {
                        insert += ', ';
                    }
                    data = value.data;
                    if (data === null) {
                        insert += 'NULL';
                    }
                    else {
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
            }
            else {
                var inserts = [], d, query;
                for (d = 0; d < max; d++) {
                    query = '(';
                    // COLUMN VALUES
                    for (i = 0, l = values.length; i < l; i++) {
                        value = values[i];
                        if (i > 0) {
                            query += ', ';
                        }
                        data = value.data[d];
                        if (data === null) {
                            query += 'NULL';
                        }
                        else {
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
                var queries = [], query = insert, idx = 0, count = inserts.length, nxt;
                while (idx < count) {
                    query += inserts[idx];
                    if (idx < count - 1) {
                        nxt = inserts[idx + 1];
                        if (query.length + 1 + nxt.length > this._maxAllowedPacket) {
                            queries.push(query);
                            query = insert;
                        }
                        else {
                            query += ',';
                        }
                    }
                    else {
                        queries.push(query);
                    }
                    idx++;
                }
                return queries;
            }
        }
        performInsert(i_table, onSuccess, onError) {
            var query = this.formatInsert(i_table);
            if (typeof query === 'string') {
                this.query(query, onSuccess, onError);
            }
            else if (Array.isArray(query)) {
                var that = this, tasks = [];
                tasks.parallel = false;
                for (var i = 0, l = query.length; i < l; i++) {
                    (function () {
                        // closure
                        var q = query[i];
                        tasks.push(function (i_suc, i_err) {
                            that.query(q, i_suc, i_err);
                        });
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            }
        }
        formatUpdate(i_table, i_order, i_limit) {
            var query = 'UPDATE ';
            query += i_table;
            query += ' SET ';
            var values = this._values, value, data, i, l;
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
                }
                else {
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
            if (typeof i_order === 'string') {
                query += ' ORDER BY ';
                query += i_order;
            }
            // LIMIT
            if (typeof i_limit === 'number') {
                query += ' LIMIT ';
                query += i_limit;
            }
            // clear, perform query, check for errors and return result
            this.clear();
            return query;
        }
        performUpdate(i_table, i_order, i_limit, onSuccess, onError) {
            var query = this.formatUpdate(i_table, i_order, i_limit);
            this.query(query, onSuccess, onError);
        }
        formatDelete(i_table, i_order, i_limit) {
            var query = 'DELETE FROM ';
            query += i_table;
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
            if (typeof i_order === 'string') {
                query += ' ORDER BY ';
                query += i_order;
            }
            // LIMIT
            if (typeof i_limit === 'number') {
                query += ' LIMIT ';
                query += i_limit;
            }
            // clear, perform query, check for errors and return result
            this.clear();
            return query;
        }
        performDelete(i_table, i_order, i_limit, onSuccess, onError) {
            var query = this.formatDelete(i_table, i_order, i_limit);
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
        getChildNodes(i_table, i_column, i_delimiter, i_path, onSuccess, onError) {
            var delim = SqlHelper.escape(i_delimiter);
            var col = 'DISTINCT IF(LOCATE(';
            col += delim;
            col += ', ';
            col += i_table;
            col += '.';
            col += i_column;
            col += ', ';
            col += i_path.length + 1;
            col += ') > 0, SUBSTRING(';
            col += i_table;
            col += '.';
            col += i_column;
            col += ', ';
            col += i_path.length + 1;
            col += ', (LOCATE(';
            col += delim;
            col += ', ';
            col += i_table;
            col += '.';
            col += i_column;
            col += ', ';
            col += i_path.length + 1;
            col += ') - ';
            col += i_path.length;
            col += ')), SUBSTRING(';
            col += i_table;
            col += '.';
            col += i_column;
            col += ', ';
            col += i_path.length + 1;
            col += ', LENGTH(';
            col += i_table;
            col += '.';
            col += i_column;
            col += '))) AS child';
            this.addColumn(col);
            this.addWhere('LOCATE(' + SqlHelper.escape(i_path) + ', ' + i_table + '.' + i_column + ') = 1');
            this.performSelect(i_table, undefined, undefined, undefined, function (i_results, i_fields) {
                var nodes = [], i, l, child, pos, hasChildren;
                for (i = 0, l = i_results.length; i < l; i++) {
                    child = i_results[i].child;
                    pos = child.indexOf(i_delimiter);
                    hasChildren = pos === (child.length - i_delimiter.length);
                    nodes.push({
                        name: hasChildren ? child.substr(0, pos) : child,
                        path: i_path + child,
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

    if (isNodeJS) {
        module.exports = SqlHelper;
    }
    else {
        root.SqlHelper = SqlHelper;
    }

}(globalThis));