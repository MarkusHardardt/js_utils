(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

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

    WebSocketBaseBroker.prototype.invokeService = function (i_name, i_data, i_callback) {
        let object = { name: i_name, data: i_data };
        if (typeof i_callback === 'function') {
            let id = object.id = '#' + (this._unique_id_value++);
            this._callbacks[id] = i_callback;
        }
        this.transmit(JSON.stringify(object));
    };

    WebSocketBaseBroker.prototype.transmit = function (i_string) {
        throw new Exception('WebSocketBaseBroker.transmit(string) not implemented in base class!');
    };

    WebSocketBaseBroker.prototype.received = function (i_request) {
        let that = this, request = JSON.parse(i_request);
        if (typeof request.name === 'string') {
            let service = this._services[request.name];
            if (service) {
                try {
                    if (request.id) {
                        service(request.data, function (i_response) {
                            that.transmit(JSON.stringify({
                                id: request.id,
                                data: i_response
                            }));
                        }, function (i_exception) {
                            that.transmit(JSON.stringify({
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
                    that.transmit(JSON.stringify({
                        id: request.id,
                        error: 'Exception: ' + exc
                    }));
                }
            }
            else {
                that.transmit(JSON.stringify({
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

    const WebSocketServerBroker = function (i_port) {
        WebSocketBaseBroker.call(this);
        let that = this;
        let WebSocket = require('ws');
        this._socket = new WebSocket.Server({
            port: i_port
        });
        this._socket.on('connection', function connection(i_socket) {
            i_socket.on('message', function (i_buffer) {
                that.received(i_buffer.toString('utf8'));
            });
            i_socket.on('close', function () {
                // TODO: Handle close
                console.log('Client beendet Verbindung');
            });
        });
    };

    WebSocketServerBroker.prototype = Object.create(WebSocketBaseBroker.prototype);
    WebSocketServerBroker.prototype.constructor = WebSocketServerBroker;

    WebSocketServerBroker.prototype.transmit = function (i_string) {
        throw new Exception('TODO: Implement WebSocketServerBroker.transmit(string)');
    };

    const WebSocketClientBroker = function (i_port) {
        WebSocketBaseBroker.call(this);
        let url = `ws://${document.location.hostname}:${i_port}`;
        this._socket = new WebSocket(url);
        let that = this;
        this._socket.onopen = function (i_event) {
            // TODO: Handle open
            console.log('opened, now send message');
        };
        this._socket.onmessage = function (i_buffer) {
            that.received(i_buffer.toString('utf8'));
            // TODO: Remove debug stuff
            return;
            console.log("==>MESSAGE: " + i_message.data);
            let object = JSON.parse(i_message.data);
            let callback = that._callbacks[object.message_id];
            if (callback) {
                delete that._callbacks[object.message_id];
                try {
                    callback(object.response);
                }
                catch (exc) {
                    console.error(exc);
                }
            }
        };
        this._socket.onclose = function (i_event) {
            console.log("==>CLOSED");
        };
        this._socket.onError = function (i_event) {
            console.error("ERROR");
        };
    };

    WebSocketClientBroker.prototype = Object.create(WebSocketBaseBroker.prototype);
    WebSocketClientBroker.prototype.constructor = WebSocketClientBroker;

    WebSocketClientBroker.prototype.transmit = function (i_string) {
        // throw new Exception('TODO: Implement WebSocketClientBroker.transmit(string)');
        this._socket.send(i_string);
    };

    if (isNodeJS) {
        module.exports = WebSocketServerBroker;
    } else {
        root.WebSocketClientBroker = WebSocketClientBroker;
    }
}(globalThis));
