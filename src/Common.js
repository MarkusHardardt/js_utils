(function (root) {
    "use strict";
    const Common = {};

    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    if (isNodeJS) {
        (function () {
            const js_utils_dependencies = {
                'Client': [],
                'Common': ['Core'],
                'ContentManager': ['Utilities', 'jsonfx', 'Regex', 'Executor', 'Sorting', 'SqlHelper'],
                'Core': ['Regex', 'Executor'],
                'DataConnector': ['Global', 'Core', 'Sorting', 'Regex'],
                'EventPublisher': ['Global'],
                'Executor': [],
                'Global': ['Core'],
                'HashLists': ['Utilities'],
                'hmi_object': ['Regex', 'Core', 'Executor', 'math', 'ObjectPositionSystem', 'Sorting'],
                'jsonfx': [],
                'math': [],
                'ObjectPositionSystem': [],
                'Regex': [],
                'Server': [],
                'Sorting': [],
                'SqlHelper': ['Executor'],
                'TargetSystemAdapter': ['Global'],
                'Utilities': [],
                'WebServer': ['Server'],
                'WebSocketConnection': ['Core', 'Server'],
            };
            const dumpLibraryFileAccess = true; // TODO: Set true if topological sorting must be dumped to console
            if (dumpLibraryFileAccess) {
                // Get the topological sorting of the files contained in js_utils
                console.log(JSON.stringify(Core.getTopologicalSorting(js_utils_dependencies), undefined, 2));
                console.log(Core.generateLibraryFileAccess(js_utils_dependencies));
            }
        }());
    }

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
