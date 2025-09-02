(function (root) {
    "use strict";

    var exp = {
        tasks: typeof module !== "undefined" && module.exports ? require('./src/tasks') : root.tasks,
        sorting: typeof module !== "undefined" && module.exports ? require('./src/sorting') : root.sorting,
        regex: typeof module !== "undefined" && module.exports ? require('./src/regex') : root.regex,
        math: typeof module !== "undefined" && module.exports ? require('./src/math') : root.math,
        utilities: typeof module !== "undefined" && module.exports ? require('./src/utilities') : root.utilities
    };

    Object.seal(exp);

    // export
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exp;
    } else {
        root.utils = exp;
    }
}(globalThis));
