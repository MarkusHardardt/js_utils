(function (root) {
    "use strict";
    const TaskManager = {};
    const isNodeJS = typeof require === 'function';
    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    const HANDLE_TASK_MANAGER_REQUEST = '/handle_task_manager_request';

    const Actions = Object.freeze({
        Start: 'start',
        Stop: 'stop'
    });

    if (isNodeJS) {
        class ServerManager {
            constructor(hmi) {
                this._hmi = hmi;
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

            Initialize(onSuccess, onError) {
                const hmi = this._hmi;
                hmi.cms.GetTaskObjects(response => {
                    const tasks = [];
                    const languages = hmi.cms.GetLanguages();
                    for (let entry of response) {
                        this._taskObjects[entry.path] = entry;
                        (function () {
                            const taskObject = entry;
                            tasks.push((onSuc, onErr) => {
                                hmi.cms.GetObject(taskObject.taskObject, languages[0], ContentManager.PARSE, task => {
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
                const that = this, hmi = this._hmi, taskObjects = this._taskObjects, tasks = [];
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
                }, this._hmi);
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
        TaskManager.getInstance = hmi => new ServerManager(hmi);
    }

    if (!isNodeJS) {
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
