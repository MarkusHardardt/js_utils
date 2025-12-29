// TODO: Question about '_parentOperationalState':
// In TargetSystem we do not extend OperationalState because there is no parent and instead we build the state local.
// For DataConnector we max use the connection.
// For PlcAdapterMock it depends on opc ua.
// Only DataPoint provides subscribing of multiple clients.
// Maybe we need a simple thing to extend DataConnector, TargetSystem, PlcAdapterMock and something like the implemented for DataPoint???
// See: DataPoint, DataConnector, TargetSystem, PlcAdapterMock
(function (root) {
    "use strict";
    const OperationalState = {};
    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const DataPoint = isNodeJS ? require('./DataPoint.js') : root.DataPoint;

    class Node {
        constructor() {
            this._operational = new DataPoint.Node();
            this._operational.Value = false;
            this._operational.Subscribable = null;
            Common.validateOperationalStateInterface(this, true);
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._operational.OnError = value;
        }

        set UnsubscribeDelay(value) {
            this._operational.UnsubscribeDelay = value;
        }

        get IsOperational() {
            return this._operational.Value;
        }

        set IsOperational(value) {
            this._operational.Value = value;
        }

        SubscribeOperationalState(onOperationalStateChanged) {
            this._operational.Subscribe(onOperationalStateChanged);
        }

        UnsubscribeOperationalState(onOperationalStateChanged) {
            this._operational.Unsubscribe(onOperationalStateChanged);
        }
    }
    OperationalState.Node = Node;

    Object.freeze(OperationalState);
    if (isNodeJS) {
        module.exports = OperationalState;
    } else {
        root.OperationalState = OperationalState;
    }
}(globalThis));
