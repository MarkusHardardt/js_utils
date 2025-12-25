(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const DEFAULT_DATA_CONNECTION_RECEIVER = 'dcr';

    const RequestType = Object.freeze({
        Read: 1,
        Write: 2,
        Subscribe: 3,
        Unsubscribe: 4,
        Notify: 5
    });

    class DataConnectorServer {
        constructor(adapter, receiver) {
            this._adapter = adapter;
            this._receiver = receiver ?? DEFAULT_DATA_CONNECTION_RECEIVER;
            this._connections = {};
        }

        OnOpen(connection) {
            this._connections[connection.SessionId] = { connection, online: true };
            connection.Register(this._receiver, (data, onResponse, onError) => {
                switch (data.type) {
                    case RequestType.Read:
                        // TODO: Remove console.log(`Read(${JSON.stringify(data)})`);
                        this._adapter.Read(data.key, response => onResponse(response), error => onError(error));
                        break;
                    case RequestType.Write:
                        // TODO: Remove console.log(`Write(${JSON.stringify(data)})`);
                        this._adapter.Write(data.key, data.value);
                        break;
                    case RequestType.Subscribe:
                        // TODO: Remove console.log(`Subscribe(${JSON.stringify(data)})`);
                        this._adapter.Subscribe(data.key);
                        break;
                    case RequestType.Unsubscribe:
                        // TODO: Remove console.log(`Unsubscribe(${JSON.stringify(data)})`);
                        this._adapter.Unsubscribe(data.key);
                        break;
                    case RequestType.Notify:
                        console.log(`Notify(${JSON.stringify(data)})`);
                        break;
                }
            });
        }

        OnReopen(connection) {
            const con = this._connections[connection.SessionId];
            if (con) {
                con.online = true;
            }
        }

        OnClose(connection) {
            const con = this._connections[connection.SessionId];
            if (con) {
                con.online = false;
            }
        }

        OnDispose(connection) {
            connection.Unregister(this._receiver);
            delete this._connections[connection.SessionId];
        }

        Read(key, onResponse, onError) {
            // TODO: Implement or remove
        }

        Write(key, value) {
            // TODO: Implement or remove
        }

        Subscribe(key, subscriber) {
            // TODO: Implement or remove
        }

        Unsubscribe(key, subscriber) {
            // TODO: Implement or remove
        }

        Send(values) {
            console.log(`Send to subscribers: ${JSON.stringify(values)}`);
            for (const sessionId in this._connections) {
                if (this._connections.hasOwnProperty(sessionId)) {
                    const con = this._connections[sessionId];
                    if (con && con.online) {
                        con.connection.Send(this._receiver, { type: RequestType.Notify, values: values });
                    }
                }
            }
        }
    }

    class DataConnector {
        constructor(connection, receiver) {
            this._connection = connection;
            this._receiver = receiver ?? DEFAULT_DATA_CONNECTION_RECEIVER;
            this._subscribers = {};
            connection.Register(this._receiver, (data, onResponse, onError) => {
                switch (data.type) {
                    case RequestType.Notify:
                        const subscriber = this._subscribers[data.key];
                        if (subscriber) {
                            subscriber();
                        }
                        break;
                }
            });
        }

        Read(key, onResponse, onError) {
            this._connection.Send(this._receiver, { type: RequestType.Read, key }, onResponse, onError);
        }

        Write(key, value) {
            this._connection.Send(this._receiver, { type: RequestType.Write, key, value });
        }

        Subscribe(key, subscriber) {
            if (typeof key !== 'string') {
                throw new Error(`Invalid subscription key type: ${(typeof key)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for subscription key ${key} is not a function`);
            } else if (this._subscribers[key] !== undefined) {
                throw new Error(`Key ${key} is already subscribed`);
            }
            this._subscribers[key] = subscriber;
            this._connection.Send(this._receiver, { type: RequestType.Subscribe, key });
        }

        Unsubscribe(key, subscriber) {
            if (typeof key !== 'string') {
                throw new Error(`Invalid unsubscription key type: ${(typeof key)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for unsubscription key ${key} is not a function`);
            } else if (this._subscribers[key] === undefined) {
                throw new Error(`Key ${key} is already subscribed`);
            } else if (this._subscribers[key] !== subscriber) {
                throw new Error(`Unexpected subscriber for key ${key} to unsubscribe`);
            }
            delete this._subscribers[key];
            this._connection.Send(this._receiver, { type: RequestType.Unsubscribe, key });
        }
    }

    if (isNodeJS) {
        module.exports = { DataConnectorServer };
    } else {
        root.DataConnector = DataConnector;
    }
}(globalThis));
