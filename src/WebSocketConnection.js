(function (root) {
    "use strict";

    // TODO: Reuse or remove:
    /*  Telegrams send with the 'send' method are like:
        - { receiver, data } if no answer is expected
        - { receiver, data, callback } if an answer as argument of the callback is expected
    */
    const isNodeJS = typeof require === 'function';

    // Telegram types
    const PING_REQUEST = 1;
    const PING_RESPONSE = 2;
    const DATA_REQUEST = 3;
    const DATA_RESPONSE = 4;
    const ERROR_RESPONSE = 5;

    class Connection {
        constructor(socket, sessionId, onError) {
            this._setSocket(socket); // TODO: Call in derived classes
            this._sessionId = sessionId;
            Object.defineProperty(this, 'sessionId', { configurable: false, enumerable: true, get: () => sessionId });
            this._onError = typeof onError === 'function' ? onError : (error) => console.error(`error: ${error}`);
            this._receiversHandler = {};
            this._callbacks = {};
            let unique_id = 0;
            this._nextId = () => `#${(unique_id++).toString(36)}`;
        }
        _setSocket(socket) {
            this._socket = socket;
            // TODO: 
        }
        ping(onResponse, onError) {
            let telegram = { type: PING_REQUEST };
            this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
            this._socket.send(JSON.stringify(telegram));
        }
        _handlePingRequest(callback) {
            this._socket.send(JSON.stringify({ type: PING_RESPONSE, callback }));
        }
        _handlePingResponse(callback) {
            let cb = this._callbacks[callback];
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
        }
        register(receiver, handler) {
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
        }
        unregister(receiver) {
            if (typeof receiver !== 'string') {
                throw new Exception('Connection.unregister(receiver): receiver must be a string!');
            }
            else if (this._receiversHandler[receiver] === undefined) {
                throw new Exception(`Connection.unregister(receiver): "${receiver}" not registered!`);
            }
            else {
                delete this._receiversHandler[receiver];
            }
        }
        send(receiver, data, onResponse, onError) {
            let telegram = { type: DATA_REQUEST, receiver, data };
            if (typeof onResponse === 'function' || typeof onError === 'function') {
                this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
            }
            this._socket.send(JSON.stringify(telegram));
        }
        _handleDataRequest(callback, data, receiver) {
            let that = this, handler = this._receiversHandler[receiver];
            if (handler) {
                if (callback !== undefined) {
                    try {
                        handler(data, function onSuccess(data) {
                            that._socket.send(JSON.stringify({ type: DATA_RESPONSE, callback, data }));
                        }, function onError(error) {
                            that._socket.send(JSON.stringify({ type: ERROR_RESPONSE, callback, error: error ? error : true }));
                        });
                    } catch (exception) {
                        this._socket.send(JSON.stringify({ type: ERROR_RESPONSE, callback, error: `error calling receivers ${receiver} handler: ${exception}` }));
                    }
                }
                else {
                    try {
                        handler(data);
                    } catch (exception) {
                        this._socket.send(JSON.stringify({ type: ERROR_RESPONSE, error: `error calling receivers ${receiver} handler: ${exception}` }));
                    }
                }
            }
            else {
                this._socket.send(JSON.stringify({ type: ERROR_RESPONSE, callback, error: `unknown receiver: ${receiver}` }));
            }
        }
        _handleDataResponse(callback, data) {
            let cb = this._callbacks[callback];
            if (cb) {
                delete this._callbacks[callback];
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
        }
        _handleError(callback, error) {
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
        }
        _handleTelegram(telegram) {
            switch (telegram.type) {
                case PING_REQUEST:
                    this._handlePingRequest(telegram.callback);
                    break;
                case PING_RESPONSE:
                    this._handlePingResponse(telegram.callback);
                    break;
                case DATA_REQUEST:
                    this._handleDataRequest(telegram.callback, telegram.data, telegram.receiver);
                    break;
                case DATA_RESPONSE:
                    this._handleDataResponse(telegram.callback, telegram.data);
                    break;
                case ERROR_RESPONSE:
                    this._handleError(telegram.callback, telegram.error);
                    break;
                default:
                    this._onError(`Received invalid telegram type: ${telegram.type}`);
                    break;
            }
        }
    }

    // TODO: Implement client extensions
    class ClientConnection extends Connection {
        constructor(socket, sessionId, onError) {
            super(socket, sessionId, onError);
            this._foo = true;
        }
        foo(telegram) {
            return `this is the lelegram: ${telegram}`;
        }
    }

    if (isNodeJS) {
        class WebSocketServer {
            constructor(port, onOpen, onClose, onError) {
                let WebSocket = require('ws');
                this._socket = new WebSocket.Server({ port });
                this._socket.on('connection', function (socket, request) {
                    const match = /\bsessionId=(.+)$/.exec(request.url);
                    const sessionId = match ? match[1] : undefined;
                    const connection = new Connection(socket, sessionId, onError);
                    socket.on('message', function (buffer) {
                        connection._handleTelegram(JSON.parse(buffer.toString('utf8')));
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
        }
        module.exports = WebSocketServer;
    } else {
        function getWebSocketConnection(port, sessionId, onOpen, onClose, onSocketError, onConnectionError) {
            let url = `ws://${document.location.hostname}:${port}`;
            if (typeof sessionId === 'string') {
                url += `?sessionId=${sessionId}`;
            }
            let socket = new WebSocket(url);
            let connection = new Connection(socket, sessionId, onConnectionError);
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
                connection._handleTelegram(JSON.parse(message.data));
            };
            return connection;
        }
        root.getWebSocketConnection = getWebSocketConnection;
    }
}(globalThis));