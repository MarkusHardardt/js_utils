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
            this._observers = [];
            this._source = null;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            Common.validateAsObservable(this, true);
        }

        set Source(value) {
            if (this._source !== value) {
                if (this._source && this._observers.length > 0) {
                    this._source.Unsubscribe(this._onRefresh);
                }
                if (value) {
                    Common.validateAsObservable(value, true);
                    this._source = value;
                } else {
                    this._source = null;
                }
                if (this._source && this._observers.length > 0) {
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

        get SubscriptionsCount() {
            return this._observers.length;
        }

        Subscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh() is not a function');
            }
            let alreadySubscribed = false;
            for (const callback of this._observers) {
                if (callback === onRefresh) {
                    alreadySubscribed = true;
                    this._onError('onRefresh() is already subscribed');
                }
            }
            if (alreadySubscribed) {
                try {
                    onRefresh(this._value);
                } catch (error) {
                    this._onError(`Failed calling onRefresh(value): ${error}`);
                }
            } else {
                this._observers.push(onRefresh);
                if (!this._source || this._observers.length > 1) {
                    // If we cannot subscribe or it is not the first subscription we fire the event manually.
                    try {
                        onRefresh(this._value);
                    } catch (error) {
                        this._onError(`Failed calling onRefresh(value): ${error}`);
                    }
                } else {
                    // If first subscription we subscribe on our parent which should result in firering the event.
                    if (this._unsubscribeDelayTimer) {
                        clearTimeout(this._unsubscribeDelayTimer);
                        this._unsubscribeDelayTimer = null;
                        try {
                            onRefresh(this._value);
                        } catch (error) {
                            this._onError(`Failed calling onRefresh(value): ${error}`);
                        }
                    } else {
                        this._source.Subscribe(this._onRefresh);
                    }
                }
            }
        }

        Unsubscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh() is not a function');
            }
            for (let i = 0; i < this._observers.length; i++) {
                if (this._observers[i] === onRefresh) {
                    this._observers.splice(i, 1);
                    if (this._source && this._observers.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeDelayTimer = setTimeout(() => {
                                this._source.Unsubscribe(this._onRefresh);
                                this._unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._source.Unsubscribe(this._onRefresh);
                        }
                    }
                    return;
                }
            }
            this._onError('onRefresh() is not subscribed');
        }

        _refresh(value) {
            if (!this._equal(this._value, value)) {
                this._value = value;
                for (const onRefresh of this._observers) {
                    try {
                        onRefresh(value);
                    } catch (error) {
                        this._onError(`Failed calling onRefresh(value): ${error.message}`, error);
                    }
                }
            }
        }
    }
    DataPoint.Node = Node;

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
            return this._dao(dataId).GetType(dataId);
        }

        SubscribeData(dataId, onRefresh) {
            this._dao(dataId).SubscribeData(dataId, onRefresh);
        }

        UnsubscribeData(dataId, onRefresh) {
            this._dao(dataId).UnsubscribeData(dataId, onRefresh);
        }

        Read(dataId, onResponse, onError) {
            this._dao(dataId).Read(dataId, onResponse, onError);
        }

        Write(dataId, value) {
            this._dao(dataId).Write(dataId, value);
        }

        _dao(dataId) {
            if (!this._getDataAccessObject) {
                throw new Error('Function getDataAccessObject(dataId) is not available');
            }
            return Common.validateAsDataAccessObject(this._getDataAccessObject(dataId));
        }
    }
    DataPoint.Router = Router;

    class Collection {
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
                throw new Error(`Invalid subscription dataId: ${dataId}`);
            }
            let dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                const node = new Node();
                node.UnsubscribeDelay = this._unsubscribeDelay;
                node.Equal = this._equal;
                node.OnError = this._onError;
                node.Value = null;
                this._dataPointsByDataId[dataId] = dataPoint = {
                    node,
                    // Note: The following 'onRefresh' function is the local instance inside our node created above.
                    Subscribe: onRefresh => {
                        if (this._source) {
                            try {
                                this._source.SubscribeData(dataId, onRefresh);
                            } catch (error) {
                                this._onError(`Failed to subscribe data with id '${dataId}': ${error}`);
                            }
                        }
                    },
                    Unsubscribe: onRefresh => {
                        if (this._source) {
                            try {
                                this._source.UnsubscribeData(dataId, onRefresh);
                            } catch (error) {
                                this._onError(`Failed to unsubscribe data with id '${dataId}': ${error}`);
                            }
                        }
                        node.Source = null;
                        delete dataPoint.node;
                        delete this._dataPointsByDataId[dataId];
                    }
                };
                node.Source = dataPoint;
            }
            dataPoint.node.Subscribe(onRefresh);
        }

        UnsubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId: ${dataId}`);
            }
            const dataPoint = this._dataPointsByDataId[dataId];
            if (!dataPoint) {
                throw new Error(`Cannot unsubscribe for unknown dataId: ${dataId}`);
            }
            dataPoint.node.Unsubscribe(onRefresh);
        }

        Read(dataId, onResponse, onError) {
            Core.validateAs('DataAccessObject', this._source, 'Read:function').Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse() for dataId: ${dataId}: ${error.message}`, error);
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
    DataPoint.Collection = Collection;

    Object.freeze(DataPoint);
    if (isNodeJS) {
        module.exports = DataPoint;
    } else {
        root.DataPoint = DataPoint;
    }
}(globalThis));