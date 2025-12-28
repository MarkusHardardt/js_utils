(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Global = isNodeJS ? require('./Global.js') : root.Global;
    const OperationalState = isNodeJS ? require('./OperationalState.js') : root.OperationalState;

    class DataPublisher extends OperationalState {
        constructor() {
            super();
            Global.validateDataPublisherInterface(this, true);
            this._parentDataPublisher = null;
            this._equal = Core.defaultEqual;
            this._onError = Core.defaultOnError;
            this._unsubscribeDataDelay = false;
            this._onDataUpdateCallbacks = {};
        }

        set ParentDataPublisher(value) {
            this.ParentOperationalState = value;
            if (value) {
                Global.validateDataPublisherInterface(value, true);
                this._parentDataPublisher = value;
            }
            else {
                this._parentDataPublisher = null;
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
            this._unsubscribeDataDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        SubscribeData(dataId, onDataUpdate) {
            Global.validateDataPublisherInterface(this._parentDataPublisher);
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
                    this._parentDataPublisher.SubscribeData(event.id, event.onDataUpdate);
                }
            }
        }

        UnsubscribeData(dataId, onDataUpdate) {
            Global.validateDataPublisherInterface(this._parentDataPublisher);
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
                        if (this._unsubscribeDataDelay) {
                            event.unsubscribeDelayTimer = setTimeout(() => {
                                this._parentDataPublisher.UnsubscribeData(event.id, event.onDataUpdate);
                                event.unsubscribeDelayTimer = null;
                            }, this._unsubscribeDataDelay);
                        } else {
                            this._parentDataPublisher.UnsubscribeData(event.id, event.onDataUpdate);
                        }
                    }
                    return;
                }
            }
            throw new Error(`onDataUpdate() for id: ${dataId} is not subscribed`);
        }

        Read(dataId, onResponse, onError) {
            Global.validateDataPublisherInterface(this._parentDataPublisher);
            this._parentDataPublisher.Read(dataId, value => {
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
            Global.validateDataPublisherInterface(this._parentDataPublisher);
            this._parentDataPublisher.Write(dataId, value);
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