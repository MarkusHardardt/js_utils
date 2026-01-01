(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Utilities = isNodeJS ? require('./Utilities.js') : root.Utilities;
    const jsonfx = isNodeJS ? require('./jsonfx.js') : root.jsonfx;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const SqlHelper = isNodeJS ? require('./SqlHelper.js') : root.SqlHelper;

    const compare_keys = Sorting.getTextsAndNumbersCompareFunction(false, false, true);

    // //////////////////////////////////////////////////////////////////////////////////////////
    // CROSS REFERENCES
    // //////////////////////////////////////////////////////////////////////////////////////////

    var format_references_from_condition = function (i_escaped_id, i_valCol) {
        // search for keys in text within single quotation marks
        var query = 'LOCATE(';
        query += i_escaped_id;
        query += ',';
        query += i_valCol;
        query += ') > 0';
        return query;
    };

    var format_references_to_locate = function (i_userTab, i_userValCol, i_usedTabAlias, i_usedExt, i_usedKeyCol) {
        // search for keys in text within double quotation marks
        var query = "LOCATE(CONCAT('$',";
        query += i_usedTabAlias;
        query += '.';
        query += i_usedKeyCol;
        query += ",'.";
        query += i_usedExt;
        query += "'),";
        query += i_userTab;
        query += '.';
        query += i_userValCol;
        query += ') > 0';
        return query;
    };

    var format_references_to_condition = function (i_userTab, i_userValCol, i_usedTab, i_usedTabAlias, i_usedExt, i_usedKeyCol) {
        var query = 'INNER JOIN ';
        query += i_usedTab;
        query += ' AS ';
        query += i_usedTabAlias;
        query += ' ON ';
        if (typeof i_userValCol === 'string') {
            query += format_references_to_locate(i_userTab, i_userValCol, i_usedTabAlias, i_usedExt, i_usedKeyCol);
        }
        else {
            var attr, value, next = false;
            for (attr in i_userValCol) {
                if (i_userValCol.hasOwnProperty(attr)) {
                    if (next) {
                        query += ' OR ';
                    }
                    query += format_references_to_locate(i_userTab, i_userValCol[attr], i_usedTabAlias, i_usedExt, i_usedKeyCol);
                    next = true;
                }
            }
        }
        return query;
    };

    var get_modification_params = function (i_previous, i_next) {
        // within the next condition checks we detect if the value is available
        // after the update and if the data will be changed
        if (typeof i_previous === 'string' && i_previous.length > 0) {
            if (typeof i_next === 'string' && i_next.length > 0) {
                if (i_previous !== i_next) {
                    // both values available and different
                    return {
                        empty: false,
                        changed: true,
                        string: i_next
                    };
                }
                else {
                    // both values available and equal
                    return {
                        empty: false,
                        changed: false
                    };
                }
            }
            else {
                // reset current value
                return {
                    empty: true,
                    changed: true
                };
            }
        }
        else {
            if (typeof i_next === 'string' && i_next.length > 0) {
                // new value available
                return {
                    empty: false,
                    changed: true,
                    string: i_next
                };
            }
            else {
                // both values unavailable
                return {
                    empty: true,
                    changed: false
                };
            }
        }
    };

    var COMMAND_GET_CONFIG = 'get_config';
    var COMMAND_GET_CHECKSUM = 'get_checksum';
    var COMMAND_GET_OBJECT = 'get_object';
    var COMMAND_EXISTS = 'exists';
    var COMMAND_GET_MODIFICATION_PARAMS = 'get_modification_params';
    var COMMAND_SET_OBJECT = 'set_object';
    var COMMAND_GET_REFACTORING_PARAMS = 'get_refactoring_params';
    var COMMAND_PERFORM_REFACTORING = 'perform_refactoring';
    var COMMAND_GET_REFERENCES_TO = 'get_references_to';
    var COMMAND_GET_REFERENCES_TO_COUNT = 'get_references_to_count';
    var COMMAND_GET_REFERENCES_FROM = 'get_references_from';
    var COMMAND_GET_REFERENCES_FROM_COUNT = 'get_references_from_count';
    var COMMAND_GET_TREE_CHILD_NODES = 'get_tree_child_nodes';
    var COMMAND_GET_SEARCH_RESULTS = 'get_search_results';
    var COMMAND_GET_ID_KEY_VALUES = 'get_id_key_values';
    var COMMAND_GET_ID_SELECTED_VALUES = 'get_id_selected_values';

    var VALID_EXT_REGEX = /^\w+$/;
    var VALID_NAME_CHAR = '[a-zA-Z0-9_+\\-*]';
    var FOLDER_REGEX = new RegExp('^\\$((?:' + VALID_NAME_CHAR + '+\\/)*)$');
    var EXCHANGE_HEADER = 'hmijs-config-exchange-data';

    var ContentManagerBase = function () {
        // nothing to do here
    };

    ContentManagerBase.prototype = Object.create(Object.prototype);
    ContentManagerBase.prototype.constructor = ContentManagerBase;

    ContentManagerBase.prototype.getExchangeHandler = function (i_array) {
        return new ExchangeHandler(this);
    };

    ContentManagerBase.prototype.getLanguages = function (i_array) {
        return Utilities.copyArray(this._config.languages, i_array);
    };

    ContentManagerBase.prototype.isValidFile = function (i_string) {
        return this._key_regex.test(i_string);
    };

    ContentManagerBase.prototype.isValidFolder = function (i_string) {
        return FOLDER_REGEX.test(i_string);
    };

    ContentManagerBase.prototype.getDescriptor = function (i_ext, i_desc) {
        var tab = this._tablesForExt[i_ext];
        if (tab) {
            var desc = i_desc || {};
            desc.jsonfx = tab.jsonfx === true;
            desc.multilingual = tab.multilingual === true || (typeof tab.value_column_prefix === 'string' && tab.value_column_prefix.length > 0);
            desc.multiedit = tab.multiedit === true;
            return desc;
        }
        else {
            return false;
        }
    };

    ContentManagerBase.prototype.analyzeID = function (i_id) {
        var match = this._key_regex.exec(i_id);
        if (match) {
            return this.getDescriptor(match[2], {
                id: i_id,
                path: match[1],
                file: i_id,
                extension: match[2]
            });
        }
        match = FOLDER_REGEX.exec(i_id);
        if (match) {
            return {
                id: i_id,
                path: match[1],
                folder: i_id
            };
        }
        return {
            id: i_id
        };
    };

    ContentManagerBase.prototype.getDescriptors = function (i_callback) {
        var ext, tabs = this._tablesForExt;
        for (ext in tabs) {
            if (tabs.hasOwnProperty(ext)) {
                i_callback(ext, this.getDescriptor(ext));
            }
        }
    };

    ContentManagerBase.prototype.getPath = function (i_id) {
        var match = this._key_regex.exec(i_id);
        return match ? match[1] : false;
    };

    ContentManagerBase.prototype.getExtension = function (i_id) {
        var match = this._key_regex.exec(i_id);
        return match ? match[2] : false;
    };

    ContentManagerBase.prototype.getIcon = function (i_id) {
        var match = this._key_regex.exec(i_id);
        if (match) {
            var tab = this._tablesForExt[match[2]];
            if (tab) {
                return this._config.icon_dir + tab.icon;
            }
            else {
                return false;
            }
        }
        else if (FOLDER_REGEX.test(i_id)) {
            return this._config.icon_dir + this._config.folder_icon;
        }
        else {
            return false;
        }
    };

    ContentManagerBase.prototype.compare = function (i_id1, i_id2) {
        if (FOLDER_REGEX.test(i_id1)) {
            if (FOLDER_REGEX.test(i_id2)) {
                return Sorting.compareTextsAndNumbers(i_id1, i_id2, false, false);
            }
            else {
                return -1;
            }
        }
        else {
            if (FOLDER_REGEX.test(i_id2)) {
                return 1;
            }
            else {
                return Sorting.compareTextsAndNumbers(i_id1, i_id2, false, false);
            }
        }
    };

    // TODO check if runnning and required
    ContentManagerBase.prototype.getValueColumns = function (i_id, i_selectables) {
        var match = this._key_regex.exec(i_id);
        if (!match) {
            return;
        }
        var table = this._tablesForExt[match[2]];
        var valcol = this._valColsForExt[match[2]];
        if (!table) {
            return;
        }
        var selectables = i_selectables || [];
        // TODO is this a "selectable" (only single value for jso/txt
        if (typeof valcol === 'string') {
            selectables.push(valcol);
        }
        else {
            for (var attr in valcol) {
                if (valcol.hasOwnProperty(attr)) {
                    // TODO isn't "attr" the selectable?
                    selectables.push(valcol[attr]);
                }
            }
        }
        return selectables;
    };

    // constructor
    var ContentManager = function (i_getSqlAdapter, i_config) {
        if (!i_getSqlAdapter) {
            throw new Error('No database access provider available!');
        }
        else if (!i_config) {
            throw new Error('No database configuration available!');
        }
        this._getSqlAdapter = i_getSqlAdapter;
        this._config = i_config;
        this._parallel = typeof i_config.max_parallel_queries === 'number' && i_config.max_parallel_queries > 0 ? i_config.max_parallel_queries : true;
        var tables = this._config.tables, table, valcol, i, tablen = tables.length, j, langs = i_config.languages.length;
        this._tablesForExt = {};
        this._valColsForExt = {};
        for (i = 0; i < tablen; i++) {
            table = tables[i];
            if (!VALID_EXT_REGEX.test(table.extension)) {
                throw new Error('Invalid extension: "' + table.extension + '"');
            }
            else if (this._tablesForExt[table.extension] !== undefined) {
                throw new Error('Extension already exists: "' + table.extension + '"');
            }
            if (table.value_column_prefix) {
                valcol = {};
                for (j = 0; j < langs; j++) {
                    var lang = i_config.languages[j];
                    valcol[lang] = table.value_column_prefix + lang;
                }
            }
            else {
                valcol = table.value_column;
            }
            this._tablesForExt[table.extension] = table;
            this._valColsForExt[table.extension] = valcol;
        }
        // we need all available extensions for building regular expressions
        var tabexts = tables.map(function (i_table) {
            return i_table.extension;
        }).join('|');
        this._key_regex = new RegExp('^\\$((?:' + VALID_NAME_CHAR + '+\\/)*?' + VALID_NAME_CHAR + '+?)\\.(' + tabexts + ')$');
        this._refactoring_match = '((?:' + VALID_NAME_CHAR + '+\\/)*?' + VALID_NAME_CHAR + '+?\\.(?:' + tabexts + '))\\b';
        this._include_regex_build = new RegExp('(\'|")?include:\\$((?:' + VALID_NAME_CHAR + '+\\/)*' + VALID_NAME_CHAR + '+?)\\.(' + tabexts + ')\\b\\1', 'g');
        this._exchange_header_regex = new RegExp('\\[\\{\\((' + tabexts + '|language|' + Regex.escape(EXCHANGE_HEADER) + ')<>([a-f0-9]{32})\\)\\}\\]\\n(.*)\\n', 'g');
    };

    ContentManager.INSERT = 'insert';
    ContentManager.UPDATE = 'update';
    ContentManager.DELETE = 'delete';
    ContentManager.COPY = 'copy';
    ContentManager.MOVE = 'move';
    ContentManager.NONE = 'none';
    ContentManager.RAW = 'raw';
    ContentManager.INCLUDE = 'include';
    ContentManager.PARSE = 'parse';
    ContentManager.GET_CONTENT_DATA_URL = '/get_content_data';
    ContentManager.GET_CONTENT_TREE_NODES_URL = '/get_content_tree_nodes';
    ContentManager.COMMAND_GET_CHILD_TREE_NODES = 'get_child_tree_nodes';
    ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES = 'get_references_to_tree_nodes';
    ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES = 'get_references_from_tree_nodes';

    // prototype
    ContentManager.prototype = Object.create(ContentManagerBase.prototype);
    ContentManager.prototype.constructor = ContentManager;

    ContentManager.prototype._getRawString = function (i_adapter, i_table, i_key, i_language, i_success, i_error) {
        var valcol = this._valColsForExt[i_table.extension], column = typeof valcol === 'string' ? valcol : valcol[i_language];
        if (typeof column === 'string') {
            i_adapter.addColumn(i_table.name + '.' + column + ' AS ' + column);
            i_adapter.addWhere(i_table.name + '.' + i_table.key_column + ' = ' + SqlHelper.escape(i_key));
            i_adapter.performSelect(i_table.name, undefined, undefined, 1, function (i_results, i_fields) {
                // in case of an result we are dealing with an existing key, but
                // the
                // data for the requested language may not be available anyway
                if (i_results.length === 1) {
                    var raw = i_results[0][column];
                    i_success(raw !== null ? raw : '');
                }
                else {
                    i_success(false);
                }
            }, i_error);
        }
        else {
            i_error('Invalid value column for table "' + i_table.name + '" and language "' + i_language + '"');
        }
    };

    ContentManager.prototype.exists = function (i_id, i_success, i_error) {
        var match = this._key_regex.exec(i_id);
        if (match) {
            var table = this._tablesForExt[match[2]];
            if (!table) {
                i_error('Invalid table: ' + i_id);
                return;
            }
            var that = this;
            this._getSqlAdapter(function (i_adapter) {
                i_adapter.addColumn('COUNT(*) AS cnt');
                i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(match[1]));
                i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                    i_adapter.close();
                    i_success(i_result[0].cnt > 0);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else {
            i_success(false);
        }
    };

    ContentManager.prototype.getChecksum = function (i_id, i_success, i_error) {
        // first we try to get table object matching to the given key
        var match = this._key_regex.exec(i_id);
        if (!match) {
            i_error('Invalid id: "' + i_id + '"');
            return;
        }
        var table = this._tablesForExt[match[2]];
        var valcol = this._valColsForExt[match[2]];
        if (!table) {
            i_error('Invalid table name: "' + i_id + '"');
            return;
        }
        var that = this;
        this._getSqlAdapter(function (i_adapter) {
            var key = match[1], raw = i_id;
            var success = function () {
                i_adapter.close();
                i_success(Utilities.md5(raw));
            };
            var error = function (i_exc) {
                i_adapter.close();
                i_error(i_exc);
            };
            // if jsonfx or plain text is available we decode the string and
            // return with or without all includes included
            if (typeof valcol === 'string') {
                // note: no language required here because we got only one anyway
                that._getRawString(i_adapter, table, key, undefined, function (i_rawString) {
                    if (i_rawString !== false) {
                        raw += ':';
                        raw += i_rawString;
                    }
                    success();
                }, error);
            }
            else {
                var attr;
                for (attr in valcol) {
                    if (valcol.hasOwnProperty(attr)) {
                        i_adapter.addColumn(table.name + '.' + valcol[attr] + ' AS ' + attr);
                    }
                }
                i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(key));
                i_adapter.performSelect(table.name, undefined, undefined, 1, function (i_results, i_fields) {
                    if (i_results.length === 1) {
                        var object = i_results[0], attr;
                        for (attr in valcol) {
                            if (object.hasOwnProperty(attr)) {
                                raw += ':';
                                raw += attr;
                                raw += ':';
                                raw += object[attr];
                            }
                        }
                    }
                    success();
                }, error);
            }
        }, i_error);
    };

    ContentManager.prototype.getObject = function (i_id, i_language, i_mode, i_success, i_error) {
        // This method works in four modes:
        // 1. jsonfx-object: build object and return
        // 2. plain text (utf-8): build text and return
        // 3. label/html with language selection: build string and return
        // 4. label/html without language selection: build strings and return as
        // object

        // first we try to get table object matching to the given key
        var match = this._key_regex.exec(i_id);
        if (!match) {
            i_error('Invalid id: "' + i_id + '"');
            return;
        }
        var table = this._tablesForExt[match[2]];
        var valcol = this._valColsForExt[match[2]];
        if (!table) {
            i_error('Invalid table name: "' + i_id + '"');
            return;
        }
        var that = this;
        this._getSqlAdapter(function (i_adapter) {
            var key = match[1], parse = i_mode === ContentManager.PARSE, include = parse || i_mode === ContentManager.INCLUDE;
            var success = function (i_object) {
                i_adapter.close();
                try {
                    if (parse) {
                        var object = jsonfx.reconstruct(i_object);
                        if (that._config.jsonfx_pretty === true) {
                            // the 'jsonfx_pretty' flag may be used to format our dynamically
                            // parsed JavaScript sources for more easy debugging purpose
                            // TODO: object = eval('(' + jsonfx.stringify(object, true) + ')\n//# sourceURL=' + key + '.js');
                            object = eval('(' + jsonfx.stringify(object, true) + ')');
                        }
                        i_success(object);
                    }
                    else {
                        i_success(i_object);
                    }
                }
                catch (exc) {
                    i_error(exc);
                }
            };
            var error = function (i_exc) {
                i_adapter.close();
                i_error(i_exc);
            };
            // if jsonfx or plain text is available we decode the string and
            // return with or without all includes included
            if (typeof valcol === 'string') {
                // note: no language required here because we got only one anyway
                that._getRawString(i_adapter, table, key, undefined, function (i_rawString) {
                    if (i_rawString !== false) {
                        var object = table.jsonfx ? jsonfx.parse(i_rawString, false, false) : i_rawString;
                        if (include) {
                            var ids = {};
                            ids[i_id] = true;
                            that._include(i_adapter, object, ids, i_language, success, error);
                        }
                        else {
                            success(object);
                        }
                    }
                    else {
                        success();
                    }
                }, error);
            }
            else if (typeof i_language === 'string') {
                // if selection is available we return string with or without all
                // includes included
                that._getRawString(i_adapter, table, key, i_language, function (i_rawString) {
                    if (i_rawString !== false) {
                        if (include) {
                            var ids = {};
                            ids[i_id] = true;
                            that._include(i_adapter, i_rawString, ids, i_language, success, error);
                        }
                        else {
                            success(i_rawString);
                        }
                    }
                    else {
                        success();
                    }
                }, error);
            }
            else {
                var attr;
                for (attr in valcol) {
                    if (valcol.hasOwnProperty(attr)) {
                        i_adapter.addColumn(table.name + '.' + valcol[attr] + ' AS ' + attr);
                    }
                }
                i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(key));
                i_adapter.performSelect(table.name, undefined, undefined, 1, function (i_results, i_fields) {
                    if (i_results.length === 1) {
                        var object = i_results[0];
                        if (include) {
                            var tasks = [];
                            for (var attr in object) {
                                if (object.hasOwnProperty(attr)) {
                                    (function () {
                                        var language = attr;
                                        var ids = {};
                                        ids[i_id] = true;
                                        tasks.push(function (i_suc, i_err) {
                                            that._include(i_adapter, object[language], ids, language, function (i_object) {
                                                object[language] = i_object;
                                                i_suc();
                                            }, i_err);
                                        });
                                    }());
                                }
                            }
                            tasks.parallel = that._parallel;
                            Executor.run(tasks, function () {
                                success(object);
                            }, error);
                        }
                        else {
                            success(object);
                        }
                    }
                    else {
                        success();
                    }
                }, error);
            }
        }, i_error);
    };

    ContentManager.prototype._include = function (i_adapter, i_object, i_ids, i_language, i_success, i_error) {
        var that = this, config = this._config;
        if (Array.isArray(i_object)) {
            this._buildProperties(i_adapter, i_object, i_ids, i_language, i_success, i_error);
        }
        else if (typeof i_object === 'object' && i_object !== null) {
            var includeKey = i_object.include;
            var match = typeof includeKey === 'string' && !i_ids[includeKey] ? this._key_regex.exec(includeKey) : false;
            if (!match) {
                this._buildProperties(i_adapter, i_object, i_ids, i_language, i_success, i_error);
                return;
            }
            var table = this._tablesForExt[match[2]];
            var valcol = this._valColsForExt[match[2]];
            if (!table) {
                this._buildProperties(i_adapter, i_object, i_ids, i_language, i_success, i_error);
                return;
            }
            this._getRawString(i_adapter, table, match[1], i_language, function (i_rawString) {
                if (i_rawString !== false) {
                    i_ids[includeKey] = true;
                    var includedObject = table.jsonfx ? jsonfx.parse(i_rawString, false, false) : i_rawString;
                    that._include(i_adapter, includedObject, i_ids, i_language, function (i_includedObject) {
                        delete i_ids[includeKey];
                        if (typeof i_includedObject === 'object' && i_includedObject !== null) {
                            // if we included an object all attributes except
                            // include must be copied
                            delete i_object.include;
                            that._buildProperties(i_adapter, i_object, i_ids, i_language, function () {
                                // with a true "source"-flag we keep all replaced
                                // attributes stored inside a source object
                                if (i_object.source === true) {
                                    // here we store the replaced attributes
                                    var source = {};
                                    // if there are already stored source attributes
                                    // we
                                    // keep them as well
                                    if (i_includedObject.source !== undefined) {
                                        source.source = i_includedObject.source;
                                        delete i_includedObject.source;
                                    }
                                    // now we transfer and collect all replaced
                                    // attributes
                                    Utilities.transferProperties(i_object, i_includedObject, source);
                                    // finally we add our bases
                                    i_includedObject.source = source;
                                }
                                else {
                                    // no attribute keeping - just attribute transfer
                                    Utilities.transferProperties(i_object, i_includedObject);
                                }
                                i_success(i_includedObject);
                            }, i_error);
                        }
                        else {
                            // no real object means just return whatever it is
                            i_success(i_includedObject);
                        }
                    }, i_error);
                }
                else {
                    // no string available so just step on with building the object
                    // properties
                    that._buildProperties(i_adapter, i_object, i_ids, i_language, i_success, i_error);
                }
            }, i_error);
        }
        else if ((typeof i_object === 'string')) {
            // Strings may contain include:$path/file.ext entries. With the next
            // Regex call we build an array containing strings and include
            // matches.
            var array = [];
            Regex.each(that._include_regex_build, i_object, function (i_start, i_end, i_match) {
                array.push(i_match && !i_ids['$' + i_match[2] + '.' + i_match[3]] ? i_match : i_object.substring(i_start, i_end));
            });
            // For all found include-match we try to load the referenced content
            // from the database and replace the corresponding array element with
            // the built content.
            var tasks = [], i, l = array.length, match, tab;
            for (i = 0; i < l; i++) {
                match = array[i];
                if (Array.isArray(match)) {
                    tab = that._tablesForExt[match[3]];
                    if (tab) {
                        (function () {
                            var idx = i, orig = match[0], includeKey = '$' + match[2] + '.' + match[3], table = tab, key = match[2];
                            tasks.push(function (i_suc, i_err) {
                                that._getRawString(i_adapter, table, key, i_language, function (i_rawString) {
                                    if (i_rawString !== false) {
                                        i_ids[includeKey] = true;
                                        var object = table.jsonfx ? jsonfx.parse(i_rawString, false, false) : i_rawString;
                                        that._include(i_adapter, object, i_ids, i_language, function (i_build) {
                                            delete i_ids[includeKey];
                                            array[idx] = table.jsonfx && array.length > 1 ? jsonfx.stringify(i_build, false) : i_build;
                                            i_suc();
                                        }, i_err);
                                    }
                                    else {
                                        // no raw string available means we replace with the
                                        // original content
                                        array[idx] = orig;
                                        i_suc();
                                    }
                                }, i_err);
                            });
                        }());
                    }
                }
            }
            tasks.parallel = that._parallel;
            Executor.run(tasks, function () {
                // if our string contains just one single element we return this as
                // is.
                i_success(array.length === 1 ? array[0] : array.join(''));
            }, i_error);
        }
        else {
            // if our input object is not an array, an object or a string we have
            // nothing to build so we return the object as is.
            i_success(i_object);
        }
    };

    ContentManager.prototype._buildProperties = function (i_adapter, i_object, i_ids, i_language, i_success, i_error) {
        var that = this, tasks = [], a;
        for (a in i_object) {
            if (i_object.hasOwnProperty(a)) {
                (function () {
                    var p = a;
                    tasks.push(function (i_suc, i_err) {
                        that._include(i_adapter, i_object[p], i_ids, i_language, function (i_objectProperty) {
                            i_object[p] = i_objectProperty;
                            i_suc();
                        }, i_err);
                    });
                }());
            }
        }
        tasks.parallel = this._parallel;
        Executor.run(tasks, function () {
            i_success(i_object);
        }, i_error);
    };

    ContentManager.prototype._getModificationParams = function (i_adapter, i_id, i_language, i_value, i_success, i_error) {
        // here we store the result
        var params = {};
        // check id
        var match = this._key_regex.exec(i_id);
        if (!match) {
            params.error = 'Invalid id: ' + i_id;
            i_success(params);
            return;
        }
        // check table
        var table = this._tablesForExt[match[2]];
        if (!table) {
            params.error = 'Invalid table: ' + i_id;
            i_success(params);
            return;
        }
        var valcol = this._valColsForExt[match[2]];
        // in case of a multiligual data type and a given language we got to make
        // sure that language is supported
        if (typeof valcol !== 'string' && typeof i_language === 'string' && valcol[i_language] === undefined) {
            params.error = 'Invalid language "' + i_language + '"';
            i_success(params);
            return;
        }
        // try to get all current database values for given id and copy the new
        // values
        var that = this;
        if (typeof valcol === 'string') {
            i_adapter.addColumn(table.name + '.' + valcol + ' AS ' + valcol);
        }
        else {
            var attr;
            for (attr in valcol) {
                if (valcol.hasOwnProperty(attr)) {
                    i_adapter.addColumn(table.name + '.' + valcol[attr] + ' AS ' + valcol[attr]);
                }
            }
        }
        i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(match[1]));
        i_adapter.performSelect(table.name, undefined, undefined, 1, function (i_result, i_fields) {
            var currentData = i_result.length === 1 ? i_result[0] : undefined;
            // here we store the conditions
            var stillNotEmpty = false;
            var changed = false;
            var values = {};
            var checksum = '';
            // in case of a JSON or UTF8 table
            if (typeof valcol === 'string') {
                checksum += valcol;
                var currval = currentData !== undefined ? currentData[valcol] : undefined;
                var nextval = typeof i_value === 'string' ? i_value : undefined;
                var value = get_modification_params(currval, nextval);
                if (!value.empty) {
                    stillNotEmpty = true;
                }
                if (value.changed) {
                    changed = true;
                }
                values[valcol] = value;
                checksum += value.empty ? 'e' : 'd';
                checksum += value.changed ? 'e' : 'd';
                if (typeof value.string === 'string') {
                    checksum += value.string;
                }
            }
            // labels or html
            else {
                var attr, currval, nextval, value;
                for (attr in valcol) {
                    if (valcol.hasOwnProperty(attr)) {
                        // for all columns we try to get the current and new value
                        currval = currentData !== undefined ? currentData[valcol[attr]] : undefined;
                        nextval = undefined;
                        if (typeof i_language === 'string') {
                            if (i_language === attr) {
                                nextval = typeof i_value === 'string' ? i_value : undefined;
                            }
                            else {
                                nextval = currval;
                            }
                        }
                        else if (typeof i_value === 'object' && i_value !== null) {
                            nextval = i_value[attr];
                        }
                        // within the next condition checks we detect if the value is
                        // available
                        // after the update and if the data will be changed
                        value = get_modification_params(currval, nextval);
                        if (!value.empty) {
                            stillNotEmpty = true;
                        }
                        if (value.changed) {
                            changed = true;
                        }
                        values[attr] = value;
                        checksum += value.empty ? 'e' : 'd';
                        checksum += value.changed ? 'e' : 'd';
                        if (typeof value.string === 'string') {
                            checksum += value.string;
                        }
                    }
                }
            }
            // build the resulting data
            params.source = i_id;
            checksum += i_id;
            params.values = values;
            if (currentData !== undefined) {
                if (stillNotEmpty) {
                    params.action = changed ? ContentManager.UPDATE : ContentManager.NONE;
                }
                else {
                    params.action = ContentManager.DELETE;
                }
            }
            else {
                params.action = stillNotEmpty ? ContentManager.INSERT : ContentManager.NONE;
            }
            checksum += params.action;
            params.checksum = Utilities.md5(checksum);
            i_success(params);
        }, i_error);
    };

    ContentManager.prototype.getModificationParams = function (i_id, i_language, i_value, i_success, i_error) {
        var that = this;
        this._getSqlAdapter(function (i_adapter) {
            that._getModificationParams(i_adapter, i_id, i_language, i_value, function (i_params) {
                if (!i_params.error && i_params.action === ContentManager.DELETE) {
                    that._getReferencesFrom(i_adapter, i_id, function (i_referencesFrom) {
                        if (i_referencesFrom.length > 0) {
                            i_params.externalUsers = i_referencesFrom;
                        }
                        i_adapter.close();
                        i_success(i_params);
                    }, function (i_exc) {
                        i_adapter.close();
                        i_error(i_exc);
                    });
                }
                else {
                    i_adapter.close();
                    i_success(i_params);
                }
            }, function (i_exc) {
                i_adapter.close();
                i_error(i_exc);
            });
        }, i_error);
    };

    ContentManager.prototype.setObject = function (i_id, i_language, i_value, i_checksum, i_success, i_error) {
        var that = this, match = this._key_regex.exec(i_id);
        if (!match) {
            i_error('Invalid id: ' + i_id);
            return;
        }
        var table = this._tablesForExt[match[2]];
        var valcol = this._valColsForExt[match[2]];
        if (!table) {
            i_error('Invalid table: ' + i_id);
            return;
        }
        var key = match[1];
        this._getSqlAdapter(function (i_adapter) {
            var main = [];
            main.parallel = false;
            main.push(function (i_suc, i_err) {
                i_adapter.startTransaction(i_suc, i_err);
            });
            main.push(function (i_suc, i_err) {
                that._getModificationParams(i_adapter, i_id, i_language, i_value, function (i_params) {
                    if (i_params.error !== undefined) {
                        i_err(i_params.error);
                    }
                    else if (i_params.checksum !== i_checksum) {
                        i_err('Database content has changed! Try again!');
                    }
                    else if (i_params.action === ContentManager.NONE) {
                        i_err('No action to perform!');
                    }
                    else if (i_params.action === ContentManager.INSERT) {
                        i_adapter.addValue(table.name + '.' + table.key_column, SqlHelper.escape(key));
                        var attr, value;
                        if (typeof valcol === 'string') {
                            value = i_params.values[valcol];
                            if (value.changed) {
                                i_adapter.addValue(table.name + '.' + valcol, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                            }
                        }
                        else {
                            for (attr in valcol) {
                                if (valcol.hasOwnProperty(attr)) {
                                    // value = i_params.values[valcol[attr]];
                                    value = i_params.values[attr];
                                    if (value.changed) {
                                        i_adapter.addValue(table.name + '.' + valcol[attr], typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                    }
                                }
                            }
                        }
                        i_adapter.performInsert(table.name, i_suc, i_err);
                    }
                    else if (i_params.action === ContentManager.UPDATE) {
                        var attr, value;
                        if (typeof valcol === 'string') {
                            value = i_params.values[valcol];
                            if (value.changed) {
                                i_adapter.addValue(table.name + '.' + valcol, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                            }
                        }
                        else {
                            for (attr in valcol) {
                                if (valcol.hasOwnProperty(attr)) {
                                    value = i_params.values[attr];
                                    if (value.changed) {
                                        i_adapter.addValue(table.name + '.' + valcol[attr], typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                    }
                                }
                            }
                        }
                        i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(key));
                        i_adapter.performUpdate(table.name, undefined, 1, i_suc, i_err);
                    }
                    else if (i_params.action === ContentManager.DELETE) {
                        i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(key));
                        i_adapter.performDelete(table.name, undefined, 1, i_suc, i_err);
                    }
                    else {
                        i_err('Unexpected action: "' + i_params.action + '"');
                    }
                }, i_err);
            });
            Executor.run(main, function () {
                i_adapter.commitTransaction(function () {
                    i_adapter.close();
                    i_success();
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, function (i_exception) {
                i_adapter.rollbackTransaction(function () {
                    i_adapter.close();
                    i_error(i_exception);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            });
        }, i_error);
    };

    ContentManager.prototype._getRefactoringParams = function (i_adapter, i_source, i_target, i_action, i_success, i_error) {
        // here we store the result
        var params = {}, key_regex = this._key_regex;
        // check action
        if (i_action !== ContentManager.COPY && i_action !== ContentManager.MOVE && i_action !== ContentManager.DELETE) {
            params.error = 'Invalid action';
            i_success(params);
            return;
        }
        params.action = i_action;
        var checksum = i_action;
        // check source
        if (typeof i_source === 'string' && i_source.length > 0) {
            params.source = i_source;
            checksum += i_source;
        }
        else {
            params.error = 'Missing source';
            i_success(params);
            return;
        }
        // check target - but only if required
        if (i_action === ContentManager.COPY || i_action === ContentManager.MOVE) {
            if (typeof i_target === 'string' && i_target.length > 0) {
                params.target = i_target;
                checksum += i_target;
            }
            else {
                params.error = 'Missing target';
                i_success(params);
                return;
            }
        }
        // check source identifier
        var srcTab = false, srcTabKey, sourceIsFolder;
        var match = key_regex.exec(i_source);
        if (match) {
            srcTab = this._tablesForExt[match[2]];
            if (!srcTab) {
                params.error = 'Invalid source table: ' + i_source;
                i_success(params);
                return;
            }
            sourceIsFolder = false;
            srcTabKey = match[1];
        }
        else {
            match = FOLDER_REGEX.exec(i_source);
            sourceIsFolder = !!match;
            if (!sourceIsFolder) {
                params.error = 'Invalid source folder: ' + i_source;
                i_success(params);
                return;
            }
            srcTabKey = match[1];
        }
        checksum += sourceIsFolder ? "sf" : "so";
        var tgtTab = false, tgtTabKey, targetIsFolder;
        // check target identifier
        if (typeof i_target === 'string') {
            match = key_regex.exec(i_target);
            if (match) {
                tgtTab = this._tablesForExt[match[2]];
                if (!tgtTab) {
                    params.error = 'Invalid target table: ' + i_target;
                    i_success(params);
                    return;
                }
                targetIsFolder = false;
                tgtTabKey = match[1];
            }
            else {
                match = FOLDER_REGEX.exec(i_target);
                targetIsFolder = !!match;
                if (!targetIsFolder) {
                    params.error = 'Invalid target folder: ' + i_target;
                    i_success(params);
                    return;
                }
                tgtTabKey = match[1];
            }
            checksum += targetIsFolder ? "tf" : "to";
            // check source to target conditions
            if (sourceIsFolder) {
                if (!targetIsFolder) {
                    params.error = 'Target is not a folder';
                    i_success(params);
                    return;
                }
            }
            else {
                if (targetIsFolder) {
                    params.error = 'Target is not a single object';
                    i_success(params);
                    return;
                }
                if (tgtTab === false) {
                    params.error = 'Unknown target table';
                    i_success(params);
                    return;
                }
                if (srcTab !== tgtTab) {
                    params.error = 'Different source and target table';
                    i_success(params);
                    return;
                }
            }
        }
        params.folder = sourceIsFolder;
        var that = this, srcKeysArr = [], srcKeysObj = {}, tgtExObj = {}, extRefObjs = {}, main = [];
        main.parallel = false;
        main.push(function (i_suc, i_err) {
            // within the following loop we collect all source paths
            if (sourceIsFolder) {
                var tasks = [], attr;
                for (attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var table = that._tablesForExt[attr];
                            tasks.push(function (i_s, i_e) {
                                i_adapter.addColumn(table.name + '.' + table.key_column + ' AS path');
                                // select all paths within the range
                                i_adapter.addWhere('LOCATE(' + SqlHelper.escape(srcTabKey) + ',' + table.name + '.' + table.key_column + ') = 1');
                                i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                                    for (var i = 0, l = i_result.length; i < l; i++) {
                                        srcKeysObj['$' + i_result[i].path + '.' + table.extension] = true;
                                    }
                                    i_s();
                                }, i_e);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, i_suc, i_err);
            }
            else {
                srcKeysObj[i_source] = true;
                i_suc();
            }
        });
        main.push(function (i_suc, i_err) {
            var key;
            for (key in srcKeysObj) {
                if (srcKeysObj.hasOwnProperty(key)) {
                    srcKeysArr.push(key);
                }
            }
            var srcLen = srcKeysArr.length;
            if (srcLen === 0) {
                params.error = 'No data available';
                i_success(params);
                return;
            }
            srcKeysArr.sort(compare_keys);
            var i;
            for (i = 0; i < srcLen; i++) {
                checksum += srcKeysArr[i];
            }
            // if we got a target
            var objects = {}, tasks = [];
            if (typeof i_target === 'string') {
                if (sourceIsFolder) {
                    var source, match, table, target, srcFldLen;
                    // in the next loop we build the resulting target paths
                    for (i = 0; i < srcLen; i++) {
                        source = srcKeysArr[i];
                        match = key_regex.exec(source);
                        table = that._tablesForExt[match[2]];
                        target = i_target + source.substring(i_source.length);
                        objects[source] = target;
                        checksum += target;
                    }
                }
                else {
                    objects[i_source] = i_target;
                    checksum += i_target;
                }
                // check if any source is matching any target
                for (i = 0; i < srcLen; i++) {
                    source = srcKeysArr[i];
                    target = objects[source];
                    if (objects[target] !== undefined) {
                        params.error = 'Found at least one target equal to source: "' + target + '"';
                        i_success(params);
                        return;
                    }
                }
                // check if any target already exists
                for (i = 0; i < srcLen; i++) {
                    (function () {
                        var target = objects[srcKeysArr[i]];
                        var match = key_regex.exec(target);
                        var table = that._tablesForExt[match[2]];
                        var tabKeyEsc = SqlHelper.escape(match[1]);
                        tasks.push(function (i_suc, i_err) {
                            i_adapter.addColumn("COUNT(*) AS cnt");
                            i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + tabKeyEsc);
                            i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                                if (i_result[0].cnt > 0) {
                                    tgtExObj[target] = true;
                                }
                                i_suc();
                            }, i_err);
                        });
                    }());
                }
            }
            // no target
            else {
                if (sourceIsFolder) {
                    // in the next loop we build the resulting target paths
                    for (i = 0; i < srcLen; i++) {
                        objects[srcKeysArr[i]] = null;
                    }
                }
                else {
                    objects[i_source] = null;
                }
            }
            params.objects = objects;
            tasks.parallel = that._parallel;
            Executor.run(tasks, i_suc, i_err);
        });
        main.push(function (i_suc, i_err) {
            var tgtExArr = [], attr;
            for (attr in tgtExObj) {
                if (tgtExObj.hasOwnProperty(attr)) {
                    tgtExArr.push(attr);
                }
            }
            if (tgtExArr.length > 0) {
                tgtExArr.sort(compare_keys);
                var existingTargets = {};
                var i, l = tgtExArr.length;
                for (i = 0; i < l; i++) {
                    checksum += tgtExArr[i];
                    existingTargets[tgtExArr[i]] = true;
                }
                params.existingTargets = existingTargets;
            }
            // check for all external users
            var tasks = [];
            if (i_action === ContentManager.MOVE || i_action === ContentManager.DELETE) {
                var i, l = srcKeysArr.length;
                for (i = 0; i < l; i++) {
                    (function () {
                        var source = srcKeysArr[i];
                        tasks.push(function (i_suc, i_err) {
                            that._getReferencesFrom(i_adapter, source, function (i_referencesFrom) {
                                var r, reflen = i_referencesFrom.length, key;
                                for (r = 0; r < reflen; r++) {
                                    key = i_referencesFrom[r];
                                    if (srcKeysObj[key] === undefined) {
                                        extRefObjs[key] = true;
                                    }
                                }
                                i_suc();
                            }, i_err);
                        });
                    }());
                }
            }
            tasks.parallel = that._parallel;
            Executor.run(tasks, i_suc, i_err);
        });
        Executor.run(main, function () {
            var extRefsArray = [], attr;
            for (attr in extRefObjs) {
                if (extRefObjs.hasOwnProperty(attr)) {
                    extRefsArray.push(attr);
                }
            }
            if (extRefsArray.length > 0) {
                extRefsArray.sort(compare_keys);
                params.referencesFromOthers = extRefsArray;
                var i, l = extRefsArray.length;
                for (i = 0; i < l; i++) {
                    checksum += extRefsArray[i];
                }
            }
            params.checksum = Utilities.md5(checksum);
            i_success(params);
        }, i_error);
    };

    ContentManager.prototype.getRefactoringParams = function (i_source, i_target, i_action, i_success, i_error) {
        var that = this;
        this._getSqlAdapter(function (i_adapter) {
            that._getRefactoringParams(i_adapter, i_source, i_target, i_action, function (i_params) {
                i_adapter.close();
                i_success(i_params);
            }, function (i_exc) {
                i_adapter.close();
                i_error(i_exc);
            });
        }, i_error);
    };

    ContentManager.prototype.performRefactoring = function (i_source, i_target, i_action, i_checksum, i_success, i_error) {
        var that = this;
        this._getSqlAdapter(function (i_adapter) {
            var main = [];
            // the main action has to be processed in a sequence wo we do not run
            // in
            // parallel
            main.parallel = false;
            // we run this as a transaction wo enable rollbacks (just in case
            // something unexpected happens)
            main.push(function (i_suc, i_err) {
                i_adapter.startTransaction(i_suc, i_err);
            });
            main.push(function (i_suc, i_err) {
                that._getRefactoringParams(i_adapter, i_source, i_target, i_action, function (i_params) {
                    if (i_params.error !== undefined) {
                        i_err(i_params.error);
                    }
                    else if (i_params.checksum !== i_checksum) {
                        i_err('Database content has changed! Try again!');
                    }
                    else {
                        // for all sources of the parameters
                        var tasks = [], objects = i_params.objects, source, replace = false;
                        tasks.parallel = false;
                        if (i_params.action === ContentManager.MOVE || i_params.action === ContentManager.COPY) {
                            // in move- or copy-mode we got to perform key-string
                            // replacements
                            var expr = i_params.folder ? Regex.escape(i_params.source) + that._refactoring_match : Regex.escape(i_params.source) + '\\b';
                            var rx = new RegExp(expr, 'g'), rp = i_params.folder ? i_params.target + '$1' : i_params.target;
                            replace = function (i_string) {
                                return i_string.replace(rx, rp);
                            };
                            for (source in objects) {
                                if (objects.hasOwnProperty(source)) {
                                    (function () {
                                        var src = source;
                                        tasks.push(function (i_s, i_e) {
                                            that._performRefactoring(i_adapter, src, i_params, replace, i_s, i_e);
                                        });
                                    }());
                                }
                            }
                        }
                        else if (i_params.action === ContentManager.DELETE) {
                            if (i_params.folder) {
                                var match = FOLDER_REGEX.exec(i_params.source), srcTabKey = SqlHelper.escape(match[1]), attr;
                                for (attr in that._tablesForExt) {
                                    if (that._tablesForExt.hasOwnProperty(attr)) {
                                        (function () {
                                            var table = that._tablesForExt[attr];
                                            tasks.push(function (i_s, i_e) {
                                                i_adapter.addWhere('LOCATE(' + srcTabKey + ',' + table.name + '.' + table.key_column + ') = 1');
                                                i_adapter.performDelete(table.name, undefined, undefined, i_s, i_e);
                                            });
                                        }());
                                    }
                                }
                            }
                            else {
                                var key_regex = that._key_regex, match = key_regex.exec(i_source);
                                var table = that._tablesForExt[match[2]], srcTabKey = SqlHelper.escape(match[1]);
                                tasks.push(function (i_s, i_e) {
                                    i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + srcTabKey);
                                    i_adapter.performDelete(table.name, undefined, 1, i_s, i_e);
                                });
                            }
                        }
                        Executor.run(tasks, i_suc, i_err);
                    }
                }, i_err);
            });
            Executor.run(main, function () {
                i_adapter.commitTransaction(function () {
                    i_adapter.close();
                    i_success();
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, function (i_exception) {
                i_adapter.rollbackTransaction(function () {
                    i_adapter.close();
                    i_error(i_exception);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            });
        }, i_error);
    };

    ContentManager.prototype._performRefactoring = function (i_adapter, i_source, i_params, i_replace, i_success, i_error) {
        var that = this, key_regex = this._key_regex;
        var match = key_regex.exec(i_source);
        var table = this._tablesForExt[match[2]];
        var valcol = this._valColsForExt[match[2]];
        var srcTabKey = match[1];
        var main = [];
        main.parallel = false;
        var tgtTabKey;
        if (i_params.action === ContentManager.MOVE || i_params.action === ContentManager.COPY) {
            main.push(function (i_suc, i_err) {
                // get the target and check if already exists
                var target = i_params.objects[i_source];
                var targetAlreadyExists = i_params.existingTargets && i_params.existingTargets[target] === true;
                if (typeof valcol === 'string') {
                    i_adapter.addColumn(table.name + '.' + valcol);
                }
                else {
                    var attr;
                    for (attr in valcol) {
                        if (valcol.hasOwnProperty(attr)) {
                            i_adapter.addColumn(table.name + '.' + valcol[attr]);
                        }
                    }
                }
                i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(srcTabKey));
                i_adapter.performSelect(table.name, undefined, undefined, 1, function (i_results) {
                    var values = i_results[0], string, src, attr;
                    // replace internal cross references and prepare database
                    // update or insert value
                    if (typeof valcol === 'string') {
                        string = values[valcol];
                        if (typeof string === 'string' && string.length > 0) {
                            string = i_replace(string);
                            i_adapter.addValue(table.name + '.' + valcol, SqlHelper.escape(string));
                        }
                    }
                    else {
                        for (attr in valcol) {
                            if (valcol.hasOwnProperty(attr)) {
                                string = values[valcol[attr]];
                                if (typeof string === 'string' && string.length > 0) {
                                    string = i_replace(string);
                                    i_adapter.addValue(table.name + '.' + valcol[attr], SqlHelper.escape(string));
                                }
                            }
                        }
                    }
                    var match = key_regex.exec(target);
                    var tgtTabKey = match[1];
                    var success = function () {
                        if (targetAlreadyExists && i_params.action === ContentManager.MOVE) {
                            i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(srcTabKey));
                            i_adapter.performDelete(table.name, undefined, 1, i_suc, i_err);
                        }
                        else {
                            i_suc();
                        }
                    };
                    if (targetAlreadyExists) {
                        i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(tgtTabKey));
                        i_adapter.performUpdate(table.name, undefined, 1, success, i_err);
                    }
                    else {
                        i_adapter.addValue(table.name + '.' + table.key_column, SqlHelper.escape(tgtTabKey));
                        if (i_params.action === ContentManager.MOVE) {
                            i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(srcTabKey));
                            i_adapter.performUpdate(table.name, undefined, 1, success, i_err);
                        }
                        else {
                            i_adapter.performInsert(table.name, success, i_err);
                        }
                    }
                }, i_err);
            });
        }
        if (i_params.action === ContentManager.MOVE) {
            main.push(function (i_suc, i_err) {
                // In move mode we got to update all external users with the
                // moved reference
                that._getReferencesFrom(i_adapter, i_source, function (i_referencesFrom) {
                    var j = 0, jl = i_referencesFrom.length, refFrom, match, table, usrKey, tasks = [];
                    tasks.parallel = false;
                    for (j = 0; j < jl; j++) {
                        refFrom = i_referencesFrom[j];
                        if (i_params.objects[refFrom] === undefined) {
                            (function () {
                                var match = key_regex.exec(refFrom);
                                var table = that._tablesForExt[match[2]];
                                var valcol = that._valColsForExt[match[2]];
                                var usrKey = match[1];
                                tasks.push(function (i_s, i_e) {
                                    if (typeof valcol === 'string') {
                                        i_adapter.addColumn(table.name + '.' + valcol + ' AS ' + valcol);
                                    }
                                    else {
                                        for (var attr in valcol) {
                                            if (valcol.hasOwnProperty(attr)) {
                                                i_adapter.addColumn(table.name + '.' + valcol[attr] + ' AS ' + valcol[attr]);
                                            }
                                        }
                                    }
                                    i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(usrKey));
                                    i_adapter.performSelect(table.name, undefined, undefined, 1, function (i_result) {
                                        // replace in all existing value strings all occurrences
                                        // of
                                        // any source path with the resulting target path and
                                        // update object
                                        var values = i_result[0], string;
                                        if (typeof valcol === 'string') {
                                            string = values[valcol];
                                            if (typeof string === 'string' && string.length > 0) {
                                                string = i_replace(string);
                                                i_adapter.addValue(table.name + '.' + valcol, SqlHelper.escape(string));
                                            }
                                        }
                                        else {
                                            var attr;
                                            for (attr in valcol) {
                                                if (valcol.hasOwnProperty(attr)) {
                                                    string = values[valcol[attr]];
                                                    if (typeof string === 'string' && string.length > 0) {
                                                        string = i_replace(string);
                                                        i_adapter.addValue(table.name + '.' + valcol[attr], SqlHelper.escape(string));
                                                    }
                                                }
                                            }
                                        }
                                        i_adapter.addWhere(table.name + '.' + table.key_column + ' = ' + SqlHelper.escape(usrKey));
                                        i_adapter.performUpdate(table.name, undefined, 1, i_s, i_e);
                                    }, i_e);
                                });
                            }());
                        }
                    }
                    Executor.run(tasks, i_suc, i_err);
                }, i_err);
            });
        }
        Executor.run(main, i_success, i_error);
    };

    ContentManager.prototype.getReferencesTo = function (i_id, i_success, i_error) {
        var match = this._key_regex.exec(i_id);
        if (match) {
            var user = this._tablesForExt[match[2]];
            var valcol = this._valColsForExt[match[2]];
            if (!user) {
                i_error('Invalid table: ' + i_id);
                return;
            }
            var that = this;
            this._getSqlAdapter(function (i_adapter) {
                var key = SqlHelper.escape(match[1]);
                var keys = {};
                var tasks = [];
                for (var attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var used = that._tablesForExt[attr];
                            tasks.push(function (i_suc, i_err) {
                                i_adapter.addColumn('tab.' + used.key_column + ' AS path');
                                i_adapter.addWhere(user.name + '.' + user.key_column + ' = ' + key);
                                i_adapter.addJoin(format_references_to_condition(user.name, valcol, used.name, 'tab', used.extension, used.key_column));
                                i_adapter.performSelect(user.name, undefined, undefined, undefined, function (i_result) {
                                    for (var i = 0, l = i_result.length; i < l; i++) {
                                        keys['$' + i_result[i].path + '.' + used.extension] = true;
                                    }
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, function () {
                    var array = [], key;
                    for (key in keys) {
                        if (keys.hasOwnProperty(key)) {
                            array.push(key);
                        }
                    }
                    i_adapter.close();
                    i_success(array);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else {
            // if invalid key we simply found no reference
            i_success([]);
        }
    };

    ContentManager.prototype.getReferencesToCount = function (i_id, i_success, i_error) {
        var match = this._key_regex.exec(i_id);
        if (match) {
            var user = this._tablesForExt[match[2]];
            var valcol = this._valColsForExt[match[2]];
            if (!user) {
                i_error('Invalid table: ' + i_id);
                return;
            }
            var that = this;
            this._getSqlAdapter(function (i_adapter) {
                var key = SqlHelper.escape(match[1]);
                var tasks = [], result = 0;
                for (var attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var used = that._tablesForExt[attr];
                            tasks.push(function (i_suc, i_err) {
                                i_adapter.addColumn('COUNT(*) AS cnt');
                                i_adapter.addWhere(user.name + '.' + user.key_column + ' = ' + key);
                                i_adapter.addJoin(format_references_to_condition(user.name, valcol, used.name, 'tab', used.extension, used.key_column));
                                i_adapter.performSelect(user.name, undefined, undefined, undefined, function (i_result) {
                                    result += i_result[0].cnt;
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, function () {
                    i_adapter.close();
                    i_success(result);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else {
            // if invalid key we simply found no reference
            i_success(0);
        }
    };

    ContentManager.prototype._getReferencesFrom = function (i_adapter, i_id, i_success, i_error) {
        var that = this, key = SqlHelper.escape(i_id), keys = {}, tasks = [];
        for (var attr in this._tablesForExt) {
            if (this._tablesForExt.hasOwnProperty(attr)) {
                (function () {
                    var table = that._tablesForExt[attr];
                    var valcol = that._valColsForExt[attr];
                    tasks.push(function (i_suc, i_err) {
                        i_adapter.addColumn(table.name + '.' + table.key_column + ' AS path');
                        if (typeof valcol === 'string') {
                            i_adapter.addWhere(format_references_from_condition(key, table.name + '.' + valcol), false);
                        }
                        else {
                            for (var col in valcol) {
                                if (valcol.hasOwnProperty(col)) {
                                    i_adapter.addWhere(format_references_from_condition(key, table.name + '.' + valcol[col]), false);
                                }
                            }
                        }
                        i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                            for (var i = 0, l = i_result.length; i < l; i++) {
                                keys['$' + i_result[i].path + '.' + table.extension] = true;
                            }
                            i_suc();
                        }, i_err);
                    });
                }());
            }
        }
        tasks.parallel = that._parallel;
        Executor.run(tasks, function () {
            var array = [], key;
            for (key in keys) {
                if (keys.hasOwnProperty(key)) {
                    array.push(key);
                }
            }
            i_success(array);
        }, i_error);
    };

    ContentManager.prototype.getReferencesFrom = function (i_id, i_success, i_error) {
        if (this._key_regex.test(i_id)) {
            var that = this;
            this._getSqlAdapter(function (i_adapter) {
                that._getReferencesFrom(i_adapter, i_id, function (i_results) {
                    i_adapter.close();
                    i_success(i_results);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else {
            // if invalid key we simply found no reference
            i_success([]);
        }
    };

    ContentManager.prototype.getReferencesFromCount = function (i_id, i_success, i_error) {
        if (this._key_regex.test(i_id)) {
            var that = this;
            this._getSqlAdapter(function (i_adapter) {
                var key = SqlHelper.escape(i_id);
                var result = 0, tasks = [];
                for (var attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var table = that._tablesForExt[attr];
                            var valcol = that._valColsForExt[attr];
                            tasks.push(function (i_suc, i_err) {
                                i_adapter.addColumn('COUNT(*) AS cnt');
                                if (typeof valcol === 'string') {
                                    i_adapter.addWhere(format_references_from_condition(key, table.name + '.' + valcol), false);
                                }
                                else {
                                    for (var col in valcol) {
                                        if (valcol.hasOwnProperty(col)) {
                                            i_adapter.addWhere(format_references_from_condition(key, table.name + '.' + valcol[col]), false);
                                        }
                                    }
                                }
                                i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                                    result += i_result[0].cnt;
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, function () {
                    i_adapter.close();
                    i_success(result);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else {
            // if invalid key we simply found no reference
            i_success(0);
        }
    };

    ContentManager.prototype.getTreeChildNodes = function (i_id, i_success, i_error) {
        var match = FOLDER_REGEX.exec(i_id);
        if (match) {
            var that = this, config = this._config, key = match[1];
            this._getSqlAdapter(function (i_adapter) {
                var tasks = [], nodes = [], compare_raw_nodes = function (i_node1, i_node2) {
                    return that.compare(i_node1.path, i_node2.path);
                };
                for (var attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var table = that._tablesForExt[attr];
                            tasks.push(function (i_suc, i_err) {
                                /**
                                 * the following call returns an array of objects like: <code> 
                                 * { 
                                 *   name : 'name of the folder or file', 
                                 *   path : 'database key',
                                 *   folder : 'true if name ends with delimiter' 
                                 * }
                                 * </code>
                                 * We add more parameters so our getTreeChildNodes method will
                                 * retourn an array of objects like: <code> 
                                 * { 
                                 *   name : 'name of the folder or file', 
                                 *   path : '$ + database key [ + . + extension in case of a file]',
                                 *   folder : 'true if name ends with delimiter' ,
                                 *   url : 'the url for loading children',
                                 *   icon : 'folder icon or table specific icon',
                                 *   extension : 'if not a folder this will be the table specific extension'
                                 * }
                                 * </code>
                                 */
                                i_adapter.getChildNodes(table.name, table.key_column, '/', key, function (i_nodes) {
                                    var i, l = i_nodes.length, node, path, idx;
                                    for (i = 0; i < l; i++) {
                                        node = i_nodes[i];
                                        // build the full node path - and in case of a file add
                                        // the extension
                                        path = '$' + node.path;
                                        if (!node.folder) {
                                            path += '.' + table.extension;
                                        }
                                        node.path = path;
                                        idx = Sorting.getInsertionIndex(node, nodes, true, compare_raw_nodes);
                                        if (idx >= 0) {
                                            if (!node.folder) {
                                                node.extension = table.extension;
                                            }
                                            nodes.splice(idx, 0, node);
                                        }
                                    }
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, function () {
                    i_adapter.close();
                    i_success(nodes);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else if (this._key_regex.test(i_id)) {
            i_success([]);
        }
        else {
            i_error('Invalid key: "' + i_id + '"');
        }
    };

    ContentManager.prototype.getSearchResults = function (i_key, i_value, i_success, i_error) {
        if (i_key.length > 0 || i_value.length > 0) {
            var that = this;
            this._getSqlAdapter(function (i_adapter) {
                var results = [], tasks = [], key = SqlHelper.escape(i_key), value = SqlHelper.escape(i_value);
                for (var attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var table = that._tablesForExt[attr];
                            var valcol = that._valColsForExt[attr];
                            tasks.push(function (i_suc, i_err) {
                                i_adapter.addColumn(table.name + '.' + table.key_column + ' AS path');
                                var where = '';
                                if (i_key.length > 0) {
                                    where += 'LOCATE(';
                                    where += key;
                                    where += ', ';
                                    where += table.name;
                                    where += '.';
                                    where += table.key_column;
                                    where += ') > 0';
                                    if (i_value.length > 0) {
                                        where += ' AND ';
                                    }
                                }
                                if (i_value.length > 0) {
                                    if (typeof valcol === 'string') {
                                        where += 'LOCATE(';
                                        where += value;
                                        where += ', ';
                                        where += table.name;
                                        where += '.';
                                        where += valcol;
                                        where += ') > 0';
                                    }
                                    else {
                                        where += '(';
                                        var next = false;
                                        for (var val in valcol) {
                                            if (valcol.hasOwnProperty(val)) {
                                                if (next) {
                                                    where += ' OR ';
                                                }
                                                next = true;
                                                where += 'LOCATE(';
                                                where += value;
                                                where += ', ';
                                                where += table.name;
                                                where += '.';
                                                where += valcol[val];
                                                where += ') > 0';
                                            }
                                        }
                                        where += ')';
                                    }
                                }
                                i_adapter.addWhere(where);
                                i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                                    var i, l = i_result.length, result;
                                    for (i = 0; i < l; i++) {
                                        result = i_result[i];
                                        results.push('$' + result.path + '.' + table.extension);
                                    }
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, function () {
                    i_adapter.close();
                    i_success(results);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
    };

    ContentManager.prototype.getIdKeyValues = function (i_id, i_success, i_error) {
        var that = this, data = this.analyzeID(i_id);
        if (data.file || data.folder) {
            this._getSqlAdapter(function (i_adapter) {
                var results = [], tasks = [], path = SqlHelper.escape(data.path);
                for (var attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            var table = that._tablesForExt[attr];
                            var valcol = that._valColsForExt[attr];
                            tasks.push(function (i_suc, i_err) {
                                i_adapter.addColumn(table.name + '.' + table.key_column + ' AS path');
                                i_adapter.addWhere('LOCATE(' + path + ',' + table.name + '.' + table.key_column + ') = 1');
                                i_adapter.performSelect(table.name, undefined, undefined, undefined, function (i_result) {
                                    var i, l = i_result.length, result;
                                    for (i = 0; i < l; i++) {
                                        result = i_result[i];
                                        results.push('$' + result.path + '.' + table.extension);
                                    }
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, function () {
                    i_adapter.close();
                    i_success(results);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, i_error);
        }
        else {
            i_error('Invalid selection: "' + data.string + '"');
        }
    };

    ContentManager.prototype.getIdSelectedValues = function (i_id, i_language, i_success, i_error) {
        var match = this._key_regex.exec(i_id);
        if (!match) {
            i_error('Invalid id: ' + i_id);
            return;
        }
        var table = this._tablesForExt[match[2]];
        var valcol = this._valColsForExt[match[2]];
        if (!table) {
            i_error('Invalid table: ' + i_id);
            return;
        }
        var that = this;
        this._getSqlAdapter(function (i_adapter) {
            i_adapter.addColumn(table.name + '.' + table.key_column + ' AS path');
            i_adapter.addColumn((typeof valcol === 'string' ? valcol : valcol[i_language]) + ' AS val');
            i_adapter.performSelect(table.name, undefined, 'path ASC', undefined, function (i_result) {
                var array = [], i, l = i_result.length;
                for (i = 0; i < l; i++) {
                    array.push([i_result[i].path + '.' + table.extension, i_result[i].val]);
                }
                i_adapter.close();
                i_success(array);
            }, function (i_exc) {
                i_adapter.close();
                i_error(i_exc);
            });
        }, i_error);
    };

    ContentManager.prototype.handleRequest = function (i_request, i_success, i_error) {
        switch (i_request.command) {
            case COMMAND_GET_CONFIG:
                var that = this, tables = this._config.tables.map(function (i_table) {
                    var table = {
                        extension: i_table.extension,
                        icon: i_table.icon,
                        jsonfx: i_table.jsonfx === true,
                        multiedit: i_table.multiedit === true,
                    };
                    if (i_table.value_column) {
                        table.value_column = i_table.value_column;
                        table.multilingual = false;
                    }
                    else {
                        table.value_column_prefix = i_table.value_column_prefix;
                        table.multilingual = true;
                    }
                    return table;
                });
                i_success({
                    icon_dir: this._config.icon_dir,
                    languages: this._config.languages,
                    folder_icon: this._config.folder_icon,
                    jsonfx_pretty: this._config.jsonfx_pretty,
                    tables: tables,
                    key_regex: this._key_regex.source,
                    exchange_header_regex: this._exchange_header_regex.source
                });
                break;
            case COMMAND_EXISTS:
                this.exists(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_CHECKSUM:
                this.getChecksum(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_OBJECT:
                this.getObject(i_request.id, i_request.language, i_request.mode, i_success, i_error);
                break;
            case COMMAND_GET_MODIFICATION_PARAMS:
                this.getModificationParams(i_request.id, i_request.language, i_request.value, i_success, i_error);
                break;
            case COMMAND_SET_OBJECT:
                this.setObject(i_request.id, i_request.language, i_request.value, i_request.checksum, i_success, i_error);
                break;
            case COMMAND_GET_REFACTORING_PARAMS:
                this.getRefactoringParams(i_request.source, i_request.target, i_request.action, i_success, i_error);
                break;
            case COMMAND_PERFORM_REFACTORING:
                this.performRefactoring(i_request.source, i_request.target, i_request.action, i_request.checksum, i_success, i_error);
                break;
            case COMMAND_GET_REFERENCES_TO:
                this.getReferencesTo(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_REFERENCES_TO_COUNT:
                this.getReferencesToCount(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_REFERENCES_FROM:
                this.getReferencesFrom(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_REFERENCES_FROM_COUNT:
                this.getReferencesFromCount(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_TREE_CHILD_NODES:
                this.getTreeChildNodes(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_SEARCH_RESULTS:
                this.getSearchResults(i_request.key, i_request.value, i_success, i_error);
                break;
            case COMMAND_GET_ID_KEY_VALUES:
                this.getIdKeyValues(i_request.id, i_success, i_error);
                break;
            case COMMAND_GET_ID_SELECTED_VALUES:
                this.getIdSelectedValues(i_request.id, i_request.language, i_success, i_error);
                break;
            default:
                i_error('EXCEPTION! Unexpected command: ' + i_request.command);
                break;
        }
    };

    ContentManager.prototype.handleFancyTreeRequest = function (i_request, i_id, i_success, i_error) {
        var that = this, id = typeof i_id === 'string' && i_id.length > 0 ? i_id : '$';
        switch (i_request) {
            case ContentManager.COMMAND_GET_CHILD_TREE_NODES:
                /**
                 * the following call returns an array of objects like: <code> 
                 * { 
                 *   name : 'name of the folder or file', 
                 *   path : '$ + database key [ + . + extension in case of a file]',
                 *   folder : 'true if name ends with delimiter' ,
                 *   url : 'the url for loading children',
                 *   extension : 'if not a folder this will be the table specific extension'
                 * }
                 * </code>
                 */
                this.getTreeChildNodes(id, function (i_nodes) {
                    // transform to fance-tree node style
                    var nodes = [], i, l = i_nodes.length, node;
                    for (i = 0; i < l; i++) {
                        node = i_nodes[i];
                        nodes.push({
                            title: node.folder ? node.name : (node.name + '.' + node.extension),
                            folder: node.folder,
                            lazy: node.folder,
                            data: {
                                // url + path: required for building the client side loading
                                // request
                                url: ContentManager.GET_CONTENT_TREE_NODES_URL,
                                path: node.path,
                                request: ContentManager.COMMAND_GET_CHILD_TREE_NODES,
                            },
                            icon: that.getIcon(node.path)
                        });
                    }
                    i_success(nodes);
                }, i_error);
                break;
            case ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES:
                this.getReferencesTo(id, function (i_results) {
                    // transform to fance-tree node style
                    var nodes = [], i, l = i_results.length, tasks = [];
                    for (i = 0; i < l; i++) {
                        (function () {
                            var key = i_results[i];
                            var node = {
                                title: key,
                                data: {
                                    // url + path: required for building the client side loading
                                    // request
                                    url: ContentManager.GET_CONTENT_TREE_NODES_URL,
                                    path: key,
                                    request: ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES,
                                },
                                icon: that.getIcon(key)
                            };
                            nodes.push(node);
                            tasks.push(function (i_suc, i_err) {
                                that.getReferencesToCount(key, function (i_count) {
                                    var folder = i_count > 0;
                                    node.folder = folder;
                                    node.lazy = folder;
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                    tasks.parallel = true;
                    Executor.run(tasks, function () {
                        i_success(nodes);
                    }, i_error);
                }, i_error);
                break;
            case ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES:
                this.getReferencesFrom(id, function (i_results) {
                    // transform to fance-tree node style
                    var nodes = [], i, l = i_results.length, tasks = [];
                    for (i = 0; i < l; i++) {
                        (function () {
                            var key = i_results[i];
                            var node = {
                                title: key,
                                data: {
                                    // url + path: required for building the client side loading
                                    // request
                                    url: ContentManager.GET_CONTENT_TREE_NODES_URL,
                                    path: key,
                                    request: ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES,
                                },
                                icon: that.getIcon(key)
                            };
                            nodes.push(node);
                            tasks.push(function (i_suc, i_err) {
                                that.getReferencesFromCount(key, function (i_count) {
                                    var folder = i_count > 0;
                                    node.folder = folder;
                                    node.lazy = folder;
                                    i_suc();
                                }, i_err);
                            });
                        }());
                    }
                    tasks.parallel = true;
                    Executor.run(tasks, function () {
                        i_success(nodes);
                    }, i_error);
                }, i_error);
                break;
            default:
                i_success([]);
                break;
        }
    };

    // template method
    ContentManager.prototype._$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$ = function (i_success, i_error) {
        var that = this, config = this._config;
        this._getSqlAdapter(function (i_adapter) {
            var main = []
            main.parallel = false;
            main.push(function (i_suc, i_err) {
                i_adapter.startTransaction(i_suc, i_err);
            });
            main.push(function (i_suc, i_err) {
                // add this as often as reqzured and implement actions
            });
            Executor.run(main, function () {
                i_adapter.commitTransaction(function () {
                    i_adapter.close();
                    i_success();
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            }, function (i_exception) {
                i_adapter.rollbackTransaction(function () {
                    i_adapter.close();
                    i_error(i_exception);
                }, function (i_exc) {
                    i_adapter.close();
                    i_error(i_exc);
                });
            });
        }, i_error);
    };

    var ContentManagerProxy = function (i_success, i_error) {
        var that = this;
        this._post({
            command: COMMAND_GET_CONFIG
        }, function (i_config) {
            that._config = i_config;
            that._key_regex = new RegExp(i_config.key_regex);
            that._exchange_header_regex = new RegExp(i_config.exchange_header_regex, 'g');
            var tables = i_config.tables, table, valcol, i, tablen = tables.length, j, langs = i_config.languages.length;
            that._tablesForExt = {};
            that._valColsForExt = {};
            for (i = 0; i < tablen; i++) {
                table = tables[i];
                that._tablesForExt[table.extension] = table;
                if (table.value_column_prefix) {
                    valcol = {};
                    for (j = 0; j < langs; j++) {
                        var lang = i_config.languages[j];
                        valcol[lang] = table.value_column_prefix + lang;
                    }
                }
                else {
                    valcol = table.value_column;
                }
                that._valColsForExt[table.extension] = valcol;
            }
            if (typeof i_success === 'function') {
                i_success();
            }
        }, i_error);
    };

    ContentManagerProxy.prototype = Object.create(ContentManagerBase.prototype);
    ContentManagerProxy.prototype.constructor = ContentManagerProxy;

    // prototype
    ContentManagerProxy.prototype._post = function (request, onSuccess, onError) {
        Client.fetch(ContentManager.GET_CONTENT_DATA_URL, jsonfx.stringify(request, false), response => {
            if (response.length > 0) {
                try {
                    onSuccess(jsonfx.parse(response, false, false));
                } catch (error) {
                    onError(error);
                }
            } else {
                onSuccess();
            }
        }, onError);
    };

    ContentManagerProxy.prototype.exists = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_EXISTS,
            id: i_id
        }, i_success, i_error);
    }

    ContentManagerProxy.prototype.getChecksum = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_CHECKSUM,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getObject = function (i_id, i_language, i_mode, i_success, i_error) {
        var that = this, parse = i_mode === ContentManager.PARSE;
        this._post({
            command: COMMAND_GET_OBJECT,
            id: i_id,
            language: i_language,
            mode: parse ? ContentManager.INCLUDE : i_mode
        }, parse ? function (i_response) {
            if (i_response !== undefined) {
                try {
                    var response = jsonfx.reconstruct(i_response);
                    if (that._config !== undefined && that._config.jsonfx_pretty === true) {
                        // the 'jsonfx_pretty' flag may be used to format our dynamically
                        // parsed JavaScript sources for more easy debugging purpose
                        var match = that._key_regex.exec(i_id);
                        // TOOD: response = eval('(' + jsonfx.stringify(response, true) + ')\n//# sourceURL=' + match[1] + '.js');
                        response = eval('(' + jsonfx.stringify(response, true) + ')');
                    }
                    i_success(response);
                }
                catch (exc) {
                    i_error(exc);
                }
            }
            else {
                i_success();
            }
        } : i_success, i_error);
    };

    ContentManagerProxy.prototype.getModificationParams = function (i_id, i_language, i_value, i_success, i_error) {
        this._post({
            command: COMMAND_GET_MODIFICATION_PARAMS,
            id: i_id,
            language: i_language,
            value: i_value
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.setObject = function (i_id, i_language, i_value, i_checksum, i_success, i_error) {
        this._post({
            command: COMMAND_SET_OBJECT,
            id: i_id,
            language: i_language,
            value: i_value,
            checksum: i_checksum
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getRefactoringParams = function (i_source, i_target, i_action, i_success, i_error) {
        this._post({
            command: COMMAND_GET_REFACTORING_PARAMS,
            source: i_source,
            target: i_target,
            action: i_action
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.performRefactoring = function (i_source, i_target, i_action, i_checksum, i_success, i_error) {
        this._post({
            command: COMMAND_PERFORM_REFACTORING,
            source: i_source,
            target: i_target,
            action: i_action,
            checksum: i_checksum
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getReferencesTo = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_REFERENCES_TO,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getReferencesToCount = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_REFERENCES_TO_COUNT,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getReferencesFrom = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_REFERENCES_FROM,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getReferencesFromCount = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_REFERENCES_FROM_COUNT,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getTreeChildNodes = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_TREE_CHILD_NODES,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getSearchResults = function (i_key, i_value, i_success, i_error) {
        this._post({
            command: COMMAND_GET_SEARCH_RESULTS,
            key: i_key,
            value: i_value
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getIdKeyValues = function (i_id, i_success, i_error) {
        this._post({
            command: COMMAND_GET_ID_KEY_VALUES,
            id: i_id
        }, i_success, i_error);
    };

    ContentManagerProxy.prototype.getIdSelectedValues = function (i_id, i_language, i_success, i_error) {
        this._post({
            command: COMMAND_GET_ID_SELECTED_VALUES,
            id: i_id,
            language: i_language
        }, i_success, i_error);
    };

    ContentManager.Proxy = ContentManagerProxy;

    var create_checksum = function (i_group, i_path) {
        var seed = 'l.6l8033988749895';
        seed += i_path;
        seed += '2.7l828l828459045';
        seed += i_group;
        seed += '3.l4l592653589793';
        return Utilities.md5(seed);
    };

    var create_header = function (i_group, i_path) {
        var hdr = '[{(';
        hdr += i_group;
        hdr += '<>';
        hdr += create_checksum(i_group, i_path)
        hdr += ')}]\n';
        hdr += i_path;
        hdr += '\n';
        return hdr;
    };

    var format_relative_status = function (i_state) {
        return Utilities.formatNumber(i_state * 100, 2) + '%';
    };

    var ExchangeHandler = function (i_cms) {
        this._cms = i_cms;
    };

    ExchangeHandler.prototype = Object.create(Object.prototype);
    ExchangeHandler.prototype.constructor = ExchangeHandler;

    // prototype
    ExchangeHandler.prototype._read_config_data = function (i_ids, i_path, i_languages, i_status_callback, i_error) {
        var exports = [create_header(EXCHANGE_HEADER, i_path), '\n'];
        var that = this, cms = this._cms, tasks = [];
        for (var i = 0, len = i_ids.length; i < len; i++) {
            // closure
            (function () {
                var idx = i, id = i_ids[idx], data = cms.analyzeID(id);
                if (data.jsonfx) {
                    tasks.push(function (i_suc, i_err) {
                        cms.getObject(id, undefined, ContentManager.RAW, function (i_object) {
                            exports.push(create_header(data.extension, id));
                            exports.push(jsonfx.stringify(jsonfx.reconstruct(i_object), true));
                            exports.push('\n\n');
                            i_status_callback(format_relative_status(idx / len));
                            i_suc();
                        }, i_err);
                    });
                }
                else if (!data.multilingual) {
                    tasks.push(function (i_suc, i_err) {
                        cms.getObject(id, undefined, ContentManager.RAW, function (i_object) {
                            exports.push(create_header(data.extension, id));
                            exports.push(i_object);
                            exports.push('\n\n');
                            i_status_callback(format_relative_status(idx / len));
                            i_suc();
                        }, i_err);
                    });
                }
                else {
                    tasks.push(function (i_suc, i_err) {
                        cms.getObject(id, undefined, ContentManager.RAW, function (i_results) {
                            exports.push(create_header(data.extension, id));
                            for (var l = 0; l < i_languages.length; l++) {
                                var lang = i_languages[l];
                                exports.push(create_header('language', id + ':' + lang));
                                var txt = i_results[lang];
                                if (txt != undefined && txt != null) {
                                    exports.push(typeof txt === 'string' ? txt : txt.toString());
                                }
                                exports.push('\n');
                            }
                            exports.push('\n');
                            i_status_callback(format_relative_status(idx / len));
                            i_suc();
                        }, i_err);
                    });
                }
            }());
        }
        tasks.parallel = false;
        Executor.run(tasks, function () {
            i_status_callback();
            var blob = new Blob(exports, {
                type: "text/plain;charset=utf-8"
            });
            saveAs(blob, 'hmijs_export.txt');
        }, i_error);
    };
    ExchangeHandler.prototype._parse = function (i_text, i_data, i_status_callback, i_error) {
        // separate ids and data
        var that = this, cms = this._cms, elements = [];
        Regex.each(cms._exchange_header_regex, i_text, function (i_start, i_end, i_match) {
            elements.push(i_match ? i_match : i_text.substring(i_start, i_end));
        });
        i_status_callback('loaded ' + elements.length + ' elements');
        var header = elements[0];
        if (!Array.isArray(header) || EXCHANGE_HEADER !== header[1] || create_checksum(header[1], header[3]) !== header[2]) {
            i_error('EXCEPTION! Invalid ' + EXCHANGE_HEADER + ' header.');
            return false;
        }
        // handle all found elements
        var filter = header[3], idx = 1;
        while (idx < elements.length) {
            header = elements[idx++];
            if (Array.isArray(header)) {
                var path = header[3];
                if (create_checksum(header[1], path) === header[2]) {
                    var data = cms.analyzeID(path);
                    if (data.jsonfx) {
                        try {
                            data.value = jsonfx.parse(elements[idx++], true, true);
                        }
                        catch (exc) {
                            i_error('EXCEPTION! Cannot evaluate object: ' + exc);
                            return false;
                        }
                        i_data.push(data);
                    }
                    else if (!data.multilingual) {
                        data.value = elements[idx++].trim();
                        i_data.push(data);
                    }
                    else {
                        data.value = {};
                        while (idx < elements.length) {
                            header = elements[idx];
                            if (!Array.isArray(header) || header[1] !== 'language') {
                                break;
                            }
                            if (create_checksum(header[1], header[3]) !== header[2]) {
                                i_error('EXCEPTION! Invalid language header!');
                                return false;
                            }
                            idx++
                            var txt = elements[idx++].trim();
                            if (txt.length > 0) {
                                data.value[header[3].substring(data.id.length + 1)] = txt;
                            }
                        }
                        i_data.push(data);
                    }
                }
                else {
                    i_error('EXCEPTION! Invalid: ' + JSON.stringify(header));
                    return false;
                }
            }
        }
        i_status_callback('parsed ' + idx + '/' + elements.length + ' elements');
        return filter;
    };
    ExchangeHandler.prototype._write_config_data = function (i_data, i_status_callback, i_error) {
        var that = this, cms = this._cms, tasks = [];
        for (var i = 0, len = i_data.length; i < len; i++) {
            // closure
            (function () {
                var idx = i, data = i_data[idx];
                if (data.jsonfx) {
                    tasks.push(function (i_suc, i_err) {
                        var val = data.value !== undefined && data.value !== null ? jsonfx.stringify(data.value, false) : undefined;
                        cms.getModificationParams(data.id, undefined, val, function (i_params) {
                            cms.setObject(data.id, undefined, val, i_params.checksum, i_suc, i_err);
                        }, i_err);
                    });
                }
                else if (!data.multilingual) {
                    tasks.push(function (i_suc, i_err) {
                        var val = data.value !== undefined && data.value !== null ? data.value : undefined;
                        cms.getModificationParams(data.id, undefined, val, function (i_params) {
                            cms.setObject(data.id, undefined, val, i_params.checksum, i_suc, i_err);
                        });
                    });
                }
                else {
                    tasks.push(function (i_suc, i_err) {
                        var val = data.value !== undefined && data.value !== null ? data.value : undefined;
                        cms.getModificationParams(data.id, undefined, val, function (i_params) {
                            cms.setObject(data.id, undefined, val, i_params.checksum, i_suc, i_err);
                        });
                    });
                }
                tasks.push(function (i_suc, i_err) {
                    i_status_callback(format_relative_status(idx / len));
                    i_suc();
                });
            }());
        }
        tasks.parallel = false;
        Executor.run(tasks, function () {
            i_status_callback();
        }, i_error);
    };
    ExchangeHandler.prototype.handleImport = function (i_hmi, i_text, i_status_callback, i_error) {
        // separate ids and data
        var that = this, data = [], prefix = this._parse(i_text, data, i_status_callback, i_error);
        if (typeof prefix !== 'string') {
            i_status_callback();
            return;
        }
        var txt = '<b>Import (replace):</b><br><code>';
        txt += prefix.length > 0 ? prefix : 'all (!)';
        txt += '</code>';
        txt += '<br><br><b>';
        txt += 'Sure to proceed?';
        txt += '</b>';
        i_hmi.showDefaultConfirmationPopup({
            width: $(window).width() * 0.6,
            height: $(window).height() * 0.4,
            title: 'warning',
            html: txt,
            yes: function () {
                that._write_config_data(data, i_status_callback, i_error);
            },
            cancel: function () {
                i_status_callback();
            }
        });
    };
    ExchangeHandler.prototype.handleExport = function (i_id, i_status_callback, i_error) {
        var that = this, cms = this._cms, data = cms.analyzeID(i_id);
        i_status_callback('load languages ...');
        var languages = cms.getLanguages();
        languages.sort(compare_keys);
        if (data.file) {
            that._read_config_data([data.file], i_id, languages, i_status_callback, i_error);
        }
        else if (data.folder) {
            cms.getIdKeyValues(data.folder, function (i_ids) {
                i_ids.sort(compare_keys);
                that._read_config_data(i_ids, i_id, languages, i_status_callback, i_error);
            }, i_error);
        }
        else {
            i_status_callback();
        }
    };

    // export
    if (isNodeJS) {
        module.exports = ContentManager;
    }
    else {
        window.ContentManager = ContentManager;
    }
}(globalThis));
