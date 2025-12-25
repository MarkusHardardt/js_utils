(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    class DataNode {
        constructor(options = {}) { // options: { OnError, Equal, Read, Write, OnSubscription, OnUnsubscription, OnUnsubscriptionDelay }
            this._onError = typeof options.OnError === 'function' ? options.OnError : error => console.error(error);
            this._equal = typeof options.Equal === 'function' ? options.Equal : (value1, value2) => { throw new Error('Not implemented: Equal(value1, value2)'); };
            this._readValue = typeof options.Read === 'function' ? options.Read : (onResponse, onError) => { throw new Error('Not implemented: Read(onResponse, onError)'); };
            this._writeValue = typeof options.Write === 'function' ? options.Write : value => { throw new Error('Not implemented: Write(value)'); };
            this._onSubscription = typeof options.OnSubscription === 'function' ? options.OnSubscription : subscriber => { throw new Error('Not implemented: OnSubscription(subscriber)'); };
            this._onUnsubscription = typeof options.OnUnsubscription === 'function' ? options.OnUnsubscription : subscriber => { throw new Error('Not implemented: OnUnsubscription(subscriber)'); };
            this._onUnsubscriptionDelay = typeof options.OnUnsubscriptionDelay === 'number' ? options.OnUnsubscriptionDelay : false;
            this._onUnsubscriptionDelayTimer = null;
            this._subscribers = [];
            this._subscriber = value => {
                if (!this._equal(value, this._value)) {
                    this._value = value;
                    Notify()
                }
            };
        }

        get Value() {
            return this._value;
        }

        Read(onResponse, onError) {
            this._readValue(response => {
                this._subscriber(response);
                try {
                    onResponse(response);
                } catch (error) {
                    onError(error);
                }
            }, onError);
        }

        Write(value) {
            this._writeValue(value);
        }

        get Subscriber() {
            return this._subscriber;
        }

        Notify() {
            for (let subscriber of this._subscribers) {
                try {
                    subscriber(this._value);
                } catch (error) {
                    this._onError(`Failed notifying subscriber: ${error}`);
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
                clearTimeout(this._onUnsubscriptionDelayTimer);
                this._onSubscription(this._subscriber);
            }
        }

        Unsubscribe(subscriber) {
            for (let sub = 0; sub < this._subscribers.length; sub++) {
                if (this._subscribers[sub] === subscriber) {
                    this._subscribers.splice(sub, 1);
                    if (this._subscribers.length === 0) {
                        if (this._onUnsubscriptionDelay) {
                            this._onUnsubscriptionDelayTimer = setTimeout(() => {
                                this._onUnsubscription(this._subscriber);
                            }, this._onUnsubscriptionDelay);
                        } else {
                            this._onUnsubscription(this._subscriber);
                        }
                    }
                    return;
                }
            }
            throw new Error('Subscriber not contained');
        }
    }

    class DataBroker {
        constructor(options) { // options: { OnError, Equal, Read, Write, OnSubscription, OnUnsubscription, OnUnsubscriptionDelay }
            this._onError = typeof options.OnError === 'function' ? options.OnError : error => console.error(error);
            this._equal = typeof options.Equal === 'function' ? options.Equal : (value1, value2) => { throw new Error('Not implemented: Equal(value1, value2)'); };
            this._readValue = typeof options.Read === 'function' ? options.Read : (key, onResponse, onError) => { throw new Error('Not implemented: Read(key, onResponse, onError)'); };
            this._writeValue = typeof options.Write === 'function' ? options.Write : (key, value) => { throw new Error('Not implemented: Write(key, value)'); };
            this._onSubscription = typeof options.OnSubscription === 'function' ? options.OnSubscription : (key, subscriber) => { throw new Error('Not implemented: OnSubscription(key, subscriber)'); };
            this._onUnsubscription = typeof options.OnUnsubscription === 'function' ? options.OnUnsubscription : (key, subscriber) => { throw new Error('Not implemented: OnUnsubscription(key, subscriber)'); };
            this._onUnsubscriptionDelay = typeof options.OnUnsubscriptionDelay === 'number' ? options.OnUnsubscriptionDelay : false;
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
                this._nodes[key] = node = new DataNode({
                    OnError: this._onError,
                    Equal: this._equal,
                    Read: (onResponse, onError) => this._readValue(key, onResponse, onError),
                    Write: value => this._writeValue(key, value),
                    OnSubscription: subscriber => this._onSubscription(key, subscriber),
                    OnUnsubscription: subscriber => this._onUnsubscription(key, subscriber),
                    OnUnsubscriptionDelay: this._onUnsubscriptionDelay
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
