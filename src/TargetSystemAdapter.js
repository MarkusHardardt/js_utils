(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class TargetSystemAdapter {
        constructor() {
            Global.validateDataPublisherInterface(this, true);
            this._targetSystems = {};
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

        Read(id, onResponse, onError) {
            const { target, nodeId } = this._getTargetAndNodeId(id);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Read(id, onResponse, onError)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Read()`);
            } else {
                this._targetSystems[target].Read(nodeId, onResponse, onError);
            }
        }

        Write(id, value) {
            const { target, nodeId } = this._getTargetAndNodeId(id);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Write(id, value)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Write()`);
            } else {
                this._targetSystems[target].Write(nodeId, value);
            }
        }

        SubscribeEvent(id, onEvent) {
            const { target, nodeId } = this._getTargetAndNodeId(id);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for SubscribeEvent(id, onEvent)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for SubscribeEvent(id, onEvent)`);
            } else {
                this._targetSystems[target].SubscribeEvent(nodeId, onEvent);
            }
        }

        UnsubscribeEvent(id, onEvent) {
            const { target, nodeId } = this._getTargetAndNodeId(id);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for UnsubscribeEvent(id, onEvent)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for UnsubscribeEvent(id, onEvent)`);
            } else {
                this._targetSystems[target].UnsubscribeEvent(nodeId, onEvent);
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
