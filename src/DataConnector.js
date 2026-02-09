(function (root) {
    "use strict";
    const DataConnector = {};
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    const RECEIVER = 'DataConnector';

    const TransmissionType = Object.freeze({
        ConfigurationRequest: 1,
        DataPointsConfigurationRefresh: 2,
        SubscriptionRequest: 3,
        DataRefresh: 4,
        ReadRequest: 5,
        WriteRequest: 6
    });

    class BaseConnector {
        constructor() {
            if (this.constructor === BaseConnector) {
                throw new Error('The abstract base class BaseConnector cannot be instantiated.')
            }
            this.connection = null;
            this.onError = Core.defaultOnError;
            this._handler = (data, onResponse, onError) => this.handleReceived(data, onResponse, onError);
        }

        set Connection(value) {
            if (value) {
                if (this.connection) {
                    this.connection.Unregister(RECEIVER);
                    this.connection = null;
                }
                Common.validateAsConnection(value, true);
                this.connection = value;
                this.connection.Register(RECEIVER, this._handler);
            } else if (this.connection) {
                this.connection.Unregister(RECEIVER);
                this.connection = null;
            }
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError() is not a function');
            }
            this.onError = value;
        }

        handleReceived(data, onResponse, onError) {
            throw new Error('Not implemented in base class: handleReceived(data, onResponse, onError)')
        }
    }

    function getAsDataPointsByDataId(dataPointConfigsByShortId) {
        return Core.getTransformedObject(dataPointConfigsByShortId,
            (shortId, config) => config.dataId,
            (shortId, dataPoint) => { return { shortId, type: dataPoint.type }; }
        );
    }

    // Client
    if (!isNodeJS) {
        class ClientDataConnector extends BaseConnector {
            constructor() {
                super();
                this._open = false;
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
            }

            GetType(dataId) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid data id: '${dataId}'`);
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                return dataPoint ? dataPoint.type : Core.DataType.Unknown;
            }

            SubscribeData(dataId, onRefresh) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid subscription id '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Subscription callback onRefresh(value) for id '${dataId}' is not a function`);
                }
                let dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    dataPoint = this._dataPointsByDataId[dataId] = {
                        value: null,
                        Subscribe: onRefresh => this.SubscribeData(dataId, onRefresh),
                        Unsubscribe: onRefresh => this.UnsubscribeData(dataId, onRefresh)
                    };
                } else if (dataPoint.onRefresh === onRefresh) {
                    this._onError(`Data id '${dataId}' is already subscribed with this callback`);
                } else if (dataPoint.onRefresh !== null) {
                    this._onError(`Data id '${dataId}' is already subscribed with another callback`);
                }
                dataPoint.onRefresh = onRefresh;
                this._subscriptionsChanged();
                if (dataPoint.value !== null) {
                    try {
                        onRefresh(dataPoint.value);
                    } catch (error) {
                        throw new Error(`Failed calling onRefresh(value) for '${dataId}':\n${error.message}`);
                    }
                }
            }

            UnsubscribeData(dataId, onRefresh) {
                if (typeof dataId !== 'string') {
                    throw new Error(`Invalid unsubscription id '${dataId}'`);
                } else if (typeof onRefresh !== 'function') {
                    throw new Error(`Unsubscription callback onRefresh(value) for id '${dataId}' is not a function`);
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    this._onError(`Data point with id '${dataId}' is not available to unsubscribe`);
                    return;
                } else if (dataPoint.onRefresh === null) {
                    this._onError(`Data point with id '${dataId}' is not subscribed`);
                } else if (dataPoint.onRefresh !== onRefresh) {
                    this._onError(`Data point with id '${dataId}' is subscribed with a another callback`);
                }
                dataPoint.onRefresh = null;
                if (!dataPoint.shortId) { // If not exists on target system we delete
                    delete this._dataPointsByDataId[dataId];
                }
                this._subscriptionsChanged();
            }

            Read(dataId, onResponse, onError) {
                if (!this._open) {
                    onError('Cannot Read() because not connected');
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    onError(`Unsupported data id for read: '${dataId}'`);
                }
                Core.validateAs('Connection', this.connection, 'Send:function').Send(RECEIVER,
                    { type: TransmissionType.ReadRequest, shortId: dataPoint.shortId },
                    value => {
                        try {
                            onResponse(value);
                        } catch (error) {
                            this._onError(`Failed calling onResponse() for id '${dataId}':\n${error.message}`);
                        }
                        const dataPoint = this._dataPointsByDataId[dataId];
                        if (dataPoint) {
                            dataPoint.value = value;
                            if (dataPoint.onRefresh && value !== null) {
                                try {
                                    dataPoint.onRefresh(value);
                                } catch (error) {
                                    this._onError(`Failed calling onRefresh(value) for id '${dataId}':\n${error.message}`);
                                }
                            }
                        }
                    },
                    onError
                );
            }

            Write(dataId, value) {
                if (!this._open) {
                    throw new Error('Cannot Write() because not connected');
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (!dataPoint) {
                    throw new Error(`Unsupported data id for read: '${dataId}'`);
                }
                Core.validateAs('Connection', this.connection, 'Send:function').Send(RECEIVER,
                    { type: TransmissionType.WriteRequest, shortId: dataPoint.shortId, value }
                );
            }

            OnOpen() {
                this._loadConfiguration();
            }

            OnClose() {
                this._open = false;
                clearTimeout(this._subscribeDelayTimer);
                this._subscribeDelayTimer = null;
            }

            handleReceived(data, onResponse, onError) {
                if (this._open) {
                    switch (data.type) {
                        case TransmissionType.DataPointsConfigurationRefresh:
                            console.log(`### ==> DataPointsConfigurationRefresh: ${JSON.stringify(data.dataPointConfigsByShortId)}`); // TODO: Remove
                            this._setDataPointConfigsByShortId(data.dataPointConfigsByShortId);
                            this._sendSubscriptionRequest();
                            break;
                        case TransmissionType.DataRefresh:
                            for (const shortId in data.values) {
                                if (data.values.hasOwnProperty(shortId)) {
                                    const dpConfByShortId = this._dataPointConfigsByShortId[shortId];
                                    if (!dpConfByShortId) {
                                        this.onError(`Unexpected short id '${shortId}'`);
                                        continue;
                                    }
                                    const dataPoint = this._dataPointsByDataId[dpConfByShortId.dataId];
                                    if (!dataPoint) {
                                        this.onError(`Unsupported data id '${dpConfByShortId.dataId}'`);
                                        continue;
                                    }
                                    dataPoint.value = data.values[shortId];
                                    if (dataPoint.onRefresh && dataPoint.value !== null) {
                                        try {
                                            dataPoint.onRefresh(dataPoint.value);
                                            console.log(`Refreshed '${dpConfByShortId.dataId}'/${shortId}: ${dataPoint.value}`);
                                        } catch (error) {
                                            this._onError(`Failed calling onRefresh(value) for id '${dpConfByShortId.dataId}':\n${error.message}`);
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

            _loadConfiguration() {
                Core.validateAs('Connection', this.connection, 'Send:function').Send(RECEIVER, { type: TransmissionType.ConfigurationRequest }, config => {
                    this._subscribeDelay = typeof config.subscribeDelay === 'number' && config.subscribeDelay > 0 ? config.subscribeDelay : false;
                    this._unsubscribeDelay = typeof config.unsubscribeDelay === 'number' && config.unsubscribeDelay > 0 ? config.unsubscribeDelay : false;
                    this._setDataPointConfigsByShortId(config.dataPointConfigsByShortId);
                    this._open = true;
                    this._sendSubscriptionRequest();
                }, error => {
                    this._open = false;
                    this.onError(error);
                });
            }

            _setDataPointConfigsByShortId(dataPointConfigsByShortId) {
                this._dataPointConfigsByShortId = dataPointConfigsByShortId; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
                const that = this, oldDataPointsByDataId = this._dataPointsByDataId;
                this._dataPointsByDataId = getAsDataPointsByDataId(dataPointConfigsByShortId);
                // Check for all received data points if an old data point exists and if the case copy the content
                for (const dataId in this._dataPointsByDataId) {
                    if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                        const dataPoint = this._dataPointsByDataId[dataId];
                        (function () {
                            const did = dataId;
                            const oldDataPoint = oldDataPointsByDataId ? oldDataPointsByDataId[dataId] : null;
                            if (oldDataPoint) {
                                dataPoint.value = oldDataPoint.value;
                                dataPoint.onRefresh = oldDataPoint.onRefresh;
                                dataPoint.Subscribe = oldDataPoint.Subscribe;
                                dataPoint.Unsubscribe = oldDataPoint.Unsubscribe;
                                delete oldDataPointsByDataId[dataId];
                            } else {
                                dataPoint.value = null;
                                // Note: We must use closure 'did' here instead of 'dataId'
                                dataPoint.Subscribe = onRefresh => that.SubscribeData(did, onRefresh);
                                dataPoint.Unsubscribe = onRefresh => that.UnsubscribeData(did, onRefresh);
                            }
                        }());
                    }
                }
                // Clean up old data points not existing anymore and that are not subscribed
                if (oldDataPointsByDataId) {
                    for (const dataId in oldDataPointsByDataId) {
                        if (oldDataPointsByDataId.hasOwnProperty(dataId)) {
                            const oldDataPoint = oldDataPointsByDataId[dataId];
                            delete oldDataPoint.shortId;
                            if (oldDataPoint.onRefresh) {
                                this._dataPointsByDataId[dataId] = oldDataPoint;
                            } else {
                                delete oldDataPoint.value;
                                delete oldDataPoint.Subscribe;
                                delete oldDataPoint.Unsubscribe;
                                delete oldDataPointsByDataId[dataId];
                            }
                        }
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
                if (this._open) {
                    // Build a string with all short ids of the currently subscribed data point and send to server
                    let subs = '';
                    for (const dataId in this._dataPointsByDataId) {
                        if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataPointsByDataId[dataId];
                            if (dataPoint.shortId && dataPoint.onRefresh) {
                                subs += dataPoint.shortId;
                            }
                        }
                    }
                    Core.validateAs('Connection', this.connection, 'Send:function').Send(RECEIVER,
                        { type: TransmissionType.SubscriptionRequest, subs }
                    );
                    console.log(`### ==> SubscriptionRequest: '${subs}'`);
                }
            }
        }
        DataConnector.ClientConnector = ClientDataConnector;
    }

    // Server
    if (isNodeJS) {

        const SHORT_ID_PREFIX = '#';
        const subscribeRequestShortIdRegex = /#[a-z0-9]+\b/g;

        class ServerDataConnector extends BaseConnector {
            constructor() {
                super();
                this._isOpen = false;
                this._source = null;
                this._getNextShortId = Core.createIdGenerator(SHORT_ID_PREFIX);
                this._dataPointConfigsByShortId = null;
                this._onEventCallbacksByDataId = {};
                this._dataPointsByDataId = null;
                this._values = null;
                this._subscribeDelay = false;
                this._unsubscribeDelay = false;
                this._sendDelay = false;
                this._sendDelayTimer = null;
                Common.validateAsServerConnector(this, true);
            }

            set Source(value) {
                if (value) {
                    Common.validateAsDataAccessObject(value, true);
                    this._source = value;
                } else {
                    this._source = null;
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

            SetDataPoints(dataPointConfigs, send) { // TODO: What about 'send'? When should this be true or false???
                if (!Array.isArray(dataPointConfigs)) {
                    throw new Error('Data points must be passed as an array');
                }
                console.log(`### ==> SetDataPoints(${dataPointConfigs.length})`);
                // Build object containing all datapoints stored under e new generated unique id like:
                // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
                const dataPointConfigsByShortId = {};
                for (const dpConf of dataPointConfigs) {
                    const dataId = dpConf.id;
                    if (typeof dataId !== 'string') {
                        throw new Error(`Data point has invalid data id: ${dataId}`);
                    }
                    const type = dpConf.type;
                    if (typeof type !== 'number') {
                        throw new Error(`Data point has invalid type: ${type}`);
                    }
                    dataPointConfigsByShortId[this._getNextShortId()] = { dataId, type };
                }
                this._dataPointConfigsByShortId = dataPointConfigsByShortId;
                const oldDataPointsByDataId = this._dataPointsByDataId;
                this._dataPointsByDataId = getAsDataPointsByDataId(dataPointConfigsByShortId);
                // Copy value and callback if old datapoint found in new data points
                if (oldDataPointsByDataId) {
                    for (const dataId in oldDataPointsByDataId) {
                        if (oldDataPointsByDataId.hasOwnProperty(dataId)) {
                            const oldDataPoint = oldDataPointsByDataId[dataId];
                            const dataPoint = this._dataPointsByDataId[dataId];
                            if (dataPoint) {
                                dataPoint.value = oldDataPoint.value;
                                dataPoint.onRefresh = oldDataPoint.onRefresh;
                                console.log(`### ==> reused old datapoint items '${dataId}' (sub: ${(typeof oldDataPoint.onRefresh === 'function')}, old:${oldDataPoint.shortId}, new:${dataPoint.shortId})`);
                            } else if (oldDataPoint.onRefresh) {
                                this._dataPointsByDataId[dataId] = oldDataPoint;
                                console.log(`### ==> reused whole old datapoint '${dataId}' (sub: ${(typeof oldDataPoint.onRefresh === 'function')}, old:${oldDataPoint.shortId})`);
                            }
                            delete oldDataPointsByDataId[dataId];
                        }
                    }
                }
                if (this._isOpen && send === true) {
                    Core.validateAs('Connection', this.connection, 'Send:function').Send(RECEIVER, { type: TransmissionType.DataPointsConfigurationRefresh, dataPointConfigsByShortId });
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
                            Core.validateAs('DataAccessObject', this._source, 'Read:function').Read(readDPConf.dataId, onResponse, onError);
                            break;
                        case TransmissionType.WriteRequest:
                            let writeDPConf = this._dataPointConfigsByShortId[data.shortId];
                            if (!writeDPConf) {
                                this.onError('Unknown data point for write request');
                                return;
                            }
                            Core.validateAs('DataAccessObject', this._source, 'Write:function').Write(writeDPConf.dataId, data.value);
                            break;
                        default:
                            this.onError(`Invalid transmission type: ${data.type}`);
                    }
                }
            }

            _updateSubscriptions(subscriptionShorts) {
                if (this._isOpen) {
                    Core.validateAs('DataAccessObject', this._source, ['SubscribeData:function', 'UnsubscribeData:function']);
                    for (const dataId in this._dataPointsByDataId) {
                        if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataPointsByDataId[dataId];
                            if (dataPoint.onRefresh && subscriptionShorts.indexOf(dataPoint.shortId) < 0) {
                                try {
                                    this._source.UnsubscribeData(dataId, dataPoint.onRefresh);
                                    console.log(`### ==> unsubscribed datapoint '${dataId}' (short:${dataPoint.shortId})`);
                                } catch (error) {
                                    this.onError(`Failed unsubscribing data point with id '${dataId}':\n${error.message}`);
                                }
                                dataPoint.onRefresh = null;
                            }
                        }
                    }
                    Regex.each(subscribeRequestShortIdRegex, subscriptionShorts, (start, end, match) => {
                        // we are in a closure -> shortId/id will be available in onRefresh()
                        const shortId = match[0];
                        const dpConf = this._dataPointConfigsByShortId[shortId];
                        if (dpConf) {
                            const dataId = dpConf.dataId;
                            const dataPoint = this._dataPointsByDataId[dataId];
                            if (dataPoint) {
                                if (!dataPoint.onRefresh) {
                                    dataPoint.onRefresh = value => {
                                        if (!this._values) {
                                            this._values = {};
                                        }
                                        this._values[shortId] = value;
                                        this._valuesChanged();
                                    };
                                    try {
                                        this._source.SubscribeData(dataId, dataPoint.onRefresh);
                                        console.log(`### ==> subscribed datapoint '${dataId}' (short:${dataPoint.shortId})`);
                                    } catch (error) {
                                        this.onError(`Failed subscribing data point with id '${dataId}':\n${error.message}`);
                                    }
                                }
                            } else {
                                this.onError(`Cannot find data point with id '${dataId}' for short id '${shortId}'`);
                            }
                        } else {
                            this.onError(`Cannot subscribe unknown data point: ${shortId}, stored:${JSON.stringify(this._dataPointConfigsByShortId)}`); // TODO: Why we land here after stopping a task when items are monitored?
                        }
                    }, true);
                }
            }

            _updateSubscriptions_DISCARDED(subscriptionShorts) { // TODO: remove or reuse
                if (this._isOpen) {
                    Core.validateAs('DataAccessObject', this._source, ['SubscribeData:function', 'UnsubscribeData:function']);
                    for (const dataId in this._onEventCallbacksByDataId) {
                        if (this._onEventCallbacksByDataId.hasOwnProperty(dataId)) {
                            // TODO: This was 'const shortId = this._dataPointsByDataId[dataId];' but this makes no sense as _dataPointsByDataId stores objects like {shortId, type}
                            const dataPoint = this._dataPointsByDataId[dataId];
                            // TODO: What are we doing here?
                            const onRefresh = dataPoint && subscriptionShorts.indexOf(dataPoint.shortId) < 0 ? this._onEventCallbacksByDataId[dataId] : false;
                            if (onRefresh) {
                                delete this._onEventCallbacksByDataId[dataId];
                                this._source.UnsubscribeData(dataId, onRefresh);
                            }
                        }
                    }
                    Regex.each(subscribeRequestShortIdRegex, subscriptionShorts, (start, end, match) => {
                        // we are in a closure -> shortId/id will be available in onRefresh()
                        const shortId = match[0];
                        const dpConf = this._dataPointConfigsByShortId[shortId];
                        if (dpConf) {
                            if (!this._onEventCallbacksByDataId[dpConf.dataId]) {
                                const onRefresh = value => {
                                    if (!this._values) {
                                        this._values = {};
                                    }
                                    this._values[shortId] = value;
                                    this._valuesChanged();
                                };
                                this._onEventCallbacksByDataId[dpConf.dataId] = onRefresh;
                                this._source.SubscribeData(dpConf.dataId, onRefresh);
                            }
                        } else {
                            this.onError(`Cannot subscribe: ${shortId}`); // TODO: Why we land here after stopping a task when items are monitored?
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
                    Core.validateAs('Connection', this.connection, 'Send:function').Send(RECEIVER,
                        { type: TransmissionType.DataRefresh, values: this._values }
                    );
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
