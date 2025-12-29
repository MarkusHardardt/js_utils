(function (root) {
    "use strict";
    const DataConnector = {};
    // access to other components in node js and browser:
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const OperationalState = isNodeJS ? require('./OperationalState.js') : root.OperationalState;

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

    const TransmissionType = Object.freeze({
        ConfigRequest: 1,
        SubscriptionRequest: 3,
        SubscribedDataUpdate: 4,
        ReadRequest: 5,
        WriteRequest: 6
    });

    class Connector extends OperationalState {
        constructor() {
            super();
            this.connection = null;
            this.onError = Core.defaultOnError;
            this.receiver = DEFAULT_DATA_CONNECTION_RECEIVER;
            this._handler = (data, onResponse, onError) => this.handleReceived(data, onResponse, onError);
        }

        set Connection(value) {
            if (value) {
                if (this.connection) {
                    this.connection.Unregister(this.receiver);
                    this.connection = null;
                }
                Common.validateConnectionInterface(value, true);
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
                Common.validateClientConnectorInterface(this, true);
                Common.validateDataPointCollectionInterface(this, true);
                this._isOpen = false;
                this._datas = null;
                this._short2Id = null;
                this._id2Short = null;
                this._subscribeDelay = false;
                this._subscribeDelayTimer = null;
            }

            OnOpen() {
                Common.validateConnectionInterface(this.connection);
                this.connection.Send(this.receiver, { type: TransmissionType.ConfigRequest }, config => {
                    this._subscribeDelay = typeof config.subscribeDelay === 'number' && config.subscribeDelay > 0 ? config.subscribeDelay : false;
                    this._short2Id = config.short2Id;
                    this._id2Short = invert(config.short2Id);
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
                                this._datas[dataId] = { value: null, onRefresh: null };
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
                    this._isOpen = true;
                    this._sendSubscriptionRequest();
                    this.IsOperational = true;
                }, error => {
                    this._isOpen = false;
                    this._subscribeDelay = false;
                    this._short2Id = null;
                    this._id2Short = null;
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
                    this.IsOperational = false;
                });
            }

            OnClose() {
                this._isOpen = false;
                this._short2Id = null;
                this._id2Short = null;
                this._subscribeDelay = false;
                clearTimeout(this._subscribeDelayTimer);
                this._subscribeDelayTimer = null;
                this.IsOperational = false;
            }

            SubscribeData(dataId, onRefresh) {
                Common.validateConnectionInterface(this.connection);
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid subscription data id: '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscriber for subscription data id '${dataId}' is not a function`);
                } else if (this._datas[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}' for subscription`);
                } else if (this._datas[dataId].onRefresh) {
                    throw new Error(`Data for data id '${dataId}' is already subscribed`);
                }
                this._datas[dataId].onRefresh = onRefresh;
                this._subscriptionsChanged();
            }

            UnsubscribeData(dataId, onRefresh) {
                Common.validateConnectionInterface(this.connection);
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid unsubscription data id: '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscriber for unsubscription id '${dataId}' is not a function`);
                } else if (this._datas[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}' for unsubscription`);
                } else if (!this._datas[dataId].onRefresh) {
                    throw new Error(`Data for data id '${dataId}' is already unsubscribed`);
                } else if (this._datas[dataId].onRefresh !== onRefresh) {
                    throw new Error(`Unexpected onRefresh for data id '${dataId}' to unsubscribe`);
                }
                this._datas[dataId].onRefresh = null;
                this._subscriptionsChanged();
            }

            Read(dataId, onResponse, onError) {
                Common.validateConnectionInterface(this.connection);
                if (!this._isOpen) {
                    throw new Error('Cannot Read() because not connected');
                }
                const short = this._id2Short[dataId];
                if (!short) {
                    throw new Error(`Unexpected id ${dataId} to Read()`);
                }
                this.connection.Send(this.receiver, { type: TransmissionType.ReadRequest, short }, onResponse, onError);
            }

            Write(dataId, value) {
                Common.validateConnectionInterface(this.connection);
                if (!this._isOpen) {
                    throw new Error('Cannot Write() because not connected');
                }
                const short = this._id2Short[dataId];
                if (!short) {
                    throw new Error(`Unexpected id ${dataId} to Write()`);
                }
                this.connection.Send(this.receiver, { type: TransmissionType.WriteRequest, short, value });
            }

            handleReceived(data, onResponse, onError) {
                if (this._isOpen) {
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
                                    if (value !== null && dt.onRefresh) {
                                        try {
                                            dt.onRefresh(value);
                                        } catch (error) {
                                            this.onError(`Failed calling onRefresh() for data id: ${dataId}: ${error}`);
                                        }
                                    }
                                }
                            }
                            break;
                        default:
                            this.onError(`Invalid transmission type: ${data.type}`);
                    }
                }
            }

            _subscriptionsChanged() {
                if (!this._subscribeDelay) {
                    this._sendSubscriptionRequest();
                } else if (!this._subscribeDelayTimer) {
                    this._subscribeDelayTimer = setTimeout(() => {
                        this._sendSubscriptionRequest();
                        this._subscribeDelayTimer = null;
                    }, this._subscribeDelay);
                }
            }

            _sendSubscriptionRequest() {
                Common.validateConnectionInterface(this.connection);
                if (this._isOpen) {
                    // Build a string with all short ids of the currently stored onRefresh callbacks and send to server
                    let subs = '';
                    for (const dataId in this._datas) {
                        if (this._datas.hasOwnProperty(dataId)) {
                            const short = this._id2Short[dataId];
                            if (!short) {
                                throw new Error(`Unknown data id: ${dataId}`);
                            }
                            if (this._datas[dataId].onRefresh) {
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

        const SHORT_ID_PREFIX = '#';
        const subscribeRequestShortIdRegex = /#[a-z0-9]+\b/g;

        class ServerDataConnector extends Connector {
            constructor() {
                super();
                Common.validateServerConnectorInterface(this, true);
                this._isOpen = false;
                this._parent = null;
                this._onEventCallbacks = {};
                this._short2Id = null;
                this._id2Short = null;
                this._values = null;
                this._subscribeDelay = false;
                this._sendDelay = false;
                this._sendDelayTimer = null;
            }

            set Parent(value) {
                if (value) {
                    Common.validateDataPointCollectionInterface(value, true);
                    this._parent = value;
                } else {
                    this._parent = null;
                }
            }

            set SendDelay(value) {
                this._sendDelay = typeof value === 'number' && value > 0 ? value : false;
            }

            set SubscribeDelay(value) {
                this._subscribeDelay = typeof value === 'number' && value > 0 ? value : false;
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
                const nextId = Core.createIdGenerator(SHORT_ID_PREFIX);
                for (const id of sorted) {
                    this._short2Id[nextId()] = id;
                }
                this._id2Short = invert(this._short2Id);
            }

            OnOpen() {
                this._isOpen = true;
                this._sendValues();
            }

            OnReopen() {
                this.OnOpen();
            }

            OnClose() {
                this._isOpen = false;
                clearTimeout(this._sendDelayTimer);
                this._sendDelayTimer = null;
                this._updateSubscriptions('');
            }

            OnDispose() {
                this.OnClose();
                // TODO: Clean up
            }

            handleReceived(data, onResponse, onError) {
                if (this._isOpen) {
                    Common.validateDataPointCollectionInterface(this._parent);
                    Common.validateConnectionInterface(this.connection);
                    let dataId;
                    switch (data.type) {
                        case TransmissionType.ConfigRequest:
                            onResponse({ subscribeDelay: this._subscribeDelay, short2Id: this._short2Id });
                            break;
                        case TransmissionType.SubscriptionRequest:
                            this._updateSubscriptions(data.subs);
                            break;
                        case TransmissionType.ReadRequest:
                            dataId = this._short2Id[data.short];
                            if (!dataId) {
                                this.onError('Unknown id for read request');
                                return;
                            }
                            this._parent.Read(dataId, onResponse, onError);
                            break;
                        case TransmissionType.WriteRequest:
                            dataId = this._short2Id[data.short];
                            if (!dataId) {
                                this.onError('Unknown id for write request');
                                return;
                            }
                            this._parent.Write(dataId, data.value);
                            break;
                        default:
                            this.onError(`Invalid transmission type: ${data.type}`);
                    }
                }
            }

            _updateSubscriptions(subscriptionShorts) {
                if (this._isOpen) {
                    Common.validateDataPointCollectionInterface(this._parent);
                    for (const dataId in this._onEventCallbacks) {
                        if (this._onEventCallbacks.hasOwnProperty(dataId)) {
                            const short = this._id2Short[dataId];
                            const onRefresh = subscriptionShorts.indexOf(short) < 0 ? this._onEventCallbacks[dataId] : false;
                            if (onRefresh) {
                                delete this._onEventCallbacks[dataId];
                                this._parent.UnsubscribeData(dataId, onRefresh);
                            }
                        }
                    }
                    Regex.each(subscribeRequestShortIdRegex, subscriptionShorts, (start, end, match) => {
                        // we are in a closure -> short/id will be available in onRefresh()
                        const short = match[0];
                        const dataId = this._short2Id[short];
                        if (dataId) {
                            if (!this._onEventCallbacks[dataId]) {
                                const onRefresh = value => {
                                    if (!this._values) {
                                        this._values = {};
                                    }
                                    this._values[short] = value;
                                    this._valuesChanged();
                                };
                                this._onEventCallbacks[dataId] = onRefresh;
                                this._parent.SubscribeData(dataId, onRefresh);
                            }
                        } else {
                            this.onError(`Cannot subscribe: ${short}`);
                        }
                    }, true);
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
                if (this._isOpen && this._values) {
                    Common.validateConnectionInterface(this.connection);
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
