(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    if (!isNodeJS) {
        throw new Error('Server is not available on client');
    }

    const crypto = isNodeJS ? require('crypto') : undefined;
    const createHash =  (text, mode) => crypto.createHash(mode).update(text, 'utf8').digest('hex');

    const Server = {
        createHash,
        createSHA256: text => createHash(text, 'SHA-256'),
        createSHA384: text => createHash(text, 'SHA-384'),
        createSHA512: text => createHash(text, 'SHA-512')
    };

    Object.freeze(Server);

    if (isNodeJS) {
        module.exports = Server;
    }
}(globalThis));
