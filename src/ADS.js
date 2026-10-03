const ADS = {};

class Client {
    #logger;
    #options;
    constructor(logger, options = {}) {
        this.#logger = logger;
        this.#options = options;
    }
    set onConnected(value) { }
    set onDisconnected(value) { }
    start(onSuccess, onError) { }
    stop(onSuccess, onError) { }
    getType(dataId) { }
    registerObserver(dataId, onRefresh) { }
    unregisterObserver(dataId, onRefresh) { }
    read(dataId, onResponse, onError) { }
    write(dataId, value) { }
    getDataPoints() { }
}
ADS.Client = Client;

Object.freeze(ADS);

export default ADS;
