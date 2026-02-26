(function (root) {
    "use strict";
    const OPCUA = {};
    const isNodeJS = typeof require === 'function';
    const fs = require('fs');
    // doc: https://node-opcua.github.io/api_doc/0.2.0/classes/OPCUAClient.html
    const { OPCUAClient, DataType, AttributeIds, TimestampsToReturn, ClientSubscription, resolveNodeId } = require('node-opcua-client');
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Core = isNodeJS ? require('./Core.js') : root.Core;

    function getAsCoreDataType(type) {
        switch (type) {
            case DataType.Null:
                return Core.DataType.Null;
            case DataType.Boolean:
                return Core.DataType.Boolean;
            case DataType.SByte:
                return Core.DataType.Int8;
            case DataType.Byte:
                return Core.DataType.UInt8;
            case DataType.Int16:
                return Core.DataType.Int16;
            case DataType.UInt16:
                return Core.DataType.UInt16;
            case DataType.Int32:
                return Core.DataType.Int32;
            case DataType.UInt32:
                return Core.DataType.UInt32;
            case DataType.Int64:
                return Core.DataType.Int64;
            case DataType.UInt64:
                return Core.DataType.UInt64;
            case DataType.Float:
                return Core.DataType.Float;
            case DataType.Double:
                return Core.DataType.Double;
            case DataType.String:
                return Core.DataType.String;
            case DataType.DateTime:
            case DataType.Guid:
            case DataType.ByteString:
            case DataType.XmlElement:
            case DataType.NodeId:
            case DataType.ExpandedNodeId:
            case DataType.StatusCode:
            case DataType.QualifiedName:
            case DataType.LocalizedText:
            case DataType.ExtensionObject:
            case DataType.DataValue:
            case DataType.Variant:
            case DataType.DiagnosticInfo:
            default:
                return Core.DataType.Unknown;
        }
    }
    OPCUA.getAsCoreDataType = getAsCoreDataType;

    const keyValueRegex = /^([_a-z0-9]+(?:[./][_a-z0-9]+)*);(.+)$/i;

    function getKeysAndValues(text) {
        const result = {};
        const lines = text.split(Regex.Linebreaks);
        for (const line of lines) {
            const match = keyValueRegex.exec(line);
            if (match) {
                const key = match[1];
                if (result[key] !== undefined) {
                    throw new Error(`OPCUA.getKeysAndValues(): Duplicate key found: '${key}'`);
                }
                result[key] = match[2];
            } else if (line.length > 0) {
                throw new Error(`OPCUA.getKeysAndValues(): Invalid line: '${line}'`);
            }
        }
        return result;
    }
    OPCUA.getKeysAndValues = getKeysAndValues;

    function loadKeysAndValuesFromCSVFile(file, onSuccess, onError) {
        try {
            onSuccess(getKeysAndValues(fs.readFileSync(file, 'utf8')));
        } catch (error) {
            onError(`OPCUA.loadKeysAndValuesFromCSVFile(): Failed reading csv file '${file}': ${error.message}`);
        }
    }
    OPCUA.loadKeysAndValuesFromCSVFile = loadKeysAndValuesFromCSVFile;

    /* ChatGPT generated two versions which are 100% equivalent in behavior:
        await Promise.all(toAdd.map(async id => {
            const mi = await subscription.monitor(...);
            activeItems.set(id, mi);
        })); 
        await Promise.all(toAdd.map(id => 
            subscription.monitor(...).then(mi => {
                activeItems.set(id, mi);
            })
        ));
        Here it makes a difference which one to use because we need the returned mi to add to our collection.  */
    function getEstablishMonitoringTask(subscription, node, logger) {
        return (onSuccess, onError) => subscription.monitor(
            { nodeId: node.nodeId, attributeId: AttributeIds.Value },
            { samplingInterval: 500, discardOldest: true, queueSize: 10 },
            TimestampsToReturn.Both // TODO: Required?
        ).then(monitoredItem => {
            node.monitoredItem = monitoredItem;
            monitoredItem.on('changed', dataValue => {
                node.value = dataValue.value.value;
                logger.trace(`OPCUA.Client: Value of node with id '${node.dataId}' changed: ${node.value}`);
                if (node.onRefresh && node.value !== null) {
                    try {
                        node.onRefresh(node.value);
                    } catch (error) {
                        logger.error(`OPCUA.Client: Failed calling onResfresh(value) for id '${node.dataId}'`, error);
                    }
                }
            });
            onSuccess();
        }).catch(error => {
            logger.error(`OPCUA.Client: Failed to monitor '${node.dataId}'`, error);
            onError(`Failed to monitor '${node.dataId}': ${error.message}`);
        });
    }

    /* ChatGPT generated two versions which are 100% equivalent in behavior:
        await Promise.all(toRemove.map(id => {
            const mi = activeItems.get(id);
            activeItems.delete(id);
            return mi.terminate();   // ← returns a Promise
        }));
        await Promise.all(toRemove.map(async id => {
            const mi = activeItems.get(id);
            activeItems.delete(id);
            await mi.terminate();
        }));
        Here it makes no difference which one to use.  */
    function getTerminateMonitoringTask(node, logger) {
        return (onSuccess, onError) => node.monitoredItem.terminate().then(() => {
            node.monitoredItem = null;
            logger.trace(`OPCUA.Client: Terminated monitoring '${node.dataId}'`);
            onSuccess();
        }).catch(error => {
            node.monitoredItem = null;
            logger.error(`OPCUA.Client: Failed to terminated monitoring '${node.dataId}'`, error);
            onError(`Failed to terminated monitoring '${node.dataId}': ${error.message}`);
        });
    }

    const START_TRY_RECONNECT_DELAY = 2;
    const MAX_TRY_RECONNECT_DELAY = 32;
    const UPDATE_MONITORING_DELAY = 500; // 50;

    const ClientOperationLevel = Object.freeze({
        Disconnected: 0,
        Connecting: 1,
        Connected: 2,
        SessionCreated: 3,
        NodeInitialized: 4,
        Subscribed: 5
    });

    class Client {
        #logger;
        #options;
        #nodes;
        #updateMonitoringTimer;
        #running;
        #online;
        #subscription;
        #session;
        #client;
        #opLevel;
        #onConnected;
        #onDisconnected;
        constructor(logger, options = {}) {
            if (typeof options.endpointUrl !== 'string' || Regex.EmptyString.test(options.endpointUrl)) {
                throw new Error(`Invalid endpointUrl: '${options.endpointUrl}'`);
            } else if (options.namespace === undefined || options.namespace === null) {
                throw new Error('Missing namespace');
            } else if (!options.nodesConfig || typeof options.nodesConfig !== 'object') {
                throw new Error('Invalid nodes configuration');
            }
            this.#logger = logger;
            this.#options = options;
            this.#nodes = {};
            for (const dataId in options.nodesConfig) {
                if (options.nodesConfig.hasOwnProperty(dataId)) {
                    const rawNodeId = options.nodesConfig[dataId];
                    const accessString = `ns=${options.namespace};s=${rawNodeId}`;
                    const nodeId = resolveNodeId(accessString);
                    this.#nodes[dataId] = { dataId, rawNodeId, accessString, nodeId, value: null, onRefresh: null, monitoredItem: null };
                }
            }
            this.#updateMonitoringTimer = null;
            this.#running = false;
            this.#online = false;
            this.#subscription = null;
            this.#session = null;
            this.#client = OPCUAClient.create({
                endpointMustExist: false, // Do NOT cache and pin the endpoint description from the first successful connection.
                connectionStrategy: {
                    initialDelay: 1000,
                    maxRetry: -1 // infinite retry AFTER first connection.
                },
                clientName: options.clientName
            });
            this.#onConnected = null;
            this.#onDisconnected = null;
            this.#client.on('start_reconnection', () => this.#startReconnection());
            this.#client.on('after_reconnection', () => this.#afterReconnection());
            this.#client.on('connection_lost', () => this.#logger.warn(`OPCUA.Client: TCP connection lost to endpoint url: ${this.#options.endpointUrl}`));
            this.#client.on('backoff', (retry, delay) => this.#logger.trace(`OPCUA.Client: Retry reconnection to endpoint url ${this.#options.endpointUrl}: #${retry} in ${delay} ms`));
            this.#opLevel = ClientOperationLevel.Disconnected;
        }
        set onConnected(value) {
            if (value !== undefined && value !== null) {
                if (typeof value !== 'function') {
                    throw new Error('OPCUA.Client: onConnected() is not a function');
                }
                this.#onConnected = value;
            } else {
                this.#onConnected = null;
            }
        }
        set onDisconnected(value) {
            if (value !== undefined && value !== null) {
                if (typeof value !== 'function') {
                    throw new Error('OPCUA.Client: onDisonnected() is not a function');
                }
                this.#onDisconnected = value;
            } else {
                this.#onDisconnected = null;
            }
        }
        start(onSuccess, onError) {
            this.#running = true;
            this.#opLevel = ClientOperationLevel.Connecting;
            const tasks = [];
            tasks.push((onSuc, onErr) => this.#connect().then(() => {
                this.#opLevel = ClientOperationLevel.Connected;
                if (!this.#running) {
                    onErr('OPCUA.Client: Not running anymore');
                } else {
                    onSuc();
                }
            }).catch(onErr));
            tasks.push((onSuc, onErr) => this.#client.createSession().then(session => {
                this.#session = session;
                this.#opLevel = ClientOperationLevel.SessionCreated;
                this.#logger.trace(`Created OPC UA session on endpoint url: ${this.#options.endpointUrl}`);
                if (!this.#running) {
                    onErr('OPCUA.Client: Not running anymore');
                } else {
                    onSuc();
                }
            }).catch(onErr));
            // Read all required items and store the data type
            tasks.push((onSuc, onErr) => this.#initNodesAsync().then(() => {
                this.#logger.trace('Initialized nodes');
                this.#opLevel = ClientOperationLevel.NodeInitialized;
                if (!this.#running) {
                    onErr('OPCUA.Client: Not running anymore');
                } else {
                    onSuc();
                }
            }).catch(onErr));
            tasks.push((onSuc, onErr) => {
                try {
                    // Create subscription
                    this.#subscription = ClientSubscription.create(this.#session, {
                        requestedPublishingInterval: 1000,   // ms
                        requestedLifetimeCount: 100,
                        requestedMaxKeepAliveCount: 5, // Make the server send keepalives more often.
                        maxNotificationsPerPublish: 100,
                        publishingEnabled: true,
                        priority: 10
                    });
                    this.#subscription.on('started', () => this.#logger.trace(`OPCUA.Client: Subscription started - ID: ${this.#subscription.subscriptionId}`));
                    this.#subscription.on('terminated', () => this.#logger.trace(`OPCUA.Client: Subscription terminated - ID: ${this.#subscription.subscriptionId}`));
                    this.#opLevel = ClientOperationLevel.Subscribed;
                    if (!this.#running) {
                        onErr('OPCUA.Client: Not running anymore');
                    } else {
                        onSuc();
                    }
                } catch (error) {
                    onErr(`OPCUA.Client: Failed creating subscription: ${error.message}`);
                }
            });
            tasks.push((onSuc, onErr) => {
                // Notify observer
                if (this.#onConnected) {
                    try {
                        this.#onConnected();
                    } catch (error) {
                        this.#logger.error('OPCUA.Client: Failed calling onConnected()', error);
                    }
                }
                if (!this.#running) {
                    onErr('OPCUA.Client: Not running anymore');
                } else {
                    onSuc();
                }
            });
            Executor.run(tasks,
                () => this.#logger.trace(`OPCUA.Client: Successfully started and subscribed OPC UA client to endpoint url: ${this.#options.endpointUrl}`),
                error => {
                    if (this.#running) {
                        this.#logger.error(`OPCUA.Client: Failed starting and subscribing OPC UA client to endpoint url ${this.#options.endpointUrl}`, error);
                    }
                });
            // When the OPC UA server does not exist at start of this handler the _connect() call may take long.
            // Therefore in this method we do not wait for completion of the tasks above and call onSuccess immediately. 
            onSuccess();
        }
        async #connect() {
            // Start connect loop to OPC UA server (loop because the server might not be alive at the moment)
            this.#logger.trace(`OPCUA.Client: Connecting OPC UA client to endpoint url: ${this.#options.endpointUrl}`);
            let connectRetryDelay = START_TRY_RECONNECT_DELAY;
            while (this.#running) {
                try {
                    this.#logger.trace(`OPCUA.Client: Trying to connect to endpoint url: ${this.#options.endpointUrl} ...`);
                    await this.#client.connect(this.#options.endpointUrl);
                    this.#logger.trace(`OPCUA.Client: Connected to OPC UA client with endpoint url: ${this.#options.endpointUrl}`);
                    this.#online = true;
                    return;
                } catch (error) {
                    if (this.#running) {
                        this.#logger.trace(`OPCUA.Client: Server not available, retrying in ${connectRetryDelay} s...`);
                        await new Promise(resolve => setTimeout(() => {
                            if (connectRetryDelay < MAX_TRY_RECONNECT_DELAY) {
                                connectRetryDelay *= 2;
                            }
                            resolve();
                        }, connectRetryDelay * 1000));
                    } else {
                        return;
                    }
                }
            }
        }
        #startReconnection() {
            this.#online = false;
            this.#logger.trace(`OPCUA.Client: UPC UA server connection lost to endpoint url: ${this.#options.endpointUrl}`);
            if (this.#onDisconnected) {
                try {
                    this.#onDisconnected();
                } catch (error) {
                    this.#logger.error('OPCUA.Client: Failed calling onDisonnected()', error);
                }
            }
        }
        #afterReconnection() {
            this.#online = true;
            this.#logger.trace(`OPCUA.Client: UPC UA server to endpoint url: ${this.#options.endpointUrl} reconnected and everything restored`);
            const tasks = [];
            tasks.push((onSuccess, onError) => this.#initNodesAsync().then(onSuccess).catch(error => {
                this.#logger.error('OPCUA.Client: Failed init nodes', error);
                onError();
            }));
            tasks.push((onSuccess, onError) => {
                const toAdd = [];
                for (const dataId in this.#nodes) {
                    if (this.#nodes.hasOwnProperty(dataId)) {
                        const node = this.#nodes[dataId];
                        if (node.onRefresh && !node.monitoredItem) { // TODO: What do we actually check here?
                            toAdd.push(getEstablishMonitoringTask(this.#subscription, node, this.#logger));
                        }
                    }
                }
                toAdd.parallel = true;
                Executor.run(toAdd, onSuccess, onError);
            });
            tasks.push((onSuccess, onError) => {
                if (this.#onConnected) {
                    try {
                        this.#onConnected();
                    } catch (error) {
                        this.#logger.error('OPCUA.Client: Failed calling onConnected()', error);
                    }
                }
                onSuccess();
            });
            Executor.run(tasks,
                () => this.#logger.trace(`OPCUA.Client: Successfully updated after reconnection OPC UA client to endpoint url: ${this.#options.endpointUrl}`),
                error => this.#logger.error(`OPCUA.Client: Failed updating after reconnection OPC UA client to endpoint url ${this.#options.endpointUrl}`, error)
            );
        }
        async #initNodesAsync() {
            if (this.#session) {
                const nodesToRead = [];
                for (const dataId in this.#nodes) {
                    if (this.#nodes.hasOwnProperty(dataId)) {
                        const node = this.#nodes[dataId];
                        nodesToRead.push({ nodeId: node.nodeId, attributeId: AttributeIds.Value });
                    }
                }
                const dataValues = await this.#session.read(nodesToRead);
                let index = 0;
                for (const dataId in this.#nodes) {
                    if (this.#nodes.hasOwnProperty(dataId)) {
                        const node = this.#nodes[dataId];
                        const dataValue = dataValues[index++];
                        if (dataValue.statusCode.name === 'Good') {
                            node.value = dataValue.value.value;
                            node.rawType = dataValue.value.dataType;
                            node.type = getAsCoreDataType(dataValue.value.dataType);
                        } else {
                            node.value = null;
                            node.rawType = DataType.Null;
                            node.type = getAsCoreDataType(DataType.Null);
                            this.#logger.error(`OPCUA.Client: Bad node '${dataId}' status: ${dataValue.statusCode.name}`);
                        }
                    }
                }
            }
        }
        stop(onSuccess, onError) {
            this.#running = false;
            const tasks = [];
            tasks.push((onSuc, onErr) => {
                if (this.#online && this.#onDisconnected) {
                    try {
                        this.#onDisconnected();
                    } catch (error) {
                        this.#logger.error('OPCUA.Client: Failed calling onDisonnected()', error);
                    }
                }
                onSuc();
            });
            if (this.#opLevel >= ClientOperationLevel.Subscribed) {
                tasks.push((onSuc, onErr) => {
                    const nodes = this.#nodes, logger = this.#logger, terminations = [];
                    for (const dataId in nodes) {
                        if (nodes.hasOwnProperty(dataId)) {
                            (function () {
                                const node = nodes[dataId];
                                if (node.monitoredItem) {
                                    terminations.push(getTerminateMonitoringTask(node, logger));
                                }
                            }());
                        }
                    }
                    terminations.parallel = true;
                    Executor.run(terminations, onSuc, error => {
                        this.#logger.error('OPCUA.Client: Failed to un-monitor', error);
                        onSuc();
                    });
                });
                tasks.push((onSuc, onErr) => {
                    this.#subscription.terminate().then(() => {
                        this.#subscription = null;
                        onSuc();
                    }).catch(error => {
                        this.#subscription = null;
                        this.#logger.error('OPCUA.Client: Failed to terminate subscription', error);
                        onSuc();
                    });
                });
            }
            if (this.#opLevel >= ClientOperationLevel.SessionCreated) {
                tasks.push((onSuc, onErr) => {
                    this.#session.close().then(() => {
                        this.#session = null;
                        onSuc();
                    }).catch(error => {
                        this.#session = null;
                        this.#logger.error('OPCUA.Client: Failed to close session', error);
                        onSuc();
                    });
                });
            }
            if (this.#opLevel >= ClientOperationLevel.Connecting) {
                tasks.push((onSuc, onErr) => {
                    this.#client.disconnect().then(onSuc).catch(error => {
                        this.#logger.error('OPCUA.Client: Failed to disconnect', error);
                        onSuc();
                    });
                });
            }
            Executor.run(tasks, () => {
                this.#logger.trace(`OPCUA.Client: Successfully stopped OPC UA client to endpoint url: ${this.#options.endpointUrl}`);
                onSuccess();
            }, error => {
                this.#logger.error(`OPCUA.Client: Failed stopping OPC UA client to endpoint url ${this.#options.endpointUrl}`, error);
                onError(`Failed stopping OPC UA client to endpoint url ${this.#options.endpointUrl}: ${error.message}`);
            });
        }
        getType(dataId) {
            const node = this.#nodes[dataId];
            return node ? node.type : Core.DataType.Unknown;
        }
        registerObserver(dataId, onRefresh) {
            const node = this.#nodes[dataId];
            if (!node) {
                throw new Error(`OPCUA.Client: Unknown data id: '${dataId}'`);
            } else if (node.onRefresh === onRefresh) {
                this.#logger.error(`OPCUA.Client: Node with data id: '${dataId}' is already subscribed with same onRefresh(value) callback`);
            } else {
                node.onRefresh = onRefresh;
                if (node.value !== null) {
                    try {
                        onRefresh(node.value);
                    } catch (error) {
                        this.#logger.error(`OPCUA.Client: Failed calling onResfresh(value) for id '${node.dataId}'`, error);
                    }
                }
                if (this.#subscription && !this.#updateMonitoringTimer) {
                    this.#updateMonitoringTimer = setTimeout(() => {
                        this.#updateMonitoring(() => this.#updateMonitoringTimer = null, error => this.#updateMonitoringTimer = null);
                    }, UPDATE_MONITORING_DELAY);
                }
            }
        }
        unregisterObserver(dataId, onRefresh) {
            const node = this.#nodes[dataId];
            if (!node) {
                throw new Error(`OPCUA.Client: Unknown data id: '${dataId}'`);
            } else if (node.onRefresh !== onRefresh) {
                this.#logger.error(`OPCUA.Client: Node with data id: '${dataId}' is not subscribed with passed onRefresh(value) callback`);
            } else {
                node.onRefresh = null;
                if (this.#subscription && !this.#updateMonitoringTimer) {
                    this.#updateMonitoringTimer = setTimeout(() => {
                        this.#updateMonitoring(() => this.#updateMonitoringTimer = null, error => this.#updateMonitoringTimer = null);
                    }, UPDATE_MONITORING_DELAY);
                }
            }
        }
        #updateMonitoring(onSuccess, onError) {
            if (this.#subscription) {
                const toAdd = [], toRemove = [];
                for (const dataId in this.#nodes) {
                    if (this.#nodes.hasOwnProperty(dataId)) {
                        const node = this.#nodes[dataId];
                        if (node.onRefresh) {
                            if (!node.monitoredItem) {
                                toAdd.push(getEstablishMonitoringTask(this.#subscription, node, this.#logger));
                            }
                        } else {
                            if (node.monitoredItem) {
                                toRemove.push(getTerminateMonitoringTask(node, this.#logger));
                            }
                        }
                    }
                }
                const tasks = [];
                if (toRemove.length > 0) {
                    toRemove.parallel = true;
                    tasks.push((onSuc, onErr) => Executor.run(toRemove, onSuc, error => {
                        this.#logger.error('OPCUA.Client: Failed to un-monitor', error);
                        onSuc();
                    }));
                    tasks.push((onSuc, onErr) => setTimeout(() => onSuc(), 500));
                }
                if (toAdd.length > 0) {
                    toAdd.parallel = true;
                    tasks.push((onSuc, onErr) => Executor.run(toAdd, onSuc, error => {
                        this.#logger.error('OPCUA.Client: Failed to monitor', error);
                        onSuc();
                    }));
                    tasks.push((onSuc, onErr) => setTimeout(() => onSuc(), 500));
                }
                Executor.run(tasks, () => {
                    this.#logger.trace(`OPCUA.Client: Successfully removed ${toRemove.length} and added ${toAdd.length} monitoring items on OPC UA client with endpoint url: ${this.#options.endpointUrl}`);
                    onSuccess();
                }, error => {
                    this.#logger.error(`OPCUA.Client: Failed removing ${toRemove.length} and adding ${toAdd.length} monitoring items on OPC UA client with endpoint url ${this.#options.endpointUrl}`, error);
                    onError(`OPCUA.Client: Failed removing ${toRemove.length} and adding ${toAdd.length} monitoring items on OPC UA client with endpoint url ${this.#options.endpointUrl}: ${error.message}`);
                });
            }
        }
        read(dataId, onResponse, onError) {
            const node = this.#nodes[dataId];
            if (!node) {
                throw new Error(`OPCUA.Client: Unknown data id: '${dataId}'`);
            }
            try {
                this.#session.read({ nodeId: node.nodeId, attributeId: AttributeIds.Value }).then(dataValue => {
                    if (dataValue.statusCode.name === 'Good') {
                        const value = dataValue.value.value;
                        this.#logger.trace(`OPCUA.Client: Value ${value} read from node '${node.rawNodeId}'`);
                        onResponse(value);
                    } else {
                        this.#logger.error(`OPCUA.Client: Node '${node.rawNodeId}' has bad status: ${dataValue.statusCode.name}`);
                    }
                }).catch(error => {
                    this.#logger.error(`OPCUA.Client: Cannot read from node '${node.rawNodeId}'`, error);
                    onError(`Cannot read from node ${node.rawNodeId}: ${error.message}`);
                });
            } catch (error) {
                this.#logger.error(`OPCUA.Client: Failed reading '${node.rawNodeId}'`, error);
                onError(`Failed reading '${node.rawNodeId}': ${error.message}`);
            }
        }
        write(dataId, value) {
            const node = this.#nodes[dataId];
            if (!node) {
                throw new Error(`OPCUA.Client: Unknown data id '${dataId}' fro write`);
            }
            try {
                this.#session.writeSingleNode(node.accessString, { dataType: node.rawType, value })
                    .then(() => this.#logger.trace(`OPCUA.Client: Value ${value} written to node '${node.rawNodeId}'`))
                    .catch(error => this.#logger.error(`Failed writing value ${value} to node '${node.rawNodeId}'`, error));
            } catch (error) {
                this.#logger.error(`OPCUA.Client: Failed writing value ${value} to node '${node.rawNodeId}'`, error);
            }
        }
        getDataPoints() {
            const dataPoints = [];
            for (const dataId in this.#nodes) {
                if (this.#nodes.hasOwnProperty(dataId)) {
                    dataPoints.push({ id: dataId, type: this.#nodes[dataId].type });
                }
            }
            return dataPoints;
        }
    }
    OPCUA.Client = Client;

    Object.freeze(OPCUA);
    if (isNodeJS) {
        module.exports = OPCUA;
    } else {
        root.Template = OPCUA;
    }
}(globalThis));
