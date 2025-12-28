(function (root) {
    "use strict";
    const Core = {};

    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;

    /*  Returns a function witch on each call returns a number (radix 36, starting at zero). */
    function createIdGenerator(prefix = '') {
        let id = 0;
        return () => `${prefix}${(id++).toString(36)}`;
    }
    Core.createIdGenerator = createIdGenerator;

    Core.defaultEqual = (v1, v2) => v1 === v2;

    Core.defaultOnError = error => console.error(error);

    /*  Kahn's algorithm  */
    function getTopologicalSorting(dependencies) {
        const graph = new Map();
        const inDegree = new Map();
        const queue = [];
        const result = [];
        for (const node in dependencies) {
            if (!inDegree.has(node))
                inDegree.set(node, 0);
            for (const dep of dependencies[node]) {
                graph.set(dep, (graph.get(dep) || []).concat(node));
                inDegree.set(node, (inDegree.get(node) || 0) + 1);
            }
        }
        for (const [node, degree] of inDegree.entries()) {
            if (degree === 0) queue.push(node);
        }
        while (queue.length > 0) {
            const node = queue.shift();
            result.push(node);
            for (const neighbor of graph.get(node) || []) {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }
        if (result.length !== inDegree.size) {
            throw new Error("Cyclical dependency detected!");
        }
        return result;
    }
    Core.getTopologicalSorting = getTopologicalSorting;

    /*  Helps writing new moduls*/
    function generateLibraryFileAccess(dependencies) {
        const components = getTopologicalSorting(dependencies);
        let txt = ``;
        // Code usable js_utils internal
        txt += `    // ### inside js_utils ###\n\n`;
        for (const file in dependencies) {
            if (dependencies.hasOwnProperty(file)) {
                txt += `    // ==> file: '${file}.js':\n`;
                txt += `    // access to other components in node js and browser:\n`;
                txt += `    const isNodeJS = typeof require === 'function';\n`;
                const used = dependencies[file];
                for (let comp of components) {
                    if (used.indexOf(comp) >= 0) {
                        txt += `    const ${comp} = isNodeJS ? require('./${comp}.js') : root.${comp};\n`;
                    }
                }
                txt += `\n`;
            }
        }
        txt += `\n`;
        // Code for js_utils.js
        txt += `    // ### js_utils.js ###\n\n`;
        txt += `    // access to other components in node js and browser:\n`;
        txt += `    const isNodeJS = typeof require === 'function';\n`;
        for (let comp of components) {
            txt += `    const ${comp} = isNodeJS ? require('./src/${comp}.js') : root.${comp};\n`;
        }
        txt += `\n`;
        txt += `    const js_utils = {\n`;
        for (let i = 0; i < components.length; i++) {
            if (i > 0) {
                txt += `,\n`;
            }
            txt += `        ${components[i]}`;
        }
        txt += `\n    };\n\n`;
        txt += `    // access js_utils components on node js:\n`;
        for (let comp of components) {
            txt += `    const ${comp} = require('@markus.hardardt/js_utils/src/${comp}.js');\n`;
        }
        txt += `\n`;
        txt += `    // js_utils files for browser provided by webserver:\n`;
        for (let comp of components) {
            txt += `    webServer.AddStaticFile('./node_modules/@markus.hardardt/js_utils/src/${comp}.js');\n`;
        }
        return txt;
    }
    Core.generateLibraryFileAccess = generateLibraryFileAccess;

    /*  Callack for all elements in the sources-array not found in the targets-array */
    function handleNotFound(sources, targets, equal, onNotFound, backward) {
        let sidx, slen = sources.length, tidx, tlen = targets.length;
        for (sidx = 0; sidx < slen; sidx++) {
            let source = backward === true ? sources[slen - 1 - sidx] : sources[sidx];
            let found = false;
            for (tidx = 0; tidx < tlen; tidx++) {
                if (typeof equal === 'function' ? equal(source, targets[tidx]) : source === targets[tidx]) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                try { // TODO: Do we need try/catch here?
                    onNotFound(source);
                }
                catch (error) {
                    console.error(`Failed calling onNotFound(source): ${error}`);
                }
            }
        }
    }
    Core.handleNotFound = handleNotFound;

    /*  Interface validation */
    (function () {
        // This is a pattern matching valid javascript names: [_$a-zA-Z][_$a-zA-Z0-9]*
        const attributeMethodRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*$/;
        const attributePropertyRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*:\s*([_a-zA-Z0-9]+)\s*$/;
        const standardFunctionRegex = /^\s*function\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)/m;
        const lamdaFunctionRegex = /^\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*=>/m;
        const lamdaFunctionSingleArgumentRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*=>/m;
        const classMethodRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)/m;
        const argumentRegex = /(?:\s*,\s*)?([_$a-zA-Z][_$a-zA-Z0-9]*)\s*/mg;
        function getArguments(argumentsSource) {
            const a = [];
            if (argumentsSource) {
                Regex.each(argumentRegex, argumentsSource, (start, end, match) => {
                    a.push(match[1]);
                }, true);
            }
            return a;
        }
        function validateArguments(instanceType, functionName, actualArgumentsSource, expectedArguments) {
            const actualArguments = getArguments(actualArgumentsSource);
            if (expectedArguments.length !== actualArguments.length) {
                throw new Error(`${instanceType} method '${functionName}' expects ${expectedArguments.length} arguments but instance has ${actualArguments.length}: expected: [${expectedArguments.join(',')}], found: [${actualArguments.join(',')}]`);
            }
            for (let i = 0; i < expectedArguments.length; i++) {
                if (expectedArguments[i] !== actualArguments[i]) {
                    throw new Error(`${instanceType} method '${functionName}' expects as argument ${(i + 1)} '${expectedArguments[i]}' but instance has '${actualArguments[i]}': expected: [${expectedArguments.join(',')}], found: [${actualArguments.join(',')}]`);
                }
            }
        }
        function validateFunctionArguments(instanceType, functionName, functionSource, expectedArguments) {
            const standardFuncionMatch = standardFunctionRegex.exec(functionSource);
            if (standardFuncionMatch) {
                validateArguments(instanceType, functionName, standardFuncionMatch[1], expectedArguments);
                return;
            }
            const lamdaFunctionMatch = lamdaFunctionRegex.exec(functionSource);
            if (lamdaFunctionMatch) {
                validateArguments(instanceType, functionName, lamdaFunctionMatch[1], expectedArguments);
                return;
            }
            const lamdaFunctionSingleArgumentMatch = lamdaFunctionSingleArgumentRegex.exec(functionSource);
            if (lamdaFunctionSingleArgumentMatch) {
                validateArguments(instanceType, functionName, lamdaFunctionSingleArgumentMatch[1], expectedArguments);
                return;
            }
            const classMethodMatch = classMethodRegex.exec(functionSource);
            if (classMethodMatch) {
                validateArguments(instanceType, functionName, classMethodMatch[2], expectedArguments);
                return;
            }
            throw new Error(`${instanceType} instance function '${functionName}' has no arguments: '${functionSource}'`);
        }
        function validateInterface(instanceType, instance, expectedItems, validateMethodArguments) {
            if (instance === undefined) {
                throw new Error(`${instanceType} is undefined!`);
            } if (instance === null) {
                throw new Error(`${instanceType} is null`);
            } else if (typeof instance !== 'object') {
                throw new Error(`${instanceType} is not an object`);
            } else if (Array.isArray(expectedItems)) {
                for (const expectedItem of expectedItems) {
                    const methodMatch = attributeMethodRegex.exec(expectedItem);
                    if (methodMatch) {
                        const methodName = methodMatch[1];
                        const method = instance[methodName];
                        if (typeof method !== 'function') {
                            throw new Error(`${instanceType} has no method '${methodName}'`);
                        }
                        if (validateMethodArguments !== true) {
                            continue;
                        }
                        const expectedArguments = getArguments(methodMatch[2]); // string array mit argument namen
                        const methodSource = method.toString();
                        validateFunctionArguments(instanceType, methodName, methodSource, expectedArguments);
                        continue;
                    }
                    const propertyMatch = attributePropertyRegex.exec(expectedItem);
                    if (propertyMatch) {
                        const prop = propertyMatch[1];
                        const type = propertyMatch[2];
                        const property = instance[prop];
                        if (property === undefined) {
                            throw new Error(`${instanceType} has no property '${prop}' of type '${type}'`);
                        } else if (typeof property !== type) {
                            throw new Error(`${instanceType} property '${prop}' has invalid type '${(typeof property)}' (expected: '${type})'`);
                        }
                        continue;
                    }
                    throw new Error(`Invalid method/property pattern: '${expectedItem}'`);
                }
            }
        }
        Core.validateInterface = validateInterface;

        // Perform some tests
        const tasks = [];
        tasks.push((onSuccess, onError) => {
            try {
                const testAttributes = [
                    'Foo()',
                    'Baz(a)',
                    'Bar(b,c)',
                    'State:boolean',
                    'Answer:number',
                    'Text:string'
                ];
                validateInterface('Test1', {
                    Foo: function () { },
                    Baz: function (a) { },
                    Bar: function (b, c) { }, // b, c
                    State: true,
                    Answer: 42,
                    Text: 'Hello world'
                }, testAttributes, true);
                validateInterface('Test2', {
                    Foo: () => { },
                    Baz: a => { },
                    Bar: (b, c) => { },
                    State: true,
                    Answer: 42,
                    Text: 'Hello world'
                }, testAttributes, true);
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        tasks.push((onSuccess, onError) => {
            try {
                validateInterface('Test3', {
                    Foo: arg => { }
                }, [
                    'Foo(arg)'
                ], true);
                onSuccess();
            } catch (error) {
                onError(error);
            }
        });
        // TODO: Add tests for each check
        Executor.run(tasks, () => console.log('validateInterface() tested successfully'), error => {
            throw new Error(error);
        });
    }());

    Object.freeze(Core);
    if (isNodeJS) {
        module.exports = Core;
    } else {
        root.Core = Core;
    }
}(globalThis));