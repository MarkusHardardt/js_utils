(function (root) {
    "use strict";
    const TaskManager = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    class Manager {
        constructor(hmi) {
            this._hmi = hmi;
            this._taskObjects = {};
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
            const hmi = this._hmi, taskObjects = this._taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if ((taskObject.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0) {
                            tasks.push((onSuc, onErr) => {
                                taskObject._active = true;
                                ObjectLifecycleManager.create(taskObject._task, null, () => {
                                    console.log(`task '${taskObject.taskObject} started`);
                                    onSuc();
                                }, error => {
                                    const err = `Failed starting task '${taskObject.taskObject}: ${error}`;
                                    console.error(err);
                                    onErr(err);
                                }, hmi);
                            });
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }

        Shutdown(onSuccess, onError) {
            const hmi = this._hmi, taskObjects = this._taskObjects, tasks = [];
            for (const path in taskObjects) {
                if (taskObjects.hasOwnProperty(path)) {
                    (function () {
                        const taskObject = taskObjects[path];
                        if (taskObject._active) {
                            tasks.push((onSuc, onErr) => {
                                taskObject._active = false;
                                // (i_object, i_success, i_error, onLifecycleStateChanged)
                                ObjectLifecycleManager.destroy(taskObject._task, () => {
                                    console.log(`task '${taskObject.taskObject} stopped`);
                                    onSuc();
                                }, error => {
                                    const err = `Failed stopping task '${taskObject.taskObject}: ${error}`;
                                    console.error(err);
                                    onErr(err);
                                });
                            });
                        }
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, onSuccess, onError);
        }
    }
    TaskManager.getInstance = hmi => new Manager(hmi);

    Object.freeze(TaskManager);
    if (isNodeJS) {
        module.exports = TaskManager;
    } else {
        root.TaskManager = TaskManager;
    }
}(globalThis));
