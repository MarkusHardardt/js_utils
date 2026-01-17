(function (root) {
    "use strict";
    const TaskManager = {};
    const isNodeJS = typeof require === 'function';

    // TODO: Add content
    TaskManager.content = {};

    /*  */
    (function () {
        TaskManager.closureContent = {};
    }());


    Object.freeze(TaskManager);
    if (isNodeJS) {
        module.exports = TaskManager;
    } else {
        root.TaskManager = TaskManager;
    }
}(globalThis));
