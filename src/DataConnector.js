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

    function getAsDataIdDataPoints(shortIdDataPointConfigs) {
        return Core.getTransformedObject(shortIdDataPointConfigs, (shortId, dpConf) => dpConf.dataId, (shortId, dataPoint) => { return { shortId, type: dataPoint.type } });
    }

    // Client
    if (!isNodeJS) {
        class ClientDataConnector extends Connector {
            constructor() {
                super();
                this._operational = new DataPoint.Node();
                this._operational.Value = false;
                this._operational.Subscribable = null;
                this._shortIdDataPointConfigs = null;
                this._dataIdDataPoints = null;
                this._subscribeDelay = false;
                this._subscribeDelayTimer = null;
                Common.validateClientConnectorInterface(this, true);
                Common.validateDataPointCollectionInterface(this, true);
            }

            set OnError(value) {
                super.OnError = value;
                this._operational.OnError = value;
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

            OnOpen() {
                Common.validateConnectionInterface(this.connection);
                this.connection.Send(this.receiver, { type: TransmissionType.ConfigurationRequest }, config => {
                    this._subscribeDelay = typeof config.subscribeDelay === 'number' && config.subscribeDelay > 0 ? config.subscribeDelay : false;
                    this._shortIdDataPointConfigs = config.shortIdDataPointConfigs; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
                    const oldDataIdDataPoints = this._dataIdDataPoints;
                    this._dataIdDataPoints = getAsDataIdDataPoints(config.shortIdDataPointConfigs);
                    // Check for all received data points if an old data point exists and if the case copy the content
                    for (const dataId in this._dataIdDataPoints) {
                        if (this._dataIdDataPoints.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataIdDataPoints[dataId];
                            const oldDataPoint = oldDataIdDataPoints ? oldDataIdDataPoints[dataId] : null;
                            if (oldDataPoint) {
                                dataPoint.value = oldDataPoint.value;
                                dataPoint.onRefresh = oldDataPoint.onRefresh;
                                delete oldDataIdDataPoints[dataId];
                            }
                            else {
                                dataPoint.value = null;
                                dataPoint.onRefresh = null;
                            }
                        }
                    }
                    this._operational.Value = true;
                    this._sendSubscriptionRequest();
                }, error => {
                    this._operational.Value = false;
                    this.onError(error);
                });
            }

            OnClose() {
                this._operational.Value = false;
                clearTimeout(this._subscribeDelayTimer);
                this._subscribeDelayTimer = null;
            }

            GetType(dataId) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid data id: '${dataId}'`);
                } else if (this._dataIdDataPoints[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}'`);
                }
                return this._dataIdDataPoints[dataId].type;
            }

            SubscribeData(dataId, onRefresh) {
                Common.validateConnectionInterface(this.connection);
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid subscription data id: '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscriber for subscription data id '${dataId}' is not a function`);
                } else if (this._dataIdDataPoints[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}' for subscription`);
                } else if (this._dataIdDataPoints[dataId].onRefresh) {
                    throw new Error(`Data for data id '${dataId}' is already subscribed`);
                }
                this._dataIdDataPoints[dataId].onRefresh = onRefresh;
                this._subscriptionsChanged();
            }

            UnsubscribeData(dataId, onRefresh) {
                Common.validateConnectionInterface(this.connection);
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid unsubscription data id: '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscriber for unsubscription id '${dataId}' is not a function`);
                } else if (this._dataIdDataPoints[dataId] === undefined) {
                    throw new Error(`Unknowd data id '${dataId}' for unsubscription`);
                } else if (!this._dataIdDataPoints[dataId].onRefresh) {
                    throw new Error(`Data for data id '${dataId}' is already unsubscribed`);
                } else if (this._dataIdDataPoints[dataId].onRefresh !== onRefresh) {
                    throw new Error(`Unexpected onRefresh for data id '${dataId}' to unsubscribe`);
                }
                this._dataIdDataPoints[dataId].onRefresh = null;
                this._subscriptionsChanged();
            }

            Read(dataId, onResponse, onError) {
                Common.validateConnectionInterface(this.connection);
                if (!this._operational.Value) {
                    throw new Error('Cannot Read() because not connected');
                }
                const dataPoint = this._dataIdDataPoints[dataId];
                if (!dataPoint) {
                    throw new Error(`Unexpected data id ${dataId} to Read()`);
                }
                this.connection.Send(this.receiver, { type: TransmissionType.ReadRequest, shortId: dataPoint.shortId }, onResponse, onError);
            }

            Write(dataId, value) {
                Common.validateConnectionInterface(this.connection);
                if (!this._operational.Value) {
                    throw new Error('Cannot Write() because not connected');
                }
                const dataPoint = this._dataIdDataPoints[dataId];
                if (!dataPoint) {
                    throw new Error(`Unexpected data id ${dataId} to Write()`);
                }
                this.connection.Send(this.receiver, { type: TransmissionType.WriteRequest, shortId: dataPoint.shortId, value });
            }

            handleReceived(data, onResponse, onError) {
                if (this._operational.Value) {
                    switch (data.type) {
                        case TransmissionType.DataRefresh:
                            for (const shortId in data.values) {
                                if (data.values.hasOwnProperty(shortId)) {
                                    const dpConf = this._shortIdDataPointConfigs[shortId];
                                    if (!dpConf) {
                                        this.onError(`Unexpected short id: ${shortId}`);
                                        continue;
                                    }
                                    const dataPoint = this._dataIdDataPoints[dpConf.dataId];
                                    if (!dataPoint) {
                                        this.onError(`Unknown data id: ${dpConf.dataId}`);
                                        continue;
                                    }
                                    const value = data.values[shortId];
                                    if (value !== null && dataPoint.onRefresh) {
                                        try {
                                            dataPoint.onRefresh(value);
                                        } catch (error) {
                                            this.onError(`Failed calling onRefresh() for data id: ${dpConf.dataId}: ${error}`);
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
                if (this._operational.Value) {
                    // Build a string with all short ids of the currently stored onRefresh callbacks and send to server
                    let subs = '';
                    for (const dataId in this._dataIdDataPoints) {
                        if (this._dataIdDataPoints.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataIdDataPoints[dataId];
                            if (dataPoint.onRefresh) {
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
                this._shortIdDataPointConfigs = null;
                this._dataIdDataPoints = null;
                this._values = null;
                this._subscribeDelay = false;
                this._sendDelay = false;
                this._sendDelayTimer = null;
                Common.validateServerConnectorInterface(this, true);
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

            SetDataPoints(dataPointConfigs) {
                if (!Array.isArray(dataPointConfigs)) {
                    throw new Error('Data points must be passed as an array');
                }
                const getNextShortId = Core.createIdGenerator(SHORT_ID_PREFIX);
                const shortIdDataPointConfigs = {};
                for (const dpConf of dataPointConfigs) {
                    if (typeof dpConf.id !== 'string') {
                        throw new Error(`Data point has invalid data id: ${dpConf.id}`);
                    } else if (typeof dpConf.type !== 'number') {
                        throw new Error(`Data point has invalid type: ${dpConf.type}`);
                    }
                    shortIdDataPointConfigs[getNextShortId()] = { dataId: dpConf.id, type: dpConf.type };
                }
                this._dataIdDataPoints = getAsDataIdDataPoints(shortIdDataPointConfigs);
                this._shortIdDataPointConfigs = shortIdDataPointConfigs; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
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
                    switch (data.type) {
                        case TransmissionType.ConfigurationRequest:
                            onResponse({ subscribeDelay: this._subscribeDelay, shortIdDataPointConfigs: this._shortIdDataPointConfigs });
                            break;
                        case TransmissionType.SubscriptionRequest:
                            this._updateSubscriptions(data.subs);
                            break;
                        case TransmissionType.ReadRequest:
                            let readDPConf = this._shortIdDataPointConfigs[data.shortId];
                            if (!readDPConf) {
                                this.onError('Unknown data point for read request');
                                return;
                            }
                            this._parent.Read(readDPConf.dataId, onResponse, onError);
                            break;
                        case TransmissionType.WriteRequest:
                            let writeDPConf = this._shortIdDataPointConfigs[data.shortId];
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
                    Common.validateDataPointCollectionInterface(this._parent);
                    for (const dataId in this._onEventCallbacks) {
                        if (this._onEventCallbacks.hasOwnProperty(dataId)) {
                            const shortId = this._dataIdDataPoints[dataId];
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
                        const dpConf = this._shortIdDataPointConfigs[shortId];
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
                    Common.validateConnectionInterface(this.connection);
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
