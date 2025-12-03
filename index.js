(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    var exp = {
        jsonfx: isNodeJS ? require('./src/jsonfx') : root.jsonfx,
        SqlHelper: isNodeJS ? require('./src/SqlHelper') : root.SqlHelper,
        Executor: isNodeJS ? require('./src/Executor') : root.Executor,
        Sorting: isNodeJS ? require('./src/Sorting') : root.Sorting,
        Regex: isNodeJS ? require('./src/Regex') : root.Regex,
        math: isNodeJS ? require('./src/math') : root.math,
        HashLists: isNodeJS ? require('./src/HashLists') : root.HashLists,
        Utilities: isNodeJS ? require('./src/Utilities') : root.Utilities,
        WebServer: isNodeJS ? require('./src/WebServer') : root.WebServer
    };

    Object.seal(exp);

    // export
    if (isNodeJS) {
        module.exports = exp;
    } else {
        root.js_utils = exp;
    }
}(globalThis));
