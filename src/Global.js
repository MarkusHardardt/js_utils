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

    const showTopologicalSorting = false; // TODO: Set true if topological sorting must be dumped to console
    if (showTopologicalSorting) {
        // Get the topological sorting of the files contained in js_utils
        const topo = getTopologicalSorting({
            'Core': [],
            'Client': [],
            'Common': ['Regex', 'Executor'],
            'ContentManager': ['Utilities', 'jsonfx', 'Regex', 'Executor', 'Sorting', 'SqlHelper'],
            'DataConnector': ['Common', 'Sorting', 'Regex', 'EventPublisher', 'WebSocketConnection'],
            'EventPublisher': ['Common'],
            'Executor': [],
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
        });
        console.log(`Topological sorting of the files contained in js_utils:\nconst jsUtilsTopologicalSorting = ${JSON.stringify(topo, undefined, 2)};`);
    }


}(globalThis));
