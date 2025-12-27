(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;

    function idGenerator(prefix = '#') {
        let id = 0;
        return () => `${prefix}${(id++).toString(36)}`;
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
    const methodRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*$/i;
    const functionRegex = /^\s*function\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)/im;
    const lamdaRegex = /^\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*=>/im;
    const lamdaSingleArgRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*=>/im;
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
    function validateArguments(name, method, func, args, expectedArgs) {
        const foundArgs = getArguments(args);
        const missingArgs = [];
        handleNotFound(expectedArgs, foundArgs, undefined, notFound => missingArgs.push(notFound));
        if (missingArgs.length > 0) {
            throw new Error(`${name} method '${method}' has missing argument(s): [${missingArgs.join(',')}] in: '${func}'`);
        }
        const unexpectedArgs = [];
        handleNotFound(foundArgs, expectedArgs, undefined, notFound => unexpectedArgs.push(notFound));
        if (unexpectedArgs.length > 0) {
            throw new Error(`${name} method '${method}' has unexpected argument(s): [${unexpectedArgs.join(', ')}] in: '${func}'`);
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
                const methodMatch = methodRegex.exec(attr);
                if (methodMatch) {
                    const method = instance[methodMatch[1]];
                    if (typeof method !== 'function') {
                        throw new Error(`${name} has no method '${attr}'`);
                    }
                    if (checkMethodArguments === true) {
                        const expectedArgs = getArguments(methodMatch[2]);
                        const func = method.toString();
                        const funcMatch = functionRegex.exec(func);
                        if (funcMatch) {
                            validateArguments(name, attr, funcMatch[0], funcMatch[1], expectedArgs);
                        }
                        const lambdaMatch = lamdaRegex.exec(func);
                        if (lambdaMatch) {
                            validateArguments(name, attr, lambdaMatch[0], lambdaMatch[1], expectedArgs);
                        }
                        const lambdaSingleArgMatch = lamdaSingleArgRegex.exec(func);
                        if (lambdaSingleArgMatch) {
                            validateArguments(name, attr, lambdaSingleArgMatch[0], lambdaSingleArgMatch[1], expectedArgs);
                        }
                    }
                    continue;
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

    const testAttributes = [
        'Foo()',
        'Baz(a)',
        'Bar(b,c)',
        'State:boolean',
        'Answer:number',
        'Text:string'
    ];

    validateInterface('Object1', {
        Foo: function () { },
        Baz: function (a) { },
        Bar: function (b, c) { },
        State: true,
        Answer: 42,
        Text: 'Hello world'
    }, testAttributes);
    validateInterface('Object2', {
        Foo: () => { },
        Baz: a => { },
        Bar: (b, c) => { },
        State: true,
        Answer: 42,
        Text: 'Hello world'
    }, testAttributes);

    const Common = {
        idGenerator,
        handleNotFound
    };

    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
