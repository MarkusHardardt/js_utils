(function (root) {
    "use strict";

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
            this._callbacks[telegram.callback = this._nextId()] = { onResponse, onError };
        }
        this._socket.send(JSON.stringify(telegram));
    };

    /*  Telegrams send with the 'send' method are like:
        - { receiver, data } if no answer is expected
        - { receiver, data, callback } if an answer as argument of the callback is expected

    */
    Connection.prototype._receive = function (telegram) {
        let that = this;
        if (telegram.receiver !== undefined) {
            let handler = this._receiversHandler[telegram.receiver];
            if (handler) {
                if (telegram.callback !== undefined) {
                    try {
                        handler(telegram.data, function onSuccess(data) {
                            that._socket.send(JSON.stringify({ callback: telegram.callback, data }));
                        }, function onError(error) {
                            that._socket.send(JSON.stringify({ callback: telegram.callback, error: error ? error : true }));
                        });
                    } catch (error) {
                        that._socket.send(JSON.stringify({ callback: telegram.callback, error: `error calling receivers ${telegram.receiver} handler: ${error}` }));
                    }
                }
                else {
                    try {
                        handler(telegram.data);
                    } catch (error) {
                        that._socket.send(JSON.stringify({ error: `error calling receivers ${telegram.receiver} handler: ${error}` }));
                    }
                }
            }
            else {
                that._socket.send(JSON.stringify({ error: `unknown receiver: ${telegram.receiver}` }));
            }
        }
        else if (telegram.error !== undefined) {
            let callback = telegram.callback !== undefined ? this._callbacks[telegram.callback] : false;
            if (callback) {
                delete this._callbacks[telegram.callback];
                if (callback.onError) {
                    try {
                        callback.onError(telegram.error);
                    }
                    catch (error) {
                        this._onError(`error calling onError callback: ${error}`);
                    }
                }
                else {
                    this._onError(telegram.error);
                }
            }
            else {
                this._onError(telegram.error);
            }
        }
        else if (telegram.callback !== undefined) {
            let callback = this._callbacks[telegram.callback];
            delete this._callbacks[telegram.callback];
            try {
                if (callback.onResponse) {
                    callback.onResponse(telegram.data);
                }
            }
            catch (error) {
                this._onError(`error calling callback: ${error}`);
            }
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
        function getWebSocketConnection(port, onOpen, onClose, onError) {
            let socket = new WebSocket(`ws://${document.location.hostname}:${port}`);
            let connection = new Connection(socket, onError);
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
                if (typeof onError === 'function') {
                    try {
                        onError(event);
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