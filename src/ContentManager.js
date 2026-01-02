(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Utilities = isNodeJS ? require('./Utilities.js') : root.Utilities;
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const SqlHelper = isNodeJS ? require('./SqlHelper.js') : root.SqlHelper;

    const compare_keys = Sorting.getTextsAndNumbersCompareFunction(false, false, true);

    // //////////////////////////////////////////////////////////////////////////////////////////
    // CROSS REFERENCES
    // //////////////////////////////////////////////////////////////////////////////////////////

    // search for keys in text within single quotation marks
    function formatReferencesFromCondition(escapedId, valCol) {
        return `LOCATE(${escapedId},${valCol}) > 0`;
    }

    // search for keys in text within double quotation marks
    function formatReferencesToLocate(userTab, userValCol, usedTabAlias, usedExt, usedKeyCol) {
        return `LOCATE(CONCAT('$',${usedTabAlias}.${usedKeyCol},'.${usedExt}'),${userTab}.${userValCol}) > 0`;
    }

    function formatReferencesToCondition(userTab, userValCol, usedTab, usedTabAlias, usedExt, usedKeyCol) {
        let query = `INNER JOIN ${usedTab} AS ${usedTabAlias} ON `;
        if (typeof userValCol === 'string') {
            query += formatReferencesToLocate(userTab, userValCol, usedTabAlias, usedExt, usedKeyCol);
        } else {
            let next = false;
            for (const attr in userValCol) {
                if (userValCol.hasOwnProperty(attr)) {
                    if (next) {
                        query += ' OR ';
                    }
                    query += formatReferencesToLocate(userTab, userValCol[attr], usedTabAlias, usedExt, usedKeyCol);
                    next = true;
                }
            }
        }
        return query;
    }

    function getModificationParams(previous, next) {
        // within the next condition checks we detect if the value is available
        // after the update and if the data will be changed
        if (typeof previous === 'string' && previous.length > 0) {
            if (typeof next === 'string' && next.length > 0) {
                if (previous !== next) {
                    // both values available and different
                    return { empty: false, changed: true, string: next };
                } else {
                    // both values available and equal
                    return { empty: false, changed: false };
                }
            } else {
                // reset current value
                return { empty: true, changed: true };
            }
        } else {
            if (typeof next === 'string' && next.length > 0) {
                // new value available
                return { empty: false, changed: true, string: next };
            } else {
                // both values unavailable
                return { empty: true, changed: false };
            }
        }
    }

    const COMMAND_GET_CONFIG = 'get_config';
    const COMMAND_GET_CHECKSUM = 'get_checksum';
    const COMMAND_GET_OBJECT = 'get_object';
    const COMMAND_EXISTS = 'exists';
    const COMMAND_GET_MODIFICATION_PARAMS = 'getModificationParams';
    const COMMAND_SET_OBJECT = 'set_object';
    const COMMAND_GET_REFACTORING_PARAMS = 'get_refactoring_params';
    const COMMAND_PERFORM_REFACTORING = 'perform_refactoring';
    const COMMAND_GET_REFERENCES_TO = 'get_references_to';
    const COMMAND_GET_REFERENCES_TO_COUNT = 'get_references_to_count';
    const COMMAND_GET_REFERENCES_FROM = 'get_references_from';
    const COMMAND_GET_REFERENCES_FROM_COUNT = 'get_references_from_count';
    const COMMAND_GET_TREE_CHILD_NODES = 'get_tree_child_nodes';
    const COMMAND_GET_SEARCH_RESULTS = 'get_search_results';
    const COMMAND_GET_ID_KEY_VALUES = 'get_id_key_values';
    const COMMAND_GET_ID_SELECTED_VALUES = 'get_id_selected_values';

    const VALID_EXT_REGEX = /^\w+$/;
    const VALID_NAME_CHAR = '[a-zA-Z0-9_+\\-*]';
    const FOLDER_REGEX = new RegExp('^\\$((?:' + VALID_NAME_CHAR + '+\\/)*)$');
    const EXCHANGE_HEADER = 'hmijs-config-exchange-data';

    const ContentManagerBase = function () {
        // nothing to do here
    };

    ContentManagerBase.prototype = Object.create(Object.prototype);
    ContentManagerBase.prototype.constructor = ContentManagerBase;

    ContentManagerBase.prototype.getExchangeHandler = function (array) {
        return new ExchangeHandler(this);
    };

    ContentManagerBase.prototype.getLanguages = function (array) {
        return Utilities.copyArray(this._config.languages, array);
    };

    ContentManagerBase.prototype.isValidFile = function (string) {
        return this._key_regex.test(string);
    };

    ContentManagerBase.prototype.isValidFolder = function (string) {
        return FOLDER_REGEX.test(string);
    };

    ContentManagerBase.prototype.getDescriptor = function (ext, description) {
        const tab = this._tablesForExt[ext];
        if (tab) {
            const desc = description || {};
            desc.JsonFX = tab.JsonFX === true;
            desc.multilingual = tab.multilingual === true || (typeof tab.value_column_prefix === 'string' && tab.value_column_prefix.length > 0);
            desc.multiedit = tab.multiedit === true;
            return desc;
        } else {
            return false;
        }
    };

    ContentManagerBase.prototype.analyzeID = function (id) {
        let match = this._key_regex.exec(id);
        if (match) {
            return this.getDescriptor(match[2], { id, path: match[1], file: id, extension: match[2] });
        }
        match = FOLDER_REGEX.exec(id);
        if (match) {
            return { id, path: match[1], folder: id };
        }
        return { id };
    };

    ContentManagerBase.prototype.getDescriptors = function (onEach) {
        const tabs = this._tablesForExt;
        for (const ext in tabs) {
            if (tabs.hasOwnProperty(ext)) {
                onEach(ext, this.getDescriptor(ext));
            }
        }
    };

    ContentManagerBase.prototype.getPath = function (id) {
        const match = this._key_regex.exec(id);
        return match ? match[1] : false;
    };

    ContentManagerBase.prototype.getExtension = function (id) {
        const match = this._key_regex.exec(id);
        return match ? match[2] : false;
    };

    ContentManagerBase.prototype.getIcon = function (id) {
        const match = this._key_regex.exec(id);
        if (match) {
            const tab = this._tablesForExt[match[2]];
            return tab ? this._config.icon_dir + tab.icon : false;
        } else if (FOLDER_REGEX.test(id)) {
            return this._config.icon_dir + this._config.folder_icon;
        } else {
            return false;
        }
    };

    ContentManagerBase.prototype.compare = function (id1, id2) {
        if (FOLDER_REGEX.test(id1)) {
            return FOLDER_REGEX.test(id2) ? Sorting.compareTextsAndNumbers(id1, id2, false, false) : -1;
        } else {
            return FOLDER_REGEX.test(id2) ? 1 : Sorting.compareTextsAndNumbers(id1, id2, false, false);
        }
    };

    // TODO check if runnning and required
    ContentManagerBase.prototype.getValueColumns = function (id, selectables) {
        const match = this._key_regex.exec(id);
        if (!match) {
            return;
        }
        const table = this._tablesForExt[match[2]];
        const valcol = this._valColsForExt[match[2]];
        if (!table) {
            return;
        }
        const sel = selectables || [];
        // TODO is this a "selectable" (only single value for jso/txt
        if (typeof valcol === 'string') {
            sel.push(valcol);
        } else {
            for (const attr in valcol) {
                if (valcol.hasOwnProperty(attr)) {
                    // TODO isn't "attr" the selectable?
                    sel.push(valcol[attr]);
                }
            }
        }
        return sel;
    };

    // constructor
    const ContentManager = function (getSqlAdapter, config) {
        if (!getSqlAdapter) {
            throw new Error('No database access provider available!');
        } else if (!config) {
            throw new Error('No database configuration available!');
        }
        this._getSqlAdapter = getSqlAdapter;
        this._config = config;
        this._parallel = typeof config.max_parallel_queries === 'number' && config.max_parallel_queries > 0 ? config.max_parallel_queries : true;
        let tables = this._config.tables, table, valcol, i, tablen = tables.length, j, langs = config.languages.length, lang;
        this._tablesForExt = {};
        this._valColsForExt = {};
        for (i = 0; i < tablen; i++) {
            table = tables[i];
            if (!VALID_EXT_REGEX.test(table.extension)) {
                throw new Error('Invalid extension: "' + table.extension + '"');
            } else if (this._tablesForExt[table.extension] !== undefined) {
                throw new Error('Extension already exists: "' + table.extension + '"');
            }
            if (table.value_column_prefix) {
                valcol = {};
                for (j = 0; j < langs; j++) {
                    lang = config.languages[j];
                    valcol[lang] = table.value_column_prefix + lang;
                }
            } else {
                valcol = table.value_column;
            }
            this._tablesForExt[table.extension] = table;
            this._valColsForExt[table.extension] = valcol;
        }
        // we need all available extensions for building regular expressions
        const tabexts = tables.map(table => table.extension).join('|');
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

    ContentManager.prototype._getRawString = function (adapter, table, key, language, onSuccess, onError) {
        let valcol = this._valColsForExt[table.extension], column = typeof valcol === 'string' ? valcol : valcol[language];
        if (typeof column === 'string') {
            adapter.addColumn(`${table.name}.${column} AS ${column}`);
            adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(key)}`);
            adapter.performSelect(table.name, undefined, undefined, 1, function (results, fields) {
                // in case of an result we are dealing with an existing key, but
                // the
                // data for the requested language may not be available anyway
                if (results.length === 1) {
                    let raw = results[0][column];
                    onSuccess(raw !== null ? raw : '');
                } else {
                    onSuccess(false);
                }
            }, onError);
        } else {
            onError(`Invalid value column for table '${table.name}' and language '${language}'`);
        }
    };

    ContentManager.prototype.exists = function (id, onSuccess, onError) {
        const match = this._key_regex.exec(id);
        if (match) {
            const table = this._tablesForExt[match[2]];
            if (!table) {
                onError(`Invalid table: ${id}`);
                return;
            }
            this._getSqlAdapter(adapter => {
                adapter.addColumn('COUNT(*) AS cnt');
                adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(match[1])}`);
                adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                    adapter.close();
                    onSuccess(result[0].cnt > 0);
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        } else {
            onSuccess(false);
        }
    };

    ContentManager.prototype.getChecksum = function (id, onSuccess, onError) {
        // first we try to get table object matching to the given key
        const match = this._key_regex.exec(id);
        if (!match) {
            onError(`Invalid id: '${id}'`);
            return;
        }
        const table = this._tablesForExt[match[2]];
        const valcol = this._valColsForExt[match[2]];
        if (!table) {
            onError(`Invalid table name: '${id}'`);
            return;
        }
        const that = this;
        this._getSqlAdapter(adapter => {
            const key = match[1];
            let raw = id;
            function success() {
                adapter.close();
                onSuccess(Utilities.md5(raw));
            }
            function error(err) {
                adapter.close();
                onError(err);
            };
            // if JsonFX or plain text is available we decode the string and
            // return with or without all includes included
            if (typeof valcol === 'string') {
                // note: no language required here because we got only one anyway
                that._getRawString(adapter, table, key, undefined, rawString => {
                    if (rawString !== false) {
                        raw += ':';
                        raw += rawString;
                    }
                    success();
                }, error);
            } else {
                for (const attr in valcol) {
                    if (valcol.hasOwnProperty(attr)) {
                        adapter.addColumn(`${table.name}.${valcol[attr]} AS ${attr}`);
                    }
                }
                adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(key)}`);
                adapter.performSelect(table.name, undefined, undefined, 1, (results, fields) => {
                    if (results.length === 1) {
                        const object = results[0];
                        for (const attr in valcol) {
                            if (object.hasOwnProperty(attr)) {
                                raw += `:${attr}:${object[attr]}`;
                            }
                        }
                    }
                    success();
                }, error);
            }
        }, onError);
    };

    ContentManager.prototype.getObject = function (id, language, mode, onSuccess, onError) {
        // This method works in four modes:
        // 1. JsonFX-object: build object and return
        // 2. plain text (utf-8): build text and return
        // 3. label/html with language selection: build string and return
        // 4. label/html without language selection: build strings and return as
        // object

        // first we try to get table object matching to the given key
        const match = this._key_regex.exec(id);
        if (!match) {
            onError('Invalid id: "' + id + '"');
            return;
        }
        const table = this._tablesForExt[match[2]];
        const valcol = this._valColsForExt[match[2]];
        if (!table) {
            onError('Invalid table name: "' + id + '"');
            return;
        }
        const that = this;
        this._getSqlAdapter(adapter => {
            let key = match[1], parse = mode === ContentManager.PARSE, include = parse || mode === ContentManager.INCLUDE;
            function success(response) {
                adapter.close();
                try {
                    if (parse) {
                        const object = JsonFX.reconstruct(response);
                        if (that._config.jsonfx_pretty === true) {
                            // the 'jsonfx_pretty' flag may be used to format our dynamically
                            // parsed JavaScript sources for more easy debugging purpose
                            // TODO: object = eval('(' + JsonFX.stringify(object, true) + ')\n//# sourceURL=' + key + '.js');
                            object = eval('(' + JsonFX.stringify(object, true) + ')');
                        }
                        onSuccess(object);
                    } else {
                        onSuccess(response);
                    }
                } catch (err) {
                    onError(err);
                }
            }
            function error(err) {
                adapter.close();
                onError(err);
            }
            // if JsonFX or plain text is available we decode the string and
            // return with or without all includes included
            if (typeof valcol === 'string') {
                // note: no language required here because we got only one anyway
                that._getRawString(adapter, table, key, undefined, rawString => {
                    if (rawString !== false) {
                        const object = table.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                        if (include) {
                            const ids = {};
                            ids[id] = true;
                            that._include(adapter, object, ids, language, success, error);
                        } else {
                            success(object);
                        }
                    } else {
                        success();
                    }
                }, error);
            } else if (typeof language === 'string') {
                // if selection is available we return string with or without all
                // includes included
                that._getRawString(adapter, table, key, language, rawString => {
                    if (rawString !== false) {
                        if (include) {
                            const ids = {};
                            ids[id] = true;
                            that._include(adapter, rawString, ids, language, success, error);
                        } else {
                            success(rawString);
                        }
                    } else {
                        success();
                    }
                }, error);
            } else {
                for (const attr in valcol) {
                    if (valcol.hasOwnProperty(attr)) {
                        adapter.addColumn(`${table.name}.${valcol[attr]} AS ${attr}`);
                    }
                }
                adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(key)}`);
                adapter.performSelect(table.name, undefined, undefined, 1, (results, fields) => {
                    if (results.length === 1) {
                        const object = results[0];
                        if (include) {
                            const tasks = [];
                            for (const attr in object) {
                                if (object.hasOwnProperty(attr)) {
                                    (function () {
                                        const language = attr;
                                        const ids = {};
                                        ids[id] = true;
                                        tasks.push((onSuc, onErr) => {
                                            that._include(adapter, object[language], ids, language, response => {
                                                object[language] = response;
                                                onSuc();
                                            }, onErr);
                                        });
                                    }());
                                }
                            }
                            tasks.parallel = that._parallel;
                            Executor.run(tasks, () => success(object), error);
                        } else {
                            success(object);
                        }
                    } else {
                        success();
                    }
                }, error);
            }
        }, onError);
    };

    ContentManager.prototype._include = function (adapter, object, ids, language, onSuccess, onError) {
        const that = this;
        if (Array.isArray(object)) {
            this._buildProperties(adapter, object, ids, language, onSuccess, onError);
        } else if (typeof object === 'object' && object !== null) {
            const includeKey = object.include;
            const match = typeof includeKey === 'string' && !ids[includeKey] ? this._key_regex.exec(includeKey) : false;
            if (!match) {
                this._buildProperties(adapter, object, ids, language, onSuccess, onError);
                return;
            }
            const table = this._tablesForExt[match[2]];
            // TODO: reuse or remove const valcol = this._valColsForExt[match[2]];
            if (!table) {
                this._buildProperties(adapter, object, ids, language, onSuccess, onError);
                return;
            }
            this._getRawString(adapter, table, match[1], language, rawString => {
                if (rawString !== false) {
                    ids[includeKey] = true;
                    const includedObject = table.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                    that._include(adapter, includedObject, ids, language, inclObj => {
                        delete ids[includeKey];
                        if (typeof inclObj === 'object' && inclObj !== null) {
                            // if we included an object all attributes except
                            // include must be copied
                            delete object.include;
                            that._buildProperties(adapter, object, ids, language, () => {
                                // with a true "source"-flag we keep all replaced
                                // attributes stored inside a source object
                                if (object.source === true) {
                                    // here we store the replaced attributes
                                    const source = {};
                                    // if there are already stored source attributes
                                    // we
                                    // keep them as well
                                    if (inclObj.source !== undefined) {
                                        source.source = inclObj.source;
                                        delete inclObj.source;
                                    }
                                    // now we transfer and collect all replaced
                                    // attributes
                                    Utilities.transferProperties(object, inclObj, source);
                                    // finally we add our bases
                                    inclObj.source = source;
                                } else {
                                    // no attribute keeping - just attribute transfer
                                    Utilities.transferProperties(object, inclObj);
                                }
                                onSuccess(inclObj);
                            }, onError);
                        } else {
                            // no real object means just return whatever it is
                            onSuccess(inclObj);
                        }
                    }, onError);
                } else {
                    // no string available so just step on with building the object
                    // properties
                    that._buildProperties(adapter, object, ids, language, onSuccess, onError);
                }
            }, onError);
        } else if ((typeof object === 'string')) {
            // Strings may contain include:$path/file.ext entries. With the next
            // Regex call we build an array containing strings and include
            // matches.
            const array = [];
            Regex.each(that._include_regex_build, object, (start, end, match) => array.push(match && !ids[`$${match[2]}.${match[3]}`] ? match : object.substring(start, end)));
            // For all found include-match we try to load the referenced content
            // from the database and replace the corresponding array element with
            // the built content.
            const tasks = [];
            let i, l = array.length, match, tab;
            for (i = 0; i < l; i++) {
                match = array[i];
                if (Array.isArray(match)) {
                    tab = that._tablesForExt[match[3]];
                    if (tab) {
                        (function () {
                            let idx = i, orig = match[0], includeKey = `$${match[2]}.${match[3]}`, table = tab, key = match[2];
                            tasks.push((onSuc, onErr) => {
                                that._getRawString(adapter, table, key, language, rawString => {
                                    if (rawString !== false) {
                                        ids[includeKey] = true;
                                        const object = table.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                                        that._include(adapter, object, ids, language, build => {
                                            delete ids[includeKey];
                                            array[idx] = table.JsonFX && array.length > 1 ? JsonFX.stringify(build, false) : build;
                                            onSuc();
                                        }, onErr);
                                    } else {
                                        // no raw string available means we replace with the
                                        // original content
                                        array[idx] = orig;
                                        onSuc();
                                    }
                                }, onErr);
                            });
                        }());
                    }
                }
            }
            tasks.parallel = that._parallel;
            // if our string contains just one single element we return this as is.
            Executor.run(tasks, () => onSuccess(array.length === 1 ? array[0] : array.join('')), onError);
        } else {
            // if our input object is not an array, an object or a string we have
            // nothing to build so we return the object as is.
            onSuccess(object);
        }
    };

    ContentManager.prototype._buildProperties = function (adapter, object, ids, language, onSuccess, onError) {
        const that = this;
        const tasks = [];
        for (const a in object) {
            if (object.hasOwnProperty(a)) {
                (function () {
                    const p = a;
                    tasks.push((onSuc, onErr) => {
                        that._include(adapter, object[p], ids, language, objectProperty => {
                            object[p] = objectProperty;
                            onSuc();
                        }, onErr);
                    });
                }());
            }
        }
        tasks.parallel = this._parallel;
        Executor.run(tasks, () => onSuccess(object), onError);
    };

    ContentManager.prototype._getModificationParams = function (adapter, id, language, value, onSuccess, onError) {
        // here we store the result
        const params = {};
        // check id
        const match = this._key_regex.exec(id);
        if (!match) {
            params.error = `Invalid id: ${id}`;
            onSuccess(params);
            return;
        }
        // check table
        const table = this._tablesForExt[match[2]];
        if (!table) {
            params.error = `Invalid table: ${id}`;
            onSuccess(params);
            return;
        }
        const valcol = this._valColsForExt[match[2]];
        // in case of a multiligual data type and a given language we got to make
        // sure that language is supported
        if (typeof valcol !== 'string' && typeof language === 'string' && valcol[language] === undefined) {
            params.error = `Invalid language ${' + language + '}`;
            onSuccess(params);
            return;
        }
        // try to get all current database values for given id and copy the new
        // values
        const that = this;
        if (typeof valcol === 'string') {
            adapter.addColumn(`${table.name}.${valcol} AS ${valcol}`);
        } else {
            for (const attr in valcol) {
                if (valcol.hasOwnProperty(attr)) {
                    adapter.addColumn(`${table.name}.${valcol[attr]} AS ${valcol[attr]}`);
                }
            }
        }
        adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(match[1])}`);
        adapter.performSelect(table.name, undefined, undefined, 1, (result, fields) => {
            const currentData = result.length === 1 ? result[0] : undefined;
            // here we store the conditions
            let stillNotEmpty = false;
            let changed = false;
            const values = {};
            let checksum = '';
            if (typeof valcol === 'string') { // in case of a JSON or UTF8 table
                checksum += valcol;
                let currval = currentData !== undefined ? currentData[valcol] : undefined;
                let nextval = typeof value === 'string' ? value : undefined;
                let params = getModificationParams(currval, nextval);
                if (!params.empty) {
                    stillNotEmpty = true;
                }
                if (params.changed) {
                    changed = true;
                }
                values[valcol] = params;
                checksum += params.empty ? 'e' : 'd';
                checksum += params.changed ? 'e' : 'd';
                if (typeof params.string === 'string') {
                    checksum += params.string;
                }
            } else { // labels or html
                for (const attr in valcol) {
                    if (valcol.hasOwnProperty(attr)) {
                        // for all columns we try to get the current and new value
                        const currval = currentData !== undefined ? currentData[valcol[attr]] : undefined;
                        let nextval = undefined;
                        if (typeof language === 'string') {
                            nextval = language === attr ? (typeof value === 'string' ? value : undefined) : currval;
                        } else if (typeof value === 'object' && value !== null) {
                            nextval = value[attr];
                        }
                        // within the next condition checks we detect if the value is
                        // available
                        // after the update and if the data will be changed
                        const params = getModificationParams(currval, nextval);
                        if (!params.empty) {
                            stillNotEmpty = true;
                        }
                        if (params.changed) {
                            changed = true;
                        }
                        values[attr] = params;
                        checksum += params.empty ? 'e' : 'd';
                        checksum += params.changed ? 'e' : 'd';
                        if (typeof params.string === 'string') {
                            checksum += params.string;
                        }
                    }
                }
            }
            // build the resulting data
            params.source = id;
            checksum += id;
            params.values = values;
            if (currentData !== undefined) {
                params.action = stillNotEmpty ? (changed ? ContentManager.UPDATE : ContentManager.NONE) : ContentManager.DELETE;
            } else {
                params.action = stillNotEmpty ? ContentManager.INSERT : ContentManager.NONE;
            }
            checksum += params.action;
            params.checksum = Utilities.md5(checksum);
            onSuccess(params);
        }, onError);
    };

    ContentManager.prototype.getModificationParams = function (id, language, value, onSuccess, onError) {
        const that = this;
        this._getSqlAdapter(adapter => {
            that._getModificationParams(adapter, id, language, value, params => {
                if (!params.error && params.action === ContentManager.DELETE) {
                    that._getReferencesFrom(adapter, id, referencesFrom => {
                        if (referencesFrom.length > 0) {
                            params.externalUsers = referencesFrom;
                        }
                        adapter.close();
                        onSuccess(params);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                } else {
                    adapter.close();
                    onSuccess(params);
                }
            }, err => {
                adapter.close();
                onError(err);
            });
        }, onError);
    };

    ContentManager.prototype.setObject = function (id, language, value, checksum, onSuccess, onError) {
        const that = this, match = this._key_regex.exec(id);
        if (!match) {
            onError('Invalid id: ' + id);
            return;
        }
        const table = this._tablesForExt[match[2]];
        const valcol = this._valColsForExt[match[2]];
        if (!table) {
            onError('Invalid table: ' + id);
            return;
        }
        const key = match[1];
        this._getSqlAdapter(adapter => {
            const main = [];
            main.parallel = false;
            main.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
            main.push((onSuc, onErr) => {
                that._getModificationParams(adapter, id, language, value, params => {
                    if (params.error !== undefined) {
                        onErr(params.error);
                    } else if (params.checksum !== checksum) {
                        onErr('Database content has changed! Try again!');
                    } else if (params.action === ContentManager.NONE) {
                        onErr('No action to perform!');
                    } else if (params.action === ContentManager.INSERT) {
                        adapter.addValue(`${table.name}.${table.key_column}`, SqlHelper.escape(key));
                        if (typeof valcol === 'string') {
                            const value = params.values[valcol];
                            if (value.changed) {
                                adapter.addValue(`${table.name}.${valcol}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                            }
                        } else {
                            for (const attr in valcol) {
                                if (valcol.hasOwnProperty(attr)) {
                                    // value = i_params.values[valcol[attr]];
                                    const value = params.values[attr];
                                    if (value.changed) {
                                        adapter.addValue(`${table.name}.${valcol[attr]}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                    }
                                }
                            }
                        }
                        adapter.performInsert(table.name, onSuc, onErr);
                    } else if (params.action === ContentManager.UPDATE) {
                        if (typeof valcol === 'string') {
                            const value = params.values[valcol];
                            if (value.changed) {
                                adapter.addValue(`${table.name}.${valcol}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                            }
                        } else {
                            for (const attr in valcol) {
                                if (valcol.hasOwnProperty(attr)) {
                                    const value = params.values[attr];
                                    if (value.changed) {
                                        adapter.addValue(`${table.name}.${valcol[attr]}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                    }
                                }
                            }
                        }
                        adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(key)}`);
                        adapter.performUpdate(table.name, undefined, 1, onSuc, onErr);
                    } else if (params.action === ContentManager.DELETE) {
                        adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(key)}`);
                        adapter.performDelete(table.name, undefined, 1, onSuc, onErr);
                    } else {
                        onErr(`Unexpected action: '${params.action}'`);
                    }
                }, onErr);
            });
            Executor.run(main, () => {
                adapter.commitTransaction(() => {
                    adapter.close();
                    onSuccess();
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, err => {
                adapter.rollbackTransaction(() => {
                    adapter.close();
                    onError(err);
                }, ee => {
                    adapter.close();
                    onError(ee);
                });
            });
        }, onError);
    };

    ContentManager.prototype._getRefactoringParams = function (adapter, source, target, action, onSuccess, onError) {
        // here we store the result
        const params = {}, key_regex = this._key_regex;
        // check action
        if (action !== ContentManager.COPY && action !== ContentManager.MOVE && action !== ContentManager.DELETE) {
            params.error = 'Invalid action';
            onSuccess(params);
            return;
        }
        params.action = action;
        let checksum = action;
        // check source
        if (typeof source === 'string' && source.length > 0) {
            params.source = source;
            checksum += source;
        } else {
            params.error = 'Missing source';
            onSuccess(params);
            return;
        }
        // check target - but only if required
        if (action === ContentManager.COPY || action === ContentManager.MOVE) {
            if (typeof target === 'string' && target.length > 0) {
                params.target = target;
                checksum += target;
            } else {
                params.error = 'Missing target';
                onSuccess(params);
                return;
            }
        }
        // check source identifier
        let srcTab = false, srcTabKey, sourceIsFolder;
        let match = key_regex.exec(source);
        if (match) {
            srcTab = this._tablesForExt[match[2]];
            if (!srcTab) {
                params.error = `Invalid source table: '${source}'`;
                onSuccess(params);
                return;
            }
            sourceIsFolder = false;
            srcTabKey = match[1];
        } else {
            match = FOLDER_REGEX.exec(source);
            sourceIsFolder = !!match;
            if (!sourceIsFolder) {
                params.error = `Invalid source folder: '${source}'`;
                onSuccess(params);
                return;
            }
            srcTabKey = match[1];
        }
        checksum += sourceIsFolder ? "sf" : "so";
        let tgtTab = false, tgtTabKey, targetIsFolder;
        // check target identifier
        if (typeof target === 'string') {
            match = key_regex.exec(target);
            if (match) {
                tgtTab = this._tablesForExt[match[2]];
                if (!tgtTab) {
                    params.error = `Invalid target table: '${target}'`;
                    onSuccess(params);
                    return;
                }
                targetIsFolder = false;
                tgtTabKey = match[1];
            } else {
                match = FOLDER_REGEX.exec(target);
                targetIsFolder = !!match;
                if (!targetIsFolder) {
                    params.error = `Invalid target folder: '${target}'`;
                    onSuccess(params);
                    return;
                }
                tgtTabKey = match[1];
            }
            checksum += targetIsFolder ? "tf" : "to";
            // check source to target conditions
            if (sourceIsFolder) {
                if (!targetIsFolder) {
                    params.error = 'Target is not a folder';
                    onSuccess(params);
                    return;
                }
            } else {
                if (targetIsFolder) {
                    params.error = 'Target is not a single object';
                    onSuccess(params);
                    return;
                }
                if (tgtTab === false) {
                    params.error = 'Unknown target table';
                    onSuccess(params);
                    return;
                }
                if (srcTab !== tgtTab) {
                    params.error = 'Different source and target table';
                    onSuccess(params);
                    return;
                }
            }
        }
        params.folder = sourceIsFolder;
        const that = this, srcKeysArr = [], srcKeysObj = {}, tgtExObj = {}, extRefObjs = {}, main = [];
        main.parallel = false;
        main.push((onSuc, onErr) => {
            // within the following loop we collect all source paths
            if (sourceIsFolder) {
                const tasks = [];
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const table = that._tablesForExt[attr];
                            tasks.push((os, oe) => {
                                adapter.addColumn(`${table.name}.${table.key_column} AS path`);
                                // select all paths within the range
                                adapter.addWhere(`LOCATE(${SqlHelper.escape(srcTabKey)},${table.name}.${table.key_column}) = 1`);
                                adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                                    for (let i = 0, l = result.length; i < l; i++) {
                                        srcKeysObj['$' + result[i].path + '.' + table.extension] = true;
                                    }
                                    os();
                                }, oe);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, onSuc, onErr);
            }
            else {
                srcKeysObj[source] = true;
                onSuc();
            }
        });
        main.push((onSuc, onErr) => {
            for (const key in srcKeysObj) {
                if (srcKeysObj.hasOwnProperty(key)) {
                    srcKeysArr.push(key);
                }
            }
            const srcLen = srcKeysArr.length;
            if (srcLen === 0) {
                params.error = 'No data available';
                onSuccess(params);
                return;
            }
            srcKeysArr.sort(compare_keys);
            for (let i = 0; i < srcLen; i++) {
                checksum += srcKeysArr[i];
            }
            // if we got a target
            const objects = {}, tasks = [];
            if (typeof target === 'string') {
                if (sourceIsFolder) {
                    // in the next loop we build the resulting target paths
                    for (let i = 0; i < srcLen; i++) {
                        const src = srcKeysArr[i];
                        const match = key_regex.exec(src);
                        const table = that._tablesForExt[match[2]];
                        const tgt = target + src.substring(source.length);
                        objects[src] = tgt;
                        checksum += tgt;
                    }
                } else {
                    objects[source] = target;
                    checksum += target;
                }
                // check if any source is matching any target
                for (let i = 0; i < srcLen; i++) {
                    const src = srcKeysArr[i];
                    const tgt = objects[src];
                    if (objects[tgt] !== undefined) {
                        params.error = 'Found at least one target equal to source: "' + tgt + '"';
                        onSuccess(params);
                        return;
                    }
                }
                // check if any target already exists
                for (let i = 0; i < srcLen; i++) {
                    (function () {
                        const tgt = objects[srcKeysArr[i]];
                        const match = key_regex.exec(tgt);
                        const table = that._tablesForExt[match[2]];
                        const tabKeyEsc = SqlHelper.escape(match[1]);
                        tasks.push((os, or) => {
                            adapter.addColumn('COUNT(*) AS cnt');
                            adapter.addWhere(`${table.name}.${table.key_column} = ${tabKeyEsc}`);
                            adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                                if (result[0].cnt > 0) {
                                    tgtExObj[tgt] = true;
                                }
                                os();
                            }, or);
                        });
                    }());
                }
            } else { // no target
                if (sourceIsFolder) {
                    // in the next loop we build the resulting target paths
                    for (let i = 0; i < srcLen; i++) {
                        objects[srcKeysArr[i]] = null;
                    }
                } else {
                    objects[source] = null;
                }
            }
            params.objects = objects;
            tasks.parallel = that._parallel;
            Executor.run(tasks, onSuc, onErr);
        });
        main.push(function (onSuc, onErr) {
            const tgtExArr = [];
            for (const attr in tgtExObj) {
                if (tgtExObj.hasOwnProperty(attr)) {
                    tgtExArr.push(attr);
                }
            }
            if (tgtExArr.length > 0) {
                tgtExArr.sort(compare_keys);
                const existingTargets = {};
                const l = tgtExArr.length;
                for (let i = 0; i < l; i++) {
                    checksum += tgtExArr[i];
                    existingTargets[tgtExArr[i]] = true;
                }
                params.existingTargets = existingTargets;
            }
            // check for all external users
            const tasks = [];
            if (action === ContentManager.MOVE || action === ContentManager.DELETE) {
                const l = srcKeysArr.length;
                for (let i = 0; i < l; i++) {
                    (function () {
                        const source = srcKeysArr[i];
                        tasks.push((os, or) => {
                            that._getReferencesFrom(adapter, source, referencesFrom => {
                                const reflen = referencesFrom.length;
                                for (let r = 0; r < reflen; r++) {
                                    const key = referencesFrom[r];
                                    if (srcKeysObj[key] === undefined) {
                                        extRefObjs[key] = true;
                                    }
                                }
                                os();
                            }, or);
                        });
                    }());
                }
            }
            tasks.parallel = that._parallel;
            Executor.run(tasks, onSuc, onErr);
        });
        Executor.run(main, () => {
            const extRefsArray = [];
            for (const attr in extRefObjs) {
                if (extRefObjs.hasOwnProperty(attr)) {
                    extRefsArray.push(attr);
                }
            }
            if (extRefsArray.length > 0) {
                extRefsArray.sort(compare_keys);
                params.referencesFromOthers = extRefsArray;
                const l = extRefsArray.length;
                for (let i = 0; i < l; i++) {
                    checksum += extRefsArray[i];
                }
            }
            params.checksum = Utilities.md5(checksum);
            onSuccess(params);
        }, onError);
    };

    ContentManager.prototype.getRefactoringParams = function (source, target, action, onSuccess, onError) {
        const that = this;
        this._getSqlAdapter(adapter => {
            that._getRefactoringParams(adapter, source, target, action, params => {
                adapter.close();
                onSuccess(params);
            }, err => {
                adapter.close();
                onError(err);
            });
        }, onError);
    };

    ContentManager.prototype.performRefactoring = function (source, target, action, checksum, onSuccess, onError) {
        const that = this;
        this._getSqlAdapter(adapter => {
            const main = [];
            // the main action has to be processed in a sequence wo we do not run
            // in
            // parallel
            main.parallel = false;
            // we run this as a transaction wo enable rollbacks (just in case
            // something unexpected happens)
            main.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
            main.push((onSuc, onErr) => {
                that._getRefactoringParams(adapter, source, target, action, params => {
                    if (params.error !== undefined) {
                        onErr(params.error);
                    } else if (params.checksum !== checksum) {
                        onErr('Database content has changed! Try again!');
                    } else {
                        // for all sources of the parameters
                        const tasks = [], objects = params.objects;
                        tasks.parallel = false;
                        let replace = false;
                        if (params.action === ContentManager.MOVE || params.action === ContentManager.COPY) {
                            // in move- or copy-mode we got to perform key-string
                            // replacements
                            const expr = params.folder ? Regex.escape(params.source) + that._refactoring_match : Regex.escape(params.source) + '\\b';
                            const rx = new RegExp(expr, 'g'), rp = params.folder ? params.target + '$1' : params.target;
                            replace = string => string.replace(rx, rp);
                            for (const attr in objects) {
                                if (objects.hasOwnProperty(attr)) {
                                    (function () {
                                        const src = attr;
                                        tasks.push((os, oe) => that._performRefactoring(adapter, src, params, replace, os, oe));
                                    }());
                                }
                            }
                        } else if (params.action === ContentManager.DELETE) {
                            if (params.folder) {
                                const match = FOLDER_REGEX.exec(params.source), srcTabKey = SqlHelper.escape(match[1]);
                                for (const attr in that._tablesForExt) {
                                    if (that._tablesForExt.hasOwnProperty(attr)) {
                                        (function () {
                                            const table = that._tablesForExt[attr];
                                            tasks.push((os, oe) => {
                                                adapter.addWhere(`LOCATE(${srcTabKey},${table.name}.${table.key_column}) = 1`);
                                                adapter.performDelete(table.name, undefined, undefined, os, oe);
                                            });
                                        }());
                                    }
                                }
                            } else {
                                const key_regex = that._key_regex, match = key_regex.exec(source);
                                const table = that._tablesForExt[match[2]], srcTabKey = SqlHelper.escape(match[1]);
                                tasks.push((os, oe) => {
                                    adapter.addWhere(`${table.name}.${table.key_column} = ${srcTabKey}`);
                                    adapter.performDelete(table.name, undefined, 1, os, oe);
                                });
                            }
                        }
                        Executor.run(tasks, onSuc, onErr);
                    }
                }, onErr);
            });
            Executor.run(main, () => {
                adapter.commitTransaction(() => {
                    adapter.close();
                    onSuccess();
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, err => {
                adapter.rollbackTransaction(() => {
                    adapter.close();
                    onError(err);
                }, er => {
                    adapter.close();
                    onError(er);
                });
            });
        }, onError);
    };

    ContentManager.prototype._performRefactoring = function (adapter, source, params, getReplacement, onSuccess, onError) {
        const that = this, key_regex = this._key_regex;
        const match = key_regex.exec(source);
        const table = this._tablesForExt[match[2]];
        const valcol = this._valColsForExt[match[2]];
        const srcTabKey = match[1];
        const main = [];
        main.parallel = false;
        if (params.action === ContentManager.MOVE || params.action === ContentManager.COPY) {
            main.push((onSuc, onErr) => {
                // get the target and check if already exists
                const target = params.objects[source];
                const targetAlreadyExists = params.existingTargets && params.existingTargets[target] === true;
                if (typeof valcol === 'string') {
                    adapter.addColumn(`${table.name}.${valcol}`);
                } else {
                    for (const attr in valcol) {
                        if (valcol.hasOwnProperty(attr)) {
                            adapter.addColumn(`${table.name}.${valcol[attr]}`);
                        }
                    }
                }
                adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(srcTabKey)}`);
                adapter.performSelect(table.name, undefined, undefined, 1, results => {
                    const values = results[0];
                    // replace internal cross references and prepare database
                    // update or insert value
                    if (typeof valcol === 'string') {
                        let string = values[valcol];
                        if (typeof string === 'string' && string.length > 0) {
                            string = getReplacement(string);
                            adapter.addValue(`${table.name}.${valcol}`, SqlHelper.escape(string));
                        }
                    } else {
                        for (const attr in valcol) {
                            if (valcol.hasOwnProperty(attr)) {
                                let string = values[valcol[attr]];
                                if (typeof string === 'string' && string.length > 0) {
                                    string = getReplacement(string);
                                    adapter.addValue(`${table.name}.${valcol[attr]}`, SqlHelper.escape(string));
                                }
                            }
                        }
                    }
                    const match = key_regex.exec(target);
                    const tgtTabKey = match[1];
                    function success() {
                        if (targetAlreadyExists && params.action === ContentManager.MOVE) {
                            adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(srcTabKey)}`);
                            adapter.performDelete(table.name, undefined, 1, onSuc, onErr);
                        } else {
                            onSuc();
                        }
                    };
                    if (targetAlreadyExists) {
                        adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(tgtTabKey)}`);
                        adapter.performUpdate(table.name, undefined, 1, success, onErr);
                    } else {
                        adapter.addValue(`${table.name}.${table.key_column}`, SqlHelper.escape(tgtTabKey));
                        if (params.action === ContentManager.MOVE) {
                            adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(srcTabKey)}`);
                            adapter.performUpdate(table.name, undefined, 1, success, onErr);
                        } else {
                            adapter.performInsert(table.name, success, onErr);
                        }
                    }
                }, onErr);
            });
        }
        if (params.action === ContentManager.MOVE) {
            main.push((onSuc, onErr) => {
                // In move mode we got to update all external users with the
                // moved reference
                that._getReferencesFrom(adapter, source, referencesFrom => {
                    const tasks = [], jl = referencesFrom.length;
                    tasks.parallel = false;
                    for (let j = 0; j < jl; j++) {
                        const refFrom = referencesFrom[j];
                        if (params.objects[refFrom] === undefined) {
                            (function () {
                                const match = key_regex.exec(refFrom);
                                const table = that._tablesForExt[match[2]];
                                const valcol = that._valColsForExt[match[2]];
                                const usrKey = match[1];
                                tasks.push((os, oe) => {
                                    if (typeof valcol === 'string') {
                                        adapter.addColumn(`${table.name}.${valcol} AS ${valcol}`);
                                    } else {
                                        for (const attr in valcol) {
                                            if (valcol.hasOwnProperty(attr)) {
                                                adapter.addColumn(`${table.name}.${valcol[attr]} AS ${valcol[attr]}`);
                                            }
                                        }
                                    }
                                    adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(usrKey)}`);
                                    adapter.performSelect(table.name, undefined, undefined, 1, result => {
                                        // replace in all existing value strings all occurrences
                                        // of
                                        // any source path with the resulting target path and
                                        // update object
                                        const values = result[0];
                                        if (typeof valcol === 'string') {
                                            const string = values[valcol];
                                            if (typeof string === 'string' && string.length > 0) {
                                                string = getReplacement(string);
                                                adapter.addValue(`${table.name}.${valcol}`, SqlHelper.escape(string));
                                            }
                                        } else {
                                            for (const attr in valcol) {
                                                if (valcol.hasOwnProperty(attr)) {
                                                    const string = values[valcol[attr]];
                                                    if (typeof string === 'string' && string.length > 0) {
                                                        string = getReplacement(string);
                                                        adapter.addValue(`${table.name}.${valcol[attr]}`, SqlHelper.escape(string));
                                                    }
                                                }
                                            }
                                        }
                                        adapter.addWhere(`${table.name}.${table.key_column} = ${SqlHelper.escape(usrKey)}`);
                                        adapter.performUpdate(table.name, undefined, 1, os, oe);
                                    }, oe);
                                });
                            }());
                        }
                    }
                    Executor.run(tasks, onSuc, onErr);
                }, onErr);
            });
        }
        Executor.run(main, onSuccess, onError);
    };

    ContentManager.prototype.getReferencesTo = function (id, onSuccess, onError) {
        const match = this._key_regex.exec(id);
        if (match) {
            const user = this._tablesForExt[match[2]];
            const valcol = this._valColsForExt[match[2]];
            if (!user) {
                onError(`Invalid table: '${id}'`);
                return;
            }
            const that = this;
            this._getSqlAdapter(adapter => {
                const key = SqlHelper.escape(match[1]);
                const keys = {};
                const tasks = [];
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const used = that._tablesForExt[attr];
                            tasks.push((onSuc, onErr) => {
                                adapter.addColumn(`tab.${used.key_column} AS path`);
                                adapter.addWhere(`${user.name}.${user.key_column} = ${key}`);
                                adapter.addJoin(formatReferencesToCondition(user.name, valcol, used.name, 'tab', used.extension, used.key_column));
                                adapter.performSelect(user.name, undefined, undefined, undefined, result => {
                                    for (let i = 0, l = result.length; i < l; i++) {
                                        keys[`$${result[i].path}.${used.extension}`] = true;
                                    }
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, () => {
                    const array = [];
                    for (const key in keys) {
                        if (keys.hasOwnProperty(key)) {
                            array.push(key);
                        }
                    }
                    adapter.close();
                    onSuccess(array);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        }
        else {
            // if invalid key we simply found no reference
            onSuccess([]);
        }
    };

    ContentManager.prototype.getReferencesToCount = function (id, onSuccess, onError) {
        const match = this._key_regex.exec(id);
        if (match) {
            const user = this._tablesForExt[match[2]];
            const valcol = this._valColsForExt[match[2]];
            if (!user) {
                onError('Invalid table: ' + id);
                return;
            }
            const that = this;
            this._getSqlAdapter(adapter => {
                const key = SqlHelper.escape(match[1]);
                const tasks = [];
                let result = 0;
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const used = that._tablesForExt[attr];
                            tasks.push(function (onSuc, onErr) {
                                adapter.addColumn('COUNT(*) AS cnt');
                                adapter.addWhere(`${user.name}.${user.key_column} = ${key}`);
                                adapter.addJoin(formatReferencesToCondition(user.name, valcol, used.name, 'tab', used.extension, used.key_column));
                                adapter.performSelect(user.name, undefined, undefined, undefined, result => {
                                    result += result[0].cnt;
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, () => {
                    adapter.close();
                    onSuccess(result);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        } else {
            // if invalid key we simply found no reference
            onSuccess(0);
        }
    };

    ContentManager.prototype._getReferencesFrom = function (adapter, id, onSuccess, onError) {
        const that = this, key = SqlHelper.escape(id), keys = {}, tasks = [];
        for (const attr in this._tablesForExt) {
            if (this._tablesForExt.hasOwnProperty(attr)) {
                (function () {
                    const table = that._tablesForExt[attr];
                    const valcol = that._valColsForExt[attr];
                    tasks.push((onSuc, onErr) => {
                        adapter.addColumn(`${table.name}.${table.key_column} AS path`);
                        if (typeof valcol === 'string') {
                            adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${valcol}`), false);
                        } else {
                            for (const col in valcol) {
                                if (valcol.hasOwnProperty(col)) {
                                    adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${valcol[col]}`), false);
                                }
                            }
                        }
                        adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                            for (let i = 0, l = result.length; i < l; i++) {
                                keys[`$${result[i].path}.${table.extension}`] = true;
                            }
                            onSuc();
                        }, onErr);
                    });
                }());
            }
        }
        tasks.parallel = that._parallel;
        Executor.run(tasks, () => {
            const array = [];
            for (const key in keys) {
                if (keys.hasOwnProperty(key)) {
                    array.push(key);
                }
            }
            onSuccess(array);
        }, onError);
    };

    ContentManager.prototype.getReferencesFrom = function (id, onSuccess, onError) {
        if (this._key_regex.test(id)) {
            const that = this;
            this._getSqlAdapter(adapter => {
                that._getReferencesFrom(adapter, id, results => {
                    adapter.close();
                    onSuccess(results);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        } else {
            // if invalid key we simply found no reference
            onSuccess([]);
        }
    };

    ContentManager.prototype.getReferencesFromCount = function (id, onSuccess, onError) {
        if (this._key_regex.test(id)) {
            const that = this;
            this._getSqlAdapter(adapter => {
                const key = SqlHelper.escape(id);
                let result = 0;
                const tasks = [];
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const table = that._tablesForExt[attr];
                            const valcol = that._valColsForExt[attr];
                            tasks.push((onSuc, onErr) => {
                                adapter.addColumn('COUNT(*) AS cnt');
                                if (typeof valcol === 'string') {
                                    adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${valcol}`), false);
                                } else {
                                    for (const col in valcol) {
                                        if (valcol.hasOwnProperty(col)) {
                                            adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${valcol[col]}`), false);
                                        }
                                    }
                                }
                                adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                                    result += result[0].cnt;
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, () => {
                    adapter.close();
                    onSuccess(result);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        } else {
            // if invalid key we simply found no reference
            onSuccess(0);
        }
    };

    ContentManager.prototype.getTreeChildNodes = function (id, onSuccess, onError) {
        const match = FOLDER_REGEX.exec(id);
        if (match) {
            const that = this, key = match[1];
            this._getSqlAdapter(adapter => {
                const tasks = [], nodes = [];
                function compareRawNodes(node1, node2) {
                    return that.compare(node1.path, node2.path);
                };
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const table = that._tablesForExt[attr];
                            tasks.push((onSuc, onErr) => {
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
                                adapter.getChildNodes(table.name, table.key_column, '/', key, children => {
                                    const l = children.length;
                                    for (let i = 0; i < l; i++) {
                                        const node = children[i];
                                        // build the full node path - and in case of a file add
                                        // the extension
                                        let path = `$${node.path}`;
                                        if (!node.folder) {
                                            path += `.${table.extension}`;
                                        }
                                        node.path = path;
                                        const idx = Sorting.getInsertionIndex(node, nodes, true, compareRawNodes);
                                        if (idx >= 0) {
                                            if (!node.folder) {
                                                node.extension = table.extension;
                                            }
                                            nodes.splice(idx, 0, node);
                                        }
                                    }
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, () => {
                    adapter.close();
                    onSuccess(nodes);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        } else if (this._key_regex.test(id)) {
            onSuccess([]);
        } else {
            onError(`Invalid key: '${id}'`);
        }
    };

    ContentManager.prototype.getSearchResults = function (searchKey, searchValue, onSuccess, onError) {
        if (searchKey.length > 0 || searchValue.length > 0) {
            const that = this;
            this._getSqlAdapter(adapter => {
                const results = [], tasks = [], key = SqlHelper.escape(searchKey), value = SqlHelper.escape(searchValue);
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const table = that._tablesForExt[attr];
                            const valcol = that._valColsForExt[attr];
                            tasks.push((onSuc, onErr) => {
                                adapter.addColumn(`${table.name}.${table.key_column} AS path`);
                                let where = '';
                                if (searchKey.length > 0) {
                                    where += `LOCATE(${SqlHelper.escape(searchKey)}, ${table.name}.${table.key_column}) > 0`;
                                    if (searchValue.length > 0) {
                                        where += ' AND ';
                                    }
                                }
                                if (searchValue.length > 0) {
                                    if (typeof valcol === 'string') {
                                        where += `LOCATE(${value}, ${table.name}.${valcol}) > 0`;
                                    } else {
                                        where += '(';
                                        let next = false;
                                        for (const val in valcol) {
                                            if (valcol.hasOwnProperty(val)) {
                                                if (next) {
                                                    where += ' OR ';
                                                }
                                                next = true;
                                                where += `LOCATE(${value}, ${table.name}.${valcol[val]}) > 0`;
                                            }
                                        }
                                        where += ')';
                                    }
                                }
                                adapter.addWhere(where);
                                adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                                    const l = result.length;
                                    for (let i = 0; i < l; i++) {
                                        results.push(`$${result[i].path}.${table.extension}`);
                                    }
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, () => {
                    adapter.close();
                    onSuccess(results);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        }
    };

    ContentManager.prototype.getIdKeyValues = function (id, onSuccess, onError) {
        const that = this, data = this.analyzeID(id);
        if (data.file || data.folder) {
            this._getSqlAdapter(adapter => {
                const results = [], tasks = [], path = SqlHelper.escape(data.path);
                for (const attr in that._tablesForExt) {
                    if (that._tablesForExt.hasOwnProperty(attr)) {
                        (function () {
                            const table = that._tablesForExt[attr];
                            // TODO: remove or reuse const valcol = that._valColsForExt[attr];
                            tasks.push((onSuc, onErr) => {
                                adapter.addColumn(`${table.name}.${table.key_column} AS path`);
                                adapter.addWhere(`LOCATE(${path},${table.name}.${table.key_column}) = 1`);
                                adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                                    const l = result.length;
                                    for (let i = 0; i < l; i++) {
                                        results.push('$' + result[i].path + '.' + table.extension);
                                    }
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                }
                tasks.parallel = that._parallel;
                Executor.run(tasks, () => {
                    adapter.close();
                    onSuccess(results);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        } else {
            onError(`Invalid selection: '${data.string}'`);
        }
    };

    ContentManager.prototype.getIdSelectedValues = function (id, language, onSuccess, onError) {
        const match = this._key_regex.exec(id);
        if (!match) {
            onError(`Invalid id: '${id}'`);
            return;
        }
        const table = this._tablesForExt[match[2]];
        const valcol = this._valColsForExt[match[2]];
        if (!table) {
            onError(`Invalid table: '${id}'`);
            return;
        }
        const that = this;
        this._getSqlAdapter(adapter => {
            adapter.addColumn(`${table.name}.${table.key_column} AS path`);
            adapter.addColumn((typeof valcol === 'string' ? valcol : valcol[language]) + ' AS val');
            adapter.performSelect(table.name, undefined, 'path ASC', undefined, result => {
                const array = [], l = result.length;
                for (let i = 0; i < l; i++) {
                    array.push([`${result[i].path}.${table.extension}`, result[i].val]);
                }
                adapter.close();
                onSuccess(array);
            }, err => {
                adapter.close();
                onError(err);
            });
        }, onError);
    };

    ContentManager.prototype.handleRequest = function (request, onSuccess, onError) {
        switch (request.command) {
            case COMMAND_GET_CONFIG:
                const tables = this._config.tables.map(table => {
                    const tab = {
                        extension: table.extension,
                        icon: table.icon,
                        JsonFX: table.JsonFX === true,
                        multiedit: table.multiedit === true,
                    };
                    if (table.value_column) {
                        tab.value_column = table.value_column;
                        tab.multilingual = false;
                    } else {
                        tab.value_column_prefix = table.value_column_prefix;
                        tab.multilingual = true;
                    }
                    return tab;
                });
                onSuccess({
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
                this.exists(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_CHECKSUM:
                this.getChecksum(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_OBJECT:
                this.getObject(request.id, request.language, request.mode, onSuccess, onError);
                break;
            case COMMAND_GET_MODIFICATION_PARAMS:
                this.getModificationParams(request.id, request.language, request.value, onSuccess, onError);
                break;
            case COMMAND_SET_OBJECT:
                this.setObject(request.id, request.language, request.value, request.checksum, onSuccess, onError);
                break;
            case COMMAND_GET_REFACTORING_PARAMS:
                this.getRefactoringParams(request.source, request.target, request.action, onSuccess, onError);
                break;
            case COMMAND_PERFORM_REFACTORING:
                this.performRefactoring(request.source, request.target, request.action, request.checksum, onSuccess, onError);
                break;
            case COMMAND_GET_REFERENCES_TO:
                this.getReferencesTo(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_REFERENCES_TO_COUNT:
                this.getReferencesToCount(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_REFERENCES_FROM:
                this.getReferencesFrom(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_REFERENCES_FROM_COUNT:
                this.getReferencesFromCount(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_TREE_CHILD_NODES:
                this.getTreeChildNodes(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_SEARCH_RESULTS:
                this.getSearchResults(request.key, request.value, onSuccess, onError);
                break;
            case COMMAND_GET_ID_KEY_VALUES:
                this.getIdKeyValues(request.id, onSuccess, onError);
                break;
            case COMMAND_GET_ID_SELECTED_VALUES:
                this.getIdSelectedValues(request.id, request.language, onSuccess, onError);
                break;
            default:
                onError(`EXCEPTION! Unexpected command: '${request.command}'`);
                break;
        }
    };

    ContentManager.prototype.handleFancyTreeRequest = function (request, identifier, onSuccess, onError) {
        const that = this, id = typeof identifier === 'string' && identifier.length > 0 ? identifier : '$';
        switch (request) {
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
                this.getTreeChildNodes(id, nodes => {
                    // transform to fance-tree node style
                    const ns = [], l = nodes.length;
                    for (let i = 0; i < l; i++) {
                        const node = nodes[i];
                        ns.push({
                            title: node.folder ? node.name : (`${node.name}.${node.extension}`),
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
                    onSuccess(ns);
                }, onError);
                break;
            case ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES:
                this.getReferencesTo(id, results => {
                    // transform to fance-tree node style
                    const nodes = [], l = results.length, tasks = [];
                    for (let i = 0; i < l; i++) {
                        (function () {
                            const key = results[i];
                            const node = {
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
                            tasks.push((onSuc, onErr) => {
                                that.getReferencesToCount(key, count => {
                                    const folder = count > 0;
                                    node.folder = folder;
                                    node.lazy = folder;
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                    tasks.parallel = true;
                    Executor.run(tasks, () => onSuccess(nodes), onError);
                }, onError);
                break;
            case ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES:
                this.getReferencesFrom(id, results => {
                    // transform to fance-tree node style
                    const nodes = [], l = results.length, tasks = [];
                    for (let i = 0; i < l; i++) {
                        (function () {
                            const key = results[i];
                            const node = {
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
                            tasks.push((onSuc, onErr) => {
                                that.getReferencesFromCount(key, count => {
                                    const folder = count > 0;
                                    node.folder = folder;
                                    node.lazy = folder;
                                    onSuc();
                                }, onErr);
                            });
                        }());
                    }
                    tasks.parallel = true;
                    Executor.run(tasks, () => onSuccess(nodes), onError);
                }, onError);
                break;
            default:
                onSuccess([]);
                break;
        }
    };

    // Note: this next is a template method - copy when new request has to be implemented
    ContentManager.prototype._$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$ = function (onSuccess, onError) {
        const that = this;
        this._getSqlAdapter(adapter => {
            const main = []
            main.parallel = false;
            main.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
            main.push(function (onSuc, onErr) {
                // add this as often as reqzured and implement actions
            });
            Executor.run(main, () => {
                adapter.commitTransaction(() => {
                    adapter.close();
                    onSuccess();
                }, (err) => {
                    adapter.close();
                    onError(err);
                });
            }, err => {
                adapter.rollbackTransaction(() => {
                    adapter.close();
                    onError(err);
                }, er => {
                    adapter.close();
                    onError(er);
                });
            });
        }, onError);
    };

    const ContentManagerProxy = function (onSuccess, onError) {
        const that = this;
        this._post({
            command: COMMAND_GET_CONFIG
        }, config => {
            that._config = config;
            that._key_regex = new RegExp(config.key_regex);
            that._exchange_header_regex = new RegExp(config.exchange_header_regex, 'g');
            const langs = config.languages.length;
            that._tablesForExt = {};
            that._valColsForExt = {};
            const tablen = config.tables.length;
            for (let i = 0; i < tablen; i++) {
                const table = config.tables[i];
                that._tablesForExt[table.extension] = table;
                let valcol = undefined;
                if (table.value_column_prefix) {
                    valcol = {};
                    for (let j = 0; j < langs; j++) {
                        const lang = config.languages[j];
                        valcol[lang] = table.value_column_prefix + lang;
                    }
                } else {
                    valcol = table.value_column;
                }
                that._valColsForExt[table.extension] = valcol;
            }
            if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }, onError);
    };

    ContentManagerProxy.prototype = Object.create(ContentManagerBase.prototype);
    ContentManagerProxy.prototype.constructor = ContentManagerProxy;

    // prototype
    ContentManagerProxy.prototype._post = function (request, onSuccess, onError) {
        Client.fetch(ContentManager.GET_CONTENT_DATA_URL, JsonFX.stringify(request, false), response => {
            if (response.length > 0) {
                try {
                    onSuccess(JsonFX.parse(response, false, false));
                } catch (error) {
                    onError(error);
                }
            } else {
                onSuccess();
            }
        }, onError);
    };

    ContentManagerProxy.prototype.exists = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_EXISTS, id }, onSuccess, onError);
    }

    ContentManagerProxy.prototype.getChecksum = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_CHECKSUM, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getObject = function (id, language, mode, onSuccess, onError) {
        const that = this, parse = mode === ContentManager.PARSE;
        this._post({
            command: COMMAND_GET_OBJECT,
            id,
            language,
            mode: parse ? ContentManager.INCLUDE : mode
        }, parse ? response => {
            if (response !== undefined) {
                try {
                    let object = JsonFX.reconstruct(response);
                    if (that._config !== undefined && that._config.jsonfx_pretty === true) {
                        // the 'jsonfx_pretty' flag may be used to format our dynamically
                        // parsed JavaScript sources for more easy debugging purpose
                        // TODO: reuse or remove const match = that._key_regex.exec(id);
                        // TOOD: response = eval('(' + JsonFX.stringify(response, true) + ')\n//# sourceURL=' + match[1] + '.js');
                        object = eval('(' + JsonFX.stringify(object, true) + ')');
                    }
                    onSuccess(object);
                } catch (exc) {
                    onError(exc);
                }
            } else {
                onSuccess();
            }
        } : onSuccess, onError);
    };

    ContentManagerProxy.prototype.getModificationParams = function (id, language, value, onSuccess, onError) {
        this._post({ command: COMMAND_GET_MODIFICATION_PARAMS, id, language, value }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.setObject = function (id, language, value, checksum, onSuccess, onError) {
        this._post({ command: COMMAND_SET_OBJECT, id, language, value, checksum }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getRefactoringParams = function (source, target, action, onSuccess, onError) {
        this._post({ command: COMMAND_GET_REFACTORING_PARAMS, source, target, action }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.performRefactoring = function (source, target, action, checksum, onSuccess, onError) {
        this._post({ command: COMMAND_PERFORM_REFACTORING, source, target, action, checksum }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getReferencesTo = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_REFERENCES_TO, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getReferencesToCount = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_REFERENCES_TO_COUNT, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getReferencesFrom = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_REFERENCES_FROM, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getReferencesFromCount = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_REFERENCES_FROM_COUNT, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getTreeChildNodes = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_TREE_CHILD_NODES, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getSearchResults = function (key, value, onSuccess, onError) {
        this._post({ command: COMMAND_GET_SEARCH_RESULTS, key, value }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getIdKeyValues = function (id, onSuccess, onError) {
        this._post({ command: COMMAND_GET_ID_KEY_VALUES, id }, onSuccess, onError);
    };

    ContentManagerProxy.prototype.getIdSelectedValues = function (id, language, onSuccess, onError) {
        this._post({ command: COMMAND_GET_ID_SELECTED_VALUES, id, language }, onSuccess, onError);
    };

    ContentManager.Proxy = ContentManagerProxy;

    function createChecksum(group, path) {
        return Utilities.md5(`l.6l8033988749895${path}2.7l828l828459045${group}3.l4l592653589793`);
    }

    function createHeader(group, path) {
        return `[{(${group}<>${createChecksum(group, path)})}]\n${path}\n`;
    }

    function formatProgressInPercent(state) {
        return `${Utilities.formatNumber(state * 100, 2)}%`;
    }

    const ExchangeHandler = function (cms) {
        this._cms = cms;
    };

    ExchangeHandler.prototype = Object.create(Object.prototype);
    ExchangeHandler.prototype.constructor = ExchangeHandler;

    // prototype
    ExchangeHandler.prototype._read_config_data = function (ids, path, languages, onProgressChanged, onError) {
        const exports = [createHeader(EXCHANGE_HEADER, path), '\n'];
        const cms = this._cms, tasks = [], len = ids.length;
        for (let i = 0; i < len; i++) {
            // closure
            (function () {
                let idx = i, id = ids[idx], data = cms.analyzeID(id);
                if (data.JsonFX) {
                    tasks.push((onSuc, onErr) => {
                        cms.getObject(id, undefined, ContentManager.RAW, object => {
                            exports.push(createHeader(data.extension, id));
                            exports.push(JsonFX.stringify(JsonFX.reconstruct(object), true));
                            exports.push('\n\n');
                            onProgressChanged(formatProgressInPercent(idx / len));
                            onSuc();
                        }, onErr);
                    });
                } else if (!data.multilingual) {
                    tasks.push((onSuc, onErr) => {
                        cms.getObject(id, undefined, ContentManager.RAW, object => {
                            exports.push(createHeader(data.extension, id));
                            exports.push(object);
                            exports.push('\n\n');
                            onProgressChanged(formatProgressInPercent(idx / len));
                            onSuc();
                        }, onErr);
                    });
                } else {
                    tasks.push((onSuc, onErr) => {
                        cms.getObject(id, undefined, ContentManager.RAW, results => {
                            exports.push(createHeader(data.extension, id));
                            for (let l = 0; l < languages.length; l++) {
                                const lang = languages[l];
                                exports.push(createHeader('language', `${id}:${lang}`));
                                const txt = results[lang];
                                if (txt != undefined && txt != null) {
                                    exports.push(typeof txt === 'string' ? txt : txt.toString());
                                }
                                exports.push('\n');
                            }
                            exports.push('\n');
                            onProgressChanged(formatProgressInPercent(idx / len));
                            onSuc();
                        }, onErr);
                    });
                }
            }());
        }
        tasks.parallel = false;
        Executor.run(tasks, () => {
            onProgressChanged();
            saveAs(new Blob(exports, { type: "text/plain;charset=utf-8" }), 'js_hmi_export.txt');
        }, onError);
    };
    ExchangeHandler.prototype._parse = function (text, results, onProgressChanged, onError) {
        // separate ids and data
        const cms = this._cms, elements = [];
        Regex.each(cms._exchange_header_regex, text, (start, end, match) => elements.push(match ? match : text.substring(start, end)));
        onProgressChanged(`loaded ${elements.length} elements`);
        let header = elements[0];
        if (!Array.isArray(header) || EXCHANGE_HEADER !== header[1] || createChecksum(header[1], header[3]) !== header[2]) {
            onError(`EXCEPTION! Invalid ${EXCHANGE_HEADER} header.`);
            return false;
        }
        // handle all found elements
        const filter = header[3];
        let idx = 1;
        while (idx < elements.length) {
            header = elements[idx++];
            if (Array.isArray(header)) {
                const path = header[3];
                if (createChecksum(header[1], path) === header[2]) {
                    const data = cms.analyzeID(path);
                    if (data.JsonFX) {
                        try {
                            data.value = JsonFX.parse(elements[idx++], true, true);
                        } catch (exc) {
                            onError(`EXCEPTION! Cannot evaluate object: ${exc}`);
                            return false;
                        }
                        results.push(data);
                    } else if (!data.multilingual) {
                        data.value = elements[idx++].trim();
                        results.push(data);
                    } else {
                        data.value = {};
                        while (idx < elements.length) {
                            header = elements[idx];
                            if (!Array.isArray(header) || header[1] !== 'language') {
                                break;
                            }
                            if (createChecksum(header[1], header[3]) !== header[2]) {
                                onError('EXCEPTION! Invalid language header!');
                                return false;
                            }
                            idx++
                            const txt = elements[idx++].trim();
                            if (txt.length > 0) {
                                data.value[header[3].substring(data.id.length + 1)] = txt;
                            }
                        }
                        results.push(data);
                    }
                } else {
                    onError(`EXCEPTION! Invalid: ${JSON.stringify(header)}`);
                    return false;
                }
            }
        }
        onProgressChanged(`parsed ${idx}/${elements.length} elements`);
        return filter;
    };
    ExchangeHandler.prototype._write_config_data = function (data, onProgressChanged, onError) {
        const cms = this._cms, tasks = [];
        for (let i = 0, len = data.length; i < len; i++) {
            // closure
            (function () {
                const idx = i, d = data[idx];
                if (d.JsonFX) {
                    tasks.push((onSuc, onErr) => {
                        const val = d.value !== undefined && d.value !== null ? JsonFX.stringify(d.value, false) : undefined;
                        cms.getModificationParams(d.id, undefined, val, params => cms.setObject(d.id, undefined, val, params.checksum, onSuc, onErr), onErr);
                    });
                } else if (!d.multilingual) {
                    tasks.push((onSuc, onErr) => {
                        const val = d.value !== undefined && d.value !== null ? d.value : undefined;
                        cms.getModificationParams(d.id, undefined, val, params => cms.setObject(d.id, undefined, val, params.checksum, onSuc, onErr));
                    });
                } else {
                    tasks.push((onSuc, onErr) => {
                        const val = d.value !== undefined && d.value !== null ? d.value : undefined;
                        cms.getModificationParams(d.id, undefined, val, params => cms.setObject(d.id, undefined, val, params.checksum, onSuc, onErr));
                    });
                }
                tasks.push((onSuc, onErr) => {
                    onProgressChanged(formatProgressInPercent(idx / len));
                    onSuc();
                });
            }());
        }
        tasks.parallel = false;
        Executor.run(tasks, () => onProgressChanged(), onError);
    };
    ExchangeHandler.prototype.handleImport = function (hmi, text, onProgressChanged, onError) {
        // separate ids and data
        const that = this, data = [], prefix = this._parse(text, data, onProgressChanged, onError);
        if (typeof prefix !== 'string') {
            onProgressChanged();
            return;
        }
        const html = `<b>Import (replace):</b><br><code>${(prefix.length > 0 ? prefix : 'all (!)')}</code><br><br><b>Sure to proceed?</b>`;
        hmi.showDefaultConfirmationPopup({
            width: $(window).width() * 0.6,
            height: $(window).height() * 0.4,
            title: 'warning',
            html,
            yes: () => that._write_config_data(data, onProgressChanged, onError),
            cancel: () => onProgressChanged()
        });
    };
    ExchangeHandler.prototype.handleExport = function (id, onProgressChanged, onError) {
        const that = this, cms = this._cms, data = cms.analyzeID(id);
        onProgressChanged('load languages ...');
        const languages = cms.getLanguages();
        languages.sort(compare_keys);
        if (data.file) {
            that._read_config_data([data.file], id, languages, onProgressChanged, onError);
        } else if (data.folder) {
            cms.getIdKeyValues(data.folder, ids => {
                ids.sort(compare_keys);
                that._read_config_data(ids, id, languages, onProgressChanged, onError);
            }, onError);
        }
        else {
            onProgressChanged();
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
