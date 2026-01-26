(function (root) {
    "use strict";
    const TaskManager = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    const TASK_MANAGER_RECEIVER = 'TaskManager';
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
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError() is not a function');
            }
            this.onError = value;
        }
    }

    class ServerManager extends BaseManager {
        constructor(hmi) {
            super(hmi);
            this._connections = {};
            this._taskObjects = {};
            this._onTasksChanged = () => this._handleTasksChanged();
        }

        get OnTasksChanged() {
            return this._onTasksChanged;
        }

        _handleTasksChanged() {
            this._reloadTasks(() => console.log('Loaded tasks'), error => this.onError(error));
        }

        Initialize(onSuccess, onError) {
            this._reloadTasks(onSuccess, onError);
        }

        _reloadTasks(onSuccess, onError) {
            const that = this;
            this.hmi.env.cms.GetTaskObjects(response => {
                // TODO: Handle removed (stop), modified and added tasks and also trigger notification of clients via web socket
                for (let config of response) {
                    (function () {
                        const path = config.path;
                        that._taskObjects[path] = {
                            config,
                            onLifecycleStateChanged: state => that._onLifecycleStateChanged(path, state)
                        };
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
                    this._connections[sessionId].connection.Send(TASK_MANAGER_RECEIVER, data);
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
                connection.Register(TASK_MANAGER_RECEIVER, con.handler);
            }
        }

        _onClose(connection) {
            const sessionId = connection.SessionId;
            if (this._connections[sessionId] !== undefined) {
                connection.Unregister(TASK_MANAGER_RECEIVER);
                delete this._connections[sessionId];
            }
        }

        _handleReceived(data, onResponse, onError) {
            switch (data.type) {
                case TransmissionType.ConfigurationRequest:
                    const response = [];
                    for (const path in this._taskObjects) {
                        if (this._taskObjects.hasOwnProperty(path)) {
                            response.push(this._taskObjects[path].config);
                        }
                    }
                    onResponse(response);
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
            } else if (taskObject.task) {
                onError(`Task '${path}' has already been started`);
            } else {
                hmi.env.cms.GetObject(taskObject.config.taskObject, hmi.language, ContentManager.PARSE, task => {
                    taskObject.task = task;
                    ObjectLifecycleManager.create(taskObject.task, null, () => {
                        console.log(`Successfully started '${taskObject.config.taskObject}' for task '${path}'`);
                        onSuccess();
                    }, error => {
                        const err = `Failed starting '${taskObject.config.taskObject}' for task '${path}': ${error}`;
                        console.error(err);
                        onError(err);
                    }, this.hmi, undefined, undefined, undefined, undefined, undefined, undefined, taskObject.onLifecycleStateChanged);
                }, error => onError(`Failed to load object '${taskObject.config.taskObject}' for task '${path}': ${error}`));
            }
        }

        _stopTask(path, onSuccess, onError) {
            const taskObject = this._taskObjects[path];
            if (!taskObject) {
                onError(`Unknown task: '${path}'`);
            } else if (!taskObject.task) {
                onError(`Task '${path}' has not been started`);
            } else {
                const task = taskObject.task;
                delete taskObject.task;
                ObjectLifecycleManager.destroy(task, () => {
                    console.log(`Successfully stopped '${taskObject.config.taskObject}' for task '${path}'`);
                    onSuccess();
                }, error => {
                    const err = `Failed stopping '${taskObject.config.taskObject}' for task '${path}': ${error}`;
                    console.error(err);
                    onError(err);
                }, taskObject.onLifecycleStateChanged);
            }
        }

        StartAutorunTasks(onSuccess, onError) {
            const that = this, taskObjects = this._taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if ((taskObject.config.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0) {
                            tasks.push((onSuc, onErr) => that._startTask(path, onSuc, onErr));
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
                        if (taskObject.task) {
                            tasks.push((onSuc, onErr) => that._stopTask(path, onSuc, onErr));
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
                    this._connection.Unregister(TASK_MANAGER_RECEIVER);
                    this._connection = null;
                }
                Common.validateAsConnection(value, true);
                this._connection = value;
                this._connection.Register(TASK_MANAGER_RECEIVER, this._handler);
            } else if (this._connection) {
                this._connection.Unregister(TASK_MANAGER_RECEIVER);
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
            switch (data.type) {
                case TransmissionType.StateRefresh:
                    console.log(`task: ${data.path}, state: ${data.state}`);
                    break;
                default:
                    this.onError(`Invalid transmission type: ${data.type}`);
            }
        }

        _loadConfiguration() {
            Common.validateAsConnection(this._connection);
            this._connection.Send(TASK_MANAGER_RECEIVER, { type: TransmissionType.ConfigurationRequest }, response => {
                for (let config of response) {
                    const path = config.path;
                    this._taskObjects[path] = { config };
                }
            }, error => {
                this.onError(error);
            });
        }

        GetTaskObjects() {
            const taskObjects = [];
            for (const path in this._taskObjects) {
                if (this._taskObjects.hasOwnProperty(path)) {
                    taskObjects.push(JSON.parse(JSON.stringify(this._taskObjects[path].config)));
                }
            }
            return taskObjects;
        }

        StartTask(path, onResponse, onError) {
            if (!this._connection) {
                onError('Web socket connection is not available');
            } else if (!this._open) {
                onError('Web socket connection is closed');
            } else {
                this._connection.Send(TASK_MANAGER_RECEIVER, { type: TransmissionType.StartTask, path }, onResponse, onError);
            }
        }

        StopTask(path, onResponse, onError) {
            if (!this._connection) {
                onError('Web socket connection is not available');
            } else if (!this._open) {
                onError('Web socket connection is closed');
            } else {
                this._connection.Send(TASK_MANAGER_RECEIVER, { type: TransmissionType.StopTask, path }, onResponse, onError);
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
