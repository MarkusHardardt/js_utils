(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;

    function idGenerator(prefix = '#') {
        let id = 0;
        return () => `${prefix}${(id++).toString(36)}`;
    }

    // This is a pattern matching valid javascript names: [_$a-z][_$a-z0-9]*
    const methodRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*$/i;
    const functionRegex = /^\s*function\s*\(\s*(?:[_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)/im;
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
                    console.log(`Check method: ${method}`);
                    if (typeof method !== 'function') {
                        throw new Error(`${name} has no method ${attr}`);
                    }
                    const args = getArguments(methodMatch[2]);
                    console.log(`- Expected arguments: ${args}`);
                    const func = method.toString();
                    console.log(`- Function code: ${func}`);
                    const funcMatch = functionRegex.exec(func);
                    console.log(`- Function match: ${funcMatch}`);
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
        idGenerator
    };

    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
