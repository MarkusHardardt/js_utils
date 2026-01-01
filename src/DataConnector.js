(function (root) {
    "use strict";
    const DataConnector = {};
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const DataPoint = isNodeJS ? require('./DataPoint.js') : root.DataPoint;

    const DEFAULT_DATA_CONNECTION_RECEIVER = 'dcr';

    const TransmissionType = Object.freeze({
        ConfigurationRequest: 1,
        DataPointConfigurationsRefresh: 2,
        SubscriptionRequest: 3,
        DataRefresh: 4,
        ReadRequest: 5,
        WriteRequest: 6
    });

    class Connector {
        constructor() {
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
                Common.validateAsConnection(value, true);
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

    function getAsDataPointsByDataId(dataPointConfigsByShortId) {
        return Core.getTransformedObject(dataPointConfigsByShortId,
            (shortId, config) => config.dataId,
            (shortId, dataPoint) => { return { shortId, type: dataPoint.type } }
        );
    }

    // Client
    if (!isNodeJS) {
        class ClientDataConnector extends Connector {
            constructor() {
                super();
                this._operational = new DataPoint.Node();
                this._operational.Value = false;
                this._operational.Observable = null;
                this._equal = Core.defaultEqual;
                this._dataPointConfigsByShortId = null;
                this._dataPointsByDataId = {};
                this._subscribeDelay = false;
                this._subscribeDelayTimer = null;
                this._unsubscribeDelay = false;
                Common.validateAsDataAccessObject(this, true);
                Common.validateAsClientConnector(this, true);
            }

            set Equal(value) {
                if (typeof value !== 'function') {
                    throw new Error('Set value for Equal(e1, e2) is not a function');
                }
                this._equal = value;
                for (const dataId in this._dataPointsByDataId) {
                    if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                        this._dataPointsByDataId[dataId].node.Equal = value;
                    }
                }
            }

            set OnError(value) {
                super.OnError = value;
                this._operational.OnError = value;
                for (const dataId in this._dataPointsByDataId) {
                    if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                        this._dataPointsByDataId[dataId].node.OnError = value;
                    }
                }
            }

            get IsOperational() {
                return this._operational.Value;
            }

            SubscribeOperationalState(onOperationalStateChanged) {
                this._operational.Subscribe(onOperationalStateChanged);
            }

            UnsubscribeOperationalState(onOperationalStateChanged) {
                this._operational.Unsubscribe(onOperationalStateChanged);
            }

            GetType(dataId) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid data id: '${dataId}'`);
                } else if (this._dataPointsByDataId[dataId] === undefined) {
                    throw new Error(`Unknown data point for id '${dataId}' to get type`);
                }
                return this._dataPointsByDataId[dataId].type;
            }

            SubscribeData(dataId, onRefresh) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid subscription data id: '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscriber for subscription data id '${dataId}' is not a function`);
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    throw new Error(`Unknown data point for id '${dataId}' for subscription`);
                }
                dataPoint.node.Subscribe(onRefresh);
                this._subscriptionsChanged();
            }

            UnsubscribeData(dataId, onRefresh) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid unsubscription data id: '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscriber for unsubscription id '${dataId}' is not a function`);
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    throw new Error(`Unknown data point for id '${dataId}' for subscription`);
                }
                dataPoint.node.Unsubscribe(onRefresh);
                this._subscriptionsChanged();
            }

            Read(dataId, onResponse, onError) {
                if (!this._operational.Value) {
                    throw new Error('Cannot Read() because not connected');
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    throw new Error(`Unknown data point for id ${dataId} to Read()`);
                }
                Common.validateAsConnection(this.connection);
                this.connection.Send(this.receiver,
                    { type: TransmissionType.ReadRequest, shortId: dataPoint.shortId },
                    value => {
                        try {
                            onResponse(value);
                        } catch (error) {
                            this._onError(`Failed calling onResponse() for dataId: ${dataId}: ${error.message}`, error);
                        }
                        const dataPoint = this._dataPointsByDataId[dataId];
                        if (dataPoint) {
                            dataPoint.node.Value = value;
                        }
                    },
                    onError
                );
            }

            Write(dataId, value) {
                if (!this._operational.Value) {
                    throw new Error('Cannot Write() because not connected');
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    throw new Error(`Unknown data point for id ${dataId} to Write()`);
                }
                Common.validateAsConnection(this.connection);
                this.connection.Send(this.receiver,
                    { type: TransmissionType.WriteRequest, shortId: dataPoint.shortId, value }
                );
            }

            OnOpen() {
                this._loadConfiguration();
            }

            OnClose() {
                this._operational.Value = false;
                clearTimeout(this._subscribeDelayTimer);
                this._subscribeDelayTimer = null;
            }

            handleReceived(data, onResponse, onError) {
                if (this._operational.Value) {
                    switch (data.type) {
                        case TransmissionType.DataPointConfigurationsRefresh:
                            this._setDataPointConfigsByShortId(data.dataPointConfigsByShortId);
                            this._sendSubscriptionRequest();
                            break;
                        case TransmissionType.DataRefresh:
                            for (const shortId in data.values) {
                                if (data.values.hasOwnProperty(shortId)) {
                                    const dpConfByShortId = this._dataPointConfigsByShortId[shortId];
                                    if (!dpConfByShortId) {
                                        this.onError(`Unexpected short id: ${shortId}`);
                                        continue;
                                    }
                                    const dataPoint = this._dataPointsByDataId[dpConfByShortId.dataId];
                                    if (!dataPoint) {
                                        this.onError(`Unknown data id: ${dpConfByShortId.dataId}`);
                                        continue;
                                    }
                                    dataPoint.node.Value = data.values[shortId];
                                }
                            }
                            break;
                        default:
                            this.onError(`Invalid transmission type: ${data.type}`);
                    }
                }
            }

            _loadConfiguration() {
                Common.validateAsConnection(this.connection);
                this.connection.Send(this.receiver, { type: TransmissionType.ConfigurationRequest }, config => {
                    this._subscribeDelay = typeof config.subscribeDelay === 'number' && config.subscribeDelay > 0 ? config.subscribeDelay : false;
                    this._unsubscribeDelay = typeof config.unsubscribeDelay === 'number' && config.unsubscribeDelay > 0 ? config.unsubscribeDelay : false;
                    this._operational.UnsubscribeDelay = this._unsubscribeDelay;
                    this._setDataPointConfigsByShortId(config.dataPointConfigsByShortId);
                    this._operational.Value = true;
                    this._sendSubscriptionRequest();
                }, error => {
                    this._operational.Value = false;
                    this.onError(error);
                });
            }

            _setDataPointConfigsByShortId(dataPointConfigsByShortId) {
                this._dataPointConfigsByShortId = dataPointConfigsByShortId; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
                const oldDataPointsByDataId = this._dataPointsByDataId;
                this._dataPointsByDataId = getAsDataPointsByDataId(dataPointConfigsByShortId);
                // Check for all received data points if an old data point exists and if the case copy the content
                for (const dataId in this._dataPointsByDataId) {
                    if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                        this._prepareDataPoint(dataId, this._dataPointsByDataId[dataId], oldDataPointsByDataId);
                    }
                }
                // Clean up old data points not existing anymore
                if (oldDataPointsByDataId) {
                    for (const dataId in oldDataPointsByDataId) {
                        if (oldDataPointsByDataId.hasOwnProperty(dataId)) {
                            this._destroyDataPoint(oldDataPointsByDataId[dataId]);
                            delete oldDataPointsByDataId[dataId];
                        }
                    }
                }
            }

            _prepareDataPoint(dataId, dataPoint, oldDataPointsByDataId) {
                const oldDataPoint = oldDataPointsByDataId ? oldDataPointsByDataId[dataId] : null;
                if (!oldDataPoint) {
                    const node = new DataPoint.Node();
                    node.Equal = this._equal;
                    node.OnError = this.onError;
                    node.Value = null;
                    dataPoint.node = node;
                    dataPoint.Subscribe = onRefresh => this.SubscribeData(dataId, onRefresh);
                    dataPoint.Unsubscribe = onRefresh => this.UnsubscribeData(dataId, onRefresh);
                } else {
                    dataPoint.node = oldDataPoint.node;
                    dataPoint.Subscribe = oldDataPoint.Subscribe;
                    dataPoint.Unsubscribe = oldDataPoint.Unsubscribe;
                    delete oldDataPointsByDataId[dataId];
                }
                dataPoint.node.UnsubscribeDelay = this._unsubscribeDelay;
                dataPoint.node.Observable = dataPoint;
            }

            _destroyDataPoint(dataPoint) {
                const node = dataPoint.node;
                node.Value = null;
                node.Observable = null;
                delete dataPoint.node;
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
                Common.validateAsConnection(this.connection);
                if (this._operational.Value) {
                    // Build a string with all short ids of the currently subscribed data point and send to server
                    let subs = '';
                    for (const dataId in this._dataPointsByDataId) {
                        if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataPointsByDataId[dataId];
                            if (dataPoint.node.SubscriptionsCount > 0) {
                                subs += dataPoint.shortId;
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
                this._isOpen = false;
                this._parent = null;
                this._onEventCallbacks = {};
                this._dataPointConfigsByShortId = null;
                this._dataPointsByDataId = null;
                this._values = null;
                this._subscribeDelay = false;
                this._unsubscribeDelay = false;
                this._sendDelay = false;
                this._sendDelayTimer = null;
                Common.validateAsServerConnector(this, true);
            }

            set Parent(value) {
                if (value) {
                    Common.validateAsDataAccessObject(value, true);
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

            set UnsubscribeDelay(value) {
                this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
            }

            SetDataPoints(dataPointConfigs, send) {
                if (!Array.isArray(dataPointConfigs)) {
                    throw new Error('Data points must be passed as an array');
                }
                const getNextShortId = Core.createIdGenerator(SHORT_ID_PREFIX);
                const dataPointConfigsByShortId = {};
                for (const dpConf of dataPointConfigs) {
                    if (typeof dpConf.id !== 'string') {
                        throw new Error(`Data point has invalid data id: ${dpConf.id}`);
                    } else if (typeof dpConf.type !== 'number') {
                        throw new Error(`Data point has invalid type: ${dpConf.type}`);
                    }
                    dataPointConfigsByShortId[getNextShortId()] = { dataId: dpConf.id, type: dpConf.type };
                }
                this._dataPointsByDataId = getAsDataPointsByDataId(dataPointConfigsByShortId);
                this._dataPointConfigsByShortId = dataPointConfigsByShortId; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
                if (this._isOpen && send === true) {
                    Common.validateAsConnection(this.connection);
                    this.connection.Send(this.receiver, { type: TransmissionType.DataPointConfigurationsRefresh, dataPointConfigsByShortId });
                }
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
                    Common.validateAsDataAccessObject(this._parent);
                    switch (data.type) {
                        case TransmissionType.ConfigurationRequest:
                            onResponse({
                                subscribeDelay: this._subscribeDelay,
                                unsubscribeDelay: this._unsubscribeDelay,
                                dataPointConfigsByShortId: this._dataPointConfigsByShortId
                            });
                            break;
                        case TransmissionType.SubscriptionRequest:
                            this._updateSubscriptions(data.subs);
                            break;
                        case TransmissionType.ReadRequest:
                            let readDPConf = this._dataPointConfigsByShortId[data.shortId];
                            if (!readDPConf) {
                                this.onError('Unknown data point for read request');
                                return;
                            }
                            this._parent.Read(readDPConf.dataId, onResponse, onError);
                            break;
                        case TransmissionType.WriteRequest:
                            let writeDPConf = this._dataPointConfigsByShortId[data.shortId];
                            if (!writeDPConf) {
                                this.onError('Unknown data point for write request');
                                return;
                            }
                            this._parent.Write(writeDPConf.dataId, data.value);
                            break;
                        default:
                            this.onError(`Invalid transmission type: ${data.type}`);
                    }
                }
            }

            _updateSubscriptions(subscriptionShorts) {
                if (this._isOpen) {
                    Common.validateAsDataAccessObject(this._parent);
                    for (const dataId in this._onEventCallbacks) {
                        if (this._onEventCallbacks.hasOwnProperty(dataId)) {
                            const shortId = this._dataPointsByDataId[dataId];
                            const onRefresh = subscriptionShorts.indexOf(shortId) < 0 ? this._onEventCallbacks[dataId] : false;
                            if (onRefresh) {
                                delete this._onEventCallbacks[dataId];
                                this._parent.UnsubscribeData(dataId, onRefresh);
                            }
                        }
                    }
                    Regex.each(subscribeRequestShortIdRegex, subscriptionShorts, (start, end, match) => {
                        // we are in a closure -> shortId/id will be available in onRefresh()
                        const shortId = match[0];
                        const dpConf = this._dataPointConfigsByShortId[shortId];
                        if (dpConf) {
                            if (!this._onEventCallbacks[dpConf.dataId]) {
                                const onRefresh = value => {
                                    if (!this._values) {
                                        this._values = {};
                                    }
                                    this._values[shortId] = value;
                                    this._valuesChanged();
                                };
                                this._onEventCallbacks[dpConf.dataId] = onRefresh;
                                this._parent.SubscribeData(dpConf.dataId, onRefresh);
                            }
                        } else {
                            this.onError(`Cannot subscribe: ${shortId}`);
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
                    Common.validateAsConnection(this.connection);
                    this.connection.Send(this.receiver, { type: TransmissionType.DataRefresh, values: this._values });
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
