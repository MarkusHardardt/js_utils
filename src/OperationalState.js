(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class OperationalState {
        constructor() {
            Global.validateOperationalStateInterface(this, true);
            this._isOperational = false;
            this._parent = null;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            this._onOperationalStateChangedCallbacks = [];
            this._onOperationalStateChanged = isOperational => this._setOperationalState(isOperational);
        }

        set Parent(value) {
            if (value) {
                Global.validateOperationalStateInterface(value, true);
                this._parent = value;
            }
            else {
                this._parent = null;
            }
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

        get IsOperational() {
            if (this._parent) {
                Global.validateOperationalStateInterface(this._parent);
                return this._parent.IsOperational;
            }
            return false;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            Global.validateOperationalStateInterface(this._parent);
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
                if (this._unsubscribeDelayTimer) {
                    clearTimeout(this._unsubscribeDelayTimer);
                    this._unsubscribeDelayTimer = null;
                }
                else {
                    this._parent.SubscribeOperationalState(this._onOperationalStateChanged);
                }
            }
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            Global.validateOperationalStateInterface(this._parent);
            if (typeof onOperationalStateChanged !== 'function') {
                throw new Error('onOperationalStateChanged() is not a function');
            }
            for (let i = 0; i < this._onOperationalStateChangedCallbacks.length; i++) {
                if (this._onOperationalStateChangedCallbacks[i] === onOperationalStateChanged) {
                    this._onOperationalStateChangedCallbacks.splice(i, 1);
                    if (this._onOperationalStateChangedCallbacks.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeDelayTimer = setTimeout(() => {
                                this._parent.UnsubscribeOperationalState(this._onOperationalStateChanged);
                                this._unsubscribeDelayTimer = null;
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

        _setOperationalState(isOperational) {
            if (this._isOperational !== isOperational) {
                this._isOperational = isOperational;
                for (const callback of this._onOperationalStateChangedCallbacks) {
                    try {
                        callback(value);
                    } catch (error) {
                        this._onError(`Failed calling onOperationalStateChanged(value): ${error}`);
                    }
                }
            }
        }
    }

    if (isNodeJS) {
        module.exports = OperationalState;
    } else {
        root.OperationalState = OperationalState;
    }
}(globalThis));
