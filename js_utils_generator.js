import fs from 'node:fs';
import Executor from './src/Executor.js';
import Core from './src/Core.js';
import Helper from './env/Helper.js';

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
    ignorables: ['EmptyTemplate', 'hmi_object_DEPRECATED'],
    browserIgnorables: ['Server', 'WebServer', 'SqlHelper', 'OPCUA', 'EmptyTemplate'],
    ext: ['ext/md5.js'],
    index_js_outputFile: './js_utils.js'
});
