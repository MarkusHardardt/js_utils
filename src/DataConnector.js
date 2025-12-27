(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const { validateEventPublisher } = isNodeJS ? require('./EventPublisher.js') : { validateEventPublisher: root.validateEventPublisher };
    const { validateConnection } = isNodeJS ? require('./WebSocketConnection.js') : { validateConnection: root.validateConnection };

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
    function invert(source) {
        const target = {};
        for (const s in source) {
            if (source.hasOwnProperty(s)) {
                target[source[s]] = s;
            }
        }
        return target;
    }

    const DEFAULT_DATA_CONNECTION_RECEIVER = 'dcr';

    const defaultOnError = error => console.error(error);

    const TransmissionType = Object.freeze({
        Con2IdRequest: 1,
        SubscriptionRequest: 3,
        SubscriptionResponse: 4,
        ReadRequest: 5,
        WriteRequest: 6
    });

    class BaseDataConnector {
        constructor() {
            this.connection = null;
            this.onError = defaultOnError;
            this.receiver = DEFAULT_DATA_CONNECTION_RECEIVER;
            this._handler = (data, onResponse, onError) => this.handleReceived(data, onResponse, onError);
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

        handleReceived(data, onResponse, onError) {
            throw new Error('Not implemented in base class: handleReceived(data, onResponse, onError)')
        }
    }

    const idPrefix = '#';
    const conRegex = /#[a-z0-9]+\b/g;

    function validateClientDataConnector(instance, checkMethodArguments) {
        Common.validateInterface('ClientDataConnector', instance, [
            'OnOpen()',
            'OnClose()'
        ], checkMethodArguments);
    }

    class ClientDataConnector extends BaseDataConnector {
        constructor() {
            super();
            validateClientDataConnector(this, true);
            validateEventPublisher(this, true);
            this._callbacks = {};
            this._bufferedSubsciptions = [];
            this._bufferedUnsubsciptions = [];
            this._con2Id = null;
            this._id2Con = null;
            this._subscribtionDelay = false;
            this._subscribtionDelayTimer = null;
        }

        set SubscribtionDelay(value) {
            this._subscribtionDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        OnOpen() {
            console.log('ClientDataConnector.OnOpen()');
            validateConnection(this.connection);
            this.connection.Send(this.receiver, { type: TransmissionType.Con2IdRequest }, con2Id => {
                this._con2Id = con2Id;
                this._id2Con = invert(con2Id);
            }, error => this.onError(error));
        }

        OnClose() {
            console.log('ClientDataConnector.OnClose()');
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
            this._subscriptionsChanged();
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
            this._subscriptionsChanged();
        }

        Read(id, onResponse, onError) {
            validateConnection(this.connection);
            this.connection.Send(this.receiver, { type: TransmissionType.ReadRequest, id }, onResponse, onError);
        }

        Write(id, value) {
            validateConnection(this.connection);
            this.connection.Send(this.receiver, { type: TransmissionType.WriteRequest, id, value });
        }

        handleReceived(data, onResponse, onError) {
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
                    default:
                        throw new Error(`Invalid transmission type: ${data.type}`);
                }
            } catch (error) {
                this.onError(`Failed handleReceived(): ${error}`);
            }
        }

        _subscriptionsChanged() {
            if (this._subscribtionDelay && !this._subscribtionDelayTimer) {
                this._subscribtionDelayTimer = setTimeout(() => {
                    this._sendSubscriptionRequest();
                    this._subscribtionDelayTimer = null;
                }, this._subscribtionDelay);
            } else {
                this._sendSubscriptionRequest();
            }
        }

        _sendSubscriptionRequest() {
            validateConnection(this.connection);
            if (!this._id2Con) {
                throw new Error('Not available: this._id2Con');
            }
            let subs = '';
            for (const id in this._callbacks) {
                if (this._callbacks.hasOwnProperty(id)) {
                    const con = this._id2Con[id];
                    if (!con) {
                        throw new Error(`Unknown id: ${id}`);
                    }
                    subs += con;
                }
            }
            this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionRequest, subs });
        }
    }

    function validateServerDataConnector(instance, checkMethodArguments) {
        Common.validateInterface('ServerDataConnector', instance, [
            'OnOpen()',
            'OnReopen()',
            'OnClose()',
            'OnDispose()'
        ], checkMethodArguments);
    }

    class ServerDataConnector extends BaseDataConnector {
        constructor() {
            super();
            validateServerDataConnector(this, true);
            this._parent = null;
            this._callbacks = {};
            this._con2Id = null;
            this._id2Con = null;
            this._online = false;
        }

        set Parent(value) {
            if (value) {
                validateEventPublisher(value, true);
                this._parent = value;
            } else {
                this._parent = null;
            }
        }

        SetIds(ids) {
            if (!Array.isArray(ids)) {
                throw new Error(`Ids must be passed as an array of strings: ${ids}`);
            }
            const sorted = [];
            for (const id of ids) {
                addId(sorted, id);
            }
            this._con2Id = {};
            const nextId = Common.idGenerator(idPrefix);
            for (const id of sorted) {
                this._con2Id[nextId()] = id;
            }
            this._id2Con = invert(this._con2Id);
        }

        OnOpen() {
            this._online = true;
        }

        OnReopen() {
            this._online = true;
        }

        OnClose() {
            this._online = false;
            this._updateSubscriptions('');
        }

        OnDispose() {
            this._online = false;
            this._updateSubscriptions('');
        }

        handleReceived(data, onResponse, onError) {
            try {
                validateEventPublisher(this._parent);
                validateConnection(this.connection);
                switch (data.type) {
                    case TransmissionType.Con2IdRequest:
                        if (this._con2Id) {
                            onResponse(this._con2Id);
                        }
                        else {
                            onError('No ids available');
                        }
                        break;
                    case TransmissionType.SubscriptionRequest:
                        this._updateSubscriptions(data.subs);
                        break;
                    case TransmissionType.ReadRequest:
                        this._parent.Read(data.id, onResponse, onError);
                        break;
                    case TransmissionType.WriteRequest:
                        this._parent.Write(data.id, data.value);
                        break;
                    default:
                        throw new Error(`Invalid transmission type: ${data.type}`);
                }
            } catch (error) {
                this.onError(`Failed handling received data: ${error}'`);
            }
        }

        _updateSubscriptions(subCons) {
            try {
                validateEventPublisher(this._parent);
                if (this._con2Id && this._id2Con) {
                    for (const id in this._callbacks) {
                        if (this._callbacks.hasOwnProperty(id)) {
                            const con = this._id2Con[id];
                            const onEvent = subCons.indexOf(con) < 0 ? this._callbacks[id] : false;
                            if (onEvent) {
                                delete this._callbacks[id];
                                this._parent.Unsubscribe(id, onEvent);
                            }
                        }
                    }
                    Regex.each(conRegex, subCons, (start, end, match) => {
                        const id = this._con2Id[match[0]];
                        if (id) {
                            if (!this._callbacks[id]) {
                                const onEvent = value => {
                                    // console.log(`Updated id: '${id}', value: ${value}`);
                                    const values = {};
                                    values[id] = value;
                                    this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionResponse, values });
                                };
                                this._callbacks[id] = onEvent;
                                this._parent.Subscribe(id, onEvent);
                            }
                        }
                        else {
                            this.onError(`Cannot subscribe: ${match[0]}`);
                        }
                    }, true);
                }
                else {
                    this.onError('No ids available');
                }
            } catch (error) {
                this.onError(`Failed updating subscriptions: ${error}'`);
            }
        }
    }

    if (isNodeJS) {
        module.exports = { ServerDataConnector, validateServerDataConnector };
    } else {
        root.ClientDataConnector = ClientDataConnector;
        root.validateClientDataConnector = validateClientDataConnector;
    }
}(globalThis));
