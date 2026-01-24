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
            const cms = this._hmi.cms;
            cms.GetTaskObjects(response => {
                const tasks = [];
                const languages = cms.GetLanguages();
                for (let entry of response) {
                    this._taskObjects[entry.path] = entry;
                    (function () {
                        const taskObject = entry;
                        tasks.push((onSuc, onErr) => {
                            cms.GetObject(taskObject.taskObject, languages[0], ContentManager.PARSE, task => {
                                taskObject.task = task;
                                onSuc();
                            }, onErr);
                        });
                    }());
                }
                Executor.run(tasks, () => {
                    for (const path in this._taskObjects) {
                        if (this._taskObjects.hasOwnProperty(path)) {
                            const taskObject = this._taskObjects[path];
                            if ((taskObject.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0) {
                                ObjectLifecycleManager.create(taskObject.task, null, () => {
                                    console.log(`task '${taskObject.taskObject} started`);
                                }, error => console.error(`Failed starting task '${taskObject.taskObject}: ${error}`), this._hmi);
                            }
                        }
                    }
                    onSuccess();
                }, onError);
            }, onError);
        }
    }
    TaskManager.Instance = Manager;

    Object.freeze(TaskManager);
    if (isNodeJS) {
        module.exports = TaskManager;
    } else {
        root.TaskManager = TaskManager;
    }
}(globalThis));
