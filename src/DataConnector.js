(function (root) {
    "use strict";
    const DataConnector = {};
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    const RECEIVER = 'DataConnector';

    const TransmissionType = Object.freeze({
        ConfigurationRefresh: 1,
        SubscriptionRequest: 2,
        DataRefresh: 3,
        ReadRequest: 4,
        WriteRequest: 5
    });

    class BaseConnector {
        constructor() {
            if (this.constructor === BaseConnector) {
                throw new Error('The abstract base class BaseConnector cannot be instantiated.')
            }
            this._connection = null;
            this._log = Core.defaultLog;
            this._onError = Core.defaultOnError; // TODO: Use logging instead
            this._handler = (data, onResponse, onError) => this._handleReceived(data, onResponse, onError);
        }

        set Connection(value) {
            if (value) {
                if (this._connection) {
                    this._connection.Unregister(RECEIVER);
                    this._connection = null;
                }
                Common.validateAsConnection(value, true);
                this._connection = value;
                this._connection.Register(RECEIVER, this._handler);
            } else if (this._connection) {
                this._connection.Unregister(RECEIVER);
                this._connection = null;
            }
        }

        set Log(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for log() is not a function');
            }
            this._log = value;
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError() is not a function');
            }
            this._onError = value;
        }

        _handleReceived(data, onResponse, onError) {
            throw new Error('Not implemented in base class: _handleReceived(data, onResponse, onError)')
        }
    }

    function getAsDataPointsByDataId(dataPointConfigsByShortId) {
        return Core.getTransformedObject(dataPointConfigsByShortId,
            (shortId, config) => config.dataId,
            (shortId, dataPoint) => { return { shortId, type: dataPoint.type }; }
        );
    }

    const SHORT_ID_PREFIX = '#';
    const subscribeRequestShortIdRegex = /#[a-z0-9]+/g;
    class ServerDataConnector extends BaseConnector {
        constructor() {
            super();
            this._isOpen = false;
            this._source = null;
            this._getNextShortId = Core.createIdGenerator(SHORT_ID_PREFIX);
            this._dataPointConfigsByShortId = null;
            this._onEventCallbacksByDataId = {};
            this._dataPointsByDataId = null;
            this._subscribeDelay = false;
            this._unsubscribeDelay = false;
            this._valuesToSend = null;
            this._sendDelay = false;
            this._sendTimer = null;
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

        SetDataPoints(dataPoints) {
            if (!Array.isArray(dataPoints)) {
                throw new Error('Data points must be passed as an array');
            }
            this._log('info', `SetDataPoints(${dataPoints.length})`);
            // Build object containing all datapoints stored under e new generated unique id like:
            // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
            const dataPointConfigsByShortId = {};
            for (const dpConf of dataPoints) {
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
            const that = this, oldDataPointsByDataId = this._dataPointsByDataId;
            this._dataPointsByDataId = getAsDataPointsByDataId(dataPointConfigsByShortId);
            // Check for all received data points if an old data point exists and if the case copy the content
            for (const did in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(did)) {
                    const dataPoint = this._dataPointsByDataId[did];
                    (function () { // We need a closure here to store dataId
                        const dataId = did;
                        const shortId = dataPoint.shortId;
                        const oldDataPoint = oldDataPointsByDataId ? oldDataPointsByDataId[dataId] : null;
                        if (oldDataPoint) {
                            dataPoint.value = oldDataPoint.value;
                            dataPoint.onRefresh = oldDataPoint.onRefresh;
                            dataPoint.isSubscribed = oldDataPoint.isSubscribed;
                            delete oldDataPointsByDataId[dataId];
                            that._log('info', `Reused old datapoint items '${dataId}' (sub: ${oldDataPoint.isSubscribed}, old:${oldDataPoint.shortId}, new:${dataPoint.shortId})`);
                        } else {
                            dataPoint.value = null;
                            dataPoint.onRefresh = value => {
                                if (!that._valuesToSend) {
                                    that._valuesToSend = {};
                                }
                                that._valuesToSend[shortId] = value;
                                that._valuesChanged();
                            };
                            dataPoint.isSubscribed = false;
                        }
                    }());
                }
            }
            // Clean up old data points not existing anymore and that are not subscribed
            if (oldDataPointsByDataId) {
                for (const dataId in oldDataPointsByDataId) {
                    if (oldDataPointsByDataId.hasOwnProperty(dataId)) {
                        const oldDataPoint = oldDataPointsByDataId[dataId];
                        delete oldDataPointsByDataId[dataId];
                        delete oldDataPoint.shortId;
                        if (oldDataPoint.isSubscribed) {
                            this._dataPointsByDataId[dataId] = oldDataPoint;
                            this._log('info', `Reused whole old datapoint '${dataId}'`);
                        } else {
                            delete oldDataPoint.value;
                            delete oldDataPoint.onRefresh;
                            delete oldDataPoint.isSubscribed;
                        }
                    }
                }
            }
            if (this._isOpen) {
                this._sendConfiguration();
            }
        }

        OnOpen() {
            this._onOpen();
        }

        OnReopen() {
            this._onOpen();
        }

        OnClose() {
            this._onClose();
        }

        OnDispose() {
            this._onClose();
        }

        _onOpen() {
            this._isOpen = true;
            this._sendConfiguration();
            this._sendValues();
        }

        _onClose() {
            this._isOpen = false;
            clearTimeout(this._sendTimer);
            this._sendTimer = null;
            this._updateSubscriptions('');
        }

        _sendConfiguration() {
            Core.validateAs('Connection', this._connection, 'Send:function').Send(RECEIVER, {
                type: TransmissionType.ConfigurationRefresh,
                subscribeDelay: this._subscribeDelay,
                unsubscribeDelay: this._unsubscribeDelay,
                dataPointConfigsByShortId: this._dataPointConfigsByShortId
            });
        }

        _handleReceived(data, onResponse, onError) {
            if (this._isOpen) {
                switch (data.type) {
                    case TransmissionType.SubscriptionRequest:
                        this._updateSubscriptions(data.subs);
                        break;
                    case TransmissionType.ReadRequest:
                        let readDPConf = this._dataPointConfigsByShortId[data.shortId];
                        if (!readDPConf) {
                            this._onError('Unknown data point for read request');
                            return;
                        }
                        try {
                            Core.validateAs('DataAccessObject', this._source, 'Read:function').Read(readDPConf.dataId, onResponse, onError);
                        } catch (error) {
                            this._onError(`Failed calling Read('${readDPConf.dataId}'):\n${error.message}`);
                        }
                        break;
                    case TransmissionType.WriteRequest:
                        let writeDPConf = this._dataPointConfigsByShortId[data.shortId];
                        if (!writeDPConf) {
                            this._onError('Unknown data point for write request');
                            return;
                        }
                        try {
                            Core.validateAs('DataAccessObject', this._source, 'Write:function').Write(writeDPConf.dataId, data.value);
                        } catch (error) {
                            this._onError(`Failed calling Write('${readDPConf.dataId}', value):\n${error.message}`);
                        }
                        break;
                    default:
                        this._onError(`Invalid transmission type: ${data.type}`);
                }
            }
        }

        _updateSubscriptions(subscriptionShorts) {
            Core.validateAs('DataAccessObject', this._source, ['SubscribeData:function', 'UnsubscribeData:function']);
            // First we unsubscribe all that have been subscribed but are no longer requested
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    const dataPoint = this._dataPointsByDataId[dataId];
                    if (dataPoint.isSubscribed && subscriptionShorts.indexOf(dataPoint.shortId) < 0) {
                        try {
                            this._source.UnsubscribeData(dataId, dataPoint.onRefresh);
                            this._log('info', `Unsubscribed datapoint '${dataId}' (short:${dataPoint.shortId})`);
                        } catch (error) {
                            this._onError(`Failed unsubscribing data point with id '${dataId}':\n${error.message}`);
                        }
                        dataPoint.isSubscribed = false;
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
                        if (!dataPoint.isSubscribed) {
                            try {
                                this._source.SubscribeData(dataId, dataPoint.onRefresh);
                                dataPoint.isSubscribed = true;
                                this._log('info', `Subscribed datapoint '${dataId}' (short:${dataPoint.shortId})`);
                            } catch (error) {
                                this._onError(`Failed subscribing data point with id '${dataId}':\n${error.message}`);
                            }
                        }
                    } else {
                        this._onError(`Cannot find data point with id '${dataId}' for short id '${shortId}'`);
                    }
                } else {
                    this._onError(`Cannot subscribe unknown data point: ${shortId}, stored:${JSON.stringify(this._dataPointConfigsByShortId)}`); // TODO: Why we land here after stopping a task when items are monitored?
                }
            }, true);
        }

        _valuesChanged() {
            if (!this._sendDelay) {
                this._sendValues();
            } else if (!this._sendTimer) {
                this._sendTimer = setTimeout(() => {
                    this._sendTimer = null;
                    this._sendValues();
                }, this._sendDelay);
            }
        }

        _sendValues() {
            if (this._isOpen && this._valuesToSend) {
                Core.validateAs('Connection', this._connection, 'Send:function').Send(RECEIVER,
                    { type: TransmissionType.DataRefresh, values: this._valuesToSend }
                );
                this._valuesToSend = null;
            }
        }
    }
    if (isNodeJS) {
        DataConnector.ServerConnector = ServerDataConnector;
    }

    class ClientDataConnector extends BaseConnector {
        constructor() {
            super();
            this._open = false;
            this._dataPointConfigsByShortId = null;
            this._dataPointsByDataId = {};
            this._subscribeDelay = false;
            this._subscribeTimer = null;
            this._unsubscribeDelay = false;
            Common.validateAsDataAccessObject(this, true);
            Common.validateAsClientConnector(this, true);
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
                    onRefresh: null,
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
            if (dataPoint.value !== undefined && dataPoint.value !== null) {
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
                return;
            }
            const dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint || !dataPoint.shortId) { // This means the datapoint is unknown on server side
                onError(`Unknown data point with id '${dataId}' for read`);
                return;
            }
            Core.validateAs('Connection', this._connection, 'Send:function').Send(RECEIVER,
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
                        if (dataPoint.onRefresh && value !== undefined && value !== null) {
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
            if (!dataPoint || !dataPoint.shortId) { // This means the datapoint is unknown on server side
                throw new Error(`Unknown data point with id '${dataId}' for write`);
            }
            Core.validateAs('Connection', this._connection, 'Send:function').Send(RECEIVER,
                { type: TransmissionType.WriteRequest, shortId: dataPoint.shortId, value }
            );
        }

        OnOpen() {
            this._open = true;
        }

        OnClose() {
            this._open = false;
            if (this._subscribeTimer) {
                clearTimeout(this._subscribeTimer);
                this._subscribeTimer = null;
            }
        }

        _handleReceived(data, onResponse, onError) {
            if (this._open) {
                switch (data.type) {
                    case TransmissionType.ConfigurationRefresh:
                        // TODO: Remove this._log('info', `ConfigurationRefresh: ${JSON.stringify(data.dataPointConfigsByShortId)}`);
                        this._subscribeDelay = typeof data.subscribeDelay === 'number' && data.subscribeDelay > 0 ? data.subscribeDelay : false;
                        this._unsubscribeDelay = typeof data.unsubscribeDelay === 'number' && data.unsubscribeDelay > 0 ? data.unsubscribeDelay : false;
                        this._setDataPointConfigsByShortId(data.dataPointConfigsByShortId);
                        this._sendSubscriptionRequest();
                        break;
                    case TransmissionType.DataRefresh:
                        for (const shortId in data.values) {
                            if (data.values.hasOwnProperty(shortId)) {
                                const dpConfByShortId = this._dataPointConfigsByShortId[shortId];
                                if (!dpConfByShortId) {
                                    this._onError(`Unexpected short id '${shortId}'`);
                                    continue;
                                }
                                const dataPoint = this._dataPointsByDataId[dpConfByShortId.dataId];
                                if (!dataPoint) {
                                    this._onError(`Unsupported data id '${dpConfByShortId.dataId}'`);
                                    continue;
                                }
                                dataPoint.value = data.values[shortId];
                                if (dataPoint.onRefresh && dataPoint.value !== undefined && dataPoint.value !== null) {
                                    try {
                                        dataPoint.onRefresh(dataPoint.value);
                                        this._log('info', `Refreshed '${dpConfByShortId.dataId}'/${shortId}: ${dataPoint.value}`);
                                    } catch (error) {
                                        this._onError(`Failed calling onRefresh(value) for id '${dpConfByShortId.dataId}':\n${error.message}`);
                                    }
                                }
                            }
                        }
                        break;
                    default:
                        this._onError(`Invalid transmission type: ${data.type}`);
                }
            }
        }

        _setDataPointConfigsByShortId(dataPointConfigsByShortId) {
            this._dataPointConfigsByShortId = dataPointConfigsByShortId; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
            const that = this, oldDataPointsByDataId = this._dataPointsByDataId;
            this._dataPointsByDataId = getAsDataPointsByDataId(dataPointConfigsByShortId);
            // Check for all received data points if an old data point exists and if the case copy the content
            for (const did in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(did)) {
                    const dataPoint = this._dataPointsByDataId[did];
                    (function () { // We need a closure here to store dataId
                        const dataId = did;
                        const oldDataPoint = oldDataPointsByDataId ? oldDataPointsByDataId[dataId] : null;
                        if (oldDataPoint) {
                            dataPoint.value = oldDataPoint.value;
                            dataPoint.onRefresh = oldDataPoint.onRefresh;
                            dataPoint.Subscribe = oldDataPoint.Subscribe;
                            dataPoint.Unsubscribe = oldDataPoint.Unsubscribe;
                            delete oldDataPointsByDataId[dataId];
                        } else {
                            dataPoint.value = null;
                            dataPoint.onRefresh = null;
                            dataPoint.Subscribe = onRefresh => that.SubscribeData(dataId, onRefresh);
                            dataPoint.Unsubscribe = onRefresh => that.UnsubscribeData(dataId, onRefresh);
                        }
                    }());
                }
            }
            // Clean up old data points not existing anymore and that are not subscribed
            if (oldDataPointsByDataId) {
                for (const dataId in oldDataPointsByDataId) {
                    if (oldDataPointsByDataId.hasOwnProperty(dataId)) {
                        const oldDataPoint = oldDataPointsByDataId[dataId];
                        delete oldDataPointsByDataId[dataId];
                        delete oldDataPoint.shortId;
                        if (oldDataPoint.onRefresh) {
                            this._dataPointsByDataId[dataId] = oldDataPoint;
                        } else {
                            delete oldDataPoint.value;
                            delete oldDataPoint.onRefresh;
                            delete oldDataPoint.Subscribe;
                            delete oldDataPoint.Unsubscribe;
                        }
                    }
                }
            }
        }

        _subscriptionsChanged() {
            if (!this._subscribeDelay) {
                this._sendSubscriptionRequest();
            } else if (!this._subscribeTimer) {
                this._subscribeTimer = setTimeout(() => {
                    this._sendSubscriptionRequest();
                    this._subscribeTimer = null;
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
                Core.validateAs('Connection', this._connection, 'Send:function').Send(RECEIVER,
                    { type: TransmissionType.SubscriptionRequest, subs }
                );
            }
        }
    }
    if (!isNodeJS) {
        DataConnector.ClientConnector = ClientDataConnector;
    }

    Object.freeze(DataConnector);
    if (isNodeJS) {
        module.exports = DataConnector;
    } else {
        root.DataConnector = DataConnector;
    }
}(globalThis));
