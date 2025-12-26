(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const idGenerator = () => {
        let id = 0;
        return () => `#${(id++).toString(36)}`;
    };

    const Common = {
        idGenerator
    };

    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
