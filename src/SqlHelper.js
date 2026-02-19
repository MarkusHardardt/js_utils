(function (root) {
    "use strict";
    const SqlHelper = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor') : root.Executor;
    const Common = isNodeJS ? require('./Common') : root.Common;
    const mysql = isNodeJS ? require('mysql') : false;

    function escape(value) {
        return mysql ? mysql.escape(value) : root.SqlString.escape(value);
    }
    SqlHelper.escape = escape;

    class Adapter {
        #logger;
        #connection;
        #verbose;
        #columns;
        #joins;
        #wheres;
        #values;
        constructor(logger, connection, verbose) {
            this.#logger = logger;
            this.#connection = connection;
            this.#verbose = verbose === true;
            this.#columns = [];
            this.#joins = [];
            this.#wheres = [];
            this.#values = [];
        }

        close() {
            if (!this.#connection) {
                this.#logger.error('SQL adapter has allready been closed');
                return;
            }
            this.#connection.release();
            this.#connection = null;
        }

        #clear() {
            this.#values.splice(0, this.#values.length);
            this.#columns.splice(0, this.#columns.length);
            this.#joins.splice(0, this.#joins.length);
            this.#wheres.splice(0, this.#wheres.length);
        }

        addColumn(expression) {
            this.#columns.push(expression);
        }

        addJoin(expression) {
            this.#joins.push(expression);
        }

        addWhere(expression, and) {
            this.#wheres.push({ expr: expression, opr: and !== false ? ' AND ' : ' OR ' });
        }

        addValue(column, data) {
            let values = this.#values, value;
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
            this.#values.push({ column, data, apostrophes: false });
        }

        #query(queryString, onSuccess, onError) {
            if (this.#verbose) {
                this.#logger.trace(queryString);
            }
            this.#connection.query(queryString, (error, results, fields) => {
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
            this.#query('START TRANSACTION', onSuccess, onError);
        }

        rollbackTransaction(onSuccess, onError) {
            this.#query('ROLLBACK', onSuccess, onError);
        }

        commitTransaction(onSuccess, onError) {
            this.#query('COMMIT', onSuccess, onError);
        }

        #formatSelect(table, group, order, limit) {
            let query = 'SELECT', l, columns = this.#columns, joins = this.#joins, wheres = this.#wheres, expr;
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
            this.#clear();
            return query;
        }

        performSelect(table, group, order, limit, onSuccess, onError) {
            const query = this.#formatSelect(table, group, order, limit);
            this.#query(query, onSuccess, onError);
        }

        #formatInsert(table) {
            let insert = 'INSERT INTO ';
            insert += table;
            insert += ' (';
            // COLUMN NAMES
            let max = 1, i, l, values = this.#values, value, data;
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
                this.#clear();
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
                this.#clear();
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
            const query = this.#formatInsert(table);
            if (typeof query === 'string') {
                this.#query(query, onSuccess, onError);
            } else if (Array.isArray(query)) {
                const that = this, tasks = [];
                tasks.parallel = false;
                for (let i = 0, l = query.length; i < l; i++) {
                    (function () {
                        // closure
                        const q = query[i];
                        tasks.push((onSuc, onErr) => that.#query(q, onSuc, onErr));
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            }
        }

        #formatUpdate(table, order, limit) {
            let query = `UPDATE ${table} SET `;
            let values = this.#values, value, data, i, l;
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
            let wheres = this.#wheres, expr;
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
            this.#clear();
            return query;
        }

        performUpdate(table, order, limit, onSuccess, onError) {
            const query = this.#formatUpdate(table, order, limit);
            this.#query(query, onSuccess, onError);
        }

        #formatDelete(table, order, limit) {
            let query = 'DELETE FROM ';
            query += table;
            // WHERE
            let wheres = this.#wheres, expr, i, l = wheres.length;
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
            this.#clear();
            return query;
        }

        performDelete(table, order, limit, onSuccess, onError) {
            const query = this.#formatDelete(table, order, limit);
            this.#query(query, onSuccess, onError);
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
            const delim = SqlHelper.escape(delimiter);
            const plp1 = path.length + 1;
            const tabCol = `${table}.${column}`;
            let col = `DISTINCT IF(LOCATE(${delim}, ${tabCol}, ${(plp1)}) > 0, SUBSTRING(${tabCol}, ${(plp1)}, (LOCATE(${delim}, ${tabCol}, ${plp1}) - ${path.length})), SUBSTRING(${tabCol}, ${plp1}, LENGTH(${tabCol}))) AS child`;
            this.addColumn(col);
            this.addWhere(`LOCATE(${escape(path)}, ${tabCol}) = 1`);
            this.performSelect(table, undefined, undefined, undefined, function (results, fields) {
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
        getTrendData() {
            throw new Error('ERROR! Not implemented: getTrendData()');
        }
    }

    function getAdapterFactory(logger, config, verbose) {
        Common.validateAsLogger(logger, true);
        const db_access = require(typeof config === 'string' ? config : '../cfg/db_access.json');
        const helper = mysql.createPool(db_access);
        return (onSuccess, onError) => {
            helper.getConnection((onErr, connection) => {
                if (onErr) {
                    onError(onErr);
                } else {
                    onSuccess(new Adapter(logger, connection, verbose));
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