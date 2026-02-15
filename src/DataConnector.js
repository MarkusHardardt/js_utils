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

    function getDataPointConfigsByShortId(dataPoints, getNextShortId) {
        // Build object containing all datapoints stored under e new generated unique id like:
        // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
        if (!Array.isArray(dataPoints)) {
            throw new Error('Data points must be passed as an array');
        }
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
            dataPointConfigsByShortId[getNextShortId()] = { dataId, type };
        }
        return dataPointConfigsByShortId;
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
            this._dataPointsByDataId = {};
            this._subscribeDelay = false;
            this._unsubscribeDelay = false;
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

        SetDataPoints(dataPoints) { // TODO: Unsubscribe data points that not exist anymore immediately
            this._log('info', `SetDataPoints(${dataPoints.length})`);
            const dataPointConfigsByShortId = this._dataPointConfigsByShortId = getDataPointConfigsByShortId(dataPoints, this._getNextShortId);
            const that = this;
            // For all data point configurations we ether reuse an existing or add a new data point.
            for (const shortId in dataPointConfigsByShortId) {
                if (dataPointConfigsByShortId.hasOwnProperty(shortId)) {
                    const config = dataPointConfigsByShortId[shortId];
                    (function () { // We need a closure here to get access to the data point in onRefresh
                        const dataId = config.dataId;
                        let dataPoint = that._dataPointsByDataId[dataId];
                        if (dataPoint) {
                            that._log('info', `Update short id ${dataPoint.shortId}->${shortId}:'${dataId}' (${dataPoint.isSubscribed ? '' : '!'}subscribed)`);
                            dataPoint.shortId = shortId; // Note: Only data points with a short id exists!
                            dataPoint.type = config.type;
                        } else {
                            that._log('info', `Create data point ${shortId}:'${dataId}'`);
                            that._dataPointsByDataId[dataId] = dataPoint = {
                                shortId,
                                type: config.type,
                                value: null,
                                onRefresh: value => {
                                    dataPoint.value = value;
                                    dataPoint.hasBeenRefreshed = true;
                                    that._valuesChanged();
                                },
                                hasBeenRefreshed: false,
                                isSubscribed: false
                            };
                        }
                    }());
                }
            }
            // For all stored and unsubscribed data points we check if it still exists and if not we remove.
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    let exists = false;
                    for (const shortId in dataPointConfigsByShortId) {
                        if (dataPointConfigsByShortId.hasOwnProperty(shortId)) {
                            const config = dataPointConfigsByShortId[shortId];
                            if (config.dataId === dataId) {
                                exists = true;
                                break;
                            }
                        }
                    }
                    if (!exists) {
                        const dataPoint = this._dataPointsByDataId[dataId];
                        if (dataPoint.isSubscribed) {
                            if (this._source) {
                                try {
                                    this._source.UnsubscribeData(dataId, dataPoint.onRefresh);
                                    this._log('info', `Unsubscribed datapoint ${dataPoint.shortId}:'${dataId}' (!exists && subscribed)`);
                                } catch (error) {
                                    this._onError(`Failed unsubscribing data point with id ${dataPoint.shortId}:'${dataId}':\n${error.message}`);
                                }
                                dataPoint.isSubscribed = false;
                            }
                            this._log('info', `Delete short id ${dataPoint.shortId}:'${dataId}' (!exists && subscribed)`);
                            delete dataPoint.shortId; // Note: Only data points with a short id exists!
                        } else {
                            this._log('info', `Delete data point ${dataPoint.shortId}:'${dataId}' (!exists && !subscribed)`);
                            delete this._dataPointsByDataId[dataId];
                        }
                    };
                }
            }
            if (this._isOpen) {
                this._sendConfiguration();
            }
        }

        OnOpen() {
            this._isOpen = true;
            this._sendConfiguration();
            this._sendValues();
        }

        OnClose() {
            this._isOpen = false;
            clearTimeout(this._sendTimer);
            this._sendTimer = null;
            this._log('info', 'Reset all subscribsions onClose()');
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
                        this._log('info', `Update subscriptions from client: [${data.subs}]`);
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
                    // Note: Only data points with a short id exists!
                    if (dataPoint.isSubscribed && (!dataPoint.shortId || subscriptionShorts.indexOf(dataPoint.shortId) < 0)) {
                        try {
                            this._source.UnsubscribeData(dataId, dataPoint.onRefresh);
                            this._log('info', `Unsubscribed datapoint ${dataPoint.shortId}:'${dataId}'`);
                        } catch (error) {
                            this._onError(`Failed unsubscribing data point with id ${dataPoint.shortId}:'${dataId}':\n${error.message}`);
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
                                this._log('info', `Subscribed datapoint ${shortId}:'${dataId}'`);
                            } catch (error) {
                                this._onError(`Failed subscribing data point with id ${shortId}:'${dataId}':\n${error.message}`);
                            }
                        }
                    } else {
                        this._onError(`Cannot find data point with id ${shortId}:'${dataId}'`);
                    }
                } else {
                    // TODO: Why we land here after stopping a task when items are monitored?
                    this._onError(`Cannot subscribe unknown data point with short id ${shortId}, stored:${JSON.stringify(this._dataPointConfigsByShortId)}`);
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
            if (this._isOpen) {
                const values = {};
                let available = false;
                for (const dataId in this._dataPointsByDataId) {
                    if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                        const dataPoint = this._dataPointsByDataId[dataId];
                        if (dataPoint.shortId && dataPoint.hasBeenRefreshed) {
                            dataPoint.hasBeenRefreshed = false;
                            if (dataPoint.value !== undefined && dataPoint.value !== null) {
                                values[dataPoint.shortId] = dataPoint.value;
                                available = true;
                            }
                        }
                    }
                }
                if (available) {
                    try {
                        Core.validateAs('Connection', this._connection, 'Send:function').Send(RECEIVER,
                            { type: TransmissionType.DataRefresh, values }
                        );
                    } catch (error) {
                        this._onError(`Failed to send refreshed values:\n${error.message}`);
                    }
                }
            }
        }
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
            Common.validateAsConnector(this, true);
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
                    // Note: SubscribeData(dataId, onRefresh) is a closure for dataId!
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
            if (!dataPoint || !dataPoint.shortId) { // This means the datapoint not exists on server side
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
                        this._refresh(data.values);
                        break;
                    default:
                        this._onError(`Invalid transmission type: ${data.type}`);
                }
            }
        }

        _setDataPointConfigsByShortId(dataPointConfigsByShortId) {
            this._dataPointConfigsByShortId = dataPointConfigsByShortId; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
            const that = this;
            // For all data point configurations we ether reuse an existing or add a new data point.
            for (const shortId in dataPointConfigsByShortId) {
                if (dataPointConfigsByShortId.hasOwnProperty(shortId)) {
                    const config = dataPointConfigsByShortId[shortId];
                    (function () { // We need a closure here to get access to the data point in onRefresh
                        const dataId = config.dataId;
                        let dataPoint = that._dataPointsByDataId[dataId];
                        if (dataPoint) {
                            that._log('info', `Update short id ${dataPoint.shortId}->${shortId}:'${dataId}' (${dataPoint.onRefresh !== null ? '' : '!'}subscribed)`);
                            dataPoint.shortId = shortId;
                            dataPoint.type = config.type;
                        } else {
                            that._log('info', `Create data point ${shortId}:'${dataId}'`);
                            that._dataPointsByDataId[dataId] = dataPoint = {
                                shortId,
                                type: config.type,
                                value: null,
                                onRefresh: null,
                                Subscribe: onRefresh => that.SubscribeData(dataId, onRefresh),
                                Unsubscribe: onRefresh => that.UnsubscribeData(dataId, onRefresh)
                            };
                        }
                    }());
                }
            }
            // For all stored and unsubscribed data points we check if it still exists and if not we remove.
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    let exists = false;
                    for (const shortId in dataPointConfigsByShortId) {
                        if (dataPointConfigsByShortId.hasOwnProperty(shortId)) {
                            const config = dataPointConfigsByShortId[shortId];
                            if (config.dataId === dataId) {
                                exists = true;
                                break;
                            }
                        }
                    }
                    if (!exists) {
                        const dataPoint = this._dataPointsByDataId[dataId];
                        if (dataPoint.onRefresh) {
                            this._log('info', `Delete short id ${dataPoint.shortId}:'${dataId}' (!exists && subscribed)`);
                            delete dataPoint.shortId;
                        } else {
                            this._log('info', `Delete data point ${dataPoint.shortId}:'${dataId}' (!exists && !subscribed)`);
                            delete this._dataPointsByDataId[dataId];
                        }
                    };
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

        _refresh(values) {
            for (const shortId in values) {
                if (values.hasOwnProperty(shortId)) {
                    const dpConfByShortId = this._dataPointConfigsByShortId[shortId];
                    if (!dpConfByShortId) {
                        this._onError(`Unexpected short id '${shortId}'`);
                        continue;
                    }
                    const dataId = dpConfByShortId.dataId;
                    const dataPoint = this._dataPointsByDataId[dataId];
                    if (!dataPoint) {
                        this._onError(`Unsupported data id ${shortId}:'${dataId}'`);
                        continue;
                    }
                    dataPoint.value = values[shortId];
                    if (dataPoint.onRefresh && dataPoint.value !== undefined && dataPoint.value !== null) {
                        try {
                            dataPoint.onRefresh(dataPoint.value);
                            this._log('info', `Refreshed ${shortId}:'${dataId}': ${dataPoint.value}`);
                        } catch (error) {
                            this._onError(`Failed calling onRefresh(value) for ${shortId}:'${dataId}':\n${error.message}`);
                        }
                    }
                }
            }
        }
    }

    DataConnector.getInstance = () => isNodeJS ? new ServerDataConnector() : new ClientDataConnector();

    Object.freeze(DataConnector);
    if (isNodeJS) {
        module.exports = DataConnector;
    } else {
        root.DataConnector = DataConnector;
    }
}(globalThis));
