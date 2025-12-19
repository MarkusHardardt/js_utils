(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const BaseConnection = function (socket) {
        this._socket = socket;
        this._services = {};
        this._callbacks = {};
        let unique_id = 0;
        this._nextID = () => `#${(unique_id++).toString(36)}`;
    };

    BaseConnection.prototype = Object.create(Object.prototype);
    BaseConnection.prototype.constructor = BaseConnection;

    BaseConnection.prototype.send = function (service, data, callback) {
        let request = { name: service, data: data };
        if (typeof callback === 'function') {
            let id = request.id = this._nextID();
            this._callbacks[id] = callback;
        }
        this._socket.send(JSON.stringify(request));
    };

    BaseConnection.prototype.register = function (name, service) {
        if (typeof name !== 'string') {
            throw new Exception('BaseConnection.register(name, service): name must be a string!');
        }
        else if (typeof service !== 'function') {
            throw new Exception('BaseConnection.register(name, service): service must be a function!');
        }
        else if (this._services[name]) {
            throw new Exception('BaseConnection.register(name, service): service with name "' + name + '" already registered!');
        }
        else {
            this._services[name] = service;
        }
    };

    BaseConnection.prototype.unregister = function (name) {
        if (typeof name !== 'string') {
            throw new Exception('BaseConnection.unregister(name): name must be a string!');
        }
        else if (this._services[name] === undefined) {
            throw new Exception('BaseConnection.unregister(name): service with name "' + name + '" not registered!');
        }
        else {
            delete this._services[name];
        }
    };

    BaseConnection.prototype._received = function (raw) {
        let that = this, request = JSON.parse(raw);
        if (typeof request.name === 'string') {
            let service = this._services[request.name];
            if (service) {
                try {
                    if (request.id) {
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
        else if (request.id) {
            let callback = this._callbacks[request.id];
            if (callback) {
                delete this._callbacks[request.id];
                try {
                    callback(request.data);
                }
                catch (exc) {
                    console.error('EXCEPTION: ' + exc);
                }
            }
        }
    };

    const ClientConnection = function (port, id) {
        let url = `ws://${document.location.hostname}:${port}`;
        if (typeof id === 'string') {
            url += `?clientId=${id}`;
        }
        BaseConnection.call(this, new WebSocket(url));
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

    ClientConnection.prototype = Object.create(BaseConnection.prototype);
    ClientConnection.prototype.constructor = ClientConnection;


    // TODO: Reuse or remove
    const WebSocketBaseBroker = function () {
        this._unique_id_value = 0;
        this._services = {};
        this._callbacks = {};
    };

    WebSocketBaseBroker.prototype = Object.create(Object.prototype);
    WebSocketBaseBroker.prototype.constructor = WebSocketBaseBroker;

    WebSocketBaseBroker.prototype.registerService = function (i_name, i_service) {
        if (typeof i_name !== 'string') {
            throw new Exception('WebSocketBaseBroker.registerService(name, service): name must be a string!');
        }
        else if (typeof i_service !== 'function') {
            throw new Exception('WebSocketBaseBroker.registerService(name, service): service must be a function!');
        }
        else if (this._services[i_name]) {
            throw new Exception('WebSocketBaseBroker.registerService(name, service): service with name "' + i_name + '" already registered!');
        }
        else {
            this._services[i_name] = i_service;
        }
    };

    WebSocketBaseBroker.prototype.unregisterService = function (i_name) {
        if (typeof i_name !== 'string') {
            throw new Exception('WebSocketBaseBroker.unregisterService(name): name must be a string!');
        }
        else if (this._services[i_name] === undefined) {
            throw new Exception('WebSocketBaseBroker.unregisterService(name): service with name "' + i_name + '" not registered!');
        }
        else {
            delete this._services[i_name];
        }
    };

    WebSocketBaseBroker.prototype._received = function (i_socket, i_request) {
        let request = JSON.parse(i_request);
        if (typeof request.name === 'string') {
            let service = this._services[request.name];
            if (service) {
                try {
                    if (request.id) {
                        service(request.data, function (i_response) {
                            i_socket.send(JSON.stringify({
                                id: request.id,
                                data: i_response
                            }));
                        }, function (i_exception) {
                            i_socket.send(JSON.stringify({
                                id: request.id,
                                error: i_exception ? i_exception : true
                            }));
                        });
                    }
                    else {
                        service(request.data);
                    }
                }
                catch (exc) {
                    i_socket.send(JSON.stringify({
                        id: request.id,
                        error: 'Exception: ' + exc
                    }));
                }
            }
            else {
                i_socket.send(JSON.stringify({
                    id: request.id,
                    error: 'unknown service: "' + request.name + '"'
                }));
            }
        }
        else if (request.id) {
            let callback = this._callbacks[request.id];
            if (callback) {
                delete this._callbacks[request.id];
                try {
                    callback(request.data);
                }
                catch (exc) {
                    console.error('EXCEPTION: ' + exc);
                }
            }
        }
    };

    WebSocketBaseBroker.prototype.send = function (i_socket, i_name, i_data, i_callback) {
        let request = { name: i_name, data: i_data };
        if (typeof i_callback === 'function') {
            let id = request.id = '#' + (this._unique_id_value++);
            this._callbacks[id] = i_callback;
        }
        i_socket.send(JSON.stringify(request));
    };

    const clientIdRegex = /\bclientId=(.+)$/;

    const WebSocketServerBroker = function (i_port) {
        WebSocketBaseBroker.call(this);
        let that = this;
        let WebSocket = require('ws');
        this._socket = new WebSocket.Server({
            port: i_port
        });
        this._socket.on('connection', function connection(i_socket, i_request) {
            const match = clientIdRegex.exec(i_request.url);
            const id = match ? match[1] : undefined;
            //const url = new URL
            i_socket.on('message', function (i_buffer) {
                that._received(i_socket, i_buffer.toString('utf8'));
            });
            i_socket.on('close', function () {
                if (typeof that.connectionClosed === 'function') {
                    try {
                        that.connectionClosed(id);
                    } catch (exception) {
                        console.error('EXCEPTION: ' + exception);
                    }
                }
            });
            i_socket.on('error', function (i_error) {
                console.error('WebSocket-Fehler: ' + i_error);
            });
            if (typeof that.connectionOpened === 'function') {
                try {
                    that.connectionOpened(id, function (i_name, i_data, i_callback) {
                        that.send(i_socket, i_name, i_data, i_callback);
                    });
                } catch (exception) {
                    console.error('EXCEPTION: ' + exception);
                }
            }
        });
    };

    WebSocketServerBroker.prototype = Object.create(WebSocketBaseBroker.prototype);
    WebSocketServerBroker.prototype.constructor = WebSocketServerBroker;

    if (isNodeJS) {
        module.exports = WebSocketServerBroker;
    } else {
        root.WebSocketConnection = ClientConnection;
    }
}(globalThis));
