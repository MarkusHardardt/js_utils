(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Connection = function (socket) {
        this._socket = socket;
        this._services = {};
        this._callbacks = {};
        let unique_id = 0;
        this._nextID = () => `#${(unique_id++).toString(36)}`;
    };

    Connection.prototype = Object.create(Object.prototype);
    Connection.prototype.constructor = Connection;

    Connection.prototype.send = function (service, data, callback) {
        let request = { name: service, data: data };
        if (typeof callback === 'function') {
            this._callbacks[request.id = this._nextID()] = callback;
        }
        this._socket.send(JSON.stringify(request));
    };

    Connection.prototype.register = function (name, service) {
        if (typeof name !== 'string') {
            throw new Exception('Connection.register(name, service): name must be a string!');
        }
        else if (typeof service !== 'function') {
            throw new Exception('Connection.register(name, service): service must be a function!');
        }
        else if (this._services[name]) {
            throw new Exception('Connection.register(name, service): service with name "' + name + '" already registered!');
        }
        else {
            this._services[name] = service;
        }
    };

    Connection.prototype.unregister = function (name) {
        if (typeof name !== 'string') {
            throw new Exception('Connection.unregister(name): name must be a string!');
        }
        else if (this._services[name] === undefined) {
            throw new Exception('Connection.unregister(name): service with name "' + name + '" not registered!');
        }
        else {
            delete this._services[name];
        }
    };

    Connection.prototype._received = function (raw) {
        let that = this, request = JSON.parse(raw);
        if (request.name !== undefined) {
            let service = this._services[request.name];
            if (service) {
                try {
                    if (request.id !== undefined) {
                        service(request.data, function (response) {
                            that._socket.send(JSON.stringify({ id: request.id, data: response }));
                        }, function (exception) {
                            that._socket.send(JSON.stringify({ id: request.id, error: exception ? exception : true }));
                        });
                    }
                    else {
                        service(request.data);
                    }
                }
                catch (exc) {
                    that._socket.send(JSON.stringify({ id: request.id, error: 'Exception: ' + exc }));
                }
            }
            else {
                that._socket.send(JSON.stringify({ id: request.id, error: 'unknown service: "' + request.name + '"' }));
            }
        }
        else if (request.id !== undefined) {
            let callback = this._callbacks[request.id];
            if (callback) {
                delete this._callbacks[request.id];
                try {
                    callback(request.data);
                }
                catch (exc) {
                    that._socket.send(JSON.stringify({ id: request.id, error: 'Exception: ' + exc }));
                }
            }
        }
    };

    const ClientConnection = function (port, id) {
        let url = `ws://${document.location.hostname}:${port}`;
        if (typeof id === 'string') {
            url += `?clientId=${id}`;
        }
        Connection.call(this, new WebSocket(url));
        let that = this;
        this._socket.onopen = function (event) {
            console.log('opened connection');
        };
        this._socket.onmessage = function (message) {
            that._received(message.data);
        };
        this._socket.onclose = function (event) {
            console.log("==>CLOSED");
        };
        this._socket.onError = function (event) {
            console.error("ERROR");
        };
    };

    ClientConnection.prototype = Object.create(Connection.prototype);
    ClientConnection.prototype.constructor = ClientConnection;

    const Server = function (port, opened, closed) {
        let WebSocket = require('ws');
        this._socket = new WebSocket.Server({
            port: port
        });
        this._socket.on('connection', function (socket, request) {
            const connection = new Connection(socket);
            const match = /\bclientId=(.+)$/.exec(request.url);
            const id = match ? match[1] : undefined;
            socket.on('message', function (buffer) {
                connection._received(buffer.toString('utf8'));
            });
            socket.on('close', function () {
                if (typeof closed === 'function') {
                    try {
                        closed(id, connection);
                    } catch (exception) {
                        console.error('EXCEPTION: ' + exception);
                    }
                }
            });
            socket.on('error', function (error) {
                console.error('WebSocket-Fehler: ' + error);
            });
            if (typeof opened === 'function') {
                try {
                    opened(id, connection);
                } catch (exception) {
                    console.error('EXCEPTION: ' + exception);
                }
            }
        });
    };

    if (isNodeJS) {
        module.exports = Server;
    } else {
        root.WebSocketConnection = ClientConnection;
    }
}(globalThis));