/**
 * HashLists
 * 
 * HashLists is a JavaScript implementation of a provider for three different
 * types of hashtables with more than one values per key.
 * 
 * Author: Markus Hardardt <markus.hardardt@gmx.ch> Version: 1.1 Build date:
 */
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
        constructor(mode) {
            // this makes sure we have one ouf our supported modes
            switch (mode) {
                case Mode.NoIdenticalValuesPerKey:
                    this._mode = Mode.NoIdenticalValuesPerKey;
                    break;
                case Mode.NoEqualValuesPerKey:
                    this._mode = Mode.NoEqualValuesPerKey;
                    break;
                case Mode.IdenticalValuesPerKey:
                default:
                    this._mode = Mode.IdenticalValuesPerKey;
                    break;
            }
            // plain javascript objects are implemented as associative arrays - so we
            // use this data object for our internal data storage
            this._data = {};
            this._size = 0;
            this._selection = undefined;
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
                var data = this._data, object = data[key];
                if (object === undefined) {
                    data[key] = value;
                    this._size++;
                    return true;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    switch (this._mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] === value) {
                                    return false;
                                }
                            }
                            break;
                        case Mode.NoEqualValuesPerKey:
                            for (var i = 0, l = object.length; i < l; i++) {
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
                }
                else {
                    switch (this._mode) {
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
                    var list = new List();
                    list.push(object);
                    list.push(value);
                    data[key] = list;
                    return true;
                }
            }
            else {
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
            return Utilities.getObjectProperties(this._data);
        }
        remove(key, value) {
            if (typeof key === 'string') {
                var data = this._data, object = data[key];
                if (object === undefined) {
                    return false;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    switch (this._mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] === value) {
                                    object.splice(i, 1);
                                    if (object.length === 0) {
                                        delete data[key];
                                        this._size--;
                                    }
                                    return true;
                                }
                            }
                            return false;
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            for (var i = 0, l = object.length; i < l; i++) {
                                var val = object[i];
                                if (val == value) {
                                    object.splice(i, 1);
                                    if (object.length === 0) {
                                        delete data[key];
                                        this._size--;
                                    }
                                    return true;
                                }
                            }
                            return false;
                    }
                }
                else {
                    switch (this._mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            if (object === value) {
                                delete data[key];
                                this._size--;
                                return true;
                            }
                            else {
                                return false;
                            }
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            if (object == value) {
                                delete data[key];
                                this._size--;
                                return true;
                            }
                            else {
                                return false;
                            }
                    }
                }
            }
            else {
                return false;
            }
        }
        clear() {
            this._data = {};
            this._size = 0;
        }
        size(key) {
            if (typeof key === 'string') {
                var data = this._data, object = data[key];
                if (object === undefined) {
                    return 0;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    return object.length;
                }
                else {
                    return 1;
                }
            }
            else {
                return this._size;
            }
        }
        getValues(key, collection) {
            if (typeof key === 'string') {
                var data = this._data, object = data[key];
                if (object === undefined) {
                    return false;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    var result = collection ? collection : [];
                    for (var i = 0, l = object.length; i < l; i++) {
                        result.push(object[i]);
                    }
                    return result;
                }
                else {
                    var result = collection ? collection : [];
                    result.push(object);
                    return result;
                }
            }
            else {
                return false;
            }
        }
        containsKey(key) {
            return this._data[key] !== undefined;
        }
        containsValue(key, value) {
            if (typeof key === 'string') {
                var data = this._data, object = data[key];
                if (object === undefined) {
                    return false;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    switch (this._mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] === value) {
                                    return true;
                                }
                            }
                            return false;
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            for (var i = 0, l = object.length; i < l; i++) {
                                var val = object[i];
                                if (val == value) {
                                    return true;
                                }
                            }
                            return false;
                    }
                }
                else {
                    switch (this._mode) {
                        case Mode.NoIdenticalValuesPerKey:
                            return object === value;
                        case Mode.NoEqualValuesPerKey:
                        case Mode.IdenticalValuesPerKey:
                        default:
                            return object == value;
                    }
                }
            }
            else {
                return false;
            }
        }
        selectValue(key) {
            if (typeof key === 'string') {
                var data = this._data, object = data[key];
                if (object !== undefined) {
                    this._selection = object;
                    return true;
                }
                else {
                    delete this._selection;
                    return false;
                }
            }
            else {
                return false;
            }
        }
        getSelectedValueCount() {
            var selection = this._selection;
            if (selection !== undefined) {
                return List.prototype.isPrototypeOf(selection) ? selection.length : 1;
            }
            else {
                return -1;
            }
        }
        getSelectedValue(index) {
            var selection = this._selection;
            if (selection !== undefined) {
                return List.prototype.isPrototypeOf(selection) ? selection[index] : (index === 0 ? selection : undefined);
            }
            else {
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
