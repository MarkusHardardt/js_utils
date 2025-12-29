(function (root) {
    "use strict";

    // access to other components in node js and browser:
    const isNodeJS = typeof require === 'function';
    const Client = isNodeJS ? require('./src/Client.js') : root.Client;
    const EmptyTemplate = isNodeJS ? require('./src/EmptyTemplate.js') : root.EmptyTemplate;
    const Executor = isNodeJS ? require('./src/Executor.js') : root.Executor;
    const HashLists = isNodeJS ? require('./src/HashLists.js') : root.HashLists;
    const jsonfx = isNodeJS ? require('./src/jsonfx.js') : root.jsonfx;
    const math = isNodeJS ? require('./src/math.js') : root.math;
    const ObjectPositionSystem = isNodeJS ? require('./src/ObjectPositionSystem.js') : root.ObjectPositionSystem;
    const Regex = isNodeJS ? require('./src/Regex.js') : root.Regex;
    const Server = isNodeJS ? require('./src/Server.js') : root.Server;
    const Sorting = isNodeJS ? require('./src/Sorting.js') : root.Sorting;
    const SqlHelper = isNodeJS ? require('./src/SqlHelper.js') : root.SqlHelper;
    const Utilities = isNodeJS ? require('./src/Utilities.js') : root.Utilities;
    const Core = isNodeJS ? require('./src/Core.js') : root.Core;
    const WebServer = isNodeJS ? require('./src/WebServer.js') : root.WebServer;
    const ContentManager = isNodeJS ? require('./src/ContentManager.js') : root.ContentManager;
    const Common = isNodeJS ? require('./src/Common.js') : root.Common;
    const hmi_object = isNodeJS ? require('./src/hmi_object.js') : root.hmi_object;
    const DataPoint = isNodeJS ? require('./src/DataPoint.js') : root.DataPoint;
    const OperationalState = isNodeJS ? require('./src/OperationalState.js') : root.OperationalState;
    const WebSocketConnection = isNodeJS ? require('./src/WebSocketConnection.js') : root.WebSocketConnection;
    const DataConnector = isNodeJS ? require('./src/DataConnector.js') : root.DataConnector;
    const TargetSystemAdapter = isNodeJS ? require('./src/TargetSystemAdapter.js') : root.TargetSystemAdapter;

    const js_utils = {
        Client,
        EmptyTemplate,
        Executor,
        HashLists,
        jsonfx,
        math,
        ObjectPositionSystem,
        Regex,
        Server,
        Sorting,
        SqlHelper,
        Utilities,
        Core,
        WebServer,
        ContentManager,
        Common,
        hmi_object,
        DataPoint,
        OperationalState,
        WebSocketConnection,
        DataConnector,
        TargetSystemAdapter
    };

    Object.seal(js_utils);

    // export
    if (isNodeJS) {
        module.exports = js_utils;
    } else {
        root.js_utils = js_utils;
    }
}(globalThis));
