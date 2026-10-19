import Core from './Core.js';

const ADS = {};
const isNodeJS = typeof process !== 'undefined' && Boolean(process.versions?.node);
const { Client: AdsClient } = isNodeJS ? await import('ads-client') : {};

const START_TRY_RECONNECT_DELAY = 2;
const MAX_TRY_RECONNECT_DELAY = 32;
const UPDATE_SUBSCRIPTIONS_DELAY = 100;

function getAsCoreDataType(typeName, adsDataTypeStr, isArray) {
    if (isArray || adsDataTypeStr === 'ADST_BIGTYPE') {
        return Core.DataType.Object;
    }
    switch (typeName.toUpperCase()) {
        case 'BOOL':
        case 'BIT':
            return Core.DataType.Boolean;
        case 'SINT':
        case 'INT8':
            return Core.DataType.Int8;
        case 'BYTE':
        case 'USINT':
        case 'UINT8':
            return Core.DataType.UInt8;
        case 'INT':
        case 'INT16':
            return Core.DataType.Int16;
        case 'UINT':
        case 'WORD':
        case 'UINT16':
            return Core.DataType.UInt16;
        case 'DINT':
        case 'INT32':
            return Core.DataType.Int32;
        case 'UDINT':
        case 'DWORD':
        case 'TIME':
        case 'TIME_OF_DAY':
        case 'TOD':
        case 'DATE':
        case 'DATE_AND_TIME':
        case 'DT':
        case 'UINT32':
            return Core.DataType.UInt32;
        case 'LINT':
        case 'INT64':
            return Core.DataType.Int64;
        case 'ULINT':
        case 'LWORD':
        case 'LTIME':
        case 'UINT64':
            return Core.DataType.UInt64;
        case 'REAL':
        case 'FLOAT':
            return Core.DataType.Float;
        case 'LREAL':
        case 'DOUBLE':
            return Core.DataType.Double;
        case 'STRING':
        case 'WSTRING':
            return Core.DataType.String;
        default:
            return Core.DataType.Unknown;
    }
}

class Client {
    #logger;
    #options;
    #client;
    #nodes;
    #running;
    #online;
    #connectTask;
    #retryTimer;
    #retryResolver;
    #updateSubscriptionsTimer;
    #subscriptionTask;
    #observationRevision;
    #onConnected;
    #onDisconnected;

    constructor(logger, options = {}) {
        if (typeof options.targetAmsNetId !== 'string' || options.targetAmsNetId.trim().length === 0) {
            throw new Error(`ADS.Client: Invalid targetAmsNetId: '${options.targetAmsNetId}'`);
        } else if (typeof options.targetAdsPort !== 'number' || !Number.isFinite(options.targetAdsPort)) {
            throw new Error(`ADS.Client: Invalid targetAdsPort: '${options.targetAdsPort}'`);
        } else if (!options.nodesConfig || typeof options.nodesConfig !== 'object' || Array.isArray(options.nodesConfig)) {
            throw new Error('ADS.Client: Invalid nodes configuration');
        }

        this.#logger = logger;
        this.#options = options;
        this.#nodes = Object.create(null);
        for (const dataId of Object.keys(options.nodesConfig)) {
            const rawNodeId = options.nodesConfig[dataId];
            if (typeof rawNodeId !== 'string' || rawNodeId.trim().length === 0) {
                throw new Error(`ADS.Client: Invalid symbol path for data id '${dataId}'`);
            }
            this.#nodes[dataId] = {
                dataId,
                rawNodeId,
                value: null,
                type: Core.DataType.Unknown,
                onRefresh: null,
                subscription: null
            };
        }

        this.#running = false;
        this.#online = false;
        this.#connectTask = null;
        this.#retryTimer = null;
        this.#retryResolver = null;
        this.#updateSubscriptionsTimer = null;
        this.#subscriptionTask = null;
        this.#observationRevision = 0;
        this.#onConnected = null;
        this.#onDisconnected = null;

