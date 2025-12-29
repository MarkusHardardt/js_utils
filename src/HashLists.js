/**
 * Copyright (c) 2018, Markus Hardardt
 */

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
    var IDENTICAL_VALUES_PER_KEY = 1;
    var NO_IDENTICAL_VALUES_PER_KEY = 2;
    var NO_EQUAL_VALUES_PER_KEY = 3;

    // constructor for internal list structure we need only to decide if a value
    // is an array or our internal storage container
    function List() {
        // call super constructor
        Array.call(this);
    }
    // our list inherit from arrays
    List.prototype = Object.create(Array.prototype);
    List.prototype.constructor = List;

    // constructor for our hash lists implementations
    function Impl(i_mode) {
        // this makes sure we have one ouf our supported modes
        switch (i_mode) {
            case NO_IDENTICAL_VALUES_PER_KEY:
                this._mode = NO_IDENTICAL_VALUES_PER_KEY;
                break;
            case NO_EQUAL_VALUES_PER_KEY:
                this._mode = NO_EQUAL_VALUES_PER_KEY;
                break;
            case IDENTICAL_VALUES_PER_KEY:
            default:
                this._mode = IDENTICAL_VALUES_PER_KEY;
                break;
        }
        // plain javascript objects are implemented as associative arrays - so we
        // use this data object for our internal data storage
        this._data = {};
        this._size = 0;
        this._selection = undefined;
    };

    Impl.prototype = {
        /**
         * Add an entry to the list
         * 
         * @param {Object}
         *          i_key The key
         * @param {Object}
         *          i_value The value
         */
        add: function (i_key, i_value) {
            if (typeof i_key === 'string') {
                var data = this._data, object = data[i_key];
                if (object === undefined) {
                    data[i_key] = i_value;
                    this._size++;
                    return true;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    switch (this._mode) {
                        case NO_IDENTICAL_VALUES_PER_KEY:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] === i_value) {
                                    return false;
                                }
                            }
                            break;
                        case NO_EQUAL_VALUES_PER_KEY:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] == i_value) {
                                    return false;
                                }
                            }
                            break;
                        case IDENTICAL_VALUES_PER_KEY:
                        default:
                            break;
                    }
                    object.push(i_value);
                    return true;
                }
                else {
                    switch (this._mode) {
                        case NO_IDENTICAL_VALUES_PER_KEY:
                            if (object === i_value) {
                                return false;
                            }
                            break;
                        case NO_EQUAL_VALUES_PER_KEY:
                            if (object == i_value) {
                                return false;
                            }
                            break;
                        case IDENTICAL_VALUES_PER_KEY:
                        default:
                            break;
                    }
                    var list = new List();
                    list.push(object);
                    list.push(i_value);
                    data[i_key] = list;
                    return true;
                }
            }
            else {
                return false;
            }
        },
        put: function (i_key, i_value) {
            this.add(i_key, i_value);
        },
        /**
         * Get the keys
         */
        keys: function () {
            return Utilities.getObjectProperties(this._data);
        },
        remove: function (i_key, i_value) {
            if (typeof i_key === 'string') {
                var data = this._data, object = data[i_key];
                if (object === undefined) {
                    return false;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    switch (this._mode) {
                        case NO_IDENTICAL_VALUES_PER_KEY:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] === i_value) {
                                    object.splice(i, 1);
                                    if (object.length === 0) {
                                        delete data[i_key];
                                        this._size--;
                                    }
                                    return true;
                                }
                            }
                            return false;
                        case NO_EQUAL_VALUES_PER_KEY:
                        case IDENTICAL_VALUES_PER_KEY:
                        default:
                            for (var i = 0, l = object.length; i < l; i++) {
                                var value = object[i];
                                if (value == i_value) {
                                    object.splice(i, 1);
                                    if (object.length === 0) {
                                        delete data[i_key];
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
                        case NO_IDENTICAL_VALUES_PER_KEY:
                            if (object === i_value) {
                                delete data[i_key];
                                this._size--;
                                return true;
                            }
                            else {
                                return false;
                            }
                        case NO_EQUAL_VALUES_PER_KEY:
                        case IDENTICAL_VALUES_PER_KEY:
                        default:
                            if (object == i_value) {
                                delete data[i_key];
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
        },
        clear: function () {
            this._data = {};
            this._size = 0;
        },
        size: function (i_key) {
            if (typeof i_key === 'string') {
                var data = this._data, object = data[i_key];
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
        },
        getValues: function (i_key, i_collection) {
            if (typeof i_key === 'string') {
                var data = this._data, object = data[i_key];
                if (object === undefined) {
                    return false;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    var result = i_collection ? i_collection : [];
                    for (var i = 0, l = object.length; i < l; i++) {
                        result.push(object[i]);
                    }
                    return result;
                }
                else {
                    var result = i_collection ? i_collection : [];
                    result.push(object);
                    return result;
                }
            }
            else {
                return false;
            }
        },
        containsKey: function (i_key) {
            return this._data[i_key] !== undefined;
        },
        containsValue: function (i_key, i_value) {
            if (typeof i_key === 'string') {
                var data = this._data, object = data[i_key];
                if (object === undefined) {
                    return false;
                }
                else if (List.prototype.isPrototypeOf(object)) {
                    switch (this._mode) {
                        case NO_IDENTICAL_VALUES_PER_KEY:
                            for (var i = 0, l = object.length; i < l; i++) {
                                if (object[i] === i_value) {
                                    return true;
                                }
                            }
                            return false;
                        case NO_EQUAL_VALUES_PER_KEY:
                        case IDENTICAL_VALUES_PER_KEY:
                        default:
                            for (var i = 0, l = object.length; i < l; i++) {
                                var value = object[i];
                                if (value == i_value) {
                                    return true;
                                }
                            }
                            return false;
                    }
                }
                else {
                    switch (this._mode) {
                        case NO_IDENTICAL_VALUES_PER_KEY:
                            return object === i_value;
                        case NO_EQUAL_VALUES_PER_KEY:
                        case IDENTICAL_VALUES_PER_KEY:
                        default:
                            return object == i_value;
                    }
                }
            }
            else {
                return false;
            }
        },
        selectValue: function (i_key) {
            if (typeof i_key === 'string') {
                var data = this._data, object = data[i_key];
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
        },
        getSelectedValueCount: function () {
            var selection = this._selection;
            if (selection !== undefined) {
                return List.prototype.isPrototypeOf(selection) ? selection.length : 1;
            }
            else {
                return -1;
            }
        },
        getSelectedValue: function (i_index) {
            var selection = this._selection;
            if (selection !== undefined) {
                return List.prototype.isPrototypeOf(selection) ? selection[i_index] : (i_index === 0 ? selection : undefined);
            }
            else {
                return undefined;
            }
        }
    }

    // for historical reasons we need a constructor for each of our three types
    function IdenticalValuesPerKey() {
        Impl.call(this, IDENTICAL_VALUES_PER_KEY);
    }
    IdenticalValuesPerKey.prototype = Object.create(Impl.prototype);
    IdenticalValuesPerKey.prototype.constructor = IdenticalValuesPerKey;
    HashLists.IdenticalValuesPerKey = IdenticalValuesPerKey;

    function NoIdenticalValuesPerKey() {
        Impl.call(this, NO_IDENTICAL_VALUES_PER_KEY);
    }
    NoIdenticalValuesPerKey.prototype = Object.create(Impl.prototype);
    NoIdenticalValuesPerKey.prototype.constructor = NoIdenticalValuesPerKey;
    HashLists.NoIdenticalValuesPerKey = NoIdenticalValuesPerKey;

    function NoEqualValuesPerKey() {
        Impl.call(this, NO_EQUAL_VALUES_PER_KEY);
    }
    NoEqualValuesPerKey.prototype = Object.create(Impl.prototype);
    NoEqualValuesPerKey.prototype.constructor = NoEqualValuesPerKey;
    HashLists.NoEqualValuesPerKey = NoEqualValuesPerKey;

    Object.freeze(HashLists);
    if (isNodeJS) {
        module.exports = HashLists;
    } else {
        window.HashLists = HashLists;
    }
}(globalThis));
