(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const crypto = isNodeJS ? require('crypto') : undefined;
    const createHash =  (text, mode) => crypto.createHash(mode).update(text, 'utf8').digest('hex');

    const Server = {
        createHash: (text, mode) => createHash(mode, text),
        createSHA256: text => createHash(text, 'SHA-256'),
        createSHA384: text => createHash(text, 'SHA-384'),
        createSHA512: text => createHash(text, 'SHA-512')
    };

    if (isNodeJS) {
        module.exports = Server;
    }
}(globalThis));
