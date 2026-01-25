(function (root) {
    "use strict";
    const TaskManager = {};
    const isNodeJS = typeof require === 'function';
    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    const HANDLE_TASK_MANAGER_REQUEST = '/handle_task_manager_request';
    const DEFAULT_TASK_MANAGER_RECEIVER = 'tmr';
    const TransmissionType = Object.freeze({
        ConfigurationRequest: 1,
        StateRefresh: 999
    });

    const Actions = Object.freeze({
        Start: 'start',
        Stop: 'stop'
    });

    class BaseManager {
        constructor(hmi) {
            if (this.constructor === BaseManager) {
                throw new Error('The abstract base class BaseManager cannot be instantiated.')
            }
            this.hmi = hmi;
            this.onError = Core.defaultOnError;
            this.receiver = DEFAULT_TASK_MANAGER_RECEIVER;
            this._handler = (data, onResponse, onError) => this.handleReceived(data, onResponse, onError);
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError() is not a function');
            }
            this.onError = value;
        }

        set Receiver(value) {
            if (typeof value !== 'string') {
                throw new Error(`Invalid receiver: ${value}`);
            }
            this.receiver = value;
        }

        handleReceived(data, onResponse, onError) {
            throw new Error('Not implemented in base class: handleReceived(data, onResponse, onError)')
        }
    }

    class ServerManager extends BaseManager {
        constructor(hmi) {
            super(hmi);
            this._connections = {};
            this._taskObjects = {};
        }

        RegisterOnWebServer(webServer) {
            // we need access via ajax from clients
            webServer.Post(HANDLE_TASK_MANAGER_REQUEST, (request, response) => this._handleRequest(
                request.body,
                result => response.send(JsonFX.stringify({ result }, false)),
                error => response.send(JsonFX.stringify({ error: error.toString() }, false))
            ));
        }

        OnOpen(connection) {
            this._connections[connection.SessionId] = connection;
        }

        OnReopen(connection) {
            this._connections[connection.SessionId] = connection;
        }

        OnClose(connection) {
            delete this._connections[connection.SessionId];
        }

        OnDispose(connection) {
            delete this._connections[connection.SessionId];
        }

        _handleRequest(request, onResponse, onError) {
            switch (request.action) {
                case Actions.Start:
                    {
                        const taskObject = this._taskObjects[request.path];
                        if (!taskObject) {
                            onError(`Failed to start unknown task object '${request.path}'`);
                        } else if (taskObject._active) {
                            onError(`Task object '${request.path}' is already running`);
                        } else {
                            this._startTask(taskObject, () => onResponse(`Started task object '${request.path}'`), onError);
                        }
                    }
                    break;
                case Actions.Stop:
                    {
                        const taskObject = this._taskObjects[request.path];
                        if (!taskObject) {
                            onError(`Failed to stop unknown task object '${request.path}'`);
                        } else if (!taskObject._active) {
                            onError(`Task object '${request.path}' is not running`);
                        } else {
                            this._stopTask(taskObject, () => onResponse(`Stopped task object '${request.path}'`), onError);
                        }
                    }
                    break;
                default:
                    onError(`Unuported action: '${request.action}'`);
                    break;
            }
        }

        Initialize(onSuccess, onError) { // TODO Use websocket
            const hmi = this.hmi;
            hmi.env.cms.GetTaskObjects(response => {
                const tasks = [];
                const languages = hmi.env.cms.GetLanguages();
                for (let entry of response) {
                    this._taskObjects[entry.path] = entry;
                    (function () {
                        const taskObject = entry;
                        tasks.push((onSuc, onErr) => {
                            hmi.env.cms.GetObject(taskObject.taskObject, languages[0], ContentManager.PARSE, task => {
                                taskObject._task = task;
                                onSuc();
                            }, onErr);
                        });
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            }, onError);
        }

        StartAutorunTasks(onSuccess, onError) {
            const that = this, taskObjects = this._taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if ((taskObject.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0) {
                            tasks.push((onSuc, onErr) => that._startTask(taskObject, onSuc, onErr));
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }

        Shutdown(onSuccess, onError) {
            const that = this, taskObjects = this._taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if (taskObject._active) {
                            tasks.push((onSuc, onErr) => that._stopTask(taskObject, onSuc, onErr));
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }

        _startTask(taskObject, onSuccess, onError) {
            taskObject._active = true;
            ObjectLifecycleManager.create(taskObject._task, null, () => {
                console.log(`task '${taskObject.taskObject} started`);
                onSuccess();
            }, error => {
                const err = `Failed starting task '${taskObject.taskObject}: ${error}`;
                console.error(err);
                onError(err);
            }, this.hmi);
        }

        _stopTask(taskObject, onSuccess, onErrors) {
            taskObject._active = false;
            // (i_object, i_success, i_error, onLifecycleStateChanged)
            ObjectLifecycleManager.destroy(taskObject._task, () => {
                console.log(`task '${taskObject.taskObject} stopped`);
                onSuccess();
            }, error => {
                const err = `Failed stopping task '${taskObject.taskObject}: ${error}`;
                console.error(err);
                onErrors(err);
            });
        }
    }

    class ClientManager extends BaseManager {
        constructor(hmi) {
            super(hmi);
            this._connection = null;
            this._taskObjects = {};
        }

        set Connection(value) {
            if (value) {
                if (this._connection) {
                    this._connection.Unregister(this.receiver);
                    this._connection = null;
                }
                Common.validateAsConnection(value, true);
                this._connection = value;
                this._connection.Register(this.receiver, this._handler);
            } else if (this._connection) {
                this._connection.Unregister(this.receiver);
                this._connection = null;
            }
        }

        OnOpen() {
            this._loadConfiguration();
        }

        OnClose() {
            /*this._operational.Value = false;
           clearTimeout(this._subscribeDelayTimer);
           this._subscribeDelayTimer = null;*/
        }

        handleReceived(data, onResponse, onError) {
            if (this._operational.Value) {
                switch (data.type) {
                    case TransmissionType.StateRefresh:
                        for (const shortId in data.values) {
                            if (data.values.hasOwnProperty(shortId)) {
                                const dpConfByShortId = this._dataPointConfigsByShortId[shortId];
                                if (!dpConfByShortId) {
                                    this.onError(`Unexpected short id: ${shortId}`);
                                    continue;
                                }
                                const dataPoint = this._dataPointsByDataId[dpConfByShortId.dataId];
                                if (!dataPoint) {
                                    this.onError(`Unknown data id: ${dpConfByShortId.dataId}`);
                                    continue;
                                }
                                dataPoint.node.Value = data.values[shortId];
                            }
                        }
                        break;
                    default:
                        this.onError(`Invalid transmission type: ${data.type}`);
                }
            }
        }

        _loadConfiguration() {
            Common.validateAsConnection(this._connection);
            this._connection.Send(this.receiver, { type: TransmissionType.ConfigurationRequest }, config => {
                this._subscribeDelay = typeof config.subscribeDelay === 'number' && config.subscribeDelay > 0 ? config.subscribeDelay : false;
                this._unsubscribeDelay = typeof config.unsubscribeDelay === 'number' && config.unsubscribeDelay > 0 ? config.unsubscribeDelay : false;
                this._operational.UnsubscribeDelay = this._unsubscribeDelay;
                this._setDataPointConfigsByShortId(config.dataPointConfigsByShortId);
                this._operational.Value = true;
                this._sendSubscriptionRequest();
            }, error => {
                this._operational.Value = false;
                this.onError(error);
            });
        }

        Initialize(onSuccess, onError) {
            const hmi = this.hmi;
            hmi.env.cms.GetTaskObjects(response => {
                const tasks = [];
                for (let entry of response) {
                    this._taskObjects[entry.path] = entry;
                    (function () {
                        const taskObject = entry;
                        tasks.push((onSuc, onErr) => {
                            hmi.env.cms.GetObject(taskObject.taskObject, hmi.language, ContentManager.PARSE, task => {
                                taskObject._task = task;
                                onSuc();
                            }, onErr);
                        });
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            }, onError);
        }
    }

    TaskManager.getInstance = hmi => isNodeJS ? new ServerManager(hmi) : new ClientManager(hmi);

    if (!isNodeJS) {
        // TODO: Move to ClientManager
        function startTask(path, onSuccess, onError) {
            Client.fetchJsonFX(HANDLE_TASK_MANAGER_REQUEST, { action: Actions.Start, path }, response => onSuccess(response), error => onError(error));
        }
        TaskManager.startTask = startTask;
        function stopTask(path, onSuccess, onError) {
            Client.fetchJsonFX(HANDLE_TASK_MANAGER_REQUEST, { action: Actions.Stop, path }, response => onSuccess(response), error => onError(error));
        }
        TaskManager.stopTask = stopTask;
    }

    Object.freeze(TaskManager);
    if (isNodeJS) {
        module.exports = TaskManager;
    } else {
        root.TaskManager = TaskManager;
    }
}(globalThis));
