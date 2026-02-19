(function (root) {
    "use strict";
    const DataPoint = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Node {
        #logger;
        #source;
        #onObserverRemoved;
        #isObserved;
        #value;
        #onRefresh;
        #observers;
        #removeObserverDelay;
        #removeObserverTimer;
        constructor(logger, source, onObserverRemoved) {
            this.#logger = logger;
            this.#source = source;
            this.#onObserverRemoved = onObserverRemoved;
            this.#isObserved = false;
            this.#value = null;
            this.#onRefresh = value => this.#refresh(value);
            this.#observers = [];
            this.#removeObserverDelay = false;
            this.#removeObserverTimer = null;
            Common.validateAsObservable(this, true);
        }

        set removeObserverDelay(value) {
            if (typeof value === 'number' && value > 0) {
                this.#removeObserverDelay = Math.ceil(value);
            } else {
                this.#removeObserverDelay = false;
                if (this.#removeObserverTimer) { // TODO: Do we need to do this here?
                    clearTimeout(this.#removeObserverTimer);
                    this.#removeObserverTimer = null;
                    try {
                        this.#logger.debug('Node.unregisterObserver() because removeObserverDelay has been reset');
                        this.#source.unregisterObserver(this.#onRefresh);
                    } catch (error) {
                        this.#logger.error('Failed removing observer', error);
                    }
                    this.#isObserved = false;
                    this.#onObserverRemoved();
                }
            }
        }

        get value() {
            return this.#value;
        }

        set value(value) {
            this.#refresh(value);
        }

        registerObserver(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            // If already stored and if we just call for refresh and return
            for (const observer of this.#observers) {
                if (observer === onRefresh) {
                    this.#logger.warn('onRefresh(value) has already been added');
                    if (this.#value !== undefined && this.#value !== null) {
                        try {
                            onRefresh(this.#value);
                        } catch (error) {
                            this.#logger.error('Failed calling onRefresh(value)', error);
                        }
                    }
                    return;
                }
            }
            this.#observers.push(onRefresh);
            if (!this.#isObserved && this.#observers.length === 1) { // If not observerd and the first add
                if (this.#removeObserverTimer) { // If still observed we just kill the timer
                    clearTimeout(this.#removeObserverTimer);
                    this.#removeObserverTimer = null;
                    this.#logger.debug('Node.registerObserver() has not been called but unregister timer has been interrupted');
                } else { // We subscribe on the source which should result in firering the refresh event
                    try {
                        this.#logger.debug('Node.registerObserver() for first added observer');
                        this.#source.registerObserver(this.#onRefresh); // Note: This may throw an exception if adding failed
                        this.#isObserved = true;
                    } catch (error) {
                        this.#logger.error('Failed adding observer on node', error);
                    }
                    return;
                }
            }
            if (this.#value !== undefined && this.#value !== null) { // Refresh if value is available
                try {
                    onRefresh(this.#value);
                } catch (error) {
                    this.#logger.error('Failed calling onRefresh(value)', error);
                }
            }
        }

        unregisterObserver(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            for (let i = 0; i < this.#observers.length; i++) {
                if (this.#observers[i] === onRefresh) {
                    this.#observers.splice(i, 1);
                    if (this.#isObserved && this.#observers.length === 0) { // If observed and the last observer has been removed
                        if (this.#removeObserverDelay) {
                            this.#removeObserverTimer = setTimeout(() => {
                                this.#removeObserverTimer = null;
                                try {
                                    this.#logger.debug('Node.unregisterObserver() after timeout');
                                    this.#source.unregisterObserver(this.#onRefresh);
                                } catch (error) {
                                    this.#logger.error('Failed removing observer on node', error);
                                }
                                this.#isObserved = false;
                                this.#onObserverRemoved();
                            }, this.#removeObserverDelay);
                        } else {
                            try {
                                this.#logger.debug('Node.unregisterObserver() without timeout');
                                this.#source.unregisterObserver(this.#onRefresh); // Note: This may throw an exception if removing failed
                            } catch (error) {
                                this.#logger.error('Failed removing observer on node', error);
                            }
                            this.#isObserved = false;
                            this.#onObserverRemoved();
                        }
                    }
                    return;
                }
            }
            this.#logger.warn('onRefresh(value) has already been removed');
        }

        addObserverToSource() { // TODO: Do we realy need this? If not, then remove!
            if (this.#removeObserverTimer) { // If still observed we kill the timer
                clearTimeout(this.#removeObserverTimer);
                this.#removeObserverTimer = null;
            }
            if (!this.#isObserved && this.#observers.length > 0) {
                try {
                    this.#logger.debug('Node.registerObserver() on addObserverToSource()');
                    this.#source.registerObserver(this.#onRefresh); // Note: This may throw an exception if adding failed
                    this.#isObserved = true;
                } catch (error) {
                    this.#logger.error('Failed adding observer on node', error);
                }
            }
        }

        removeObserverFromSource() {
            if (this.#removeObserverTimer) { // If still observed we kill the timer
                clearTimeout(this.#removeObserverTimer);
                this.#removeObserverTimer = null;
            }
            if (this.#isObserved) {
                try {
                    this.#logger.debug('Node.unregisterObserver() on removeObserverFromSource()');
                    this.#source.unregisterObserver(this.#onRefresh); // Note: This may throw an exception if removing failed
                } catch (error) {
                    this.#logger.error('Failed removing observer on node', error);
                }
                this.#isObserved = false;
                if (this.#observers.length === 0) {
                    this.#onObserverRemoved();
                }
            }
        }

        #refresh(value) {
            this.#value = value;
            if (this.#observers && value !== undefined && value !== null) {
                for (const onRefresh of this.#observers) {
                    try {
                        onRefresh(value);
                    } catch (error) {
                        this.#logger.error('Failed calling onRefresh(value)', error);
                    }
                }
            }
        }
    }

    class AccessPoint {
        #logger;
        #source;
        #removeObserverDelay;
        #dataPointsByDataId;
        constructor(logger, source) {
            this.#logger = Common.validateAsLogger(logger, true);
            this.#source = Common.validateAsDataAccessObject(source, true);
            this.#removeObserverDelay = false;
            this.#dataPointsByDataId = {};
            Common.validateAsDataAccessObject(this, true);
        }

        set removeObserverDelay(value) {
            this.#removeObserverDelay = typeof value === 'number' && value > 0 ? Math.ceil(value) : false;
            this.#setRemoveObserverDelayOnNodes(this.#removeObserverDelay);
        }

        #setRemoveObserverDelayOnNodes(delay) {
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId)) {
                    this.#dataPointsByDataId[dataId].node.removeObserverDelay = delay;
                }
            }
        }

        getType(dataId) {
            return this.#source.getType(dataId);
        }

        registerObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            let dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint) {
                this.#dataPointsByDataId[dataId] = dataPoint = {
                    registerObserver: onRefresh => {
                        this.#logger.debug(`From node AccessPoint.registerObserver('${dataId}') on source`);
                        this.#source.registerObserver(dataId, onRefresh);
                    },
                    unregisterObserver: onRefresh => {
                        this.#logger.debug(`From node AccessPoint.unregisterObserver('${dataId}') on source`);
                        this.#source.unregisterObserver(dataId, onRefresh);
                    }
                };
                const node = dataPoint.node = new Node(this.#logger, dataPoint, () => {
                    delete dataPoint.node;
                    delete this.#dataPointsByDataId[dataId];
                });
                node.removeObserverDelay = this.#removeObserverDelay;
            }
            this.#logger.debug(`AccessPoint.registerObserver('${dataId}') on node`);
            dataPoint.node.registerObserver(onRefresh); // Note: may throw an exception if adding failed!
        }

        unregisterObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            const dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint) {
                throw new Error(`Failed removing observer for unsupported id '${dataId}'`);
            }
            this.#logger.debug(`AccessPoint.unregisterObserver('${dataId}') on node`);
            dataPoint.node.unregisterObserver(onRefresh); // Note: may throw an exception if removing failed!
        }

        addObserverToSource(filter) { // TODO: Do we realy need this? If not, then remove!
            this.#logger.debug(`Calling addObserverToSource(filter) with filter: '${typeof filter === 'function'}'`);
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId) && (!filter || filter(dataId))) {
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    dataPoint.node.addObserverToSource();
                    this.#logger.debug(`Calling addObserverToSource() for data id '${dataId}'`);
                }
            }
        }

        removeObserverFromSource(filter) {
            this.#logger.debug(`Calling removeObserverFromSource(filter) with filter: '${typeof filter === 'function'}'`);
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId) && (!filter || filter(dataId))) {
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    dataPoint.node.removeObserverFromSource();
                    this.#logger.debug(`Calling removeObserverFromSource() for data id '${dataId}'`);
                }
            }
        }

        read(dataId, onResponse, onError) {
            this.#source.read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this.#logger.error(`Failed calling onResponse(${value}) for dataId '${dataId}'`, error);
                }
                const dataPoint = this.#dataPointsByDataId[dataId];
                if (dataPoint) {
                    dataPoint.node.Value = value;
                }
            }, onError);
        }

        write(dataId, value) {
            this.#source.write(dataId, value);
        }
    }
    DataPoint.AccessPoint = AccessPoint;

    class Switch {
        #getDataAccessObject;
        constructor(getDataAccessObject) {
            if (typeof getDataAccessObject !== 'function') {
                throw new Error('Passed getDataAccessObject(dataId) is not a function');
            }
            this.#getDataAccessObject = getDataAccessObject;
            Common.validateAsDataAccessObject(this, true);
        }

        getType(dataId) {
            return this._dao(dataId, 'getType:function').getType(dataId);
        }

        registerObserver(dataId, onRefresh) {
            this._dao(dataId, 'registerObserver:function').registerObserver(dataId, onRefresh);
        }

        unregisterObserver(dataId, onRefresh) {
            this._dao(dataId, 'unregisterObserver:function').unregisterObserver(dataId, onRefresh);
        }

        read(dataId, onResponse, onError) {
            this._dao(dataId, 'read:function').read(dataId, onResponse, onError);
        }

        write(dataId, value) {
            this._dao(dataId, 'write:function').write(dataId, value);
        }

        _dao(dataId, aspect) {
            if (!this.#getDataAccessObject) {
                throw new Error('Function getDataAccessObject(dataId) is not available');
            }
            return Core.validateAs('DataAccessObject', this.#getDataAccessObject(dataId), aspect);
        }
    }
    DataPoint.Switch = Switch;

    const targetIdValidRegex = /^[a-z0-9_]+$/i;
    const targetIdRegex = /^([a-z0-9_]+):.+$/i;
    class Router {
        #logger;
        #dataConnectors;
        #dataAccessObjects;
        #getDataAccessObject;
        #onBeforeUpdateDataConnectors;
        #onAfterUpdateDataConnectors
        constructor(logger) {
            Common.validateAsLogger(logger, true);
            this.#logger = logger;
            this.#dataConnectors = [];
            this.#dataAccessObjects = {};
            this.#getDataAccessObject = dataId => {
                const match = targetIdRegex.exec(dataId);
                if (!match) {
                    throw new Error(`Invalid id: '${dataId}'`);
                }
                const targetId = match[1];
                const accObj = this.#dataAccessObjects[targetId];
                if (!accObj) {
                    throw new Error(`No data access object registered for data id '${dataId}'`);
                }
                return accObj;
            };
            this.#onBeforeUpdateDataConnectors = null;
            this.#onAfterUpdateDataConnectors = null;
        }

        set onBeforeUpdateDataConnectors(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for onBeforeUpdateDataConnectors() is not a function');
            }
            this.#onBeforeUpdateDataConnectors = value;
        }

        set onAfterUpdateDataConnectors(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for onAfterUpdateDataConnectors() is not a function');
            }
            this.#onAfterUpdateDataConnectors = value;
        }

        // This will be called on server side when a new web socket connection has opened or an existing has reopened
        registerDataConnector(dataConnector) {
            for (const connector in this.#dataConnectors) {
                if (dataConnector === connector) {
                    this.#logger.warn('Data connector is already registered');
                    return;
                }
            }
            this.#dataConnectors.push(dataConnector);
            const dataPoints = this.#getDataPoints();
            dataConnector.setDataPoints(dataPoints);
        }

        // This will be called on server side when a web socket connection has been closed
        unregisterDataConnector(dataConnector) {
            for (let i = 0; i < this.#dataConnectors.length; i++) {
                if (dataConnector === this.#dataConnectors[i]) {
                    this.#dataConnectors.splice(i, 1);
                    return;
                }
            }
            this.#logger.warn('Data connector is not registered');
        }

        registerDataAccessObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target id '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Invalid target id format '${targetId}'`);
            } else if (this.#dataAccessObjects[targetId] !== undefined) {
                throw new Error(`Target id '${targetId}' is already registered`);
            } else {
                Common.validateAsDataAccessServerObject(accessObject, true);
                const prefixLength = targetId.length + 1;
                function getRawDataId(dataId) {
                    return dataId.substring(prefixLength);
                }
                this.#dataAccessObjects[targetId] = {
                    accessObject,
                    getType: dataId => accessObject.getType(getRawDataId(dataId)),
                    registerObserver: (dataId, onRefresh) => accessObject.registerObserver(getRawDataId(dataId), onRefresh),
                    unregisterObserver: (dataId, onRefresh) => accessObject.unregisterObserver(getRawDataId(dataId), onRefresh),
                    read: (dataId, onResponse, onError) => accessObject.read(getRawDataId(dataId), onResponse, onError),
                    write: (dataId, value) => accessObject.write(getRawDataId(dataId), value)
                }
                this.#updateDataConnectors();
            }
        }

        unregisterDataAccessObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target id: '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Invalid target id format '${targetId}'`);
            } else if (this.#dataAccessObjects[targetId] === undefined) {
                throw new Error(`Target id '${targetId}' is not registered`);
            } else if (this.#dataAccessObjects[targetId].accessObject !== accessObject) {
                throw new Error(`Target id '${targetId}' is registered for another data access object`);
            } else {
                this.#updateDataConnectors(targetId);
                delete this.#dataAccessObjects[targetId];
            }
        }

        #updateDataConnectors(excludeTargetId = null) {
            const dataIdStart = excludeTargetId ? `${excludeTargetId}:` : null;
            const filter = dataIdStart ? dataId => dataId.startsWith(dataIdStart) : null;
            if (this.#onBeforeUpdateDataConnectors) {
                try {
                    this.#onBeforeUpdateDataConnectors(filter);
                } catch (error) {
                    this.#logger.error('Failed calling onBeforeUpdateDataConnectors()', error);
                }
            }
            const dataPoints = this.#getDataPoints(excludeTargetId);
            for (const dataConnector of this.#dataConnectors) {
                try {
                    dataConnector.setDataPoints(dataPoints);
                } catch (error) {
                    this.#logger.error('Failed updating data points on connector', error);
                }
            }
            if (this.#onAfterUpdateDataConnectors) {
                try {
                    this.#onAfterUpdateDataConnectors(filter);
                } catch (error) {
                    this.#logger.error('Failed calling onAfterUpdateDataConnectors()', error);
                }
            }
        }

        #getDataPoints(excludeTargetId = null) {
            const result = [];
            for (const targetId in this.#dataAccessObjects) {
                if (this.#dataAccessObjects.hasOwnProperty(targetId) && targetId !== excludeTargetId) {
                    const object = this.#dataAccessObjects[targetId];
                    const dataPoints = object.accessObject.getDataPoints();
                    for (const dataPoint of dataPoints) {
                        result.push({ id: `${targetId}:${dataPoint.id}`, type: dataPoint.type });
                    }
                }
            }
            return result;
        }

        get getDataAccessObject() {
            return this.#getDataAccessObject;
        }
    }
    DataPoint.Router = Router;

    Object.freeze(DataPoint);
    if (isNodeJS) {
        module.exports = DataPoint;
    } else {
        root.DataPoint = DataPoint;
    }
}(globalThis));