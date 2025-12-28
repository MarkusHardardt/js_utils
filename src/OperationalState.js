(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class OperationalState {
        constructor() {
            Global.validateOperationalStateInterface(this, true);
        }
    }

    if (isNodeJS) {
        module.exports = OperationalState;
    } else {
        root.OperationalState = OperationalState;
    }
}(globalThis));
