(function () {
    const Core = require('./src/Core.js');
    Core.analyseLibrary('./src', '../js_utils_dependencies.txt');

    // Edited manually 2025-12-27
    const js_utils_dependencies = {
        'Client': [],
        'Common': ['Core'],
        'ContentManager': ['Utilities', 'jsonfx', 'Regex', 'Executor', 'Sorting', 'SqlHelper'],
        'Core': ['Regex', 'Executor'],
        'DataConnector': ['Global', 'Core', 'Sorting', 'Regex'],
        'DataPublisher': ['Global'],
        'Executor': [],
        'Global': ['Core'],
        'HashLists': ['Utilities'],
        'hmi_object': ['Regex', 'Core', 'Executor', 'math', 'ObjectPositionSystem', 'Sorting'],
        'jsonfx': [],
        'math': [],
        'ObjectPositionSystem': [],
        'OperationalState': ['Global'],
        'Regex': [],
        'Server': [],
        'Sorting': [],
        'SqlHelper': ['Executor'],
        'TargetSystemAdapter': ['Global', 'OperationalState'],
        'Utilities': [],
        'WebServer': ['Server'],
        'WebSocketConnection': ['Global', 'Core', 'Server'],
    };

}());
