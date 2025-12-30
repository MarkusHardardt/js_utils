(function () {
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./src/Executor.js') : undefined;
    const Core = isNodeJS ? require('./src/Core.js') : undefined;
    const Helper = isNodeJS ? require('./env/Helper.js') : undefined;

    function generate(options) {
        const tasks = [];
        let dependencies, topologicalSortedComponents, index_js;
        // load dependencies as tree object
        tasks.push((onSuccess, onError) => {
            Helper.loadDependencies(options.directory, options.ignorables, result => {
                dependencies = result;
                onSuccess();
            }, onError)
        });
        tasks.push((onSuccess, onError) => {
            try {
                topologicalSortedComponents = Core.getTopologicalSorting(dependencies);
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        tasks.push((onSuccess, onError) => {
            index = Helper.generateIndexJs(options.name, options.scope, topologicalSortedComponents, options.browserIgnorables);
            console.log(index);
        });
        tasks.push((onSuccess, onError) => {

        });
        tasks.push((onSuccess, onError) => {

        });
        tasks.push((onSuccess, onError) => {

        });
        tasks.push((onSuccess, onError) => {

        });
        tasks.push((onSuccess, onError) => {

        });
        tasks.push((onSuccess, onError) => {

        });

        Executor.run(tasks, () => console.log('server started successfully'), error => console.error(error));

        //require('./src/Core.js').analyseLibrary('./src', '../js_utils_dependencies.js', './js_utils.js');
    }

    generate({
        name: 'js_utils',
        scope: '@markus.hardardt/',
        directory: './src',
        ignorables: ['EmptyTemplate'],
        browserIgnorables: ['Server', 'WebServer', 'EmptyTemplate']
    });


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
