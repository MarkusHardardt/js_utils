(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    class DataNode {
        constructor(key, adapter, options = {}) { // adapter: { Read, Write, Subscribe, Unsubscribe, OnError, Equal }, options { UnsubscribeDelay }
            this._key = key;
            this._adapter = adapter;
            this._unsubscribeDelay = typeof options.UnsubscribeDelay === 'number' ? options.UnsubscribeDelay : false;
            this._unsubscribeDelayTimer = null;
            this._subscribers = [];
            this._subscriber = (key, value) => {
                if (!this._adapter.Equal(value, this._value)) {
                    this._value = value;
                    this.Notify()
                }
            };
        }

        get Value() {
            return this._value;
        }

        Read(onResponse, onError) {
            this._adapter.Read(response => {
                this._subscriber(this._key, response);
                try {
                    onResponse(response);
                } catch (error) {
                    onError(error);
                }
            }, onError);
        }

        Write(value) {
            this._adapter.Write(value);
        }

        get Subscriber() { // TODO: Use or remove
            return this._subscriber;
        }

        Notify() {
            for (let subscriber of this._subscribers) {
                try {
                    subscriber(this._key, this._value);
                } catch (error) {
                    this._adapter.OnError(`Failed notifying subscriber: ${error}`);
                }
            }
        }

        Subscribe(subscriber) {
            let type = typeof subscriber;
            if (type !== 'function') {
                throw new Error(`Is not a function but '${type}'`);
            }
            for (let sub of this._subscribers) {
                if (sub === subscriber) {
                    throw new Error('Subscriber already contained');
                }
            }
            this._subscribers.push(subscriber);
            if (this._subscribers.length === 1) {
                if (this._unsubscribeDelayTimer) {
                    clearTimeout(this._unsubscribeDelayTimer);
                    this._unsubscribeDelayTimer = null;
                }
                else {
                    this._adapter.Subscribe(this._subscriber);
                }
            }
        }

        Unsubscribe(subscriber) {
            for (let sub = 0; sub < this._subscribers.length; sub++) {
                if (this._subscribers[sub] === subscriber) {
                    this._subscribers.splice(sub, 1);
                    if (this._subscribers.length === 0) {
                        if (this._unsubscribeDelay) {
                            this._unsubscribeDelayTimer = setTimeout(() => {
                                this._adapter.Unsubscribe(this._subscriber);
                                this._unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._adapter.Unsubscribe(this._subscriber);
                        }
                    }
                    return;
                }
            }
            throw new Error('Subscriber not contained');
        }
    }

    class DataBroker {
        constructor(adapter, options = {}) { // adapter: { Read, Write, Subscribe, Unsubscribe, OnError, Equal }, options { UnsubscribeDelay }
            this._adapter = adapter;
            this._unsubscribeDelay = typeof options.UnsubscribeDelay === 'number' ? options.UnsubscribeDelay : false;
            this._nodes = {};
        }

        Get(key) {
            const node = this._nodes[key];
            if (node) {
                return node.Value;
            }
            else {
                throw new Error(`Cannot get for invalid key: ${key}`);
            }
        }

        Read(key, onResponse, onError) {
            const node = this._nodes[key];
            if (node) {
                node.Read(onResponse, onError);
            }
            else {
                throw new Error(`Cannot read for invalid key: ${key}`);
            }
        }

        Write(key, value) {
            const node = this._nodes[key];
            if (node) {
                node.Write(value);
            }
            else {
                throw new Error(`Cannot write for invalid key: ${key}`);
            }
        }

        Subscribe(key, subscriber) {
            let node = this._nodes[key];
            if (!node) {
                this._nodes[key] = node = new DataNode(key, {
                    Read: (onResponse, onError) => this._adapter.Read(key, onResponse, onError),
                    Write: value => this._adapter.Write(key, value),
                    Subscribe: subscriber => this._adapter.Subscribe(key, subscriber),
                    Unsubscribe: subscriber => this._adapter.Unsubscribe(key, subscriber),
                    OnError: this._adapter.OnError,
                    Equal: this._adapter.Equal
                }, {
                    UnsubscribeDelay: this._unsubscribeDelay
                });
            }
            node.Subscribe(subscriber);
        }

        Unsubscribe(key, subscriber) {
            let node = this._nodes[key];
            if (!node) {
                throw new Error(`Cannot unsubscribe for invalid key: ${key}`);
            }
            node.Unsubscribe(subscriber);
        }
    }

    if (isNodeJS) {
        module.exports = { DataBroker };
    } else {
        root.DataBroker = DataBroker;
    }
}(globalThis));
