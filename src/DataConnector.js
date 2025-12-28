(function (root) {
    "use strict";
    const DataConnector = {};
    const isNodeJS = typeof require === 'function';

    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Global = isNodeJS ? require('./Global.js') : root.Global;
    const OperationalState = isNodeJS ? require('./OperationalState.js') : root.OperationalState;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;

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

    class Connector extends OperationalState {
        constructor() {
            super();
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

    // Client
    if (!isNodeJS) {
        class ClientDataConnector extends Connector {
            constructor() {
                super();
                Global.validateClientConnectorInterface(this, true);
                Global.validateDataPublisherInterface(this, true);
                this._datas = null;
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
                Global.validateConnectionInterface(this.connection);
                this.connection.Send(this.receiver, { type: TransmissionType.ShortToIdRequest }, short2Id => {
                    this._short2Id = short2Id;
                    this._id2Short = invert(short2Id);
                    const datas = this._datas;
                    this._datas = {};
                    for (const dataId in this._id2Short) {
                        if (this._id2Short.hasOwnProperty(dataId)) {
                            const data = datas ? datas[dataId] : null;
                            if (data) {
                                this._datas[dataId] = data;
                                delete datas[dataId];
                            }
                            else {
                                this._datas[dataId] = { value: null, onDataUpdate: null };
                            }
                        }
                    }
                    if (datas) {
                        for (const dataId in datas) {
                            if (datas.hasOwnProperty(dataId)) { // TODO: Must be handled somehow?
                                this.onError(`Data '${dataId}' not exists anymore`);
                                delete datas[dataId];
                            }
                        }
                    }
                    this._online = true;
                    this._sendSubscriptionRequest();
                    this.IsOperational = true;
                }, error => {
                    this.IsOperational = false;
                    this.onError(error);
                    if (this._datas) {
                        for (const dataId in this._datas) {
                            if (this._datas.hasOwnProperty(dataId)) { // TODO: Must be handled somehow?
                                this.onError(`Data '${dataId}' not exists anymore`);
                                delete this._datas[dataId];
                            }
                        }
                        this._datas = null;
                    }
                });
            }

            OnClose() {
                this.IsOperational = false;
                this._online = false;
                clearTimeout(this._subscribtionDelayTimer);
                this._subscribtionDelayTimer = null;
            }

            SubscribeData(dataId, onDataUpdate) {
                Global.validateConnectionInterface(this.connection);
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid subscription data id: '${dataId}'`);
                } else if (typeof onDataUpdate !== 'function') {
                    throw new Error(`Subscriber for subscription data id '${dataId}' is not a function`);
                } else if (this._datas[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}' for subscription`);
                } else if (this._datas[dataId].onDataUpdate) {
                    throw new Error(`Data for data id '${dataId}' is already subscribed`);
                }
                this._datas[dataId].onDataUpdate = onDataUpdate;
                this._subscriptionsChanged();
            }

            UnsubscribeData(dataId, onDataUpdate) {
                Global.validateConnectionInterface(this.connection);
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid unsubscription data id: '${dataId}'`);
                } else if (typeof onDataUpdate !== 'function') {
                    throw new Error(`Subscriber for unsubscription id '${dataId}' is not a function`);
                } else if (this._datas[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}' for unsubscription`);
                } else if (!this._datas[dataId].onDataUpdate) {
                    throw new Error(`Data for data id '${dataId}' is already unsubscribed`);
                } else if (this._datas[dataId].onDataUpdate !== onDataUpdate) {
                    throw new Error(`Unexpected onDataUpdate for data id '${dataId}' to unsubscribe`);
                }
                this._datas[dataId].onDataUpdate = null;
                this._subscriptionsChanged();
            }

            Read(dataId, onResponse, onError) {
                Global.validateConnectionInterface(this.connection);
                if (!this._id2Short) {
                    throw new Error('Not available: this._id2Short');
                } else if (!this._online) {
                    throw new Error('Cannot Read() because not connected');
                }
                const short = this._id2Short[dataId];
                if (!short) {
                    throw new Error(`Unexpected id ${dataId} to Read()`);
                }
                this.connection.Send(this.receiver, { type: TransmissionType.ReadRequest, short }, onResponse, onError);
            }

            Write(dataId, value) {
                Global.validateConnectionInterface(this.connection);
                if (!this._id2Short) {
                    throw new Error('Not available: this._id2Short');
                } else if (!this._online) {
                    throw new Error('Cannot Write() because not connected');
                }
                const short = this._id2Short[dataId];
                if (!short) {
                    throw new Error(`Unexpected id ${dataId} to Write()`);
                }
                this.connection.Send(this.receiver, { type: TransmissionType.WriteRequest, short, value });
            }

            handleReceived(data, onResponse, onError) {
                try { // TODO: Is this try/catch required on this place?
                    switch (data.type) {
                        case TransmissionType.SubscribedDataUpdate:
                            for (const short in data.values) {
                                if (data.values.hasOwnProperty(short)) {
                                    const dataId = this._short2Id[short];
                                    const dt = this._datas[dataId];
                                    if (!dt) {
                                        this.onError(`Unknown data id: ${dataId}`);
                                        continue;
                                    }
                                    const value = data.values[short];
                                    if (value !== null && dt.onDataUpdate) {
                                        try {
                                            dt.onDataUpdate(value);
                                        } catch (error) {
                                            this.onError(`Failed calling onDataUpdate() for data id: ${dataId}: ${error}`);
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
                if (!this._subscribtionDelay) {
                    this._sendSubscriptionRequest();
                } else if (!this._subscribtionDelayTimer) {
                    this._subscribtionDelayTimer = setTimeout(() => {
                        this._sendSubscriptionRequest();
                        this._subscribtionDelayTimer = null;
                    }, this._subscribtionDelay);
                }
            }

            _sendSubscriptionRequest() {
                Global.validateConnectionInterface(this.connection);
                if (!this._id2Short) {
                    throw new Error('Not available: this._id2Short');
                } else if (this._online) {
                    // Build a string with all short ids of the currently stored onDataUpdate callbacks and send to server
                    let subs = '';
                    for (const dataId in this._datas) {
                        if (this._datas.hasOwnProperty(dataId)) {
                            const short = this._id2Short[dataId];
                            if (!short) {
                                throw new Error(`Unknown data id: ${dataId}`);
                            }
                            if (this._datas[dataId].onDataUpdate) {
                                subs += short;
                            }
                        }
                    }
                    this.connection.Send(this.receiver, { type: TransmissionType.SubscriptionRequest, subs });
                }
            }
        }
        DataConnector.ClientConnector = ClientDataConnector;
    }

    // Server
    if (isNodeJS) {
        class ServerDataConnector extends Connector {
            constructor() {
                super();
                Global.validateServerConnectorInterface(this, true);
                this._parent = null;
                this._onEventCallbacks = {};
                this._short2Id = null;
                this._id2Short = null;
                this._online = false;
                this._values = null;
                this._sendDelay = false;
                this._sendDelayTimer = null;
            }

            set Parent(value) {
                this.ParentOperationalState = value;
                if (value) {
                    Global.validateDataPublisherInterface(value, true);
                    this._parent = value;
                } else {
                    this._parent = null;
                }
            }

            set SendDelay(value) {
                this._sendDelay = typeof value === 'number' && value > 0 ? value : false;
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
                const nextId = Core.createIdGenerator('#');
                for (const id of sorted) {
                    this._short2Id[nextId()] = id;
                }
                this._id2Short = invert(this._short2Id);
            }

            OnOpen() {
                this._online = true;
                this._sendValues();
            }

            OnReopen() {
                this.OnOpen();
            }

            OnClose() {
                this._online = false;
                clearTimeout(this._sendDelayTimer);
                this._sendDelayTimer = null;
                this._updateSubscriptions('');
            }

            OnDispose() {
                this.OnClose();
                // TODO: Clean up
            }

            handleReceived(data, onResponse, onError) {
                try {
                    Global.validateDataPublisherInterface(this._parent);
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
                    Global.validateDataPublisherInterface(this._parent);
                    if (this._short2Id && this._id2Short) {
                        for (const dataId in this._onEventCallbacks) {
                            if (this._onEventCallbacks.hasOwnProperty(dataId)) {
                                const short = this._id2Short[dataId];
                                const onDataUpdate = subscriptionShorts.indexOf(short) < 0 ? this._onEventCallbacks[dataId] : false;
                                if (onDataUpdate) {
                                    delete this._onEventCallbacks[dataId];
                                    this._parent.UnsubscribeData(dataId, onDataUpdate);
                                }
                            }
                        }
                        Regex.each(/#[a-z0-9]+\b/g, subscriptionShorts, (start, end, match) => {
                            // we are in a closure -> short/id will be available in onDataUpdate()
                            const short = match[0];
                            const dataId = this._short2Id[short];
                            if (dataId) {
                                if (!this._onEventCallbacks[dataId]) {
                                    const onDataUpdate = value => {
                                        if (!this._values) {
                                            this._values = {};
                                        }
                                        this._values[short] = value;
                                        this._valuesChanged();
                                    };
                                    this._onEventCallbacks[dataId] = onDataUpdate;
                                    this._parent.SubscribeData(dataId, onDataUpdate);
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

            _valuesChanged() {
                if (!this._sendDelay) {
                    this._sendValues();
                } else if (!this._sendDelayTimer) {
                    this._sendDelayTimer = setTimeout(() => {
                        this._sendValues();
                        this._sendDelayTimer = null;
                    }, this._sendDelay);
                }
            }

            _sendValues() {
                if (this._online && this._values) {
                    Global.validateConnectionInterface(this.connection);
                    this.connection.Send(this.receiver, { type: TransmissionType.SubscribedDataUpdate, values: this._values });
                    this._values = null;
                }
            }
        }
        DataConnector.ServerConnector = ServerDataConnector;
    }

    Object.freeze(DataConnector);
    if (isNodeJS) {
        module.exports = DataConnector;
    } else {
        root.DataConnector = DataConnector;
    }
}(globalThis));
