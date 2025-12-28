(function (root) {
    "use strict";
    const Global = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  operational state inferface  */
    function validateOperationalStateInterface(instance, validateMethodArguments) {
        Core.validateInterface('OperationalState', instance, [
            'IsOperational:boolean',
            'SubscribeOperationalState(onOperationalStateChanged)',
            'UnsubscribeOperationalState(onOperationalStateChanged)'
        ], validateMethodArguments);
    }
    Global.validateEventPublisherInterface = validateEventPublisherInterface;

    /*  event publisher inferface  */
    function validateEventPublisherInterface(instance, validateMethodArguments) {
        // TODO: use validateOperationalStateInterface(instance, validateMethodArguments);
        Core.validateInterface('EventPublisher', instance, [
            // TODO eventId
            'Subscribe(id, onEvent)', // TODO -> SubscribeEvent
            'Unsubscribe(id, onEvent)', // TODO: UnsubscribeEvent
            'Read(id, onResponse, onError)',
            'Write(id, value)'
        ], validateMethodArguments);
    }
    Global.validateEventPublisherInterface = validateEventPublisherInterface;

    /*  connection inferface  */
    function validateConnectionInterface(instance, validateMethodArguments) {
        Core.validateInterface('Connection', instance, [
            'Ping(onResponse, onError)',
            'Register(receiver, handler)',
            'Unregister(receiver)',
            'Send(receiver, data, onResponse, onError)'
        ], validateMethodArguments);
    }
    Global.validateConnectionInterface = validateConnectionInterface;

    /*  connector inferface on client */
    function validateClientConnectorInterface(instance, validateMethodArguments) {
        Core.validateInterface('ClientConnector', instance, [
            'OnOpen()',
            'OnClose()'
        ], validateMethodArguments);
    }
    Global.validateClientConnectorInterface = validateClientConnectorInterface;

    /*  connector inferface on server  */
    function validateServerConnectorInterface(instance, validateMethodArguments) {
        Core.validateInterface('ServerConnector', instance, [
            'OnOpen()',
            'OnReopen()',
            'OnClose()',
            'OnDispose()'
        ], validateMethodArguments);
    }
    Global.validateServerConnectorInterface = validateServerConnectorInterface;

    Object.freeze(Global);
    if (isNodeJS) {
        module.exports = Global;
    } else {
        root.Global = Global;
    }
}(globalThis));
