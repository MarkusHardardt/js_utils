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
        ConfigurationRefresh: 2,
        StartTask: 3,
        StopTask: 4,
        StateRefresh: 5
    });

    class BaseManager {
        constructor(hmi) {
            if (this.constructor === BaseManager) {
                throw new Error('The abstract base class BaseManager cannot be instantiated.')
            }
            this._hmi = hmi;
            this._logger = hmi.env.logger;
        }
    }

    const RELOAD_TASKS_TIMEOUT = 1000;

    class ServerManager extends BaseManager {
        #connections;
        #taskObjects;
        #onTasksChanged;
        #reloadingTasks;
        #reloadTasksTimeout
        constructor(hmi) {
            super(hmi);
            this.#connections = {};
            this.#taskObjects = {};
            this.#onTasksChanged = () => this.#handleTasksChanged();
            this.#reloadingTasks = false;
            this.#reloadTasksTimeout = null;
        }

        get onTasksChanged() {
            return this.#onTasksChanged;
        }

        #handleTasksChanged() {
            if (this.#reloadTasksTimeout) {
                clearTimeout(this.#reloadTasksTimeout);
            }
            this.#reloadTasksTimeout = setTimeout(() => {
                this.#reloadTasksTimeout = null;
                this.#reloadTasks(() => this._logger.info('Loaded tasks'), error => this._logger.error(error));
            }, RELOAD_TASKS_TIMEOUT);
        }

        initialize(onSuccess, onError) {
            this.#reloadTasks(onSuccess, onError);
        }

        #reloadTasks(onSuccess, onError) {
            if (this.#reloadingTasks) {
                onError('Reloading tasks is already in progress');
            } else {
                this.#reloadingTasks = true;
                const that = this;
                this._hmi.env.cms.GetTaskObjects(response => {
                    const tasks = [];
                    // For all task configurations from cms we ether reuse an existing or add a new task object.
                    for (const config of response) {
                        (function () {
                            const path = config.path;
                            let taskObject = that.#taskObjects[path];
                            if (taskObject) {
                                if (taskObject.task && taskObject.config.taskObject !== config.taskObject) {
                                    // If the actual task object has changed we must stop the running instance
                                    tasks.push((onSuc, onErr) => that.#stopTask(path, () => {
                                        this._logger.warn(`Stopped task '${path}' because actual task object has changed`);
                                        onSuc();
                                    }, error => {
                                        const message = `Failed stopping task '${path}' because actual task object has changed:\n${error}`;
                                        this._logger.error(message);
                                        onErr(message);
                                    }));
                                }
                                taskObject.config = config;
                            } else {
                                that.#taskObjects[path] = taskObject = {
                                    config,
                                    state: ObjectLifecycleManager.LifecycleState.Idle,
                                    onLifecycleStateChanged: state => {
                                        taskObject.state = state;
                                        that.#onLifecycleStateChanged(path, state);
                                    }
                                };
                            }
                        }());
                    }
                    // For all stored task objects we check if it still exists and if not we (stop and) remove.
                    for (const path in that.#taskObjects) {
                        if (that.#taskObjects.hasOwnProperty(path)) {
                            let available = false;
                            for (const config of response) {
                                if (config.path === path) {
                                    available = true;
                                    break;
                                }
                            }
                            if (!available) {
                                const taskObject = that.#taskObjects[path];
                                if (taskObject.task) {
                                    // If the task is not available anymore we must stop the running instance
                                    tasks.push((onSuc, onErr) => that.#stopTask(path, () => {
                                        delete that.#taskObjects[path];
                                        this._logger.warn(`Stopped task '${path}' because it is not available anymore`);
                                        onSuc();
                                    }, error => {
                                        delete that.#taskObjects[path];
                                        const message = `Failed stopping task '${path}' because it is not available anymore:\n${error}`;
                                        this._logger.error(message);
                                        onErr(message);
                                    }));
                                } else {
                                    delete that.#taskObjects[path];
                                }
                            }
                        }
                    }
                    tasks.push((onSuc, onErr) => {
                        try {
                            const configData = { type: TransmissionType.ConfigurationRefresh, tasksConfigAndState: that.#getTasksConfigAndState() };
                            for (const sessionId in this.#connections) {
                                if (this.#connections.hasOwnProperty(sessionId)) {
                                    this.#connections[sessionId].connection.send(TASK_MANAGER_RECEIVER, configData);
                                }
                            }
                            onSuc();
                        } catch (error) {
                            onErr(error);
                        }
                    });
                    Executor.run(tasks, () => {
                        that.#reloadingTasks = false;
                        onSuccess();
                    }, error => {
                        that.#reloadingTasks = false;
                        onError(error);
                    });
                }, onError);
            }
        }

        #onLifecycleStateChanged(path, state) {
            const data = { type: TransmissionType.StateRefresh, path, state };
            for (const sessionId in this.#connections) {
                if (this.#connections.hasOwnProperty(sessionId)) {
                    this.#connections[sessionId].connection.send(TASK_MANAGER_RECEIVER, data);
                }
            }
        }

        onOpen(connection) {
            const sessionId = connection.SessionId;
            if (this.#connections[sessionId] === undefined) {
                const con = this.#connections[sessionId] = {
                    connection,
                    handler: (data, onResponse, onError) => this.#handleReceived(data, onResponse, onError)
                };
                connection.register(TASK_MANAGER_RECEIVER, con.handler);
            }
        }

        onClose(connection) {
            const sessionId = connection.SessionId;
            if (this.#connections[sessionId] !== undefined) {
                connection.unregister(TASK_MANAGER_RECEIVER);
                delete this.#connections[sessionId];
            }
        }

        #handleReceived(data, onResponse, onError) {
            switch (data.type) {
                case TransmissionType.ConfigurationRequest:
                    onResponse(this.#getTasksConfigAndState());
                    break;
                case TransmissionType.StartTask:
                    this.#startTask(data.path, onResponse, onError);
                    break;
                case TransmissionType.StopTask:
                    this.#stopTask(data.path, onResponse, onError);
                    break;
                default:
                    this._logger.error(`Invalid transmission type: ${data.type}`);
            }
        }

        #getTasksConfigAndState() {
            const configs = [];
            for (const path in this.#taskObjects) {
                if (this.#taskObjects.hasOwnProperty(path)) {
                    const taskObject = this.#taskObjects[path];
                    configs.push({ config: taskObject.config, state: taskObject.state });
                }
            }
            return configs;
        }

        #startTask(path, onSuccess, onError) {
            const hmi = this._hmi;
            const taskObject = this.#taskObjects[path];
            if (!taskObject) {
                onError(`Unknown task: '${path}'`);
            } else if (taskObject.task) {
                onError(`Task '${path}' has already been started`);
            } else {
                hmi.env.cms.GetObject(taskObject.config.taskObject, undefined, ContentManager.PARSE, task => {
                    taskObject.task = task;
                    ObjectLifecycleManager.createObject(taskObject.task, null, () => {
                        if (typeof taskObject.config.cycleMillis === 'number' && taskObject.config.cycleMillis > 0) {
                            taskObject.intervalTimer = setInterval(() => ObjectLifecycleManager.refreshObject(taskObject.task, new Date()), Math.ceil(taskObject.config.cycleMillis));
                            this._logger.info(`Started task '${path}' with object '${taskObject.config.taskObject}' (cycles at ${taskObject.config.cycleMillis} ms)`);
                        } else {
                            this._logger.info(`Started task '${path}' with object '${taskObject.config.taskObject}' (no cycles)`);
                        }
                        onSuccess();
                    }, error => {
                        const message = `Failed starting task '${path}' with object '${taskObject.config.taskObject}':\n${error}`;
                        this._logger.error(message);
                        onError(message);
                    }, this._hmi, undefined, undefined, undefined, undefined, undefined, undefined, taskObject.onLifecycleStateChanged);
                }, error => onError(`Failed loading task '${path}' object '${taskObject.config.taskObject}':\n${error}`));
            }
        }

        #stopTask(path, onSuccess, onError) {
            const taskObject = this.#taskObjects[path];
            if (!taskObject) {
                onError(`Unknown task: '${path}'`);
            } else if (!taskObject.task) {
                onError(`Task '${path}' has not been started`);
            } else {
                const task = taskObject.task;
                delete taskObject.task; // TODO: Should we delete the reference in the success/error callbacks?
                if (taskObject.intervalTimer) {
                    clearInterval(taskObject.intervalTimer);
                    delete taskObject.intervalTimer;
                }
                ObjectLifecycleManager.killObject(task, () => {
                    this._logger.info(`Stopped task '${path}' with object '${taskObject.config.taskObject}'`);
                    onSuccess();
                }, error => {
                    const message = `Failed stopping task '${path}' with object '${taskObject.config.taskObject}':\n${error}`;
                    this._logger.error(message);
                    onError(message);
                }, taskObject.onLifecycleStateChanged);
            }
        }

        startAutorunTasks(onSuccess, onError) {
            const that = this, taskObjects = this.#taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if ((taskObject.config.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0) {
                            tasks.push((onSuc, onErr) => that.#startTask(path, onSuc, onErr));
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }

        shutdown(onSuccess, onError) {
            const that = this, taskObjects = this.#taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if (taskObject.task) {
                            tasks.push((onSuc, onErr) => that.#stopTask(path, onSuc, onErr));
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }
    }

    class ClientManager extends BaseManager {
        #open;
        #connection;
        #taskObjects;
        #handler;
        #onConfigChanged;
        #onStateChanged;
        constructor(hmi) {
            super(hmi);
            this.#open = false;
            this.#connection = null;
            this.#taskObjects = {};
            this.#handler = (data, onResponse, onError) => this.#handleReceived(data, onResponse, onError);
            this.#onConfigChanged = null;
            this.#onStateChanged = null;
        }

        set connection(value) {
            if (value) {
                if (this.#connection) {
                    this.#connection.unregister(TASK_MANAGER_RECEIVER);
                    this.#connection = null;
                }
                Common.validateAsConnection(value, true);
                this.#connection = value;
                this.#connection.register(TASK_MANAGER_RECEIVER, this.#handler);
            } else if (this.#connection) {
                this.#connection.unregister(TASK_MANAGER_RECEIVER);
                this.#connection = null;
            }
        }

        set onConfigChanged(value) {
            if (value) {
                if (typeof value !== 'function') {
                    throw new Error('Value for onConfigChanged() is not a function');
                }
                this.#onConfigChanged = value;
            } else {
                this.#onConfigChanged = null;
            }
        }

        set onStateChanged(value) {
            if (value) {
                if (typeof value !== 'function') {
                    throw new Error('Value for onStateChanged(path, state) is not a function');
                }
                this.#onStateChanged = value;
            } else {
                this.#onStateChanged = null;
            }
        }

        onOpen() {
            this.#open = true;
            this.#loadConfiguration();
        }

        onClose() {
            this.#open = false;
        }

        #handleReceived(data, onResponse, onError) {
            switch (data.type) {
                case TransmissionType.ConfigurationRefresh:
                    this.#updateConfiguration(data.tasksConfigAndState);
                    break;
                case TransmissionType.StateRefresh:
                    this.#updateTaskState(data.path, data.state);
                    break;
                default:
                    this._logger.error(`Invalid transmission type: ${data.type}`);
            }
        }

        #loadConfiguration() {
            Core.validateAs('Connection', this.#connection, 'send:function').send(
                TASK_MANAGER_RECEIVER,
                { type: TransmissionType.ConfigurationRequest },
                response => this.#updateConfiguration(response),
                error => this._logger.error(error)
            );
        }

        #updateConfiguration(tasksConfigAndState) {
            for (let configAndState of tasksConfigAndState) {
                const path = configAndState.config.path;
                const taskObject = this.#taskObjects[path];
                if (taskObject) {
                    taskObject.config = configAndState.config;
                    taskObject.state = configAndState.state;
                } else {
                    this.#taskObjects[path] = { config: configAndState.config, state: configAndState.state };
                }
            }
            for (const path in this.#taskObjects) {
                if (this.#taskObjects.hasOwnProperty(path)) {
                    let available = false;
                    for (let configAndState of tasksConfigAndState) {
                        if (configAndState.config.path === path) {
                            available = true;
                            break;
                        }
                    }
                    if (!available) {
                        delete this.#taskObjects[path];
                    }
                }
            }
            if (this.#onConfigChanged) {
                try {
                    this.#onConfigChanged();
                } catch (error) {
                    this._logger.error('Failed calling onConfigChanged()', error);
                }
            }
        }

        #updateTaskState(path, state) {
            const taskObject = this.#taskObjects[path];
            if (taskObject) {
                taskObject.state = state;
            }
            if (this.#onStateChanged) {
                try {
                    this.#onStateChanged(path, state);
                } catch (error) {
                    this._logger.error('Failed calling onStateChanged(path, state)', error);
                }
            }
        }

        getTasks() {
            const result = [];
            for (const path in this.#taskObjects) {
                if (this.#taskObjects.hasOwnProperty(path)) {
                    const taskObject = this.#taskObjects[path];
                    result.push({
                        config: JSON.parse(JSON.stringify(taskObject.config)),
                        state: taskObject.state
                    });
                }
            }
            return result;
        }

        startTask(path, onResponse, onError) {
            if (!this.#connection) {
                onError('Web socket connection is not available');
            } else if (!this.#open) {
                onError('Web socket connection is closed');
            } else {
                this.#connection.send(TASK_MANAGER_RECEIVER, { type: TransmissionType.StartTask, path }, onResponse, onError);
            }
        }

        stopTask(path, onResponse, onError) {
            if (!this.#connection) {
                onError('Web socket connection is not available');
            } else if (!this.#open) {
                onError('Web socket connection is closed');
            } else {
                this.#connection.send(TASK_MANAGER_RECEIVER, { type: TransmissionType.StopTask, path }, onResponse, onError);
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
