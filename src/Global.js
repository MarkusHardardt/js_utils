(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Global = {};

    Object.freeze(Global);
    if (isNodeJS) {
        module.exports = Global;
    } else {
        root.Global = Global;
    }
}(globalThis));
