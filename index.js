const { js } = require('js-beautify');

(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    var exp = {
        jsonfx: isNodeJS ? require('./src/jsonfx') : root.jsonfx,
        sql_helper: isNodeJS ? require('./src/sql_helper') : root.sql_helper,
        tasks: isNodeJS ? require('./src/tasks') : root.tasks,
        sorting: isNodeJS ? require('./src/sorting') : root.sorting,
        regex: isNodeJS ? require('./src/regex') : root.regex,
        math: isNodeJS ? require('./src/math') : root.math,
        hashlists: isNodeJS ? require('./src/hashlists') : root.hashlists,
        utilities: isNodeJS ? require('./src/utilities') : root.utilities
    };

    Object.seal(exp);

    // export
    if (isNodeJS) {
        module.exports = exp;
    } else {
        root.utils = exp;
    }
}(globalThis));
