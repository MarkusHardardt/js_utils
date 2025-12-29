(function (root) {
    "use strict";
    const WebSocketConnection = {};
    const isNodeJS = typeof require === 'function';
    const Server = isNodeJS ? require('./Server.js') : root.Server;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const WebSocket = isNodeJS ? require('ws') : root.WebSocket;

    const FORMATED_SESSION_ID_PART_LENGTH = 6;
    function formatSesionId(sessionId) {
        return `${sessionId.substring(0, FORMATED_SESSION_ID_PART_LENGTH)}..${sessionId.substring(sessionId.length - FORMATED_SESSION_ID_PART_LENGTH, sessionId.length)}`;
    }
    WebSocketConnection.formatSesionId = formatSesionId;

    const TelegramType = Object.freeze({
        PingRequest: 1,
        PingResponse: 2,
        DataRequest: 3,
        DataResponse: 4,
        ErrorResponse: 5
    });

    /*  The Connection constructor requires the following arguments:
        - sessionId: received from web server (using ajax)
        - options: {
            OnOpen(): will be called when socket connection has been established
            OnClose(): will be called when socket connection has been lost
            OnError(error): will be called when an error occurred
          }
        A connection has the following public interface:
        - SessionId: The session id
        - IsConnected: true if connected
        - Ping(): sends ping to other an waits for response (pong)
        - Register(): registers receiver for data
        - Unregister(): unregisters receiver for data
        - Send(): sends data to receiver on other side an waits optionally for response (pong)    */
    class Connection {
        constructor(sessionId, options) {
            this._sessionId = sessionId;
            this._handlers = {};
            this._callbacks = {};
            this._onOpen = () => {
                if (typeof options.OnOpen === 'function') {
                    try {
                        options.OnOpen();
                    } catch (error) {
                        console.error(`failed calling OnOpen: ${error}`);
                    }
                }
            };
            this._onClose = () => {
                if (typeof options.OnClose === 'function') {
                    try {
                        options.OnClose();
                    } catch (error) {
                        console.error(`failed calling OnClose: ${error}`);
                    }
                }
            };
            this._onError = error => {
                if (typeof options.OnError === 'function') {
                    try {
                        options.OnError(error);
                    } catch (error) {
                        console.error(`failed calling OnError: ${error}`);
                    }
                }
            };
            this._nextId = Core.createIdGenerator('#');
            this._remoteMediumUTC = 0;
            this._remoteToLocalOffsetMillis = 0;
            Common.validateConnectionInterface(this, true);
        }
        get SessionId() {
            return this._sessionId;
        }
        get IsConnected() {
            return false;
        }
        get _webSocket() {
            return null;
        }
        Ping(onResponse, onError) {
            if (this.IsConnected) {
                let telegram = { type: TelegramType.PingRequest };
                this._callbacks[telegram.callback = this._nextId()] = { localRequestUTC: Date.now(), onResponse, onError };
                this._webSocket.send(JSON.stringify(telegram));
            } else {
                throw new Error('Connection.Ping(): cannot send ping request when disconnected!');
            }
        }
        _handlePingRequest(callback) {
            if (this.IsConnected) {
                this._webSocket.send(JSON.stringify({ type: TelegramType.PingResponse, callback, utc: Date.now() }));
            } else {
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
                } catch (error) {
                    this._onError(`failed calling onResponse: ${error}`);
                }
            } else {
                this._onError('missing ping callback');
            }
        }
        get RemoteUTC() {
            let now = Date.now();
            return this._remoteToLocalOffsetMillis !== 0 ? Math.ceil(now + this._remoteToLocalOffsetMillis) : now;
        }
        Register(receiver, handler) {
            if (typeof receiver !== 'string') {
                throw new Error('Connection.Register(receiver, handler): receiver must be a string!');
            } else if (typeof handler !== 'function') {
                throw new Error('Connection.Register(receiver, handler): handler must be a function!');
            } else if (this._handlers[receiver]) {
                throw new Error(`Connection.Register(receiver, handler): handler "${receiver}" already registered!`);
            } else {
                this._handlers[receiver] = handler;
            }
        }
        Unregister(receiver) {
            if (typeof receiver !== 'string') {
                throw new Error('Connection.Unregister(receiver): receiver must be a string!');
            } else if (this._handlers[receiver] === undefined) {
                throw new Error(`Connection.Unregister(receiver): "${receiver}" not registered!`);
            } else {
                delete this._handlers[receiver];
            }
        }
        Send(receiver, data, onResponse, onError) {
            if (this.IsConnected) {
                let telegram = { type: TelegramType.DataRequest, receiver, data };
                if (typeof onResponse === 'function' || typeof onError === 'function') {
                    this._callbacks[telegram.callback = this._nextId()] = { localRequestUTC: Date.now(), onResponse, onError };
                }
                this._webSocket.send(JSON.stringify(telegram));
                return true;
            } else {
                throw new Error('Connection.Send(): cannot send data request when disconnected!');
            }
        }
        _handleDataRequest(callback, requestData, receiver) {
            let handler = this._handlers[receiver];
            if (handler) {
                if (callback !== undefined) {
                    try {
                        handler(requestData, responseData => {
                            if (this.IsConnected) {
                                this._webSocket.send(JSON.stringify({ type: TelegramType.DataResponse, callback, data: responseData }));
                            } else {
                                this._onError('cannot send data response when disconnected');
                            }
                        }, error => {
                            if (this.IsConnected) {
                                this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: error ? error : true }));
                            } else {
                                this._onError(`cannot send error response when disconnected (error: ${error})`);
                            }
                        });
                    } catch (error) {
                        if (this.IsConnected) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `failed calling receive handler '${receiver}'! error: ${error}` }));
                        } else {
                            this._onError(`failed calling receive handler '${receiver}' but cannot send error response when disconnected! error: ${error}`);
                        }
                    }
                }
                else {
                    try {
                        handler(requestData);
                    } catch (error) {
                        if (this.IsConnected) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, error: `failed calling receive handler '${receiver}'! error: ${error}` }));
                        } else {
                            this._onError(`failed calling receive handler '${receiver}' but cannot send error response when disconnected! error: ${error}`);
                        }
                    }
                }
            } else {
                if (this.IsConnected) {
                    this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `unknown receiver: '${receiver}'` }));
                } else {
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
                } catch (error) {
                    this._onError(`failed calling onResponse: ${error}`);
                }
            } else {
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
                    } catch (error) {
                        this._onError(`failed calling onError: ${error}`);
                    }
                } else {
                    this._onError(error);
                }
            } else {
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

    // Client
    if (!isNodeJS) {
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

        /*  WebSocketClientConnection extends Connection and the constructor requires the following arguments:
            - hostname: taken from url (using document.location.hostname)
            - config: { received as stuct from web server (using ajax)
                sessionId: the session id
                port: the web socket server port
                secure: true if https will be used
                autoConnect: true if client must trying to connect immediatelly
            }
            - options: {
                heartbeatInterval: cyclic ping to server [ms]
                heartbeatTimeout: timeout before disconnect [ms]
                reconnectStart: timeout before first reconnect attempt [ms] (will be doubled on each try until max is reached)
                reconnectMax: max timeout before next reconnect attempt [ms]
                OnOpen(): will be called when socket connection has been established
                OnClose(): will be called when socket connection has been lost
                OnError(error): will be called when an error occurred
              }
            A client connection has the following public interface:
            - Start(): triggers connection attempts
            - Stop(): triggers disconnection
            Read comment for Connection for more properties and methods.    */
        class WebSocketClientConnection extends Connection {
            constructor(hostname, config, options = {}) {
                super(config.sessionId, options);
                this._url = `${(config.secure ? 'wss' : 'ws')}://${hostname}:${config.port}?sessionId=${config.sessionId}`;
                this._socket = null;
                this._heartbeatInterval = options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
                this._heartbeatTimeout = options.heartbeatTimeout ?? DEFAULT_HEARTBEAT_TIMEOUT;
                this._reconnectStart = options.reconnectStart ?? DEFAULT_RECONNECT_START_INTERVAL;
                this._reconnectMax = options.reconnectMax ?? DEFAULT_RECONNECT_MAX_INTERVAL;
                this._heartbeatTimer = null;
                this._heartbeatTimeoutTimer = null;
                this._transition(config.autoConnect === true ? ClientState.Connecting : ClientState.Idle);
            }
            get IsConnected() {
                return this._state === ClientState.Online;
            }
            get _webSocket() {
                return this._socket;
            }
            Start() {
                if (this._state === ClientState.Idle) {
                    this._transition(ClientState.Connecting);
                }
            }
            Stop() {
                if (this._state !== ClientState.Idle) {
                    this._transition(ClientState.Idle);
                    if (this._socket) {
                        this._socket.close();
                        this._onClose();
                    }
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
                        this.Ping(millis => {
                            clearTimeout(this._heartbeatTimeoutTimer);
                        }, error => {
                            this._onError(`heartbeat monitoring failed: ${error}`);
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
        WebSocketConnection.ClientConnection = WebSocketClientConnection;
    }

    // Server
    if (isNodeJS) {
        /*  WebSocketServerConnection extends Connection and the constructor requires the following arguments:
            - sessionId: received from web server (using ajax)
            - options: {
                OnOpen(): will be called when socket connection has been established
                OnClose(): will be called when socket connection has been lost
                OnError(error): will be called when an error occurred
              }
            Read comment for Connection for more properties and methods.    */
        class WebSocketServerConnection extends Connection {
            constructor(sessionId, options) {
                super(sessionId, options);
                this._socket = null;
                this._online = false;
            }
            get IsConnected() {
                return this._online;
            }
            get _webSocket() {
                return this._socket;
            }
            setAlreadyConnectedAndOpenSocket(socket) {
                if (this._socket) {
                    // If connected before we remove all event handlers
                    this._socket.onopen = this._socket.onmessage = this._socket.onerror = this._socket.onclose = null;
                }
                this._socket = socket;
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
                // Note:
                // Since this method is called with an already connected and open socket, it is not possible to react to 'socket.onopen' because it is no longer triggered.
                // Instead, the online status is set directly and the 'OnOpen' method is triggered manually.
                this._online = true;
                this._onOpen(this);
            }
        }

        const DEFAULT_CLOSED_CONNECTION_DISPOSE_TIMEOUT = 60000;

        /*  The WebSocketServer constructor requires the following arguments:
            - port: the port for the socket server
            - options: {
                closedConnectionDisposeTimeout: timeout before a closed connection is disposed [ms]
                OnOpen(connection): will be called when socket connection has been established the first time
                OnReopen(connection): will be called when socket connection has been established again
                OnClose(connection): will be called when socket connection has been lost
                OnDispose(connection): will be called when socket connection has been lost and not established again before the timeout has expired
                OnError(connection, error): will be called when an error occurred
              }   
            A server has the following public interface:    
            - CreateSessionConfig(): returns a configuration object containing the port and a new unique session id    */
        class WebSocketServer {
            constructor(port, options = {}) {
                this._port = port;
                this._options = options;
                this._instances = {};
                this._server = new WebSocket.Server({ port });
                this._server.on('connection', (socket, request) => {
                    const sessionId = this._getSessionIdFromURL(request.url);
                    let instance = this._instances[sessionId];
                    const isUTC = typeof instance === 'number'; // If UTC from creation we know that the id came from here (see below)
                    const createdUTC = isUTC ? instance : undefined;
                    if (isUTC || instance === undefined) {
                        this._instances[sessionId] = instance = {};
                        if (isUTC) {
                            instance.createdUTC = createdUTC;
                        } else {
                            console.warn(`web socket connected with unknown session id: '${formatSesionId(sessionId)}'`)
                        }
                        instance.connection = new WebSocketServerConnection(sessionId, {
                            OnOpen: () => {
                                const isFirstOpen = instance.openedUTC === undefined;
                                instance.openedUTC = Date.now();
                                if (isFirstOpen) {
                                    if (typeof options.OnOpen === 'function') {
                                        try {
                                            options.OnOpen(instance.connection);
                                        } catch (error) {
                                            console.error(`failed calling OnOpen: ${error}`);
                                        }
                                    } else {
                                        console.log(`connection opened with session id: '${formatSesionId(sessionId)}'`);
                                    }
                                } else {
                                    clearTimeout(instance.disposeTimeoutTimer);
                                    if (typeof options.OnReopen === 'function') {
                                        try {
                                            options.OnReopen(instance.connection);
                                        } catch (error) {
                                            console.error(`failed calling OnReopen: ${error}`);
                                        }
                                    } else {
                                        console.log(`connection reopened with session id: '${formatSesionId(sessionId)}'`);
                                    }
                                }
                            },
                            OnClose: () => {
                                instance.closedUTC = Date.now();
                                if (typeof options.OnClose === 'function') {
                                    try {
                                        options.OnClose(instance.connection);
                                    } catch (error) {
                                        console.error(`failed calling OnClose: ${error}`);
                                    }
                                } else {
                                    console.log(`connection closed with session id: '${formatSesionId(sessionId)}'`);
                                }
                                instance.disposeTimeoutTimer = setTimeout(() => {
                                    delete this._instances[sessionId];
                                    if (typeof options.OnDispose === 'function') {
                                        try {
                                            options.OnDispose(instance.connection);
                                        } catch (error) {
                                            console.error(`failed calling OnDispose: ${error}`);
                                        }
                                    } else {
                                        console.log(`connection diposed with session id: '${formatSesionId(sessionId)}'`);
                                    }
                                }, options.closedConnectionDisposeTimeout ?? DEFAULT_CLOSED_CONNECTION_DISPOSE_TIMEOUT);
                            },
                            OnError: error => {
                                if (typeof options.OnError === 'function') {
                                    try {
                                        options.OnError(instance.connection, error);
                                    } catch (error) {
                                        console.error(`failed calling OnError for error: ${error}: ${error}`);
                                    }
                                } else {
                                    console.error(`error in connection with session id: '${formatSesionId(sessionId)}': ${error}`);
                                }
                            }
                        });
                    }
                    instance.connection.setAlreadyConnectedAndOpenSocket(socket);
                });
            }
            CreateSessionConfig() {
                let sessionId = this._createUniqueSessionId();
                this._instances[sessionId] = Date.now(); // By storing the current UTC we know on connect that the id came from here (see above)
                return {
                    sessionId,
                    port: this._port,
                    secure: this._options.secure === true,
                    autoConnect: this._options.autoConnect === true
                };
            }
            // Returns a 64-character hexadecimal string, which should be fairly likely to be unique by using the current time and random values. 
            _createUniqueSessionId() {
                return Server.createSHA256(`#${Math.E * Math.random()}&${Date.now()}%${Math.PI * Math.random()}@`);
            }
            // Extracts the session ID generated by the above function from the URL.
            _getSessionIdFromURL(url) {
                const match = /\bsessionId=([0-9a-f]{64})$/.exec(url);
                return match ? match[1] : '';
            }
        }
        WebSocketConnection.Server = WebSocketServer;
    }

    Object.freeze(WebSocketConnection);
    if (isNodeJS) {
        module.exports = WebSocketConnection;
    } else {
        root.WebSocketConnection = WebSocketConnection;
    }
}(globalThis));