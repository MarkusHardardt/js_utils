(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    class DataNode {
        constructor(options = {}) {
            this._options = options;
            this._onError = typeof options.onError === 'function' ? options.onError : error => console.error(error);
            this._equal = typeof options.equal === 'function' ? options.equal : (l1, l2) => l1 === l2;
            this._onStopListeningDelay = typeof options.onStopListeningDelay === 'number' ? options.onStopListeningDelay : false;
            this._listeners = [];
            this._listener = value => {
                if (!this._equal(value, this._value)) {
                    this._value = value;
                    Notify()
                }
            };
        }

        get Listener() {
            return this._listener;
        }

        Notify() {
            for (let li of this._listeners) {
                try {
                    li(this._value);
                } catch (error) {
                    this._onError(`Failed notifying listener: ${error}`);
                }
            }
        }

        AddListener(listener) {
            let type = typeof listener;
            if (type !== 'function') {
                throw new Error(`Is not a function but '${type}'`);
            }
            for (let li of this._listeners) {
                if (li === listener) {
                    throw new Error('Listener already contained');
                }
            }
            this._listeners.push(listener);
            if (this._listeners.length === 1 && typeof this._options.onStartListening === 'function') {
                clearTimeout(this._onStopListeningDelayTimer);
                this._options.onStartListening(this._listener);
            }
        }

        RemoveListener(listener) {
            for (let i = 0; i < this._listeners.length; i++) {
                if (this._listeners[i] === listener) {
                    this._listeners.splice(idx, 1);
                    if (this._listeners.length === 0) {
                        if (this._listeners.length === 1 && typeof this._options.onStopListening === 'function') {
                            if (this._onStopListeningDelay) {
                                this._onStopListeningDelayTimer = setTimeout(() => {
                                    this._options.onStopListening(this._listener);
                                }, this._onStopListeningDelay);
                            } else {
                                this._options.onStopListening(this._listener);
                            }
                        }
                    }
                    return;
                }
            }
            throw new Error('Listener not contained');
        }
    }

    class DataBroker {
        constructor(options) {
            this._options = options;
            this._nodes = {};
        }

        AddListener(key, listener) {
            let node = this._nodes[key];
            if (!node) {
                this._nodes[key] = node = new DataNode({
                    onError: error => console.error(error),
                    equal: (l1, l2) => l1 === l2,
                    onStartListening: listener => { },
                    onStopListening: listener => { }
                });
            }
            node.AddListener(listener);
        }
    }

    if (isNodeJS) {
        module.exports = DataBroker;
    } else {
        root.DataBroker = DataBroker;
    }
}(globalThis));
