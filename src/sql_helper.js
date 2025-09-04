(function(root) {
  "use strict";

  const isNodeJS = typeof require === 'function';

  var Executor = isNodeJS ? require('./tasks') : root.tasks;
  var mysql = isNodeJS ? require('mysql') : false;

  var sql_helper = function(i_config, i_verbose) {
    var that = this;
    if (mysql) {
      var helper = mysql.createPool(i_config);
      this.createAdapter = function(i_success, i_error) {
        helper.getConnection(function(i_err, i_con) {
          if (i_err) {
            i_error(i_err);
          }
          else {
            i_success(new Adapter(i_con, i_verbose));
          }
        });
      };
      this.getConnection = function(i_success, i_error) {
        helper.getConnection(function(i_err, i_con) {
          if (i_err) {
            i_error(i_err);
          }
          else {
            i_success(i_con);
          }
        });
      };
    }
    else {
      this.createAdapter = function(i_success, i_error) {
        // TODO what is i_config ???
        var proxy = new Proxy(i_config, function(i_config) {
          i_success(new Adapter(proxy, i_verbose), i_config);
        });
      };
      this.getConnection = function(i_success, i_error) {
        throw new Error('mysql.getConnection() only available on server side!');
      };
    }
  };

  sql_helper.escape = function(i_value) {
    return mysql ? mysql.escape(i_value) : window.SqlString.escape(i_value);
  };

  var Proxy = function(i_url, i_callback) {
    this._url = i_url;
    var that = this;
    $.ajax({
        type : 'POST',
        url : i_url,
        data : {
          connect : true
        },
        success : function(i_result, i_textStatus, i_jqXHR) {
          that._id = i_result.id;
          // console.log('DEBUG_SQL_PROXY: connected [id: ' + i_result + ']');
          i_callback(i_result.config);
        },
        error : function(i_jqXHR, i_textStatus, i_errorThrown) {
          console.error('DEBUG_SQL_PROXY: connect-error');
        },
        timeout : 10000
    });
  };

  Proxy.prototype = {
      query : function(i_query, i_callback) {
        var url = this._url, id = this._id;
        if (url) {
          $.ajax({
              type : 'POST',
              url : url,
              data : {
                  query : i_query,
                  id : id
              },
              success : function(i_result, i_textStatus, i_jqXHR) {
                try {
                  i_callback(undefined, JSON.parse(i_result), undefined);
                }
                catch (exc) {
                  i_callback(exc, undefined, undefined);
                }
              },
              error : function(i_jqXHR, i_textStatus, i_errorThrown) {
                i_callback(i_errorThrown, undefined, undefined);
              },
              timeout : 10000
          });
        }
        else {
          i_callback(new Error('sql-sql-proxy connection already released!'), undefined, undefined);
        }
      },
      release : function() {
        var url = this._url, id = this._id;
        if (url) {
          $.ajax({
              type : 'POST',
              url : url,
              data : {
                  release : true,
                  id : id
              },
              success : function(i_result, i_textStatus, i_jqXHR) {
                // console.log('DEBUG_SQL_PROXY: released [id: ' + i_result +
                // ']');
              },
              error : function(i_jqXHR, i_textStatus, i_errorThrown) {
                console.error('DEBUG_SQL_PROXY: release-error [' + id + ']');
              },
              timeout : 10000
          });
        }
        else {
          console.error('debug-sql-proxy connection already released!');
        }
        delete this._url;
        delete this._id;
      }
  };

  var Adapter = function(i_connection, i_verbose) {
    this._con = i_connection;
    this._verbose = i_verbose === true;
    this._columns = [];
    this._joins = [];
    this._wheres = [];
    this._values = [];
  };

  Adapter.prototype = {
      close : function() {
        this._con.release();
        delete this._con;
      },
      clear : function() {
        this._values.splice(0, this._values.length);
        this._columns.splice(0, this._columns.length);
        this._joins.splice(0, this._joins.length);
        this._wheres.splice(0, this._wheres.length);
      },
      addColumn : function(i_expression) {
        this._columns.push(i_expression);
      },
      addJoin : function(i_expression) {
        this._joins.push(i_expression);
      },
      addWhere : function(i_expression, i_and) {
        this._wheres.push({
            expr : i_expression,
            opr : i_and !== false ? ' AND ' : ' OR '
        });
      },
      // TODO i_apostrophes used? escape add's them anyway ...
      addValue : function(i_column, i_data, i_apostrophes) {
        var values = this._values, value;
        for (var i = 0, l = values.length; i < l; i++) {
          value = values[i];
          if (value.column === i_column) {
            if (Array.isArray(value.data)) {
              value.data.push(i_data);
            }
            else {
              value.data = [ value.data, i_data ];
            }
            return;
          }
        }
        this._values.push({
            column : i_column,
            data : i_data,
            apostrophes : false
        // i_apostrophes !== false
        });
      },
      query : function(i_query, i_success, i_error) {
        if (this._verbose) {
          console.log(i_query);
        }
        this._con.query(i_query, function(i_exception, i_results, i_fields) {
          if (i_exception) {
            if (typeof i_error === 'function') {
              i_error(i_exception);
            }
          }
          else {
            if (typeof i_success === 'function') {
              i_success(i_results, i_fields);
            }
          }
        });
      },
      startTransaction : function(i_success, i_error) {
        this.query('START TRANSACTION', i_success, i_error);
      },
      rollbackTransaction : function(i_success, i_error) {
        this.query('ROLLBACK', i_success, i_error);
      },
      commitTransaction : function(i_success, i_error) {
        this.query('COMMIT', i_success, i_error);
      },
      formatSelect : function(i_table, i_group, i_order, i_limit) {
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
      },
      performSelect : function(i_table, i_group, i_order, i_limit, i_success, i_error) {
        var query = this.formatSelect(i_table, i_group, i_order, i_limit);
        this.query(query, i_success, i_error);
      },
      formatInsert : function(i_table) {
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
      },
      performInsert : function(i_table, i_success, i_error) {
        var query = this.formatInsert(i_table);
        if (typeof query === 'string') {
          this.query(query, i_success, i_error);
        }
        else if (Array.isArray(query)) {
          var that = this, tasks = [];
          tasks.parallel = false;
          for (var i = 0, l = query.length; i < l; i++) {
            (function() {
              // closure
              var q = query[i];
              tasks.push(function(i_suc, i_err) {
                that.query(q, i_suc, i_err);
              });
            }());
          }
          Executor.run(tasks, i_success, i_error);
        }
      },
      formatUpdate : function(i_table, i_order, i_limit) {
        var query = 'UPDATE ';
        query += i_table;
        query += ' SET ';
        var values = this._values, value, data, i, l
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
      },
      performUpdate : function(i_table, i_order, i_limit, i_success, i_error) {
        var query = this.formatUpdate(i_table, i_order, i_limit);
        this.query(query, i_success, i_error);
      },
      formatDelete : function(i_table, i_order, i_limit) {
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
      },
      performDelete : function(i_table, i_order, i_limit, i_success, i_error) {
        var query = this.formatDelete(i_table, i_order, i_limit);
        this.query(query, i_success, i_error);
      },
      /**
       * This returns an array containing objects like this: <code>
       * {
       *   name : 'name of the folder or file',
       *   path : 'full database path',
       *   folder : 'true if name ends with delimiter'
       * }
       * </code>
       */
      getChildNodes : function(i_table, i_column, i_delimiter, i_path, i_success, i_error) {
        var delim = sql_helper.escape(i_delimiter);
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
        this.addWhere('LOCATE(' + sql_helper.escape(i_path) + ', ' + i_table + '.' + i_column + ') = 1');
        this.performSelect(i_table, undefined, undefined, undefined, function(i_results, i_fields) {
          var nodes = [], i, l, child, pos, hasChildren;
          for (i = 0, l = i_results.length; i < l; i++) {
            child = i_results[i].child;
            pos = child.indexOf(i_delimiter);
            hasChildren = pos === (child.length - i_delimiter.length);
            nodes.push({
                name : hasChildren ? child.substr(0, pos) : child,
                path : i_path + child,
                folder : hasChildren
            });
          }
          i_success(nodes);
        }, i_error);
      },
      getTrendData : function() {
        console.error('ERROR! Not implemented: getTrendData()');
      }
  };

  if (isNodeJS) {
    module.exports = sql_helper;
  }
  else {
    root.sql_helper = sql_helper;
  }

}(globalThis));