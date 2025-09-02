(function (root) {
    "use strict";

    var exp = {
        task: typeof module !== "undefined" && module.exports ? require('./src/task').js : root.other
    };

    Object.seal(exp);

    // export
    if (typeof module !== "undefined" && module.exports) {
        module.exports = exp;
    } else {
        root.utils = exp;
    }
}(globalThis));
