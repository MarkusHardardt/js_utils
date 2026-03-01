(function (root) {
    "use strict";
    const Evaluate = {};
    const isNodeJS = typeof require === 'function';
    // Note: Read the comment below before removing any of the following lines! The required module is possibly used from evaluated text during runtime!
    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const HashLists = isNodeJS ? require('./HashLists.js') : root.HashLists;
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const Mathematics = isNodeJS ? require('./Mathematics.js') : root.Mathematics;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Server = isNodeJS ? require('./Server.js') : root.Server;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const SqlHelper = isNodeJS ? require('./SqlHelper.js') : root.SqlHelper;
    const Utilities = isNodeJS ? require('./Utilities.js') : root.Utilities;
    const Core = isNodeJS ? require('./Core.js') : root.Mathematics;
    // const WebServer = isNodeJS ? require('./WebServer.js') : root.WebServer;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    // const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;
    // const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;
    // const DataConnector = isNodeJS ? require('./DataConnector.js') : root.DataConnector;
    const OPCUA = isNodeJS ? require('./OPCUA.js') : root.OPCUA;
    // const Access = isNodeJS ? require('./Access.js') : root.Access;
    // const Logger = isNodeJS ? require('./Logger.js') : root.Logger;
    // const WebSocketConnection = isNodeJS ? require('./WebSocketConnection.js') : root.WebSocketConnection;
    // const ContentEditor = isNodeJS ? require('./ContentEditor.js') : root.ContentEditor;
    // const LanguageSwitching = isNodeJS ? require('./LanguageSwitching.js') : root.LanguageSwitching;
    // const TaskManager = isNodeJS ? require('./TaskManager.js') : root.TaskManager;
    const md5 = isNodeJS ? require('../ext/md5.js') : undefined; // external
    /*  Note: This eval function must be defined here!
        When tasks on server side must be executed, they will be loaded from the database as text and then evaluated to get the executable task object.
        The evaluated text possibly references modules in js_utils.
        If the eval function would be located in JsonFX none of the js_utils modules would be available, because JsonFX does not use any other module.
        We also evaluate text in ContentManager but if the eval function would be called there, only the modules used by ContentManager would be available.
        By instead defining the eval function here, all modules we require above will be available from the context of any server task object.
        So this enables direct use on any js_utils module just by the name as if the module would be accessible from a global context.  */
    Evaluate.evalFunc = x => eval(`(${x})`);
    // TODO: response = eval ('(' + JsonFX.stringify(response, true) + ')\n//# sourceURL=' + match[1] + '.js');

    if (isNodeJS) {
        module.exports = Evaluate;
    } else {
        root.Evaluate = Evaluate;
    }
}(globalThis));
