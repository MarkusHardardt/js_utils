(function (root) {
    "use strict";
    const Access = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    const NodeState = Object.freeze({
        Constructed: 0,
        Registered: 1,
        NotRegistered: 2,
        UnregisterTimerRunning: 3,
        Destructed: 4
    });

    class Node {
        #logger;
        #source;
        #onLastObserverUnregistered;
        #value;
        #onRefresh;
        #observers;
        #unregisterObserverDelay;
        #unregisterObserverTimer;
        #state;
        constructor(logger, source, unregisterObserverDelay, onLastObserverUnregistered) {
            this.#logger = logger;
            this.#source = source;
            this.#unregisterObserverDelay = unregisterObserverDelay;
            this.#unregisterObserverTimer = null;
            this.#onLastObserverUnregistered = onLastObserverUnregistered;
            this.#observers = [];
            this.#value = null;
            this.#onRefresh = value => this.value = value;
            this.#state = NodeState.Constructed;
            Common.validateAsObservable(this, true);
        }
        get value() {
            return this.#value;
        }
        set value(value) {
            this.#value = value;
            for (const onRefresh of this.#observers) {
                this.#refresh('Access.Node.value', onRefresh);
            }
        }
        registerObserver(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('Access.Node.registerObserver(): onRefresh(value) is not a function');
            }
            // Check if already registered
            for (const observer of this.#observers) {
                if (observer === onRefresh) {
                    this.#logger.warn('Access.Node.registerObserver(): onRefresh(value) has already been registered');
                    // If already stored and if we just call for refresh and return
                    this.#refresh('Access.Node.registerObserver()', onRefresh);
                    return;
                }
            }
            // Add to list and depending on the state register on source, kill unregister timer or just refresh
            this.#observers.push(onRefresh);
            switch (this.#state) {
                case NodeState.Constructed:
                case NodeState.NotRegistered:
                    try {
                        this.#source.registerObserver(this.#onRefresh);
                        this.#logger.trace('Access.Node.registerObserver(): Registered observer on source');
                        this.#state = NodeState.Registered;
                    } catch (error) {
                        // Changed to warning to prevent error stack traces for server tasks requesting access to items of other server tasks not yet running.
                        this.#logger.warn('Access.Node.registerObserver(): Failed to register observer on source', error);
                        this.#state = NodeState.NotRegistered;
                    }
                    break;
                case NodeState.Registered:
                    this.#refresh('Access.Node.registerObserver()', onRefresh);
                    break;
                case NodeState.UnregisterTimerRunning:
                    clearTimeout(this.#unregisterObserverTimer);
                    this.#unregisterObserverTimer = null;
                    this.#logger.trace('Access.Node.registerObserver(): Timer to unregister has been interrupted because another observer has been registered');
                    this.#state = NodeState.Registered;
                    this.#refresh('Access.Node.registerObserver()', onRefresh);
                    break;
            }
        }
        unregisterObserver(onRefresh) {
            if (typeof onRefresh !== 'function') {
                throw new Error('Access.Node.unregisterObserver(): onRefresh(value) is not a function');
            }
            // Check for index
            let observerIndex = -1;
            for (let i = 0; i < this.#observers.length; i++) {
                if (this.#observers[i] === onRefresh) {
                    observerIndex = i;
                    break;
                }
            }
            if (observerIndex < 0) {
                this.#logger.warn('Access.Node.unregisterObserver(): onRefresh(value) is not registered');
                return;
            }
            // Remove from list and depending on the state unregister on source or create unregister timer
            this.#observers.splice(observerIndex, 1);
            switch (this.#state) {
                case NodeState.NotRegistered:
                    if (this.#observers.length === 0) {
                        this.#state = NodeState.Destructed;
                        this.#onLastObserverUnregistered();
                    }
                    break;
                case NodeState.Registered:
                    if (this.#observers.length === 0) {
                        if (this.#unregisterObserverDelay) {
                            this.#unregisterObserverTimer = setTimeout(() => {
                                this.#unregisterObserverTimer = null;
                                try {
                                    this.#source.unregisterObserver(this.#onRefresh);
                                    this.#logger.trace('Access.Node.unregisterObserver(): Unregistered on source after delay has expired');
                                } catch (error) {
                                    // Changed to warning to prevent error stack traces for server tasks requesting access to items of other server tasks not running anymore.
                                    this.#logger.warn('Access.Node.unregisterObserver(): Failed to unregister on source after delay has expired', error);
                                }
                                this.#state = NodeState.Destructed;
                                this.#onLastObserverUnregistered();
                            }, this.#unregisterObserverDelay);
                            this.#state = NodeState.UnregisterTimerRunning;
                        } else {
                            try {
                                this.#source.unregisterObserver(this.#onRefresh);
                                this.#logger.trace('Access.Node.unregisterObserver(): Unregistered on source without delay');
                            } catch (error) {
                                // Changed to warning to prevent error stack traces for server tasks requesting access to items of other server tasks not running anymore.
                                this.#logger.warn('Access.Node.unregisterObserver(): Failed to unregister on source without delay', error);
                            }
                            this.#state = NodeState.Destructed;
                            this.#onLastObserverUnregistered();
                        }
                    }
                    break;
            }
        }
        registerObserverOnSource() {
            switch (this.#state) {
                case NodeState.NotRegistered:
                    try {
                        this.#source.registerObserver(this.#onRefresh);
                        this.#logger.trace('Access.Node.registerObserverOnSource(): Registered on source');
                        this.#state = NodeState.Registered;
                    } catch (error) {
                        this.#logger.warn('Access.Node.registerObserverOnSource(): Failed to register on source', error);
                    }
                    return;
            }
        }
        unregisterObserverOnSource() {
            switch (this.#state) {
                case NodeState.Registered:
                    try {
                        this.#source.unregisterObserver(this.#onRefresh);
                        this.#logger.trace('Access.Node.unregisterObserverOnSource(): Unregistered on source');
                    } catch (error) {
                        this.#logger.warn('Access.Node.unregisterObserverOnSource(): Failed to unregister on source', error);
                    }
                    this.#state = NodeState.NotRegistered;
                    return;
                case NodeState.UnregisterTimerRunning:
                    clearTimeout(this.#unregisterObserverTimer);
                    this.#unregisterObserverTimer = null;
                    try {
                        this.#source.unregisterObserver(this.#onRefresh);
                        this.#logger.trace('Access.Node.unregisterObserverOnSource(): Interruppted unregister timer and unregistered on source');
                    } catch (error) {
                        this.#logger.warn('Access.Node.unregisterObserverOnSource(): Interruppted unregister timer but failed to unregister on source', error);
                    }
                    this.#state = NodeState.NotRegistered;
                    return;
            }
        }
        #refresh(context, onRefresh) {
            if (this.#value !== undefined && this.#value !== null) {
                try {
                    onRefresh(this.#value);
                } catch (error) {
                    this.#logger.error(`${context}: Failed calling onRefresh(value)`, error);
                }
            }
        }
    }

    class Buffer {
        #logger;
        #source;
        #unregisterObserverDelay;
        #dataPointsByDataId;
        constructor(logger, source, unregisterObserverDelay) {
            this.#logger = Common.validateAsLogger(logger, true);
            this.#source = Common.validateAsDataAccessObject(source, true);
            this.#unregisterObserverDelay = typeof unregisterObserverDelay === 'number' && unregisterObserverDelay > 0 ? Math.ceil(unregisterObserverDelay) : false;
            this.#dataPointsByDataId = {};
            Common.validateAsDataAccessObject(this, true);
        }
        getType(dataId) {
            return this.#source.getType(dataId);
        }
        registerObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Access.Buffer.registerObserver(): Invalid data id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('Access.Buffer.registerObserver(): onRefresh(value) is not a function');
            }
            let dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint) {
                dataPoint = this.#dataPointsByDataId[dataId] = {
                    registerObserver: onRefresh => this.#source.registerObserver(dataId, onRefresh),
                    unregisterObserver: onRefresh => this.#source.unregisterObserver(dataId, onRefresh)
                };
                dataPoint.node = new Node(this.#logger, dataPoint, this.#unregisterObserverDelay, () => {
                    delete dataPoint.node;
                    delete this.#dataPointsByDataId[dataId];
                });
                this.#logger.trace(`Access.Buffer.registerObserver(): Register first '${dataId}' on node`);
            } else {
                this.#logger.trace(`Access.Buffer.registerObserver(): Register next '${dataId}' on node`);
            }
            dataPoint.node.registerObserver(onRefresh);
        }
        unregisterObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Access.Buffer.unregisterObserver(): Invalid data id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error('Access.Buffer.unregisterObserver(): onRefresh(value) is not a function');
            }
            const dataPoint = this.#dataPointsByDataId[dataId];
            if (!dataPoint) {
                this.#logger.error(`Access.Buffer.unregisterObserver(): Data id '${dataId}' is not registered`);
                return;
            }
            this.#logger.trace(`Access.Buffer.unregisterObserver(): Unregister data id '${dataId}' on node`);
            dataPoint.node.unregisterObserver(onRefresh);
        }
        registerObserversOnSource(filter) {
            this.#logger.trace(`Access.Buffer.registerObserverOnSource(): Called with filter: '${typeof filter === 'function'}'`);
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId) && (!filter || filter(dataId))) {
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    this.#logger.trace(`Access.Buffer.registerObserverOnSource(): Calling registerObserverOnSource() for data id '${dataId}' on node`);
                    dataPoint.node.registerObserverOnSource();
                }
            }
        }
        unregisterObserversOnSource(filter) {
            this.#logger.trace(`Access.Buffer.unregisterObserverOnSource(): Called with filter: '${typeof filter === 'function'}'`);
            for (const dataId in this.#dataPointsByDataId) {
                if (this.#dataPointsByDataId.hasOwnProperty(dataId) && (!filter || filter(dataId))) {
                    const dataPoint = this.#dataPointsByDataId[dataId];
                    this.#logger.trace(`Access.Buffer.unregisterObserverOnSource(): Calling unregisterObserverOnSource() for data id '${dataId}' on node`);
                    dataPoint.node.unregisterObserverOnSource();
                }
            }
        }
        read(dataId, onResponse, onError) {
            this.#source.read(dataId, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this.#logger.error(`Access.Buffer.read(): Failed calling onResponse(${value}) for data id '${dataId}'`, error);
                }
                const dataPoint = this.#dataPointsByDataId[dataId];
                if (dataPoint) {
                    dataPoint.node.Value = value;
                }
            }, onError);
        }
        write(dataId, value) {
            try {
                this.#source.write(dataId, value);
                this.#logger.trace(`Access.Buffer.write(): Called write(${value}) for data id '${dataId}'`);
            } catch (error) {
                this.#logger.warn(`Access.Buffer.write(): Failed calling write(${value}) for data id '${dataId}'`, error);
            }
        }
    }
    Access.Buffer = Buffer;

    class Switch {
        #getDataAccessObject;
        constructor(getDataAccessObject) {
            if (typeof getDataAccessObject !== 'function') {
                throw new Error('Access.Switch.constructor: Passed getDataAccessObject(dataId) is not a function');
            }
            this.#getDataAccessObject = getDataAccessObject;
            Common.validateAsDataAccessObject(this, true);
        }
        getType(dataId) {
            return this._dao(dataId, 'getType:function').getType(dataId);
        }
        registerObserver(dataId, onRefresh) {
            this._dao(dataId, 'registerObserver:function').registerObserver(dataId, onRefresh);
        }
        unregisterObserver(dataId, onRefresh) {
            this._dao(dataId, 'unregisterObserver:function').unregisterObserver(dataId, onRefresh);
        }
        read(dataId, onResponse, onError) {
            this._dao(dataId, 'read:function').read(dataId, onResponse, onError);
        }
        write(dataId, value) {
            this._dao(dataId, 'write:function').write(dataId, value);
        }
        _dao(dataId, aspect) {
            return Core.validateAs('DataAccessObject', this.#getDataAccessObject(dataId), aspect);
        }
    }
    Access.Switch = Switch;

    const targetIdValidRegex = /^[a-z0-9_]+$/i;
    const targetIdRegex = /^([a-z0-9_]+):.+$/i;
    class Router {
        #logger;
        #dataConnectors;
        #dataAccessObjects;
        #getDataAccessObject;
        #onUnregisterObserversOnSource;
        #onRegisterObserversOnSource
        constructor(logger) {
            Common.validateAsLogger(logger, true);
            this.#logger = logger;
            this.#dataConnectors = [];
            this.#dataAccessObjects = {};
            this.#getDataAccessObject = dataId => {
                const match = targetIdRegex.exec(dataId);
                if (!match) {
                    throw new Error(`Access.Router: Invalid id: '${dataId}'`);
                }
                const targetId = match[1];
                const accObj = this.#dataAccessObjects[targetId];
                if (!accObj) {
                    throw new Error(`Access.Router: No data access object registered for data id '${dataId}'`);
                }
                return accObj;
            };
            this.#onUnregisterObserversOnSource = null;
            this.#onRegisterObserversOnSource = null;
        }
        set onUnregisterObserversOnSource(value) {
            if (typeof value !== 'function') {
                throw new Error('Access.Router.onUnregisterObserversOnSource: Set value is not a function');
            }
            this.#onUnregisterObserversOnSource = value;
        }
        set onRegisterObserversOnSource(value) {
            if (typeof value !== 'function') {
                throw new Error('Access.Router.onRegisterObserversOnSource: Set value is not a function');
            }
            this.#onRegisterObserversOnSource = value;
        }
        // This will be called on server side when a new web socket connection has opened or an existing has reopened
        registerDataConnector(dataConnector) {
            for (const connector in this.#dataConnectors) {
                if (dataConnector === connector) {
                    this.#logger.warn('Access.Router.registerDataConnector(): Data connector is already registered');
                    return;
                }
            }
            this.#dataConnectors.push(dataConnector);
            const dataPoints = this.#getDataPoints();
            dataConnector.setDataPoints(dataPoints);
        }
        // This will be called on server side when a web socket connection has been closed
        unregisterDataConnector(dataConnector) {
            for (let i = 0; i < this.#dataConnectors.length; i++) {
                if (dataConnector === this.#dataConnectors[i]) {
                    this.#dataConnectors.splice(i, 1);
                    return;
                }
            }
            this.#logger.warn('Router.unregisterDataConnector(): Data connector is not registered');
        }
        registerDataAccessObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Access.Router.registerDataAccessObject(): Invalid target id '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Access.Router.registerDataAccessObject(): Invalid target id format '${targetId}'`);
            } else if (this.#dataAccessObjects[targetId] !== undefined) {
                throw new Error(`Access.Router.registerDataAccessObject(): Target id '${targetId}' is already registered`);
            } else {
                Common.validateAsDataAccessServerObject(accessObject, true);
                const prefix = `${targetId}:`
                function getRawDataId(dataId) {
                    return dataId.substring(prefix.length);
                }
                this.#dataAccessObjects[targetId] = Common.validateAsDataAccessObject({
                    accessObject,
                    getType: dataId => accessObject.getType(getRawDataId(dataId)),
                    registerObserver: (dataId, onRefresh) => accessObject.registerObserver(getRawDataId(dataId), onRefresh),
                    unregisterObserver: (dataId, onRefresh) => accessObject.unregisterObserver(getRawDataId(dataId), onRefresh),
                    read: (dataId, onResponse, onError) => accessObject.read(getRawDataId(dataId), onResponse, onError),
                    write: (dataId, value) => accessObject.write(getRawDataId(dataId), value)
                }, true);
                function filter(dataId) {
                    return dataId.startsWith(prefix);
                }
                if (this.#onRegisterObserversOnSource) {
                    this.#onRegisterObserversOnSource(filter);
                }
                const dataPoints = this.#getDataPoints();
                for (const dataConnector of this.#dataConnectors) {
                    try {
                        dataConnector.setDataPoints(dataPoints);
                    } catch (error) {
                        this.#logger.error('Access.Router.registerDataAccessObject(): Failed updating data points on connector', error);
                    }
                }
            }
        }
        unregisterDataAccessObject(targetId, accessObject) {
            if (typeof targetId !== 'string') {
                throw new Error(`Access.Router.unregisterDataAccessObject(): Invalid target id: '${targetId}'`);
            } else if (!targetIdValidRegex.test(targetId)) {
                throw new Error(`Access.Router.unregisterDataAccessObject(): Invalid target id format '${targetId}'`);
            } else if (this.#dataAccessObjects[targetId] === undefined) {
                throw new Error(`Access.Router.unregisterDataAccessObject(): Target id '${targetId}' is not registered`);
            } else if (this.#dataAccessObjects[targetId].accessObject !== accessObject) {
                throw new Error(`Access.Router.unregisterDataAccessObject(): Target id '${targetId}' is registered for another data access object`);
            } else {
                const prefix = `${targetId}:`
                function filter(dataId) {
                    return dataId.startsWith(prefix);
                }
                if (this.#onUnregisterObserversOnSource) {
                    this.#onUnregisterObserversOnSource(filter);
                }
                delete this.#dataAccessObjects[targetId];
                const dataPoints = this.#getDataPoints();
                for (const dataConnector of this.#dataConnectors) {
                    try {
                        dataConnector.setDataPoints(dataPoints);
                    } catch (error) {
                        this.#logger.error('Access.Router.unregisterDataAccessObject(): Failed updating data points on connector', error);
                    }
                }
            }
        }
        #getDataPoints() {
            const result = [];
            for (const targetId in this.#dataAccessObjects) {
                if (this.#dataAccessObjects.hasOwnProperty(targetId)) {
                    const object = this.#dataAccessObjects[targetId];
                    const dataPoints = object.accessObject.getDataPoints();
                    for (const dataPoint of dataPoints) {
                        result.push({ id: `${targetId}:${dataPoint.id}`, type: dataPoint.type });
                    }
                }
            }
            return result;
        }
        get getDataAccessObject() {
            return this.#getDataAccessObject;
        }
    }
    Access.Router = Router;

    Object.freeze(Access);
    if (isNodeJS) {
        module.exports = Access;
    } else {
        root.Access = Access;
    }
}(globalThis));