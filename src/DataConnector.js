(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const { validateEventPublisher } = isNodeJS ? require('./EventPublisher.js') : { validateEventPublisher: root.validateEventPublisher };
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
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError() is not a function');
            }
            this.onError = value;
        }

        set Receiver(value) {
            if (typeof value !== 'string') {
                throw new Error(`Invalid receiver: ${value}`);
            }
            this.receiver = value;
        }

        handleReceived(data) {
            throw new Error('Not implemented in base class: handleReceived(data)')
        }
    }

    class ClientDataConnector extends BaseDataConnector {
        constructor() {
            super();
            this._callbacks = {};
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
                this.connection.Send(this.receiver, { // TODO: This fails if not connected!
                    type: TransmissionType.SubscriptionRequest,
                    subscribe: this._bufferedSubsciptions.splice(0, this._bufferedSubsciptions.length),
                    unsubscribe: this._bufferedUnsubsciptions.splice(0, this._bufferedUnsubsciptions.length)
                });
            }
        }

        Subscribe(id, onEvent) {
            validateConnection(this.connection);
            if (typeof id !== 'string') {
                throw new Error(`Invalid subscription id: ${id}`);
            } else if (typeof onEvent !== 'function') {
                throw new Error(`Subscriber for subscription id ${id} is not a function`);
            } else if (this._callbacks[id] !== undefined) {
                throw new Error(`Key ${id} is already subscribed`);
            }
            this._callbacks[id] = onEvent;
            if (this._buffering) {
                addId(this._bufferedSubsciptions, id);
                removeId(this._bufferedUnsubsciptions, id);
            } else {
                this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionRequest, subscribe: [id] });
            }
        }

        Unsubscribe(id, onEvent) {
            validateConnection(this.connection);
            if (typeof id !== 'string') {
                throw new Error(`Invalid unsubscription id: ${id}`);
            } else if (typeof onEvent !== 'function') {
                throw new Error(`Subscriber for unsubscription id ${id} is not a function`);
            } else if (this._callbacks[id] === undefined) {
                throw new Error(`Key ${id} is already subscribed`);
            } else if (this._callbacks[id] !== onEvent) {
                throw new Error(`Unexpected onEvent for id ${id} to unsubscribe`);
            }
            delete this._callbacks[id];
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
                                const onEvent = this._callbacks[id];
                                if (onEvent) {
                                    try {
                                        onEvent(value);
                                    } catch (error) {
                                        this.onError(`Failed calling onEvent() for id: ${id}: ${error}`);
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
            this._target = null;
            this._callbacks = {};
        }

        set TargetEventPublisher(value) {
            if (value) {
                validateEventPublisher(value);
                this._target = value;
            } else {
                this._target = null;
            }
        }

        handleReceived(data) {
            try {
                validateEventPublisher(this._target);
                validateConnection(this.connection);
                switch (data.type) {
                    case TransmissionType.SubscriptionRequest:
                        if (data.unsubscribe) {
                            for (const id of data.unsubscribe) {
                                const onEvent = this._callbacks[id];
                                if (onEvent) {
                                    delete this._callbacks[id];
                                    this._target.Unsubscribe(id, onEvent);
                                }
                            }
                        }
                        if (data.subscribe) {
                            for (const id of data.subscribe) {
                                let onEvent = this._callbacks[id];
                                if (!onEvent) {
                                    this._callbacks[id] = onEvent = value => {
                                        // console.log(`Updated id: '${id}', value: ${value}`);
                                        const values = {};
                                        values[id] = value;
                                        this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionResponse, values });
                                    };
                                }
                                this._target.Subscribe(id, onEvent);
                            }
                        }
                        break;
                    case TransmissionType.ReadRequest:
                        /* this._target.Read(data.id, response => {

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
