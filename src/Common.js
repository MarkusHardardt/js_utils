(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    function idGenerator(prefix = '#') {
        let id = 0;
        return () => `${prefix}${(id++).toString(36)}`;
    }

    // This is a pattern matching valid javascript names: [_$a-z][_$a-z0-9]*
    const methodRegex = /^\s*([_$a-z][_$a-z0-9]*)\s*\(\s*([_$a-z][_$a-z0-9]*(?:\s*,\s*[_$a-z][_$a-z0-9]*)*)?\s*\)\s*$/im;
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
                //console.log(methodMatch);
                if (methodMatch) {
                    const method = instance[methodMatch[1]];
                    if (typeof method !== 'function') {
                        throw new Error(`${name} has no method ${attr}`);
                    }
                }
            }
        }
    }

    validateInterface('TestObject', {
        Foo: function () {},
        Baz: function(a) {},
        Bar: function(b,c) {},
    }, [
        'Foo()',
        'Baz(a)',
        'Bar(b,c)'
    ]);

    const Common = {
        idGenerator
    };

    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
