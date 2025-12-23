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
        constructor(sessionId, options) {
            this._sessionId = sessionId;
            this._receiversHandler = {};
            this._callbacks = {};
            this._onError = error => {
                if (typeof options.onError === 'function') {
                    try {
                        options.onError(this, error);
                    } catch (exception) {
                        console.error(`failed calling onError: ${exception}`);
                    }
                }
            };
            this._onOpen = () => {
                if (options.verbose === true) {
                    console.log('web socket connected');
                }
                if (typeof options.onOpen === 'function') {
                    try {
                        options.onOpen(this);
                    } catch (exception) {
                        console.error(`failed calling onOpen: ${exception}`);
                    }
                }
            };
            this._onClose = () => {
                if (options.verbose === true) {
                    console.log('web socket disconnected');
                }
                if (typeof options.onClose === 'function') {
                    try {
                        options.onClose(this);
                    } catch (exception) {
                        console.error(`failed calling onClose: ${exception}`);
                    }
                }
            };
            let unique_id = 0;
            this._nextId = () => `#${(unique_id++).toString(36)}`;
            this._remoteMediumUTC = 0;
            this._remoteToLocalOffsetMillis = 0;
        }
        get sessionId() {
            return this._sessionId;
        }
        get isOnline() {
            return false;
        }
        get _webSocket() {
            return null;
        }
        ping(onResponse, onError) {
            if (this.isOnline) {
                let telegram = { type: TelegramType.PingRequest };
                this._callbacks[telegram.callback = this._nextId()] = { localRequestUTC: Date.now(), onResponse, onError };
                this._webSocket.send(JSON.stringify(telegram));
                return true;
            }
            else {
                this._onError('cannot send ping request when disconnected');
                return false;
            }
        }
        _handlePingRequest(callback) {
            if (this.isOnline) {
                this._webSocket.send(JSON.stringify({ type: TelegramType.PingResponse, callback, utc: Date.now() }));
            }
            else {
                this._onError('cannot send ping reponse when disconnected');
            }
        }
        _handlePingResponse(callback, remoteMediumUTC) {
            this._remoteMediumUTC = remoteMediumUTC;
            let cb = this._callbacks[callback];
            if (cb) {
                delete this._callbacks[callback];
                /*  Note:
                    cb.localRequestUTC: This is the local time when the request was sent.
                    localResponseUTC: This is the local time when the request was received.
                    localMediumUTC: Assuming that sending and receiving take approximately the same amount of time, the local time in between is calculated here.
                    remoteMediumUTC: This is the time of the other participant at the moment when answered the request.
                    remoteToLocalOffsetMillis: This is the offset between both times.
                */
                let localResponseUTC = Date.now();
                let localMediumUTC = (localResponseUTC + cb.localRequestUTC) / 2;
                this._remoteToLocalOffsetMillis = remoteMediumUTC - localMediumUTC;
                try {
                    if (cb.onResponse) {
                        cb.onResponse(localResponseUTC - cb.localRequestUTC);
                    }
                }
                catch (exception) {
                    this._onError(`failed calling onResponse: ${exception}`);
                }
            }
            else {
                this._onError('missing ping callback');
            }
        }
        getRemoteUTC() {
            let now = Date.now();
            return this._remoteToLocalOffsetMillis !== 0 ? Math.ceil(now + this._remoteToLocalOffsetMillis) : now;
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
            if (this.isOnline) {
                let telegram = { type: TelegramType.DataRequest, receiver, data };
                if (typeof onResponse === 'function' || typeof onError === 'function') {
                    this._callbacks[telegram.callback = this._nextId()] = { localRequestUTC: Date.now(), onResponse, onError };
                }
                this._webSocket.send(JSON.stringify(telegram));
                return true;
            }
            else {
                this._onError('cannot send data request when disconnected');
                return false;
            }
        }
        _handleDataRequest(callback, requestData, receiver) {
            let handler = this._receiversHandler[receiver];
            if (handler) {
                if (callback !== undefined) {
                    try {
                        handler(requestData, responseData => {
                            if (this.isOnline) {
                                this._webSocket.send(JSON.stringify({ type: TelegramType.DataResponse, callback, data: responseData }));
                            }
                            else {
                                this._onError('cannot send data response when disconnected');
                            }
                        }, error => {
                            if (this.isOnline) {
                                this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: error ? error : true }));
                            }
                            else {
                                this._onError(`cannot send error response when disconnected (error: ${error})`);
                            }
                        });
                    } catch (exception) {
                        if (this.isOnline) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `failed calling receive handler '${receiver}'! exception: ${exception}` }));
                        }
                        else {
                            this._onError(`failed calling receive handler '${receiver}' but cannot send error response when disconnected! exception: ${exception}`);
                        }
                    }
                }
                else {
                    try {
                        handler(requestData);
                    } catch (exception) {
                        if (this.isOnline) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, error: `failed calling receive handler '${receiver}'! exception: ${exception}` }));
                        }
                        else {
                            this._onError(`failed calling receive handler '${receiver}' but cannot send error response when disconnected! exception: ${exception}`);
                        }
                    }
                }
            }
            else {
                if (this.isOnline) {
                    this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `unknown receiver: '${receiver}'` }));
                }
                else {
                    this._onError(`cannot send error response for unknown receiver: '${receiver}' when disconnected`);
                }
            }
        }
        _handleDataResponse(callback, data) {
            let cb = this._callbacks[callback];
            if (cb) {
                delete this._callbacks[callback];
                try {
                    if (cb.onResponse) {
                        cb.onResponse(data, Date.now() - cb.localRequestUTC);
                    }
                }
                catch (exception) {
                    this._onError(`failed calling onResponse: ${exception}`);
                }
            }
            else {
                this._onError('missing data callback');
            }
        }
        _handleError(callback, error) {
            let cb = callback !== undefined ? this._callbacks[callback] : false;
            if (cb) {
                delete this._callbacks[callback];
                if (cb.onError) {
                    try {
                        cb.onError(error, Date.now() - cb.localRequestUTC);
                    }
                    catch (exception) {
                        this._onError(`failed calling onError: ${exception}`);
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
                    this._handlePingResponse(telegram.callback, telegram.utc);
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

    const DEFAULT_HEARTBEAT_INTERVAL = 5000;
    const DEFAULT_HEARTBEAT_TIMEOUT = 1000;
    const DEFAULT_RECONNECT_START_INTERVAL = 1000;
    const DEFAULT_RECONNECT_MAX_INTERVAL = 32000;

    class WebSocketClientConnection extends BaseConnection {
        constructor(sessionId, hostname, port, options = {}) {
            super(sessionId, options);
            this._url = `ws://${hostname}:${port}?sessionId=${sessionId}`;
            this._state = ClientState.Idle;
            this._socket = null;
            this._verbose = options.verbose === true;
            this._heartbeatInterval = options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
            this._heartbeatTimeout = options.heartbeatTimeout ?? DEFAULT_HEARTBEAT_TIMEOUT;
            this._reconnectStart = options.reconnectStart ?? DEFAULT_RECONNECT_START_INTERVAL;
            this._reconnectMax = options.reconnectMax ?? DEFAULT_RECONNECT_MAX_INTERVAL;
            this._heartbeatTimer = null;
            this._heartbeatTimeoutTimer = null;
        }
        get isOnline() {
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
            this._transition(ClientState.Idle);
            if (this._socket) {
                this._socket.close();
            }
        }
        _transition(state) {
            this._state = state;
            switch (state) {
                case ClientState.Idle:
                    this._stopHeartbeatMonitoring();
                    break;

                case ClientState.Connecting:
                case ClientState.Reconnecting:
                    this._connect();
                    break;

                case ClientState.Online:
                    this._startHeartbeatMonitoring();
                    this._retryDelay = this._reconnectStart;
                    this._onOpen();
                    break;

                case ClientState.Disconnected:
                    this._stopHeartbeatMonitoring();
                    this._scheduleReconnect();
                    this._onClose();
                    break;
            }
        }
        _connect() {
            if (this._socket) {
                // If connected before we remove all event handlers
                this._socket.onopen = this._socket.onmessage = this._socket.onerror = this._socket.onclose = null;
            }
            this._socket = new WebSocket(this._url);
            this._socket.onopen = () => this._transition(ClientState.Online);
            this._socket.onmessage = message => this._handleTelegram(JSON.parse(message.data));
            this._socket.onerror = error => {
                this._socket.close();
                this._onError(error);
            };
            this._socket.onclose = () => {
                if (this._state !== ClientState.Idle) {
                    this._transition(ClientState.Disconnected);
                }
            };
        }
        _startHeartbeatMonitoring() {
            this._heartbeatTimer = setInterval(() => {
                if (this._state === ClientState.Online) {
                    this.ping(millis => {
                        clearTimeout(this._heartbeatTimeoutTimer);
                    }, exception => {
                        this._onError(`heartbeat monitoring failed: ${exception}`);
                    });
                    this._heartbeatTimeoutTimer = setTimeout(() => {
                        this._onError('heartbeat monitoring timeout expired -> close socket');
                        this._socket.close();
                    }, this._heartbeatTimeout);
                }
            }, this._heartbeatInterval);
        }
        _stopHeartbeatMonitoring() {
            clearInterval(this._heartbeatTimer);
            clearTimeout(this._heartbeatTimeoutTimer);
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
    }

    // Returns a 64-character hexadecimal string, which should be fairly likely to be unique by using the current time and random values. 
    function createUniqueSessionId() {
        let raw = `#${Math.E * Math.random()}&${Date.now()}%${Math.PI * Math.random()}@`;
        return crypto.createHash('SHA-256').update(raw, 'utf8').digest('hex');
    }

    // Extracts the session ID generated by the above function from the URL.
    function getSessionIdFromURL(url) {
        const match = /\bsessionId=([0-9a-f]{64})$/.exec(url);
        return match ? match[1] : '';
    }

    class WebSocketServerConnection extends BaseConnection {
        constructor(sessionId, options = {}) {
            super(sessionId, options);
            this._socket = null;
            this._online = false;
        }
        get isOnline() {
            return this._online;
        }
        get _webSocket() {
            return this._socket;
        }
        _setWebSocket(socket) {
            if (this._socket) {
                // If connected before we remove all event handlers
                this._socket.onopen = this._socket.onmessage = this._socket.onerror = this._socket.onclose = null;
            }
            this._socket = socket;
            this._socket.onopen = () => this._onOpen();
            this._socket.onmessage = message => this._handleTelegram(JSON.parse(message.data));
            this._socket.onerror = error => {
                this._online = false;
                this._socket.close();
                this._onError(error);
            };
            this._socket.onclose = () => {
                this._online = false;
                this._onClose();
            };
        }
    }

    class WebSocketServer {
        constructor(port, options = {}) {
            let that = this;
            this._options = options;
            this._connections = {};
            this._server = new WebSocket.Server({ port });
            this._server.on('connection', function (socket, request) { // TODO server.onconnection ???
                const sessionId = getSessionIdFromURL(request.url);
                let connection = that._connections[sessionId];
                if (!connection) {
                    that._connections[sessionId] = connection = new WebSocketServerConnection(sessionId, options);
                }
                connection._setWebSocket(socket);
                try {
                    options.onConnection(connection);
                } catch (error) {
                    console.error(`failed calling onOpen: ${error}`);
                }
            });
        }
    }

    if (isNodeJS) {
        module.exports = { createUniqueSessionId, WebSocketServer };
    } else {
        root.WebSocketClientConnection = WebSocketClientConnection;
    }
}(globalThis));