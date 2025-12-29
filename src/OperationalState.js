// TODO: Question about '_parentOperationalState':
// In TargetSystemAdapter we do not extend OperationalState because there is no parent and instead we build the state local.
// For DataConnector we max use the connection.
// For PlcAdapterMock it depends on opc ua.
// Only DataPoint provides subscribing of multiple clients.
// Maybe we need a simple thing to extend DataConnector, TargetSystemAdapter, PlcAdapterMock and something like the implemented for DataPoint???
// See: DataPoint, DataConnector, TargetSystemAdapter, PlcAdapterMock
(function (root) {
    "use strict";
    // access to other components in node js and browser:
    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class OperationalState {
        constructor() {
            Common.validateOperationalStateInterface(this, true);
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
            try {
                onOperationalStateChanged(this._isOperational);
            } catch (error) {
                console.error(error);
            }
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
