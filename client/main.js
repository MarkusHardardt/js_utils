(function (root) {
    "use strict";

    // create 'hmi' environment object
    const hmi = {
        // add hmi-object-framweork
        createObject: (object, element, onSuccess, onError, initData) =>
            ObjectLifecycleManager.createObject(object, element, onSuccess, onError, hmi, initData),
        killObject: ObjectLifecycleManager.killObject,
        showDialog: (object, onSuccess, onError) =>
            ObjectLifecycleManager.showDialog(hmi, object, onSuccess, onError),
        showDefaultConfirmationDialog: (object, onSuccess, onError) =>
            ObjectLifecycleManager.showDefaultConfirmationDialog(hmi, object, onSuccess, onError),
        // Environment
        env: {
            isInstance: instance => false, // TODO: Implement isInstance(instance)
            isSimulationEnabled: () => false // TODO: Implement isSimulationEnabled()
        },
        // here all droppables will be stored
        droppables: {}
    };
    // all static files have been loaded and now we create the hmi.
    $(() => {
        const urlSearchParams = new URLSearchParams(root.location.search);
        const languageQueryParameterValue = urlSearchParams.get('lang');
        const hmiQueryParameterValue = urlSearchParams.get('hmi');
        const tasks = [];
        tasks.parallel = false;

        const dataConnector = new DataConnector.ClientConnector();

        const taskManager = TaskManager.getInstance(hmi);
        hmi.env.tasks = taskManager;

        // prepare content management system
        tasks.push((onSuccess, onError) => hmi.env.cms = new ContentManager.Instance(onSuccess, onError));
        tasks.push((onSuccess, onError) => {
            const languages = hmi.env.lang = LanguageSwitching.getInstance(hmi.env.cms);
            const language = languages.IsAvailable(languageQueryParameterValue) ? languageQueryParameterValue : languages.GetLanguage();
            languages.LoadLanguage(language, onSuccess, onError);
        });
        let webSocketSessionConfig = undefined;
        // Load web socket session config from server
        tasks.push((onSuccess, onError) => Client.fetch('/get_web_socket_session_config', undefined, response => {
            webSocketSessionConfig = JSON.parse(response);
            console.log('Loaded web socket session configuration successfully. Session ID:', webSocketSessionConfig.sessionId);
            onSuccess();
        }, error => {
            console.error(`Error loading web socket session configuration: ${error}`);
            onError(error);
        }));
        let webSocketConnection = undefined;
        tasks.push((onSuccess, onError) => {
            try {
                webSocketConnection = new WebSocketConnection.ClientConnection(document.location.hostname, webSocketSessionConfig, {
                    heartbeatInterval: 2000,
                    heartbeatTimeout: 1000,
                    reconnectStart: 1000,
                    reconnectMax: 32000,
                    OnOpen: () => {
                        console.log(`web socket client opened (sessionId: '${WebSocketConnection.formatSesionId(webSocketConnection.SessionId)}')`);
                        taskManager.OnOpen();
                        dataConnector.OnOpen();
                    },
                    OnClose: () => {
                        console.log(`web socket client closed (sessionId: '${WebSocketConnection.formatSesionId(webSocketConnection.SessionId)}')`);
                        taskManager.OnClose();
                        dataConnector.OnClose();

                    },
                    OnError: error => {
                        console.error(`error in connection (sessionId: '${WebSocketConnection.formatSesionId(webSocketConnection.SessionId)}') to server: ${error}`);
                    }
                });
                taskManager.Connection = webSocketConnection;
                dataConnector.Connection = webSocketConnection;
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        // load client config
        let config = false;
        tasks.push((onSuccess, onError) => {
            Client.fetch('/get_client_config', null, response => {
                config = JSON.parse(response);
                onSuccess();
            }, onError);
        });
        // Provide data access from any context to any source
        tasks.push((onSuccess, onError) => {
            // Create router for delegation to language or data values 
            const dataAccessRouter = new DataPoint.Router();
            const isValidLanguageValueId = hmi.env.cms.GetIdValidTestFunctionForLanguageValue();
            dataAccessRouter.GetDataAccessObject = dataId => isValidLanguageValueId(dataId) ? hmi.env.lang : dataConnector;
            // Create collection providing multiple subscriptions from any context
            const dataAccessPoint = new DataPoint.AccessPoint();
            dataAccessPoint.UnsubscribeDelay = config.unsubscribeDelay;
            dataAccessPoint.Source = dataAccessRouter; // Use the router as source
            hmi.env.data = dataAccessPoint; // Enable access from anyhwere
            onSuccess();
        });

        let rootObject = null;
        tasks.push((onSuccess, onError) => {
            if (hmiQueryParameterValue) {
                hmi.env.cms.GetHMIObject(hmiQueryParameterValue, hmi.env.lang.GetLanguage(), object => {
                    if (object !== null && typeof object === 'object' && !Array.isArray(object)) {
                        rootObject = object;
                    } else {
                        rootObject = { text: `view: '${hmiQueryParameterValue}' is not an HMI object` }; // TODO: Implement 'better' info object
                    }
                    onSuccess();
                }, error => {
                    rootObject = { html: `<h1>Failed loading HMI: '<code>${hmiQueryParameterValue}</code>'</h1><br />Error reason: <code>${error}</code>` };
                    onSuccess();
                });
            } else {
                rootObject = ContentEditor.create(hmi);
                hmi.env.data.OnError = rootObject.notifyError;
                onSuccess();
            }
        });
        tasks.push((onSuccess, onError) => {
            Client.startRefreshCycle(config.requestAnimationFrameCycle, () => ObjectLifecycleManager.refreshRootObjects(new Date()));
            onSuccess();
        });
        // load hmi
        Executor.run(tasks, () => {
            Object.seal(hmi.env);
            Object.seal(hmi);
            const body = $(document.body);
            body.empty();
            body.addClass('hmi-body');
            hmi.createObject(rootObject, body, () => console.log('js hmi started'), error => console.error(error));
            body.on('unload', () => hmi.killObject(rootObject, () => console.log('js hmi stopped'), error => console.error(error)));
        }, error => console.error(error));
    });
}(globalThis));
