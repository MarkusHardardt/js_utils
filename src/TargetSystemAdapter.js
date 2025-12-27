(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';
    const Global = isNodeJS ? require('./Global.js') : root.Global;

    class TargetSystemAdapter {
        constructor() {
            Global.validateEventPublisherInterface(this, true);
            this._targetSystems = {};
        }

        Register(target, system) {
            Global.validateEventPublisherInterface(system, true);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Register(target, system)`);
            } else if (this._targetSystems[target] !== undefined) {
                throw new Error(`Target '${target}' already registered`);
            } else {
                this._targetSystems[target] = system;
            }
        }

        Unregister(target, system) {
            Global.validateEventPublisherInterface(system, true);
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

        Subscribe(id, onEvent) {
            const { target, nodeId } = this._getTargetAndNodeId(id);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Subscribe(id, onEvent)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Subscribe(id, onEvent)`);
            } else {
                this._targetSystems[target].Subscribe(nodeId, onEvent);
            }
        }

        Unsubscribe(id, onEvent) {
            const { target, nodeId } = this._getTargetAndNodeId(id);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for Unsubscribe(id, onEvent)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for Unsubscribe(id, onEvent)`);
            } else {
                this._targetSystems[target].Unsubscribe(nodeId, onEvent);
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
