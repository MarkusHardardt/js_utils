(function (root) {
    "use strict";
    const Common = {};

    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    (function () {
        const js_utils_dependencies = {
            'Client': [],
            'Common': ['Regex', 'Executor'],
            'ContentManager': ['Utilities', 'jsonfx', 'Regex', 'Executor', 'Sorting', 'SqlHelper'],
            'Core': [],
            'DataConnector': ['Common', 'Sorting', 'Regex', 'EventPublisher', 'WebSocketConnection'],
            'EventPublisher': ['Common'],
            'Executor': [],
            'Global': ['Core'],
            'HashLists': ['Utilities'],
            'hmi_object': ['Regex', 'Executor', 'math', 'ObjectPositionSystem', 'Sorting'],
            'jsonfx': [],
            'math': [],
            'ObjectPositionSystem': [],
            'Regex': [],
            'Server': [],
            'Sorting': ['Utilities'],
            'SqlHelper': ['Executor'],
            'TargetSystemAdapter': ['EventPublisher'],
            'Utilities': ['Common'],
            'WebServer': [],
            'WebSocketConnection': ['Common', 'Server'],
        };
    }());

    const dumpLibraryFileAccess = true; // TODO: Set true if topological sorting must be dumped to console
    if (dumpLibraryFileAccess) {
        // Get the topological sorting of the files contained in js_utils
        console.log(Core.getTopologicalSorting(js_utils_dependencies));
        console.log(Core.generateLibraryFileAccess(js_utils_dependencies));
    }

    Object.freeze(Common);
    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
