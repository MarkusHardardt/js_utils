(function (root) {
    "use strict";
    const Common = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  Observable inferface  */
    function validateAsObservable(instance, validateMethodArguments) {
        return Core.validateAs('Observable', instance, [
            'Subscribe(onRefresh)',
            'Unsubscribe(onRefresh)',
        ], validateMethodArguments);
    }
    Common.validateAsObservable = validateAsObservable;

    /*  DataAccessObject inferface  */
    function validateAsDataAccessObject(instance, validateMethodArguments) {
        return Core.validateAs('DataAccessObject', instance, [
            'GetType(dataId)',
            'SubscribeData(dataId, onRefresh)',
            'UnsubscribeData(dataId, onRefresh)',
            'Read(dataId, onResponse, onError)',
            'Write(dataId, value)'
        ], validateMethodArguments);
    }
    Common.validateAsDataAccessObject = validateAsDataAccessObject;

    /*  DataAccessServerObject inferface  */
    function validateAsDataAccessServerObject(instance, validateMethodArguments) {
        validateAsDataAccessObject(instance, validateMethodArguments);
        return Core.validateAs('DataAccessServerObject', instance, [
            'GetDataPoints()'
        ], validateMethodArguments);
    }
    Common.validateAsDataAccessServerObject = validateAsDataAccessServerObject;

    /*  Connection inferface  */
    function validateAsConnection(instance, validateMethodArguments) {
        return Core.validateAs('Connection', instance, [
            'Ping(onResponse, onError)',
            'Register(receiver, handler)',
            'Unregister(receiver)',
            'Send(receiver, data, onResponse, onError)'
        ], validateMethodArguments);
    }
    Common.validateAsConnection = validateAsConnection;

    /*  Connector inferface */
    function validateAsConnector(instance, validateMethodArguments) {
        return Core.validateAs('Connector', instance, [
            'OnOpen()',
            'OnClose()'
        ], validateMethodArguments);
    }
    Common.validateAsConnector = validateAsConnector;

    /*  ServerConnector inferface  */
    function validateAsServerConnector(instance, validateMethodArguments) {
        validateAsConnector(instance, validateMethodArguments);
        return Core.validateAs('ServerConnector', instance, 'SetDataPoints(dataPoints)', validateMethodArguments);
    }
    Common.validateAsServerConnector = validateAsServerConnector;

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
