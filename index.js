(function (root) {
    "use strict";

    var exp = {
        tasks: typeof module !== "undefined" && module.exports ? require('./src/tasks') : root.tasks,
        sorting: typeof module !== "undefined" && module.exports ? require('./src/sorting') : root.sorting,
        regex: typeof module !== "undefined" && module.exports ? require('./src/regex') : root.regex,
        math: typeof module !== "undefined" && module.exports ? require('./src/math') : root.math,
        utils: typeof module !== "undefined" && module.exports ? require('./src/utils') : root.utils
    };

    Object.seal(exp);

    // export
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exp;
    } else {
        root.utils = exp;
    }
}(globalThis));
