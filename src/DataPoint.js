(function (root) {
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
            let that = this;
            this._onRefresh = function (value) {
                 that._refresh(value);
            };
            this._observers = [];
            this._observable = null;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            Common.validateAsObservable(this, true);
        }

        set Observable(value) {
            if (this._observable !== value) {
                if (this._observable && this._observers.length > 0) {
                    this._observable.Unsubscribe(this._onRefresh);
                }
                if (value) {
                    Common.validateAsObservable(value, true);
                    this._observable = value;
                } else {
                    this._observable = null;
                }
                if (this._observable && this._observers.length > 0) {
                    this._observable.Subscribe(this._onRefresh);
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
                if (!this._observable || this._observers.length > 1) {
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
                    } else {
                        this._observable.Subscribe(this._onRefresh);
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
                    if (this._observable && this._observers.length === 0) {
                        if (this._unsubscribeDelay) {
                            let that = this;
                            this._unsubscribeDelayTimer = setTimeout(function () {
                                that._observable.Unsubscribe(that._onRefresh);
                                that._unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._observable.Unsubscribe(this._onRefresh);
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

    class OperationalState {
        constructor() {
            this._operational = new DataPoint.Node();
            this._operational.Value = false;
            this._operational.Observable = null;
            Common.validateAsOperationalState(this, true);
        }

        set OnError(value) {
            this._operational.OnError = value;
        }

        set Observable(value) {
            this._operational.Observable = value;
        }

        set UnsubscribeDelay(value) {
            this._operational.UnsubscribeDelay = value;
        }

        get IsOperational() {
            return this._operational.Value;
        }

        set IsOperational(value) {
            this._operational.Value = value;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            this._operational.Subscribe(onOperationalStateChanged);
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            this._operational.Unsubscribe(onOperationalStateChanged);
        }
    }
    DataPoint.OperationalState = OperationalState;

    class Router extends OperationalState {
        constructor() {
            super();
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

    class Collection extends OperationalState { // NOTE: Remove if after some time still not required
        constructor() {
            super();
            let that = this;
            Observable = { // What happens here? We call the OperationalState.Observable setter
                // Not: The following 'onRefresh' function is the local instance inside our node created above.
                Subscribe: function (onRefresh) {
                    if (that._parentDataAccessObject) {
                        that._parentDataAccessObject.SubscribeOperationalState(onRefresh);
                    }
                },
                Unsubscribe: function (onRefresh) {
                    if (that._parentDataAccessObject) {
                        that._parentDataAccessObject.UnsubscribeOperationalState(onRefresh);
                    }
                }
            };
            this._parentDataAccessObject = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._dataPointsByDataId = {};
            Common.validateAsDataAccessObject(this, true);
        }

        set Parent(value) { // TODO: 
            if (this._parentDataAccessObject !== value) { // TODO: unsubscribe and re-subscribe existing subscriptions
                if (value) {
                    Common.validateAsDataAccessObject(value, true);
                    this._parentDataAccessObject = value;
                }
                else {
                    this._parentDataAccessObject = null;
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
            super.OnError = value;
            this._onError = value;
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.OnError = value;
                }
            }
        }

        set UnsubscribeDelay(value) {
            super.UnsubscribeDelay = value;
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
            for (const dataId in this._dataPointsByDataId) {
                if (this._dataPointsByDataId.hasOwnProperty(dataId)) {
                    this._dataPointsByDataId[dataId].node.UnsubscribeDelay = value;
                }
            }
        }

        GetType(dataId) {
            return Common.validateAsDataAccessObject(this._parentDataAccessObject).GetType(dataId);
        }

        SubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId: ${dataId}`);
            }
            let data = this._dataPointsByDataId[dataId];
            if (!data) {
                this._dataPointsByDataId[dataId] = data = this._createDataForId(dataId);
            }
            data.node.Subscribe(onRefresh);
        }

        UnsubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId: ${dataId}`);
            }
            let data = this._dataPointsByDataId[dataId];
            if (!data) {
                throw new Error(`Cannot unsubscribe for unknown dataId: ${dataId}`);
            }
            data.node.Unsubscribe(onRefresh);
        }

        Read(dataId, onResponse, onError) {
            let that = this;
            Common.validateAsDataAccessObject(this._parentDataAccessObject).Read(dataId, function (value) {
                try {
                    onResponse(value);
                } catch (error) {
                    that._onError(`Failed calling onResponse() for dataId: ${dataId}: ${error.message}`, error);
                }
                let data = that._dataPointsByDataId[dataId];
                if (data) {
                    data.node.Value = value;
                }
            }, onError);
        }

        Write(dataId, value) {
            Common.validateAsDataAccessObject(this._parentDataAccessObject).Write(dataId, value);
        }

        _createDataForId(dataId) {
            const node = new Node();
            let that = this;
            const subscribableData = {
                node,
                // Not: The following 'onRefresh' function is the local instance inside our node created above.
                Subscribe: function(onRefresh) {
                    if (that._parentDataAccessObject) {
                        that._parentDataAccessObject.SubscribeData(dataId, onRefresh);
                    }
                },
                Unsubscribe: function(onRefresh) {
                    if (that._parentDataAccessObject) {
                        that._parentDataAccessObject.UnsubscribeData(dataId, onRefresh);
                    }
                }
            };
            node.UnsubscribeDelay = this._unsubscribeDelay;
            node.Equal = this._equal;
            node.OnError = this._onError;
            node.Value = null;
            node.Observable = subscribableData;
            return subscribableData;
        }

        _destroyData(data) { // TODO: Use ore remove
            const node = data.node;
            node.Value = null;
            node.Observable = null;
            delete data.node;
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