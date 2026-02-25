(function () {
    "use strict";
    const Client = require('../src/Client.js');
    const Executor = require('../src/Executor.js');
    const HashLists = require('../src/HashLists.js');
    const JsonFX = require('../src/JsonFX.js');
    const Mathematics = require('../src/Mathematics.js');
    const Regex = require('../src/Regex.js');
    const Server = require('../src/Server.js');
    const Sorting = require('../src/Sorting.js');
    const SqlHelper = require('../src/SqlHelper.js');
    const Utilities = require('../src/Utilities.js');
    const Core = require('../src/Core.js');
    const WebServer = require('../src/WebServer.js');
    const Common = require('../src/Common.js');
    const ContentManager = require('../src/ContentManager.js');
    const ObjectLifecycleManager = require('../src/ObjectLifecycleManager.js');
    const DataConnector = require('../src/DataConnector.js');
    const Access = require('../src/Access.js');
    const Logger = require('../src/Logger.js');
    const WebSocketConnection = require('../src/WebSocketConnection.js');
    const ContentEditor = require('../src/ContentEditor.js');
    const LanguageSwitching = require('../src/LanguageSwitching.js');
    const TaskManager = require('../src/TaskManager.js');
    const md5 = require('../ext/md5.js'); // external

    function main(config = {}) {
        Logger.setLevel(config.serverLogLevel);

        // create 'hmi' environment object
        const hmi = {
            applicationName: config.applicationName,
            logger: new Logger(config.applicationName),
            // add hmi-object-framweork
            createObject: (object, element, onSuccess, onError, initData) =>
                ObjectLifecycleManager.createObject(object, element, onSuccess, onError, hmi, initData),
            killObject: ObjectLifecycleManager.killObject,
            utils: {
                Executor,
                HashLists,
                JsonFX,
                Mathematics,
                Regex,
                Server,
                Sorting,
                SqlHelper,
                Utilities,
                Core,
                Common,
                ContentManager,
                ObjectLifecycleManager,
                Access,
                Logger,
                ContentEditor,
                md5
            },
            // Environment
            env: {
                isInstance: instance => false, // TODO: Implement isInstance(instance)
                isSimulationEnabled: () => false // TODO: Implement isSimulationEnabled()
            },
            ext: config.external
        };
        // Prepare web server
        const minimized = config.minimized === true;
        const webServer = new WebServer.Server({ secureKeyFile: config.secureKeyFile, secureCertFile: config.secureCertFile, postRequestUrl: Client.HANDLE_REQUEST });
        hmi.registerPostRequestHandler = (receiver, onRequest) => webServer.registerPostRequestHandler(receiver, onRequest);
        hmi.unregisterPostRequestHandler = (receiver, onRequest) => webServer.unregisterPostRequestHandler(receiver, onRequest);
        webServer.randomFileIdEnabled = false;
        webServer.setTitle(config.applicationName);
        for (const name in config.staticWebServerDirectories) {
            if (config.staticWebServerDirectories.hasOwnProperty(name)) {
                const directory = config.staticWebServerDirectories[name];
                webServer.addStaticDirectory(directory, name);
            }
        }
        webServer.prepareFavicon(config.favicon);
        webServer.addStaticFile('./node_modules/jquery/dist/' + (minimized ? 'jquery.min.js' : 'jquery.js'));
        webServer.addStaticFile('./node_modules/jquery-ui-dist/' + (minimized ? 'jquery-ui.min.css' : 'jquery-ui.css'));
        webServer.addStaticFile('./node_modules/jquery-ui-dist/' + (minimized ? 'jquery-ui.min.js' : 'jquery-ui.js'));
        // Note: The next css file references png files by relative paths. Because 'media' is the common root, we must not scramble deeper folders.
        webServer.addStaticFile('./node_modules/datatables/media', minimized ? 'css/jquery.dataTables.min.css' : 'css/jquery.dataTables.css');
        webServer.addStaticFile('./node_modules/datatables/media', minimized ? 'js/jquery.dataTables.min.js' : 'js/jquery.dataTables.js');
        // Note: Don't use this extension! Shows paging even if not configured and every second page is empty.
        // webServer.addStaticFile('./node_modules/datatables.net-scroller/js/dataTables.scroller.js');
        // Note: The next css file references png files by relative paths. Because 'dist' is the common root, we must not scramble deeper folders.
        webServer.addStaticFile('./node_modules/jquery.fancytree/dist', minimized ? 'skin-lion/ui.fancytree.min.css' : 'skin-lion/ui.fancytree.css');
        webServer.addStaticFile('./node_modules/jquery.fancytree/dist/' + (minimized ? 'jquery.fancytree-all.min.js' : 'jquery.fancytree-all.js'));
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/jquery.ui.touch-punch.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/jquery.transform2d.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/ajaxblob.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/layout-default-latest.css');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/jquery.layout-latest.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/dataTables.pageResize.min.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/dataTables.scrollResize.min.js');
        /*
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/jquery.transform2d.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/ajaxblob.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/layout-default-latest.css');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/jquery.layout-latest.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/dataTables.pageResize.min.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/jquery/dataTables.scrollResize.min.js');
        */
        // TODO: https://codemirror.net/docs/migration/   --> CodeMirror.fromTextArea
        webServer.addStaticFile('./node_modules/codemirror/lib/codemirror.css');
        webServer.addStaticFile('./node_modules/codemirror/lib/codemirror.js');
        webServer.addStaticFile('./node_modules/codemirror/mode/javascript/javascript.js');
        webServer.addStaticFile('./node_modules/codemirror/mode/xml/xml.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/edit/matchbrackets.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/edit/closebrackets.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/search/search.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/dialog/dialog.css');
        webServer.addStaticFile('./node_modules/codemirror/addon/dialog/dialog.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/search/searchcursor.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/search/match-highlighter.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/hint/show-hint.css');
        webServer.addStaticFile('./node_modules/codemirror/addon/hint/show-hint.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/hint/javascript-hint.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/scroll/annotatescrollbar.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/search/matchesonscrollbar.js');
        webServer.addStaticFile('./node_modules/codemirror/addon/search/matchesonscrollbar.css');

        webServer.addStaticFile('./node_modules/file-saver/dist/' + (minimized ? 'FileSaver.min.js' : 'FileSaver.js'));
        webServer.addStaticFile('./node_modules/js-beautify/js/lib/beautify.js');
        webServer.addStaticFile('./node_modules/js-beautify/js/lib/beautify-html.js');
        webServer.addStaticFile('./node_modules/js-beautify/js/lib/beautify-css.js');
        // Note: This needs to be added towards the end because it overrides the dark background of dialogues, which is defined by jquery-ui.css.
        for (const file of config.staticWebServerFiles) {
            webServer.addStaticFile(file);
        }
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Client.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Executor.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/HashLists.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/JsonFX.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Mathematics.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/ObjectPositionSystem.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Regex.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Sorting.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Utilities.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Core.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Common.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/ContentManager.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/ObjectLifecycleManager.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/DataConnector.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Access.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/Logger.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/WebSocketConnection.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/ContentEditor.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/LanguageSwitching.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/src/TaskManager.js');
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/ext/md5.js'); // external
        // And last but not least add client side 'main' program using the previously added files:
        webServer.addStaticFile('./node_modules/@markus.hardardt/js_utils/client/main.js');
        // No content - will be generated at runtime inside browser
        webServer.setBody('');
        // deliver main config to client
        webServer.post(Client.GET_CLIENT_CONFIG, (request, response) => response.send(JsonFX.stringify({
            applicationName: config.applicationName,
            logLevel: config.clientLogLevel,
            requestAnimationFrameCycle: config.clientRequestAnimationFrameCycle,
            accessPointUnregisterObserverDelay: config.clientAccessPointUnregisterObserverDelay
        }, false)));
        // handle requests
        if (config.postRequestHandler) {
            if (typeof config.postRequestHandler !== 'object') {
                throw new Error('The request handler is not an object');
            }
            for (const receiver in config.postRequestHandler) {
                if (config.postRequestHandler.hasOwnProperty(receiver)) {
                    const onRequest = config.postRequestHandler[receiver];
                    webServer.registerPostRequestHandler(receiver, onRequest)
                }
            }
        }
        // prepare content management system
        // we need the handler for database access
        const sqlAdapterFactory = SqlHelper.getAdapterFactory(hmi.logger);
        // Setting up content manager and add directory containing the icons for the configurator
        const configIconDirectory = webServer.addStaticDirectory('./node_modules/@markus.hardardt/js_utils/cfg/icons');
        const contentManager = ContentManager.getInstance(hmi.logger, sqlAdapterFactory, configIconDirectory);
        hmi.cms = contentManager;
        contentManager.registerOnWebServer(webServer);
        // Set up task manager
        const taskManager = TaskManager.getInstance(hmi.logger, hmi.cms, hmi);
        hmi.tasks = taskManager;
        contentManager.registerAffectedTypesListener(ContentManager.DataType.Task, taskManager.onTasksChanged);
        // Set up the handler for routing to individual target systems
        const dataAccessRouter = new Access.Router(hmi.logger);
        hmi.router = dataAccessRouter;
        // Set up a simple router using the target system router
        const dataAccessSwitch = new Access.Switch(dataAccessRouter.getDataAccessObject); // Use the access router handler as source
        // Set up the server side access point
        const bufferedDataAccess = new Access.Buffer(hmi.logger, dataAccessSwitch, config.serverAccessPointUnregisterObserverDelay); // Use the switch as source
        dataAccessRouter.onRegisterObserversOnSource = filter => bufferedDataAccess.registerObserversOnSource(filter);
        dataAccessRouter.onUnregisterObserversOnSource = filter => bufferedDataAccess.unregisterObserversOnSource(filter);
        hmi.access = bufferedDataAccess; // Enable access from anyhwere

        // Add static files
        /* function addStaticFiles(file) {
            if (Array.isArray(file)) {
                for (const f of file) {
                    addStaticFiles(f);
                }
            } else if (typeof file === 'string' && file.length > 0) {
                webServer.addStaticFile(file);
            }
        }
        addStaticFiles(config.staticClientFiles);*/
        webServer.addStaticFile(config.touch ? config.scrollbar_hmi : config.scrollbar_config);

        // Here we store the tasks to be executed as a sequence in order to start the server environment.
        const tasks = [];

        // Prepare web socket server
        const dataConnectors = {};
        let webSocketServer = undefined;
        webServer.post(WebSocketConnection.GET_WEB_SOCKET_SESSION_CONFIG,
            (request, response) => response.send(JsonFX.stringify(webSocketServer.createSessionConfig(), false))
        );
        tasks.push((onSuccess, onError) => {
            try {
                webSocketServer = new WebSocketConnection.Server(hmi.logger, config.webSocketPort, {
                    secure: webServer.isSecure,
                    autoConnect: config.autoConnect,
                    closedConnectionDisposeTimeout: config.closedConnectionDisposeTimeout,
                    onOpen: connection => {
                        hmi.logger.debug(`web socket client opened (sessionId: '${WebSocketConnection.formatSesionId(connection.sessionId)}')`);
                        taskManager.onOpen(connection);
                        const dataConnector = DataConnector.getInstance(hmi.logger);
                        dataConnector.source = bufferedDataAccess;
                        dataConnector.connection = connection;
                        dataConnector.sendDelay = config.dataConnectorSendDelay;
                        dataConnector.sendObserverRequestDelay = config.sendObserverRequestDelay;
                        dataConnectors[connection.sessionId] = dataConnector;
                        dataAccessRouter.registerDataConnector(dataConnector);
                        dataConnector.onOpen();
                    },
                    onReopen: connection => {
                        hmi.logger.debug(`web socket client reopened (sessionId: '${WebSocketConnection.formatSesionId(connection.sessionId)}')`);
                        taskManager.onOpen(connection);
                        const dataConnector = dataConnectors[connection.sessionId];
                        dataConnector.onOpen();
                        dataAccessRouter.registerDataConnector(dataConnector);
                    },
                    onClose: connection => {
                        hmi.logger.debug(`web socket client closed (sessionId: '${WebSocketConnection.formatSesionId(connection.sessionId)}')`);
                        taskManager.onClose(connection);
                        const dataConnector = dataConnectors[connection.sessionId];
                        dataConnector.onClose();
                        dataAccessRouter.unregisterDataConnector(dataConnector);
                    },
                    onDispose: connection => {
                        hmi.logger.debug(`web socket client disposed (sessionId: '${WebSocketConnection.formatSesionId(connection.sessionId)}')`);
                        taskManager.onClose(connection);
                        const dataConnector = dataConnectors[connection.sessionId];
                        dataConnector.onClose();
                        delete dataConnectors[connection.sessionId];
                        dataConnector.connection = null;
                        dataConnector.source = null;
                    },
                    onError: (connection, error) => {
                        hmi.logger.error(`error in connection (sessionId: '${WebSocketConnection.formatSesionId(connection.sessionId)}') to server`, error);
                    }
                });
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });

        tasks.push((onSuccess, onError) => taskManager.initialize(onSuccess, onError));

        tasks.push((onSuccess, onError) => taskManager.startAutorunTasks(onSuccess, onError));

        tasks.push((onSuccess, onError) => {
            webServer.listen(config.webServerPort, () => {
                hmi.logger.info(`${config.applicationName} web server listening on port: ${config.webServerPort}`);
                onSuccess();
            });
        });

        tasks.push((onSuccess, onError) => {
            try {
                // Validate services
                Common.validateAsLogger(hmi.logger, true);
                Common.validateAsContentManagerOnServer(hmi.cms, true);
                Common.validateAsDataAccessObject(hmi.access, true);
                // Freeze the hmi object and it's content
                Object.freeze(hmi.utils);
                Object.freeze(hmi.env);
                Object.freeze(hmi.ext);
                Object.freeze(hmi);
                onSuccess();
            } catch (error) {
                onError('Failed validation of services', error);
            }
        });

        Executor.run(tasks,
            () => hmi.logger.info(`${config.applicationName} running`),
            error => hmi.logger.error(`Failed starting ${config.applicationName}`, error)
        );

        function shutdownTaskManagerAsync() {
            return new Promise((resolve, reject) => {
                taskManager.shutdown(() => resolve(), error => {
                    hmi.logger.error('Failed to shutdown task manager', error);
                    reject(error);
                });
            });
        }

        async function cleanupAsync() {
            hmi.logger.info('cleaning up ...');
            await shutdownTaskManagerAsync();
            hmi.logger.info('cleanup done');
        }
        const cleanup = () => { (async () => await cleanupAsync())(); }

        function cleanUpAndExit() {
            cleanupAsync().then(() => process.exit(0));
        }

        process.on('SIGINT', cleanUpAndExit);
        process.on('SIGTERM', cleanUpAndExit);

        if (false) { // TODO: Remove debug stuff
            setTimeout(() => {
                hmi.logger.info('Trigger debug shutdown');
                cleanup();
            }, 5000);
        }
    }
    module.exports = main;
}());
