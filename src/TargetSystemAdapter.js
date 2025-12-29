(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const OperationalState = isNodeJS ? require('./OperationalState.js') : root.OperationalState;

    class TargetSystemAdapter extends OperationalState {
        constructor() {
            super();
            this._targetSystems = {};
            Common.validateDataPointCollectionInterface(this, true);
        }

        Register(target, system) {
            Common.validateDataPointCollectionInterface(system, true);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Register(target, system)`);
            } else if (this._targetSystems[target] !== undefined) {
                throw new Error(`Target '${target}' already registered`);
            } else {
                this._targetSystems[target] = system;
            }
        }

        Unregister(target, system) {
            Common.validateDataPointCollectionInterface(system, true);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Unregister(target, system)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered`);
            } else if (this._targetSystems[target] !== system) {
                throw new Error(`Other target '${target}' registered`);
            } else {
                delete this._targetSystems[target];
            }
        }

        SubscribeData(dataId, onRefresh) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for SubscribeData(dataId, onRefresh)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for SubscribeData(dataId, onRefresh)`);
            } else {
                this._targetSystems[target].SubscribeData(nodeId, onRefresh);
            }
        }

        UnsubscribeData(dataId, onRefresh) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for UnsubscribeData(dataId, onRefresh)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for UnsubscribeData(dataId, onRefresh)`);
            } else {
                this._targetSystems[target].UnsubscribeData(nodeId, onRefresh);
            }
        }

        Read(dataId, onResponse, onError) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Read(id, onResponse, onError)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Read()`);
            } else {
                this._targetSystems[target].Read(nodeId, onResponse, onError);
            }
        }

        Write(dataId, value) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Write(id, value)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Write()`);
            } else {
                this._targetSystems[target].Write(nodeId, value);
            }
        }

        _getTargetAndNodeId(id) {
            const match = /^([a-z0-9_]+):(.+)$/i.exec(id);
            return { target: match ? match[1] : null, nodeId: match ? match[2] : id };
        }
    }

    if (isNodeJS) {
        module.exports = TargetSystemAdapter;
    } else {
        root.TargetSystemAdapter = TargetSystemAdapter;
    }
}(globalThis));
