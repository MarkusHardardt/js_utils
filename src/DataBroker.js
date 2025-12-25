(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    class DataNode {
        constructor(options = {}) {
            this._onError = typeof options.onError === 'function' ? options.onError : error => console.error(error);
            this._equal = typeof options.equal === 'function' ? options.equal : (l1, l2) => l1 === l2;
            this._readValue = typeof options.readValue === 'function' ? options.readValue : (onResponse, onError) => { 
                console.log('Read value');
                onError('Not implemented')
            };
            this._writeValue = typeof options.writeValue === 'function' ? options.writeValue : value => console.log(`Write value: ${value}`);
            this._onSubscription = typeof options.onSubscription === 'function' ? options.onSubscription : () => console.log('Subscribed');
            this._onUnsubscription = typeof options.onUnsubscription === 'function' ? options.onUnsubscription : () => console.log('Unsubscribed');
            this._onUnsubscriptionDelay = typeof options.onUnsubscriptionDelay === 'number' ? options.onUnsubscriptionDelay : false;
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
        constructor(options) {
            this._onError = typeof options.onError === 'function' ? options.onError : error => console.error(error);
            this._equal = typeof options.equal === 'function' ? options.equal : (l1, l2) => l1 === l2;
            this._readValue = typeof options.readValue === 'function' ? options.readValue : (key, onResponse, onError) => { 
                console.log(`Read value for key: ${key}`);
                onError('Not implemented')
            };
            this._writeValue = typeof options.writeValue === 'function' ? options.writeValue : (key, value) => console.log(`Write value: ${value} for key: ${key}`);
            this._onSubscription = typeof options.onSubscription === 'function' ? options.onSubscription : key => console.log(`Subscribed key: ${key}`);
            this._onUnsubscription = typeof options.onUnsubscription === 'function' ? options.onUnsubscription : key => console.log(`Unsubscribed key: ${key}`);
            this._onUnsubscriptionDelay = typeof options.onUnsubscriptionDelay === 'number' ? options.onUnsubscriptionDelay : false;
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
                    onError: this._onError,
                    equal: this._equal,
                    readValue: this._readValue,
                    writeValue: this._writeValue,
                    onSubscription: this._onSubscription,
                    onUnsubscription: this._onUnsubscription,
                    onUnsubscriptionDelay: this._onUnsubscriptionDelay
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
