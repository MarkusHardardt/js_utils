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
    function validateInterface(name, instance, attributes) {
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
                    console.log(`Check method: ${attr}`);
                    if (typeof method !== 'function') {
                        throw new Error(`${name} has no method ${attr}`);
                    }
                    const expectedArgs = getArguments(methodMatch[2]);
                    console.log(`- Expected arguments: ${JSON.stringify(expectedArgs)}`);
                    const func = method.toString();
                    console.log(`- Function code: ${func}`);
                    const funcMatch = functionRegex.exec(func);
                    if (funcMatch) {
                        console.log(`- Function match: ${funcMatch}`);
                        const foundArgs = getArguments(funcMatch[1]);
                        console.log(`- Found arguments: ${JSON.stringify(foundArgs)}`);
                        const missingArgs = [];
                        handleNotFound(expectedArgs, foundArgs, undefined, notFound => missingArgs.push(notFound));
                        console.log(`- Missing arguments: ${JSON.stringify(missingArgs)}`);
                        if (missingArgs.length > 0) {
                            throw new Error(`${name} method ${attr}: missing argument(s) ${missingArgs.join(', ')} in: ${funcMatch[0]}`);
                        }
                        const unexpectedArgs = [];
                        handleNotFound(foundArgs, expectedArgs, undefined, notFound => unexpectedArgs.push(notFound));
                        console.log(`- Unexpected arguments: ${JSON.stringify(unexpectedArgs)}`);
                        if (unexpectedArgs.length > 0) {
                            throw new Error(`${name} method ${attr}: unexpected argument(s) ${unexpectedArgs.join(', ')} in: ${funcMatch[0]}`);
                        }
                    }
                }
            }
        }
    }

    const testAttributes = [
        'Foo()',
        'Baz(a)',
        'Bar(b,c)'
    ];

    validateInterface('Object1', {
        Foo: function () { },
        Baz: function (a) { },
        Bar: function (b, c) { },
    }, testAttributes);
    validateInterface('Object2', {
        Foo: () => { },
        Baz: a => { },
        Bar: (b, c) => { },
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
