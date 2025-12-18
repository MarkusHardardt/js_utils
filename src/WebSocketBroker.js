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

    WebSocketBaseBroker.prototype.addService = function (i_name, i_service) {
        if (typeof i_name === 'string' && typeof i_service === 'function' && !this._services[i_name]) {
            this._services[i_name] = i_service;
            return true;
        }
        return false;
    };

    WebSocketBaseBroker.prototype.removeService = function (i_name) {
        if (typeof i_name === 'string' && this._services[i_name] !== undefined) {
            delete this._services[i_name];
            return true;
        }
        return false;
    };

    WebSocketBaseBroker.prototype.invokeService = function (i_name, i_data, i_callback) {
        let object = {
            name: i_name,
            data: i_data
        };
        if (typeof i_callback === 'function') {
            let id = '#' + (this._unique_id_value++);
            object.id = id;
            this._callbacks[id] = i_callback;
        }
        this.transmit(JSON.stringify(object));
    };

    WebSocketBaseBroker.prototype.transmit = function (i_string) {
        throw new Exception('Broker.transmit(string) not implemented in abstract class!');
    };

    WebSocketBaseBroker.prototype.received = function (i_string) {
        let that = this, object = JSON.parse(i_string);
        if (typeof object.name === 'string') {
            let service = this._services[object.name];
            if (service) {
                try {
                    if (object.id) {
                        service(object.data, function (i_data) {
                            that.transmit(JSON.stringify({
                                id: object.id,
                                data: i_data
                            }));
                        }, function (i_exception) {
                            that.transmit(JSON.stringify({
                                id: object.id,
                                error: i_exception ? i_exception : true
                            }));
                        });
                    }
                    else {
                        service(object.data);
                    }
                }
                catch (exc) {
                    that.transmit(JSON.stringify({
                        id: object.id,
                        error: 'Exception: ' + exc
                    }));
                }
            }
            else {
                that.transmit(JSON.stringify({
                    id: object.id,
                    error: 'unknown service: "' + object.name + '"'
                }));
            }
        }
        else if (object.id) {
            let callback = this._callbacks[object.id];
            if (callback) {
                delete this._callbacks[object.id];
                try {
                    callback(object.data);
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
            i_socket.on('message', function (i_string) {
                that.received(i_string);
            });
            i_socket.on('close', function () {
                console.log('Client beendet Verbindung');
            });
        });
    };

    WebSocketServerBroker.prototype = Object.create(WebSocketBaseBroker.prototype);
    WebSocketServerBroker.prototype.constructor = WebSocketServerBroker;

    WebSocketServerBroker.prototype.transmit = function (i_string) {
        throw new Exception('TODO: Implement ServerBroker.transmit(string)');
    };

    const WebSocketClientBroker = function (i_port) {
        WebSocketBaseBroker.call(this);
        let url = 'ws://localhost:' + i_port;
        this._socket = new WebSocket(url);
        this._socket.onopen = function (i_event) {
            console.log("opened, now send message");
            //this._socket.send("hello server");
            //console.log("send");
        };
        let that = this;
        this._socket.onmessage = function (i_string) {
            that.received(i_string);


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
        throw new Exception('TODO: Implement ClientBroker.transmit(string)');
    };

    if (isNodeJS) {
        module.exports = WebSocketServerBroker;
    } else {
        root.WebSocketClientBroker = WebSocketClientBroker;
    }
}(globalThis));
