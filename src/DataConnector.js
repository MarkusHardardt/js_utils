(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Global = isNodeJS ? require('./Global.js') : root.Global;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const { Global.validateConnectionInterface } = isNodeJS ? require('./WebSocketConnection.js') : { Global.validateConnectionInterface: root.Global.validateConnectionInterface };

    const compareTextsAndNumbers = Sorting.getTextsAndNumbersCompareFunction(true, false, true);
    function addId(ids, id) {
        let idx = Sorting.getInsertionIndex(id, ids, true, compareTextsAndNumbers);
        if (idx >= 0) {
            ids.splice(idx, 0, id);
        }
    };
    function removeId(ids, id) { // TODO: reuse or remove
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
        ShortToIdRequest: 1,
        SubscriptionRequest: 3,
        SubscribedDataUpdate: 4,
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
                Global.validateConnectionInterface(value, true);
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

    class ClientDataConnector extends BaseDataConnector {
        constructor() {
            super();
            Global.validateConnectorInterface(this, true);
            Global.validateEventPublisherInterface(this, true);
            this._callbacks = {};
            this._bufferedSubsciptions = [];
            this._bufferedUnsubsciptions = [];
            this._short2Id = null;
            this._id2Short = null;
            this._subscribtionDelay = false;
            this._subscribtionDelayTimer = null;
            this._online = false;
        }

        set SubscribtionDelay(value) {
            this._subscribtionDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        OnOpen() {
            console.log('ClientDataConnector.OnOpen()');
            Global.validateConnectionInterface(this.connection);
            this.connection.Send(this.receiver, { type: TransmissionType.ShortToIdRequest }, short2Id => {
                this._short2Id = short2Id;
                this._id2Short = invert(short2Id);
                this._online = true;
                this._sendSubscriptionRequest();
            }, error => this.onError(error));
        }

        OnClose() {
            console.log('ClientDataConnector.OnClose()');
            this._online = false;
            clearTimeout(this._subscribtionDelayTimer);
            this._subscribtionDelayTimer = null;
        }

        Subscribe(id, onEvent) {
            Global.validateConnectionInterface(this.connection);
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
            Global.validateConnectionInterface(this.connection);
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
            Global.validateConnectionInterface(this.connection);
            if (!this._id2Short) {
                throw new Error('Not available: this._id2Short');
            } else if (!this._online) {
                throw new Error('Cannot Read() because not connected');
            }
            const short = this._id2Short[id];
            if (!short) {
                throw new Error(`Unexpected id ${id} to Read()`);
            }
            this.connection.Send(this.receiver, { type: TransmissionType.ReadRequest, short }, onResponse, onError);
        }

        Write(id, value) {
            Global.validateConnectionInterface(this.connection);
            if (!this._id2Short) {
                throw new Error('Not available: this._id2Short');
            } else if (!this._online) {
                throw new Error('Cannot Write() because not connected');
            }
            const short = this._id2Short[id];
            if (!short) {
                throw new Error(`Unexpected id ${id} to Write()`);
            }
            this.connection.Send(this.receiver, { type: TransmissionType.WriteRequest, short, value });
        }

        handleReceived(data, onResponse, onError) {
            try {
                switch (data.type) {
                    case TransmissionType.SubscribedDataUpdate:
                        for (const short in data.values) {
                            if (data.values.hasOwnProperty(short)) {
                                const id = this._short2Id[short];
                                const value = data.values[short];
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
            Global.validateConnectionInterface(this.connection);
            if (!this._id2Short) {
                throw new Error('Not available: this._id2Short');
            } else if (this._online) {
                let subs = '';
                for (const id in this._callbacks) {
                    if (this._callbacks.hasOwnProperty(id)) {
                        const short = this._id2Short[id];
                        if (!short) {
                            throw new Error(`Unknown id: ${id}`);
                        }
                        subs += short;
                    }
                }
                this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionRequest, subs });
            }
        }
    }

    function validateServerDataConnector(instance, checkMethodArguments) {
        Core.validateInterface('ServerDataConnector', instance, [
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
            this._short2Id = null;
            this._id2Short = null;
            this._online = false;
        }

        set Parent(value) {
            if (value) {
                Global.validateEventPublisherInterface(value, true);
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
            this._short2Id = {};
            const nextId = Core.createIdGenerator(idPrefix);
            for (const id of sorted) {
                this._short2Id[nextId()] = id;
            }
            this._id2Short = invert(this._short2Id);
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
                Global.validateEventPublisherInterface(this._parent);
                Global.validateConnectionInterface(this.connection);
                let id;
                switch (data.type) {
                    case TransmissionType.ShortToIdRequest:
                        if (this._short2Id) {
                            onResponse(this._short2Id);
                        }
                        else {
                            onError('No ids available');
                        }
                        break;
                    case TransmissionType.SubscriptionRequest:
                        this._updateSubscriptions(data.subs);
                        break;
                    case TransmissionType.ReadRequest:
                        if (!this._short2Id) {
                            throw new Error('Short -> Id not available for read request');
                        }
                        id = this._short2Id[data.short];
                        if (!id) {
                            throw new Error('Unknown id for read request');
                        }
                        this._parent.Read(id, onResponse, onError);
                        break;
                    case TransmissionType.WriteRequest:
                        if (!this._short2Id) {
                            throw new Error('Short -> Id not available for write request');
                        }
                        id = this._short2Id[data.short];
                        if (!id) {
                            throw new Error('Unknown id for write request');
                        }
                        this._parent.Write(id, data.value);
                        break;
                    default:
                        throw new Error(`Invalid transmission type: ${data.type}`);
                }
            } catch (error) {
                this.onError(`Failed handling received data: ${error}'`);
            }
        }

        _updateSubscriptions(subscriptionShorts) {
            try {
                Global.validateEventPublisherInterface(this._parent);
                if (this._short2Id && this._id2Short) {
                    for (const id in this._callbacks) {
                        if (this._callbacks.hasOwnProperty(id)) {
                            const short = this._id2Short[id];
                            const onEvent = subscriptionShorts.indexOf(short) < 0 ? this._callbacks[id] : false;
                            if (onEvent) {
                                delete this._callbacks[id];
                                this._parent.Unsubscribe(id, onEvent);
                            }
                        }
                    }
                    Regex.each(conRegex, subscriptionShorts, (start, end, match) => {
                        const short = match[0];
                        const id = this._short2Id[short];
                        if (id) {
                            if (!this._callbacks[id]) {
                                const onEvent = value => {
                                    // console.log(`Updated id: '${id}', value: ${value}`);
                                    const values = {};
                                    values[short] = value;
                                    this.connection.Send(this.receiver, { type: TransmissionType.SubscribedDataUpdate, values });
                                };
                                this._callbacks[id] = onEvent;
                                this._parent.Subscribe(id, onEvent);
                            }
                        }
                        else {
                            this.onError(`Cannot subscribe: ${short}`);
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
        root.Global.validateConnectorInterface = Global.validateConnectorInterface;
    }
}(globalThis));