        const { nodesConfig, ...clientOptions } = options;
        this.#client = new AdsClient(clientOptions);
        this.#client.on('disconnect', connectionLost => {
            if (connectionLost && this.#online) {
                this.#online = false;
                this.#logger.warn(`ADS.Client: Connection to ${this.#options.targetAmsNetId}:${this.#options.targetAdsPort} was lost`);
                this.#notifyDisconnected();
            }
        });
        this.#client.on('reconnect', (allSubscriptionsRestored, unrestoredSubscriptions) => {
            this.#online = true;
            if (!allSubscriptionsRestored) {
                this.#logger.error(`ADS.Client: Failed restoring subscriptions: ${unrestoredSubscriptions.join(', ')}`);
                this.#scheduleSubscriptionUpdate();
            }
            this.#logger.trace(`ADS.Client: Reconnected to ${this.#options.targetAmsNetId}:${this.#options.targetAdsPort}`);
            this.#scheduleSubscriptionUpdate();
            this.#notifyConnected();
        });
    }

    set onConnected(value) {
        if (value !== undefined && value !== null && typeof value !== 'function') {
            throw new Error('ADS.Client: onConnected() is not a function');
        }
        this.#onConnected = value || null;
    }

    set onDisconnected(value) {
        if (value !== undefined && value !== null && typeof value !== 'function') {
            throw new Error('ADS.Client: onDisconnected() is not a function');
        }
        this.#onDisconnected = value || null;
    }

    start(onSuccess, onError) {
        if (this.#running) {
            onSuccess();
            return;
        }
        this.#running = true;
        this.#connectTask = this.#connect();
        this.#connectTask.catch(error => {
            if (this.#running) {
                this.#logger.error('ADS.Client: Failed connecting', error);
                onError(`ADS.Client: Failed connecting: ${error.message}`);
            }
        });
        onSuccess();
    }

    async #connect() {
        let retryDelay = START_TRY_RECONNECT_DELAY;
        while (this.#running) {
            try {
                this.#logger.trace(`ADS.Client: Connecting to ${this.#options.targetAmsNetId}:${this.#options.targetAdsPort}`);
                await this.#client.connect();
                if (!this.#running) {
                    return;
                }
                this.#online = true;
                await this.#initializeNodes();
                await this.#updateSubscriptions();
                if (!this.#running) {
                    return;
                }
                this.#logger.trace(`ADS.Client: Connected to ${this.#options.targetAmsNetId}:${this.#options.targetAdsPort}`);
                this.#notifyConnected();
                return;
            } catch (error) {
                if (!this.#running) {
                    return;
                }
                this.#logger.warn(`ADS.Client: Connection failed; retrying in ${retryDelay} seconds`, error);
                await new Promise(resolve => {
                    this.#retryResolver = resolve;
                    this.#retryTimer = setTimeout(() => {
                        this.#retryTimer = null;
                        this.#retryResolver = null;
                        resolve();
                    }, retryDelay * 1000);
                });
                retryDelay = Math.min(retryDelay * 2, MAX_TRY_RECONNECT_DELAY);
            }
        }
    }

    async #initializeNodes() {
        await Promise.all(Object.values(this.#nodes).map(async node => {
            try {
                const result = await this.#client.readValue(node.rawNodeId);
                node.value = result.value;
                const symbol = result.symbol || {};
                const dataType = result.dataType || {};
                const typeName = symbol.type || dataType.name || dataType.type || '';
                node.type = getAsCoreDataType(typeName, dataType.adsDataTypeStr || symbol.adsDataTypeStr, symbol.arrayDimension > 0);
            } catch (error) {
                node.value = null;
                node.type = Core.DataType.Unknown;
                this.#logger.error(`ADS.Client: Failed reading initial value of '${node.rawNodeId}'`, error);
            }
        }));
    }

    stop(onSuccess, onError) {
        this.#running = false;
        clearTimeout(this.#retryTimer);
        this.#retryTimer = null;
        if (this.#retryResolver) {
            this.#retryResolver();
            this.#retryResolver = null;
        }
        clearTimeout(this.#updateSubscriptionsTimer);
        this.#updateSubscriptionsTimer = null;
        this.#stop(onSuccess, onError);
    }

    async #stop(onSuccess, onError) {
        if (this.#connectTask) {
            await this.#connectTask;
            this.#connectTask = null;
        }
        if (this.#subscriptionTask) {
            await this.#subscriptionTask;
        }
        const wasOnline = this.#online;
        this.#online = false;
        if (wasOnline) {
            this.#notifyDisconnected();
        }
        try {
            await this.#client.disconnect();
            this.#logger.trace(`ADS.Client: Disconnected from ${this.#options.targetAmsNetId}:${this.#options.targetAdsPort}`);
            onSuccess();
        } catch (error) {
            this.#logger.error('ADS.Client: Failed disconnecting', error);
            onError(`ADS.Client: Failed disconnecting: ${error.message}`);
        }
    }

    getType(dataId) {
        const node = this.#nodes[dataId];
        return node ? node.type : Core.DataType.Unknown;
    }

    registerObserver(dataId, onRefresh) {
        const node = this.#nodes[dataId];
        if (!node) {
            throw new Error(`ADS.Client: Unknown data id '${dataId}'`);
        } else if (node.onRefresh === onRefresh) {
            this.#logger.error(`ADS.Client: Symbol '${dataId}' is already subscribed with this callback`);
        } else {
            node.onRefresh = onRefresh;
            if (node.value !== null) {
                this.#notifyObserver(node, node.value);
            }
            this.#observationRevision++;
            this.#scheduleSubscriptionUpdate();
        }
    }

    unregisterObserver(dataId, onRefresh) {
        const node = this.#nodes[dataId];
        if (!node) {
            throw new Error(`ADS.Client: Unknown data id '${dataId}'`);
        } else if (node.onRefresh !== onRefresh) {
            this.#logger.error(`ADS.Client: Symbol '${dataId}' is not subscribed with this callback`);
        } else {
            node.onRefresh = null;
            this.#observationRevision++;
            this.#scheduleSubscriptionUpdate();
        }
    }

    #scheduleSubscriptionUpdate() {
        if (this.#online && this.#running && !this.#updateSubscriptionsTimer) {
            this.#updateSubscriptionsTimer = setTimeout(() => {
                this.#updateSubscriptionsTimer = null;
                this.#updateSubscriptions().catch(error => this.#logger.error('ADS.Client: Failed updating subscriptions', error));
            }, UPDATE_SUBSCRIPTIONS_DELAY);
        }
    }

    async #updateSubscriptions() {
        if (!this.#online || !this.#running) {
            return;
        }
        if (this.#subscriptionTask) {
            return this.#subscriptionTask;
        }

        const revision = this.#observationRevision;
        const task = (async () => {
            for (const node of Object.values(this.#nodes)) {
                if (!this.#running || !this.#online) {
                    break;
                }
                if (node.onRefresh && !node.subscription) {
                    try {
                        node.subscription = await this.#client.subscribe({
                            target: node.rawNodeId,
                            callback: data => {
                                node.value = data.value;
                                this.#logger.trace(`ADS.Client: Value of symbol '${node.rawNodeId}' changed: ${node.value}`);
                                if (node.onRefresh) {
                                    this.#notifyObserver(node, node.value);
                                }
                            },
                            cycleTime: 500,
                            sendOnChange: true
                        });
                    } catch (error) {
                        this.#logger.error(`ADS.Client: Failed subscribing to '${node.rawNodeId}'`, error);
                    }
                }
                if (!node.onRefresh && node.subscription) {
                    const subscription = node.subscription;
                    node.subscription = null;
                    try {
                        await this.#client.unsubscribe(subscription);
                    } catch (error) {
                        this.#logger.error(`ADS.Client: Failed unsubscribing from '${node.rawNodeId}'`, error);
                    }
                }
            }
        })();
        this.#subscriptionTask = task;
        try {
            await task;
        } finally {
            this.#subscriptionTask = null;
            if (revision !== this.#observationRevision) {
                this.#scheduleSubscriptionUpdate();
            }
        }
    }

    #notifyObserver(node, value) {
        try {
            node.onRefresh(value);
        } catch (error) {
            this.#logger.error(`ADS.Client: Failed calling observer for '${node.dataId}'`, error);
        }
    }

    #notifyConnected() {
        if (this.#onConnected) {
            try {
                this.#onConnected();
            } catch (error) {
                this.#logger.error('ADS.Client: Failed calling onConnected()', error);
            }
        }
    }

    #notifyDisconnected() {
        if (this.#onDisconnected) {
            try {
                this.#onDisconnected();
            } catch (error) {
                this.#logger.error('ADS.Client: Failed calling onDisconnected()', error);
            }
        }
    }

    read(dataId, onResponse, onError) {
        const node = this.#nodes[dataId];
        if (!node) {
            throw new Error(`ADS.Client: Unknown data id '${dataId}'`);
        }
        this.#client.readValue(node.rawNodeId).then(result => {
            node.value = result.value;
            const typeName = (result.symbol && result.symbol.type) || (result.dataType && (result.dataType.name || result.dataType.type)) || '';
            node.type = getAsCoreDataType(typeName, result.dataType && result.dataType.adsDataTypeStr, result.symbol && result.symbol.arrayDimension > 0);
            this.#logger.trace(`ADS.Client: Value ${result.value} read from symbol '${node.rawNodeId}'`);
            try {
                onResponse(result.value);
            } catch (error) {
                this.#logger.error(`ADS.Client: Failed calling read response for '${node.dataId}'`, error);
            }
        }).catch(error => {
            this.#logger.error(`ADS.Client: Failed reading '${node.rawNodeId}'`, error);
            onError(`ADS.Client: Failed reading '${node.rawNodeId}': ${error.message}`);
        });
    }

    write(dataId, value) {
        const node = this.#nodes[dataId];
        if (!node) {
            throw new Error(`ADS.Client: Unknown data id '${dataId}'`);
        }
        this.#client.writeValue(node.rawNodeId, value).then(() => {
            this.#logger.trace(`ADS.Client: Value ${value} written to symbol '${node.rawNodeId}'`);
        }).catch(error => {
            this.#logger.error(`ADS.Client: Failed writing value ${value} to '${node.rawNodeId}'`, error);
        });
    }

    getDataPoints() {
        return Object.values(this.#nodes).map(node => ({ id: node.dataId, type: node.type }));
    }
}

ADS.getAsCoreDataType = (typeName, adsDataTypeStr, isArray = false) => getAsCoreDataType(typeName, adsDataTypeStr, isArray);
ADS.Client = Client;

Object.freeze(ADS);

export default ADS;
