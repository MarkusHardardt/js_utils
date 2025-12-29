(function (root) {
    "use strict";
    const Common = {};

    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    const DataType = Object.freeze({
        Null: 0,
        Boolean: 1,
        Int8: 2,
        UInt8: 3,
        Int16: 4,
        UInt16: 5,
        Int32: 6,
        UInt32: 7,
        Int64: 8,
        UInt64: 9,
        Float: 10,
        Double: 11,
        String: 12,
        Unknown: -1
    });
    Common.DataType = DataType;

    /*  operational state interface  */
    function validateOperationalStateInterface(instance, validateMethodArguments) {
        Core.validateInterface('OperationalState', instance, [
            'IsOperational:boolean', // property getter returns true if operational
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
    function validateDataPointCollectionInterface(instance, validateMethodArguments) {
        validateOperationalStateInterface(instance, validateMethodArguments);
        Core.validateInterface('DataPointCollection', instance, [
            'SubscribeData(dataId, onRefresh)',
            'UnsubscribeData(dataId, onRefresh)',
            'Read(dataId, onResponse, onError)',
            'Write(dataId, value)'
        ], validateMethodArguments);
    }
    Common.validateDataPointCollectionInterface = validateDataPointCollectionInterface;

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
