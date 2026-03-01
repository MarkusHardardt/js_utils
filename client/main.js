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
        droppables: {},
        fetch: (receiver, request, onResponse, onError) => Client.fetchJsonFX(Client.HANDLE_REQUEST, { receiver, request }, onResponse, onError)
    };
    // all static files have been loaded and now we create the hmi.
    $(() => {
        const urlSearchParams = new URLSearchParams(root.location.search);
        const languageQueryParameterValue = urlSearchParams.get('lang');
        const hmiQueryParameterValue = urlSearchParams.get('hmi');
        const tasks = [];
        tasks.parallel = false;
        // load client config
        let config = false;
        tasks.push((onSuccess, onError) => {
            Client.fetch(Client.GET_CLIENT_CONFIG, null, response => {
                config = JSON.parse(response);
                hmi.applicationName = config.applicationName;
                Logger.setLevel(config.logLevel);
                onSuccess();
            }, onError);
        });

        // prepare logging
        tasks.push((onSuccess, onError) => {
            hmi.logger = new Logger(config.applicationName);
            onSuccess();
        });

        // prepare content management system
        tasks.push((onSuccess, onError) => hmi.cms = ContentManager.getInstance(hmi.logger, Evaluate.evalFunc, onSuccess, onError));
        tasks.push((onSuccess, onError) => {
            const languages = hmi.lang = LanguageSwitching.getInstance(hmi.logger, hmi.cms);
            const language = languages.isAvailable(languageQueryParameterValue) ? languageQueryParameterValue : languages.getLanguage();
            languages.loadLanguage(language, onSuccess, onError);
        });
        let webSocketSessionConfig = undefined;
        // Load web socket session config from server
        tasks.push((onSuccess, onError) => Client.fetch(WebSocketConnection.GET_WEB_SOCKET_SESSION_CONFIG, undefined, response => {
            webSocketSessionConfig = JSON.parse(response);
            hmi.logger.debug('Loaded web socket session configuration successfully. Session ID:', webSocketSessionConfig.sessionId);
            onSuccess();
        }, error => {
            hmi.logger.error('Failed loading web socket session configuration', error);
            onError(error);
        }));
        let dataConnector = undefined;
        let webSocketConnection = undefined;
        tasks.push((onSuccess, onError) => {
            dataConnector = DataConnector.getInstance(hmi.logger);
            const taskManager = TaskManager.getInstance(hmi.logger);
            hmi.tasks = taskManager;
            try {
                webSocketConnection = new WebSocketConnection.ClientConnection(hmi.logger, document.location.hostname, webSocketSessionConfig, {
                    heartbeatInterval: 2000,
                    heartbeatTimeout: 1000,
                    reconnectStart: 1000,
                    reconnectMax: 32000,
                    onOpen: () => {
                        hmi.logger.debug(`web socket client opened (sessionId: '${WebSocketConnection.formatSesionId(webSocketConnection.sessionId)}')`);
                        taskManager.onOpen();
                        dataConnector.onOpen();
                    },
                    onClose: () => {
                        hmi.logger.debug(`web socket client closed (sessionId: '${WebSocketConnection.formatSesionId(webSocketConnection.sessionId)}')`);
                        taskManager.onClose();
                        dataConnector.onClose();

                    },
                    onError: error => {
                        hmi.logger.error(`error in connection (sessionId: '${WebSocketConnection.formatSesionId(webSocketConnection.sessionId)}') to server`, error);
                    }
                });
                taskManager.connection = webSocketConnection;
                dataConnector.connection = webSocketConnection;
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        // Provide data access from any context to any source
        tasks.push((onSuccess, onError) => {
            // Create router for delegation to language or data values 
            const isValidLanguageValueId = hmi.cms.getIdValidTestFunctionForLanguageValue();
            const dataAccessSwitch = new Access.Switch(dataId => isValidLanguageValueId(dataId) ? hmi.lang : dataConnector);
            // Create collection providing multiple subscriptions from any context
            const bufferedDataAccess = new Access.Buffer(hmi.logger, dataAccessSwitch, config.accessPointUnregisterObserverDelay); // Use the router as source
            hmi.access = bufferedDataAccess; // Enable access from anyhwere
            onSuccess();
        });

        let rootObject = null;
        tasks.push((onSuccess, onError) => {
            if (hmiQueryParameterValue) {
                hmi.cms.getHMIObject(hmiQueryParameterValue, hmi.lang.getLanguage(), object => {
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
                onSuccess();
            }
        });
        tasks.push((onSuccess, onError) => {
            Client.startRefreshCycle(config.requestAnimationFrameCycle, () => ObjectLifecycleManager.refreshRootObjects(new Date()));
            onSuccess();
        });
        tasks.push((onSuccess, onError) => {
            try {
                // Validate services
                Common.validateAsLogger(hmi.logger, true);
                Common.validateAsContentManager(hmi.cms, true);
                Common.validateAsDataAccessObject(hmi.access, true);
                // Freeze the hmi object and it's content
                Object.freeze(hmi.env);
                Object.freeze(hmi);
                onSuccess();
            } catch (error) {
                onError('Failed validation of services', error);
            }
        });
        // load hmi
        Executor.run(tasks, () => {
            const body = $(document.body);
            body.empty();
            body.addClass('hmi-body');
            hmi.createObject(rootObject, body,
                () => hmi.logger.info(`${config.applicationName} started`),
                error => hmi.logger.error(`Failed starting ${config.applicationName}`, error)
            );
            body.on('unload', () => hmi.killObject(rootObject,
                () => hmi.logger.info(`${config.applicationName} stopped`),
                error => hmi.logger.error(`Failed stopping ${config.applicationName}`, error)
            ));
        }, error => hmi.logger.error(`Failed building ${config.applicationName}`, error));
    });
}(globalThis));
