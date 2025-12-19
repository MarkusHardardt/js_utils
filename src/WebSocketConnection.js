(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Connection = function (socket) {
        this._socket = socket;
        this._consumers = {};
        this._callbacks = {};
        let unique_id = 0;
        this._nextID = () => `#${(unique_id++).toString(36)}`;
    };

    Connection.prototype = Object.create(Object.prototype);
    Connection.prototype.constructor = Connection;

    Connection.prototype.send = function (consumer, data, callback) {
        let request = { name: consumer, data: data };
        if (typeof callback === 'function') {
            this._callbacks[request.id = this._nextID()] = callback;
        }
        this._socket.send(JSON.stringify(request));
    };

    Connection.prototype.register = function (name, consumer) {
        if (typeof name !== 'string') {
            throw new Exception('Connection.register(name, consumer): name must be a string!');
        }
        else if (typeof consumer !== 'function') {
            throw new Exception('Connection.register(name, consumer): consumer must be a function!');
        }
        else if (this._consumers[name]) {
            throw new Exception(`Connection.register(name, consumer): consumer with name "${name}" already registered!`);
        }
        else {
            this._consumers[name] = consumer;
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

    Connection.prototype._received = function (request) {
        let that = this;
        if (request.name !== undefined) {
            let consumer = this._consumers[request.name];
            if (consumer) {
                if (request.id !== undefined) {
                    try {
                        consumer(request.data, function (response) {
                            that._socket.send(JSON.stringify({ id: request.id, data: response }));
                        }, function (exception) {
                            that._socket.send(JSON.stringify({ id: request.id, error: exception ? exception : true }));
                        });
                    } catch (error) {
                        that._socket.send(JSON.stringify({ id: request.id, error: `error calling consumer: ${error}` }));
                    }
                }
                else {
                    try {
                        consumer(request.data);
                    } catch (error) {
                        that._socket.send(JSON.stringify({ id: request.id, error: `error calling consumer: ${error}` }));
                    }
                }
            }
            else {
                that._socket.send(JSON.stringify({ id: request.id, error: `unknown consumer: ${request.name}` }));
            }
        }
        else if (request.id !== undefined) {
            let callback = this._callbacks[request.id];
            if (callback) {
                delete this._callbacks[request.id];
                try {
                    callback(request.data);
                }
                catch (error) {
                    that._socket.send(JSON.stringify({ id: request.id, error: `error calling callback: ${error}` }));
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
                const connection = new Connection(socket);
                socket.on('message', function (buffer) {
                    connection._received(JSON.parse(buffer.toString('utf8')));
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
            let connection = new Connection(socket);
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
                connection._received(JSON.parse(message.data));
            };
            return connection;
        }
        root.getWebSocketConnection = getWebSocketConnection;
    }
}(globalThis));