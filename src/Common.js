(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const jsonfx = isNodeJS ? require('./jsonfx.js') : root.jsonfx;

    function idGenerator(prefix = '#') {
        let id = 0;
        return () => `${prefix}${(id++).toString(36)}`;
    }

    function validateInterface(name, instance, attributes) {
        if (instance === undefined) {
            throw new Error(`${name} is undefined!`);
        } if (instance === null) {
            throw new Error(`${name} is null`);
        } else if (typeof instance !== 'object') {
            throw new Error(`${name} is not an object`);
        } else if (Array.isArray(attributes)) {
            for (const attr in attributes) {
                const match = jsonfx.functionRegex.exec(attr);
                console.log(match);
                if (match) {

                }
            }
        } else if (typeof instance.Subscribe !== 'function') {
            throw new Error(`Invalid ${name}: Missing method Subscribe(id, onEvent)`);
        } else if (typeof instance.Unsubscribe !== 'function') {
            throw new Error(`Invalid ${name}: Missing method Unsubscribe(id, onEvent)`);
        } else if (typeof instance.Read !== 'function') {
            throw new Error(`Invalid ${name}: Missing method Read(id, onResponse, onError)`);
        } else if (typeof instance.Write !== 'function') {
            throw new Error(`Invalid ${name}: Missing method Write(id, value)`);
        }
    }

    validateInterface();

    const Common = {
        idGenerator
    };

    if (isNodeJS) {
        module.exports = Common;
    } else {
        root.Common = Common;
    }
}(globalThis));
