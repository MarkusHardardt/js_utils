(function (root) {
    "use strict";
    const HashLists = {};
    const isNodeJS = typeof require === 'function';

    // store for performance reasons
    const Utilities = isNodeJS ? require('./Utilities') : root.Utilities;

    // our mode constants:
    const Mode = Object.freeze({
        IdenticalValuesPerKey: 1,
        NoIdenticalValuesPerKey: 2,
        NoEqualValuesPerKey: 3
    });
    HashLists.Mode = Mode;

    // constructor for internal list structure we need only to decide if a value
    // is an array or our internal storage container
    class List {
        constructor() {
            // call super constructor
            Array.call(this);
        }
    }

    // constructor for our hash lists implementations
    class Impl {
        #mode;
        #data;
        #size;
        #selection;
        constructor(mode) {
            // this makes sure we have one ouf our supported modes
            switch (mode) {
                case Mode.NoIdenticalValuesPerKey:
                    this.#mode = Mode.NoIdenticalValuesPerKey;
                    break;
                case Mode.NoEqualValuesPerKey:
                    this.#mode = Mode.NoEqualValuesPerKey;
                    break;
                case Mode.IdenticalValuesPerKey:
                default:
                    this.#mode = Mode.IdenticalValuesPerKey;
                    break;
            }
            // plain javascript objects are implemented as associative arrays - so we
            // use this data object for our internal data storage
            this.#data = {};
            this.#size = 0;
            this.#selection = null;
        }

        /**
         * Add an entry to the list
         *
         * @param {Object}
         *          key The key
         * @param {Object}
         *          value The value
         */
        add(key, value) {
            if (typeof key === 'string') {
                const data = this.#data, object = data[key];
                if (object === undefined) {
                    data[key] = value;
                    this.#size++;
                    return true;
                } else if (List.prototype.isPrototypeOf(object)) {
                    switch (this.#mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            for (let i = 0, l = object.length; i < l; i++) {
                                if (object[i] === value) {
                                    return false;
                                }
                            }
                            break;
                        case Mode.NoEqualValuesPerKey:
                            for (let i = 0, l = object.length; i < l; i++) {
                                if (object[i] == value) {
                                    return false;
                                }
                            }
                            break;
                        case Mode.IdenticalValuesPerKey:
                        default:
                            break;
                    }
                    object.push(value);
                    return true;
                } else {
                    switch (this.#mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            if (object === value) {
                                return false;
                            }
                            break;
                        case Mode.NoEqualValuesPerKey:
                            if (object == value) {
                                return false;
                            }
                            break;
                        case Mode.IdenticalValuesPerKey:
                        default:
                            break;
                    }
                    const list = new List();
                    list.push(object);
                    list.push(value);
                    data[key] = list;
                    return true;
                }
            } else {
                return false;
            }
        }

        put(key, value) {
            this.add(key, value);
        }

        /**
         * Get the keys
         */
        keys() {
            return Utilities.getObjectProperties(this.#data);
        }

        remove(key, value) {
            if (typeof key === 'string') {
                const data = this.#data, object = data[key];
                if (object === undefined) {
                    return false;
                } else if (List.prototype.isPrototypeOf(object)) {
                    switch (this.#mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            for (let i = 0, l = object.length; i < l; i++) {
                                if (object[i] === value) {
                                    object.splice(i, 1);
                                    if (object.length === 0) {
                                        delete data[key];
                                        this.#size--;
                                    }
                                    return true;
                                }
                            }
                            return false;
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            for (let i = 0, l = object.length; i < l; i++) {
                                const val = object[i];
                                if (val == value) {
                                    object.splice(i, 1);
                                    if (object.length === 0) {
                                        delete data[key];
                                        this.#size--;
                                    }
                                    return true;
                                }
                            }
                            return false;
                    }
                } else {
                    switch (this.#mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            if (object === value) {
                                delete data[key];
                                this.#size--;
                                return true;
                            } else {
                                return false;
                            }
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            if (object == value) {
                                delete data[key];
                                this.#size--;
                                return true;
                            } else {
                                return false;
                            }
                    }
                }
            } else {
                return false;
            }
        }

        clear() {
            this.#data = {};
            this.#size = 0;
        }

        size(key) {
            if (typeof key === 'string') {
                const data = this.#data, object = data[key];
                if (object === undefined) {
                    return 0;
                } else if (List.prototype.isPrototypeOf(object)) {
                    return object.length;
                } else {
                    return 1;
                }
            } else {
                return this.#size;
            }
        }

        getValues(key, collection) {
            if (typeof key === 'string') {
                const data = this.#data, object = data[key];
                if (object === undefined) {
                    return false;
                } else if (List.prototype.isPrototypeOf(object)) {
                    const result = collection ? collection : [];
                    for (var i = 0, l = object.length; i < l; i++) {
                        result.push(object[i]);
                    }
                    return result;
                } else {
                    const result = collection ? collection : [];
                    result.push(object);
                    return result;
                }
            } else {
                return false;
            }
        }

        containsKey(key) {
            return this.#data[key] !== undefined;
        }

        containsValue(key, value) {
            if (typeof key === 'string') {
                const data = this.#data, object = data[key];
                if (object === undefined) {
                    return false;
                } else if (List.prototype.isPrototypeOf(object)) {
                    switch (this.#mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            for (let i = 0, l = object.length; i < l; i++) {
                                if (object[i] === value) {
                                    return true;
                                }
                            }
                            return false;
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            for (let i = 0, l = object.length; i < l; i++) {
                                const val = object[i];
                                if (val == value) {
                                    return true;
                                }
                            }
                            return false;
                    }
                } else {
                    switch (this.#mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            return object === value;
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            return object == value;
                    }
                }
            } else {
                return false;
            }
        }

        selectValue(key) {
            if (typeof key === 'string') {
                const data = this.#data, object = data[key];
                if (object !== undefined) {
                    this.#selection = object;
                    return true;
                } else {
                    this.#selection = null;
                    return false;
                }
            } else {
                return false;
            }
        }

        getSelectedValueCount() {
            if (this.#selection !== null) {
                return List.prototype.isPrototypeOf(this.#selection) ? this.#selection.length : 1;
            } else {
                return -1;
            }
        }

        getSelectedValue(index) {
            if (this.#selection !== null) {
                return List.prototype.isPrototypeOf(this.#selection) ? this.#selection[index] : (index === 0 ? selthis.#selection : undefined);
            } else {
                return undefined;
            }
        }
    }

    // for historical reasons we need a constructor for each of our three types
    class IdenticalValuesPerKey extends Impl {
        constructor() {
            super(Mode.IdenticalValuesPerKey);
        }
    }
    HashLists.IdenticalValuesPerKey = IdenticalValuesPerKey;

    class NoIdenticalValuesPerKey extends Impl {
        constructor() {
            super(Mode.NoIdenticalValuesPerKey);
        }
    }
    HashLists.NoIdenticalValuesPerKey = NoIdenticalValuesPerKey;

    class NoEqualValuesPerKey extends Impl {
        constructor() {
            super(Mode.NoEqualValuesPerKey);
        }
    }
    HashLists.NoEqualValuesPerKey = NoEqualValuesPerKey;

    Object.freeze(HashLists);
    if (isNodeJS) {
        module.exports = HashLists;
    } else {
        window.HashLists = HashLists;
    }
}(globalThis));
