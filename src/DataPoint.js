(function (root) {
    "use strict";
    const DataPoint = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Node {
        constructor(logger, source, onObserverRemoved) {
            this._logger = Common.validateAsLogger(logger, true);
            this._source = Common.validateAsObservable(source, true);
            if (typeof onObserverRemoved !== 'function') {
                throw new Error('onObserverRemoved() is not a function');
            }
            this._onObserverRemoved = onObserverRemoved;
            this._isObserved = false;
            this._value = null;
            this._onRefresh = value => this._refresh(value);
            this._observers = [];
            this._removeObserverDelay = false;
            this._removeObserverTimer = null;
            Common.validateAsObservable(this, true);
        }

        set RemoveObserverDelay(value) {
            if (typeof value === 'number' && value > 0) {
                this._removeObserverDelay = Math.ceil(value);
            } else {
                this._removeObserverDelay = false;
                if (this._removeObserverTimer) {
                    clearTimeout(this._removeObserverTimer);
                    this._removeObserverTimer = null;
                    try {
                        this._source.RemoveObserver(this._onRefresh);
                    } catch (error) {
                        this._logger.Error(`Failed removing observer: ${error.message}`);
                    }
                    this._isObserved = false;
                    this._onObserverRemoved();
                }
            }
            typeof value === 'number' && value > 0 ? value : false;
        }

        get Value() {
            return this._value;
        }

        set Value(value) {
            this._refresh(value);
        }

        AddObserver(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            // If already stored and if we just call for refresh and return
            for (const onRef of this._observers) {
                if (onRef === onRefresh) {
                    this._logger.Warn('onRefresh(value) has already been added');
                    if (this._value !== undefined && this._value !== null) {
                        try {
                            onRefresh(this._value);
                        } catch (error) {
                            this._logger.Error(`Failed calling onRefresh(value): ${error.message}`);
                        }
                    }
                    return;
                }
            }
            this._observers.push(onRefresh);
            if (!this._isObserved && this._observers.length === 1) { // If not observerd and the first add
                if (this._removeObserverTimer) { // If still observed we just kill the timer
                    clearTimeout(this._removeObserverTimer);
                    this._removeObserverTimer = null;
                } else { // We subscribe on the source which should result in firering the refresh event
                    try {
                        this._source.AddObserver(this._onRefresh); // Note: This may throw an exception if adding failed
                        this._isObserved = true;
                    } catch (error) {
                        this._logger.Error(`Failed adding observer on node: ${error.message}`);
                    }
                    return;
                }
            }
            if (this._value !== undefined && this._value !== null) { // Refresh if value is available
                try {
                    onRefresh(this._value);
                } catch (error) {
                    this._logger.Error(`Failed calling onRefresh(value): ${error.message}`);
                }
            }
        }

        RemoveObserver(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            for (let i = 0; i < this._observers.length; i++) {
                if (this._observers[i] === onRefresh) {
                    this._observers.splice(i, 1);
                    if (this._isObserved && this._observers.length === 0) { // If observed and the last observer has been removed
                        if (this._removeObserverDelay) {
                            this._removeObserverTimer = setTimeout(() => {
                                this._removeObserverTimer = null;
                                try {
                                    this._source.RemoveObserver(this._onRefresh);
                                } catch (error) {
                                    this._logger.Error(`Failed removing observer on node: ${error.message}`);
                                }
                                this._isObserved = false;
                                this._onObserverRemoved();
                            }, this._removeObserverDelay);
                        } else {
                            try {
                                this._source.RemoveObserver(this._onRefresh); // Note: This may throw an exception if removing failed
                            } catch (error) {
                                this._logger.Error(`Failed removing observer on node: ${error.message}`);
                                throw error;
                            }
                            this._isObserved = false;
                            this._onObserverRemoved();
                        }
                    }
                    return;
                }
            }
            this._logger.Warn('onRefresh(value) has already been removed');
        }

        AddObserverToSource() {
            if (this._removeObserverTimer) { // If still observed we kill the timer
                clearTimeout(this._removeObserverTimer);
                this._removeObserverTimer = null;
            }
            if (!this._isObserved && this._observers.length > 0) {
                try {
                    this._source.AddObserver(this._onRefresh); // Note: This may throw an exception if adding failed
                    this._isObserved = true;
                } catch (error) {
                    this._logger.Error(`Failed adding observer on node: ${error.message}`);
                }
            }
        }

        RemoveObserverFromSource() {
            if (this._removeObserverTimer) { // If still observed we kill the timer
                clearTimeout(this._removeObserverTimer);
                this._removeObserverTimer = null;
            }
            if (this._isObserved) {
                try {
                    this._source.RemoveObserver(this._onRefresh); // Note: This may throw an exception if removing failed
                } catch (error) {
                    this._logger.Error(`Failed removing observer on node: ${error.message}`);
                    throw error;
                }
                this._isObserved = false;
                this._onObserverRemoved();
            }
        }

        _refresh(value) {
            this._value = value;
            if (this._observers && value !== undefined && value !== null) {
                for (const onRefresh of this._observers) {
                    try {
                        onRefresh(value);
                    } catch (error) {
                        this._logger.Error(`Failed calling onRefresh(value):\n${error.message}`);
                    }
                }
            }
        }
    }

    class AccessPoint {
        constructor(logger, source) {
            this._logger = Common.validateAsLogger(logger, true);
            this._source = Common.validateAsDataAccessObject(source, true);
            this._removeObserverDelay = false;
            this._dataPointsByDataId = {};
            Common.validateAsDataAccessObject(this, true);
        }

        set RemoveObserverDelay(value) {
            this._removeObserverDelay = typeof value === 'number' && value > 0 ? Math.ceil(value) : false;
            this._setRemoveObserverDelayOnNodes(this._removeObserverDelay);
        }

        _setRemoveObserverDelayOnNodes(delay) {
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.RemoveObserverDelay = delay;
                }
            }
        }

        GetType(dataId) {
            return this._source.GetType(dataId);
        }

        AddObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            let dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                this._dataPointsByDataId[dataId] = dataPoint = {
                    AddObserver: onRefresh => this._source.AddObserver(dataId, onRefresh),
                    RemoveObserver: onRefresh => this._source.RemoveObserver(dataId, onRefresh)
                };
                const node = dataPoint.node = new Node(this._logger, dataPoint, () => {
                    delete dataPoint.node;
                    delete this._dataPointsByDataId[dataId];
                });
                node.RemoveObserverDelay = this._removeObserverDelay;
            }
            dataPoint.node.AddObserver(onRefresh); // Note: may throw an exception if adding failed!
        }

        RemoveObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            const dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                throw new Error(`Failed removing observer for unsupported id '${dataId}'`);
            }
            dataPoint.node.RemoveObserver(onRefresh); // Note: may throw an exception if removing failed!
        }

        AddObserverToSource(filter) {
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId) && (!filter || filter(dataId))) {
                    const dataPoint = this._dataPointsByDataId[dataId];
                    dataPoint.AddObserverToSource();
                }
            }
        }

        RemoveObserverFromSource(filter) {
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId) && (!filter || filter(dataId))) {
                    const dataPoint = this._dataPointsByDataId[dataId];
                    dataPoint.RemoveObserverFromSource();
                }
            }
        }

        Read(dataId, onResponse, onError) {
            this._source.Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._logger.Error(`Failed calling onResponse(${value}) for dataId '${dataId}':\n${error.message}`);
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (dataPoint) {
                    dataPoint.node.Value = value;
                }
            }, onError);
        }

        Write(dataId, value) {
            this._source.Write(dataId, value);
        }
    }
    DataPoint.AccessPoint = AccessPoint;

    class AccessRouter {
        constructor(getDataAccessObject) {
            if (typeof getDataAccessObject !== 'function') {
                throw new Error('Passed getDataAccessObject(dataId) is not a function');
            }
            this._getDataAccessObject = getDataAccessObject;
            Common.validateAsDataAccessObject(this, true);
        }

        GetType(dataId) {
            return this._dao(dataId, 'GetType:function').GetType(dataId);
        }

        AddObserver(dataId, onRefresh) {
            this._dao(dataId, 'AddObserver:function').AddObserver(dataId, onRefresh);
        }

        RemoveObserver(dataId, onRefresh) {
            this._dao(dataId, 'RemoveObserver:function').RemoveObserver(dataId, onRefresh);
        }

        Read(dataId, onResponse, onError) {
            this._dao(dataId, 'Read:function').Read(dataId, onResponse, onError);
        }

        Write(dataId, value) {
            this._dao(dataId, 'Write:function').Write(dataId, value);
        }

        _dao(dataId, aspect) {
            if (!this._getDataAccessObject) {
                throw new Error('Function getDataAccessObject(dataId) is not available');
            }
            return Core.validateAs('DataAccessObject', this._getDataAccessObject(dataId), aspect);
        }
    }
    DataPoint.AccessRouter = AccessRouter;

    const targetIdValidRegex = /^[a-z0-9_]+$/i;
    const targetIdRegex = /^([a-z0-9_]+):.+$/i;
    class AccessRouterHandler {
        constructor(logger) {
            Common.validateAsLogger(logger, true);
            this._logger = logger;
            this._dataConnectors = [];
            this._dataAccessObjects = {};
            this._getDataAccessObject = dataId => {
                const match = targetIdRegex.exec(dataId);
                if (!match) {
                    throw new Error(`Invalid id: '${dataId}'`);
                }
                const targetId = match[1];
                const accObj = this._dataAccessObjects[targetId];
                if (!accObj) {
                    throw new Error(`No data access object registered for data id '${dataId}'`);
                }
                return accObj;
            };
            this._onBeforeUpdateDataConnectors = null;
            this._onAfterUpdateDataConnectors = null;
        }

        set OnBeforeUpdateDataConnectors(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for onBeforeUpdateDataConnectors() is not a function');
            }
            this._onBeforeUpdateDataConnectors = value;
        }

        set OnAfterUpdateDataConnectors(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for onAfterUpdateDataConnectors() is not a function');
            }
            this._onAfterUpdateDataConnectors = value;
        }

        // This will be called on server side when a new web socket connection has opened or an existing has reopened
        RegisterDataConnector(dataConnector) {
            for (const connector in this._dataConnectors) {
                if (dataConnector === connector) {
                    this._logger.Warn('Data connector is already registered');
                    return;
                }
            }
            this._dataConnectors.push(dataConnector);
            const dataPoints = this._getDataPoints();
            dataConnector.SetDataPoints(dataPoints);
        }

        // This will be called on server side when a web socket connection has been closed
        UnregisterDataConnector(dataConnector) {
            for (let i = 0; i < this._dataConnectors.length; i++) {
                if (dataConnector === this._dataConnectors[i]) {
                    this._dataConnectors.splice(i, 1);
                    return;
                }
            }
            this._logger.Warn('Data connector is not registered');
        }

        RegisterDataAccessObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target id '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Invalid target id format '${targetId}'`);
            } else if (this._dataAccessObjects[targetId] !== undefined) {
                throw new Error(`Target id '${targetId}' is already registered`);
            } else {
                Common.validateAsDataAccessServerObject(accessObject, true);
                const prefixLength = targetId.length + 1;
                function getRawDataId(dataId) {
                    return dataId.substring(prefixLength);
                }
                this._dataAccessObjects[targetId] = {
                    accessObject,
                    GetType: dataId => accessObject.GetType(getRawDataId(dataId)),
                    AddObserver: (dataId, onRefresh) => accessObject.AddObserver(getRawDataId(dataId), onRefresh),
                    RemoveObserver: (dataId, onRefresh) => accessObject.RemoveObserver(getRawDataId(dataId), onRefresh),
                    Read: (dataId, onResponse, onError) => accessObject.Read(getRawDataId(dataId), onResponse, onError),
                    Write: (dataId, value) => accessObject.Write(getRawDataId(dataId), value)
                }
                this._updateDataConnectors();
            }
        }

        UnregisterDataAccessObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target id: '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Invalid target id format '${targetId}'`);
            } else if (this._dataAccessObjects[targetId] === undefined) {
                throw new Error(`Target id '${targetId}' is not registered`);
            } else if (this._dataAccessObjects[targetId].accessObject !== accessObject) {
                throw new Error(`Target id '${targetId}' is registered for another data access object`);
            } else {
                this._updateDataConnectors(targetId);
                delete this._dataAccessObjects[targetId];
            }
        }

        _updateDataConnectors(excludeTargetId = null) {
            if (this._onBeforeUpdateDataConnectors) {
                try {
                    this._onBeforeUpdateDataConnectors();
                } catch (error) {
                    this._logger.Error(`Failed calling onBeforeUpdateDataConnectors():\n${error.message}`);
                }
            }
            const dataPoints = this._getDataPoints(excludeTargetId);
            for (const dataConnector of this._dataConnectors) {
                try {
                    dataConnector.SetDataPoints(dataPoints);
                } catch (error) {
                    this._logger.Error(`Failed updating data points on connector:\n${error.message}`);
                }
            }
            if (this._onAfterUpdateDataConnectors) {
                try {
                    this._onAfterUpdateDataConnectors();
                } catch (error) {
                    this._logger.Error(`Failed calling onAfterUpdateDataConnectors():\n${error.message}`);
                }
            }
        }

        _updateDataConnectors_DISCARDED(excludeTargetId = null) { // TODO: Reuse or remove
            if (this._onBeforeUpdateDataConnectors) {
                try {
                    this._onBeforeUpdateDataConnectors();
                } catch (error) {
                    this._logger.Error(`Failed calling onBeforeUpdateDataConnectors():\n${error.message}`);
                }
            }
            const dataPoints = this._getDataPoints(excludeTargetId);
            for (const dataConnector of this._dataConnectors) {
                try {
                    dataConnector.SetDataPoints(dataPoints);
                } catch (error) {
                    this._logger.Error(`Failed updating data points on connector:\n${error.message}`);
                }
            }
            if (this._onAfterUpdateDataConnectors) {
                try {
                    this._onAfterUpdateDataConnectors();
                } catch (error) {
                    this._logger.Error(`Failed calling onAfterUpdateDataConnectors():\n${error.message}`);
                }
            }
        }

        _getDataPoints(excludeTargetId = null) {
            const result = [];
            for (const targetId in this._dataAccessObjects) {
                if (this._dataAccessObjects.hasOwnProperty(targetId) && targetId !== excludeTargetId) {
                    const object = this._dataAccessObjects[targetId];
                    const dataPoints = object.accessObject.GetDataPoints();
                    for (const dataPoint of dataPoints) {
                        result.push({ id: `${targetId}:${dataPoint.id}`, type: dataPoint.type });
                    }
                }
            }
            return result;
        }

        get GetDataAccessObject() {
            return this._getDataAccessObject;
        }
    }
    DataPoint.AccessRouterHandler = AccessRouterHandler;

    Object.freeze(DataPoint);
    if (isNodeJS) {
        module.exports = DataPoint;
    } else {
        root.DataPoint = DataPoint;
    }
}(globalThis));