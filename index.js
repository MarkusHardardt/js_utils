(function (root) {
    "use strict";

    var exp = {
        tasks: typeof module !== "undefined" && module.exports ? require('./src/tasks') : root.tasks
    };

    Object.seal(exp);

    // export
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exp;
    } else {
        root.utils = exp;
    }
}(globalThis));
