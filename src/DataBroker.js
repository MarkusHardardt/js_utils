(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const defaultEqual = (v1, v2) => v1 === v2;
    const defaultOnError = error => console.error(error);

    class DataNodeSubscriptionRegistry {
        constructor(other = {}) {
            if (typeof other.Subscribe === 'function' && typeof other.Unsubscribe === 'function') {
                this._other = other;
            } else {
                throw new Error('Other must provide Subscribe/Unsubscribe methods');
            }
            this._equal = defaultEqual;
            this._onError = defaultOnError;
            this._unsubscribeDelay = false;
            this._nodes = {};
        }

        set Equal(value) {
            if (typeof value === 'function') {
                this._equal = value;
            } else {
                throw new Error('Set value for Equal() is not a function');
            }
        }

        set OnError(value) {
            this._onError = typeof value === 'function' ? value : defaultOnError;
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        Subscribe(id, subscriber) {
            if (typeof subscriber !== 'function') {
                throw new Error(`Subscriber for id '${id}' is not a function`);
            }
            let node = this._nodes[id];
            if (node) {
                for (let sub of node.subscribers) {
                    if (sub === subscriber) {
                        throw new Error(`Subscriber for id '${id}' is already contained`);
                    }
                }
            } else {
                this._nodes[id] = node = {
                    id,
                    subscriber: value => this._setValue(node, value),
                    subscribers: [],
                    unsubscribeDelayTimer: null
                };
            }
            node.subscribers.push(subscriber);
            if (node.subscribers.length === 1) {
                if (node.unsubscribeDelayTimer) {
                    clearTimeout(node.unsubscribeDelayTimer);
                    node.unsubscribeDelayTimer = null;
                }
                else {
                    this._other.Subscribe(node.id, node.subscriber);
                }
            }
        }

        Unsubscribe(id, subscriber) {
            let node = this._nodes[id];
            if (!node) {
                throw new Error(`Cannot unsubscribe for unknown id: ${id}`);
            }
            for (let i = 0; i < node.subscribers.length; i++) {
                if (node.subscribers[i] === subscriber) {
                    node.subscribers.splice(i, 1);
                    if (node.subscribers.length === 0) {
                        if (this._unsubscribeDelay) {
                            node.unsubscribeDelayTimer = setTimeout(() => {
                                this._other.Unsubscribe(node.id, node.subscriber);
                                node.unsubscribeDelayTimer = null;
                            }, this._unsubscribeDelay);
                        } else {
                            this._other.Unsubscribe(node.id, node.subscriber);
                        }
                    }
                    return;
                }
            }
            throw new Error(`Subscriber for id: ${id} is not contained`);
        }

        _setValue(node, value) {
            if (!this._equal(value, node.value)) {
                node.value = value;
                for (let subscriber of node.subscribers) {
                    try {
                        subscriber(value);
                    } catch (error) {
                        this._onError(`Failed notifying subscriber for id: ${node.id}: ${error}`);
                    }
                }
            }
        }
    }

    class DataNode {
        constructor(id, other) {
            this._id = id;
            if (typeof other.Subscribe === 'function' && typeof other.Unsubscribe === 'function') {
                this._other = other;
            } else {
                throw new Error('Other must provide Subscribe/Unsubscribe methods');
            }
            this._equal = defaultEqual;
            this._onError = defaultOnError;
            this._unsubscribeDelay = false;
            this._unsubscribeDelayTimer = null;
            this._subscribers = [];
            this._subscriber = value => this.Value = value;
        }

        get Id() {
            return this._id;
        }

        set Equal(value) {
            if (typeof value === 'function') {
                this._equal = value;
            } else {
                throw new Error(`Data node (id: '${this._id}') set value for Equal() is not a function`);
            }
        }

        get Value() {
            return this._value;
        }

        set Value(value) {
            if (!this._equal(value, this._value)) {
                this._value = value;
                for (let subscriber of this._subscribers) {
                    try {
                        subscriber(value);
                    } catch (error) {
                        this._onError(`Failed notifying subscriber (id: '${this._id}'): ${error}`);
                    }
                }
            }
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        Subscribe(subscriber) {
            if (typeof subscriber !== 'function') {
                throw new Error(`Data node (id: '${this._id}') subscriber is not a function`);
            }
            for (let sub of this._subscribers) {
                if (sub === subscriber) {
                    throw new Error(`Data node (id: '${this._id}') subscriber already contained`);
                }
            }
            this._subscribers.push(subscriber);
            if (this._subscribers.length === 1) {
                if (this._unsubscribeDelayTimer) {
                    clearTimeout(this._unsubscribeDelayTimer);
                    this._unsubscribeDelayTimer = null;
                }
                else {
                    this._other.Subscribe(this._subscriber);
                }
            }
        }

        Unsubscribe(subscriber) {
            for (let i = 0; i < this._subscribers.length; i++) {
                if (this._subscribers[i] === subscriber) {
                    this._subscribers.splice(i, 1);
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
            throw new Error(`Data node (id: '${this._id}') subscriber is not contained`);
        }
    }

    class DataBroker {
        constructor(adapter, options = {}) { // adapter: { Read, Write, Subscribe, Unsubscribe, OnError, Equal }, options { UnsubscribeDelay }
            this._adapter = adapter;
            this._unsubscribeDelay = typeof options.UnsubscribeDelay === 'number' ? options.UnsubscribeDelay : false;
            this._nodes = {};
        }

        Get(id) {
            const node = this._nodes[id];
            if (node) {
                return node.Value;
            }
            else {
                throw new Error(`Cannot get for invalid id: ${id}`);
            }
        }

        Read(id, onResponse, onError) {
            const node = this._nodes[id];
            if (node) {
                node.Read(onResponse, onError);
            }
            else {
                throw new Error(`Cannot read for invalid id: ${id}`);
            }
        }

        Write(id, value) {
            const node = this._nodes[id];
            if (node) {
                node.Write(value);
            }
            else {
                throw new Error(`Cannot write for invalid id: ${id}`);
            }
        }

        Subscribe(id, subscriber) {
            let node = this._nodes[id];
            if (!node) {
                this._nodes[id] = node = new DataNode(id, {
                    Read: (onResponse, onError) => this._adapter.Read(id, onResponse, onError),
                    Write: value => this._adapter.Write(id, value),
                    Subscribe: subscriber => this._adapter.Subscribe(id, subscriber),
                    Unsubscribe: subscriber => this._adapter.Unsubscribe(id, subscriber),
                    OnError: this._adapter.OnError,
                    Equal: this._adapter.Equal
                }, {
                    UnsubscribeDelay: this._unsubscribeDelay
                });
            }
            node.Subscribe(subscriber);
        }

        Unsubscribe(id, subscriber) {
            let node = this._nodes[id];
            if (!node) {
                throw new Error(`Cannot unsubscribe for invalid id: ${id}`);
            }
            node.Unsubscribe(subscriber);
        }
    }

    if (isNodeJS) {
        module.exports = { DataBroker: DataNodeSubscriptionRegistry }; // { DataBroker };
    } else {
        root.DataBroker = DataNodeSubscriptionRegistry; // DataBroker;
    }
}(globalThis));
