(function (root) {
    "use strict";
    const Common = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  Observable inferface  */
    function validateAsObservable(instance, validateMethodArguments) {
        Core.validateAs('Observable', instance, [
            'Subscribe(onRefresh)',
            'Unsubscribe(onRefresh)',
        ], validateMethodArguments);
        return instance;
    }
    Common.validateAsObservable = validateAsObservable;

    /*  OperationalState interface  */
    function validateAsOperationalState(instance, validateMethodArguments) {
        Core.validateAs('OperationalState', instance, [
            'IsOperational:boolean', // property getter returns true if operational
            'SubscribeOperationalState(onOperationalStateChanged)',
            'UnsubscribeOperationalState(onOperationalStateChanged)'
        ], validateMethodArguments);
        return instance;
    }
    Common.validateAsOperationalState = validateAsOperationalState;

    /*  DataAccessObject inferface  */
    function validateAsDataAccessObject(instance, validateMethodArguments) {
        validateAsOperationalState(instance, validateMethodArguments);
        Core.validateAs('DataAccessObject', instance, [
            'GetType(dataId)',
            'SubscribeData(dataId, onRefresh)',
            'UnsubscribeData(dataId, onRefresh)',
            'Read(dataId, onResponse, onError)',
            'Write(dataId, value)'
        ], validateMethodArguments);
        return instance;
    }
    Common.validateAsDataAccessObject = validateAsDataAccessObject;

    /*  Connection inferface  */
    function validateAsConnection(instance, validateMethodArguments) {
        Core.validateAs('Connection', instance, [
            'Ping(onResponse, onError)',
            'Register(receiver, handler)',
            'Unregister(receiver)',
            'Send(receiver, data, onResponse, onError)'
        ], validateMethodArguments);
        return instance;
    }
    Common.validateAsConnection = validateAsConnection;

    /*  ClientConnector inferface */
    function validateAsClientConnector(instance, validateMethodArguments) {
        Core.validateAs('ClientConnector', instance, [
            'OnOpen()',
            'OnClose()'
        ], validateMethodArguments);
        return instance;
    }
    Common.validateAsClientConnector = validateAsClientConnector;

    /*  ServerConnector inferface  */
    function validateAsServerConnector(instance, validateMethodArguments) {
        Core.validateAs('ServerConnector', instance, [
            'OnOpen()',
            'OnReopen()',
            'OnClose()',
            'OnDispose()'
        ], validateMethodArguments);
        return instance;
    }
    Common.validateAsServerConnector = validateAsServerConnector;

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
