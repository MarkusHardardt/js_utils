(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class TargetSystemAdapter {
        constructor() {
            Global.validateDataPublisherInterface(this, true);
            this._isOperational = false;
            this._onOperationalStateChanged = null;
            this._targetSystems = {};
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

        Register(target, system) {
            Global.validateDataPublisherInterface(system, true);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Register(target, system)`);
            } else if (this._targetSystems[target] !== undefined) {
                throw new Error(`Target '${target}' already registered`);
            } else {
                this._targetSystems[target] = system;
            }
        }

        Unregister(target, system) {
            Global.validateDataPublisherInterface(system, true);
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

        SubscribeData(dataId, onDataUpdate) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for SubscribeData(dataId, onDataUpdate)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for SubscribeData(dataId, onDataUpdate)`);
            } else {
                this._targetSystems[target].SubscribeData(nodeId, onDataUpdate);
            }
        }

        UnsubscribeData(dataId, onDataUpdate) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for UnsubscribeData(dataId, onDataUpdate)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for UnsubscribeData(dataId, onDataUpdate)`);
            } else {
                this._targetSystems[target].UnsubscribeData(nodeId, onDataUpdate);
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
