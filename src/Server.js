(function (root) {
    "use strict";
    const Server = {};

    const isNodeJS = typeof require === 'function';
    const crypto = isNodeJS ? require('crypto') : undefined;

    if (isNodeJS) {
        /*   hash generation */
        const createHash = function (text, mode) {
            return crypto.createHash(mode).update(text, 'utf8').digest('hex');
        };
        Server.createHash = createHash;
        Server.createSHA256 = function (text) {
            return createHash(text, 'SHA-256');
        };
        Server.createSHA384 = function (text) {
            return createHash(text, 'SHA-384');
        };
        Server.createSHA512 = function (text) {
            return createHash(text, 'SHA-512');
        };
        Object.freeze(Server);
        module.exports = Server;
    }
}(globalThis));
