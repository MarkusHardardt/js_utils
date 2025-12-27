(function (root) {
    "use strict";
    const Global = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    /*  event publisher inferface  */
    function validateEventPublisherInterface(instance, checkMethodArguments) {
        Core.validateInterface('EventPublisherInterface', instance, [
            'Subscribe(id, onEvent)',
            'Unsubscribe(id, onEvent)',
            'Read(id, onResponse, onError)',
            'Write(id, value)'
        ], checkMethodArguments);
    }
    Global.validateEventPublisherInterface = validateEventPublisherInterface;

    /*  connection inferface  */
    function validateConnection(instance, checkMethodArguments) {
        Core.validateInterface('Connection', instance, [
            'Ping(onResponse, onError)',
            'Register(receiver, handler)',
            'Unregister(receiver)',
            'Send(receiver, data, onResponse, onError)'
        ], checkMethodArguments);
    }
    Global.validateConnection = validateConnection;

    /*  connector inferface  */
    function validateConnectorInterface(instance, checkMethodArguments) {
        Core.validateInterface('ClientDataConnector', instance, [
            'OnOpen()',
            'OnClose()'
        ], checkMethodArguments);
    }
    Global.validateConnectorInterface = validateConnectorInterface;

    Object.freeze(Global);
    if (isNodeJS) {
        module.exports = Global;
    } else {
        root.Global = Global;
    }
}(globalThis));
