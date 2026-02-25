(function (root) {
    "use strict";
    const Common = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /* Logger interface */
    function validateAsLogger(instance, validateMethodArguments) {
        return Core.validateAs('Logger', instance, [
            'setLevel(level)',
            'trace:function',
            'debug:function',
            'info:function',
            'warn:function',
            'error:function',
            'fatal:function'
        ], validateMethodArguments);
    }
    Common.validateAsLogger = validateAsLogger;

    /*  Observable inferface  */
    function validateAsObservable(instance, validateMethodArguments) {
        return Core.validateAs('Observable', instance, [
            'registerObserver(onRefresh)',
            'unregisterObserver(onRefresh)',
        ], validateMethodArguments);
    }
    Common.validateAsObservable = validateAsObservable;

    /*  DataAccessObject inferface  */
    function validateAsDataAccessObject(instance, validateMethodArguments) {
        return Core.validateAs('DataAccessObject', instance, [
            'getType(dataId)',
            'registerObserver(dataId, onRefresh)',
            'unregisterObserver(dataId, onRefresh)',
            'read(dataId, onResponse, onError)',
            'write(dataId, value)'
        ], validateMethodArguments);
    }
    Common.validateAsDataAccessObject = validateAsDataAccessObject;

    /*  DataAccessServerObject inferface  */
    function validateAsDataAccessServerObject(instance, validateMethodArguments) {
        validateAsDataAccessObject(instance, validateMethodArguments);
        return Core.validateAs('DataAccessServerObject', instance, [
            'getDataPoints()'
        ], validateMethodArguments);
    }
    Common.validateAsDataAccessServerObject = validateAsDataAccessServerObject;

    /*  Connection inferface  */
    function validateAsConnection(instance, validateMethodArguments) {
        return Core.validateAs('Connection', instance, [
            'ping(onResponse, onError)',
            'register(receiver, handler)',
            'unregister(receiver)',
            'send(receiver, data, onResponse, onError)'
        ], validateMethodArguments);
    }
    Common.validateAsConnection = validateAsConnection;

    /*  Connector inferface */
    function validateAsConnector(instance, validateMethodArguments) {
        return Core.validateAs('Connector', instance, [
            'onOpen()',
            'onClose()'
        ], validateMethodArguments);
    }
    Common.validateAsConnector = validateAsConnector;

    /*  ServerConnector inferface  */
    function validateAsServerConnector(instance, validateMethodArguments) {
        validateAsConnector(instance, validateMethodArguments);
        return Core.validateAs('ServerConnector', instance, 'setDataPoints(dataPoints)', validateMethodArguments);
    }
    Common.validateAsServerConnector = validateAsServerConnector;

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
    Common.validateAsContentManager = validateAsContentManager;

    function validateAsContentManagerOnServer(instance, validateMethodArguments) {
        validateAsContentManager(instance, validateMethodArguments);
        return Core.validateAs('ServerContentManager', instance, [
            'getTaskObjects(onResponse, onError)',
            'registerAffectedTypesListener(type, onChanged)',
            'registerOnWebServer(webServer)' // Registers web server 'POST' and 'GET' (for fancy tree) handling
        ], validateMethodArguments);
    }
    Common.validateAsContentManagerOnServer = validateAsContentManagerOnServer;

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
