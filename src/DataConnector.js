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

    const TransmissionType = Object.freeze({
        SubscriptionRequest: 1,
        SubscriptionResponse: 2,
        ReadRequest: 3,
        ReadResponse: 4,
        WriteRequest: 5
    });

    class BaseDataConnector {
        constructor() {
            this.connection = null;
            this.onError = defaultOnError;
            this.receiver = DEFAULT_DATA_CONNECTION_RECEIVER;
            this._handler = data => this.handleReceived(data);
        }

        set Connection(value) {
            if (value) {
                if (this.connection) {
                    this.connection.Unregister(this.receiver);
                    this.connection = null;
                }
                validateConnection(value);
                this.connection = value;
                this.connection.Register(this.receiver, this._handler);
            } else if (this.connection) {
                this.connection.Unregister(this.receiver);
                this.connection = null;
            }
        }

        set OnError(value) {
            if (typeof value === 'function') {
                this.onError = value;
            } else {
                throw new Error('Set value for OnError() is not a function');
            }
        }

        set Receiver(value) {
            if (typeof value !== 'string') {
                throw new Error(`Invalid receiver: ${value}`);
            }
            this.receiver = value;
        }

        handleReceived(data) { }
    }

    class ClientDataConnector extends BaseDataConnector {
        constructor() {
            super();
            this._subscribers = {};
            this._bufferedSubsciptions = [];
            this._bufferedUnsubsciptions = [];
            this._buffering = false;
        }

        set Buffering(value) {
            if (value === true) {
                this._buffering = true;
            } else if (this._buffering) {
                this._buffering = false;
                const ids = [];
                validateConnection(this.connection);
                this.connection.Send(this.receiver, {
                    type: TransmissionType.SubscriptionRequest,
                    subscribe: this._bufferedSubsciptions.splice(0, this._bufferedSubsciptions.length),
                    unsubscribe: this._bufferedUnsubsciptions.splice(0, this._bufferedUnsubsciptions.length)
                });
            }
        }

        Subscribe(id, subscriber) {
            validateConnection(this.connection);
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
                this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionRequest, subscribe: [id] });
            }
        }

        Unsubscribe(id, subscriber) {
            validateConnection(this.connection);
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
                this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionRequest, unsubscribe: [id] });
            }
        }

        Read(id, onResponse, onError) {
            validateConnection(this.connection);
            this.connection.Send(this.receiver, { type: TransmissionType.ReadRequest, id }, onResponse, onError);
        }

        Write(id, value) {
            validateConnection(this.connection);
            this.connection.Send(this.receiver, { type: TransmissionType.WriteRequest, id, value });
        }

        handleReceived(data) {
            try {
                switch (data.type) {
                    case TransmissionType.SubscriptionResponse:
                        for (const id in data.values) {
                            if (data.values.hasOwnProperty(id)) {
                                const value = data.values[id];
                                const subscriber = this._subscribers[id];
                                if (subscriber) {
                                    try {
                                        subscriber(value);
                                    } catch (error) {
                                        this.onError(`Failed notifying subscriber for id: ${id}: ${error}`);
                                    }
                                }
                            }
                        }
                        break;
                    case TransmissionType.ReadResponse:
                        // TODO: Implement
                        break;
                    default:
                        throw new Error(`Invalid transmission type: ${data.type}`);
                }
            } catch (error) {

            }
        }
    }

    class ServerDataConnector extends BaseDataConnector {
        constructor() {
            super();
            this._broker = null;
            this._subscribers = {};
        }

        set Broker(value) {
            if (value) {
                validateDataBroker(value);
                this._broker = value;
            } else {
                this._broker = null;
            }
        }

        handleReceived(data) {
            try {
                validateDataBroker(this._broker);
                validateConnection(this.connection);
                switch (data.type) {
                    case TransmissionType.SubscriptionRequest:
                        if (data.unsubscribe) {
                            for (const id of data.unsubscribe) {
                                const subscriber = this._subscribers[id];
                                if (subscriber) {
                                    delete this._subscribers[id];
                                    this._broker.Unsubscribe(id, subscriber);
                                }
                            }
                        }
                        if (data.subscribe) {
                            for (const id of data.subscribe) {
                                let subscriber = this._subscribers[id];
                                if (!subscriber) {
                                    this._subscribers[id] = subscriber = value => { 
                                        // console.log(`Updated id: '${id}', value: ${value}`);
                                        const values = {};
                                        values[id] = value;
                                        this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionResponse, values });
                                    };
                                }
                                this._broker.Subscribe(id, subscriber);
                            }
                        }
                        break;
                    case TransmissionType.ReadRequest:
                        /* this._broker.Read(data.id, response => {

                        }, error => {

                        });
                        break; */
                        throw new Error('Read request not yetimplemented');

                    case TransmissionType.WriteRequest:
                        // break;
                        throw new Error('Write request not yetimplemented');
                    default:
                        throw new Error(`Invalid transmission type: ${data.type}`);
                }
            } catch (error) {
                this.onError(`Failed handling received data: ${error}'`);
            }
        }
    }

    if (isNodeJS) {
        module.exports = { ServerDataConnector };
    } else {
        root.ClientDataConnector = ClientDataConnector;
    }
}(globalThis));
