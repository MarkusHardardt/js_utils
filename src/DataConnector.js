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
                        this._adapter.Read(data.id, response => onResponse(response), error => onError(error));
                        break;
                    case RequestType.Write:
                        // TODO: Remove console.log(`Write(${JSON.stringify(data)})`);
                        this._adapter.Write(data.id, data.value);
                        break;
                    case RequestType.Subscribe:
                        // TODO: Remove console.log(`Subscribe(${JSON.stringify(data)})`);
                        // TODO: Das funktioniert nicht bei mehrenen Browsern! Muss da nicht wieder ein DataNode verwendet werden, der mehrere subscribers behandeln kann und zudem zeitverzögert unsubscribed?
                        this._adapter.Subscribe(data.id);
                        break;
                    case RequestType.Unsubscribe:
                        // TODO: Remove console.log(`Unsubscribe(${JSON.stringify(data)})`);
                        this._adapter.Unsubscribe(data.id);
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

        Read(id, onResponse, onError) {
            // TODO: Implement or remove
        }

        Write(id, value) {
            // TODO: Implement or remove
        }

        Subscribe(id, subscriber) {
            // TODO: Implement or remove
        }

        Unsubscribe(id, subscriber) {
            // TODO: Implement or remove
        }

        Send(values) {
            // TODO: Remove console.log(`Send to subscribers: ${JSON.stringify(values)}`);
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
                        for (const nodeId in data.values) {
                            if (data.values.hasOwnProperty(nodeId)) {
                                const value = data.values[nodeId];
                                const subscriber = this._subscribers[nodeId];
                                if (subscriber) {
                                    subscriber(value);
                                }
                            }
                        }
                        break;
                }
            });
        }

        Read(id, onResponse, onError) {
            this._connection.Send(this._receiver, { type: RequestType.Read, id }, onResponse, onError);
        }

        Write(id, value) {
            this._connection.Send(this._receiver, { type: RequestType.Write, id, value });
        }

        Subscribe(id, subscriber) {
            if (typeof id !== 'string') {
                throw new Error(`Invalid subscription id type: ${(typeof id)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for subscription id ${id} is not a function`);
            } else if (this._subscribers[id] !== undefined) {
                throw new Error(`Key ${id} is already subscribed`);
            }
            this._subscribers[id] = subscriber;
            this._connection.Send(this._receiver, { type: RequestType.Subscribe, id });
        }

        Unsubscribe(id, subscriber) {
            if (typeof id !== 'string') {
                throw new Error(`Invalid unsubscription id type: ${(typeof id)}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for unsubscription id ${id} is not a function`);
            } else if (this._subscribers[id] === undefined) {
                throw new Error(`Key ${id} is already subscribed`);
            } else if (this._subscribers[id] !== subscriber) {
                throw new Error(`Unexpected subscriber for id ${id} to unsubscribe`);
            }
            delete this._subscribers[id];
            this._connection.Send(this._receiver, { type: RequestType.Unsubscribe, id });
        }
    }

    if (isNodeJS) {
        module.exports = { DataConnectorServer };
    } else {
        root.DataConnector = DataConnector;
    }
}(globalThis));
