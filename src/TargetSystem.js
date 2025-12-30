(function (root) {
    "use strict";
    const TargetSystem = {};

    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;

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
            case NodeOpcUaBasicType.DataValue:
                return Common.DataType.Struct;
            default:
                return Common.DataType.Unknown;
        }
    }
    TargetSystem.convertNodeOpcUaBasicTypeToCommonType = convertNodeOpcUaBasicTypeToCommonType;

    Object.freeze(TargetSystem);
    if (isNodeJS) {
        module.exports = TargetSystem;
    } else {
        root.TargetSystem = TargetSystem;
    }
}(globalThis));
