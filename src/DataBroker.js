(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    class DataNode {
        constructor(options = {}) {
            this._onError = typeof options.onError === 'function' ? options.onError : error => console.error(error);
            this._equal = typeof options.equal === 'function' ? options.equal : (l1, l2) => l1 === l2;
            this._listeners = [];
            this._listener = value => {
                if (!this._equal(value, this._value)) {
                    this._value = value;
                    Notify()
                }
            };
        }

        get Listner() {
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
            if (this._listeners.length === 1) {
                // TODO: Add this listener
            }
        }

        RemoveListener(listener) {
            for (let i = 0; i < this._listeners.length; i++) {
                if (this._listeners[i] === listener) {
                    this._listeners.splice(idx, 1);
                    if (this._listeners.length === 0) {
                        // TODO: Remove this listener
                    }
                    return;
                }
            }
            throw new Error('Listener not contained');
        }
    }

    const exp = {};

    if (isNodeJS) {
        module.exports = exp;
    } else {
        root.EmptyTemplate = exp;
    }
}(globalThis));
