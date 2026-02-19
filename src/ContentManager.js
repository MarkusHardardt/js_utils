(function (root) {
    "use strict";
    const ContentManager = {};
    const isNodeJS = typeof require === 'function';
    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Server = isNodeJS ? require('./Server.js') : root.Server;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const SqlHelper = isNodeJS ? require('./SqlHelper.js') : root.SqlHelper;
    const Utilities = isNodeJS ? require('./Utilities.js') : root.Utilities;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    /*  ContentManager inferface  */
    function validateAsContentManager(instance, validateMethodArguments) {
        return Core.validateAs('ContentManager', instance, [
            'getExchangeHandler()',
            'getLanguages(array)',
            'isValidIdForType(id, type)',
            'getIdValidTestFunctionForType(type)',
            'getIdValidTestFunctionForLanguageValue()',
            'analyzeId(id)',
            'getExtensionForType(type)',
            'getIcon(id)',
            'compareIds(id1, id2)',
            'exists(id, onResponse, onError)',
            'getChecksum(id, onResponse, onError)',
            'getObject(id, language, mode, onResponse, onError)',
            'getModificationParams(id, language, value, onResponse, onError)',
            'setObject(id, language, value, checksum, onResponse, onError)',
            'getRefactoringParams(source, target, action, onResponse, onError)',
            'performRefactoring(source, target, action, checksum, onResponse, onError)',
            'getSearchResults(key, value, onResponse, onError)',
            'getIdKeyValues(id, onResponse, onError)',
            'getAllIdsForType(type, onResponse, onError)',
            'getAllForLanguage(language, onResponse, onError)',
            'isHMIObject(id, onResponse, onError)',
            'addDefaultHMIObject(id, onResponse, onError)',
            'getHMIObject(queryParameterValue, language, onResponse, onError)',
            'getHMIObjects(onResponse, onError)',
            'isTaskObject(id, onResponse, onError)',
            'addDefaultTaskObject(id, onResponse, onError)'
        ], validateMethodArguments);
    }
    ContentManager.validateAsContentManager = validateAsContentManager;

    function validateAsContentManagerOnServer(instance, validateMethodArguments) {
        validateAsContentManager(instance, validateMethodArguments);
        return Core.validateAs('ContentManager', instance, [
            'getTaskObjects(onResponse, onError)',
            'registerAffectedTypesListener(type, onChanged)',
            'registerOnWebServer(webServer)' // Registers web server 'POST' and 'GET' (for fancy tree) handling
        ], validateMethodArguments);
    }
    ContentManager.validateAsContentManagerOnServer = validateAsContentManagerOnServer;

    const DataType = Object.freeze({
        JsonFX: 'JsonFX',
        Text: 'Text',
        Label: 'Label',
        HTML: 'HTML',
        HMI: 'HMI',
        Task: 'Task'
    });
    ContentManager.DataType = DataType;

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
    ContentManager.TASK_FLAG_AUTORUN = 0x01;


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
    const COMMAND_GET_SEARCH_RESULTS = 'get_search_results';
    const COMMAND_GET_ID_KEY_VALUES = 'get_id_key_values';
    const COMMAND_GET_ALL_IDS_FOR_TYPE = 'get_all_ids_for_type';
    const COMMAND_GET_ALL_FOR_LANGUAGE = 'get_all_for_language';
    const COMMAND_IS_HMI_OBJECT = 'is_hmi_object';
    const COMMAND_SET_AVAILABILITY_AS_HMI_OBJECT = 'set_availability_as_hmi_object';
    const COMMAND_GET_HMI_OBJECT = 'get_hmi_object';
    const COMMAND_GET_HMI_OBJECTS = 'get_hmi_objects';
    const COMMAND_IS_TASK_OBJECT = 'is_task_object';
    const COMMAND_SET_AVAILABILITY_AS_TASK_OBJECT = 'set_availability_as_task_object';

    const VALID_EXT_REGEX = /^\w+$/;
    const VALID_NAME_CHAR = '[a-zA-Z0-9_+\\-*]';
    const FOLDER_REGEX = new RegExp('^\\$((?:' + VALID_NAME_CHAR + '+\\/)*)$');
    const EXCHANGE_HEADER = 'js-hmi-config-exchange-data';

    const AUTO_KEY_LENGTH = 8;

    class ContentManagerBase {
        constructor() {
            if (this.constructor === ContentManagerBase) {
                throw new Error('The abstract base class ContentManagerBase cannot be instantiated.')
            }
        }

        getExchangeHandler() {
            return new ExchangeHandler(this);
        }

        getLanguages(array) {
            return Utilities.copyArray(this._config.languages, array);
        }

        isValidIdForType(id, type) {
            const regex = this._validIdForTypeRegex[type];
            if (regex) {
                return regex.test(id);
            } else {
                throw new Error(`Unsupported type: '${type}'`);
            }
        }

        getIdValidTestFunctionForType(type) {
            const regex = this._validIdForTypeRegex[type];
            if (regex) {
                return id => regex.test(id);
            } else {
                throw new Error(`Unsupported type: '${type}'`);
            }
        }

        getIdValidTestFunctionForLanguageValue() {
            const regex = this._validIdForLanguageValueRegex;
            return id => regex.test(id);
        }

        analyzeId(id) {
            let match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                return this.#getDescriptor(match[2], { id, path: match[1], file: id, extension: match[2] });
            }
            match = FOLDER_REGEX.exec(id);
            if (match) {
                return { id, path: match[1], folder: id };
            }
            return { id };
        }

        #getDescriptor(extension, description) {
            const table = this._contentTablesByExtension[extension];
            if (table) {
                const desc = description || {};
                desc.type = table.type;
                return desc;
            } else {
                return false;
            }
        }

        getExtensionForType(type) {
            return this._extensionsForType[type];
        }

        getIcon(id) {
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

        compareIds(id1, id2) {
            if (FOLDER_REGEX.test(id1)) {
                return FOLDER_REGEX.test(id2) ? Sorting.compareTextsAndNumbers(id1, id2, false, false) : -1;
            } else {
                return FOLDER_REGEX.test(id2) ? 1 : Sorting.compareTextsAndNumbers(id1, id2, false, false);
            }
        }
    }

    const compareKeys = Sorting.getTextsAndNumbersCompareFunction(false, false, true);

    class ServerManager extends ContentManagerBase {
        #logger;
        #getSqlAdapter;
        #parallel;
        #affectedTypesListeners;
        #hmiTable;
        #taskTable;
        constructor(logger, getSqlAdapter, iconDirectory, config) {
            super();
            this.#logger = Common.validateAsLogger(logger, true);
            if (typeof getSqlAdapter !== 'function') {
                throw new Error('No database access provider available!');
            }
            this.#getSqlAdapter = getSqlAdapter;
            this._iconDirectory = `/${iconDirectory}/`;
            const db_config = require(typeof config === 'string' ? config : '../cfg/db_config.json');
            this._config = db_config;
            this.#parallel = typeof db_config.maxParallelQueries === 'number' && db_config.maxParallelQueries > 0 ? db_config.maxParallelQueries : true;
            this._contentTablesByExtension = {};
            this._extensionsForType = {};
            this.#affectedTypesListeners = {};
            for (const type in DataType) {
                if (DataType.hasOwnProperty(type)) {
                    this.#affectedTypesListeners[type] = [];
                }
            }
            this._validIdForTypeRegex = {};
            const tableExtensions = [];
            const tableLanguageExtensions = [];
            for (const type in this._config.tables) {
                if (this._config.tables.hasOwnProperty(type)) {
                    const tableConfig = this._config.tables[type];
                    const extension = tableConfig.extension;
                    if (!VALID_EXT_REGEX.test(extension)) {
                        throw new Error(`Invalid extension: '${extension}'`);
                    } else if (this._contentTablesByExtension[extension] !== undefined) {
                        throw new Error(`Extension already exists: '${extension}'`);
                    }
                    const table = {
                        type,
                        name: tableConfig.name,
                        keyColumn: tableConfig.keyColumn,
                        icon: tableConfig.icon,
                        JsonFX: type === DataType.JsonFX
                    };
                    switch (type) {
                        case DataType.JsonFX:
                        case DataType.Text:
                            if (typeof tableConfig.valueColumn !== 'string') {
                                throw new Error(`Missing value column parameter for table type '${type}'`);
                            }
                            table.valueColumn = tableConfig.valueColumn;
                            break;
                        case DataType.Label:
                        case DataType.HTML:
                            if (typeof tableConfig.valueColumnPrefix !== 'string') {
                                throw new Error(`Missing value column prefix parameter for table type '${type}'`);
                            } else if (db_config.languages.length === 0) {
                                throw new Error(`Language array has zero length for table type '${type}'`);
                            }
                            table.valueColumn = {};
                            for (let language of db_config.languages) {
                                table.valueColumn[language] = tableConfig.valueColumnPrefix + language;
                            }
                            tableLanguageExtensions.push(extension);
                            break;
                        case DataType.HMI:
                            if (typeof tableConfig.viewObjectColumn !== 'string') {
                                throw new Error(`Missing view object column parameter for table type '${type}'`);
                            } else if (typeof tableConfig.queryParameterColumn !== 'string') {
                                throw new Error(`Missing query parameter column parameter for table type '${type}'`);
                            } else if (typeof tableConfig.flagsColumn !== 'string') {
                                throw new Error(`Missing flags column parameter for table type '${type}'`);
                            }
                            table.viewObjectColumn = tableConfig.viewObjectColumn;
                            table.queryParameterColumn = tableConfig.queryParameterColumn;
                            table.flagsColumn = tableConfig.flagsColumn;
                            table.valueColumn = {
                                viewObjectColumn: tableConfig.viewObjectColumn,
                                queryParameterColumn: tableConfig.queryParameterColumn,
                                flagsColumn: tableConfig.flagsColumn
                            };
                            this.#hmiTable = table;
                            break;
                        case DataType.Task:
                            if (typeof tableConfig.taskObjectColumn !== 'string') {
                                throw new Error(`Missing task object column parameter for table type '${type}'`);
                            } else if (typeof tableConfig.flagsColumn !== 'string') {
                                throw new Error(`Missing flags column parameter for table type '${type}'`);
                            } else if (typeof tableConfig.cycleIntervalMillisColumn !== 'string') {
                                throw new Error(`Missing cycle tnterval millis column column parameter for table type '${type}'`);
                            }
                            table.taskObjectColumn = tableConfig.taskObjectColumn;
                            table.flagsColumn = tableConfig.flagsColumn;
                            table.cycleIntervalMillisColumn = tableConfig.cycleIntervalMillisColumn;
                            table.valueColumn = {
                                taskObjectColumn: tableConfig.taskObjectColumn,
                                flagsColumn: tableConfig.flagsColumn,
                                cycleIntervalMillisColumn: tableConfig.cycleIntervalMillisColumn
                            };
                            this.#taskTable = table;
                            break;
                        default:
                            throw new Error(`Unsupported table type: '${type}'`);
                    }
                    this._contentTablesByExtension[extension] = table;
                    this._extensionsForType[type] = extension;
                    this._validIdForTypeRegex[type] = new RegExp(`^\\$(?:${VALID_NAME_CHAR}+\\/)*?${VALID_NAME_CHAR}+?\\.${extension}$`);
                    tableExtensions.push(extension);
                }
            }
            this._validIdForLanguageValueRegex = new RegExp(`^\\$(?:${VALID_NAME_CHAR}+\\/)*?${VALID_NAME_CHAR}+?\\.(?:${tableLanguageExtensions.join('|')})$`);
            // we need all available extensions for building regular expressions
            const tabexts = tableExtensions.join('|');
            this._contentTablesKeyRegex = new RegExp(`^\\$((?:${VALID_NAME_CHAR}+\\/)*?${VALID_NAME_CHAR}+?)\\.(${tabexts})$`);
            this._refactoring_match = `((?:${VALID_NAME_CHAR}+\\/)*?${VALID_NAME_CHAR}+?\\.(?:${tabexts}))\\b`;
            this._include_regex_build = new RegExp(`(\'|")?include:\\$((?:${VALID_NAME_CHAR}+\\/)*${VALID_NAME_CHAR}+?)\\.(${tabexts})\\b\\1`, 'g');
            this._exchangeHeaderRegex = new RegExp(`\\[\\{\\((${tabexts}|language|${Regex.escape(EXCHANGE_HEADER)})<>([a-f0-9]{32})\\)\\}\\]\\n(.*)\\n`, 'g');
            validateAsContentManagerOnServer(this, true);
        }

        #getRawString(adapter, table, rawKey, language, onResponse, onError) {
            const valueColumn = table.valueColumn, column = typeof valueColumn === 'string' ? valueColumn : valueColumn[language];
            if (typeof column === 'string') {
                adapter.addColumn(`${table.name}.${column} AS ${column}`);
                adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                adapter.performSelect(table.name, undefined, undefined, 1, (results, fields) => {
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

        exists(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                const table = this._contentTablesByExtension[match[2]];
                if (!table) {
                    onError(`Invalid table: ${id}`);
                    return;
                }
                this.#getSqlAdapter(adapter => this.#exists(adapter, table, match[1], exists => {
                    adapter.close();
                    onResponse(exists);
                }, error => {
                    adapter.close();
                    onError(error);
                }), onError);
            } else {
                onResponse(false);
            }
        }

        #exists(adapter, table, rawKey, onResponse, onError) {
            adapter.addColumn('COUNT(*) AS cnt');
            adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
            adapter.performSelect(table.name, undefined, undefined, undefined, result => onResponse(result[0].cnt > 0), onError);
        }

        getChecksum(id, onResponse, onError) {
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
            this.#getSqlAdapter(adapter => {
                const rawKey = match[1];
                let raw = id;
                function success() {
                    adapter.close();
                    onResponse(Utilities.md5(raw));
                }
                function error(err) {
                    adapter.close();
                    onError(err);
                };
                // if JsonFX or plain text is available we decode the string and
                // return with or without all includes included
                switch (table.type) {
                    case DataType.JsonFX:
                    case DataType.Text:
                        // note: no language required here because we got only one anyway
                        that.#getRawString(adapter, table, rawKey, undefined, rawString => {
                            if (rawString !== false) {
                                raw += ':';
                                raw += rawString;
                            }
                            success();
                        }, error);
                        break;
                    case DataType.Label:
                    case DataType.HTML:
                    case DataType.HMI:
                    case DataType.Task:
                        for (const attr in table.valueColumn) {
                            if (table.valueColumn.hasOwnProperty(attr)) {
                                adapter.addColumn(`${table.name}.${table.valueColumn[attr]} AS ${attr}`);
                            }
                        }
                        adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                        adapter.performSelect(table.name, undefined, undefined, 1, (results, fields) => {
                            if (results.length === 1) {
                                const object = results[0];
                                for (const attr in table.valueColumn) {
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

        getObject(id, language, mode, onResponse, onError) {
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
            this.#getSqlAdapter(adapter => this.#getObject(adapter, id, match[1], table, language, mode, response => {
                adapter.close();
                onResponse(response);
            }, error => {
                adapter.close(); // TODO: Why we have an exception calling this?
                onError(error);
            }), onError);
        }

        #getObject(adapter, id, rawKey, table, language, mode, onResponse, onError) {
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
                case DataType.JsonFX:
                case DataType.Text:
                    // note: no language required here because we got only one anyway
                    that.#getRawString(adapter, table, rawKey, undefined, rawString => {
                        if (rawString !== false) {
                            const object = table.type === DataType.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                            if (include) {
                                const ids = {};
                                ids[id] = true;
                                that.#include(adapter, object, ids, language, success, onError);
                            } else {
                                success(object);
                            }
                        } else {
                            success();
                        }
                    }, onError);
                    break;
                case DataType.Label:
                case DataType.HTML:
                    if (typeof language === 'string') {
                        // if selection is available we return string with or without all
                        // includes included
                        that.#getRawString(adapter, table, rawKey, language, rawString => {
                            if (rawString !== false) {
                                if (include) {
                                    const ids = {};
                                    ids[id] = true;
                                    that.#include(adapter, rawString, ids, language, success, onError);
                                } else {
                                    success(rawString);
                                }
                            } else {
                                success();
                            }
                        }, onError);
                    } else {
                        for (const attr in table.valueColumn) {
                            if (table.valueColumn.hasOwnProperty(attr)) {
                                adapter.addColumn(`${table.name}.${table.valueColumn[attr]} AS ${attr}`);
                            }
                        }
                        adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
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
                                                    that.#include(adapter, object[language], ids, language, response => {
                                                        object[language] = response;
                                                        onSuc();
                                                    }, onErr);
                                                });
                                            }());
                                        }
                                    }
                                    tasks.parallel = that.#parallel;
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
                case DataType.HMI:
                case DataType.Task:
                    for (const attr in table.valueColumn) {
                        if (table.valueColumn.hasOwnProperty(attr)) {
                            adapter.addColumn(`${table.name}.${table.valueColumn[attr]} AS ${attr}`);
                        }
                    }
                    adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                    adapter.performSelect(table.name, undefined, undefined, 1, (results, fields) => {
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

        #include(adapter, object, ids, language, onResponse, onError) {
            const that = this;
            if (Array.isArray(object)) {
                this.#buildProperties(adapter, object, ids, language, onResponse, onError);
            } else if (typeof object === 'object' && object !== null) {
                const includeKey = object.include;
                const match = typeof includeKey === 'string' && !ids[includeKey] ? this._contentTablesKeyRegex.exec(includeKey) : false;
                if (!match) {
                    this.#buildProperties(adapter, object, ids, language, onResponse, onError);
                    return;
                }
                const table = this._contentTablesByExtension[match[2]];
                if (!table) {
                    this.#buildProperties(adapter, object, ids, language, onResponse, onError);
                    return;
                }
                this.#getRawString(adapter, table, match[1], language, rawString => {
                    if (rawString !== false) {
                        ids[includeKey] = true;
                        const includedObject = table.type === DataType.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                        that.#include(adapter, includedObject, ids, language, inclObj => {
                            delete ids[includeKey];
                            if (typeof inclObj === 'object' && inclObj !== null) {
                                // if we included an object all attributes except
                                // include must be copied
                                delete object.include;
                                that.#buildProperties(adapter, object, ids, language, () => {
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
                        that.#buildProperties(adapter, object, ids, language, onResponse, onError);
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
                                    that.#getRawString(adapter, table, rawKey, language, rawString => {
                                        if (rawString !== false) {
                                            ids[includeKey] = true;
                                            const object = table.type === DataType.JsonFX ? JsonFX.parse(rawString, false, false) : rawString;
                                            that.#include(adapter, object, ids, language, build => {
                                                delete ids[includeKey];
                                                array[idx] = table.type === DataType.JsonFX && array.length > 1 ? JsonFX.stringify(build, false) : build;
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
                tasks.parallel = that.#parallel;
                // if our string contains just one single element we return this as is.
                Executor.run(tasks, () => onResponse(array.length === 1 ? array[0] : array.join('')), onError);
            } else {
                // if our input object is not an array, an object or a string we have
                // nothing to build so we return the object as is.
                onResponse(object);
            }
        }

        #buildProperties(adapter, object, ids, language, onResponse, onError) {
            const that = this;
            const tasks = [];
            for (const a in object) {
                if (object.hasOwnProperty(a)) {
                    (function () {
                        const p = a;
                        tasks.push((onSuc, onErr) => {
                            that.#include(adapter, object[p], ids, language, objectProperty => {
                                object[p] = objectProperty;
                                onSuc();
                            }, onErr);
                        });
                    }());
                }
            }
            tasks.parallel = this.#parallel;
            Executor.run(tasks, () => onResponse(object), onError);
        }

        #getModificationParams(adapter, id, language, value, onResponse, onError) {
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
                case DataType.JsonFX:
                case DataType.Text:
                    adapter.addColumn(`${table.name}.${table.valueColumn} AS ${table.valueColumn}`);
                    break;
                case DataType.Label:
                case DataType.HTML:
                    // in case of a multiligual data type and a given language we got to make
                    // sure that language is supported
                    if (typeof language === 'string' && table.valueColumn[language] === undefined) {
                        params.error = `Invalid language '${language}'`;
                        onResponse(params);
                        return;
                    }
                    for (const attr in table.valueColumn) {
                        if (table.valueColumn.hasOwnProperty(attr)) {
                            adapter.addColumn(`${table.name}.${table.valueColumn[attr]} AS ${table.valueColumn[attr]}`);
                        }
                    }
                    break;
                case DataType.HMI:
                case DataType.Task:
                    for (const attr in table.valueColumn) {
                        if (table.valueColumn.hasOwnProperty(attr)) {
                            adapter.addColumn(`${table.name}.${table.valueColumn[attr]} AS ${table.valueColumn[attr]}`);
                        }
                    }
                    break;
                default:
                    onError(`Unsupported type for modification: '${table.type}'`);
                    return;
            }
            adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(match[1])}`);
            adapter.performSelect(table.name, undefined, undefined, 1, (result, fields) => {
                const currentData = result.length === 1 ? result[0] : undefined;
                // here we store the conditions
                let stillNotEmpty = false;
                let changed = false;
                const values = {};
                let checksum = '';
                switch (table.type) {
                    case DataType.JsonFX:
                    case DataType.Text:
                        {
                            checksum += table.valueColumn;
                            const currval = getValueForAttribute(currentData, table.valueColumn);
                            const nextval = typeof value === 'string' ? value : undefined;
                            const params = getModificationParams(currval, nextval);
                            if (!params.empty) {
                                stillNotEmpty = true;
                            }
                            if (params.changed) {
                                changed = true;
                            }
                            values[table.valueColumn] = params;
                            checksum += params.empty ? 'e' : 'd';
                            checksum += params.changed ? 'e' : 'd';
                            if (typeof params.string === 'string') {
                                checksum += params.string;
                            }
                        }
                        break;
                    case DataType.Label:
                    case DataType.HTML:
                        for (const attr in table.valueColumn) {
                            if (table.valueColumn.hasOwnProperty(attr)) {
                                // for all columns we try to get the current and new value
                                const currval = getValueForAttribute(currentData, table.valueColumn[attr]);
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
                    case DataType.HMI:
                    case DataType.Task:
                        // TODO: remove console.log(`currentData: ${JSON.stringify(currentData)}, value: ${JSON.stringify(value)}`);
                        // currentData: {"jsonFxObjectKey":"$001_debug/maze_game.j","flags":1}, value: {"jsonFxObjectKey":"$001_debug/m aze_game.j","flags":1}
                        for (const attr in table.valueColumn) {
                            if (table.valueColumn.hasOwnProperty(attr)) {
                                // for all columns we try to get the current and new value
                                const currval = getValueForAttribute(currentData, table.valueColumn[attr]);
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

        getModificationParams(id, language, value, onResponse, onError) {
            const that = this;
            this.#getSqlAdapter(adapter => {
                that.#getModificationParams(adapter, id, language, value, params => {
                    if (!params.error && params.action === ContentManager.DELETE) {
                        that.#getReferencesFromObjectWithId(adapter, id, referencesFrom => {
                            if (referencesFrom.length > 0) {
                                params.externalUsers = referencesFrom;
                            }
                            adapter.close();
                            onResponse(params);
                        }, err => {
                            adapter.close();
                            onError(err);
                        });
                    } else {
                        adapter.close();
                        onResponse(params);
                    }
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        }

        setObject(id, language, value, checksum, onResponse, onError) {
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
            this.#getSqlAdapter(adapter => {
                const tasks = [], affectedTypes = {};
                tasks.parallel = false;
                tasks.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
                tasks.push((onSuc, onErr) => {
                    that.#getModificationParams(adapter, id, language, value, params => {
                        if (params.error !== undefined) {
                            onErr(params.error);
                        } else if (params.checksum !== checksum) {
                            onErr('Database content has changed! Try again!');
                        } else if (params.action === ContentManager.NONE) {
                            onErr('No action to perform!');
                        } else if (params.action === ContentManager.INSERT) {
                            adapter.addValue(`${table.name}.${table.keyColumn}`, SqlHelper.escape(rawKey));
                            switch (table.type) {
                                case DataType.JsonFX:
                                case DataType.Text:
                                    {
                                        const value = params.values[table.valueColumn];
                                        if (value.changed) {
                                            adapter.addValue(`${table.name}.${table.valueColumn}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                        }
                                    }
                                    break;
                                case DataType.Label:
                                case DataType.HTML:
                                case DataType.HMI:
                                case DataType.Task:
                                    for (const attr in table.valueColumn) {
                                        if (table.valueColumn.hasOwnProperty(attr)) {
                                            const value = params.values[attr];
                                            if (value.changed) {
                                                adapter.addValue(`${table.name}.${table.valueColumn[attr]}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                            }
                                        }
                                    }
                                    break;
                                default:
                                    onErr(`Cannot insert unsupported type: ${table.type}`);
                                    return;
                            }
                            adapter.performInsert(table.name, () => {
                                affectedTypes[table.type] = true;
                                onSuc();
                            }, onErr);
                        } else if (params.action === ContentManager.UPDATE) {
                            switch (table.type) {
                                case DataType.JsonFX:
                                case DataType.Text:
                                    {
                                        const value = params.values[table.valueColumn];
                                        if (value.changed) {
                                            adapter.addValue(`${table.name}.${table.valueColumn}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                        }
                                    }
                                    break;
                                case DataType.Label:
                                case DataType.HTML:
                                case DataType.HMI:
                                case DataType.Task:
                                    for (const attr in table.valueColumn) {
                                        if (table.valueColumn.hasOwnProperty(attr)) {
                                            const value = params.values[attr];
                                            if (value.changed) {
                                                adapter.addValue(`${table.name}.${table.valueColumn[attr]}`, typeof value.string === 'string' ? SqlHelper.escape(value.string) : null);
                                            }
                                        }
                                    }
                                    break;
                                default:
                                    onErr(`Cannot update unsupported type: ${table.type}`);
                                    return;
                            }
                            adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                            adapter.performUpdate(table.name, undefined, 1, () => {
                                affectedTypes[table.type] = true;
                                onSuc();
                            }, onErr);
                        } else if (params.action === ContentManager.DELETE) {
                            adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(rawKey)}`);
                            adapter.performDelete(table.name, undefined, 1, () => {
                                affectedTypes[table.type] = true;
                                onSuc();
                            }, onErr);
                        } else {
                            onErr(`Unexpected action: '${params.action}'`);
                        }
                    }, onErr);
                });
                Executor.run(tasks, () => {
                    adapter.commitTransaction(() => {
                        adapter.close();
                        onResponse();
                        this.#nofifyAffectedTypes(affectedTypes);
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
        }

        #getRefactoringParams(adapter, source, target, action, onResponse, onError) {
            // here we store the result
            const params = {};
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
            let match = this._contentTablesKeyRegex.exec(source);
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
                match = this._contentTablesKeyRegex.exec(target);
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
                                    adapter.addColumn(`${table.name}.${table.keyColumn} AS path`);
                                    // select all paths within the range
                                    adapter.addWhere(`LOCATE(${SqlHelper.escape(srcTabKey)},${table.name}.${table.keyColumn}) = 1`);
                                    adapter.performSelect(table.name, undefined, undefined, undefined, result => {
                                        for (let i = 0, l = result.length; i < l; i++) {
                                            srcKeysObj[`$${result[i].path}.${ext}`] = true;
                                        }
                                        os();
                                    }, oe);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that.#parallel;
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
                            const match = that._contentTablesKeyRegex.exec(tgt);
                            const table = that._contentTablesByExtension[match[2]];
                            const tabKeyEsc = SqlHelper.escape(match[1]);
                            tasks.push((os, or) => {
                                adapter.addColumn('COUNT(*) AS cnt');
                                adapter.addWhere(`${table.name}.${table.keyColumn} = ${tabKeyEsc}`);
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
                tasks.parallel = that.#parallel;
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
                                that.#getReferencesFromObjectWithId(adapter, source, referencesFrom => {
                                    for (let r = 0; r < referencesFrom.length; r++) {
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
                tasks.parallel = that.#parallel;
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
                    params.externalUsers = extRefsArray;
                    const l = extRefsArray.length;
                    for (let i = 0; i < l; i++) {
                        checksum += extRefsArray[i];
                    }
                }
                params.checksum = Utilities.md5(checksum);
                onResponse(params);
            }, onError);
        }

        getRefactoringParams(source, target, action, onResponse, onError) {
            const that = this;
            this.#getSqlAdapter(adapter => {
                that.#getRefactoringParams(adapter, source, target, action, params => {
                    adapter.close();
                    onResponse(params);
                }, err => {
                    adapter.close();
                    onError(err);
                });
            }, onError);
        }

        performRefactoring(source, target, action, checksum, onResponse, onError) {
            const that = this;
            this.#getSqlAdapter(adapter => {
                const main = [], affectedTypes = {};
                // the main action has to be processed in a sequence wo we do not run
                // in
                // parallel
                main.parallel = false;
                // we run this as a transaction wo enable rollbacks (just in case
                // something unexpected happens)
                main.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
                main.push((onSuc, onErr) => {
                    that.#getRefactoringParams(adapter, source, target, action, params => {
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
                                            tasks.push((os, oe) => that.#performRefactoring(adapter, src, params, replace, affectedTypes, os, oe));
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
                                                    adapter.addWhere(`LOCATE(${srcTabKey},${table.name}.${table.keyColumn}) = 1`);
                                                    adapter.performDelete(table.name, undefined, undefined, () => {
                                                        affectedTypes[table.type] = true;
                                                        os();
                                                    }, oe);
                                                });
                                            }());
                                        }
                                    }
                                } else {
                                    const match = that._contentTablesKeyRegex.exec(source);
                                    const table = that._contentTablesByExtension[match[2]], srcTabKey = SqlHelper.escape(match[1]);
                                    tasks.push((os, oe) => {
                                        adapter.addWhere(`${table.name}.${table.keyColumn} = ${srcTabKey}`);
                                        adapter.performDelete(table.name, undefined, 1, () => {
                                            affectedTypes[table.type] = true;
                                            os();
                                        }, oe);
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
                        onResponse();
                        this.#nofifyAffectedTypes(affectedTypes);
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
        }

        #performRefactoring(adapter, source, params, getReplacement, affectedTypes, onResponse, onError) {
            const that = this;
            const match = this._contentTablesKeyRegex.exec(source);
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
                        case DataType.JsonFX:
                        case DataType.Text:
                            adapter.addColumn(`${table.name}.${table.valueColumn}`);
                            break;
                        case DataType.Label:
                        case DataType.HTML:
                        case DataType.HMI:
                        case DataType.Task:
                            for (const attr in table.valueColumn) {
                                if (table.valueColumn.hasOwnProperty(attr)) {
                                    adapter.addColumn(`${table.name}.${table.valueColumn[attr]}`);
                                }
                            }
                            break;
                    }
                    adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(srcTabKey)}`);
                    adapter.performSelect(table.name, undefined, undefined, 1, results => {
                        const values = results[0];
                        // replace internal cross references and prepare database
                        // update or insert value
                        switch (table.type) {
                            case DataType.JsonFX:
                            case DataType.Text:
                                let string = values[table.valueColumn];
                                if (typeof string === 'string' && string.length > 0) {
                                    string = getReplacement(string);
                                    adapter.addValue(`${table.name}.${table.valueColumn}`, SqlHelper.escape(string));
                                }
                                break;
                            case DataType.Label:
                            case DataType.HTML:
                            case DataType.HMI:
                            case DataType.Task:
                                for (const attr in table.valueColumn) {
                                    if (table.valueColumn.hasOwnProperty(attr)) {
                                        const value = values[table.valueColumn[attr]];
                                        if (typeof value === 'string' && value.length > 0) {
                                            const string = getReplacement(value);
                                            adapter.addValue(`${table.name}.${table.valueColumn[attr]}`, SqlHelper.escape(string));
                                        } else if (value !== undefined && value !== null) {
                                            const string = value.toString();
                                            adapter.addValue(`${table.name}.${table.valueColumn[attr]}`, SqlHelper.escape(string));
                                        }
                                    }
                                }
                                break;
                        }
                        const match = that._contentTablesKeyRegex.exec(target);
                        const tgtTabKey = match[1];
                        function success() {
                            if (targetAlreadyExists && params.action === ContentManager.MOVE) {
                                adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(srcTabKey)}`);
                                adapter.performDelete(table.name, undefined, 1, () => {
                                    affectedTypes[table.type] = true;
                                    onSuc();
                                }, onErr);
                            } else {
                                affectedTypes[table.type] = true;
                                onSuc();
                            }
                        };
                        if (targetAlreadyExists) {
                            adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(tgtTabKey)}`);
                            adapter.performUpdate(table.name, undefined, 1, success, onErr);
                        } else {
                            adapter.addValue(`${table.name}.${table.keyColumn}`, SqlHelper.escape(tgtTabKey));
                            if (params.action === ContentManager.MOVE) {
                                adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(srcTabKey)}`);
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
                    that.#getReferencesFromObjectWithId(adapter, source, referencesFrom => {
                        const tasks = [], jl = referencesFrom.length;
                        tasks.parallel = false;
                        for (let j = 0; j < jl; j++) {
                            const refFrom = referencesFrom[j];
                            if (params.objects[refFrom] === undefined) {
                                (function () {
                                    const match = that._contentTablesKeyRegex.exec(refFrom);
                                    const table = that._contentTablesByExtension[match[2]];
                                    const usrKey = match[1];
                                    tasks.push((os, oe) => {
                                        switch (table.type) {
                                            case DataType.JsonFX:
                                            case DataType.Text:
                                                adapter.addColumn(`${table.name}.${table.valueColumn} AS ${table.valueColumn}`);
                                                break;
                                            case DataType.Label:
                                            case DataType.HTML:
                                            case DataType.HMI:
                                            case DataType.Task:
                                                for (const attr in table.valueColumn) {
                                                    if (table.valueColumn.hasOwnProperty(attr)) {
                                                        adapter.addColumn(`${table.name}.${table.valueColumn[attr]} AS ${table.valueColumn[attr]}`);
                                                    }
                                                }
                                                break;
                                        }
                                        adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(usrKey)}`);
                                        adapter.performSelect(table.name, undefined, undefined, 1, result => {
                                            // replace in all existing value strings all occurrences
                                            // of
                                            // any source path with the resulting target path and
                                            // update object
                                            const values = result[0];
                                            switch (table.type) {
                                                case DataType.JsonFX:
                                                case DataType.Text:
                                                    let string = values[table.valueColumn];
                                                    if (typeof string === 'string' && string.length > 0) {
                                                        string = getReplacement(string);
                                                        adapter.addValue(`${table.name}.${table.valueColumn}`, SqlHelper.escape(string));
                                                    }
                                                    break;
                                                case DataType.Label:
                                                case DataType.HTML:
                                                case DataType.HMI:
                                                case DataType.Task:
                                                    for (const attr in table.valueColumn) {
                                                        if (table.valueColumn.hasOwnProperty(attr)) {
                                                            let string = values[table.valueColumn[attr]];
                                                            if (typeof string === 'string' && string.length > 0) {
                                                                string = getReplacement(string);
                                                                adapter.addValue(`${table.name}.${table.valueColumn[attr]}`, SqlHelper.escape(string));
                                                            }
                                                        }
                                                    }
                                                    break;
                                            }
                                            adapter.addWhere(`${table.name}.${table.keyColumn} = ${SqlHelper.escape(usrKey)}`);
                                            adapter.performUpdate(table.name, undefined, 1, () => {
                                                affectedTypes[table.type] = true;
                                                os();
                                            }, oe);
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

        registerAffectedTypesListener(type, onChanged) {
            const listeners = this.#affectedTypesListeners[type];
            if (listeners === undefined) {
                throw new Error(`Failed to register listener for unknown type: '${type}'`);
            } else if (typeof onChanged !== 'function') {
                throw new Error('Failed to register listener because onChanged() is not a function');
            } else {
                for (let listener of listeners) {
                    if (listener === onChanged) {
                        throw new Error('Failed to register listener because onChanged() is already stored');
                    }
                }
                listeners.push(onChanged);
            }
        }

        #nofifyAffectedTypes(affectedTypes) {
            for (const type in affectedTypes) {
                if (affectedTypes.hasOwnProperty(type) && affectedTypes[type] === true) {
                    const listeners = this.#affectedTypesListeners[type];
                    for (let onChanged of listeners) {
                        try {
                            onChanged();
                        } catch (error) {
                            console.error(`Failed calling onChanged() for type '${type}': ${error}`);
                        }
                    }
                }
            }
        }

        #getReferencesTo(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                const user = this._contentTablesByExtension[match[2]];
                if (!user) {
                    onError(`Invalid table: '${id}'`);
                    return;
                }
                const that = this;
                this.#getSqlAdapter(adapter => {
                    const rawKey = SqlHelper.escape(match[1]);
                    const keys = {};
                    const tasks = [];
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const used = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.addColumn(`tab.${used.keyColumn} AS path`);
                                    adapter.addWhere(`${user.name}.${user.keyColumn} = ${rawKey}`);
                                    adapter.addJoin(formatReferencesToCondition(user.name, user.valueColumn, used.name, 'tab', ext, used.keyColumn));
                                    adapter.performSelect(user.name, undefined, undefined, undefined, result => {
                                        for (let i = 0, l = result.length; i < l; i++) {
                                            keys[`$${result[i].path}.${ext}`] = true;
                                        }
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that.#parallel;
                    Executor.run(tasks, () => {
                        const array = [];
                        for (const key in keys) {
                            if (keys.hasOwnProperty(key)) {
                                array.push(key);
                            }
                        }
                        adapter.close();
                        onResponse(array);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            }
            else {
                // if invalid key we simply found no reference
                onResponse([]);
            }
        }

        #getReferencesToCount(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (match) {
                const user = this._contentTablesByExtension[match[2]];
                if (!user) {
                    onError(`Invalid table: '${id}'`);
                    return;
                }
                const that = this;
                this.#getSqlAdapter(adapter => {
                    const rawKey = SqlHelper.escape(match[1]);
                    const tasks = [];
                    let result = 0;
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const used = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.addColumn('COUNT(*) AS cnt');
                                    adapter.addWhere(`${user.name}.${user.keyColumn} = ${rawKey}`);
                                    adapter.addJoin(formatReferencesToCondition(user.name, user.valueColumn, used.name, 'tab', ext, used.keyColumn));
                                    adapter.performSelect(user.name, undefined, undefined, undefined, response => {
                                        result += response[0].cnt;
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that.#parallel;
                    Executor.run(tasks, () => {
                        adapter.close();
                        onResponse(result);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            } else {
                // if invalid key we simply found no reference
                onResponse(0);
            }
        }

        #getReferencesFromObjectWithId(adapter, id, onResponse, onError) {
            const that = this, key = SqlHelper.escape(id), keys = {}, tasks = [];
            for (const extension in this._contentTablesByExtension) {
                if (this._contentTablesByExtension.hasOwnProperty(extension)) {
                    (function () {
                        const ext = extension;
                        const table = that._contentTablesByExtension[extension];
                        tasks.push((onSuc, onErr) => {
                            adapter.addColumn(`${table.name}.${table.keyColumn} AS path`);
                            switch (table.type) {
                                case DataType.JsonFX:
                                case DataType.Text:
                                    adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${table.valueColumn}`), false);
                                    break;
                                case DataType.Label:
                                case DataType.HTML:
                                case DataType.HMI:
                                case DataType.Task:
                                    for (const col in table.valueColumn) {
                                        if (table.valueColumn.hasOwnProperty(col)) {
                                            adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${table.valueColumn[col]}`), false);
                                        }
                                    }
                                    break;
                            }
                            adapter.performSelect(table.name, undefined, undefined, undefined, response => {
                                for (let i = 0, l = response.length; i < l; i++) {
                                    keys[`$${response[i].path}.${ext}`] = true;
                                }
                                onSuc();
                            }, onErr);
                        });
                    }());
                }
            }
            tasks.parallel = that.#parallel;
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

        #getReferencesFrom(id, onResponse, onError) {
            if (this._contentTablesKeyRegex.test(id)) {
                const that = this;
                this.#getSqlAdapter(adapter => {
                    that.#getReferencesFromObjectWithId(adapter, id, results => {
                        adapter.close();
                        onResponse(results);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            } else {
                // if invalid key we simply found no reference
                onResponse([]);
            }
        }

        #getReferencesFromCount(id, onResponse, onError) {
            if (this._contentTablesKeyRegex.test(id)) {
                const that = this;
                this.#getSqlAdapter(adapter => {
                    const key = SqlHelper.escape(id);
                    let result = 0;
                    const tasks = [];
                    for (const attr in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(attr)) {
                            (function () {
                                const table = that._contentTablesByExtension[attr];
                                tasks.push((onSuc, onErr) => {
                                    adapter.addColumn('COUNT(*) AS cnt');
                                    switch (table.type) {
                                        case DataType.JsonFX:
                                        case DataType.Text:
                                            adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${table.valueColumn}`), false);
                                            break;
                                        case DataType.Label:
                                        case DataType.HTML:
                                        case DataType.HMI:
                                        case DataType.Task:
                                            for (const col in table.valueColumn) {
                                                if (table.valueColumn.hasOwnProperty(col)) {
                                                    adapter.addWhere(formatReferencesFromCondition(key, `${table.name}.${table.valueColumn[col]}`), false);
                                                }
                                            }
                                            break;
                                    }
                                    adapter.performSelect(table.name, undefined, undefined, undefined, response => {
                                        result += response[0].cnt;
                                        onSuc();
                                    }, onErr);
                                });
                            }());
                        }
                    }
                    tasks.parallel = that.#parallel;
                    Executor.run(tasks, () => {
                        adapter.close();
                        onResponse(result);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            } else {
                // if invalid key we simply found no reference
                onResponse(0);
            }
        }

        #getTreeChildNodes(id, onResponse, onError) {
            const match = FOLDER_REGEX.exec(id);
            if (match) {
                const that = this, key = match[1];
                this.#getSqlAdapter(adapter => {
                    const tasks = [], nodes = [];
                    function compareRawNodes(node1, node2) {
                        return that.compareIds(node1.path, node2.path);
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
                                     * We add more parameters to our _getTreeChildNodes method will
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
                                    adapter.getChildNodes(table.name, table.keyColumn, '/', key, children => {
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
                    tasks.parallel = that.#parallel;
                    Executor.run(tasks, () => {
                        adapter.close();
                        onResponse(nodes);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            } else if (this._contentTablesKeyRegex.test(id)) {
                onResponse([]);
            } else {
                onError(`Invalid key: '${id}'`);
            }
        }

        getSearchResults(key, value, onResponse, onError) {
            if (key.length > 0 || value.length > 0) {
                const that = this;
                this.#getSqlAdapter(adapter => {
                    const results = [], tasks = [];
                    for (const extension in that._contentTablesByExtension) {
                        if (that._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const table = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.addColumn(`${table.name}.${table.keyColumn} AS path`);
                                    let where = '';
                                    if (key.length > 0) {
                                        where += `LOCATE(${SqlHelper.escape(key)}, ${table.name}.${table.keyColumn}) > 0`;
                                        if (value.length > 0) {
                                            where += ' AND ';
                                        }
                                    }
                                    if (value.length > 0) {
                                        switch (table.type) {
                                            case DataType.JsonFX:
                                            case DataType.Text:
                                                where += `LOCATE(${SqlHelper.escape(value)}, ${table.name}.${table.valueColumn}) > 0`;
                                                break;
                                            case DataType.Label:
                                            case DataType.HTML:
                                            case DataType.HMI:
                                            case DataType.Task:
                                                where += '(';
                                                let next = false;
                                                for (const val in table.valueColumn) {
                                                    if (table.valueColumn.hasOwnProperty(val)) {
                                                        if (next) {
                                                            where += ' OR ';
                                                        }
                                                        next = true;
                                                        where += `LOCATE(${SqlHelper.escape(value)}, ${table.name}.${table.valueColumn[val]}) > 0`;
                                                    }
                                                }
                                                where += ')';
                                                break;
                                        }
                                    }
                                    adapter.addWhere(where);
                                    adapter.performSelect(table.name, undefined, undefined, undefined, result => {
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
                    tasks.parallel = that.#parallel;
                    Executor.run(tasks, () => {
                        adapter.close();
                        onResponse(results);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            }
        }

        getIdKeyValues(id, onResponse, onError) {
            const that = this, data = this.analyzeId(id);
            if (data.file || data.folder) {
                this.#getSqlAdapter(adapter => {
                    const results = [], tasks = [], path = SqlHelper.escape(data.path);
                    for (const extension in this._contentTablesByExtension) {
                        if (this._contentTablesByExtension.hasOwnProperty(extension)) {
                            (function () {
                                const ext = extension;
                                const table = that._contentTablesByExtension[extension];
                                tasks.push((onSuc, onErr) => {
                                    adapter.addColumn(`${table.name}.${table.keyColumn} AS path`);
                                    adapter.addWhere(`LOCATE(${path},${table.name}.${table.keyColumn}) = 1`);
                                    adapter.performSelect(table.name, undefined, undefined, undefined, result => {
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
                    tasks.parallel = this.#parallel;
                    Executor.run(tasks, () => {
                        adapter.close();
                        onResponse(results);
                    }, err => {
                        adapter.close();
                        onError(err);
                    });
                }, onError);
            } else {
                onError(`Invalid selection: '${data.string}'`);
            }
        }

        getAllIdsForType(type, onResponse, onError) {
            const extension = this._extensionsForType[type];
            if (!extension) {
                onError(`Invalid type: '${type}'`);
                return;
            }
            const table = this._contentTablesByExtension[extension];
            if (!table) {
                onError(`Invalid table for type: ${type}`);
                return;
            }
            this.#getSqlAdapter(adapter => this.#getAllIdsForType(adapter, table, extension, ids => {
                adapter.close();
                onResponse(ids);
            }, error => {
                adapter.close();
                onError(error);
            }), onError);
        }

        #getAllIdsForType(adapter, table, extension, onResponse, onError) {
            adapter.addColumn(`${table.name}.${table.keyColumn} AS path`);
            adapter.performSelect(table.name, undefined, 'path ASC', undefined, result => {
                const response = [], l = result.length;
                for (let i = 0; i < l; i++) {
                    response.push(`$${result[i].path}.${extension}`);
                }
                onResponse(response);
            }, onError);
        }

        getAllForLanguage(language, onResponse, onError) {
            this.#getSqlAdapter(adapter => {
                const that = this, values = {};
                function get(type, onSuc, onErr) {
                    const extension = that._extensionsForType[type];
                    if (!extension) {
                        onError(`Invalid type: '${type}'`);
                        return;
                    }
                    const table = that._contentTablesByExtension[extension];
                    if (!table) {
                        onError(`Invalid table for type: ${type}`);
                        return;
                    }
                    that.#getAllIdsForType(adapter, table, extension, allIdsForType => {
                        const tasks = [];
                        for (let idForType of allIdsForType) {
                            (function () {
                                const id = idForType;
                                tasks.push((os, oe) => {
                                    const match = that._contentTablesKeyRegex.exec(id);
                                    if (!match) {
                                        oe(`Invalid id: '${id}'`);
                                    } else {
                                        that.#getObject(adapter, id, match[1], table, language, ContentManager.INCLUDE, value => {
                                            values[id] = value;
                                            os();
                                        }, oe)
                                    }
                                });
                            }());
                        }
                        tasks.parallel = that.#parallel;
                        Executor.run(tasks, onSuc, onErr);
                    }, onErr);
                }
                const tasks = [];
                tasks.push((onSuc, onErr) => get(DataType.Label, onSuc, onErr));
                tasks.push((onSuc, onErr) => get(DataType.HTML, onSuc, onErr));
                Executor.run(tasks, () => {
                    adapter.close();
                    onResponse(values);
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        }

        isHMIObject(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onResponse(false);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table || table.type !== DataType.JsonFX) {
                onResponse(false);
                return;
            }
            const hmiTable = this.#hmiTable;
            this.#getSqlAdapter(adapter => {
                adapter.addColumn('COUNT(*) AS cnt');
                adapter.addWhere(`${hmiTable.name}.${hmiTable.viewObjectColumn} = ${SqlHelper.escape(id)}`);
                adapter.performSelect(hmiTable.name, undefined, undefined, undefined, result => {
                    adapter.close();
                    onResponse(result[0].cnt > 0);
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        }

        addDefaultHMIObject(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table: '${id}'`);
                return;
            } else if (table.type !== DataType.JsonFX) {
                onError(`Is not a JsonFX object: '${id}'`);
                return;
            }
            const rawKey = match[1];
            const hmiTable = this.#hmiTable;
            this.#getSqlAdapter(adapter => {
                const tasks = [], affectedTypes = {};
                tasks.parallel = false;
                tasks.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
                let equalNameExists = false;
                tasks.push((onSuc, onErr) => this.#exists(adapter, hmiTable, rawKey, response => {
                    equalNameExists = response === true;
                    onSuc();
                }, onErr));
                tasks.push((onSuc, onErr) => {
                    if (equalNameExists) {
                        const random = Server.createSHA256(`#${(Math.E * Math.random())}%${id}&${Date.now()}?${(Math.PI * Math.random())}$`);
                        const keyValue = `${random.substring(0, Math.floor(AUTO_KEY_LENGTH / 2))}${random.substring(random.length - Math.ceil(AUTO_KEY_LENGTH / 2), random.length)}`;
                        adapter.addValue(`${hmiTable.name}.${hmiTable.keyColumn}`, SqlHelper.escape(`${rawKey}_${keyValue}`));
                    } else {
                        adapter.addValue(`${hmiTable.name}.${hmiTable.keyColumn}`, SqlHelper.escape(rawKey));
                    }
                    const idChecksum = Server.createSHA256(id);
                    const queryParameter = `${idChecksum.substring(0, Math.floor(AUTO_KEY_LENGTH / 2))}${idChecksum.substring(idChecksum.length - Math.ceil(AUTO_KEY_LENGTH / 2), idChecksum.length)}`;
                    adapter.addValue(`${hmiTable.name}.${hmiTable.queryParameterColumn}`, SqlHelper.escape(queryParameter));
                    adapter.addValue(`${hmiTable.name}.${hmiTable.viewObjectColumn}`, SqlHelper.escape(id));
                    adapter.performInsert(hmiTable.name, () => {
                        affectedTypes[hmiTable.type] = true;
                        onSuc();
                    }, onErr);
                });
                Executor.run(tasks, () => {
                    adapter.commitTransaction(() => {
                        adapter.close();
                        onResponse();
                        this.#nofifyAffectedTypes(affectedTypes);
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
        }

        getHMIObject(queryParameterValue, language, onResponse, onError) {
            const hmiTable = this.#hmiTable;
            this.#getSqlAdapter(adapter => {
                adapter.addColumn(`${hmiTable.name}.${hmiTable.viewObjectColumn} AS path`);
                adapter.addColumn(`${hmiTable.name}.${hmiTable.flagsColumn} AS flags`);
                adapter.addWhere(`${hmiTable.name}.${hmiTable.queryParameterColumn} = ${SqlHelper.escape(queryParameterValue)}`);
                adapter.performSelect(hmiTable.name, undefined, undefined, undefined, result => {
                    if (!result || !Array.isArray(result)) {
                        onError(`HMI could not be loaded: Invalid query parameter: '${queryParameterValue}'`);
                        return;
                    }
                    const enabledHmiObjectIds = [];
                    for (let obj of result) {
                        if ((obj.flags & ContentManager.HMI_FLAG_ENABLE) !== 0) {
                            enabledHmiObjectIds.push(obj.path);
                        }
                    }
                    if (enabledHmiObjectIds.length === 0) {
                        onError(`HMI could not be loaded: HMI for query parameter '${queryParameterValue}' is not available.`);
                        return;
                    } else if (enabledHmiObjectIds.length > 1) {
                        onError(`HMI could not be loaded: Query parameter '${queryParameterValue}' is ambiguous.`);
                        return;
                    }
                    const id = enabledHmiObjectIds[0];
                    const match = this._contentTablesKeyRegex.exec(id);
                    if (!match) {
                        onError(`HMI could not be loaded: Invalid id: '${id}' for query parameter '${queryParameterValue}'`);
                        return;
                    }
                    const table = this._contentTablesByExtension[match[2]];
                    if (!table || table.type !== DataType.JsonFX) {
                        onError(`HMI could not be loaded: Invalid table name: '${id}' for query parameter '${queryParameterValue}'`);
                        return;
                    }
                    this.#getObject(adapter, id, match[1], table, language, ContentManager.PARSE, response => {
                        adapter.close();
                        onResponse(response);
                    }, error => {
                        adapter.close();
                        onError(error);
                    });
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        }

        getHMIObjects(onResponse, onError) {
            const hmiTable = this.#hmiTable;
            this.#getSqlAdapter(adapter => {
                adapter.addColumn(`${hmiTable.name}.${hmiTable.keyColumn} AS path`);
                adapter.addColumn(`${hmiTable.name}.${hmiTable.queryParameterColumn} AS queryParameter`);
                adapter.addColumn(`${hmiTable.name}.${hmiTable.viewObjectColumn} AS viewObject`);
                adapter.addColumn(`${hmiTable.name}.${hmiTable.flagsColumn} AS flags`);
                adapter.performSelect(hmiTable.name, undefined, 'path ASC', undefined, result => {
                    adapter.close();
                    for (let entry of result) {
                        entry.file = entry.id = `$${entry.path}.${this._extensionsForType[hmiTable.type]}`; // TODO: what about 'file' vs. 'id'?
                    }
                    onResponse(result);
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        }

        isTaskObject(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onResponse(false);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table || table.type !== DataType.JsonFX) {
                onResponse(false);
                return;
            }
            const taskTable = this.#taskTable;
            this.#getSqlAdapter(adapter => {
                adapter.addColumn('COUNT(*) AS cnt');
                adapter.addWhere(`${taskTable.name}.${taskTable.taskObjectColumn} = ${SqlHelper.escape(id)}`);
                adapter.performSelect(taskTable.name, undefined, undefined, undefined, result => {
                    adapter.close();
                    onResponse(result[0].cnt > 0);
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        }

        addDefaultTaskObject(id, onResponse, onError) {
            const match = this._contentTablesKeyRegex.exec(id);
            if (!match) {
                onError(`Invalid id: '${id}'`);
                return;
            }
            const table = this._contentTablesByExtension[match[2]];
            if (!table) {
                onError(`Invalid table: '${id}'`);
                return;
            } else if (table.type !== DataType.JsonFX) {
                onError(`Is not a JsonFX object: '${id}'`);
                return;
            }
            const rawKey = match[1];
            const taskTable = this.#taskTable;
            this.#getSqlAdapter(adapter => {
                const tasks = [], affectedTypes = {};
                tasks.parallel = false;
                tasks.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
                let equalNameExists = false;
                tasks.push((onSuc, onErr) => this.#exists(adapter, taskTable, rawKey, response => {
                    equalNameExists = response === true;
                    onSuc();
                }, onErr));
                tasks.push((onSuc, onErr) => {
                    if (equalNameExists) {
                        const random = Server.createSHA256(`#${(Math.E * Math.random())}%${id}&${Date.now()}?${(Math.PI * Math.random())}$`);
                        const keyValue = `${random.substring(0, Math.floor(AUTO_KEY_LENGTH / 2))}${random.substring(random.length - Math.ceil(AUTO_KEY_LENGTH / 2), random.length)}`;
                        adapter.addValue(`${taskTable.name}.${taskTable.keyColumn}`, SqlHelper.escape(`${rawKey}_${keyValue}`));
                    } else {
                        adapter.addValue(`${taskTable.name}.${taskTable.keyColumn}`, SqlHelper.escape(rawKey));
                    }
                    adapter.addValue(`${taskTable.name}.${taskTable.taskObjectColumn}`, SqlHelper.escape(id));
                    adapter.addValue(`${taskTable.name}.${taskTable.flagsColumn}`, SqlHelper.escape('0'));
                    adapter.addValue(`${taskTable.name}.${taskTable.cycleIntervalMillisColumn}`, SqlHelper.escape('1000'));
                    adapter.performInsert(taskTable.name, () => {
                        affectedTypes[taskTable.type] = true;
                        onSuc();
                    }, onErr);
                });
                Executor.run(tasks, () => {
                    adapter.commitTransaction(() => {
                        adapter.close();
                        onResponse();
                        this.#nofifyAffectedTypes(affectedTypes);
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
        }

        getTaskObjects(onResponse, onError) {
            const taskTable = this.#taskTable;
            this.#getSqlAdapter(adapter => {
                adapter.addColumn(`${taskTable.name}.${taskTable.keyColumn} AS path`);
                adapter.addColumn(`${taskTable.name}.${taskTable.taskObjectColumn} AS taskObject`);
                adapter.addColumn(`${taskTable.name}.${taskTable.flagsColumn} AS flags`);
                adapter.addColumn(`${taskTable.name}.${taskTable.cycleIntervalMillisColumn} AS cycleMillis`);
                adapter.performSelect(taskTable.name, undefined, 'path ASC', undefined, result => {
                    adapter.close();
                    for (let entry of result) {
                        entry.file = entry.id = `$${entry.path}.${this._extensionsForType[taskTable.type]}`; // TODO: what about 'file' vs. 'id' vs. 'path'?
                    }
                    onResponse(result);
                }, error => {
                    adapter.close();
                    onError(error);
                });
            }, onError);
        }

        #handleRequest(request, onResponse, onError) {
            switch (request.command) {
                case COMMAND_GET_CONFIG:
                    const validIdForTypeRegex = {};
                    for (const type in this._validIdForTypeRegex) {
                        if (this._validIdForTypeRegex.hasOwnProperty(type)) {
                            validIdForTypeRegex[type] = this._validIdForTypeRegex[type].source;
                        }
                    }
                    onResponse({
                        iconDirectory: this._iconDirectory,
                        languages: this._config.languages,
                        folderIcon: this._config.folderIcon,
                        jsonfxPretty: this._config.jsonfxPretty,
                        extensionsForType: this._extensionsForType,
                        contentTablesByExtension: this._contentTablesByExtension,
                        contentTablesKeyRegex: this._contentTablesKeyRegex.source,
                        _exchangeHeaderRegex: this._exchangeHeaderRegex.source,
                        validIdForTypeRegex,
                        validIdForLanguageValueRegex: this._validIdForLanguageValueRegex.source
                    });
                    break;
                case COMMAND_EXISTS:
                    this.exists(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_CHECKSUM:
                    this.getChecksum(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_OBJECT:
                    this.getObject(request.id, request.language, request.mode, onResponse, onError);
                    break;
                case COMMAND_GET_MODIFICATION_PARAMS:
                    this.getModificationParams(request.id, request.language, request.value, onResponse, onError);
                    break;
                case COMMAND_SET_OBJECT:
                    this.setObject(request.id, request.language, request.value, request.checksum, onResponse, onError);
                    break;
                case COMMAND_GET_REFACTORING_PARAMS:
                    this.getRefactoringParams(request.source, request.target, request.action, onResponse, onError);
                    break;
                case COMMAND_PERFORM_REFACTORING:
                    this.performRefactoring(request.source, request.target, request.action, request.checksum, onResponse, onError);
                    break;
                case COMMAND_GET_SEARCH_RESULTS:
                    this.getSearchResults(request.key, request.value, onResponse, onError);
                    break;
                case COMMAND_GET_ID_KEY_VALUES:
                    this.getIdKeyValues(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_ALL_IDS_FOR_TYPE:
                    this.getAllIdsForType(request.type, onResponse, onError);
                    break;
                case COMMAND_GET_ALL_FOR_LANGUAGE:
                    this.getAllForLanguage(request.language, onResponse, onError);
                    break;
                case COMMAND_IS_HMI_OBJECT:
                    this.isHMIObject(request.id, onResponse, onError);
                    break;
                case COMMAND_SET_AVAILABILITY_AS_HMI_OBJECT:
                    this.addDefaultHMIObject(request.id, onResponse, onError);
                    break;
                case COMMAND_GET_HMI_OBJECT:
                    this.getHMIObject(request.queryParameterValue, request.language, onResponse, onError);
                    break;
                case COMMAND_GET_HMI_OBJECTS:
                    this.getHMIObjects(onResponse, onError);
                    break;
                case COMMAND_IS_TASK_OBJECT:
                    this.isTaskObject(request.id, onResponse, onError);
                    break;
                case COMMAND_SET_AVAILABILITY_AS_TASK_OBJECT:
                    this.addDefaultTaskObject(request.id, onResponse, onError);
                    break;
                default:
                    onError(`EXCEPTION! Unexpected command: '${request.command}'`);
                    break;
            }
        }

        #handleFancyTreeRequest(request, identifier, onResponse, onError) {
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
                    this.#getTreeChildNodes(id, nodes => {
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
                        onResponse(ns);
                    }, onError);
                    break;
                case ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES:
                    this.#getReferencesTo(id, results => {
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
                                    that.#getReferencesToCount(key, count => {
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
                    this.#getReferencesFrom(id, results => {
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
                                    that.#getReferencesFromCount(key, count => {
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

        registerOnWebServer(webServer) {
            // we need access via ajax from clients
            webServer.post(ContentManager.GET_CONTENT_DATA_URL, (request, response) => this.#handleRequest(
                request.body,
                result => response.send(JsonFX.stringify({ result }, false)),
                error => response.send(JsonFX.stringify({ error: error.toString() }, false))
            ));
            // the tree control requests da via 'GET' so we handle those request separately
            webServer.get(ContentManager.GET_CONTENT_TREE_NODES_URL, (request, response) => this.#handleFancyTreeRequest(
                request.query.request,
                request.query.path,
                result => response.send(JsonFX.stringify(result, false)),
                error => response.send(JsonFX.stringify(error.toString(), false))
            ));
        }

        // Note: this next is a template method - copy when new request has to be implemented
        #tempdateMethodUsingTransaction(onResponse, onError) {
            this.#getSqlAdapter(adapter => {
                const main = [];
                main.parallel = false;
                main.push((onSuc, onErr) => adapter.startTransaction(onSuc, onErr));
                main.push((onSuc, onErr) => {
                    // add this as often as reqzured and implement actions
                });
                Executor.run(main, () => {
                    adapter.commitTransaction(() => {
                        adapter.close();
                        onResponse();
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
        }
    }

    class ClientManager extends ContentManagerBase {
        constructor(onResponse, onError) {
            super();
            validateAsContentManager(this, true);
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_CONFIG }, config => {
                this._config = config;
                this._iconDirectory = config.iconDirectory;
                this._extensionsForType = config.extensionsForType;
                this._contentTablesKeyRegex = new RegExp(config.contentTablesKeyRegex);
                this._exchangeHeaderRegex = new RegExp(config._exchangeHeaderRegex, 'g');
                this._contentTablesByExtension = config.contentTablesByExtension;
                this._validIdForTypeRegex = {};
                for (const type in config.validIdForTypeRegex) {
                    if (config.validIdForTypeRegex.hasOwnProperty(type)) {
                        this._validIdForTypeRegex[type] = new RegExp(config.validIdForTypeRegex[type]);
                    }
                }
                this._validIdForLanguageValueRegex = new RegExp(config.validIdForLanguageValueRegex);
                onResponse();
            }, onError);
        }

        exists(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_EXISTS, id }, onResponse, onError);
        }

        getChecksum(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_CHECKSUM, id }, onResponse, onError);
        }

        getObject(id, language, mode, onResponse, onError) {
            const parse = mode === ContentManager.PARSE;
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, {
                command: COMMAND_GET_OBJECT,
                id,
                language,
                mode: parse ? ContentManager.INCLUDE : mode
            }, parse ? response => {
                if (response !== undefined) {
                    try {
                        let object = JsonFX.reconstruct(response);
                        if (this._config !== undefined && this._config.jsonfxPretty === true) {
                            // the 'jsonfxPretty' flag may be used to format our dynamically
                            // parsed JavaScript sources for more easy debugging purpose
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

        getModificationParams(id, language, value, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_MODIFICATION_PARAMS, id, language, value }, onResponse, onError);
        }

        setObject(id, language, value, checksum, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_SET_OBJECT, id, language, value, checksum }, onResponse, onError);
        }

        getRefactoringParams(source, target, action, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_REFACTORING_PARAMS, source, target, action }, onResponse, onError);
        }

        performRefactoring(source, target, action, checksum, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_PERFORM_REFACTORING, source, target, action, checksum }, onResponse, onError);
        }

        getSearchResults(key, value, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_SEARCH_RESULTS, key, value }, onResponse, onError);
        }

        getIdKeyValues(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_ID_KEY_VALUES, id }, onResponse, onError);
        }

        getAllIdsForType(type, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_ALL_IDS_FOR_TYPE, type }, onResponse, onError);
        }

        getAllForLanguage(language, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_ALL_FOR_LANGUAGE, language }, onResponse, onError);
        }

        isHMIObject(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_IS_HMI_OBJECT, id }, onResponse, onError);
        }

        addDefaultHMIObject(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_SET_AVAILABILITY_AS_HMI_OBJECT, id }, onResponse, onError);
        }

        getHMIObject(queryParameterValue, language, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_HMI_OBJECT, queryParameterValue, language }, response => {
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

        getHMIObjects(onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_GET_HMI_OBJECTS }, onResponse, onError);
        }

        isTaskObject(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_IS_TASK_OBJECT, id }, onResponse, onError);
        }

        addDefaultTaskObject(id, onResponse, onError) {
            Client.fetchJsonFX(ContentManager.GET_CONTENT_DATA_URL, { command: COMMAND_SET_AVAILABILITY_AS_TASK_OBJECT, id }, onResponse, onError);
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
        #cms;
        constructor(cms) {
            this.#cms = cms;
        }

        #readConfigData(ids, path, languages, onProgressChanged, onError) {
            const exports = [createHeader(EXCHANGE_HEADER, path), '\n'];
            const cms = this.#cms, tasks = [], len = ids.length;
            for (let i = 0; i < len; i++) {
                // closure
                (function () {
                    let idx = i, id = ids[idx], data = cms.analyzeId(id);
                    switch (data.type) {
                        case DataType.JsonFX:
                        case DataType.HMI:
                        case DataType.Task:
                            tasks.push((onSuc, onErr) => {
                                cms.getObject(id, undefined, ContentManager.RAW, object => {
                                    exports.push(createHeader(data.extension, id));
                                    exports.push(JsonFX.stringify(JsonFX.reconstruct(object), true));
                                    exports.push('\n\n');
                                    onProgressChanged(formatProgressInPercent(idx / len));
                                    onSuc();
                                }, onErr);
                            });
                            break;
                        case DataType.Text:
                            tasks.push((onSuc, onErr) => {
                                cms.getObject(id, undefined, ContentManager.RAW, object => {
                                    exports.push(createHeader(data.extension, id));
                                    exports.push(object);
                                    exports.push('\n\n');
                                    onProgressChanged(formatProgressInPercent(idx / len));
                                    onSuc();
                                }, onErr);
                            });
                            break;
                        case DataType.Label:
                        case DataType.HTML:
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
                            break;
                        default:
                            console.error(`Invalid type '${data.type}'`);
                            break;
                    }
                }());
            }
            tasks.parallel = false;
            Executor.run(tasks, () => {
                onProgressChanged();
                saveAs(new Blob(exports, { type: "text/plain;charset=utf-8" }), 'js_hmi_export.txt');
            }, onError);
        }

        #parse(text, results, onProgressChanged, onError) {
            // separate ids and data
            const cms = this.#cms, elements = [];
            Regex.each(cms._exchangeHeaderRegex, text, (start, end, match) => elements.push(match ? match : text.substring(start, end)));
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
                        const data = cms.analyzeId(path);
                        switch (data.type) {
                            case DataType.JsonFX:
                            case DataType.HMI:
                            case DataType.Task:
                                try {
                                    data.value = JsonFX.parse(elements[idx++], true, true);
                                } catch (exc) {
                                    onError(`EXCEPTION! Cannot evaluate object: ${exc}`);
                                    return false;
                                }
                                results.push(data);
                                break;
                            case DataType.Text:
                                data.value = elements[idx++].trim();
                                results.push(data);
                                break;
                            case DataType.Label:
                            case DataType.HTML:
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
                                break;
                            default:
                                console.error(`Invalid type '${data.type}'`);
                                break;
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

        #writeConfigData(data, onProgressChanged, onError) {
            const cms = this.#cms, tasks = [];
            for (let i = 0, len = data.length; i < len; i++) {
                // closure
                (function () {
                    const idx = i, d = data[idx];
                    switch (d.type) {
                        case DataType.JsonFX:
                            tasks.push((onSuc, onErr) => {
                                const val = d.value !== undefined && d.value !== null ? JsonFX.stringify(d.value, false) : undefined;
                                cms.getModificationParams(d.id, undefined, val, params => cms.setObject(d.id, undefined, val, params.checksum, onSuc, onErr), onErr);
                            });
                            break;
                        case DataType.Text:
                        case DataType.Label:
                        case DataType.HTML:
                        case DataType.HMI:
                        case DataType.Task:
                            tasks.push((onSuc, onErr) => {
                                const val = d.value !== undefined && d.value !== null ? d.value : undefined;
                                cms.getModificationParams(d.id, undefined, val, params => cms.setObject(d.id, undefined, val, params.checksum, onSuc, onErr), onErr);
                            });
                            break;
                        default:
                            console.error(`Invalid type '${d.type}'`);
                            break;
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

        handleImport(hmi, text, onProgressChanged, onError) {
            // separate ids and data
            const that = this, data = [], prefix = this.#parse(text, data, onProgressChanged, onError);
            if (typeof prefix !== 'string') {
                onProgressChanged();
                return;
            }
            const html = `<b>Import (replace):</b><br><code>${(prefix.length > 0 ? prefix : 'all (!)')}</code><br><br><b>Sure to proceed?</b>`;
            hmi.showDefaultConfirmationDialog({
                width: $(window).width() * 0.6,
                height: $(window).height() * 0.4,
                title: 'warning',
                html,
                yes: () => that.#writeConfigData(data, onProgressChanged, onError),
                cancel: () => onProgressChanged()
            });
        }

        handleExport(id, onProgressChanged, onError) {
            const that = this, cms = this.#cms, data = cms.analyzeId(id);
            onProgressChanged('load languages ...');
            const languages = cms.getLanguages();
            languages.sort(compareKeys);
            if (data.file) {
                that.#readConfigData([data.file], id, languages, onProgressChanged, onError);
            } else if (data.folder) {
                cms.getIdKeyValues(data.folder, ids => {
                    ids.sort(compareKeys);
                    that.#readConfigData(ids, id, languages, onProgressChanged, onError);
                }, onError);
            } else {
                onProgressChanged();
            }
        }
    }

    if (isNodeJS) {
        ContentManager.getInstance = (logger, getSqlAdapter, iconDirectory, config) => new ServerManager(logger, getSqlAdapter, iconDirectory, config);
    } else {
        ContentManager.getInstance = (onResponse, onError) => new ClientManager(onResponse, onError);
    }
    Object.freeze(ContentManager);
    if (isNodeJS) {
        module.exports = ContentManager;
    } else {
        window.ContentManager = ContentManager;
    }
}(globalThis));
