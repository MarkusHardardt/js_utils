(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    const defaultEqual = (v1, v2) => v1 === v2;
    const defaultOnError = error => console.error(error);

    class DataPublisher {
        constructor() {
            Global.validateDataPublisherInterface(this, true);
            this._parent = null;
            this._equal = defaultEqual;
            this._onError = defaultOnError;
            this._unsubscribeDelay = false;
            this._events = {};
        }

        set Parent(value) {
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

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        SubscribeData(dataId, onDataUpdate) {
            Global.validateDataPublisherInterface(this._parent);
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription id: ${dataId}`);
            } else if (typeof onDataUpdate !== 'function') {
                throw new Error(`onDataUpdate() for id '${dataId}' is not a function`);
            }
            let event = this._events[dataId];
            if (event) {
                for (const callback of event.callbacks) {
                    if (callback === onDataUpdate) {
                        throw new Error(`onDataUpdate() for id '${dataId}' is already contained`);
                    }
                }
            } else {
                this._events[dataId] = event = this._createEvent(dataId);
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
            let event = this._events[dataId];
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
            throw new Error(`onDataUpdate() for id: ${dataId} is not contained`);
        }

        Read(dataId, onResponse, onError) {
            Global.validateDataPublisherInterface(this._parent);
            this._parent.Read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse() for id: ${dataId}: ${error}`);
                }
                let event = this._events[dataId];
                if (!event) {
                    this._events[dataId] = event = this._createEvent(dataId);
                }
                event.SetValue(value);
            }, onError);
        }

        Write(dataId, value) {
            Global.validateDataPublisherInterface(this._parent);
            this._parent.Write(dataId, value);
            let event = this._events[dataId];
            if (!event) {
                this._events[dataId] = event = this._createEvent(dataId);
            }
            event.SetValue(value);
        }

        _createEvent(id) {
            const event = {
                id,
                value: null,
                SetValue: value => {
                    if (!this._equal(value, event.value)) {
                        event.value = value;
                        for (const callback of event.callbacks) {
                            try {
                                callback(value);
                            } catch (error) {
                                this._onError(`Failed calling onDataUpdate(value) for id: ${event.id}: ${error}`);
                            }
                        }
                    }
                },
                onDataUpdate: value => event.SetValue(value),
                callbacks: [],
                unsubscribeDelayTimer: null
            };
            return event;
        }
    }

    if (isNodeJS) {
        module.exports = DataPublisher;
    } else {
        root.DataPublisher = DataPublisher;
    }
}(globalThis));