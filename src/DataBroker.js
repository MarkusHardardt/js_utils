(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    function validateDataBroker(db) {
        if (!db) {
            throw new Error('Invalid DataBroker: Is null or undefined');
        } else if (typeof db.Subscribe !== 'function') {
            throw new Error('Invalid DataBroker: Missing method Subscribe(in, subscriber)');
        } else if (typeof db.Unsubscribe !== 'function') {
            throw new Error('Invalid DataBroker: Missing method Unsubscribe(in, subscriber)');
        } else if (typeof db.Read !== 'function') {
            throw new Error('Invalid DataBroker: Missing method Read(id, onResponse, onError)');
        } else if (typeof db.Write !== 'function') {
            throw new Error('Invalid DataBroker: Missing method Write(id, value)');
        }
    }

    const defaultEqual = (v1, v2) => v1 === v2;
    const defaultOnError = error => console.error(error);

    class DataBroker {
        constructor() {
            this._other = null;
            this._equal = defaultEqual;
            this._onError = defaultOnError;
            this._unsubscribeDelay = false;
            this._nodes = {};
        }

        set OtherBroker(value) {
            validateDataBroker(value);
            this._other = value;
        }

        set Equal(value) {
            if (typeof value === 'function') {
                this._equal = value;
            } else {
                throw new Error('Set value for Equal() is not a function');
            }
        }

        set OnError(value) {
            if (typeof value === 'function') {
                this._onError = value;
            } else {
                throw new Error('Set value for OnError() is not a function');
            }
        }

        set UnsubscribeDelay(value) {
            this._unsubscribeDelay = typeof value === 'number' && value > 0 ? value : false;
        }

        Subscribe(id, subscriber) {
            validateDataBroker(this._other);
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
                this._nodes[id] = node = this._createNode(id);
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
            validateDataBroker(this._other);
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

        Read(id, onResponse, onError) {
            validateDataBroker(this._other);
            this._other.Read(id, value => {
                try {
                    onResponse(value);
                } catch (error) {
                    this._onError(`Failed calling onResponse() for id: ${id}: ${error}`);
                }
                let node = this._nodes[id];
                if (!node) {
                    this._nodes[id] = node = this._createNode(id);
                }
                node.SetValue(value);
            }, onError);
        }

        Write(id, value) {
            validateDataBroker(this._other);
            this._other.Write(id, value);
            let node = this._nodes[id];
            if (!node) {
                this._nodes[id] = node = this._createNode(id);
            }
            node.SetValue(value);
        }

        _createNode(id) {
            const node = {
                id,
                value: null,
                SetValue: value => {
                    if (!this._equal(value, node.value)) {
                        node.value = value;
                        for (const sub of node.subscribers) {
                            try {
                                sub(value);
                            } catch (error) {
                                this._onError(`Failed notifying subscriber for id: ${node.id}: ${error}`);
                            }
                        }
                    }
                },
                subscriber: value => node.SetValue(value),
                subscribers: [],
                unsubscribeDelayTimer: null
            };
            return node;
        }
    }

    if (isNodeJS) {
        module.exports = { DataBroker, validateDataBroker };
    } else {
        root.DataBroker = DataBroker;
        root.validateDataBroker = validateDataBroker;
    }
}(globalThis));
