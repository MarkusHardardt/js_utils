(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    const showTopologicalSorting = true; // TODO: Set true if topological sorting must be dumped to console
    if (showTopologicalSorting) {
        // Get the topological sorting of the files contained in js_utils
        const topo = Core.getTopologicalSorting({
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
        });
        console.log(`Topological sorting of the files contained in js_utils:\nconst jsUtilsTopologicalSorting = ${JSON.stringify(topo, undefined, 2)};`);
    }


    function handleNotFound(sources, targets, equal, onNotFound, backward) {
        let sidx, slen = sources.length, tidx, tlen = targets.length;
        for (sidx = 0; sidx < slen; sidx++) {
            let source = backward === true ? sources[slen - 1 - sidx] : sources[sidx];
            let found = false;
            for (tidx = 0; tidx < tlen; tidx++) {
                let target = targets[tidx];
                if (typeof equal === 'function' ? equal(source, target) : source === target) {
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

    // This is a pattern matching valid javascript names: [_$a-z][_$a-z0-9]*
    const attributeMethodRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*$/i;
    const functionRegex = /^\s*function\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)/im;
    const lamdaRegex = /^\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*=>/im;
    const lamdaSingleArgRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*=>/im;
    const classMethodRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)/i;
    const argumentRegex = /(?:\s*,\s*)?([_$a-z][_$a-z0-9]*)\s*/gi;
    function getArguments(args) {
        const a = [];
        if (args) {
            Regex.each(argumentRegex, args, (start, end, match) => {
                a.push(match[1]);
            }, true);
        }
        return a;
    }
    function validateArguments(name, method, args, expectedArgs) {
        const foundArgs = getArguments(args);
        if (expectedArgs.length !== foundArgs.length) {
            throw new Error(`${name} method '${method}' expects ${expectedArgs.length} arguments but instance has ${foundArgs.length}: expected: [${expectedArgs.join(',')}], found: [${foundArgs.join(',')}]`);
        }
        for (let i = 0; i < expectedArgs.length; i++) {
            if (expectedArgs[i] !== foundArgs[i]) {
                throw new Error(`${name} method '${method}' expects as argument ${(i + 1)} '${expectedArgs[i]}' but instance has '${foundArgs[i]}': expected: [${expectedArgs.join(',')}], found: [${foundArgs.join(',')}]`);
            }
        }
    }
    const propertyRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*:\s*([_a-z0-9]+)\s*/i;
    function validateInterface(name, instance, attributes, checkMethodArguments) {
        if (instance === undefined) {
            throw new Error(`${name} is undefined!`);
        } if (instance === null) {
            throw new Error(`${name} is null`);
        } else if (typeof instance !== 'object') {
            throw new Error(`${name} is not an object`);
        } else if (Array.isArray(attributes)) {
            for (const attr of attributes) {
                const methodMatch = attributeMethodRegex.exec(attr);
                if (methodMatch) {
                    const method = instance[methodMatch[1]];
                    if (typeof method !== 'function') {
                        throw new Error(`${name} has no method '${attr}'`);
                    }
                    if (checkMethodArguments !== true) {
                        continue;
                    }
                    const expectedArgs = getArguments(methodMatch[2]);
                    const func = method.toString();
                    const funcMatch = functionRegex.exec(func);
                    if (funcMatch) {
                        validateArguments(name, attr, funcMatch[1], expectedArgs);
                        continue;
                    }
                    const lambdaMatch = lamdaRegex.exec(func);
                    if (lambdaMatch) {
                        validateArguments(name, attr, lambdaMatch[1], expectedArgs);
                        continue;
                    }
                    const lambdaSingleArgMatch = lamdaSingleArgRegex.exec(func);
                    if (lambdaSingleArgMatch) {
                        validateArguments(name, attr, lambdaSingleArgMatch[1], expectedArgs);
                        continue;
                    }
                    const classMatch = classMethodRegex.exec(func);
                    if (classMatch) {
                        validateArguments(name, attr, classMatch[2], expectedArgs);
                        continue;
                    }
                    throw new Error(`${name} instance has no method parameter: '${func}'`);
                }
                const propertyMatch = propertyRegex.exec(attr);
                if (propertyMatch) {
                    const prop = propertyMatch[1];
                    const type = propertyMatch[2];
                    const property = instance[prop];
                    if (property === undefined) {
                        throw new Error(`${name} has no property '${prop}' of type '${type}'`);
                    } else if (typeof property !== type) {
                        throw new Error(`${name} property '${prop}' has invalid type '${(typeof property)}' (expected: '${type})'`);
                    }
                    continue;
                }
                throw new Error(`Invalid method/property pattern: '${attr}'`);
            }
        }
    }

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

    const Common = {
        createIdGenerator,
        handleNotFound,
        validateInterface
    };

    Object.freeze(Common);

    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
