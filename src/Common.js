(function (root) {
    "use strict";
    const Common = {};

    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  operational state interface  */
    function validateOperationalStateInterface(instance, validateMethodArguments) {
        Core.validateInterface('OperationalState', instance, [
            'IsOperational:boolean',
            'SubscribeOperationalState(onOperationalStateChanged)',
            'UnsubscribeOperationalState(onOperationalStateChanged)'
        ], validateMethodArguments);
    }
    Common.validateOperationalStateInterface = validateOperationalStateInterface;

    /*  subscribable inferface  */
    function validateSubscribableInterface(instance, validateMethodArguments) {
        Core.validateInterface('Subscribable', instance, [
            'Subscribe(onRefresh)',
            'Unsubscribe(onRefresh)',
        ], validateMethodArguments);
    }
    Common.validateSubscribableInterface = validateSubscribableInterface;

    /*  event publisher inferface  */
    function validateDataPointInterface(instance, validateMethodArguments) {
        validateOperationalStateInterface(instance, validateMethodArguments);
        Core.validateInterface('DataPoint', instance, [
            'SubscribeData(dataId, onRefresh)',
            'UnsubscribeData(dataId, onRefresh)',
            'Read(dataId, onResponse, onError)',
            'Write(dataId, value)'
        ], validateMethodArguments);
    }
    Common.validateDataPointInterface = validateDataPointInterface;

    /*  connection inferface  */
    function validateConnectionInterface(instance, validateMethodArguments) {
        Core.validateInterface('Connection', instance, [
            'Ping(onResponse, onError)',
            'Register(receiver, handler)',
            'Unregister(receiver)',
            'Send(receiver, data, onResponse, onError)'
        ], validateMethodArguments);
    }
    Common.validateConnectionInterface = validateConnectionInterface;

    /*  connector inferface on client */
    function validateClientConnectorInterface(instance, validateMethodArguments) {
        Core.validateInterface('ClientConnector', instance, [
            'OnOpen()',
            'OnClose()'
        ], validateMethodArguments);
    }
    Common.validateClientConnectorInterface = validateClientConnectorInterface;

    /*  connector inferface on server  */
    function validateServerConnectorInterface(instance, validateMethodArguments) {
        Core.validateInterface('ServerConnector', instance, [
            'OnOpen()',
            'OnReopen()',
            'OnClose()',
            'OnDispose()'
        ], validateMethodArguments);
    }
    Common.validateServerConnectorInterface = validateServerConnectorInterface;

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
