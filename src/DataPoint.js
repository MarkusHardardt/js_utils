(function (root) {
    // ==> file: 'DataPoint.js':
    "use strict";
    const DataPoint = {};
    // access to other components in node js and browser:
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Node {
        constructor() {
            this._value = null;
            this._subscribable = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            this._subscriptions = [];
            this._onRefresh = value => this._refresh(value);
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

        Subscribe(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('onRefresh() is not a function');
            }
            for (const callback of this._subscriptions) {
                if (callback === onRefresh) {
                    throw new Error('onRefresh() is already subscribed');
                }
            }
            this._subscriptions.push(onRefresh);
            if (this._subscriptions.length === 1) {
                // If first subscription we subscribe on our parent which should result in firering the event.
                if (this._unsubscribeDelayTimer) {
                    clearTimeout(this._unsubscribeDelayTimer);
                    this._unsubscribeDelayTimer = null;
                } else if (this._subscribable) {
                    this._subscribable.Subscribe(this._onRefresh);
                }
            } else {
                // If another subscription we fire the event manually.
                try {
                    onRefresh(this._value);
                } catch (error) {
                    this._onError(`Failed calling onRefresh(value): ${error}`);
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
            throw new Error('onRefresh() is not subscribed');
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

    class Collection {
        constructor() {
            this._operational = new Node();
            this._operational.Value = false;
            this._operational.Subscribable = {
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
            this._datas = {};
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
            for (const dataId in this._datas) {
                if (this._datas.hasOwnProperty(dataId)) {
                    this._datas[dataId].node.Equal = value;
                }
            }
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._onError = value;
            this._operational.OnError = value;
            for (const dataId in this._datas) {
                if (this._datas.hasOwnProperty(dataId)) {
                    this._datas[dataId].node.OnError = value;
                }
            }
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
            this._operational.UnsubscribeDelay = value;
            for (const dataId in this._datas) {
                if (this._datas.hasOwnProperty(dataId)) {
                    this._datas[dataId].node.UnsubscribeDelay = value;
                }
            }
        }

        get IsOperational() {
            return this._operational.Value;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            this._operational.Subscribe(onOperationalStateChanged);
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            this._operational.Unsubscribe(onOperationalStateChanged);
        }

        SubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId: ${dataId}`);
            }
            let data = this._datas[dataId];
            if (!data) {
                this._datas[dataId] = data = this._createDataForId(dataId);
            }
            data.node.Subscribe(onRefresh);
        }

        UnsubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId: ${dataId}`);
            }
            let data = this._datas[dataId];
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
                let data = this._datas[dataId];
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