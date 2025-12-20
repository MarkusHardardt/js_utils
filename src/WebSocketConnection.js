(function (root) {
    "use strict";

    // TODO: Reuse or remove:
    /*  Telegrams send with the 'send' method are like:
        - { receiver, data } if no answer is expected
        - { receiver, data, callback } if an answer as argument of the callback is expected
    */
    const isNodeJS = typeof require === 'function';

    const Connection = function (socket, onError) {
        this._socket = socket;
        this._onError = typeof onError === 'function' ? onError : (error) => console.error(`error: ${error}`);
        this._receiversHandler = {};
        this._callbacks = {};
        let unique_id = 0;
        this._nextId = () => `#${(unique_id++).toString(36)}`;
    };

    Connection.prototype = Object.create(Object.prototype);
    Connection.prototype.constructor = Connection;

    Connection.prototype.ping = function (onResponse, onError) {
        let telegram = { ping: true };
        this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
        this._socket.send(JSON.stringify(telegram));
    };

    Connection.prototype._handlePing = function (callback) {
        this._socket.send(JSON.stringify({ pong: true, callback, now: Date.now() }));
    };

    Connection.prototype._handlePong = function (callback, now) {
        let cb = callback !== undefined ? this._callbacks[callback] : false;
        if (cb) {
            delete this._callbacks[callback];
            try {
                if (cb.onResponse) {
                    cb.onResponse(Date.now() - cb.request);
                }
            }
            catch (exception) {
                this._onError(`error calling callback: ${exception}`);
            }
        }
        else {
            this._onError('No pong callback found');
        }
    };

    Connection.prototype.register = function (receiver, handler) {
        if (typeof receiver !== 'string') {
            throw new Exception('Connection.register(receiver, handler): receiver must be a string!');
        }
        else if (typeof handler !== 'function') {
            throw new Exception('Connection.register(receiver, handler): handler must be a function!');
        }
        else if (this._receiversHandler[receiver]) {
            throw new Exception(`Connection.register(receiver, handler): handler "${receiver}" already registered!`);
        }
        else {
            this._receiversHandler[receiver] = handler;
        }
    };

    Connection.prototype.unregister = function (receiver) {
        if (typeof receiver !== 'string') {
            throw new Exception('Connection.unregister(receiver): receiver must be a string!');
        }
        else if (this._receiversHandler[receiver] === undefined) {
            throw new Exception(`Connection.unregister(receiver): "${receiver}" not registered!`);
        }
        else {
            delete this._receiversHandler[receiver];
        }
    };

    Connection.prototype.send = function (receiver, data, onResponse, onError) {
        let telegram = { receiver, data };
        if (typeof onResponse === 'function' || typeof onError === 'function') {
            this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
        }
        this._socket.send(JSON.stringify(telegram));
    };

    Connection.prototype._handleRequest = function (receiver, data, callback) {
        let that = this, handler = this._receiversHandler[receiver];
        if (handler) {
            if (callback !== undefined) {
                try {
                    handler(data, function onSuccess(data) {
                        that._socket.send(JSON.stringify({ callback, data }));
                    }, function onError(error) {
                        that._socket.send(JSON.stringify({ callback, error: error ? error : true }));
                    });
                } catch (exception) {
                    this._socket.send(JSON.stringify({ callback, error: `error calling receivers ${receiver} handler: ${exception}` }));
                }
            }
            else {
                try {
                    handler(data);
                } catch (exception) {
                    this._socket.send(JSON.stringify({ error: `error calling receivers ${receiver} handler: ${exception}` }));
                }
            }
        }
        else {
            this._socket.send(JSON.stringify({ callback, error: `unknown receiver: ${receiver}` }));
        }
    };

    Connection.prototype._handleResponse = function (callback, data) {
        let cb = this._callbacks[callback];
        delete this._callbacks[callback];
        if (cb) {
            try {
                if (cb.onResponse) {
                    cb.onResponse(data, Date.now() - cb.request);
                }
            }
            catch (exception) {
                this._onError(`error calling callback: ${exception}`);
            }
        }
        else {
            this._onError('No pong callback found');
        }
    };

    Connection.prototype._handleError = function (error, callback) {
        let cb = callback !== undefined ? this._callbacks[callback] : false;
        if (cb) {
            delete this._callbacks[callback];
            if (cb.onError) {
                try {
                    cb.onError(error, Date.now() - cb.request);
                }
                catch (exception) {
                    this._onError(`error calling onError callback: ${exception}`);
                }
            }
            else {
                this._onError(error);
            }
        }
        else {
            this._onError(error);
        }
    };

    Connection.prototype._receive = function (telegram) {
        if (telegram.ping) {
            this._handlePing(telegram.callback);
        }
        else if (telegram.pong) {
            this._handlePong(telegram.callback, telegram.now);
        }
        else if (telegram.receiver !== undefined) {
            this._handleRequest(telegram.receiver, telegram.data, telegram.callback);
        }
        else if (telegram.error !== undefined) {
            this._handleError(telegram.error, telegram.callback);
        }
        else if (telegram.callback !== undefined) {
            this._handleResponse(telegram.callback, telegram.data);
        }
    };

    if (isNodeJS) {
        function WebSocketServer(port, onOpen, onClose, onError) {
            let WebSocket = require('ws');
            this._socket = new WebSocket.Server({ port });
            this._socket.on('connection', function (socket) {
                const connection = new Connection(socket, onError);
                socket.on('message', function (buffer) {
                    connection._receive(JSON.parse(buffer.toString('utf8')));
                });
                socket.on('close', function () {
                    if (typeof onClose === 'function') {
                        try {
                            onClose(connection);
                        } catch (error) {
                            console.error(`failed calling onClose: ${error}`);
                        }
                    }
                });
                socket.on('error', function (event) {
                    if (typeof onError === 'function') {
                        try {
                            onError(connection, event);
                        } catch (error) {
                            console.error(`failed calling onError: ${error}`);
                        }
                    }
                    else {
                        console.error('connection error');
                    }
                });
                if (typeof onOpen === 'function') {
                    try {
                        onOpen(connection);
                    } catch (error) {
                        console.error(`failed calling onOpen: ${error}`);
                    }
                }
            });
        }
        module.exports = WebSocketServer;
    } else {
        function getWebSocketConnection(port, onOpen, onClose, onSocketError, onConnectionError) {
            let socket = new WebSocket(`ws://${document.location.hostname}:${port}`);
            let connection = new Connection(socket, onConnectionError);
            socket.onopen = function (event) {
                if (typeof onOpen === 'function') {
                    try {
                        onOpen(event);
                    } catch (error) {
                        console.error(`failed calling onOpen: ${error}`);
                    }
                }
                else {
                    console.log('opened connection');
                }
            };
            socket.onclose = function (event) {
                if (typeof onClose === 'function') {
                    try {
                        onClose(event);
                    } catch (error) {
                        console.error(`failed calling onClose: ${error}`);
                    }
                }
                else {
                    console.log('closed connection');
                }
            };
            socket.onError = function (event) {
                if (typeof onSocketError === 'function') {
                    try {
                        onSocketError(event);
                    } catch (error) {
                        console.error(`failed calling onError: ${error}`);
                    }
                }
                else {
                    console.error('connection error');
                }
            };
            socket.onmessage = function (message) {
                connection._receive(JSON.parse(message.data));
            };
            return connection;
        }
        root.getWebSocketConnection = getWebSocketConnection;
    }
}(globalThis));