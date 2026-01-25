(function (root) {
    "use strict";
    const TaskManager = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    const DEFAULT_TASK_MANAGER_RECEIVER = 'tmr';
    const TransmissionType = Object.freeze({
        ConfigurationRequest: 1,
        StartTask: 2,
        StopTask: 3,
        StateRefresh: 4
    });

    class BaseManager {
        constructor(hmi) {
            if (this.constructor === BaseManager) {
                throw new Error('The abstract base class BaseManager cannot be instantiated.')
            }
            this.hmi = hmi;
            this.onError = Core.defaultOnError;
            this.receiver = DEFAULT_TASK_MANAGER_RECEIVER;
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
    }

    class ServerManager extends BaseManager {
        constructor(hmi) {
            super(hmi);
            this._connections = {};
            this._taskObjects = {};
        }

        Initialize(onSuccess, onError) {
            const that = this;
            this.hmi.env.cms.GetTaskObjects(response => {
                for (let entry of response) {
                    (function () {
                        const path = entry.path;
                        that._taskObjects[entry.path] = entry;
                        entry._onLifecycleStateChanged = state => that._onLifecycleStateChanged(path, state);
                    }());
                }
                onSuccess();
            }, onError);
        }

        _onLifecycleStateChanged(path, state) {
            console.log(`task: ${path}, state: ${state}`);
            const data = { type: TransmissionType.StateRefresh, path, state };
            for (const sessionId in this._connections) {
                if (this._connections.hasOwnProperty(sessionId)) {
                    const con = this._connections[sessionId];
                    con.connection.Send(this.receiver, data);
                }
            }
        }

        OnOpen(connection) {
            this._onOpen(connection);
        }

        OnReopen(connection) {
            this._onOpen(connection);
        }

        OnClose(connection) {
            this._onClose(connection);
        }

        OnDispose(connection) {
            this._onClose(connection);
        }

        _onOpen(connection) {
            const sessionId = connection.SessionId;
            if (this._connections[sessionId] === undefined) {
                const con = this._connections[sessionId] = {
                    connection,
                    handler: (data, onResponse, onError) => this._handleReceived(data, onResponse, onError)
                };
                connection.Register(this.receiver, con.handler);
            }
        }

        _onClose(connection) {
            const sessionId = connection.SessionId;
            if (this._connections[sessionId] !== undefined) {
                connection.Unregister(this.receiver);
                delete this._connections[sessionId];
            }
        }

        _handleReceived(data, onResponse, onError) {
            switch (data.type) {
                case TransmissionType.ConfigurationRequest:
                    onResponse(this._taskObjects);
                    break;
                case TransmissionType.StartTask:
                    this._startTask(data.path, onResponse, onError);
                    break;
                case TransmissionType.StopTask:
                    this._stopTask(data.path, onResponse, onError);
                    break;
                default:
                    this.onError(`Invalid transmission type: ${data.type}`);
            }
        }

        _startTask(path, onSuccess, onError) {
            const hmi = this.hmi;
            const taskObject = this._taskObjects[path];
            if (!taskObject) {
                onError(`Unknown task: '${path}'`);
            } else if (taskObject._task) {
                onError(`Task '${path}' has already been started`);
            } else {
                hmi.env.cms.GetObject(taskObject.taskObject, hmi.language, ContentManager.PARSE, task => {
                    taskObject._task = task;
                    // (i_object, i_jqueryElement, i_success, i_error, i_hmi, i_initData, i_parentObject, i_nodeId, i_parentNode, i_disableVisuEvents, i_enableEditorEvents, onLifecycleStateChanged)
                    ObjectLifecycleManager.create(taskObject._task, null, () => {
                        console.log(`task '${taskObject.taskObject} started`);
                        onSuccess();
                    }, error => {
                        const err = `Failed starting task '${taskObject.taskObject} for task '${path}': ${error}`;
                        console.error(err);
                        onError(err);
                    }, this.hmi, undefined, undefined, undefined, undefined, undefined, undefined, taskObject._onLifecycleStateChanged);
                }, error => onError(`Failed to load object '${taskObject.taskObject}' for task '${path}': ${error}`));
            }
        }

        _stopTask(path, onSuccess, onErrors) {
            const taskObject = this._taskObjects[path];
            if (!taskObject) {
                onError(`Unknown task: '${path}'`);
            } else if (!taskObject._task) {
                onError(`Task '${path}' has not been started`);
            } else {
                const task = taskObject._task;
                delete taskObject._task;
                ObjectLifecycleManager.destroy(task, () => {
                    console.log(`task '${taskObject.taskObject} stopped`);
                    onSuccess();
                }, error => {
                    const err = `Failed stopping task '${taskObject.taskObject}: ${error}`;
                    console.error(err);
                    onErrors(err);
                }, taskObject._onLifecycleStateChanged);
            }
        }

        StartAutorunTasks(onSuccess, onError) {
            const that = this, taskObjects = this._taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if ((taskObject.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0) {
                            tasks.push((onSuc, onErr) => that._startTask(taskObject.path, onSuc, onErr));
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
                        if (taskObject._task) {
                            tasks.push((onSuc, onErr) => that._stopTask(taskObject.path, onSuc, onErr));
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }
    }

    class ClientManager extends BaseManager {
        constructor(hmi) {
            super(hmi);
            this._open = false;
            this._connection = null;
            this._taskObjects = {};
            this._handler = (data, onResponse, onError) => this._handleReceived(data, onResponse, onError);
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
            this._open = true;
            this._loadConfiguration();
        }

        OnClose() {
            this._open = false;
            /*this._operational.Value = false;
           clearTimeout(this._subscribeDelayTimer);
           this._subscribeDelayTimer = null;*/
        }

        _handleReceived(data, onResponse, onError) {
            if (this._operational.Value) {
                switch (data.type) {
                    case TransmissionType.StateRefresh:
                        console.log(`task: ${path}, state: ${state}`);
                        break;
                    default:
                        this.onError(`Invalid transmission type: ${data.type}`);
                }
            }
        }

        _loadConfiguration() {
            Common.validateAsConnection(this._connection);
            this._connection.Send(this.receiver, { type: TransmissionType.ConfigurationRequest }, taskObjects => {
                this._taskObjects = taskObjects;
            }, error => {
                this.onError(error);
            });
        }

        StartTask(path, onResponse, onError) {
            if (!this._connection) {
                onError('Web socket connection is not available');
            } else if (!this._open) {
                onError('Web socket connection is closed');
            } else {
                this._connection.Send(this.receiver, { type: TransmissionType.StartTask, path }, onResponse, onError);
            }
        }

        StopTask(path, onResponse, onError) {
            if (!this._connection) {
                onError('Web socket connection is not available');
            } else if (!this._open) {
                onError('Web socket connection is closed');
            } else {
                this._connection.Send(this.receiver, { type: TransmissionType.StopTask, path }, onResponse, onError);
            }
        }
    }

    TaskManager.getInstance = hmi => isNodeJS ? new ServerManager(hmi) : new ClientManager(hmi);

    Object.freeze(TaskManager);
    if (isNodeJS) {
        module.exports = TaskManager;
    } else {
        root.TaskManager = TaskManager;
    }
}(globalThis));
