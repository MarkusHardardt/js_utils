(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class DataPublisher {
        constructor() {
            Global.validateDataPublisherInterface(this, true);
            this._isOperational = false;
            this._parent = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._unsubscribeOpStateDelayTimer = null;
            this._onOperationalStateChangedCallbacks = [];
            this._onOperationalStateChanged = isOperational => {
                if (this._isOperational !== isOperational) {
                    this._fireOperationalStateChanged(isOperational);
                }
            };
            this._onDataUpdateCallbacks = {};
        }

        set Parent(value) {
            this.ParentOperationalState = value;
            if (value) {
                Global.validateDataPublisherInterface(value, true);
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
        }

        set UnsubscribeDataDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        get IsOperational() {
            if (this._parent) {
                Global.validateDataPublisherInterface(this._parent);
                return this._parent.IsOperational;
            }
            return false;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            Global.validateDataPublisherInterface(this._parent);
            if (typeof onOperationalStateChanged !== 'function') {
                throw new Error('onOperationalStateChanged() is not a function');
            }
            for (const callback of this._onOperationalStateChangedCallbacks) {
                if (callback === onOperationalStateChanged) {
                    throw new Error('onOperationalStateChanged() is already subscribed');
                }
            }
            this._onOperationalStateChangedCallbacks.push(onOperationalStateChanged);
            if (this._onOperationalStateChangedCallbacks.length === 1) {
                if (this._unsubscribeOpStateDelayTimer) {
                    clearTimeout(this._unsubscribeOpStateDelayTimer);
                    this._unsubscribeOpStateDelayTimer = null;
                }
                else {
                    this._parent.SubscribeOperationalState(this._onOperationalStateChanged);
                }
            }
            this._fireOperationalStateChanged(this._isOperational);
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            Global.validateDataPublisherInterface(this._parent);
            if (typeof onOperationalStateChanged !== 'function') {
                throw new Error('onOperationalStateChanged() is not a function');
            }
            for (let i = 0; i < this._onOperationalStateChangedCallbacks.length; i++) {
                if (this._onOperationalStateChangedCallbacks[i] === onOperationalStateChanged) {
                    this._onOperationalStateChangedCallbacks.splice(i, 1);
                    if (this._onOperationalStateChangedCallbacks.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeOpStateDelayTimer = setTimeout(() => {
                                this._parent.UnsubscribeOperationalState(this._onOperationalStateChanged);
                                this._unsubscribeOpStateDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._parent.UnsubscribeOperationalState(this._onOperationalStateChanged);
                        }
                    }
                    return;
                }
            }
            throw new Error('onOperationalStateChanged() is not subscribed');
        }

        _fireOperationalStateChanged(isOperational) {
            this._isOperational = isOperational === true;
            for (const callback of this._onOperationalStateChangedCallbacks) {
                try {
                    callback(isOperational);
                } catch (error) {
                    this._onError(`Failed calling onOperationalStateChanged(value): ${error}`);
                }
            }
        }

        SubscribeData(dataId, onDataUpdate) {
            Global.validateDataPublisherInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription id: ${dataId}`);
            } else if (typeof onDataUpdate !== 'function') {
                throw new Error(`onDataUpdate() for id '${dataId}' is not a function`);
            }
            let event = this._onDataUpdateCallbacks[dataId];
            if (event) {
                for (const callback of event.callbacks) {
                    if (callback === onDataUpdate) {
                        throw new Error(`onDataUpdate() for id '${dataId}' is already subscribed`);
                    }
                }
            } else {
                this._onDataUpdateCallbacks[dataId] = event = this._createData(dataId);
            }
            event.callbacks.push(onDataUpdate);
            if (event.callbacks.length === 1) {
                if (event.unsubscribeDelayTimer) {
                    clearTimeout(event.unsubscribeDelayTimer);
                    event.unsubscribeDelayTimer = null;
                }
                else {
                    this._parent.SubscribeData(event.id, event.onDataUpdate);
                }
            }
        }

        UnsubscribeData(dataId, onDataUpdate) {
            Global.validateDataPublisherInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription id: ${dataId}`);
            } else if (typeof onDataUpdate !== 'function') {
                throw new Error(`onDataUpdate() for id '${dataId}' is not a function`);
            }
            let event = this._onDataUpdateCallbacks[dataId];
            if (!event) {
                throw new Error(`Cannot unsubscribe for unknown id: ${dataId}`);
            }
            for (let i = 0; i < event.callbacks.length; i++) {
                if (event.callbacks[i] === onDataUpdate) {
                    event.callbacks.splice(i, 1);
                    if (event.callbacks.length === 0) {
                        if (this._unsubscribeDelay) {
                            event.unsubscribeDelayTimer = setTimeout(() => {
                                this._parent.UnsubscribeData(event.id, event.onDataUpdate);
                                event.unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._parent.UnsubscribeData(event.id, event.onDataUpdate);
                        }
                    }
                    return;
                }
            }
            throw new Error(`onDataUpdate() for id: ${dataId} is not subscribed`);
        }

        Read(dataId, onResponse, onError) {
            Global.validateDataPublisherInterface(this._parent);
            this._parent.Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse() for id: ${dataId}: ${error}`);
                }
                let event = this._onDataUpdateCallbacks[dataId];
                if (!event) {
                    this._onDataUpdateCallbacks[dataId] = event = this._createData(dataId);
                }
                event.SetValue(value);
            }, onError);
        }

        Write(dataId, value) {
            Global.validateDataPublisherInterface(this._parent);
            this._parent.Write(dataId, value);
            let event = this._onDataUpdateCallbacks[dataId];
            if (!event) {
                this._onDataUpdateCallbacks[dataId] = event = this._createData(dataId);
            }
            event.SetValue(value);
        }

        _createData(dataId) {
            const data = {
                id: dataId,
                value: null,
                SetValue: value => {
                    if (!this._equal(value, data.value)) {
                        data.value = value;
                        for (const callback of data.callbacks) {
                            try {
                                callback(value);
                            } catch (error) {
                                this._onError(`Failed calling onDataUpdate(value) for id: ${data.id}: ${error}`);
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