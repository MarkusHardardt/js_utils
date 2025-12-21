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
        constructor(onError) {
            this._onError = typeof onError === 'function' ? onError : (error) => console.error(`error: ${error}`);
            this._receiversHandler = {};
            this._callbacks = {};
            let unique_id = 0;
            this._nextId = () => `#${(unique_id++).toString(36)}`;
        }
        get sessionId() {
            return this._sid;
        }
        set _sessionId(value) {
            this._sid = value;
        }
        // TODO: remove or reuse
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

    const CLIENT_STATE_IDLE = 0;
    const CLIENT_STATE_CONNECTING = 1;
    const CLIENT_STATE_RECONNECTING = 2;
    const CLIENT_STATE_ONLINE = 3;
    const CLIENT_STATE_DISCONNECTED = 4;

    class ClientConnection extends Connection {
        constructor(hostname, port, onError, options = {}) {
            super(onError);
            this._hostname = hostname;
            this._port = port;
            this._url = undefined;

            this._state = CLIENT_STATE_IDLE;
            this._socket = null;

            this.heartbeatInterval = options.heartbeatInterval ?? 15000;
            this.heartbeatTimeout = options.heartbeatTimeout ?? 5000;
            this.reconnectMax = options.reconnectMax ?? 30000;

            this.retryDelay = 1000;
            this.heartbeatTimer = null;
            this.heartbeatTimeoutTimer = null;

            this.handlers = {
                message: () => { },
                online: () => { },
                offline: () => { }
            };
        }

        on(event, fn) {
            this.handlers[event] = fn;
        }

        start() {
            let that = this;
            if (this._state === CLIENT_STATE_IDLE) {
                Utilities.sha256(`#${Math.random()}&${Date.now()}%${Math.random()}@`, function onSuccess(sessionId) {
                    that._url = `ws://${that._hostname}:${that._port}?sessionId=${sessionId}`;
                    this._transition(CLIENT_STATE_CONNECTING);
                }, function onError(exception) {
                    console.error(`Error creating session id: ${exception}`);
                });
            }
        }

        stop() {
            this._cleanup();
            this._transition(CLIENT_STATE_IDLE);
        }

        send(data) {
            if (this._state !== CLIENT_STATE_ONLINE) return false;
            this._socket.send(data);
            return true;
        }

        /* ---------------- FSM core ---------------- */

        _transition(next) {
            this._cleanup();
            this._state = next;

            switch (next) {
                case CLIENT_STATE_CONNECTING:
                case CLIENT_STATE_RECONNECTING:
                    this._connect();
                    break;

                case CLIENT_STATE_ONLINE:
                    this.handlers.online();
                    this.startHeartbeat();
                    this.retryDelay = 1000;
                    break;

                case CLIENT_STATE_DISCONNECTED:
                    this.handlers.offline();
                    this.scheduleReconnect();
                    break;
            }
        }

        _connect() {
            this._socket = new WebSocket(this._url);

            this._socket.onopen = () => this._transition(CLIENT_STATE_ONLINE);
            this._socket.onmessage = e => this.handlers.message(e.data);

            this._socket.onerror = () => this._socket.close();
            this._socket.onclose = () => {
                if (this._state !== CLIENT_STATE_IDLE) {
                    this._transition(CLIENT_STATE_DISCONNECTED);
                }
            };
        }

        /* ---------------- Heartbeat ---------------- */

        startHeartbeat() {
            this.heartbeatTimer = setInterval(() => {
                if (this._state !== CLIENT_STATE_ONLINE) return;

                this._socket.send(JSON.stringify({ type: "ping" }));

                this.heartbeatTimeoutTimer = setTimeout(() => {
                    this._socket.close();
                }, this.heartbeatTimeout);
            }, this.heartbeatInterval);
        }

        /* ---------------- Reconnect ---------------- */

        scheduleReconnect() {
            setTimeout(() => {
                if (this._state === CLIENT_STATE_DISCONNECTED) {
                    this._transition(CLIENT_STATE_RECONNECTING);
                }
            }, this.retryDelay);

            this.retryDelay = Math.min(
                this.retryDelay * 2,
                this.reconnectMax
            );
        }

        /* ---------------- Cleanup ---------------- */

        _cleanup() {
            clearInterval(this.heartbeatTimer);
            clearTimeout(this.heartbeatTimeoutTimer);

            if (this._socket) {
                this._socket.onopen =
                    this._socket.onmessage =
                    this._socket.onerror =
                    this._socket.onclose = null;
            }
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
                    const connection = new Connection(onError);
                    connection._sessionId = sessionId;
                    connection._setSocket(socket);
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
        function getWebSocketConnection(hostname, port, sessionId, onOpen, onClose, onSocketError, onConnectionError) {
            let url = `ws://${hostname}:${port}`;
            if (typeof sessionId === 'string') {
                url += `?sessionId=${sessionId}`;
            }
            const socket = new WebSocket(url);
            const connection = new Connection(onConnectionError);
            connection._sessionId = sessionId;
            connection._setSocket(socket);
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