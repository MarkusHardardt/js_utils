(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class OperationalState {
        constructor() {
            Global.validateOperationalStateInterface(this, true);
            this._isOperational = false;
            this._parentOperationalState = null;
            this._onError = Core.defaultOnError;
            this._unsubscribeOpStateDelay = false;
            this._unsubscribeOpStateDelayTimer = null;
            this._onOperationalStateChangedCallbacks = [];
            this._onOperationalStateChanged = isOperational => this._setOperationalState(isOperational);
        }

        set ParentOperationalState(value) {
            if (value) {
                Global.validateOperationalStateInterface(value, true);
                this._parentOperationalState = value;
            }
            else {
                this._parentOperationalState = null;
            }
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._onError = value;
        }

        set UnsubscribeOperationalStateDelay(value) {
            this._unsubscribeOpStateDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        get IsOperational() {
            if (this._parentOperationalState) {
                Global.validateOperationalStateInterface(this._parentOperationalState);
                return this._parentOperationalState.IsOperational;
            }
            return false;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            Global.validateOperationalStateInterface(this._parentOperationalState);
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
                    this._parentOperationalState.SubscribeOperationalState(this._onOperationalStateChanged);
                }
            }
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            Global.validateOperationalStateInterface(this._parentOperationalState);
            if (typeof onOperationalStateChanged !== 'function') {
                throw new Error('onOperationalStateChanged() is not a function');
            }
            for (let i = 0; i < this._onOperationalStateChangedCallbacks.length; i++) {
                if (this._onOperationalStateChangedCallbacks[i] === onOperationalStateChanged) {
                    this._onOperationalStateChangedCallbacks.splice(i, 1);
                    if (this._onOperationalStateChangedCallbacks.length === 0) {
                        if (this._unsubscribeOpStateDelay) {
                            this._unsubscribeOpStateDelayTimer = setTimeout(() => {
                                this._parentOperationalState.UnsubscribeOperationalState(this._onOperationalStateChanged);
                                this._unsubscribeOpStateDelayTimer = null;
                            }, this._unsubscribeOpStateDelay);
                        } else {
                            this._parentOperationalState.UnsubscribeOperationalState(this._onOperationalStateChanged);
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
