(function (root) {
    "use strict";
    const DataPoint = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Node {
        constructor(onUnsubscribed) {
            if (typeof onUnsubscribed !== 'function') {
                throw new Error('onUnsubscribed() is not a function');
            }
            this._onUnsubscribed = onUnsubscribed;
            this._value = null;
            this._onError = Core.defaultOnError;
            this._onRefresh = value => this._refresh(value);
            this._onRefreshCallbacks = [];
            this._source = null;
            this._unsubscribeDelay = false;
            this._unsubscribeTimer = null;
            Common.validateAsObservable(this, true);
        }

        set Source(value) {
            if (this._source !== value) {
                if (this._source && this._onRefreshCallbacks.length > 0) {
                    this._source.Unsubscribe(this._onRefresh);
                }
                if (value) {
                    Common.validateAsObservable(value, true);
                    this._source = value;
                } else {
                    this._source = null;
                }
                if (this._source && this._onRefreshCallbacks.length > 0) {
                    this._source.Subscribe(this._onRefresh);
                }
            }
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._onError = value;
        }

        set UnsubscribeDelay(value) {
            if (typeof value === 'number' && value > 0) {
                this._unsubscribeDelay = Math.ceil(value);
            } else {
                this._unsubscribeDelay = false;
                if (this._unsubscribeTimer) {
                    clearTimeout(this._unsubscribeTimer);
                    this._unsubscribeTimer = null;
                    if (this._source) {
                        try {
                            this._source.Unsubscribe(this._onRefresh);
                        } catch (error) {
                            this._onError(`Failed unsubscribing node: ${error.message}`);
                        }
                        this._onUnsubscribed();
                    }
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

        Subscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            // If already stored and if we just call for refresh and return
            for (const onRef of this._onRefreshCallbacks) {
                if (onRef === onRefresh) {
                    this._onError('onRefresh(value) is already subscribed');
                    if (this._value !== undefined && this._value !== null) {
                        try {
                            onRefresh(this._value);
                        } catch (error) {
                            throw new Error(`Failed calling onRefresh(value):\n${error.message}`);
                        }
                    }
                    return;
                }
            }
            this._onRefreshCallbacks.push(onRefresh);
            if (this._source && this._onRefreshCallbacks.length === 1) { // If the first subscription
                if (this._unsubscribeTimer) { // If still subscribed we just kill the unsubscribe timer
                    clearTimeout(this._unsubscribeTimer);
                    this._unsubscribeTimer = null;
                } else { // We subscribe on the source which should result in firering the refresh event and return
                    this._source.Subscribe(this._onRefresh); // Note: This may throw an exception if subscription failed
                    return;
                }
            }
            if (this._value !== undefined && this._value !== null) { // Refresh if value is available
                try {
                    onRefresh(this._value);
                } catch (error) {
                    throw new Error(`Failed calling onRefresh(value):\n${error.message}`);
                }
            }
        }

        Unsubscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            for (let i = 0; i < this._onRefreshCallbacks.length; i++) {
                if (this._onRefreshCallbacks[i] === onRefresh) {
                    this._onRefreshCallbacks.splice(i, 1);
                    if (this._source && this._onRefreshCallbacks.length === 0) { // If the last subscriber has unsubscribed
                        if (this._unsubscribeDelay) {
                            this._unsubscribeTimer = setTimeout(() => {
                                this._unsubscribeTimer = null;
                                try {
                                    this._source.Unsubscribe(this._onRefresh);
                                } catch (error) {
                                    this._onError(`Failed unsubscribing on node: ${error.message}`);
                                }
                                this._onUnsubscribed();
                            }, this._unsubscribeDelay);
                        } else {
                            try {
                                this._source.Unsubscribe(this._onRefresh); // Note: This may throw an exception if subscription failed
                                this._onUnsubscribed();
                            } catch (error) {
                                this._onUnsubscribed();
                                throw error;
                            }
                        }
                    }
                    return;
                }
            }
            this._onError('onRefresh(value) is not subscribed');
        }

        _refresh(value) {
            this._value = value;
            if (this._onRefreshCallbacks && value !== undefined && value !== null) {
                for (const onRefresh of this._onRefreshCallbacks) {
                    try {
                        onRefresh(value);
                    } catch (error) {
                        this._onError(`Failed calling onRefresh(value):\n${error.message}`);
                    }
                }
            }
        }
    }

    class AccessPoint {
        constructor() {
            this._source = null;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._dataPointsByDataId = {};
            Common.validateAsDataAccessObject(this, true);
        }

        set Source(value) {
            if (this._source !== value) {
                if (this._source !== undefined && this._source !== null) {
                    for (const dataId in this._dataPointsByDataId) {
                        if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataPointsByDataId[dataId];
                            dataPoint.node.Source = null; // TODO: Is this neccessary?
                        }
                    }
                }
                if (value) {
                    Common.validateAsDataAccessObject(value, true);
                    this._source = value;
                } else {
                    this._source = null;
                }
                if (this._source !== null) {
                    for (const dataId in this._dataPointsByDataId) {
                        if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataPointsByDataId[dataId];
                            dataPoint.node.Source = dataPoint; // TODO: See above...
                        }
                    }
                }
            }
        }

        set OnError(value) {
            this._onError = value;
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.OnError = value;
                }
            }
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? Math.ceil(value) : false;
            this._setUnsubscribeDelayOnNodes(this._unsubscribeDelay);
        }

        _setUnsubscribeDelayOnNodes(delay) {
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.UnsubscribeDelay = delay;
                }
            }
        }

        GetType(dataId) {
            return Core.validateAs('DataAccessObject', this._source, 'GetType:function').GetType(dataId);
        }

        SubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            let dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                const node = new Node(() => {
                    delete dataPoint.node;
                    delete this._dataPointsByDataId[dataId];
                });
                node.OnError = this._onError;
                node.UnsubscribeDelay = this._unsubscribeDelay;
                this._dataPointsByDataId[dataId] = dataPoint = {
                    node,
                    Subscribe: onRefresh => {
                        if (this._source) {
                            this._source.SubscribeData(dataId, onRefresh);
                        }
                    },
                    Unsubscribe: onRefresh => {
                        if (this._source) {
                            this._source.UnsubscribeData(dataId, onRefresh);
                        }
                    }
                };
                node.Source = dataPoint;
            }
            dataPoint.node.Subscribe(onRefresh); // Note: may throw an exception if subscription failed!
        }

        UnsubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            const dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                throw new Error(`Failed unsubscribing for unsupported id '${dataId}'`);
            }
            dataPoint.node.Unsubscribe(onRefresh); // Note: may throw an exception if unsubscription failed!
        }

        Read(dataId, onResponse, onError) {
            Core.validateAs('DataAccessObject', this._source, 'Read:function').Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse(${value}) for dataId '${dataId}':\n${error.message}`);
                }
                const dataPoint = this._dataPointsByDataId[dataId];
                if (dataPoint) {
                    dataPoint.node.Value = value;
                }
            }, onError);
        }

        Write(dataId, value) {
            Core.validateAs('DataAccessObject', this._source, 'Write:function').Write(dataId, value);
        }
    }
    DataPoint.AccessPoint = AccessPoint;

    class AccessRouter {
        constructor() {
            this._getDataAccessObject = null;
            Common.validateAsDataAccessObject(this, true);
        }

        set GetDataAccessObject(value) {
            if (typeof value !== 'function') {
                throw new Error('Passed getDataAccessObject(dataId) is not a function');
            }
            this._getDataAccessObject = value;
        }

        GetType(dataId) {
            return this._dao(dataId, 'GetType:function').GetType(dataId);
        }

        SubscribeData(dataId, onRefresh) {
            this._dao(dataId, 'SubscribeData:function').SubscribeData(dataId, onRefresh);
        }

        UnsubscribeData(dataId, onRefresh) {
            this._dao(dataId, 'UnsubscribeData:function').UnsubscribeData(dataId, onRefresh);
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
        constructor() {
            this._onError = Core.defaultOnError;
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

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._onError = value;
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
                    this._onError('Data connector is already registered');
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
            this._onError('Data connector is not registered');
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
                    SubscribeData: (dataId, onRefresh) => accessObject.SubscribeData(getRawDataId(dataId), onRefresh),
                    UnsubscribeData: (dataId, onRefresh) => accessObject.UnsubscribeData(getRawDataId(dataId), onRefresh),
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
                    this._onError(`Failed calling onBeforeUpdateDataConnectors():\n${error.message}`);
                }
            }
            const dataPoints = this._getDataPoints(excludeTargetId);
            for (const dataConnector of this._dataConnectors) {
                try {
                    dataConnector.SetDataPoints(dataPoints);
                } catch (error) {
                    this._onError(`Failed updating data points on connector:\n${error.message}`);
                }
            }
            if (this._onAfterUpdateDataConnectors) {
                try {
                    this._onAfterUpdateDataConnectors();
                } catch (error) {
                    this._onError(`Failed calling onAfterUpdateDataConnectors():\n${error.message}`);
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