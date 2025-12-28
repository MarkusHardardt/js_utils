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
            this._onOperationalStateChanged = isOperational => this._handleOperationalStateChanged(isOperational === true);
            this._datas = {};
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
                // If first subscription we subscribe on our parent which should result in firering the event.
                if (this._unsubscribeOpStateDelayTimer) {
                    clearTimeout(this._unsubscribeOpStateDelayTimer);
                    this._unsubscribeOpStateDelayTimer = null;
                } else {
                    this._parent.SubscribeOperationalState(this._onOperationalStateChanged);
                }
            } else {
                // If another subscription we fire the event manually.
                try {
                    onOperationalStateChanged(this._isOperational);
                } catch (error) {
                    this._onError(`Failed calling onOperationalStateChanged(value): ${error}`);
                }
            }
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

        _handleOperationalStateChanged(isOperational) {
            if (this._isOperational !== isOperational) {
                this._isOperational = isOperational;
                for (const callback of this._onOperationalStateChangedCallbacks) {
                    try {
                        callback(isOperational);
                    } catch (error) {
                        this._onError(`Failed calling onOperationalStateChanged(value): ${error}`);
                    }
                }
            }
        }

        SubscribeData(dataId, onDataUpdate) {
            Global.validateDataPublisherInterface(this._parent);
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
            Global.validateDataPublisherInterface(this._parent);
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
            Global.validateDataPublisherInterface(this._parent);
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
            Global.validateDataPublisherInterface(this._parent);
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