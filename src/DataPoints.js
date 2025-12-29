(function (root) {
    // ==> file: 'DataPublisher.js':
    "use strict";
    // access to other components in node js and browser:
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class DataNode {
        constructor() {
            this._data = null;
            this._onSubscriptionChanged = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            this._onDataChangedCallbacks = [];
            this._onDataChanged = data => this._handleDataChanged(data);
        }

        set OnSubscriptionChanged(value) {
            if (value && typeof value !== 'function') {
                throw new Error('Set value for OnSubscriptionChanged(subscribe, onChanged) is not a function');
            }
            if (this._onSubscriptionChanged && this._onDataChangedCallbacks.length > 0) {
                this._onSubscriptionChanged(false, this._onDataChanged);
            }
            this._onSubscriptionChanged = value;
            if (this._onSubscriptionChanged && this._onDataChangedCallbacks.length > 0) {
                this._onSubscriptionChanged(true, this._onDataChanged);
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

        get Data() {
            return this._data;
        }

        set Data(value) {
            this._handleDataChanged(value);
        }

        Subscribe(onChanged) {
            if (typeof onChanged !== 'function') {
                throw new Error('onChanged() is not a function');
            }
            for (const callback of this._onDataChangedCallbacks) {
                if (callback === onChanged) {
                    throw new Error('onChanged() is already subscribed');
                }
            }
            this._onDataChangedCallbacks.push(onChanged);
            if (this._onDataChangedCallbacks.length === 1) {
                // If first subscription we subscribe on our parent which should result in firering the event.
                if (this._unsubscribeDelayTimer) {
                    clearTimeout(this._unsubscribeDelayTimer);
                    this._unsubscribeDelayTimer = null;
                } else if (this._onSubscriptionChanged) {
                    this._onSubscriptionChanged(true, this._onDataChanged);
                }
            } else {
                // If another subscription we fire the event manually.
                try {
                    onChanged(this._data);
                } catch (error) {
                    this._onError(`Failed calling onChanged(value): ${error}`);
                }
            }
        }

        Unsubscribe(onChanged) {
            if (typeof onChanged !== 'function') {
                throw new Error('onChanged() is not a function');
            }
            for (let i = 0; i < this._onDataChangedCallbacks.length; i++) {
                if (this._onDataChangedCallbacks[i] === onChanged) {
                    this._onDataChangedCallbacks.splice(i, 1);
                    if (this._onSubscriptionChanged && this._onDataChangedCallbacks.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeDelayTimer = setTimeout(() => {
                                this._onSubscriptionChanged(false, this._onDataChanged);
                                this._unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._onSubscriptionChanged(false, this._onDataChanged);
                        }
                    }
                    return;
                }
            }
            throw new Error('onChanged() is not subscribed');
        }

        _handleDataChanged(data) {
            if (!this._equal(this._data, data)) {
                this._data = data;
                for (const onChanged of this._onDataChangedCallbacks) {
                    try {
                        onChanged(data);
                    } catch (error) {
                        this._onError(`Failed calling onChanged(value): ${error}`);
                    }
                }
            }
        }
    }

    class DataPublisher {
        constructor() {
            Common.validateDataPublisherInterface(this, true);
            this._operational = new DataNode();
            this._operational.Data = false;
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
                Common.validateDataPublisherInterface(value, true);
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
                Common.validateDataPublisherInterface(this._parent);
                return this._parent.IsOperational;
            }
            return false;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            Common.validateDataPublisherInterface(this._parent);
            this._operational.Subscribe(onOperationalStateChanged);
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            Common.validateDataPublisherInterface(this._parent);
            this._operational.Unsubscribe(onOperationalStateChanged);
        }

        SubscribeData(dataId, onDataUpdate) {
            Common.validateDataPublisherInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId: ${dataId}`);
            } else if (typeof onDataUpdate !== 'function') {
                throw new Error(`onDataUpdate() for dataId '${dataId}' is not a function`);
            }
            let data = this._datas[dataId];
            if (data) {
                for (const callback of data.callbacks) {
                    if (callback === onDataUpdate) {
                        throw new Error(`onDataUpdate() for dataId '${dataId}' is already subscribed`);
                    }
                }
            } else {
                this._datas[dataId] = data = this._createData(dataId);
            }
            data.callbacks.push(onDataUpdate);
            if (data.callbacks.length === 1) {
                // If first subscription we subscribe on our parent which should result in firering the event.
                if (data.unsubscribeDelayTimer) {
                    clearTimeout(data.unsubscribeDelayTimer);
                    data.unsubscribeDelayTimer = null;
                } else {
                    this._parent.SubscribeData(data.dataId, data.onDataUpdate);
                }
            } else if (data.value !== null) {
                // If another subscription we fire the event manually.
                try {
                    onDataUpdate(data.value);
                } catch (error) {
                    this._onError(`Failed calling onDataUpdate(): ${error}`);
                }
            }
        }

        UnsubscribeData(dataId, onDataUpdate) {
            Common.validateDataPublisherInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription dataId: ${dataId}`);
            } else if (typeof onDataUpdate !== 'function') {
                throw new Error(`onDataUpdate() for dataId '${dataId}' is not a function`);
            }
            let data = this._datas[dataId];
            if (!data) {
                throw new Error(`Cannot unsubscribe for unknown dataId: ${dataId}`);
            }
            for (let i = 0; i < data.callbacks.length; i++) {
                if (data.callbacks[i] === onDataUpdate) {
                    data.callbacks.splice(i, 1);
                    if (data.callbacks.length === 0) {
                        if (this._unsubscribeDelay) {
                            data.unsubscribeDelayTimer = setTimeout(() => {
                                this._parent.UnsubscribeData(data.dataId, data.onDataUpdate);
                                data.unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._parent.UnsubscribeData(data.dataId, data.onDataUpdate);
                        }
                    }
                    return;
                }
            }
            throw new Error(`onDataUpdate() for dataId: ${dataId} is not subscribed`);
        }

        Read(dataId, onResponse, onError) {
            Common.validateDataPublisherInterface(this._parent);
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
            Common.validateDataPublisherInterface(this._parent);
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
                                this._onError(`Failed calling onDataUpdate(value) for dataId: ${data.dataId}: ${error}`);
                            }
                        }
                    }
                },
                onDataUpdate: value => data.SetValue(value),
                callbacks: [],
                unsubscribeDelayTimer: null
            };
            return data;
        }
    }

    if (isNodeJS) {
        module.exports = DataPublisher;
    } else {
        root.DataPublisher = DataPublisher;
    }
}(globalThis));