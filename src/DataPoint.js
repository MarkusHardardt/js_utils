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
            Common.validateSubscribableInterface(this, true);
            this._value = null;
            this._subscribable = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            this._subscriptions = [];
            this._onRefresh = value => this._handleRefresh(value);
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
            this._handleRefresh(value);
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

        _handleRefresh(value) {
            if (!this._equal(this._value, value)) {
                this._value = value;
                for (const onRefresh of this._subscriptions) {
                    try {
                        onRefresh(value);
                    } catch (error) {
                        this._onError(`Failed calling onRefresh(value): ${error}`);
                    }
                }
            }
        }
    }
    DataPoint.Node = Node;

    class Collection {
        constructor() {
            Common.validateDataPointInterface(this, true);
            this._operational = new Node();
            this._operational.Value = false;
            this._parent = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._datas = {};
        }

        set Parent(value) {
            if (this._parent) {
                this._parent.UnsubscribeOperationalState(this._operational); TODO: Go on here
            }
            if (value) {
                Common.validateDataPointInterface(value, true);
                this._parent = value;
            }
            else {
                this._parent = null;
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
            this._operational.OnError = value;
        }

        set UnsubscribeDataDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
            this._operational.UnsubscribeDelay = value;
        }

        get IsOperational() {
            if (this._parent) {
                Common.validateDataPointInterface(this._parent);
                return this._parent.IsOperational;
            }
            return false;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            Common.validateDataPointInterface(this._parent);
            this._operational.Subscribe(onOperationalStateChanged);
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            Common.validateDataPointInterface(this._parent);
            this._operational.Unsubscribe(onOperationalStateChanged);
        }

        SubscribeData(dataId, onRefresh) {
            Common.validateDataPointInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId: ${dataId}`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`onRefresh() for dataId '${dataId}' is not a function`);
            }
            let data = this._datas[dataId];
            if (data) {
                for (const callback of data.callbacks) {
                    if (callback === onRefresh) {
                        throw new Error(`onRefresh() for dataId '${dataId}' is already subscribed`);
                    }
                }
            } else {
                this._datas[dataId] = data = this._createData(dataId);
            }
            data.callbacks.push(onRefresh);
            if (data.callbacks.length === 1) {
                // If first subscription we subscribe on our parent which should result in firering the event.
                if (data.unsubscribeDelayTimer) {
                    clearTimeout(data.unsubscribeDelayTimer);
                    data.unsubscribeDelayTimer = null;
                } else {
                    this._parent.SubscribeData(data.dataId, data.onRefresh);
                }
            } else if (data.value !== null) {
                // If another subscription we fire the event manually.
                try {
                    onRefresh(data.value);
                } catch (error) {
                    this._onError(`Failed calling onRefresh(): ${error}`);
                }
            }
        }

        UnsubscribeData(dataId, onRefresh) {
            Common.validateDataPointInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId: ${dataId}`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`onRefresh() for dataId '${dataId}' is not a function`);
            }
            let data = this._datas[dataId];
            if (!data) {
                throw new Error(`Cannot unsubscribe for unknown dataId: ${dataId}`);
            }
            for (let i = 0; i < data.callbacks.length; i++) {
                if (data.callbacks[i] === onRefresh) {
                    data.callbacks.splice(i, 1);
                    if (data.callbacks.length === 0) {
                        if (this._unsubscribeDelay) {
                            data.unsubscribeDelayTimer = setTimeout(() => {
                                this._parent.UnsubscribeData(data.dataId, data.onRefresh);
                                data.unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._parent.UnsubscribeData(data.dataId, data.onRefresh);
                        }
                    }
                    return;
                }
            }
            throw new Error(`onRefresh() for dataId: ${dataId} is not subscribed`);
        }

        Read(dataId, onResponse, onError) {
            Common.validateDataPointInterface(this._parent);
            this._parent.Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse() for dataId: ${dataId}: ${error}`);
                }
                let data = this._datas[dataId];
                if (!data) {
                    this._datas[dataId] = data = this._createData(dataId);
                }
                data.SetValue(value);
            }, onError);
        }

        Write(dataId, value) {
            Common.validateDataPointInterface(this._parent);
            this._parent.Write(dataId, value);
            let data = this._datas[dataId];
            if (!data) {
                this._datas[dataId] = data = this._createData(dataId);
            }
            data.SetValue(value);
        }

        _createData(dataId) {
            const data = {
                dataId,
                value: null,
                SetValue: value => {
                    if (!this._equal(value, data.value)) {
                        data.value = value;
                        for (const callback of data.callbacks) {
                            try {
                                callback(value);
                            } catch (error) {
                                this._onError(`Failed calling onRefresh(value) for dataId: ${data.dataId}: ${error}`);
                            }
                        }
                    }
                },
                onRefresh: value => data.SetValue(value),
                callbacks: [],
                unsubscribeDelayTimer: null
            };
            return data;
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