(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Connection = function (socket, onError) {
        this._socket = socket;
        this._consumers = {};
        this._callbacks = {};
        let unique_id = 0;
        this._nextID = () => `#${(unique_id++).toString(36)}`;
        if (typeof onError === 'function') {
            this._onError = onError;
        }
    };

    Connection.prototype = Object.create(Object.prototype);
    Connection.prototype.constructor = Connection;

    Connection.prototype.send = function (name, data, callback) {
        let request = { cn: name, dt: data };
        if (typeof callback === 'function') {
            this._callbacks[request.cb = this._nextID()] = callback;
        }
        this._socket.send(JSON.stringify(request));
    };

    Connection.prototype.register = function (name, method) {
        if (typeof name !== 'string') {
            throw new Exception('Connection.register(name, method): name must be a string!');
        }
        else if (typeof method !== 'function') {
            throw new Exception('Connection.register(name, method): method must be a function!');
        }
        else if (this._consumers[name]) {
            throw new Exception(`Connection.register(name, method): method with name "${name}" already registered!`);
        }
        else {
            this._consumers[name] = method;
        }
    };

    Connection.prototype.unregister = function (name) {
        if (typeof name !== 'string') {
            throw new Exception('Connection.unregister(name): name must be a string!');
        }
        else if (this._consumers[name] === undefined) {
            throw new Exception(`Connection.unregister(name): consumer with name "${name}" not registered!`);
        }
        else {
            delete this._consumers[name];
        }
    };

    Connection.prototype._consume = function (request) {
        let that = this;
        if (request.er !== undefined) {
            if (this._onError) {
                this._onError(request.er);
            }
            else {
                console.error(`Received error: ${request.er}`);
            }
        }
        else if (request.cn !== undefined) {
            let method = this._consumers[request.cn];
            if (method) {
                if (request.cb !== undefined) {
                    try {
                        method(request.dt, function (response) {
                            that._socket.send(JSON.stringify({ cb: request.cb, dt: response }));
                        }, function (error) {
                            that._socket.send(JSON.stringify({ cb: request.cb, er: error ? error : true }));
                        });
                    } catch (error) {
                        that._socket.send(JSON.stringify({ cb: request.cb, er: `error calling consumer ${request.cn}: ${error}` }));
                    }
                }
                else {
                    try {
                        method(request.dt);
                    } catch (error) {
                        that._socket.send(JSON.stringify({ er: `error calling consumer ${request.cn}: ${error}` }));
                    }
                }
            }
            else {
                that._socket.send(JSON.stringify({ er: `unknown consumer: ${request.cn}` }));
            }
        }
        else if (request.cb !== undefined) {
            let callback = this._callbacks[request.cb];
            if (callback) {
                delete this._callbacks[request.cb];
                try {
                    callback(request.dt);
                }
                catch (error) {
                    that._socket.send(JSON.stringify({ er: `error calling callback: ${error}` }));
                }
            }
        }
    };

    if (isNodeJS) {
        function WebSocketServer(port, onOpen, onClose, onError) {
            let WebSocket = require('ws');
            this._socket = new WebSocket.Server({
                port: port
            });
            this._socket.on('connection', function (socket) {
                const connection = new Connection(socket, onError);
                socket.on('message', function (buffer) {
                    connection._consume(JSON.parse(buffer.toString('utf8')));
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
                connection._consume(JSON.parse(message.data));
            };
            return connection;
        }
        root.getWebSocketConnection = getWebSocketConnection;
    }
}(globalThis));