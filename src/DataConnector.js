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
        ObserverRequest: 2,
        DataRefresh: 3,
        ReadRequest: 4,
        WriteRequest: 5
    });

    class BaseConnector {
        #handler;
        constructor() {
            if (this.constructor === BaseConnector) {
                throw new Error('The abstract base class BaseConnector cannot be instantiated.')
            }
            this._connection = null;
            this.#handler = (data, onResponse, onError) => this._handleReceived(data, onResponse, onError);
        }
        set connection(value) {
            if (value) {
                if (this._connection) {
                    this._connection.unregister(RECEIVER);
                    this._connection = null;
                }
                Common.validateAsConnection(value, true);
                this._connection = value;
                this._connection.register(RECEIVER, this.#handler);
            } else if (this._connection) {
                this._connection.unregister(RECEIVER);
                this._connection = null;
            }
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

    const SHORT_ID_PREFIX = '<';
    const SHORT_ID_SUFFIX = '>';
    const subscribeRequestShortIdRegex = /<[a-z0-9]+>/g;
    class ServerDataConnector extends BaseConnector {
        #logger;
        #isOpen;
        #source;
        #getNextShortId;
        #dataPointConfigsByShortId;
        #dataPointsByDataId;
        #sendObserverRequestDelay;
        #sendDelay;
        #sendTimer;
        constructor(logger) {
            super();
            this.#logger = Common.validateAsLogger(logger, true);
            this.#isOpen = false;
            this.#source = null;
            this.#getNextShortId = Core.createIdGenerator(SHORT_ID_PREFIX, SHORT_ID_SUFFIX);
            this.#dataPointConfigsByShortId = null;
            this.#dataPointsByDataId = {};
            this.#sendObserverRequestDelay = false;
            this.#sendDelay = false;
            this.#sendTimer = null;
            Common.validateAsServerConnector(this, true);
        }
        set source(value) {
            if (value) {
                Common.validateAsDataAccessObject(value, true);
                this.#source = value;
            } else {
                this.#source = null;
            }
        }
        set sendDelay(value) {
            this.#sendDelay = typeof value === 'number' && value > 0 ? value : false;
        }
        set sendObserverRequestDelay(value) {
            this.#sendObserverRequestDelay = typeof value === 'number' && value > 0 ? value : false;
        }
        setDataPoints(dataPoints) {
            const dataPointConfigsByShortId = this.#dataPointConfigsByShortId = getDataPointConfigsByShortId(dataPoints, this.#getNextShortId);
            const that = this;
            // For all data point configurations we ether reuse an existing or add a new data point.
            for (const shortId in dataPointConfigsByShortId) {
                if (dataPointConfigsByShortId.hasOwnProperty(shortId)) {
                    const config = dataPointConfigsByShortId[shortId];
                    (function () { // We need a closure here to get access to the data point in onRefresh
                        const dataId = config.dataId;
                        let dataPoint = that.#dataPointsByDataId[dataId];
                        if (dataPoint) {
                            that.#logger.trace(`DataConnector.setDataPoints(): Update short id ${dataPoint.shortId}->${shortId}:'${dataId}' (${dataPoint.isObserved ? '' : '!'}observed)`);
                            dataPoint.shortId = shortId; // Note: Only data points with a short id exists!
                            dataPoint.type = config.type;
                        } else {
                            that.#logger.trace(`DataConnector.setDataPoints(): Create data point ${shortId}:'${dataId}'`);
                            that.#dataPointsByDataId[dataId] = dataPoint = {
                                shortId,
                                type: config.type,
                                value: null,
                                onRefresh: value => {
                                    dataPoint.value = value;
                                    dataPoint.hasBeenRefreshed = true;
                                    that.#valuesChanged();
                                },
                                hasBeenRefreshed: false,
                                isObserved: false
                            };
                        }
                    }());
                }
            }
            // For all stored and unsubscribed data points we check if it still exists and if not we remove.
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId)) {
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
                        const dataPoint = this.#dataPointsByDataId[dataId];
                        if (dataPoint.isObserved) {
                            if (this.#source) {
                                try {
                                    this.#source.unregisterObserver(dataId, dataPoint.onRefresh);
                                    this.#logger.trace(`DataConnector.setDataPoints(): Removed observer for data point ${dataPoint.shortId}:'${dataId}' (!exists && observed)`);
                                } catch (error) {
                                    this.#logger.error(`DataConnector.setDataPoints(): Failed removing observer for data point with id ${dataPoint.shortId}:'${dataId}'`, error);
                                }
                                dataPoint.isObserved = false;
                            }
                            this.#logger.trace(`DataConnector.setDataPoints(): Delete short id ${dataPoint.shortId}:'${dataId}' (!exists && observed)`);
                            delete dataPoint.shortId; // Note: Only data points with a short id exists!
                        } else {
                            this.#logger.trace(`DataConnector.setDataPoints(): Delete data point ${dataPoint.shortId}:'${dataId}' (!exists && !observed)`);
                            delete this.#dataPointsByDataId[dataId];
                        }
                    };
                }
            }
            if (this.#isOpen) {
                this.#sendConfiguration();
            }
        }
        onOpen() {
            this.#isOpen = true;
            this.#sendConfiguration();
            this.#sendValues();
        }
        onClose() {
            this.#isOpen = false;
            clearTimeout(this.#sendTimer);
            this.#sendTimer = null;
            this.#logger.debug('DataConnector.onClose(): Reset all observers onClose()');
            this.#updateObservations('');
        }
        #sendConfiguration() {
            Core.validateAs('Connection', this._connection, 'send:function').send(RECEIVER, {
                type: TransmissionType.ConfigurationRefresh,
                sendObserverRequestDelay: this.#sendObserverRequestDelay,
                dataPointConfigsByShortId: this.#dataPointConfigsByShortId
            });
        }
        _handleReceived(data, onResponse, onError) {
            if (this.#isOpen) {
                switch (data.type) {
                    case TransmissionType.ObserverRequest:
                        this.#logger.trace(`DataConnector._handleReceived(): Update observers from client: [${data.observations}]`);
                        this.#updateObservations(data.observations);
                        break;
                    case TransmissionType.ReadRequest:
                        let readDPConf = this.#dataPointConfigsByShortId[data.shortId];
                        if (!readDPConf) {
                            this.#logger.error('DataConnector._handleReceived(): Unknown data point for read request');
                            return;
                        }
                        try {
                            Core.validateAs('DataAccessObject', this.#source, 'read:function').read(readDPConf.dataId, onResponse, onError);
                        } catch (error) {
                            this.#logger.error(`DataConnector._handleReceived(): Failed calling read('${readDPConf.dataId}')`, error);
                        }
                        break;
                    case TransmissionType.WriteRequest:
                        let writeDPConf = this.#dataPointConfigsByShortId[data.shortId];
                        if (!writeDPConf) {
                            this.#logger.error('DataConnector._handleReceived(): Unknown data point for write request');
                            return;
                        }
                        try {
                            Core.validateAs('DataAccessObject', this.#source, 'write:function').write(writeDPConf.dataId, data.value);
                        } catch (error) {
                            this.#logger.error(`DataConnector._handleReceived(): Failed calling write('${readDPConf.dataId}', value)`, error);
                        }
                        break;
                    default:
                        this.#logger.error(`DataConnector._handleReceived(): Invalid transmission type: ${data.type}`);
                }
            }
        }
        #updateObservations(observationShorts) {
            Core.validateAs('DataAccessObject', this.#source, ['registerObserver:function', 'unregisterObserver:function']);
            // First we unsubscribe all that have been observed but are no longer requested
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId)) {
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    // Note: Only data points with a short id exists!
                    if (dataPoint.isObserved && (!dataPoint.shortId || observationShorts.indexOf(dataPoint.shortId) < 0)) {
                        try {
                            this.#source.unregisterObserver(dataId, dataPoint.onRefresh);
                            this.#logger.trace(`DataConnector.updateObservations(): Unsubscribed datapoint ${dataPoint.shortId}:'${dataId}'`);
                        } catch (error) {
                            this.#logger.error(`DataConnector.updateObservations(): Failed unsubscribing data point with id ${dataPoint.shortId}:'${dataId}'`, error);
                        }
                        dataPoint.isObserved = false;
                    }
                }
            }
            Regex.each(subscribeRequestShortIdRegex, observationShorts, (start, end, match) => {
                // we are in a closure -> shortId/id will be available in onRefresh()
                const shortId = match[0];
                const dpConf = this.#dataPointConfigsByShortId[shortId];
                if (dpConf) {
                    const dataId = dpConf.dataId;
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    if (dataPoint) {
                        if (!dataPoint.isObserved) {
                            try {
                                this.#source.registerObserver(dataId, dataPoint.onRefresh);
                                dataPoint.isObserved = true;
                                this.#logger.trace(`DataConnector.updateObservations(): Observed data point ${shortId}:'${dataId}'`);
                            } catch (error) {
                                this.#logger.error(`DataConnector.updateObservations(): Failed observing data point with id ${shortId}:'${dataId}'`, error);
                            }
                        }
                    } else {
                        this.#logger.error(`DataConnector.updateObservations(): Cannot find data point with id ${shortId}:'${dataId}'`);
                    }
                } else {
                    // TODO: Why we land here after stopping a task when items are monitored?
                    this.#logger.error(`DataConnector.updateObservations(): Cannot observe unknown data point with short id ${shortId}, stored:${JSON.stringify(this.#dataPointConfigsByShortId)}`);
                }
            }, true);
        }
        #valuesChanged() {
            if (!this.#sendDelay) {
                this.#sendValues();
            } else if (!this.#sendTimer) {
                this.#sendTimer = setTimeout(() => {
                    this.#sendTimer = null;
                    this.#sendValues();
                }, this.#sendDelay);
            }
        }
        #sendValues() {
            if (this.#isOpen) {
                const values = {};
                let available = false;
                for (const dataId in this.#dataPointsByDataId) {
                    if (this.#dataPointsByDataId.hasOwnProperty(dataId)) {
                        const dataPoint = this.#dataPointsByDataId[dataId];
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
                        Core.validateAs('Connection', this._connection, 'send:function').send(RECEIVER,
                            { type: TransmissionType.DataRefresh, values }
                        );
                    } catch (error) {
                        this.#logger.error('DataConnector.sendValues(): Failed to send refreshed values', error);
                    }
                }
            }
        }
    }

    class ClientDataConnector extends BaseConnector {
        #logger;
        #open;
        #dataPointConfigsByShortId;
        #dataPointsByDataId;
        #sendObserverRequestDelay;
        #addObserverTimer;
        constructor(logger) {
            super();
            this.#logger = Common.validateAsLogger(logger, true);
            this.#open = false;
            this.#dataPointConfigsByShortId = null;
            this.#dataPointsByDataId = {};
            this.#sendObserverRequestDelay = false;
            this.#addObserverTimer = null;
            Common.validateAsDataAccessObject(this, true);
            Common.validateAsConnector(this, true);
        }
        getType(dataId) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid data id: '${dataId}'`);
            }
            const dataPoint = this.#dataPointsByDataId[dataId];
            return dataPoint ? dataPoint.type : Core.DataType.Unknown;
        }
        registerObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`Observer callback onRefresh(value) for id '${dataId}' is not a function`);
            }
            let dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint) {
                dataPoint = this.#dataPointsByDataId[dataId] = {
                    value: null,
                    onRefresh: null,
                    // Note: registerObserver(dataId, onRefresh) is a closure for dataId!
                    registerObserver: onRefresh => this.registerObserver(dataId, onRefresh),
                    unregisterObserver: onRefresh => this.unregisterObserver(dataId, onRefresh)
                };
            } else if (dataPoint.onRefresh === onRefresh) {
                this.#logger.error(`Data id '${dataId}' is already observed with this callback`);
            } else if (dataPoint.onRefresh !== null) {
                this.#logger.error(`Data id '${dataId}' is already observed with another callback`);
            }
            dataPoint.onRefresh = onRefresh;
            this.#observationsChanged();
            if (dataPoint.value !== undefined && dataPoint.value !== null) {
                try {
                    onRefresh(dataPoint.value);
                } catch (error) {
                    throw new Error(`Failed calling onRefresh(value) for '${dataId}':\n${error.message}`);
                }
            }
        }
        unregisterObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`Observer callback onRefresh(value) for id '${dataId}' is not a function`);
            }
            const dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint) {
                this.#logger.error(`Data point with id '${dataId}' is not available to observe`);
                return;
            } else if (dataPoint.onRefresh === null) {
                this.#logger.error(`Data point with id '${dataId}' is not observed`);
            } else if (dataPoint.onRefresh !== onRefresh) {
                this.#logger.error(`Data point with id '${dataId}' is observed with a another callback`);
            }
            dataPoint.onRefresh = null;
            if (!dataPoint.shortId) { // If not exists on target system we delete
                delete this.#dataPointsByDataId[dataId];
            }
            this.#observationsChanged();
        }
        read(dataId, onResponse, onError) {
            if (!this.#open) {
                onError('Cannot read() because not connected');
                return;
            }
            const dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint || !dataPoint.shortId) { // This means the datapoint not exists on server side
                onError(`Unknown data point with id '${dataId}' for read`);
                return;
            }
            Core.validateAs('Connection', this._connection, 'send:function').send(RECEIVER,
                { type: TransmissionType.ReadRequest, shortId: dataPoint.shortId },
                value => {
                    try {
                        onResponse(value);
                    } catch (error) {
                        this.#logger.error(`Failed calling onResponse() for id '${dataId}'`, error);
                    }
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    if (dataPoint) {
                        dataPoint.value = value;
                        if (dataPoint.onRefresh && value !== undefined && value !== null) {
                            try {
                                dataPoint.onRefresh(value);
                            } catch (error) {
                                this.#logger.error(`Failed calling onRefresh(value) for id '${dataId}'`, error);
                            }
                        }
                    }
                },
                onError
            );
        }
        write(dataId, value) {
            if (!this.#open) {
                throw new Error('Cannot write() because not connected');
            }
            const dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint || !dataPoint.shortId) { // This means the datapoint is unknown on server side
                throw new Error(`Unknown data point with id '${dataId}' for write`);
            }
            Core.validateAs('Connection', this._connection, 'send:function').send(RECEIVER,
                { type: TransmissionType.WriteRequest, shortId: dataPoint.shortId, value }
            );
        }
        onOpen() {
            this.#open = true;
        }
        onClose() {
            this.#open = false;
            if (this.#addObserverTimer) {
                clearTimeout(this.#addObserverTimer);
                this.#addObserverTimer = null;
            }
        }
        _handleReceived(data, onResponse, onError) {
            if (this.#open) {
                switch (data.type) {
                    case TransmissionType.ConfigurationRefresh:
                        this.#sendObserverRequestDelay = typeof data.sendObserverRequestDelay === 'number' && data.sendObserverRequestDelay > 0 ? data.sendObserverRequestDelay : false;
                        this.#setDataPointConfigsByShortId(data.dataPointConfigsByShortId);
                        this.#sendObserverRequest();
                        break;
                    case TransmissionType.DataRefresh:
                        this.#refresh(data.values);
                        break;
                    default:
                        this.#logger.error(`Invalid transmission type: ${data.type}`);
                }
            }
        }
        #setDataPointConfigsByShortId(dataPointConfigsByShortId) {
            this.#dataPointConfigsByShortId = dataPointConfigsByShortId; // { #0:{id0,type},#1:{id1,type},#2:{id2,type},#3:{id3,type},...}
            const that = this;
            // For all data point configurations we ether reuse an existing or add a new data point.
            for (const shortId in dataPointConfigsByShortId) {
                if (dataPointConfigsByShortId.hasOwnProperty(shortId)) {
                    const config = dataPointConfigsByShortId[shortId];
                    (function () { // We need a closure here to get access to the data point in onRefresh
                        const dataId = config.dataId;
                        let dataPoint = that.#dataPointsByDataId[dataId];
                        if (dataPoint) {
                            that.#logger.trace(`Update short id ${dataPoint.shortId}->${shortId}:'${dataId}' (${dataPoint.onRefresh !== null ? '' : '!'}observed)`);
                            dataPoint.shortId = shortId;
                            dataPoint.type = config.type;
                        } else {
                            that.#logger.trace(`Create data point ${shortId}:'${dataId}'`);
                            that.#dataPointsByDataId[dataId] = dataPoint = {
                                shortId,
                                type: config.type,
                                value: null,
                                onRefresh: null,
                                registerObserver: onRefresh => that.registerObserver(dataId, onRefresh),
                                unregisterObserver: onRefresh => that.unregisterObserver(dataId, onRefresh)
                            };
                        }
                    }());
                }
            }
            // For all stored and unsubscribed data points we check if it still exists and if not we remove.
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId)) {
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
                        const dataPoint = this.#dataPointsByDataId[dataId];
                        if (dataPoint.onRefresh) {
                            this.#logger.trace(`Delete short id ${dataPoint.shortId}:'${dataId}' (!exists && observed)`);
                            delete dataPoint.shortId;
                        } else {
                            this.#logger.trace(`Delete data point ${dataPoint.shortId}:'${dataId}' (!exists && !observed)`);
                            delete this.#dataPointsByDataId[dataId];
                        }
                    };
                }
            }
        }
        #observationsChanged() {
            if (!this.#sendObserverRequestDelay) {
                this.#sendObserverRequest();
            } else if (!this.#addObserverTimer) {
                this.#addObserverTimer = setTimeout(() => {
                    this.#sendObserverRequest();
                    this.#addObserverTimer = null;
                }, this.#sendObserverRequestDelay);
            }
        }
        #sendObserverRequest() {
            if (this.#open) {
                // Build a string with all short ids of the currently observed data point and send to server
                let observations = '';
                for (const dataId in this.#dataPointsByDataId) {
                    if (this.#dataPointsByDataId.hasOwnProperty(dataId)) {
                        const dataPoint = this.#dataPointsByDataId[dataId];
                        if (dataPoint.shortId && dataPoint.onRefresh) {
                            observations += dataPoint.shortId;
                        }
                    }
                }
                Core.validateAs('Connection', this._connection, 'send:function').send(RECEIVER,
                    { type: TransmissionType.ObserverRequest, observations }
                );
            }
        }
        #refresh(values) {
            for (const shortId in values) {
                if (values.hasOwnProperty(shortId)) {
                    const dpConfByShortId = this.#dataPointConfigsByShortId[shortId];
                    if (!dpConfByShortId) {
                        this.#logger.error(`Unexpected short id '${shortId}'`);
                        continue;
                    }
                    const dataId = dpConfByShortId.dataId;
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    if (!dataPoint) {
                        this.#logger.error(`Unsupported data id ${shortId}:'${dataId}'`);
                        continue;
                    }
                    dataPoint.value = values[shortId];
                    if (dataPoint.onRefresh && dataPoint.value !== undefined && dataPoint.value !== null) {
                        try {
                            dataPoint.onRefresh(dataPoint.value);
                            this.#logger.trace(`Refreshed ${shortId}:'${dataId}': ${dataPoint.value}`);
                        } catch (error) {
                            this.#logger.error(`Failed calling onRefresh(value) for ${shortId}:'${dataId}'`, error);
                        }
                    }
                }
            }
        }
    }

    DataConnector.getInstance = logger => isNodeJS ? new ServerDataConnector(logger) : new ClientDataConnector(logger);

    Object.freeze(DataConnector);
    if (isNodeJS) {
        module.exports = DataConnector;
    } else {
        root.DataConnector = DataConnector;
    }
}(globalThis));
