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
            this._subscriptions = [];
            this._subscribable = null; // TODO: Find better name
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            Common.validateSubscribableInterface(this, true);
        }

        set Subscribable(value) {
            if (this._subscribable !== value) {
                if (this._subscribable && this._subscriptions.length > 0) {
                    this._subscribable.Unsubscribe(this._onRefresh);
                }
                if (value) {
                    Common.validateSubscribableInterface(value, true);
                    this._subscribable = value;
                } else {
                    this._subscribable = null;
                }
                if (this._subscribable && this._subscriptions.length > 0) {
                    this._subscribable.Subscribe(this._onRefresh);
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
            return this._subscriptions.length;
        }

        Subscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh() is not a function');
            }
            let alreadySubscribed = false;
            for (const callback of this._subscriptions) {
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
                this._subscriptions.push(onRefresh);
                if (!this._subscribable || this._subscriptions.length > 1) {
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
                        this._subscribable.Subscribe(this._onRefresh);
                    }
                }
            }
        }

        Unsubscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh() is not a function');
            }
            for (let i = 0; i < this._subscriptions.length; i++) {
                if (this._subscriptions[i] === onRefresh) {
                    this._subscriptions.splice(i, 1);
                    if (this._subscribable && this._subscriptions.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeDelayTimer = setTimeout(() => {
                                this._subscribable.Unsubscribe(this._onRefresh);
                                this._unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._subscribable.Unsubscribe(this._onRefresh);
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
                for (const onRefresh of this._subscriptions) {
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
            this._operational.Subscribable = null;
            Common.validateOperationalStateInterface(this, true);
        }

        set OnError(value) {
            this._operational.OnError = value;
        }

        set Subscribable(value) {
            this._operational.Subscribable = value;
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
            this._onError = Core.defaultOnError; // TODO: Used?
            this._targets = {};
            this._splitIntoTargetAndDataId = null;
            Common.validateDataPointCollectionInterface(this, true);
        }

        set OnError(value) {
            super.OnError = value;
            this._onError = value;
        }

        set SplitIntoTargetAndDataId(value) {
            if (typeof value !== 'function') {
                throw new Error('Passed splitIntoTargetAndDataId(id) is not a function');
            }
            this._splitIntoTargetAndDataId = value;
        }

        Register(targetId, target) {
            Common.validateDataPointCollectionInterface(target, true);
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target '${targetId}' for Register(target, system)`);
            } else if (this._targets[targetId] !== undefined) {
                throw new Error(`Target '${targetId}' already registered`);
            }
            this._targets[targetId] = target;
        }

        Unregister(targetId, target) {
            Common.validateDataPointCollectionInterface(target, true);
            if (typeof targetId !== 'string') {
                throw new Error(`Invalid target '${targetId}' for Unregister(target, system)`);
            } else if (this._targets[targetId] === undefined) {
                throw new Error(`Target '${targetId}' not registered`);
            } else if (this._targets[targetId] !== target) {
                throw new Error(`Other target '${targetId}' registered`);
            }
            delete this._targets[targetId];
        }

        GetType(dataId) {
            if (!this._splitIntoTargetAndDataId) {
                throw new Error('Function splitIntoTargetAndDataId(id) is not available');
            }
            let target = null;
            let subDataId = null;
            this._splitIntoTargetAndDataId(dataId, (tId, dId) => {
                target = tId;
                subDataId = dId;
            }, error => {
                throw new Error(`Error splitting '${dataId}' into target and sub-id: ${error}`, error);
            });
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for GetType(dataId)`);
            } else if (this._targets[target] === undefined) {
                throw new Error(`Target '${target}' not registered for GetType(dataId)`);
            } else {
                return this._targets[target].GetType(subDataId);
            }
        }

        SubscribeData(dataId, onRefresh) {
            if (!this._splitIntoTargetAndDataId) {
                throw new Error('Function splitIntoTargetAndDataId(id) is not available');
            }
            let target = null;
            let subDataId = null;
            this._splitIntoTargetAndDataId(dataId, (tId, dId) => {
                target = tId;
                subDataId = dId;
            }, error => {
                throw new Error(`Error splitting '${dataId}' into target and sub-id: ${error}`, error);
            });
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for SubscribeData(dataId, onRefresh)`);
            } else if (this._targets[target] === undefined) {
                throw new Error(`Target '${target}' not registered for SubscribeData(dataId, onRefresh)`);
            } else {
                this._targets[target].SubscribeData(subDataId, onRefresh);
            }
        }

        UnsubscribeData(dataId, onRefresh) {
            if (!this._splitIntoTargetAndDataId) {
                throw new Error('Function splitIntoTargetAndDataId(id) is not available');
            }
            let target = null;
            let subDataId = null;
            this._splitIntoTargetAndDataId(dataId, (tId, dId) => {
                target = tId;
                subDataId = dId;
            }, error => {
                throw new Error(`Error splitting '${dataId}' into target and sub-id: ${error}`, error);
            });
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for UnsubscribeData(dataId, onRefresh)`);
            } else if (this._targets[target] === undefined) {
                throw new Error(`Target '${target}' not registered for UnsubscribeData(dataId, onRefresh)`);
            } else {
                this._targets[target].UnsubscribeData(subDataId, onRefresh);
            }
        }

        Read(dataId, onResponse, onError) {
            if (!this._splitIntoTargetAndDataId) {
                throw new Error('Function splitIntoTargetAndDataId(id) is not available');
            }
            let target = null;
            let subDataId = null;
            this._splitIntoTargetAndDataId(dataId, (tId, dId) => {
                target = tId;
                subDataId = dId;
            }, error => {
                throw new Error(`Error splitting '${dataId}' into target and sub-id: ${error}`, error);
            });
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Read(id, onResponse, onError)`);
            } else if (this._targets[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Read()`);
            } else {
                this._targets[target].Read(subDataId, onResponse, onError);
            }
        }

        Write(dataId, value) {
            if (!this._splitIntoTargetAndDataId) {
                throw new Error('Function splitIntoTargetAndDataId(id) is not available');
            }
            let target = null;
            let subDataId = null;
            this._splitIntoTargetAndDataId(dataId, (tId, dId) => {
                target = tId;
                subDataId = dId;
            }, error => {
                throw new Error(`Error splitting '${dataId}' into target and sub-id: ${error}`, error);
            });
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Write(id, value)`);
            } else if (this._targets[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Write()`);
            } else {
                this._targets[target].Write(subDataId, value);
            }
        }
    }
    DataPoint.Router = Router;

    class Collection extends OperationalState { // NOTE: Remove if after some time still not required
        constructor() {
            super();
            Subscribable = {
                // Not: The following 'onRefresh' function is the local instance inside our node created above.
                Subscribe: onRefresh => {
                    if (this._parent) {
                        this._parent.SubscribeOperationalState(onRefresh);
                    }
                },
                Unsubscribe: onRefresh => {
                    if (this._parent) {
                        this._parent.UnsubscribeOperationalState(onRefresh);
                    }
                }
            };
            this._parent = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._dataPointsByDataId = {};
            Common.validateDataPointCollectionInterface(this, true);
        }

        set Parent(value) { // TODO: 
            if (this._parent !== value) { // TODO: unsubscribe and re-subscribe existing subscriptions
                if (value) {
                    Common.validateDataPointCollectionInterface(value, true);
                    this._parent = value;
                }
                else {
                    this._parent = null;
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
            Common.validateDataPointCollectionInterface(this._parent);
            return this._parent.GetType(dataId);
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
            Common.validateDataPointCollectionInterface(this._parent);
            this._parent.Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse() for dataId: ${dataId}: ${error.message}`, error);
                }
                let data = this._dataPointsByDataId[dataId];
                if (data) {
                    data.node.Value = value;
                }
            }, onError);
        }

        Write(dataId, value) {
            Common.validateDataPointCollectionInterface(this._parent);
            this._parent.Write(dataId, value);
        }

        _createDataForId(dataId) {
            const node = new Node();
            const subscribableData = {
                node,
                // Not: The following 'onRefresh' function is the local instance inside our node created above.
                Subscribe: onRefresh => {
                    if (this._parent) {
                        this._parent.SubscribeData(dataId, onRefresh);
                    }
                },
                Unsubscribe: onRefresh => {
                    if (this._parent) {
                        this._parent.UnsubscribeData(dataId, onRefresh);
                    }
                }
            };
            node.UnsubscribeDelay = this._unsubscribeDelay;
            node.Equal = this._equal;
            node.OnError = this._onError;
            node.Value = null;
            node.Subscribable = subscribableData;
            return subscribableData;
        }

        _destroyData(data) { // TODO: Use ore remove
            const node = data.node;
            node.Value = null;
            node.Subscribable = null;
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