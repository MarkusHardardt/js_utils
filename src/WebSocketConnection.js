(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const crypto = isNodeJS ? require('crypto') : undefined;
    const WebSocket = isNodeJS ? require('ws') : root.WebSocket;

    const TelegramType = Object.freeze({
        PingRequest: 1,
        PingResponse: 2,
        DataRequest: 3,
        DataResponse: 4,
        ErrorResponse: 5
    });

    class BaseConnection {
        constructor(sessionId, onError) {
            this._sessionId = sessionId;
            this._onError = typeof onError === 'function' ? onError : (error) => console.error(`error: ${error}`);
            this._receiversHandler = {};
            this._callbacks = {};
            let unique_id = 0;
            this._nextId = () => `#${(unique_id++).toString(36)}`;
        }
        get sessionId() {
            return this._sessionId;
        }
        get online() {
            return false;
        }
        get _webSocket() {
            return null;
        }
        ping(onResponse, onError) {
            if (this.online) {
                let telegram = { type: TelegramType.PingRequest };
                this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
                this._webSocket.send(JSON.stringify(telegram));
                return true;
            }
            else {
                this._onError('Cannot send ping request when disconnected');
                return false;
            }
        }
        _handlePingRequest(callback) {
            if (this.online) {
                this._webSocket.send(JSON.stringify({ type: TelegramType.PingResponse, callback }));
            }
            else {
                this._onError('Cannot send ping reponse when disconnected');
            }
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
                throw new Exception('BaseConnection.register(receiver, handler): receiver must be a string!');
            }
            else if (typeof handler !== 'function') {
                throw new Exception('BaseConnection.register(receiver, handler): handler must be a function!');
            }
            else if (this._receiversHandler[receiver]) {
                throw new Exception(`BaseConnection.register(receiver, handler): handler "${receiver}" already registered!`);
            }
            else {
                this._receiversHandler[receiver] = handler;
            }
        }
        unregister(receiver) {
            if (typeof receiver !== 'string') {
                throw new Exception('BaseConnection.unregister(receiver): receiver must be a string!');
            }
            else if (this._receiversHandler[receiver] === undefined) {
                throw new Exception(`BaseConnection.unregister(receiver): "${receiver}" not registered!`);
            }
            else {
                delete this._receiversHandler[receiver];
            }
        }
        send(receiver, data, onResponse, onError) {
            if (this.online) {
                let telegram = { type: TelegramType.DataRequest, receiver, data };
                if (typeof onResponse === 'function' || typeof onError === 'function') {
                    this._callbacks[telegram.callback = this._nextId()] = { request: Date.now(), onResponse, onError };
                }
                this._webSocket.send(JSON.stringify(telegram));
                return true;
            }
            else {
                this._onError('Cannot send data request when disconnected');
                return false;
            }
        }
        _handleDataRequest(callback, data, receiver) {
            let that = this, handler = this._receiversHandler[receiver];
            if (handler) {
                if (callback !== undefined) {
                    try {
                        handler(data, function onSuccess(data) {
                            if (that.online) {
                                that._webSocket.send(JSON.stringify({ type: TelegramType.DataResponse, callback, data }));
                            }
                            else {
                                that._onError('Cannot send data response when disconnected');
                            }
                        }, function onError(error) {
                            if (that.online) {
                                that._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: error ? error : true }));
                            }
                            else {
                                that._onError('Cannot send error response when disconnected');
                            }
                        });
                    } catch (exception) {
                        if (this.online) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `error calling receivers ${receiver} handler: ${exception}` }));
                        }
                        else {
                            this._onError('Cannot send error response when disconnected');
                        }
                    }
                }
                else {
                    try {
                        handler(data);
                    } catch (exception) {
                        if (this.online) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, error: `error calling receivers ${receiver} handler: ${exception}` }));
                        }
                        else {
                            this._onError('Cannot send error response when disconnected');
                        }
                    }
                }
            }
            else {
                if (this.online) {
                    this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `unknown receiver: ${receiver}` }));
                }
                else {
                    this._onError('Cannot send error response when disconnected');
                }
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

    class WebSocketClientConnection extends BaseConnection {
        constructor(sessionId, hostname, port, options = {}) {
            super(sessionId, options.onError);
            this._url = `ws://${hostname}:${port}?sessionId=${sessionId}`;
            this._state = ClientState.Idle;
            this._socket = null;
            this._heartbeatInterval = options.heartbeatInterval ?? 15000;
            this._heartbeatTimeout = options.heartbeatTimeout ?? 5000;
            this._reconnectMax = options.reconnectMax ?? 30000;
            this._retryDelay = 1000;
            this._heartbeatTimer = null;
            this._heartbeatTimeoutTimer = null;
            this._online = () => {
                if (typeof options.online === 'function') {
                    options.online();
                }
                else {
                    console.log('web socket connection is online');
                }
            };
            this._offline = () => {
                if (typeof options.offline === 'function') {
                    options.offline();
                }
                else {
                    console.log('web socket connection is offline');
                }
            };
        }
        get online() {
            return this._state === ClientState.Online;
        }
        get _webSocket() {
            return this._socket;
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
        _transition(next) {
            this._cleanup();
            this._state = next;

            switch (next) {
                case ClientState.Connecting:
                case ClientState.Reconnecting:
                    this._connect();
                    break;

                case ClientState.Online:
                    this._startHeartbeat();
                    this._retryDelay = 1000;
                    this._online();
                    break;

                case ClientState.Disconnected:
                    this._scheduleReconnect();
                    this._offline();
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
            this._socket.onmessage = message => this._handleTelegram(JSON.parse(message.data));
            this._socket.onerror = () => this._socket.close();
            this._socket.onclose = () => {
                if (this._state !== ClientState.Idle) {
                    this._transition(ClientState.Disconnected);
                }
            };
        }
        _startHeartbeat() {
            this._heartbeatTimer = setInterval(() => {
                if (this._state === ClientState.Online) {
                    this.ping(millis => {
                        // TODO: reuse or remove: console.log(`heartbeat ping millis: ${millis}`);
                        clearTimeout(this._heartbeatTimeoutTimer);
                    }, exception => {
                        console.error(`heartbeat ping failed: ${exception}`);
                    });
                    this._heartbeatTimeoutTimer = setTimeout(() => {
                        this._socket.close();
                        console.error('heartbeat timeout expired');
                    }, this._heartbeatTimeout);
                }
            }, this._heartbeatInterval);
        }
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
        _cleanup() {
            clearInterval(this._heartbeatTimer);
            clearTimeout(this._heartbeatTimeoutTimer);
        }
    }

    function createSessionId() {
        let raw = `#${Math.E * Math.random()}&${Date.now()}%${Math.PI * Math.random()}@`;
        return crypto.createHash('SHA-256').update(raw, 'utf8').digest('hex');
    }

    class WebSocketServerConnection extends BaseConnection {
        constructor(sessionId, options = {}) {
            super(sessionId, options.onError);
        }
        get online() {
            return true; // TODO: Implement logic
        }
        get _webSocket() {
            return this._socket;
        }
    }

    class WebSocketServer {
        constructor(port, options = {}) {
            let that = this;
            this._connections = {};
            this._server = new WebSocket.Server({ port });
            this._server.on('connection', function (socket, request) {
                const sessionId = WebSocketServer.getSessionIdFromURL(request.url);
                let connection = that._connections[sessionId];
                if (!connection) {
                    that._connections[sessionId] = connection = new WebSocketServerConnection(sessionId, options.onError);
                }
                connection._socket = socket;
                socket.on('message', function (buffer) {
                    connection._handleTelegram(JSON.parse(buffer.toString('utf8')));
                });
                socket.on('close', function () {
                    if (typeof options.onClose === 'function') {
                        try {
                            options.onClose(connection);
                        } catch (error) {
                            console.error(`failed calling onClose: ${error}`);
                        }
                    }
                });
                socket.on('error', function (event) {
                    if (typeof options.onError === 'function') {
                        try {
                            options.onError(connection, event);
                        } catch (error) {
                            console.error(`failed calling onError: ${error}`);
                        }
                    }
                    else {
                        console.error('connection error');
                    }
                });
                if (typeof options.onOpen === 'function') {
                    try {
                        options.onOpen(connection);
                    } catch (error) {
                        console.error(`failed calling onOpen: ${error}`);
                    }
                }
            });
        }
        static getSessionIdFromURL(url) {
            const match = /\bsessionId=([0-9a-f]{64})$/.exec(url);
            return match ? match[1] : '';
        }
    }

    if (isNodeJS) {
        module.exports = { createSessionId, WebSocketServer };
    } else {
        root.WebSocketClientConnection = WebSocketClientConnection;
    }
}(globalThis));