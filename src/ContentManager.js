(function (root) {
    "use strict";
    const ContentManager = {};
    const isNodeJS = typeof require === 'function';
    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Server = isNodeJS ? require('./Server.js') : root.Server;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const SqlHelper = isNodeJS ? require('./SqlHelper.js') : root.SqlHelper;
    const Utilities = isNodeJS ? require('./Utilities.js') : root.Utilities;
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  ContentManager inferface  */
    function validateAsContentManager(instance, validateMethodArguments) {
        return Core.validateAs('ContentManager', instance, [
            'GetExchangeHandler()',
            'GetLanguages(array)',
            'IsValidFile(string)',
            'IsValidFolder(string)',
            'AnalyzeId(id)',
            'GetPath(id)',
            'GetExtension(id)',
            'GetExtensionForType(type)',
            'GetIcon(id)',
            'CompareIds(id1, id2)',
            'Exists(id, onResponse, onError)',
            'GetChecksum(id, onResponse, onError)',
            'GetObject(id, language, mode, onResponse, onError)',
            'GetModificationParams(id, language, value, onResponse, onError)',
            'SetObject(id, language, value, checksum, onResponse, onError)',
            'GetRefactoringParams(source, target, action, onResponse, onError)',
            'PerformRefactoring(source, target, action, checksum, onResponse, onError)',
            'GetReferencesTo(id, onResponse, onError)',
            'GetReferencesToCount(id, onResponse, onError)',
            'GetReferencesFrom(id, onResponse, onError)',
            'GetReferencesFromCount(id, onResponse, onError)',
            'GetTreeChildNodes(id, onResponse, onError)',
            'GetSearchResults(key, value, onResponse, onError)',
            'GetIdKeyValues(id, onResponse, onError)',
            'GetIdSelectedValues(id, language, onResponse, onError)',
            'IsHMIObject(id, onResponse, onError)',
            'SetAvailabilityAsHMIObject(id, available, onResponse, onError)',
            'GetHMIObject(queryParameterValue, onResponse, onError)',
            'GetHMIObjects(onResponse, onError)',
            'IsTaskObject(id, onResponse, onError)',
            'SetAvailabilityAsTaskObject(id, available, onResponse, onError)',
            'GetTaskObjects(onResponse, onError)'
        ], validateMethodArguments);
    }
    ContentManager.validateAsContentManager = validateAsContentManager;

    function validateAsContentManagerOnServer(instance, validateMethodArguments) {
        validateAsContentManager(instance, validateMethodArguments);
        return Core.validateAs('ContentManager', instance, [
            'HandleRequest(request, onResponse, onError)', // Called in web server 'POST' handling
            'HandleFancyTreeRequest(request, identifier, onResponse, onError)' // Called in web server 'GET' handling (for fancy tree)
        ], validateMethodArguments);
    }
    ContentManager.validateAsContentManagerOnServer = validateAsContentManagerOnServer;

    const DataTableType = Object.freeze({
        JsonFX: 'JsonFX',
        Text: 'Text',
        Label: 'Label',
        HTML: 'HTML',
        HMI: 'HMI',
        Task: 'Task'
    });
    ContentManager.DataTableType = DataTableType;

    /*  Used by ContentEditor  */
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

    ContentManager.HMI_FLAG_ENABLE = 0x01;
    ContentManager.HMI_FLAG_AUTORUN = 0x01;


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

    function getValueForAttribute(collection, attribute) {
        if (collection === undefined) {
            return undefined;
        }
        const value = collection[attribute];
        if (value === undefined || value === null) {
            return undefined;
        }
        return typeof value === 'string' ? value : value.toString();
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
    const COMMAND_IS_HMI_OBJECT = 'is_hmi_object';
    const COMMAND_SET_AVAILABILITY_AS_HMI_OBJECT = 'set_availability_as_hmi_object';
    const COMMAND_GET_HMI_OBJECT = 'get_hmi_object';
    const COMMAND_GET_HMI_OBJECTS = 'get_hmi_objects';
    const COMMAND_IS_TASK_OBJECT = 'is_task_object';
    const COMMAND_SET_AVAILABILITY_AS_TASK_OBJECT = 'set_availability_as_task_object';
    const COMMAND_GET_TASK_OBJECTS = 'get_task_objects';

    const VALID_EXT_REGEX = /^\w+$/;
    const VALID_NAME_CHAR = '[a-zA-Z0-9_+\\-*]';
    const FOLDER_REGEX = new RegExp('^\\$((?:' + VALID_NAME_CHAR + '+\\/)*)$');
    const EXCHANGE_HEADER = 'hmijs-config-exchange-data';

    const AUTO_KEY_LENGTH = 8;

    class ContentManagerBase {
        constructor() {
            if (this.constructor === ContentManagerBase) {
                throw new Error('The abstract base class ContentManagerBase cannot be instantiated.')
            }
        }
        GetExchangeHandler() {
            return new ExchangeHandler(this);
        }
        GetLanguages(array) {
            return Utilities.copyArray(this._config.languages, array);
        }
        IsValidFile(string) { // TODO: remove if not used
            return this._contentTablesKeyRegex.test(string);
        }
        IsValidFolder(string) { // TODO: remove if not used
            return FOLDER_REGEX.test(string);
        }
        AnalyzeId(id) {
            let match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                return this._getDescriptor(match[2], { id, path: match[1], file: id, extension: match[2] });
            }
            match = FOLDER_REGEX.exec(id);
            if (match) {
                return { id, path: match[1], folder: id };
            }
            return { id };
        }
        _getDescriptor(extension, description) {
            const table = this._contentTablesByExtension[extension];
            if (table) {
                const desc = description || {};
                desc.JsonFX = table.JsonFX;
                desc.multilingual = table.multilingual;
                desc.multiedit = table.multiedit;
                return desc;
            } else {
                return false;
            }
        }
        GetPath(id) {
            const match = this._contentTablesKeyRegex.exec(id);
            return match ? match[1] : false;
        }
        GetExtension(id) {
            const match = this._contentTablesKeyRegex.exec(id);
            return match ? match[2] : false;
        }
        GetExtensionForType(type) {
            return this._extensionsForType[type];
        }
        GetIcon(id) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                for (const extension in this._contentTablesByExtension) {
                    if (extension === match[2] && this._contentTablesByExtension.hasOwnProperty(extension)) {
                        return this._iconDirectory + this._contentTablesByExtension[extension].icon;
                    }
                }
                return false;
            } else if (FOLDER_REGEX.test(id)) {
                return this._iconDirectory + this._config.folderIcon;
            } else {
                return false;
            }
        }
        CompareIds(id1, id2) {
            if (FOLDER_REGEX.test(id1)) {
                return FOLDER_REGEX.test(id2) ? Sorting.compareTextsAndNumbers(id1, id2, false, false) : -1;
            } else {
                return FOLDER_REGEX.test(id2) ? 1 : Sorting.compareTextsAndNumbers(id1, id2, false, false);
            }
        }
    }

    const compareKeys = Sorting.getTextsAndNumbersCompareFunction(false, false, true);

    class ServerManager extends ContentManagerBase {
        constructor(getSqlAdapter, iconDirectory, config) {
            super();
            if (typeof getSqlAdapter !== 'function') {
                throw new Error('No database access provider available!');
            }
            this._getSqlAdapter = getSqlAdapter;
            this._iconDirectory = `/${iconDirectory}/`;
            const db_config = require(typeof config === 'string' ? config : '../cfg/db_config.json');
            this._config = db_config;
            this._parallel = typeof db_config.maxParallelQueries === 'number' && db_config.maxParallelQueries > 0 ? db_config.maxParallelQueries : true;
            this._contentTablesByExtension = {};
            this._extensionsForType = {};
            const tableExtensions = [];
            for (const type in this._config.tables) {
                if (this._config.tables.hasOwnProperty(type)) {
                    const tableConfig = this._config.tables[type];
                    const extension = tableConfig.extension;
                    if (!VALID_EXT_REGEX.test(extension)) {
                        throw new Error(`Invalid extension: '${extension}'`);
                    } else if (this._contentTablesByExtension[extension] !== undefined) {
                        throw new Error(`Extension already exists: '${extension}'`);
                    }
                    let valcol;
                    switch (type) {
                        case DataTableType.JsonFX:
                        case DataTableType.Text:
                            if (typeof tableConfig.valueColumn !== 'string') {
                                throw new Error(`Missing value column parameter for table type '${type}'`);
                            }
                            valcol = tableConfig.valueColumn;
                            break;
                        case DataTableType.Label:
                        case DataTableType.HTML:
                            if (typeof tableConfig.valueColumnPrefix !== 'string') {
                                throw new Error(`Missing value column prefix parameter for table type '${type}'`);
                            } else if (db_config.languages.length === 0) {
                                throw new Error(`Language array has zero length for table type '${type}'`);
                            }
                            valcol = {};
                            for (let language of db_config.languages) {
                                valcol[language] = tableConfig.valueColumnPrefix + language;
                            }
                            break;
                        case DataTableType.HMI:
                        case DataTableType.Task:
                            if (typeof tableConfig.valueColumn !== 'string') {
                                throw new Error(`Missing value column parameter for table type '${type}'`);
                            } else if (typeof tableConfig.flagsColumn !== 'string') {
                                throw new Error(`Missing flags column parameter for table type '${type}'`);
                            }
                            valcol = {
                                valueColumn: tableConfig.valueColumn,
                                flagsColumn: tableConfig.flagsColumn
                            };
                            break;
                        default:
                            throw new Error(`Unsupported table type: '${type}'`);
                    }
                    const table = {
                        type,
                        name: tableConfig.name,
                        keyColumn: tableConfig.keyColumn,
                        valueColumn: tableConfig.valueColumn,
                        valcol,
                        multilingual: typeof tableConfig.valueColumnPrefix === 'string' && tableConfig.valueColumnPrefix.length > 0,
                        icon: tableConfig.icon,
                        JsonFX: type === DataTableType.JsonFX,
                        multiedit: type === DataTableType.Label
                    };
                    this._contentTablesByExtension[extension] = table;
                    this._extensionsForType[type] = extension;
                    tableExtensions.push(extension);
                    switch (type) {
                        case DataTableType.JsonFX:
                        case DataTableType.Text:
                        case DataTableType.Label:
                        case DataTableType.HTML:
                            break;
                        case DataTableType.HMI:
                            table.flagsColumn = tableConfig.flagsColumn; // TODO: use valcol
                            this._hmiTable = table; // TODO: Required? Maybe use _contentTablesByExtension instead
                            break;
                        case DataTableType.Task:
                            table.flagsColumn = tableConfig.flagsColumn; // TODO: use valcol
                            this._taskTable = table; // TODO: Required? Maybe use _contentTablesByExtension instead
                            break;
                        default:
                            throw new Error(`Unsupported table type: '${type}'`);
                    }
                }
            }
            // we need all available extensions for building regular expressions
            const tabexts = tableExtensions.join('|');
            this._contentTablesKeyRegex = new RegExp(`^\\$((?:${VALID_NAME_CHAR}+\\/)*?${VALID_NAME_CHAR}+?)\\.(${tabexts})$`);
            this._refactoring_match = `((?:${VALID_NAME_CHAR}+\\/)*?${VALID_NAME_CHAR}+?\\.(?:${tabexts}))\\b`;
            this._include_regex_build = new RegExp(`(\'|")?include:\\$((?:${VALID_NAME_CHAR}+\\/)*${VALID_NAME_CHAR}+?)\\.(${tabexts})\\b\\1`, 'g');
            this._exchange_header_regex = new RegExp(`\\[\\{\\((${tabexts}|language|${Regex.escape(EXCHANGE_HEADER)})<>([a-f0-9]{32})\\)\\}\\]\\n(.*)\\n`, 'g');
            validateAsContentManagerOnServer(this, true);
        }
        _getRawString(adapter, table, rawKey, language, onResponse, onError) {
            const valcol = table.valcol, column = typeof valcol === 'string' ? valcol : valcol[language];
            if (typeof column === 'string') {
                adapter.AddColumn(`${table.name}.${column} AS ${column}`);
                adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                adapter.PerformSelect(table.name, undefined, undefined, 1, (results, fields) => {
                    // in case of an result we are dealing with an existing key, but
                    // the
                    // data for the requested language may not be available anyway
                    if (results.length === 1) {
                        let raw = results[0][column];
                        onResponse(raw !== null ? raw : '');
                    } else {
                        onResponse(false);
                    }
                }, onError);
            } else {
                onError(`Invalid value column for table '${table.name}' and language '${language}'`);
            }
        }
        Exists(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                const table = this._contentTablesByExtension[match[2]];
                if (!table) {
                    onError(`Invalid table: ${id}`);
                    return;
                }
                this._getSqlAdapter(adapter => {
                    adapter.AddColumn('COUNT(*) AS cnt');
                    adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(match[1])}`);
                    adapter.PerformSelect(table.name, undefined, undefined, undefined, result => {
                        adapter.Close();
                        onResponse(result[0].cnt > 0);
                    }, error => {
                        adapter.Close();
                        onError(error);
                    });
                }, onError);
            } else {
                onResponse(false);
            }
        }
        GetChecksum(id, onResponse, onError) {
            // first we try to get table object matching to the given key
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table name: '${id}'`);
                return;
            }
            const that = this;
            this._getSqlAdapter(adapter => {
                const rawKey = match[1];
                let raw = id;
                function success() {
                    adapter.Close();
                    onResponse(Utilities.md5(raw));
                }
                function error(err) {
                    adapter.Close();
                    onError(err);
                };
                // if JsonFX or plain text is available we decode the string and
                // return with or without all includes included
                switch (table.type) {
                    case DataTableType.JsonFX:
                    case DataTableType.Text:
                        // note: no language required here because we got only one anyway
                        that._getRawString(adapter, table, rawKey, undefined, rawString => {
                            if (rawString !== false) {
                                raw += ':';
                                raw += rawString;
                            }
                            success();
                        }, error);
                        break;
                    case DataTableType.Label:
                    case DataTableType.HTML:
                    case DataTableType.HMI:
                    case DataTableType.Task:
                        for (const attr in table.valcol) {
                            if (table.valcol.hasOwnProperty(attr)) {
                                adapter.AddColumn(`${table.name}.${table.valcol[attr]} AS ${attr}`);
                            }
                        }
                        adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                        adapter.PerformSelect(table.name, undefined, undefined, 1, (results, fields) => {
                            if (results.length === 1) {
                                const object = results[0];
                                for (const attr in table.valcol) {
                                    if (object.hasOwnProperty(attr)) {
                                        raw += `:${attr}:${object[attr]}`;
                                    }
                                }
                            }
                            success();
                        }, error);
                        break;
                }
            }, onError);
        }
        GetObject(id, language, mode, onResponse, onError) {
            // This method works in four modes:
            // 1. JsonFX-object: build object and return
            // 2. plain text (utf-8): build text and return
            // 3. label/html with language selection: build string and return
            // 4. label/html without language selection: build strings and return as object
            // first we try to get table object matching to the given key
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table name: '${id}'`);
                return;
            }
            this._getSqlAdapter(adapter => this._getObject(adapter, id, match[1], table, language, mode, response => {
                adapter.Close();
                onResponse(response);
            }, error => {
                adapter.Close();
                onError(error);
            }), onError);
        }
        _getObject(adapter, id, rawKey, table, language, mode, onResponse, onError) {
            const that = this;
            const parse = mode === ContentManager.PARSE, include = parse || mode === ContentManager.INCLUDE;
            function success(response) {
                try {
                    if (parse) {
                        let object = JsonFX.reconstruct(response);
                        if (that._config.jsonfxPretty === true) {
                            // the 'jsonfxPretty' flag may be used to format our dynamically
                            // parsed JavaScript sources for more easy debugging purpose
                            // TODO: object = eval('(' + JsonFX.stringify(object, true) + ')\n//# sourceURL=' + rawKey + '.js');
                            object = eval('(' + JsonFX.stringify(object, true) + ')');
                        }
                        onResponse(object);
                    } else {
                        onResponse(response);
                    }
                } catch (err) {
                    onError(err);
                }
            }
            // if JsonFX or plain text is available we decode the string and
            // return with or without all includes included
            switch (table.type) {
                case DataTableType.JsonFX:
                case DataTableType.Text:
                    // note: no language required here because we got only one anyway
                    that._getRawString(adapter, table, rawKey, undefined, rawString => {
                        if (rawString !== false) {
                            const object = table.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                            if (include) {
                                const ids = {};
                                ids[id] = true;
                                that._include(adapter, object, ids, language, success, onError);
                            } else {
                                success(object);
                            }
                        } else {
                            success();
                        }
                    }, onError);
                    break;
                case DataTableType.Label:
                case DataTableType.HTML:
                    if (typeof language === 'string') {
                        // if selection is available we return string with or without all
                        // includes included
                        that._getRawString(adapter, table, rawKey, language, rawString => {
                            if (rawString !== false) {
                                if (include) {
                                    const ids = {};
                                    ids[id] = true;
                                    that._include(adapter, rawString, ids, language, success, onError);
                                } else {
                                    success(rawString);
                                }
                            } else {
                                success();
                            }
                        }, onError);
                    } else {
                        for (const attr in table.valcol) {
                            if (table.valcol.hasOwnProperty(attr)) {
                                adapter.AddColumn(`${table.name}.${table.valcol[attr]} AS ${attr}`);
                            }
                        }
                        adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                        adapter.PerformSelect(table.name, undefined, undefined, 1, (results, fields) => {
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
                                    Executor.run(tasks, () => success(object), onError);
                                } else {
                                    success(object);
                                }
                            } else {
                                success();
                            }
                        }, onError);
                    }
                    break;
                case DataTableType.HMI:
                case DataTableType.Task:
                    for (const attr in table.valcol) {
                        if (table.valcol.hasOwnProperty(attr)) {
                            adapter.AddColumn(`${table.name}.${table.valcol[attr]} AS ${attr}`);
                        }
                    }
                    adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                    adapter.PerformSelect(table.name, undefined, undefined, 1, (results, fields) => {
                        if (results.length === 1) {
                            success(results[0]);
                        } else {
                            success();
                        }
                    }, onError);
                    break;
                default:
                    onError(`Cannot get object for unsupported type: ${table.type}`);
            }
        }
        _include(adapter, object, ids, language, onResponse, onError) {
            const that = this;
            if (Array.isArray(object)) {
                this._buildProperties(adapter, object, ids, language, onResponse, onError);
            } else if (typeof object === 'object' && object !== null) {
                const includeKey = object.include;
                const match = typeof includeKey === 'string' && !ids[includeKey] ? this._contentTablesKeyRegex.exec(includeKey) : false;
                if (!match) {
                    this._buildProperties(adapter, object, ids, language, onResponse, onError);
                    return;
                }
                const table = this._contentTablesByExtension[match[2]];
                if (!table) {
                    this._buildProperties(adapter, object, ids, language, onResponse, onError);
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
                                    onResponse(inclObj);
                                }, onError);
                            } else {
                                // no real object means just return whatever it is
                                onResponse(inclObj);
                            }
                        }, onError);
                    } else {
                        // no string available so just step on with building the object
                        // properties
                        that._buildProperties(adapter, object, ids, language, onResponse, onError);
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
                        tab = that._contentTablesByExtension[match[3]];
                        if (tab) {
                            (function () {
                                let idx = i, orig = match[0], includeKey = `$${match[2]}.${match[3]}`, table = tab, rawKey = match[2];
                                tasks.push((onSuc, onErr) => {
                                    that._getRawString(adapter, table, rawKey, language, rawString => {
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
                Executor.run(tasks, () => onResponse(array.length === 1 ? array[0] : array.join('')), onError);
            } else {
                // if our input object is not an array, an object or a string we have
                // nothing to build so we return the object as is.
                onResponse(object);
            }
        }
        _buildProperties(adapter, object, ids, language, onResponse, onError) {
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
            Executor.run(tasks, () => onResponse(object), onError);
        }
        _getModificationParams(adapter, id, language, value, onResponse, onError) {
            // here we store the result
            const params = {};
            // check id
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                params.error = `Invalid id: ${id}`;
                onResponse(params);
                return;
            }
            // check table
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                params.error = `Invalid table: ${id}`;
                onResponse(params);
                return;
            }

            // try to get all current database values for given id and copy the new
            // values
            switch (table.type) {
                case DataTableType.JsonFX:
                case DataTableType.Text:
                    adapter.AddColumn(`${table.name}.${table.valcol} AS ${table.valcol}`);
                    break;
                case DataTableType.Label:
                case DataTableType.HTML:
                    // in case of a multiligual data type and a given language we got to make
                    // sure that language is supported
                    if (typeof language === 'string' && table.valcol[language] === undefined) {
                        params.error = `Invalid language '${language}'`;
                        onResponse(params);
                        return;
                    }
                    for (const attr in table.valcol) {
                        if (table.valcol.hasOwnProperty(attr)) {
                            adapter.AddColumn(`${table.name}.${table.valcol[attr]} AS ${table.valcol[attr]}`);
                        }
                    }
                    break;
                case DataTableType.HMI:
                case DataTableType.Task:
                    for (const attr in table.valcol) {
                        if (table.valcol.hasOwnProperty(attr)) {
                            adapter.AddColumn(`${table.name}.${table.valcol[attr]} AS ${table.valcol[attr]}`);
                        }
                    }
                    break;
                default:
                    onError(`Unsupported type for modification: '${table.type}'`);
                    return;
            }
            adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(match[1])}`);
            adapter.PerformSelect(table.name, undefined, undefined, 1, (result, fields) => {
                const currentData = result.length === 1 ? result[0] : undefined;
                // here we store the conditions
                let stillNotEmpty = false;
                let changed = false;
                const values = {};
                let checksum = '';
                switch (table.type) {
                    case DataTableType.JsonFX:
                    case DataTableType.Text:
                        {
                            checksum += table.valcol;
                            const currval = getValueForAttribute(currentData, table.valcol);
                            const nextval = typeof value === 'string' ? value : undefined;
                            const params = getModificationParams(currval, nextval);
                            if (!params.empty) {
                                stillNotEmpty = true;
                            }
                            if (params.changed) {
                                changed = true;
                            }
                            values[table.valcol] = params;
                            checksum += params.empty ? 'e' : 'd';
                            checksum += params.changed ? 'e' : 'd';
                            if (typeof params.string === 'string') {
                                checksum += params.string;
                            }
                        }
                        break;
                    case DataTableType.Label:
                    case DataTableType.HTML:
                        for (const attr in table.valcol) {
                            if (table.valcol.hasOwnProperty(attr)) {
                                // for all columns we try to get the current and new value
                                const currval = getValueForAttribute(currentData, table.valcol[attr]);
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
                        break;
                    case DataTableType.HMI:
                    case DataTableType.Task:
                        // TODO: remove console.log(`currentData: ${JSON.stringify(currentData)}, value: ${JSON.stringify(value)}`);
                        // currentData: {"jsonFxObjectKey":"$001_debug/maze_game.j","flags":1}, value: {"jsonFxObjectKey":"$001_debug/m aze_game.j","flags":1}
                        for (const attr in table.valcol) {
                            if (table.valcol.hasOwnProperty(attr)) {
                                // for all columns we try to get the current and new value
                                const currval = getValueForAttribute(currentData, table.valcol[attr]);
                                const nextval = getValueForAttribute(value, attr);
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
                        break;
                    default:
                        onError(`Unsupported type for modification: '${table.type}'`);
                        return;
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
                onResponse(params);
            }, onError);
        }
        GetModificationParams(id, language, value, onResponse, onError) {
            const that = this;
            this._getSqlAdapter(adapter => {
                that._getModificationParams(adapter, id, language, value, params => {
                    if (!params.error && params.action === ContentManager.DELETE) {
                        that._getReferencesFrom(adapter, id, referencesFrom => {
                            if (referencesFrom.length > 0) {
                                params.externalUsers = referencesFrom;
                            }
                            adapter.Close();
                            onResponse(params);
                        }, err => {
                            adapter.Close();
                            onError(err);
                        });
                    } else {
                        adapter.Close();
                        onResponse(params);
                    }
                }, err => {
                    adapter.Close();
                    onError(err);
                });
            }, onError);
        }
        SetObject(id, language, value, checksum, onResponse, onError) {
            const that = this, match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table name: '${id}'`);
                return;
            }
            const rawKey = match[1];
            this._getSqlAdapter(adapter => {
                const tasks = [];
                tasks.parallel = false;
                tasks.push((onSuc, onErr) => adapter.StartTransaction(onSuc, onErr));
                tasks.push((onSuc, onErr) => {
                    that._getModificationParams(adapter, id, language, value, params => {
                        if (params.error !== undefined) {
                            onErr(params.error);
                        } else if (params.checksum !== checksum) {
                            onErr('Database content has changed! Try again!');
                        } else if (params.action === ContentManager.NONE) {
                            onErr('No action to perform!');
                        } else if (params.action === ContentManager.INSERT) {
                            adapter.AddValue(`${table.name}.${table.keyColumn}`, SqlHelper.escape(rawKey));
                            switch (table.type) {
                                case DataTableType.JsonFX:
                                case DataTableType.Text:
                                    {
                                        const value = params.values[table.valcol];
                                        if (value.changed) {
                                            adapter.AddValue(`${table.name}.${table.valcol}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                        }
                                    }
                                    break;
                                case DataTableType.Label:
                                case DataTableType.HTML:
                                case DataTableType.HMI:
                                case DataTableType.Task:
                                    for (const attr in table.valcol) {
                                        if (table.valcol.hasOwnProperty(attr)) {
                                            const value = params.values[attr];
                                            if (value.changed) {
                                                adapter.AddValue(`${table.name}.${table.valcol[attr]}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                            }
                                        }
                                    }
                                    break;
                                default:
                                    onErr(`Cannot insert unsupported type: ${table.type}`);
                                    return;
                            }
                            adapter.PerformInsert(table.name, onSuc, onErr);
                        } else if (params.action === ContentManager.UPDATE) {
                            switch (table.type) {
                                case DataTableType.JsonFX:
                                case DataTableType.Text:
                                    {
                                        const value = params.values[table.valcol];
                                        if (value.changed) {
                                            adapter.AddValue(`${table.name}.${table.valcol}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                        }
                                    }
                                    break;
                                case DataTableType.Label:
                                case DataTableType.HTML:
                                case DataTableType.HMI:
                                case DataTableType.Task:
                                    for (const attr in table.valcol) {
                                        if (table.valcol.hasOwnProperty(attr)) {
                                            const value = params.values[attr];
                                            if (value.changed) {
                                                adapter.AddValue(`${table.name}.${table.valcol[attr]}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                            }
                                        }
                                    }
                                    break;
                                default:
                                    onErr(`Cannot update unsupported type: ${table.type}`);
                                    return;
                            }
                            adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                            adapter.PerformUpdate(table.name, undefined, 1, onSuc, onErr);
                        } else if (params.action === ContentManager.DELETE) {
                            adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                            adapter.PerformDelete(table.name, undefined, 1, onSuc, onErr);
                        } else {
                            onErr(`Unexpected action: '${params.action}'`);
                        }
                    }, onErr);
                });
                Executor.run(tasks, () => {
                    adapter.CommitTransaction(() => {
                        adapter.Close();
                        onResponse();
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, err => {
                    adapter.RollbackTransaction(() => {
                        adapter.Close();
                        onError(err);
                    }, ee => {
                        adapter.Close();
                        onError(ee);
                    });
                });
            }, onError);
        }
        _getRefactoringParams(adapter, source, target, action, onResponse, onError) {
            // here we store the result
            const params = {}, key_regex = this._contentTablesKeyRegex;
            // check action
            if (action !== ContentManager.COPY && action !== ContentManager.MOVE && action !== ContentManager.DELETE) {
                params.error = 'Invalid action';
                onResponse(params);
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
                onResponse(params);
                return;
            }
            // check target - but only if required
            if (action === ContentManager.COPY || action === ContentManager.MOVE) {
                if (typeof target === 'string' && target.length > 0) {
                    params.target = target;
                    checksum += target;
                } else {
                    params.error = 'Missing target';
                    onResponse(params);
                    return;
                }
            }
            // check source identifier
            let srcTab = false, srcTabKey, sourceIsFolder;
            let match = key_regex.exec(source);
            if (match) {
                srcTab = this._contentTablesByExtension[match[2]];
                if (!srcTab) {
                    params.error = `Invalid source table: '${source}'`;
                    onResponse(params);
                    return;
                }
                sourceIsFolder = false;
                srcTabKey = match[1];
            } else {
                match = FOLDER_REGEX.exec(source);
                sourceIsFolder = !!match;
                if (!sourceIsFolder) {
                    params.error = `Invalid source folder: '${source}'`;
                    onResponse(params);
                    return;
                }
                srcTabKey = match[1];
            }
            checksum += sourceIsFolder ? "sf" : "so";
            let tgtTab = false, targetIsFolder;
            // check target identifier
            if (typeof target === 'string') {
                match = key_regex.exec(target);
                if (match) {
                    tgtTab = this._contentTablesByExtension[match[2]];
                    if (!tgtTab) {
                        params.error = `Invalid target table: '${target}'`;
                        onResponse(params);
                        return;
                    }
                    targetIsFolder = false;
                } else {
                    match = FOLDER_REGEX.exec(target);
                    targetIsFolder = !!match;
                    if (!targetIsFolder) {
                        params.error = `Invalid target folder: '${target}'`;
                        onResponse(params);
                        return;
                    }
                }
                checksum += targetIsFolder ? "tf" : "to";
                // check source to target conditions
                if (sourceIsFolder) {
                    if (!targetIsFolder) {
                        params.error = 'Target is not a folder';
                        onResponse(params);
                        return;
                    }
                } else {
                    if (targetIsFolder) {
                        params.error = 'Target is not a single object';
                        onResponse(params);
                        return;
                    }
                    if (tgtTab === false) {
                        params.error = 'Unknown target table';
                        onResponse(params);
                        return;
                    }
                    if (srcTab !== tgtTab) {
                        params.error = 'Different source and target table';
                        onResponse(params);
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
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const table = that._contentTablesByExtension[extension];
                                tasks.push((os, oe) => {
                                    adapter.AddColumn(`${table.name}.${table.keyColumn} AS path`);
                                    // select all paths within the range
                                    adapter.AddWhere(`LOCATE(${SqlHelper.escape(srcTabKey)},${table.name}.${table.keyColumn}) = 1`);
                                    adapter.PerformSelect(table.name, undefined, undefined, undefined, result => {
                                        for (let i = 0, l = result.length; i < l; i++) {
                                            srcKeysObj[`$${result[i].path}.${ext}`] = true;
                                        }
                                        os();
                                    }, oe);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that._parallel;
                    Executor.run(tasks, onSuc, onErr);
                } else {
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
                    onResponse(params);
                    return;
                }
                srcKeysArr.sort(compareKeys);
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
                            onResponse(params);
                            return;
                        }
                    }
                    // check if any target already exists
                    for (let i = 0; i < srcLen; i++) {
                        (function () {
                            const tgt = objects[srcKeysArr[i]];
                            const match = key_regex.exec(tgt);
                            const table = that._contentTablesByExtension[match[2]];
                            const tabKeyEsc = SqlHelper.escape(match[1]);
                            tasks.push((os, or) => {
                                adapter.AddColumn('COUNT(*) AS cnt');
                                adapter.AddWhere(`${table.name}.${table.keyColumn} = ${tabKeyEsc}`);
                                adapter.PerformSelect(table.name, undefined, undefined, undefined, result => {
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
                    tgtExArr.sort(compareKeys);
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
                    extRefsArray.sort(compareKeys);
                    params.referencesFromOthers = extRefsArray;
                    const l = extRefsArray.length;
                    for (let i = 0; i < l; i++) {
                        checksum += extRefsArray[i];
                    }
                }
                params.checksum = Utilities.md5(checksum);
                onResponse(params);
            }, onError);
        }
        GetRefactoringParams(source, target, action, onResponse, onError) {
            const that = this;
            this._getSqlAdapter(adapter => {
                that._getRefactoringParams(adapter, source, target, action, params => {
                    adapter.Close();
                    onResponse(params);
                }, err => {
                    adapter.Close();
                    onError(err);
                });
            }, onError);
        }
        PerformRefactoring(source, target, action, checksum, onResponse, onError) {
            const that = this;
            this._getSqlAdapter(adapter => {
                const main = [];
                // the main action has to be processed in a sequence wo we do not run
                // in
                // parallel
                main.parallel = false;
                // we run this as a transaction wo enable rollbacks (just in case
                // something unexpected happens)
                main.push((onSuc, onErr) => adapter.StartTransaction(onSuc, onErr));
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
                                    for (const attr in that._contentTablesByExtension) {
                                        if (that._contentTablesByExtension.hasOwnProperty(attr)) {
                                            (function () {
                                                const table = that._contentTablesByExtension[attr];
                                                tasks.push((os, oe) => {
                                                    adapter.AddWhere(`LOCATE(${srcTabKey},${table.name}.${table.keyColumn}) = 1`);
                                                    adapter.PerformDelete(table.name, undefined, undefined, os, oe);
                                                });
                                            }());
                                        }
                                    }
                                } else {
                                    const key_regex = that._contentTablesKeyRegex, match = key_regex.exec(source);
                                    const table = that._contentTablesByExtension[match[2]], srcTabKey = SqlHelper.escape(match[1]);
                                    tasks.push((os, oe) => {
                                        adapter.AddWhere(`${table.name}.${table.keyColumn} = ${srcTabKey}`);
                                        adapter.PerformDelete(table.name, undefined, 1, os, oe);
                                    });
                                }
                            }
                            Executor.run(tasks, onSuc, onErr);
                        }
                    }, onErr);
                });
                Executor.run(main, () => {
                    adapter.CommitTransaction(() => {
                        adapter.Close();
                        onResponse();
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, err => {
                    adapter.RollbackTransaction(() => {
                        adapter.Close();
                        onError(err);
                    }, er => {
                        adapter.Close();
                        onError(er);
                    });
                });
            }, onError);
        }
        _performRefactoring(adapter, source, params, getReplacement, onResponse, onError) {
            const that = this, key_regex = this._contentTablesKeyRegex;
            const match = key_regex.exec(source);
            const table = this._contentTablesByExtension[match[2]];
            const srcTabKey = match[1];
            const main = [];
            main.parallel = false;
            if (params.action === ContentManager.MOVE || params.action === ContentManager.COPY) {
                main.push((onSuc, onErr) => {
                    // get the target and check if already exists
                    const target = params.objects[source];
                    const targetAlreadyExists = params.existingTargets && params.existingTargets[target] === true;
                    switch (table.type) {
                        case DataTableType.JsonFX:
                        case DataTableType.Text:
                            adapter.AddColumn(`${table.name}.${table.valcol}`);
                            break;
                        case DataTableType.Label:
                        case DataTableType.HTML:
                        case DataTableType.HMI:
                        case DataTableType.Task:
                            for (const attr in table.valcol) {
                                if (table.valcol.hasOwnProperty(attr)) {
                                    adapter.AddColumn(`${table.name}.${table.valcol[attr]}`);
                                }
                            }
                            break;
                    }
                    adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(srcTabKey)}`);
                    adapter.PerformSelect(table.name, undefined, undefined, 1, results => {
                        const values = results[0];
                        // replace internal cross references and prepare database
                        // update or insert value
                        switch (table.type) {
                            case DataTableType.JsonFX:
                            case DataTableType.Text:
                                let string = values[table.valcol];
                                if (typeof string === 'string' && string.length > 0) {
                                    string = getReplacement(string);
                                    adapter.AddValue(`${table.name}.${table.valcol}`, SqlHelper.escape(string));
                                }
                                break;
                            case DataTableType.Label:
                            case DataTableType.HTML:
                            case DataTableType.HMI:
                            case DataTableType.Task:
                                for (const attr in table.valcol) {
                                    if (table.valcol.hasOwnProperty(attr)) {
                                        const value = values[table.valcol[attr]];
                                        if (typeof value === 'string' && value.length > 0) {
                                            const string = getReplacement(value);
                                            adapter.AddValue(`${table.name}.${table.valcol[attr]}`, SqlHelper.escape(string));
                                        } else if (value !== undefined) {
                                            const string = value.toString();
                                            adapter.AddValue(`${table.name}.${table.valcol[attr]}`, SqlHelper.escape(string));
                                        }
                                    }
                                }
                                break;
                        }
                        const match = key_regex.exec(target);
                        const tgtTabKey = match[1];
                        function success() {
                            if (targetAlreadyExists && params.action === ContentManager.MOVE) {
                                adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(srcTabKey)}`);
                                adapter.PerformDelete(table.name, undefined, 1, onSuc, onErr);
                            } else {
                                onSuc();
                            }
                        };
                        if (targetAlreadyExists) {
                            adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(tgtTabKey)}`);
                            adapter.PerformUpdate(table.name, undefined, 1, success, onErr);
                        } else {
                            adapter.AddValue(`${table.name}.${table.keyColumn}`, SqlHelper.escape(tgtTabKey));
                            if (params.action === ContentManager.MOVE) {
                                adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(srcTabKey)}`);
                                adapter.PerformUpdate(table.name, undefined, 1, success, onErr);
                            } else {
                                adapter.PerformInsert(table.name, success, onErr);
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
                                    const table = that._contentTablesByExtension[match[2]];
                                    const usrKey = match[1];
                                    tasks.push((os, oe) => {
                                        switch (table.type) {
                                            case DataTableType.JsonFX:
                                            case DataTableType.Text:
                                                adapter.AddColumn(`${table.name}.${table.valcol} AS ${table.valcol}`);
                                                break;
                                            case DataTableType.Label:
                                            case DataTableType.HTML:
                                            case DataTableType.HMI:
                                            case DataTableType.Task:
                                                for (const attr in table.valcol) {
                                                    if (table.valcol.hasOwnProperty(attr)) {
                                                        adapter.AddColumn(`${table.name}.${table.valcol[attr]} AS ${table.valcol[attr]}`);
                                                    }
                                                }
                                                break;
                                        }
                                        adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(usrKey)}`);
                                        adapter.PerformSelect(table.name, undefined, undefined, 1, result => {
                                            // replace in all existing value strings all occurrences
                                            // of
                                            // any source path with the resulting target path and
                                            // update object
                                            const values = result[0];
                                            switch (table.type) {
                                                case DataTableType.JsonFX:
                                                case DataTableType.Text:
                                                    let string = values[table.valcol];
                                                    if (typeof string === 'string' && string.length > 0) {
                                                        string = getReplacement(string);
                                                        adapter.AddValue(`${table.name}.${table.valcol}`, SqlHelper.escape(string));
                                                    }
                                                    break;
                                                case DataTableType.Label:
                                                case DataTableType.HTML:
                                                case DataTableType.HMI:
                                                case DataTableType.Task:
                                                    for (const attr in table.valcol) {
                                                        if (table.valcol.hasOwnProperty(attr)) {
                                                            let string = values[table.valcol[attr]];
                                                            if (typeof string === 'string' && string.length > 0) {
                                                                string = getReplacement(string);
                                                                adapter.AddValue(`${table.name}.${table.valcol[attr]}`, SqlHelper.escape(string));
                                                            }
                                                        }
                                                    }
                                                    break;
                                            }
                                            adapter.AddWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(usrKey)}`);
                                            adapter.PerformUpdate(table.name, undefined, 1, os, oe);
                                        }, oe);
                                    });
                                }());
                            }
                        }
                        Executor.run(tasks, onSuc, onErr);
                    }, onErr);
                });
            }
            Executor.run(main, onResponse, onError);
        }
        GetReferencesTo(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                const user = this._contentTablesByExtension[match[2]];
                if (!user) {
                    onError(`Invalid table: '${id}'`);
                    return;
                }
                const that = this;
                this._getSqlAdapter(adapter => {
                    const rawKey = SqlHelper.escape(match[1]);
                    const keys = {};
                    const tasks = [];
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const used = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.AddColumn(`tab.${used.keyColumn} AS path`);
                                    adapter.AddWhere(`${user.name}.${user.keyColumn} = ${rawKey}`);
                                    adapter.AddJoin(formatReferencesToCondition(user.name, user.valcol, used.name, 'tab', ext, used.keyColumn));
                                    adapter.PerformSelect(user.name, undefined, undefined, undefined, result => {
                                        for (let i = 0, l = result.length; i < l; i++) {
                                            keys[`$${result[i].path}.${ext}`] = true;
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
                        adapter.Close();
                        onResponse(array);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            }
            else {
                // if invalid key we simply found no reference
                onResponse([]);
            }
        }
        GetReferencesToCount(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                const user = this._contentTablesByExtension[match[2]];
                if (!user) {
                    onError(`Invalid table: '${id}'`);
                    return;
                }
                const that = this;
                this._getSqlAdapter(adapter => {
                    const rawKey = SqlHelper.escape(match[1]);
                    const tasks = [];
                    let result = 0;
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const used = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.AddColumn('COUNT(*) AS cnt');
                                    adapter.AddWhere(`${user.name}.${user.keyColumn} = ${rawKey}`);
                                    adapter.AddJoin(formatReferencesToCondition(user.name, user.valcol, used.name, 'tab', ext, used.keyColumn));
                                    adapter.PerformSelect(user.name, undefined, undefined, undefined, response => {
                                        result += response[0].cnt;
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that._parallel;
                    Executor.run(tasks, () => {
                        adapter.Close();
                        onResponse(result);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            } else {
                // if invalid key we simply found no reference
                onResponse(0);
            }
        }
        _getReferencesFrom(adapter, id, onResponse, onError) {
            const that = this, key = SqlHelper.escape(id), keys = {}, tasks = [];
            for (const extension in this._contentTablesByExtension) {
                if (this._contentTablesByExtension.hasOwnProperty(extension)) {
                    (function () {
                        const ext = extension;
                        const table = that._contentTablesByExtension[extension];
                        tasks.push((onSuc, onErr) => {
                            adapter.AddColumn(`${table.name}.${table.keyColumn} AS path`);
                            switch (table.type) {
                                case DataTableType.JsonFX:
                                case DataTableType.Text:
                                    adapter.AddWhere(formatReferencesFromCondition(key, `${table.name}.${table.valcol}`), false);
                                    break;
                                case DataTableType.Label:
                                case DataTableType.HTML:
                                case DataTableType.HMI:
                                case DataTableType.Task:
                                    for (const col in table.valcol) {
                                        if (table.valcol.hasOwnProperty(col)) {
                                            adapter.AddWhere(formatReferencesFromCondition(key, `${table.name}.${table.valcol[col]}`), false);
                                        }
                                    }
                                    break;
                            }
                            adapter.PerformSelect(table.name, undefined, undefined, undefined, response => {
                                for (let i = 0, l = response.length; i < l; i++) {
                                    keys[`$${response[i].path}.${ext}`] = true;
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
                onResponse(array);
            }, onError);
        }
        GetReferencesFrom(id, onResponse, onError) {
            if (this._contentTablesKeyRegex.test(id)) {
                const that = this;
                this._getSqlAdapter(adapter => {
                    that._getReferencesFrom(adapter, id, results => {
                        adapter.Close();
                        onResponse(results);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            } else {
                // if invalid key we simply found no reference
                onResponse([]);
            }
        }
        GetReferencesFromCount(id, onResponse, onError) {
            if (this._contentTablesKeyRegex.test(id)) {
                const that = this;
                this._getSqlAdapter(adapter => {
                    const key = SqlHelper.escape(id);
                    let result = 0;
                    const tasks = [];
                    for (const attr in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(attr)) {
                            (function () {
                                const table = that._contentTablesByExtension[attr];
                                tasks.push((onSuc, onErr) => {
                                    adapter.AddColumn('COUNT(*) AS cnt');
                                    switch (table.type) {
                                        case DataTableType.JsonFX:
                                        case DataTableType.Text:
                                            adapter.AddWhere(formatReferencesFromCondition(key, `${table.name}.${table.valcol}`), false);
                                            break;
                                        case DataTableType.Label:
                                        case DataTableType.HTML:
                                        case DataTableType.HMI:
                                        case DataTableType.Task:
                                            for (const col in table.valcol) {
                                                if (table.valcol.hasOwnProperty(col)) {
                                                    adapter.AddWhere(formatReferencesFromCondition(key, `${table.name}.${table.valcol[col]}`), false);
                                                }
                                            }
                                            break;
                                    }
                                    adapter.PerformSelect(table.name, undefined, undefined, undefined, response => {
                                        result += response[0].cnt;
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that._parallel;
                    Executor.run(tasks, () => {
                        adapter.Close();
                        onResponse(result);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            } else {
                // if invalid key we simply found no reference
                onResponse(0);
            }
        }
        GetTreeChildNodes(id, onResponse, onError) {
            const match = FOLDER_REGEX.exec(id);
            if (match) {
                const that = this, key = match[1];
                this._getSqlAdapter(adapter => {
                    const tasks = [], nodes = [];
                    function compareRawNodes(node1, node2) {
                        return that.CompareIds(node1.path, node2.path);
                    };
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const table = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    /**
                                     * the following call returns an array of objects like: <code>
                                     * {
                                     *   name : 'name of the folder or file',
                                     *   path : 'database key',
                                     *   folder : 'true if name ends with delimiter'
                                     * }
                                     * </code>
                                     * We add more parameters so our GetTreeChildNodes method will
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
                                    adapter.GetChildNodes(table.name, table.keyColumn, '/', key, children => {
                                        const l = children.length;
                                        for (let i = 0; i < l; i++) {
                                            const node = children[i];
                                            // build the full node path - and in case of a file add
                                            // the extension
                                            let path = `$${node.path}`;
                                            if (!node.folder) {
                                                path += `.${ext}`;
                                            }
                                            node.path = path;
                                            const idx = Sorting.getInsertionIndex(node, nodes, true, compareRawNodes);
                                            if (idx >= 0) {
                                                if (!node.folder) {
                                                    node.extension = ext;
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
                        adapter.Close();
                        onResponse(nodes);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            } else if (this._contentTablesKeyRegex.test(id)) {
                onResponse([]);
            } else {
                onError(`Invalid key: '${id}'`);
            }
        }
        GetSearchResults(key, value, onResponse, onError) {
            if (key.length > 0 || value.length > 0) {
                const that = this;
                this._getSqlAdapter(adapter => {
                    const results = [], tasks = [];
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const table = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.AddColumn(`${table.name}.${table.keyColumn} AS path`);
                                    let where = '';
                                    if (key.length > 0) {
                                        where += `LOCATE(${SqlHelper.escape(key)}, ${table.name}.${table.keyColumn}) > 0`;
                                        if (value.length > 0) {
                                            where += ' AND ';
                                        }
                                    }
                                    if (value.length > 0) {
                                        switch (table.type) {
                                            case DataTableType.JsonFX:
                                            case DataTableType.Text:
                                                where += `LOCATE(${SqlHelper.escape(value)}, ${table.name}.${table.valcol}) > 0`;
                                                break;
                                            case DataTableType.Label:
                                            case DataTableType.HTML:
                                            case DataTableType.HMI:
                                            case DataTableType.Task:
                                                where += '(';
                                                let next = false;
                                                for (const val in table.valcol) {
                                                    if (table.valcol.hasOwnProperty(val)) {
                                                        if (next) {
                                                            where += ' OR ';
                                                        }
                                                        next = true;
                                                        where += `LOCATE(${SqlHelper.escape(value)}, ${table.name}.${table.valcol[val]}) > 0`;
                                                    }
                                                }
                                                where += ')';
                                                break;
                                        }
                                    }
                                    adapter.AddWhere(where);
                                    adapter.PerformSelect(table.name, undefined, undefined, undefined, result => {
                                        const l = result.length;
                                        for (let i = 0; i < l; i++) {
                                            results.push(`$${result[i].path}.${ext}`);
                                        }
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that._parallel;
                    Executor.run(tasks, () => {
                        adapter.Close();
                        onResponse(results);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            }
        }
        GetIdKeyValues(id, onResponse, onError) {
            const that = this, data = this.AnalyzeId(id);
            if (data.file || data.folder) {
                this._getSqlAdapter(adapter => {
                    const results = [], tasks = [], path = SqlHelper.escape(data.path);
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const table = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.AddColumn(`${table.name}.${table.keyColumn} AS path`);
                                    adapter.AddWhere(`LOCATE(${path},${table.name}.${table.keyColumn}) = 1`);
                                    adapter.PerformSelect(table.name, undefined, undefined, undefined, result => {
                                        const l = result.length;
                                        for (let i = 0; i < l; i++) {
                                            results.push(`$${result[i].path}.${ext}`);
                                        }
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that._parallel;
                    Executor.run(tasks, () => {
                        adapter.Close();
                        onResponse(results);
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, onError);
            } else {
                onError(`Invalid selection: '${data.string}'`);
            }
        }
        GetIdSelectedValues(id, language, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const extension = match[2];
            const table = this._contentTablesByExtension[extension];
            if (!table) {
                onError(`Invalid table: '${id}'`);
                return;
            }
            this._getSqlAdapter(adapter => {
                adapter.AddColumn(`${table.name}.${table.keyColumn} AS path`);
                adapter.AddColumn((typeof table.valcol === 'string' ? table.valcol : table.valcol[language]) + ' AS val');
                adapter.PerformSelect(table.name, undefined, 'path ASC', undefined, result => {
                    const array = [], l = result.length;
                    for (let i = 0; i < l; i++) {
                        array.push([`${result[i].path}.${extension}`, result[i].val]);
                    }
                    adapter.Close();
                    onResponse(array);
                }, err => {
                    adapter.Close();
                    onError(err);
                });
            }, onError);
        }
        IsHMIObject(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onResponse(false);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table || !table.JsonFX) {
                onResponse(false);
                return;
            }
            const hmiTable = this._hmiTable;
            this._getSqlAdapter(adapter => {
                adapter.AddColumn('COUNT(*) AS cnt');
                adapter.AddWhere(`${hmiTable.name}.${hmiTable.valueColumn} = ${SqlHelper.escape(id)}`);
                adapter.PerformSelect(hmiTable.name, undefined, undefined, undefined, result => {
                    adapter.Close();
                    onResponse(result[0].cnt > 0);
                }, error => {
                    adapter.Close();
                    onError(error);
                });
            }, onError);
        }
        SetAvailabilityAsHMIObject(id, available, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table: '${id}'`);
                return;
            } else if (!table.JsonFX) {
                onError(`Is not a JsonFX object: '${id}'`);
                return;
            }
            const hmiTable = this._hmiTable;
            this._getSqlAdapter(adapter => {
                const tasks = [];
                tasks.parallel = false;
                tasks.push((onSuc, onErr) => adapter.StartTransaction(onSuc, onErr));
                tasks.push((onSuc, onErr) => {
                    if (available === true) {
                        adapter.AddValue(`${hmiTable.name}.${hmiTable.valueColumn}`, SqlHelper.escape(id));
                        const checksum = Server.createSHA256(id);
                        const key = `${checksum.substring(0, Math.floor(AUTO_KEY_LENGTH / 2))}${checksum.substring(checksum.length - Math.ceil(AUTO_KEY_LENGTH / 2), checksum.length)}`;
                        adapter.AddValue(`${hmiTable.name}.${hmiTable.keyColumn}`, SqlHelper.escape(key));
                        adapter.PerformInsert(hmiTable.name, onSuc, onErr);
                    } else {
                        adapter.AddWhere(`${hmiTable.name}.${hmiTable.keyColumn} = ${SqlHelper.escape(id)}`);
                        adapter.PerformDelete(hmiTable.name, undefined, 1, onSuc, onErr);
                    }
                });
                Executor.run(tasks, () => {
                    adapter.CommitTransaction(() => {
                        adapter.Close();
                        onResponse();
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, err => {
                    adapter.RollbackTransaction(() => {
                        adapter.Close();
                        onError(err);
                    }, ee => {
                        adapter.Close();
                        onError(ee);
                    });
                });
            }, onError);
        }
        GetHMIObject(queryParameterValue, onResponse, onError) {
            const hmiTable = this._hmiTable;
            this._getSqlAdapter(adapter => {
                adapter.AddColumn(`${hmiTable.name}.${hmiTable.valueColumn} AS path`);
                adapter.AddColumn(`${hmiTable.name}.${hmiTable.flagsColumn} AS flags`);
                /* TODO: remove for (const attr in hmiTable.valcol) {
                    if (hmiTable.valcol.hasOwnProperty(attr)) {
                        adapter.AddColumn(`${hmiTable.name}.${hmiTable.valcol[attr]} AS ${attr}`);
                    }
                }*/
                adapter.AddWhere(`${hmiTable.name}.${hmiTable.keyColumn} = ${SqlHelper.escape(queryParameterValue)}`);
                adapter.PerformSelect(hmiTable.name, undefined, undefined, undefined, result => {
                    if (!result || !Array.isArray(result) || result.length !== 1) {
                        onError(`Invalid query parameter: '${queryParameterValue}'`);
                        return;
                    }
                    const id = result[0].path;
                    const match = this._contentTablesKeyRegex.exec(id);
                    if (!match) {
                        onError(`Invalid id: '${id}'`);
                        return;
                    }
                    const table = this._contentTablesByExtension[match[2]];
                    if (!table || !table.JsonFX) {
                        onError(`Invalid table name: '${id}'`);
                        return;
                    }
                    const flags = result[0].flags;
                    if ((flags & ContentManager.HMI_FLAG_ENABLE) === 0) {
                        onError(`HMI: '${id}' is not enabled`);
                        return;
                    }
                    this._getObject(adapter, id, match[1], table, null, ContentManager.PARSE, response => {
                        adapter.Close();
                        onResponse(response);
                    }, error => {
                        adapter.Close();
                        onError(error);
                    });
                }, error => {
                    adapter.Close();
                    onError(error);
                });
            }, onError);
        }
        GetHMIObjects(onResponse, onError) {
            const hmiTable = this._hmiTable;
            this._getSqlAdapter(adapter => {
                adapter.AddColumn(`${hmiTable.name}.${hmiTable.keyColumn} AS key`);
                adapter.AddColumn(`${hmiTable.name}.${hmiTable.valueColumn} AS path`);
                adapter.AddColumn(`${hmiTable.name}.${hmiTable.flagsColumn} AS enable`);
                adapter.PerformSelect(hmiTable.name, undefined, 'path ASC', undefined, result => {
                    adapter.Close();
                    onResponse(result);
                }, error => {
                    adapter.Close();
                    onError(error);
                });
            }, onError);
        }
        IsTaskObject(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onResponse(false);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table || !table.JsonFX) {
                onResponse(false);
                return;
            }
            const taskTable = this._taskTable;
            this._getSqlAdapter(adapter => {
                adapter.AddColumn('COUNT(*) AS cnt');
                adapter.AddWhere(`${taskTable.name}.${taskTable.valueColumn} = ${SqlHelper.escape(id)}`);
                adapter.PerformSelect(taskTable.name, undefined, undefined, undefined, result => {
                    adapter.Close();
                    onResponse(result[0].cnt > 0);
                }, error => {
                    adapter.Close();
                    onError(error);
                });
            }, onError);
        }
        SetAvailabilityAsTaskObject(id, available, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table: '${id}'`);
                return;
            } else if (!table.JsonFX) {
                onError(`Is not a JsonFX object: '${id}'`);
                return;
            }
            const taskTable = this._taskTable;
            this._getSqlAdapter(adapter => {
                const tasks = [];
                tasks.parallel = false;
                tasks.push((onSuc, onErr) => adapter.StartTransaction(onSuc, onErr));
                tasks.push((onSuc, onErr) => {
                    if (available === true) {
                        adapter.AddValue(`${taskTable.name}.${taskTable.valueColumn}`, SqlHelper.escape(id));
                        const checksum = Server.createSHA256(id);
                        const keyValue = `${checksum.substring(0, Math.floor(AUTO_KEY_LENGTH / 2))}${checksum.substring(checksum.length - Math.ceil(AUTO_KEY_LENGTH / 2), checksum.length)}`;
                        adapter.AddValue(`${taskTable.name}.${taskTable.keyColumn}`, SqlHelper.escape(keyValue));
                        adapter.PerformInsert(taskTable.name, onSuc, onErr);
                    } else {
                        adapter.AddWhere(`${taskTable.name}.${taskTable.valueColumn} = ${SqlHelper.escape(id)}`);
                        adapter.PerformDelete(taskTable.name, undefined, 1, onSuc, onErr);
                    }
                });
                Executor.run(tasks, () => {
                    adapter.CommitTransaction(() => {
                        adapter.Close();
                        onResponse();
                    }, err => {
                        adapter.Close();
                        onError(err);
                    });
                }, err => {
                    adapter.RollbackTransaction(() => {
                        adapter.Close();
                        onError(err);
                    }, ee => {
                        adapter.Close();
                        onError(ee);
                    });
                });
            }, onError);
        }
        GetTaskObjects(onResponse, onError) {
            const taskTable = this._taskTable;
            this._getSqlAdapter(adapter => {
                adapter.AddColumn(`${taskTable.name}.${taskTable.valueColumn} AS path`);
                adapter.AddColumn(`${taskTable.name}.${taskTable.flagsColumn} AS autostart`);
                adapter.PerformSelect(taskTable.name, undefined, 'path ASC', undefined, result => {
                    adapter.Close();
                    onResponse(result);
                }, error => {
                    adapter.Close();
                    onError(error);
                });
            }, onError);
        }
        HandleRequest(request, onResponse, onError) {
            switch (request.command) {
                case COMMAND_GET_CONFIG:
                    onResponse({
                        iconDirectory: this._iconDirectory,
                        languages: this._config.languages,
                        folderIcon: this._config.folderIcon,
                        jsonfxPretty: this._config.jsonfxPretty,
                        extensionsForType: this._extensionsForType,
                        contentTablesByExtension: this._contentTablesByExtension,
                        hmiTable: this._hmiTable,
                        taskTable: this._taskTable,
                        key_regex: this._contentTablesKeyRegex.source,
                        exchange_header_regex: this._exchange_header_regex.source
                    });
                    break;
                case COMMAND_EXISTS:
                    this.Exists(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_CHECKSUM:
                    this.GetChecksum(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_OBJECT:
                    this.GetObject(request.id, request.language, request.mode, onResponse, onError);
                    break;
                case COMMAND_GET_MODIFICATION_PARAMS:
                    this.GetModificationParams(request.id, request.language, request.value, onResponse, onError);
                    break;
                case COMMAND_SET_OBJECT:
                    this.SetObject(request.id, request.language, request.value, request.checksum, onResponse, onError);
                    break;
                case COMMAND_GET_REFACTORING_PARAMS:
                    this.GetRefactoringParams(request.source, request.target, request.action, onResponse, onError);
                    break;
                case COMMAND_PERFORM_REFACTORING:
                    this.PerformRefactoring(request.source, request.target, request.action, request.checksum, onResponse, onError);
                    break;
                case COMMAND_GET_REFERENCES_TO:
                    this.GetReferencesTo(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_REFERENCES_TO_COUNT:
                    this.GetReferencesToCount(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_REFERENCES_FROM:
                    this.GetReferencesFrom(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_REFERENCES_FROM_COUNT:
                    this.GetReferencesFromCount(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_TREE_CHILD_NODES:
                    this.GetTreeChildNodes(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_SEARCH_RESULTS:
                    this.GetSearchResults(request.key, request.value, onResponse, onError);
                    break;
                case COMMAND_GET_ID_KEY_VALUES:
                    this.GetIdKeyValues(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_ID_SELECTED_VALUES:
                    this.GetIdSelectedValues(request.id, request.language, onResponse, onError);
                    break;
                case COMMAND_IS_HMI_OBJECT:
                    this.IsHMIObject(request.id, onResponse, onError);
                    break;
                case COMMAND_SET_AVAILABILITY_AS_HMI_OBJECT:
                    this.SetAvailabilityAsHMIObject(request.id, request.available, onResponse, onError);
                    break;
                case COMMAND_GET_HMI_OBJECT:
                    this.GetHMIObject(request.queryParameterValue, onResponse, onError);
                    break;
                case COMMAND_GET_HMI_OBJECTS:
                    this.GetHMIObjects(onResponse, onError);
                    break;
                case COMMAND_IS_TASK_OBJECT:
                    this.IsTaskObject(request.id, onResponse, onError);
                    break;
                case COMMAND_SET_AVAILABILITY_AS_TASK_OBJECT:
                    this.SetAvailabilityAsTaskObject(request.id, request.available, onResponse, onError);
                    break;
                case COMMAND_GET_TASK_OBJECTS:
                    this.GetTaskObjects(onResponse, onError);
                    break;
                default:
                    onError(`EXCEPTION! Unexpected command: '${request.command}'`);
                    break;
            }
        }
        HandleFancyTreeRequest(request, identifier, onResponse, onError) {
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
                    this.GetTreeChildNodes(id, nodes => {
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
                                icon: that.GetIcon(node.path)
                            });
                        }
                        onResponse(ns);
                    }, onError);
                    break;
                case ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES:
                    this.GetReferencesTo(id, results => {
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
                                    icon: that.GetIcon(key)
                                };
                                nodes.push(node);
                                tasks.push((onSuc, onErr) => {
                                    that.GetReferencesToCount(key, count => {
                                        const folder = count > 0;
                                        node.folder = folder;
                                        node.lazy = folder;
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                        tasks.parallel = true;
                        Executor.run(tasks, () => onResponse(nodes), onError);
                    }, onError);
                    break;
                case ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES:
                    this.GetReferencesFrom(id, results => {
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
                                    icon: that.GetIcon(key)
                                };
                                nodes.push(node);
                                tasks.push((onSuc, onErr) => {
                                    that.GetReferencesFromCount(key, count => {
                                        const folder = count > 0;
                                        node.folder = folder;
                                        node.lazy = folder;
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                        tasks.parallel = true;
                        Executor.run(tasks, () => onResponse(nodes), onError);
                    }, onError);
                    break;
                default:
                    onResponse([]);
                    break;
            }
        }
        // Note: this next is a template method - copy when new request has to be implemented
        _$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$_$(onResponse, onError) {
            const that = this;
            this._getSqlAdapter(adapter => {
                const main = [];
                main.parallel = false;
                main.push((onSuc, onErr) => adapter.StartTransaction(onSuc, onErr));
                main.push(function (onSuc, onErr) {
                    // add this as often as reqzured and implement actions
                });
                Executor.run(main, () => {
                    adapter.CommitTransaction(() => {
                        adapter.Close();
                        onResponse();
                    }, (err) => {
                        adapter.Close();
                        onError(err);
                    });
                }, err => {
                    adapter.RollbackTransaction(() => {
                        adapter.Close();
                        onError(err);
                    }, er => {
                        adapter.Close();
                        onError(er);
                    });
                });
            }, onError);
        }
    }

    class ClientManager extends ContentManagerBase {
        constructor(onResponse, onError) {
            super();
            const that = this;
            this._post({
                command: COMMAND_GET_CONFIG
            }, config => {
                that._config = config;
                that._iconDirectory = config.iconDirectory;
                that._extensionsForType = config.extensionsForType;
                that._contentTablesKeyRegex = new RegExp(config.key_regex);
                that._exchange_header_regex = new RegExp(config.exchange_header_regex, 'g');
                const langs = config.languages.length;
                that._contentTablesByExtension = config.contentTablesByExtension;
                that._hmiTable = config.hmiTable;
                that._taskTable = config.taskTable;
                if (typeof onResponse === 'function') {
                    onResponse();
                }
            }, onError);
            validateAsContentManager(this, true);
        }
        _post(request, onResponse, onError) {
            Client.fetch(ContentManager.GET_CONTENT_DATA_URL, JsonFX.stringify(request, false), response => {
                if (response.length > 0) {
                    try {
                        const resp = JsonFX.parse(response, false, false);
                        if (resp.result !== undefined) {
                            onResponse(resp.result);
                        } else {
                            onError(resp.error);
                        }
                    } catch (error) {
                        onError(error);
                    }
                } else {
                    onResponse();
                }
            }, onError);
        }
        Exists(id, onResponse, onError) {
            this._post({ command: COMMAND_EXISTS, id }, onResponse, onError);
        }
        GetChecksum(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_CHECKSUM, id }, onResponse, onError);
        }
        GetObject(id, language, mode, onResponse, onError) {
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
                        if (that._config !== undefined && that._config.jsonfxPretty === true) {
                            // the 'jsonfxPretty' flag may be used to format our dynamically
                            // parsed JavaScript sources for more easy debugging purpose
                            // TODO: reuse or remove const match = that._contentTablesKeyRegex.exec(id);
                            // TOOD: response = eval('(' + JsonFX.stringify(response, true) + ')\n//# sourceURL=' + match[1] + '.js');
                            object = eval('(' + JsonFX.stringify(object, true) + ')');
                        }
                        onResponse(object);
                    } catch (exc) {
                        onError(exc);
                    }
                } else {
                    onResponse();
                }
            } : onResponse, onError);
        }
        GetModificationParams(id, language, value, onResponse, onError) {
            this._post({ command: COMMAND_GET_MODIFICATION_PARAMS, id, language, value }, onResponse, onError);
        }
        SetObject(id, language, value, checksum, onResponse, onError) {
            this._post({ command: COMMAND_SET_OBJECT, id, language, value, checksum }, onResponse, onError);
        }
        GetRefactoringParams(source, target, action, onResponse, onError) {
            this._post({ command: COMMAND_GET_REFACTORING_PARAMS, source, target, action }, onResponse, onError);
        }
        PerformRefactoring(source, target, action, checksum, onResponse, onError) {
            this._post({ command: COMMAND_PERFORM_REFACTORING, source, target, action, checksum }, onResponse, onError);
        }
        GetReferencesTo(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_REFERENCES_TO, id }, onResponse, onError);
        }
        GetReferencesToCount(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_REFERENCES_TO_COUNT, id }, onResponse, onError);
        }
        GetReferencesFrom(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_REFERENCES_FROM, id }, onResponse, onError);
        }
        GetReferencesFromCount(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_REFERENCES_FROM_COUNT, id }, onResponse, onError);
        }
        GetTreeChildNodes(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_TREE_CHILD_NODES, id }, onResponse, onError);
        }
        GetSearchResults(key, value, onResponse, onError) {
            this._post({ command: COMMAND_GET_SEARCH_RESULTS, key, value }, onResponse, onError);
        }
        GetIdKeyValues(id, onResponse, onError) {
            this._post({ command: COMMAND_GET_ID_KEY_VALUES, id }, onResponse, onError);
        }
        GetIdSelectedValues(id, language, onResponse, onError) {
            this._post({ command: COMMAND_GET_ID_SELECTED_VALUES, id, language }, onResponse, onError);
        }
        IsHMIObject(id, onResponse, onError) {
            this._post({ command: COMMAND_IS_HMI_OBJECT, id }, onResponse, onError);
        }
        SetAvailabilityAsHMIObject(id, available, onResponse, onError) {
            this._post({ command: COMMAND_SET_AVAILABILITY_AS_HMI_OBJECT, id, available }, onResponse, onError);
        }
        GetHMIObject(queryParameterValue, onResponse, onError) {
            const that = this;
            this._post({ command: COMMAND_GET_HMI_OBJECT, queryParameterValue }, response => {
                if (response !== undefined) {
                    try {
                        let object = JsonFX.reconstruct(response);
                        if (this._config !== undefined && this._config.jsonfxPretty === true) {
                            // the 'jsonfxPretty' flag may be used to format our dynamically
                            // parsed JavaScript sources for more easy debugging purpose
                            // TODO: reuse or remove const match = that._contentTablesKeyRegex.exec(id);
                            // TOOD: response = eval('(' + JsonFX.stringify(response, true) + ')\n//# sourceURL=' + match[1] + '.js');
                            object = eval('(' + JsonFX.stringify(object, true) + ')');
                        }
                        onResponse(object);
                    } catch (exc) {
                        onError(exc);
                    }
                } else {
                    onResponse();
                }
            }, onError);
        }
        GetHMIObjects(onResponse, onError) {
            this._post({ command: COMMAND_GET_HMI_OBJECTS }, onResponse, onError);
        }
        IsTaskObject(id, onResponse, onError) {
            this._post({ command: COMMAND_IS_TASK_OBJECT, id }, onResponse, onError);
        }
        SetAvailabilityAsTaskObject(id, available, onResponse, onError) {
            this._post({ command: COMMAND_SET_AVAILABILITY_AS_TASK_OBJECT, id, available }, onResponse, onError);
        }
        GetTaskObjects(onResponse, onError) {
            this._post({ command: COMMAND_GET_TASK_OBJECTS }, onResponse, onError);
        }
    }

    function createChecksum(group, path) {
        return Utilities.md5(`l.6l8033988749895${path}2.7l828l828459045${group}3.l4l592653589793`);
    }

    function createHeader(group, path) {
        return `[{(${group}<>${createChecksum(group, path)})}]\n${path}\n`;
    }

    function formatProgressInPercent(state) {
        return `${Utilities.formatNumber(state * 100, 2)}%`;
    }

    class ExchangeHandler {
        constructor(cms) {
            this._cms = cms;
        }
        // prototype
        _read_config_data(ids, path, languages, onProgressChanged, onError) {
            const exports = [createHeader(EXCHANGE_HEADER, path), '\n'];
            const cms = this._cms, tasks = [], len = ids.length;
            for (let i = 0; i < len; i++) {
                // closure
                (function () {
                    let idx = i, id = ids[idx], data = cms.AnalyzeId(id);
                    if (data.JsonFX) {
                        tasks.push((onSuc, onErr) => {
                            cms.GetObject(id, undefined, ContentManager.RAW, object => {
                                exports.push(createHeader(data.extension, id));
                                exports.push(JsonFX.stringify(JsonFX.reconstruct(object), true));
                                exports.push('\n\n');
                                onProgressChanged(formatProgressInPercent(idx / len));
                                onSuc();
                            }, onErr);
                        });
                    } else if (!data.multilingual) {
                        tasks.push((onSuc, onErr) => {
                            cms.GetObject(id, undefined, ContentManager.RAW, object => {
                                exports.push(createHeader(data.extension, id));
                                exports.push(object);
                                exports.push('\n\n');
                                onProgressChanged(formatProgressInPercent(idx / len));
                                onSuc();
                            }, onErr);
                        });
                    } else {
                        tasks.push((onSuc, onErr) => {
                            cms.GetObject(id, undefined, ContentManager.RAW, results => {
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
        }
        _parse(text, results, onProgressChanged, onError) {
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
                        const data = cms.AnalyzeId(path);
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
                                idx++;
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
        }
        _writeConfigData(data, onProgressChanged, onError) {
            const cms = this._cms, tasks = [];
            for (let i = 0, len = data.length; i < len; i++) {
                // closure
                (function () {
                    const idx = i, d = data[idx];
                    if (d.JsonFX) {
                        tasks.push((onSuc, onErr) => {
                            const val = d.value !== undefined && d.value !== null ? JsonFX.stringify(d.value, false) : undefined;
                            cms.GetModificationParams(d.id, undefined, val, params => cms.SetObject(d.id, undefined, val, params.checksum, onSuc, onErr), onErr);
                        });
                    } else if (!d.multilingual) {
                        tasks.push((onSuc, onErr) => {
                            const val = d.value !== undefined && d.value !== null ? d.value : undefined;
                            cms.GetModificationParams(d.id, undefined, val, params => cms.SetObject(d.id, undefined, val, params.checksum, onSuc, onErr));
                        });
                    } else {
                        tasks.push((onSuc, onErr) => {
                            const val = d.value !== undefined && d.value !== null ? d.value : undefined;
                            cms.GetModificationParams(d.id, undefined, val, params => cms.SetObject(d.id, undefined, val, params.checksum, onSuc, onErr));
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
        }
        HandleImport(hmi, text, onProgressChanged, onError) {
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
                yes: () => that._writeConfigData(data, onProgressChanged, onError),
                cancel: () => onProgressChanged()
            });
        }
        HandleExport(id, onProgressChanged, onError) {
            const that = this, cms = this._cms, data = cms.AnalyzeId(id);
            onProgressChanged('load languages ...');
            const languages = cms.GetLanguages();
            languages.sort(compareKeys);
            if (data.file) {
                that._read_config_data([data.file], id, languages, onProgressChanged, onError);
            } else if (data.folder) {
                cms.GetIdKeyValues(data.folder, ids => {
                    ids.sort(compareKeys);
                    that._read_config_data(ids, id, languages, onProgressChanged, onError);
                }, onError);
            } else {
                onProgressChanged();
            }
        }
    }

    if (isNodeJS) {
        ContentManager.Instance = ServerManager;
    } else {
        ContentManager.Instance = ClientManager;
    }
    Object.freeze(ContentManager);
    if (isNodeJS) {
        module.exports = ContentManager;
    } else {
        window.ContentManager = ContentManager;
    }
}(globalThis));
