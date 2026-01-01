(function () {
    const isNodeJS = typeof require === 'function';
    const fs = isNodeJS ? require('fs') : undefined;
    const Executor = isNodeJS ? require('./src/Executor.js') : undefined;
    const Core = isNodeJS ? require('./src/Core.js') : undefined;
    const Helper = isNodeJS ? require('./env/Helper.js') : undefined;

    function generate(options) {
        const tasks = [];
        let dependencies, topologicalSortedComponents;
        // load dependencies as tree object
        tasks.push((onSuccess, onError) => {
            Helper.loadDependencies(options.directory, options.ignorables, result => {
                dependencies = result;
                console.log(Helper.formatDependencies(dependencies));
                onSuccess();
            }, onError)
        });
        // get topological sorted components
        tasks.push((onSuccess, onError) => {
            try {
                topologicalSortedComponents = Core.getTopologicalSorting(dependencies);
                console.log(Helper.formatTopologicalSortedComponents(topologicalSortedComponents));
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        // 
        tasks.push((onSuccess, onError) => {
            try {
                const indexJs = Helper.generateIndexJs(options.name, options.scope, topologicalSortedComponents, options.browserIgnorables, options.ext);
                console.log(indexJs);
                if (options.index_js_outputFile) {
                    fs.writeFileSync(options.index_js_outputFile, indexJs, 'utf8');
                    console.log(`==> EXPORTED: ${options.index_js_outputFile}`);
                }
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        tasks.push((onSuccess, onError) => {
            console.log(Helper.generateInternalImports(dependencies, topologicalSortedComponents))
            onSuccess();

        });
        tasks.push((onSuccess, onError) => {
            console.log(Helper.generateExternalImports(options.scope, topologicalSortedComponents, options.ext));
            onSuccess();

        });
        Executor.run(tasks, () => console.log('done'), error => console.error(error));
    }

    generate({
        name: 'js_utils',
        scope: '@markus.hardardt/',
        directory: './src',
        ignorables: ['EmptyTemplate', 'hmi_object'],
        browserIgnorables: ['Server', 'WebServer', 'SqlHelper', 'EmptyTemplate'],
        ext: ['ext/md5.js'],
        index_js_outputFile: './js_utils.js'
    });


    // Edited manually 2025-12-27
    const js_utils_dependencies = {
        'Client': [],
        'Common': ['Core'],
        'ContentManager': ['Utilities', 'JsonFX', 'Regex', 'Executor', 'Sorting', 'SqlHelper'],
        'Core': ['Regex', 'Executor'],
        'DataConnector': ['Global', 'Core', 'Sorting', 'Regex'],
        'DataPublisher': ['Global'],
        'Executor': [],
        'Global': ['Core'],
        'HashLists': ['Utilities'],
        'hmi_object': ['Regex', 'Core', 'Executor', 'math', 'ObjectPositionSystem', 'Sorting'],
        'JsonFX': [],
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
