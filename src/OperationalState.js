// TODO: Question about '_parentOperationalState':
// In TargetSystemAdapter we do not extend OperationalState because there is no parent and instead we build the state local.
// For DataConnector we max use the connection.
// For PlcAdapterMock it depends on opc ua.
// Only DataPublisher provides subscribing of multiple clients.
// Maybe we need a simple thing to extend DataConnector, TargetSystemAdapter, PlcAdapterMock and something like the implemented for DataPublisher???
// See: DataPublisher, DataConnector, TargetSystemAdapter, PlcAdapterMock
(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class OperationalState_DISCARDED { // TODO: remove or reuse
        constructor() {
            Global.validateOperationalStateInterface(this, true);
            this._isOperational = false;
            this._parentOperationalState = null;
            this._onError = Core.defaultOnError;
            this._unsubscribeDelay = false;
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
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
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
                        if (this._unsubscribeDelay) {
                            this._unsubscribeOpStateDelayTimer = setTimeout(() => {
                                this._parentOperationalState.UnsubscribeOperationalState(this._onOperationalStateChanged);
                                this._unsubscribeOpStateDelayTimer = null;
                            }, this._unsubscribeDelay);
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

    class OperationalState {
        constructor() {
            Global.validateOperationalStateInterface(this, true);
            this._isOperational = false;
            this._onOperationalStateChanged = null;
        }

        get IsOperational() {
            return this._isOperational === true;
        }

        set IsOperational(value) {
            const op = value === true;
            if (op !== this._isOperational) {
                this._isOperational = op;
                if (this._onOperationalStateChanged) {
                    try {
                        this._onOperationalStateChanged(op);
                    } catch (error) {
                        console.error(error);
                    }
                }
            }
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            if (typeof onOperationalStateChanged !== 'function') {
                throw new Error('onOperationalStateChanged() is not a function');
            } else if (this._onOperationalStateChanged === onOperationalStateChanged) {
                throw new Error('onOperationalStateChanged() is already subscribed');
            }
            this._onOperationalStateChanged = onOperationalStateChanged;
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            if (typeof onOperationalStateChanged !== 'function') {
                throw new Error('onOperationalStateChanged() is not a function');
            } else if (this._onOperationalStateChanged !== onOperationalStateChanged) {
                throw new Error('onOperationalStateChanged() is not subscribed');
            }
            this._onOperationalStateChanged = null;
        }
    }

    if (isNodeJS) {
        module.exports = OperationalState;
    } else {
        root.OperationalState = OperationalState;
    }
}(globalThis));
