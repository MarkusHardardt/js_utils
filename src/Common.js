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

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
