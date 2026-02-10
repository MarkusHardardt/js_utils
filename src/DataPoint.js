(function (root) {
    // ==> file: 'DataPoint.js':
    "use strict";
    const DataPoint = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Node {
        constructor() {
            this._value = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._onRefresh = value => this._refresh(value);
            this._subscribers = [];
            this._source = null;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            Common.validateAsObservable(this, true);
        }

        set Source(value) {
            if (this._source !== value) {
                if (this._source && this._subscribers.length > 0) {
                    this._source.Unsubscribe(this._onRefresh);
                }
                if (value) {
                    Common.validateAsObservable(value, true);
                    this._source = value;
                } else {
                    this._source = null;
                }
                if (this._source && this._subscribers.length > 0) {
                    this._source.Subscribe(this._onRefresh);
                }
            }
        }

        set Equal(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for Equal(e1, e2) is not a function');
            }
            this._equal = value;
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._onError = value;
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
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
            let alreadySubscribed = false;
            for (const callback of this._subscribers) {
                if (callback === onRefresh) {
                    alreadySubscribed = true;
                    this._onError('onRefresh(value) is already subscribed');
                }
            }
            if (alreadySubscribed) {
                if (this._value !== null) {
                    try {
                        onRefresh(this._value);
                    } catch (error) {
                        throw new Error(`Failed calling onRefresh(value):\n${error.message}`);
                    }
                }
            } else {
                this._subscribers.push(onRefresh);
                if (this._source && this._subscribers.length === 1) {
                    if (this._unsubscribeDelayTimer) {
                        clearTimeout(this._unsubscribeDelayTimer);
                        this._unsubscribeDelayTimer = null;
                        if (this._value !== null) {
                            try {
                                onRefresh(this._value);
                            } catch (error) {
                                throw new Error(`Failed calling onRefresh(value):\n${error.message}`);
                            }
                        }
                    } else {
                        // If first subscription we subscribe on our parent which should result in firering the refresh event
                        console.log('### ==> Try Node.Subscribe(onRefresh)');
                        this._source.Subscribe(this._onRefresh); // Note: This may throw an exception if subscription failed
                    }
                } else {
                    // If we cannot subscribe or it is not the first subscription we fire the event manually
                    if (this._value !== null) {
                        try {
                            onRefresh(this._value);
                        } catch (error) {
                            throw new Error(`Failed calling onRefresh(value):\n${error.message}`);
                        }
                    }
                }
            }
        }

        Unsubscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh(value) is not a function');
            }
            for (let i = 0; i < this._subscribers.length; i++) {
                if (this._subscribers[i] === onRefresh) {
                    this._subscribers.splice(i, 1);
                    if (this._source && this._subscribers.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeDelayTimer = setTimeout(() => {
                                this._unsubscribeDelayTimer = null;
                                try {
                                    console.log('### ==> Try Node.Unsubscribe(onRefresh)');
                                    this._source.Unsubscribe(this._onRefresh);
                                } catch (error) {
                                    this._onError(`Failed unsubscribing: ${error.message}`);
                                }
                            }, this._unsubscribeDelay);
                        } else {
                            this._source.Unsubscribe(this._onRefresh); // Note: This may throw an exception if subscription failed
                        }
                    }
                    return;
                }
            }
            this._onError('onRefresh(value) is not subscribed');
        }

        Dispose() {
            if (this._unsubscribeDelayTimer) {
                clearTimeout(this._unsubscribeDelayTimer);
                this._unsubscribeDelayTimer = null;
            }
            this._subscribers.splice(0, this._subscribers.length);
        }

        _refresh(value) {
            if (this._subscribers && !this._equal(this._value, value)) {
                this._value = value;
                for (const onRefresh of this._subscribers) {
                    if (value !== null) {
                        try {
                            onRefresh(value);
                        } catch (error) {
                            this._onError(`Failed calling onRefresh(value):\n${error.message}`);
                        }
                    }
                }
            }
        }
    }
    DataPoint.Node = Node;

    class AccessPoint {
        constructor() {
            this._source = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._dataPointsByDataId = {};
            Common.validateAsDataAccessObject(this, true);
        }

        set Source(value) {
            if (this._source !== value) {
                if (this._source !== null) {
                    for (const dataId in this._dataPointsByDataId) {
                        if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                            const dataPoint = this._dataPointsByDataId[dataId];
                            dataPoint.node.Source = null;
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
                            dataPoint.node.Source = dataPoint;
                        }
                    }
                }
            }
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
            this._onError = value;
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.OnError = value;
                }
            }
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.UnsubscribeDelay = value;
                }
            }
        }

        GetType(dataId) {
            return Core.validateAs('DataAccessObject', this._source, 'GetType:function').GetType(dataId);
        }

        SubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId: '${dataId}'`);
            }
            const dataPoints = this._dataPointsByDataId;
            let dataPoint = dataPoints[dataId];
            if (!dataPoint) {
                const node = new Node();
                node.UnsubscribeDelay = this._unsubscribeDelay;
                node.Equal = this._equal;
                node.OnError = this._onError;
                node.Value = null;
                function dispose() {
                    node.Dispose();
                    delete dataPoint.node;
                    delete dataPoints[dataId];
                }
                dataPoints[dataId] = dataPoint = {
                    node,
                    // Note: The following 'onRefresh' function is the local instance inside our node created above.
                    Subscribe: onRefresh => {
                        if (this._source) {
                            try {
                                this._source.SubscribeData(dataId, onRefresh);
                            } catch (error) {
                                dispose();
                                throw error;
                            }
                        }
                    },
                    Unsubscribe: onRefresh => {
                        if (this._source) {
                            try {
                                this._source.UnsubscribeData(dataId, onRefresh);
                                dispose();
                            } catch (error) {
                                dispose();
                                throw error;
                            }
                        } else {
                            dispose();
                        }
                    }
                };
                node.Source = dataPoint;
            }
            dataPoint.node.Subscribe(onRefresh); // Note: may throw an exception if subscription failed!
        }

        UnsubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId: ${dataId}`);
            }
            const dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                throw new Error(`Failed unsubscribing for unsupported id: ${dataId}`);
            }
            dataPoint.node.Unsubscribe(onRefresh); // Note: may throw an exception if unsubscription failed!
        }

        Read(dataId, onResponse, onError) {
            Core.validateAs('DataAccessObject', this._source, 'Read:function').Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse(${value}) for dataId: '${dataId}':\n${error.message}`);
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

    class Router {
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
    DataPoint.Router = Router;

    const targetIdValidRegex = /^[a-z0-9_]+$/i;
    const targetIdRegex = /^([a-z0-9_]+):.+$/i;
    class AccessRouterHandler {
        constructor() {
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
                    throw new Error(`No data access object registered for target '${targetId}' and data id: '${dataId}'`);
                }
                return accObj;
            };
        }

        RegisterDataConnector(dataConnector) {
            for (const connector in this._dataConnectors) {
                if (dataConnector === connector) {
                    console.error('Data connector is already registered');
                    return;
                }
            }
            this._dataConnectors.push(dataConnector);
            const dataPoints = this._getDataPoints();
            dataConnector.SetDataPoints(dataPoints);
        }

        UnregisterDataConnector(dataConnector) {
            for (let i = 0; i < this._dataConnectors.length; i++) {
                if (dataConnector === this._dataConnectors[i]) {
                    this._dataConnectors.splice(i, 1);
                    return;
                }
            }
            console.error('Data connector is not registered');
        }

        RegisterDataAccesObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target id: '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Invalid target id format: '${targetId}'`);
            } else if (this._dataAccessObjects[targetId] !== undefined) {
                throw new Error(`Target id: '${targetId}' is already registered`);
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

        UnregisterDataAccesObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target id: '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Invalid target id format: '${targetId}'`);
            } else if (this._dataAccessObjects[targetId] === undefined) {
                throw new Error(`Target id '${targetId}' is not registered`);
            } else if (this._dataAccessObjects[targetId].accessObject !== accessObject) {
                throw new Error(`Target id '${targetId}' is registered for different data access object`);
            } else {
                delete this._dataAccessObjects[targetId];
                this._updateDataConnectors();
            }
        }

        _updateDataConnectors() {
            const dataPoints = this._getDataPoints();
            for (const dataConnector of this._dataConnectors) {
                dataConnector.SetDataPoints(dataPoints, true);
            }
        }

        _getDataPoints() {
            const result = [];
            for (const targetId in this._dataAccessObjects) {
                if (this._dataAccessObjects.hasOwnProperty(targetId)) {
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