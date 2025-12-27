(function (root) {
    "use strict";
    const Global = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  event publisher inferface  */
    function validateEventPublisherInterface(instance, validateMethodArguments) {
        Core.validateInterface('EventPublisherInterface', instance, [
            'Subscribe(id, onEvent)',
            'Unsubscribe(id, onEvent)',
            'Read(id, onResponse, onError)',
            'Write(id, value)'
        ], validateMethodArguments);
    }
    Global.validateEventPublisherInterface = validateEventPublisherInterface;

    /*  connection inferface  */
    function validateConnectionInterface(instance, validateMethodArguments) {
        Core.validateInterface('ConnectionInterface', instance, [
            'Ping(onResponse, onError)',
            'Register(receiver, handler)',
            'Unregister(receiver)',
            'Send(receiver, data, onResponse, onError)'
        ], validateMethodArguments);
    }
    Global.validateConnectionInterface = validateConnectionInterface;

    /*  connector inferface on client */
    function validateClientConnectorInterface(instance, validateMethodArguments) {
        Core.validateInterface('ClientConnectorInterface', instance, [
            'OnOpen()',
            'OnClose()'
        ], validateMethodArguments);
    }
    Global.validateClientConnectorInterface = validateClientConnectorInterface;

    /*  connector inferface on server  */
    function validateServerConnectorInterface(instance, validateMethodArguments) {
        Core.validateInterface('ServerConnectorInterface', instance, [
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
