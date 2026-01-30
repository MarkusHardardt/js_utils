(function (root) {
    "use strict";

    // create 'hmi' environment object
    const hmi = {};
    // debug brakeports
    hmi.debug_breakpoint = window.debug_breakpoint;
    // here we add our libraries
    hmi.lib = {};
    // load Mathematics
    hmi.lib.Mathematics = root.Mathematics;
    hmi.lib.JsonFX = root.JsonFX;
    hmi.lib.exec = root.Executor;
    hmi.lib.regex = root.Regex;
    // here all droppables will be stored
    hmi.droppables = {};

    hmi.env = {
        isInstance: instance => false, // TODO: Implement isInstance(instance)
        isSimulationEnabled: () => false // TODO: Implement isSimulationEnabled()
    };

    // add hmi-object-framweork
    hmi.create = (object, element, onSuccess, onError, initData) =>
        ObjectLifecycleManager.create(object, element, onSuccess, onError, hmi, initData);
    hmi.kill = ObjectLifecycleManager.kill;
    hmi.showDialog = (object, onSuccess, onError) =>
        ObjectLifecycleManager.showDialog(hmi, object, onSuccess, onError);
    hmi.showDefaultConfirmationDialog = (object, onSuccess, onError) =>
        ObjectLifecycleManager.showDefaultConfirmationDialog(hmi, object, onSuccess, onError);

    class LanguageSwitching { // TODO: move to separate file
        constructor(cms) {
            this._cms = cms;
            this._languages = cms.GetLanguages();
            this._language = this._languages[0];
            this._dataPoints = {};
        }
        GetType(dataId) {
            return this._dataPoints[dataId] ? Core.DataType.String : Core.DataType.Unknown;
        }
        SubscribeData(dataId, onRefresh) {
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                throw new Error(`Unsupported data id for subscribe: '${dataId}'`);
            } else if (dataPoint.onRefresh !== null) {
                throw new Error(`Data id '${dataId}' is already subscribed`);
            }
            dataPoint.onRefresh = onRefresh;
            onRefresh(dataPoint.value);
        }
        UnsubscribeData(dataId, onRefresh) {
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                throw new Error(`Unsupported data id for unsubscribe: '${dataId}'`);
            } else if (dataPoint.onRefresh === null) {
                throw new Error(`Data id '${dataId}' is not subscribed`);
            }
            dataPoint.onRefresh = null;
        }
        Read(dataId, onResponse, onError) {
            const dataPoint = this._dataPoints[dataId];
            if (dataPoint) {
                onResponse(dataPoint.value);
            } else {
                onError(`Unsupported data id for read: '${dataId}'`);
            }
        }
        Write(dataId, value) {
            throw new Error(`Write to data with id '${dataId}' is not supported`);
        }
        GetLanguages() {
            return this._languages.map(l => l);
        }
        GetLanguage() {
            return this._language;
        }
        IsAvailable(language) {
            return this._languages.indexOf(language) >= 0;
        }
        LoadLanguage(language, onSuccess, onError) {
            const tasks = [];
            let labelValues, htmlValues;
            tasks.push((onSuc, onErr) => hmi.env.cms.GetAllLabelValuesForLanguage(language, response => {
                labelValues = response;
                onSuc();
            }, onErr));
            tasks.push((onSuc, onErr) => hmi.env.cms.GetAllHtmlValuesForLanguage(language, response => {
                htmlValues = response;
                onSuc();
            }, onErr));
            Executor.run(tasks, () => {
                for (const id in labelValues) {
                    if (labelValues.hasOwnProperty(id)) {
                        let dataPoint = this._dataPoints[id];
                        if (!dataPoint) {
                            dataPoint = this._dataPoints[id] = { onRefresh: null };
                        }
                        dataPoint.value = labelValues[id];
                    }
                }
                for (const id in htmlValues) {
                    if (htmlValues.hasOwnProperty(id)) {
                        let dataPoint = this._dataPoints[id];
                        if (!dataPoint) {
                            dataPoint = this._dataPoints[id] = { onRefresh: null };
                        }
                        dataPoint.value = htmlValues[id];
                    }
                }
                for (const id in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(id) && labelValues[id] === undefined && htmlValues[id] === undefined) {
                        delete this._dataPoints[id];
                    }
                }
                this._language = language;
                onSuccess();
            }, onError);
        }
    }

    // all static files have been loaded and now we create the hmi.
    $(() => {
        const urlSearchParams = new URLSearchParams(root.location.search);
        const languageQueryParameterValue = urlSearchParams.get('lang');
        const hmiQueryParameterValue = urlSearchParams.get('hmi');
        const tasks = [];
        tasks.parallel = false;

        const dataCollection = new DataPoint.Collection();
        hmi.env.data = dataCollection;

        const dataRouter = new DataPoint.Router();
        dataCollection.Parent = dataRouter;

        const dataConnector = new DataConnector.ClientConnector();
        // hmi.env.data = dataConnector; // TODO: Insert router for labels, html and data connector values

        const taskManager = TaskManager.getInstance(hmi);
        hmi.env.tasks = taskManager;

        // prepare content management system
        tasks.push((onSuccess, onError) => hmi.env.cms = new ContentManager.Instance(onSuccess, onError));
        tasks.push((onSuccess, onError) => {
            const languages = hmi.env.lang = new LanguageSwitching(hmi.env.cms);
            const language = languages.IsAvailable(languageQueryParameterValue) ? languageQueryParameterValue : languages.GetLanguage();
            languages.LoadLanguage(language, onSuccess, onError);
        });
        tasks.push((onSuccess, onError) => {
            const isValidLabelId = hmi.env.cms.GetIdValidTestFunctionForType(ContentManager.DataTableType.Label);
            const isValidHtmlId = hmi.env.cms.GetIdValidTestFunctionForType(ContentManager.DataTableType.HTML);
            dataRouter.GetDataAccessObject = dataId => {
                if (isValidLabelId(dataId) || isValidHtmlId(dataId)) {
                    return hmi.env.lang;
                } else {
                    return dataConnector;
                }
            }
            onSuccess();
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
                onSuccess();
            }
        });
        tasks.push((onSuccess, onError) => {
            Client.startRefreshCycle(config.requestAnimationFrameCycle, () => ObjectLifecycleManager.refresh(new Date()));
            onSuccess();
        });
        // load hmi
        Executor.run(tasks, () => {
            Object.seal(hmi);
            const body = $(document.body);
            body.empty();
            body.addClass('hmi-body');
            hmi.create(rootObject, body, () => console.log('js hmi started'), error => console.error(error));
            body.on('unload', () => hmi.kill(rootObject, () => console.log('js hmi stopped'), error => console.error(error)));
        }, error => console.error(error));
    });
}(globalThis));
