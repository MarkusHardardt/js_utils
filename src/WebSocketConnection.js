(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const crypto = isNodeJS ? require('crypto') : undefined;

    const TelegramType = Object.freeze({
        PingRequest: 1,
        PingResponse: 2,
        DataRequest: 3,
        DataResponse: 4,
        ErrorResponse: 5
    });

    class Connection {
        constructor(onError) {
            this._onError = typeof onError === 'function' ? onError : (error) => console.error(`error: ${error}`);
            this._receiversHandler = {};
            this._callbacks = {};
            let unique_id = 0;
            this._nextId = () => `#${(unique_id++).toString(36)}`;
        }
        get sessionId() {
            return this._sessionId;
        }
        // TODO: remove or reuse
        _setSocket(socket) {
            this._socket = socket;
            // TODO: 
        }
        ping(onResponse, onError) {
            let telegram = { type: TelegramType.PingRequest };
            this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
            this._socket.send(JSON.stringify(telegram));
        }
        _handlePingRequest(callback) {
            this._socket.send(JSON.stringify({ type: TelegramType.PingResponse, callback }));
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
            let telegram = { type: TelegramType.DataRequest, receiver, data };
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
                            that._socket.send(JSON.stringify({ type: TelegramType.DataResponse, callback, data }));
                        }, function onError(error) {
                            that._socket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: error ? error : true }));
                        });
                    } catch (exception) {
                        this._socket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `error calling receivers ${receiver} handler: ${exception}` }));
                    }
                }
                else {
                    try {
                        handler(data);
                    } catch (exception) {
                        this._socket.send(JSON.stringify({ type: TelegramType.ErrorResponse, error: `error calling receivers ${receiver} handler: ${exception}` }));
                    }
                }
            }
            else {
                this._socket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `unknown receiver: ${receiver}` }));
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
                case TelegramType.PingRequest:
                    this._handlePingRequest(telegram.callback);
                    break;
                case TelegramType.PingResponse:
                    this._handlePingResponse(telegram.callback);
                    break;
                case TelegramType.DataRequest:
                    this._handleDataRequest(telegram.callback, telegram.data, telegram.receiver);
                    break;
                case TelegramType.DataResponse:
                    this._handleDataResponse(telegram.callback, telegram.data);
                    break;
                case TelegramType.ErrorResponse:
                    this._handleError(telegram.callback, telegram.error);
                    break;
                default:
                    this._onError(`Received invalid telegram type: ${telegram.type}`);
                    break;
            }
        }
    }

    const ClientState = Object.freeze({
        Idle: 0,
        Connecting: 1,
        Reconnecting: 2,
        Online: 3,
        Disconnected: 4
    });

    class ClientConnection extends Connection {
        constructor(sessionId, hostname, port, options = {}) {
            super(options.onError);
            this._sessionId = sessionId;
            this._url = `ws://${hostname}:${port}?sessionId=${sessionId}`;

            this._state = ClientState.Idle;
            this._socket = null;

            this._heartbeatInterval = options.heartbeatInterval ?? 15000;
            this._heartbeatTimeout = options.heartbeatTimeout ?? 5000;
            this._reconnectMax = options.reconnectMax ?? 30000;

            this._retryDelay = 1000;
            this._heartbeatTimer = null;
            this._heartbeatTimeoutTimer = null;

            // TODO: use or remove
            this._handlers = {
                message: () => { },
                online: () => { },
                offline: () => { }
            };
            //ws.on("message", msg => handleMachineData(msg));
        }

        on(event, fn) {
            this._handlers[event] = fn;
        }

        start() {
            if (this._state === ClientState.Idle) {
                this._transition(ClientState.Connecting);
            }
        }

        stop() {
            this._cleanup();
            this._transition(ClientState.Idle);
        }

        ___send(data) {
            if (this._state !== ClientState.Online) return false;
            this._socket.send(data);
            return true;
        }

        /* ---------------- FSM core ---------------- */

        _transition(next) {
            this._cleanup();
            this._state = next;

            switch (next) {
                case ClientState.Connecting:
                case ClientState.Reconnecting:
                    this._connect();
                    break;

                case ClientState.Online:
                    this._handlers.online();
                    this._startHeartbeat();
                    this._retryDelay = 1000;
                    break;

                case ClientState.Disconnected:
                    this._handlers.offline();
                    this._scheduleReconnect();
                    break;
            }
        }

        _connect() {
            if (this._socket) {
                this._socket.onopen =
                    this._socket.onmessage =
                    this._socket.onerror =
                    this._socket.onclose = null;
            }
            this._socket = new WebSocket(this._url);

            this._socket.onopen = () => this._transition(ClientState.Online);
            // this._socket.onmessage = e => this._handlers.message(e.data);
            this._socket.onmessage = message => this._handleTelegram(JSON.parse(message.data));

            // this._socket.onmessage = e => this._handleTelegram(JSON.parse(e.data.toString('utf8')));



            this._socket.onerror = () => this._socket.close();
            this._socket.onclose = () => {
                if (this._state !== ClientState.Idle) {
                    this._transition(ClientState.Disconnected);
                }
            };
        }

        /* ---------------- Heartbeat ---------------- */

        _startHeartbeat() {
            this._heartbeatTimer = setInterval(() => {
                if (this._state !== ClientState.Online) return;

                // this._socket.send(JSON.stringify({ type: "ping" })); 
                this.ping(millis => {
                    console.log(`heartbeat ping millis: ${millis}`);
                    clearTimeout(this._heartbeatTimeoutTimer);
                }, exception => {
                    console.error(`heartbeat ping failed: ${exception}`);
                });
                this._heartbeatTimeoutTimer = setTimeout(() => {
                    this._socket.close();
                    console.error('heartbeat timeout expired');
                }, this._heartbeatTimeout);
            }, this._heartbeatInterval);
        }

        /* ---------------- Reconnect ---------------- */

        _scheduleReconnect() {
            setTimeout(() => {
                if (this._state === ClientState.Disconnected) {
                    this._transition(ClientState.Reconnecting);
                }
            }, this._retryDelay);

            this._retryDelay = Math.min(
                this._retryDelay * 2,
                this._reconnectMax
            );
        }

        /* ---------------- Cleanup ---------------- */

        _cleanup() {
            clearInterval(this._heartbeatTimer);
            clearTimeout(this._heartbeatTimeoutTimer);
        }
    }

    function createSessionId() {
        let raw = `#${Math.E * Math.random()}&${Date.now()}%${Math.PI * Math.random()}@`;
        return crypto.createHash('SHA-256').update(raw, 'utf8').digest('hex');
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
        module.exports = { WebSocketServer, createSessionId };
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
        root.ClientConnection = ClientConnection;
    }
}(globalThis));