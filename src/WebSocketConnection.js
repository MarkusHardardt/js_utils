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
            onOpen(): will be called when socket connection has been established
            onClose(): will be called when socket connection has been lost
            OnError(error): will be called when an error occurred
          }
        A connection has the following public interface:
        - sessionId: The session id
        - IsConnected: true if connected
        - ping(): sends ping to other an waits for response (pong)
        - register(): registers receiver for data
        - unregister(): unregisters receiver for data
        - send(): sends data to receiver on other side an waits optionally for response (pong)    */
    class Connection {
        constructor(logger, sessionId, options) {
            this._logger = Common.validateAsLogger(logger, true);
            this._sessionId = sessionId;
            this._handlers = {};
            this._callbacks = {};
            this._onOpen = () => {
                if (typeof options.onOpen === 'function') {
                    try {
                        options.onOpen();
                    } catch (error) {
                        this._logger.error('Failed calling onOpen()', error);
                    }
                }
            };
            this._onClose = () => {
                if (typeof options.onClose === 'function') {
                    try {
                        options.onClose();
                    } catch (error) {
                        this._logger.error('Failed calling onClose()', error);
                    }
                }
            };
            this._nextId = Core.createIdGenerator('#');
            this._remoteMediumUTC = 0;
            this._remoteToLocalOffsetMillis = 0;
            Common.validateAsConnection(this, true);
        }

        get sessionId() {
            return this._sessionId;
        }

        get isConnected() {
            return false;
        }

        get _webSocket() {
            return null;
        }

        ping(onResponse, onError) {
            if (this.isConnected) {
                const telegram = { type: TelegramType.PingRequest };
                this._callbacks[telegram.callback = this._nextId()] = { localRequestUTC: Date.now(), onResponse, onError };
                this._webSocket.send(JSON.stringify(telegram));
            } else {
                throw new Error('Connection.ping(): cannot send ping request when disconnected!');
            }
        }

        #handlePingRequest(callback) {
            if (this.isConnected) {
                this._webSocket.send(JSON.stringify({ type: TelegramType.PingResponse, callback, utc: Date.now() }));
            } else {
                this._logger.error('Cannot send ping reponse when disconnected');
            }
        }

        #handlePingResponse(callback, remoteMediumUTC) {
            this._remoteMediumUTC = remoteMediumUTC;
            const cb = this._callbacks[callback];
            if (cb) {
                delete this._callbacks[callback];
                /*  Note:
                    cb.localRequestUTC: This is the local time when the request was sent.
                    localResponseUTC: This is the local time when the request was received.
                    localMediumUTC: Assuming that sending and receiving take approximately the same amount of time, the local time in between is calculated here.
                    remoteMediumUTC: This is the time of the other participant at the moment when answered the request.
                    remoteToLocalOffsetMillis: This is the offset between both times.
                */
                const localResponseUTC = Date.now();
                const localMediumUTC = (localResponseUTC + cb.localRequestUTC) / 2;
                this._remoteToLocalOffsetMillis = remoteMediumUTC - localMediumUTC;
                try {
                    if (cb.onResponse) {
                        cb.onResponse(localResponseUTC - cb.localRequestUTC);
                    }
                } catch (error) {
                    this._logger.error('Failed calling onResponse()', error);
                }
            } else {
                this._logger.error('Missing ping callback');
            }
        }

        get remoteUTC() {
            const now = Date.now();
            return this._remoteToLocalOffsetMillis !== 0 ? Math.ceil(now + this._remoteToLocalOffsetMillis) : now;
        }

        register(receiver, handler) {
            if (typeof receiver !== 'string') {
                throw new Error('Connection.register(receiver, handler): receiver must be a string!');
            } else if (typeof handler !== 'function') {
                throw new Error('Connection.register(receiver, handler): handler must be a function!');
            } else if (this._handlers[receiver]) {
                throw new Error(`Connection.register(receiver, handler): handler "${receiver}" already registered!`);
            } else {
                this._handlers[receiver] = handler;
            }
        }

        unregister(receiver) {
            if (typeof receiver !== 'string') {
                throw new Error('Connection.unregister(receiver): receiver must be a string!');
            } else if (this._handlers[receiver] === undefined) {
                throw new Error(`Connection.unregister(receiver): "${receiver}" not registered!`);
            } else {
                delete this._handlers[receiver];
            }
        }

        send(receiver, data, onResponse, onError) {
            if (this.isConnected) {
                const telegram = { type: TelegramType.DataRequest, receiver, data };
                if (typeof onResponse === 'function' || typeof onError === 'function') {
                    this._callbacks[telegram.callback = this._nextId()] = { localRequestUTC: Date.now(), onResponse, onError };
                }
                this._webSocket.send(JSON.stringify(telegram));
                return true;
            } else {
                throw new Error('Connection.send(): cannot send data request when disconnected!');
            }
        }

        #handleDataRequest(callback, requestData, receiver) {
            const handler = this._handlers[receiver];
            if (handler) {
                if (callback !== undefined) {
                    try {
                        handler(requestData, responseData => {
                            if (this.isConnected) {
                                this._webSocket.send(JSON.stringify({ type: TelegramType.DataResponse, callback, data: responseData }));
                            } else {
                                this._logger.error('Cannot send data response when disconnected');
                            }
                        }, error => {
                            if (this.isConnected) {
                                this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: error ? error : true }));
                            } else {
                                this._logger.error(`Cannot send error response when disconnected (error: ${error})`);
                            }
                        });
                    } catch (error) {
                        if (this.isConnected) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `failed calling receive handler '${receiver}'! error: ${error.message}` }));
                        } else {
                            this._logger.error(`Failed calling receive handler '${receiver}' but cannot send error response when disconnected! error: ${error.message}`);
                        }
                    }
                }
                else {
                    try {
                        handler(requestData);
                    } catch (error) {
                        if (this.isConnected) {
                            this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, error: `failed calling receive handler '${receiver}'! error: ${error.message}` }));
                        } else {
                            this._logger.error(`Failed calling receive handler '${receiver}' but cannot send error response when disconnected`, error);
                        }
                    }
                }
            } else {
                if (this.isConnected) {
                    this._webSocket.send(JSON.stringify({ type: TelegramType.ErrorResponse, callback, error: `unknown receiver: '${receiver}'` }));
                } else {
                    this._logger.error(`Cannot send error response for unknown receiver: '${receiver}' when disconnected`);
                }
            }
        }

        #handleDataResponse(callback, data) {
            const cb = this._callbacks[callback];
            if (cb) {
                delete this._callbacks[callback];
                try {
                    if (cb.onResponse) {
                        cb.onResponse(data, Date.now() - cb.localRequestUTC);
                    }
                } catch (error) {
                    this._logger.error('Failed calling onResponse()', error);
                }
            } else {
                this._logger.error('Missing data callback');
            }
        }

        #handleError(callback, error) {
            const cb = callback !== undefined ? this._callbacks[callback] : false;
            if (cb) {
                delete this._callbacks[callback];
                if (cb.onError) {
                    try {
                        cb.onError(error, Date.now() - cb.localRequestUTC);
                    } catch (error) {
                        this._logger.error('Failed calling onError()', error);
                    }
                } else {
                    this._logger.error(error);
                }
            } else {
                this._logger.error(error);
            }
        }

        _handleTelegram(telegram) {
            switch (telegram.type) {
                case TelegramType.PingRequest:
                    this.#handlePingRequest(telegram.callback);
                    break;
                case TelegramType.PingResponse:
                    this.#handlePingResponse(telegram.callback, telegram.utc);
                    break;
                case TelegramType.DataRequest:
                    this.#handleDataRequest(telegram.callback, telegram.data, telegram.receiver);
                    break;
                case TelegramType.DataResponse:
                    this.#handleDataResponse(telegram.callback, telegram.data);
                    break;
                case TelegramType.ErrorResponse:
                    this.#handleError(telegram.callback, telegram.error);
                    break;
                default:
                    this._logger.error(`Received invalid telegram type: ${telegram.type}`);
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
                onOpen(): will be called when socket connection has been established
                onClose(): will be called when socket connection has been lost
                OnError(error): will be called when an error occurred
              }
            A client connection has the following public interface:
            - Start(): triggers connection attempts
            - Stop(): triggers disconnection
            read comment for Connection for more properties and methods.    */
        class WebSocketClientConnection extends Connection {
            #url;
            #socket;
            #heartbeatInterval;
            #heartbeatTimeout;
            #reconnectStart;
            #reconnectMax;
            #heartbeatTimer;
            #heartbeatTimeoutTimer;
            #state;
            #retryDelay;
            constructor(logger, hostname, config, options = {}) {
                super(logger, config.sessionId, options);
                this.#url = `${(config.secure ? 'wss' : 'ws')}://${hostname}:${config.port}?sessionId=${config.sessionId}`;
                this.#socket = null;
                this.#heartbeatInterval = options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL;
                this.#heartbeatTimeout = options.heartbeatTimeout ?? DEFAULT_HEARTBEAT_TIMEOUT;
                this.#reconnectStart = options.reconnectStart ?? DEFAULT_RECONNECT_START_INTERVAL;
                this.#reconnectMax = options.reconnectMax ?? DEFAULT_RECONNECT_MAX_INTERVAL;
                this.#heartbeatTimer = null;
                this.#heartbeatTimeoutTimer = null;
                this.#transition(config.autoConnect === true ? ClientState.Connecting : ClientState.Idle);
            }

            get isConnected() {
                return this.#state === ClientState.Online;
            }

            get _webSocket() {
                return this.#socket;
            }

            start() {
                if (this.#state === ClientState.Idle) {
                    this.#transition(ClientState.Connecting);
                }
            }

            stop() {
                if (this.#state !== ClientState.Idle) {
                    this.#transition(ClientState.Idle);
                    if (this.#socket) {
                        this.#socket.close();
                        this._onClose();
                    }
                }
            }

            #transition(state) {
                this.#state = state;
                switch (state) {
                    case ClientState.Idle:
                        this.#stopHeartbeatMonitoring();
                        break;

                    case ClientState.Connecting:
                    case ClientState.Reconnecting:
                        this.#connect();
                        break;

                    case ClientState.Online:
                        this.#startHeartbeatMonitoring();
                        this.#retryDelay = this.#reconnectStart;
                        this._onOpen();
                        break;

                    case ClientState.Disconnected:
                        this.#stopHeartbeatMonitoring();
                        this.#scheduleReconnect();
                        this._onClose();
                        break;
                }
            }

            #connect() {
                if (this.#socket) {
                    // If connected before we remove all event handlers
                    this.#socket.onopen = this.#socket.onmessage = this.#socket.onerror = this.#socket.onclose = null;
                }
                this.#socket = new WebSocket(this.#url);
                this.#socket.onopen = () => this.#transition(ClientState.Online);
                this.#socket.onmessage = message => this._handleTelegram(JSON.parse(message.data));
                this.#socket.onerror = error => {
                    this.#socket.close();
                    this._logger.error(error);
                };
                this.#socket.onclose = () => {
                    if (this.#state !== ClientState.Idle) {
                        this.#transition(ClientState.Disconnected);
                    }
                };
            }

            #startHeartbeatMonitoring() {
                this.#heartbeatTimer = setInterval(() => {
                    if (this.#state === ClientState.Online) {
                        this.ping(millis => {
                            clearTimeout(this.#heartbeatTimeoutTimer);
                        }, error => {
                            this._logger.error('Heartbeat monitoring failed', error);
                        });
                        this.#heartbeatTimeoutTimer = setTimeout(() => {
                            this._logger.error('Heartbeat monitoring timeout expired -> close socket');
                            this.#socket.close();
                        }, this.#heartbeatTimeout);
                    }
                }, this.#heartbeatInterval);
            }

            #stopHeartbeatMonitoring() {
                clearInterval(this.#heartbeatTimer);
                clearTimeout(this.#heartbeatTimeoutTimer);
            }

            #scheduleReconnect() {
                setTimeout(() => {
                    if (this.#state === ClientState.Disconnected) {
                        this.#transition(ClientState.Reconnecting);
                    }
                }, this.#retryDelay);
                this.#retryDelay = Math.min(
                    this.#retryDelay * 2,
                    this.#reconnectMax
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
                onOpen(): will be called when socket connection has been established
                onClose(): will be called when socket connection has been lost
                OnError(error): will be called when an error occurred
              }
            read comment for Connection for more properties and methods.    */
        class WebSocketServerConnection extends Connection {
            #socket;
            #online;
            constructor(logger, sessionId, options) {
                super(logger, sessionId, options);
                this.#socket = null;
                this.#online = false;
            }

            get isConnected() {
                return this.#online;
            }

            get _webSocket() {
                return this.#socket;
            }

            setAlreadyConnectedAndOpenSocket(socket) {
                if (this.#socket) {
                    // If connected before we remove all event handlers
                    this.#socket.onopen = this.#socket.onmessage = this.#socket.onerror = this.#socket.onclose = null;
                }
                this.#socket = socket;
                this.#socket.onmessage = message => this._handleTelegram(JSON.parse(message.data));
                this.#socket.onerror = error => {
                    this.#online = false;
                    this.#socket.close();
                    this._logger.error(error);
                };
                this.#socket.onclose = () => {
                    this.#online = false;
                    this._onClose();
                };
                // Note:
                // Since this method is called with an already connected and open socket, it is not possible to react to 'socket.onopen' because it is no longer triggered.
                // Instead, the online status is set directly and the 'onOpen' method is triggered manually.
                this.#online = true;
                this._onOpen(this);
            }
        }

        const DEFAULT_CLOSED_CONNECTION_DISPOSE_TIMEOUT = 60000;

        /*  The WebSocketServer constructor requires the following arguments:
            - port: the port for the socket server
            - options: {
                closedConnectionDisposeTimeout: timeout before a closed connection is disposed [ms]
                onOpen(connection): will be called when socket connection has been established the first time
                onReopen(connection): will be called when socket connection has been established again
                onClose(connection): will be called when socket connection has been lost
                onDispose(connection): will be called when socket connection has been lost and not established again before the timeout has expired
                onError(connection, error): will be called when an error occurred
              }   
            A server has the following public interface:    
            - CreateSessionConfig(): returns a configuration object containing the port and a new unique session id    */
        class WebSocketServer {
            #logger;
            #port;
            #options;
            #instances;
            #server;
            constructor(logger, port, options = {}) {
                this.#logger = Common.validateAsLogger(logger, true);
                this.#port = port;
                this.#options = options;
                this.#instances = {};
                this.#server = new WebSocket.Server({ port });
                this.#server.on('connection', (socket, request) => {
                    const sessionId = this.#getSessionIdFromURL(request.url);
                    let instance = this.#instances[sessionId];
                    const isUTC = typeof instance === 'number'; // If UTC from creation we know that the id came from here (see below)
                    const createdUTC = isUTC ? instance : undefined;
                    if (isUTC || instance === undefined) {
                        this.#instances[sessionId] = instance = {};
                        if (isUTC) {
                            instance.createdUTC = createdUTC;
                        } else {
                            this.#logger.warn(`Web socket connected with unknown session id: '${formatSesionId(sessionId)}'`)
                        }
                        instance.connection = new WebSocketServerConnection(logger, sessionId, {
                            onOpen: () => {
                                const isFirstOpen = instance.openedUTC === undefined;
                                instance.openedUTC = Date.now();
                                if (isFirstOpen) {
                                    if (typeof options.onOpen === 'function') {
                                        try {
                                            options.onOpen(instance.connection);
                                        } catch (error) {
                                            this.#logger.error('Failed calling onOpen()', error);
                                        }
                                    } else {
                                        this.#logger.info(`Connection opened with session id: '${formatSesionId(sessionId)}'`);
                                    }
                                } else {
                                    clearTimeout(instance.disposeTimeoutTimer);
                                    if (typeof options.onReopen === 'function') {
                                        try {
                                            options.onReopen(instance.connection);
                                        } catch (error) {
                                            this.#logger.error('Failed calling OnReopen()', error);
                                        }
                                    } else {
                                        this.#logger.info(`Connection reopened with session id: '${formatSesionId(sessionId)}'`);
                                    }
                                }
                            },
                            onClose: () => {
                                instance.closedUTC = Date.now();
                                if (typeof options.onClose === 'function') {
                                    try {
                                        options.onClose(instance.connection);
                                    } catch (error) {
                                        this.#logger.error('Failed calling onClose()', error);
                                    }
                                } else {
                                    this.#logger.info(`Connection closed with session id: '${formatSesionId(sessionId)}'`);
                                }
                                instance.disposeTimeoutTimer = setTimeout(() => {
                                    delete this.#instances[sessionId];
                                    if (typeof options.onDispose === 'function') {
                                        try {
                                            options.onDispose(instance.connection);
                                        } catch (error) {
                                            this.#logger.error('Failed calling OnDispose()', error);
                                        }
                                    } else {
                                        this.#logger.info(`Connection diposed with session id: '${formatSesionId(sessionId)}'`);
                                    }
                                }, options.closedConnectionDisposeTimeout ?? DEFAULT_CLOSED_CONNECTION_DISPOSE_TIMEOUT);
                            },
                            onError: error => {
                                if (typeof options.onError === 'function') {
                                    try {
                                        options.onError(instance.connection, error);
                                    } catch (error) {
                                        this.#logger.error('Failed calling OnError()', error);
                                    }
                                } else {
                                    this.#logger.error(`Error in connection with session id: '${formatSesionId(sessionId)}': ${error}`);
                                }
                            }
                        });
                    }
                    instance.connection.setAlreadyConnectedAndOpenSocket(socket);
                });
            }

            createSessionConfig() {
                const sessionId = this.#createUniqueSessionId();
                this.#instances[sessionId] = Date.now(); // By storing the current UTC we know on connect that the id came from here (see above)
                return {
                    sessionId,
                    port: this.#port,
                    secure: this.#options.secure === true,
                    autoConnect: this.#options.autoConnect === true
                };
            }

            // Returns a 64-character hexadecimal string, which should be fairly likely to be unique by using the current time and random values. 
            #createUniqueSessionId() {
                return Server.createSHA256(`#${Math.E * Math.random()}&${Date.now()}%${Math.PI * Math.random()}@`);
            }

            // Extracts the session ID generated by the above function from the URL.
            #getSessionIdFromURL(url) {
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