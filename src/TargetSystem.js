(function (root) {
    "use strict";
    const TargetSystem = {};

    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const OperationalState = isNodeJS ? require('./OperationalState.js') : root.OperationalState;

    /*  node-opcua-basic-types */
    const NodeOpcUaBasicType = Object.freeze({
        Null: 0,
        Boolean: 1,
        SByte: 2,// signed Byte: Int8
        Byte: 3,// unsigned Byte: UInt8
        Int16: 4,
        UInt16: 5,
        Int32: 6,
        UInt32: 7,
        Int64: 8,
        UInt64: 9,
        Float: 10,
        Double: 11,
        String: 12,
        DateTime: 13,
        Guid: 14,
        ByteString: 15,
        XmlElement: 16,
        NodeId: 17,
        ExpandedNodeId: 18,
        StatusCode: 19,
        QualifiedName: 20,
        LocalizedText: 21,
        ExtensionObject: 22,
        DataValue: 23,
        Variant: 24,
        DiagnosticInfo: 25
    });
    TargetSystem.NodeOpcUaBasicType = NodeOpcUaBasicType;

    function convertNodeOpcUaBasicTypeToCommonType(type) {
        switch (type) {
            case NodeOpcUaBasicType.Null:
                return Common.DataType.Null;
            case NodeOpcUaBasicType.Boolean:
                return Common.DataType.Boolean;
            case NodeOpcUaBasicType.SByte:
                return Common.DataType.Int8;
            case NodeOpcUaBasicType.Byte:
                return Common.DataType.UInt8;
            case NodeOpcUaBasicType.Int16:
                return Common.DataType.Int16;
            case NodeOpcUaBasicType.UInt16:
                return Common.DataType.UInt16;
            case NodeOpcUaBasicType.Int32:
                return Common.DataType.Int32;
            case NodeOpcUaBasicType.UInt32:
                return Common.DataType.UInt32;
            case NodeOpcUaBasicType.Int64:
                return Common.DataType.Int64;
            case NodeOpcUaBasicType.UInt64:
                return Common.DataType.UInt64;
            case NodeOpcUaBasicType.Float:
                return Common.DataType.Float;
            case NodeOpcUaBasicType.Double:
                return Common.DataType.Double;
            case NodeOpcUaBasicType.String:
                return Common.DataType.String;
            default:
                return Common.DataType.Unknown;
        }
    }
    TargetSystem.convertNodeOpcUaBasicTypeToCommonType = convertNodeOpcUaBasicTypeToCommonType;

    class Router extends OperationalState.Node {
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

        GetType(dataId) {
            const { target, nodeId } = this._getTargetAndNodeId(dataId);
            if (typeof target !== 'string') {
                throw new Error(`Invalid target '${target}' for GetType(dataId)`);
            } else if (this._targetSystems[target] === undefined) {
                throw new Error(`Target '${target}' not registered for GetType(dataId)`);
            } else {
                return this._targetSystems[target].GetType(nodeId);
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
    TargetSystem.Adapter = Router;

    Object.freeze(TargetSystem);
    if (isNodeJS) {
        module.exports = TargetSystem;
    } else {
        root.TargetSystem = TargetSystem;
    }
}(globalThis));
