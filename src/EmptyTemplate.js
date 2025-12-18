(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const exp = {};

    if (isNodeJS) {
        module.exports = exp;
    } else {
        root.EmptyTemplate = exp;
    }
}(globalThis));
