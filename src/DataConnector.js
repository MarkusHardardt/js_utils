(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const { validateDataBroker } = isNodeJS ? require('./DataBroker.js') : { validateDataBroker: root.validateDataBroker }; // TODO: Required?
    const { validateConnection } = isNodeJS ? require('./WebSocketConnection.js') : { validateConnection: root.validateConnection };
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;

    const compareTextsAndNumbers = Sorting.getTextsAndNumbersCompareFunction(true, false, true);
    function addId(ids, id) {
        let idx = Sorting.getInsertionIndex(id, ids, true, compareTextsAndNumbers);
        if (idx >= 0) {
            ids.splice(idx, 0, id);
        }
    };
    function removeId(ids, id) {
        let idx = Sorting.getIndexOfFirstEqual(id, ids, compareTextsAndNumbers);
        if (idx >= 0) {
            ids.splice(idx, 1);
        }
    };

    const DEFAULT_DATA_CONNECTION_RECEIVER = 'dcr';

    const defaultOnError = error => console.error(error);

    const RequestType = Object.freeze({
        SubscriptionRequest: 1,
        SubscriptionResponse: 2,
        Read: 3,
        Write: 4,
        Subscribe: 14, // TODO: Required?
        Unsubscribe: 15, // TODO: Required?
        Notify: 16 // TODO: Required?
    });

    class ClientDataConnector {
        constructor() {
            this._connection = null;
            this._onError = defaultOnError;
            this._subscribers = {};
            this._bufferedSubsciptions = [];
            this._bufferedUnsubsciptions = [];
            this._buffering = false;
            this._receiver = DEFAULT_DATA_CONNECTION_RECEIVER;
            this._handler = data => this._handleReceived(data);
        }

        set Connection(value) {
            if (value) {
                if (this._connection) {
                    this._connection.Unregister(this._receiver);
                    this._connection = null;
                }
                validateConnection(value);
                this._connection = value;
                this._connection.Register(this._receiver, this._handler);
            } else if (this._connection) {
                this._connection.Unregister(this._receiver);
                this._connection = null;
            }
        }

        set OnError(value) {
            if (typeof value === 'function') {
                this._onError = value;
            } else {
                throw new Error('Set value for OnError() is not a function');
            }
        }

        set Receiver(value) {
            if (typeof value !== 'string') {
                throw new Error(`Invalid receiver: ${value}`);
            }
            this._receiver = value;
        }

        set Buffering(value) {
            if (value === true) {
                this._buffering = true;
            } else if (this._buffering) {
                this._buffering = false;
                const ids = [];
                validateConnection(this._connection);
                this._connection.Send(this._receiver, {
                    type: RequestType.SubscriptionRequest,
                    subscribe: this._bufferedSubsciptions.splice(0, this._bufferedSubsciptions.length),
                    unsubscribe: this._bufferedUnsubsciptions.splice(0, this._bufferedUnsubsciptions.length)
                });
            }
        }

        Subscribe(id, subscriber) {
            validateConnection(this._connection);
            if (typeof id !== 'string') {
                throw new Error(`Invalid subscription id: ${id}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for subscription id ${id} is not a function`);
            } else if (this._subscribers[id] !== undefined) {
                throw new Error(`Key ${id} is already subscribed`);
            }
            this._subscribers[id] = subscriber;
            if (this._buffering) {
                addId(this._bufferedSubsciptions, id);
                removeId(this._bufferedUnsubsciptions, id);
            } else {
                this._connection.Send(this._receiver, { type: RequestType.SubscriptionRequest, subscribe: [id] });
            }
        }

        Unsubscribe(id, subscriber) {
            validateConnection(this._connection);
            if (typeof id !== 'string') {
                throw new Error(`Invalid unsubscription id: ${id}`);
            } else if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for unsubscription id ${id} is not a function`);
            } else if (this._subscribers[id] === undefined) {
                throw new Error(`Key ${id} is already subscribed`);
            } else if (this._subscribers[id] !== subscriber) {
                throw new Error(`Unexpected subscriber for id ${id} to unsubscribe`);
            }
            delete this._subscribers[id];
            if (this._buffering) {
                addId(this._bufferedUnsubsciptions, id);
                removeId(this._bufferedSubsciptions, id);
            } else {
                this._connection.Send(this._receiver, { type: RequestType.SubscriptionRequest, unsubscribe: [id] });
            }
        }

        Read(id, onResponse, onError) {
            validateConnection(this._connection);
            this._connection.Send(this._receiver, { type: RequestType.Read, id }, onResponse, onError);
        }

        Write(id, value) {
            validateConnection(this._connection);
            this._connection.Send(this._receiver, { type: RequestType.Write, id, value });
        }

        _handleReceived(data) {
            switch (data.type) {
                case RequestType.SubscriptionResponse:
                    for (const id in data.values) {
                        if (data.values.hasOwnProperty(id)) {
                            const value = data.values[id];
                            const subscriber = this._subscribers[id];
                            if (subscriber) {
                                try {
                                    subscriber(value);
                                } catch (error) {
                                    this._onError(`Failed notifying subscriber for id: ${id}: ${error}`);
                                }
                            }
                        }
                    }
                    break;
            }
        }
    }

    class DataConnector { // TODO: Reuse or remove
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

    if (isNodeJS) {
        module.exports = { DataConnectorServer };
    } else {
        root.ClientDataConnector = ClientDataConnector;
        root.DataConnector = DataConnector;
    }
}(globalThis));
