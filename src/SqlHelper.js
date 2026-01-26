(function (root) {
    "use strict";
    const SqlHelper = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor') : root.Executor;
    const mysql = isNodeJS ? require('mysql') : false;

    function escape(value) {
        return mysql ? mysql.escape(value) : root.SqlString.escape(value);
    }
    SqlHelper.escape = escape;

    class Adapter {
        constructor(connection, verbose) {
            this._con = connection;
            this._verbose = verbose === true;
            this._columns = [];
            this._joins = [];
            this._wheres = [];
            this._values = [];
        }
        Close() {
            if (!this._con) {
                console.error('SQL adapter has allready been closed');
                return;
            }
            this._con.release();
            delete this._con;
        }
        _clear() {
            this._values.splice(0, this._values.length);
            this._columns.splice(0, this._columns.length);
            this._joins.splice(0, this._joins.length);
            this._wheres.splice(0, this._wheres.length);
        }
        AddColumn(expression) {
            this._columns.push(expression);
        }
        AddJoin(expression) {
            this._joins.push(expression);
        }
        AddWhere(expression, and) {
            this._wheres.push({ expr: expression, opr: and !== false ? ' AND ' : ' OR ' });
        }
        AddValue(column, data) {
            let values = this._values, value;
            for (let i = 0, l = values.length; i < l; i++) {
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
        _query(queryString, onSuccess, onError) {
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
        StartTransaction(onSuccess, onError) {
            this._query('START TRANSACTION', onSuccess, onError);
        }
        RollbackTransaction(onSuccess, onError) {
            this._query('ROLLBACK', onSuccess, onError);
        }
        CommitTransaction(onSuccess, onError) {
            this._query('COMMIT', onSuccess, onError);
        }
        _formatSelect(table, group, order, limit) {
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
            this._clear();
            return query;
        }
        PerformSelect(table, group, order, limit, onSuccess, onError) {
            const query = this._formatSelect(table, group, order, limit);
            this._query(query, onSuccess, onError);
        }
        _formatInsert(table) {
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
                this._clear();
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
                this._clear();
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
        PerformInsert(table, onSuccess, onError) {
            const query = this._formatInsert(table);
            if (typeof query === 'string') {
                this._query(query, onSuccess, onError);
            } else if (Array.isArray(query)) {
                const that = this, tasks = [];
                tasks.parallel = false;
                for (let i = 0, l = query.length; i < l; i++) {
                    (function () {
                        // closure
                        const q = query[i];
                        tasks.push((onSuc, onErr) => that._query(q, onSuc, onErr));
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            }
        }
        _formatUpdate(table, order, limit) {
            let query = `UPDATE ${table} SET `;
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
            let wheres = this._wheres, expr;
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
            this._clear();
            return query;
        }
        PerformUpdate(table, order, limit, onSuccess, onError) {
            const query = this._formatUpdate(table, order, limit);
            this._query(query, onSuccess, onError);
        }
        _formatDelete(table, order, limit) {
            let query = 'DELETE FROM ';
            query += table;
            // WHERE
            let wheres = this._wheres, expr, i, l = wheres.length;
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
            this._clear();
            return query;
        }
        PerformDelete(table, order, limit, onSuccess, onError) {
            const query = this._formatDelete(table, order, limit);
            this._query(query, onSuccess, onError);
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
        GetChildNodes(table, column, delimiter, path, onSuccess, onError) {
            const delim = SqlHelper.escape(delimiter);
            const plp1 = path.length + 1;
            const tabCol = `${table}.${column}`;
            let col = `DISTINCT IF(LOCATE(${delim}, ${tabCol}, ${(plp1)}) > 0, SUBSTRING(${tabCol}, ${(plp1)}, (LOCATE(${delim}, ${tabCol}, ${plp1}) - ${path.length})), SUBSTRING(${tabCol}, ${plp1}, LENGTH(${tabCol}))) AS child`;
            this.AddColumn(col);
            this.AddWhere(`LOCATE(${escape(path)}, ${tabCol}) = 1`);
            this.PerformSelect(table, undefined, undefined, undefined, function (results, fields) {
                const nodes = [];
                for (let i = 0, l = results.length; i < l; i++) {
                    const child = results[i].child;
                    const pos = child.indexOf(delimiter);
                    const hasChildren = pos === (child.length - delimiter.length);
                    nodes.push({
                        name: hasChildren ? child.substr(0, pos) : child,
                        path: path + child,
                        folder: hasChildren
                    });
                }
                onSuccess(nodes);
            }, onError);
        }
        GetTrendData() {
            throw new Error('ERROR! Not implemented: GetTrendData()');
        }
    }

    function getAdapterFactory(config, verbose) {
        const db_access = require(typeof config === 'string' ? config : '../cfg/db_access.json');
        const helper = mysql.createPool(db_access);
        return (onSuccess, onError) => {
            helper.getConnection((onErr, connection) => {
                if (onErr) {
                    onError(onErr);
                } else {
                    onSuccess(new Adapter(connection, verbose));
                }
            });
        };
    }
    SqlHelper.getAdapterFactory = getAdapterFactory;

    Object.freeze(SqlHelper);
    if (isNodeJS) {
        module.exports = SqlHelper;
    }
}(globalThis));