(function (root) {
    "use strict";
    const Utilities = {};
    const isNodeJS = typeof require === 'function';

    function equals(i_value1, i_value2, i_compareFunctions) {
        if (typeof i_value1 !== typeof i_value2) {
            return false;
        }
        else if (Array.isArray(i_value1)) {
            if (i_value1.length !== i_value2.length) {
                return false;
            }
            for (var i = 0, l = i_value1.length; i < l; i++) {
                if (!equals(i_value1[i], i_value2[i])) {
                    return false;
                }
            }
            return true;
        }
        else if (typeof i_value1 === 'object') {
            if (i_value1 === null) {
                return i_value2 === null;
            } else if (i_value2 === null) {
                return false;
            } else {
                var attr;
                for (attr in i_value1) {
                    if (i_value1.hasOwnProperty(attr)) {
                        if (!equals(i_value1[attr], i_value2[attr])) {
                            return false;
                        }
                    }
                }
                for (attr in i_value2) {
                    if (i_value2.hasOwnProperty(attr)) {
                        if (!equals(i_value1[attr], i_value2[attr])) {
                            return false;
                        }
                    }
                }
                return true;
            }
        } else if (typeof i_value1 === 'function') {
            return typeof i_compareFunctions === 'function' ? i_compareFunctions(i_value1, i_value2) : true;
        } else {
            return i_value1 === i_value2;
        }
    }
    Utilities.equals = equals;

    /** The place holder object */
    var DNYNAMIC_LIST_DUMMY = {};

    class DynamicList {
        constructor(create) {
            this._create = create;
            this._array = [];
        }
        /**
         * Get the object with the given index. If not exists it will be created
         * by calling the creators create method
         *
         * @param index
         *          The index (must not be zero)
         * @return The object
         */
        get(index) {
            var array = this._array;
            if (index < 0) {
                throw new Error('EXCEPTION! Invalid index: ' + index);
            }
            while (index >= array.length) {
                array.push(DNYNAMIC_LIST_DUMMY);
            }
            var object = array[index];
            if (object === DNYNAMIC_LIST_DUMMY) {
                try {
                    object = this._create();
                    if (object === undefined || object === null || typeof object !== 'object') {
                        throw new Error('Exception! Create method returns null!');
                    }
                    array.splice(index, 1, object);
                } catch (exc) {
                    throw new Error('EXCEPTION! Cannot create_' + exc);
                }
            }
            return object;
        }
        remove(index) {
            var array = this._array;
            if (index >= 0 && index < array.length) {
                var object = array.splice(index, 1);
                return object !== DNYNAMIC_LIST_DUMMY ? object : undefined;
            } else {
                return undefined;
            }
        }
        clear() {
            var array = this._array;
            array.splice(0, array.length);
        }
        getCurrentSize() {
            return this._array.length;
        }
    }
    Utilities.DynamicList = DynamicList;

    function getObjectProperties(object, properties) {
        const props = properties ? properties : [];
        for (var id in object) {
            if (object.hasOwnProperty(id)) {
                props.push(id);
            }
        }
        return props;
    }
    Utilities.getObjectProperties = getObjectProperties;
    function getObjectAttributes(object, attributes) {
        let attrs = attributes.split('.'), idx = 0, len = attrs.length, obj = object;
        while (idx < len) {
            if (obj === null || typeof obj !== 'object') {
                return undefined;
            }
            obj = obj[attrs[idx++]];
        }
        return obj;
    }
    Utilities.getObjectAttributes = getObjectAttributes;

    // //////////////////////////////////////////////////////////////////////////////////////////
    // TRANSFER PROPERTIES
    // //////////////////////////////////////////////////////////////////////////////////////////

    /**
     * This method transfers the specified attribute from the source to the
     * target. If source and target attribute are both arrays we treat their
     * elements analogically. If source and target attribute are both objects we
     * transfer all primitive attributes and treat array and object attributes
     * analogically.
     * 
     * @param {boolean}
     *          i_arrayMode True if source and target are arrays, false if both
     *          are objects
     * @param {Object}
     *          i_source The source object or array
     * @param {Object}
     *          i_target The target object or array
     * @param {Object}
     *          i_key The attribute name.
     * @param {Object}
     *          i_source An optional object for storing replaced attributes from
     *          our included object
     */
    function transfer_property(i_arrayMode, i_source, i_target, i_key, i_pre_include_source) {
        var srcval = i_source[i_key];
        var tgtval = i_target[i_key];
        if (Array.isArray(srcval)) {
            // #1
            if (Array.isArray(tgtval)) {
                // #2
                transferProperties(srcval, tgtval);
            } else {
                // #3
                if (i_arrayMode) {
                    i_target[i_key] = srcval;
                } else {
                    if (i_pre_include_source && tgtval !== undefined) {
                        i_pre_include_source[i_key] = tgtval;
                    }
                    i_target[i_key] = srcval;
                }
            }
        } else if (typeof srcval === 'object') {
            // #4
            if (Array.isArray(tgtval)) {
                // #5
                if (i_arrayMode) {
                    i_target[i_key] = srcval;
                } else {
                    if (i_pre_include_source && tgtval !== undefined) {
                        i_pre_include_source[i_key] = tgtval;
                    }
                    i_target[i_key] = srcval;
                }
            } else if (typeof tgtval === 'object') {
                // #6
                transferProperties(srcval, tgtval);
            } else {
                // #7
                if (i_arrayMode) {
                    i_target[i_key] = srcval;
                } else {
                    if (i_pre_include_source && tgtval !== undefined) {
                        i_pre_include_source[i_key] = tgtval;
                    }
                    i_target[i_key] = srcval;
                }
            }
        } else if (srcval !== undefined) {
            // #8
            if (i_arrayMode) {
                i_target[i_key] = srcval;
            } else {
                if (i_pre_include_source && tgtval !== undefined) {
                    i_pre_include_source[i_key] = tgtval;
                }
                i_target[i_key] = srcval;
            }
        }
    };

    /**
     * This method transfers all attributes from the source to the target. If
     * source and target are both arrays we iterate over all elements. If source
     * and target are both objects we iterate over all attributes. In any other
     * case, no data will be transfered
     * 
     * @param {Object}
     *          source The source object or array
     * @param {Object}
     *          target The target object or array
     * @param {Object}
     *          pre_include_source Storage object for included sources
     */
    function transferProperties(source, target, pre_include_source) {
        const arrayMode = Array.isArray(source) && Array.isArray(target);
        if (arrayMode) {
            for (let key = 0, len = source.length; key < len; key++) {
                transfer_property(arrayMode, source, target, key, pre_include_source);
            }
        } else if (typeof source === 'object' && source !== null && typeof target === 'object' && target !== null) {
            for (let key in source) {
                if (source.hasOwnProperty(key)) {
                    transfer_property(arrayMode, source, target, key, pre_include_source);
                }
            }
        }
    }
    Utilities.transferProperties = transferProperties;

    var md5 = isNodeJS ? require('md5') : function (i_string, i_options) {
        return CryptoJS.MD5(i_string, i_options).toString(CryptoJS.enc.Hex);
    };
    Utilities.md5 = md5; // TODO: Replace with Server.createSHA256()  !!! WILL ONLY RUN ON SERVER SIDE !!!

    function copyArray(source, target) {
        let array = target || [], i, l = source.length;
        for (i = 0; i < l; i++) {
            array[i] = source[i];
        }
        return array;
    }
    Utilities.copyArray = copyArray;

    // provider for unique ids
    let _unique_id = 0;
    function getUniqueId() {
        return `uid${(_unique_id++)}`;
    }
    Utilities.getUniqueId = getUniqueId; // replace usage with Core.createIdGenerator(prefix)

    class ScrollHandler {
        constructor() { }
        prepare(scrollContainer, element) {
            this._prevContWidth = scrollContainer.width();
            this._prevContHeight = scrollContainer.height();
            this._prevElemWidth = element.width();
            this._prevElemHeight = element.height();
            this._prevScrollLeft = scrollContainer.scrollLeft();
            this._prevScrollTop = scrollContainer.scrollTop();
        }
        restore(scrollContainer, element) {
            // restore horizontal scroll position
            if (this._prevScrollLeft <= 0) {
                scrollContainer.scrollLeft(0);
            } else if (this._prevScrollLeft >= this._prevElemWidth - this._prevContWidth) {
                scrollContainer.scrollLeft(element.width() - scrollContainer.width());
            } else {
                var curr = element.width() - scrollContainer.width();
                var prev = this._prevElemWidth - this._prevContWidth;
                scrollContainer.scrollLeft(Math.floor(1.0 * this._prevScrollLeft / prev * curr));
            }
            // restore vertical scroll position
            if (this._prevScrollTop <= 0) {
                scrollContainer.scrollTop(0);
            } else if (this._prevScrollTop >= this._prevElemHeight - this._prevContHeight) {
                scrollContainer.scrollTop(element.height() - scrollContainer.height());
            } else {
                var curr = element.height() - scrollContainer.height();
                var prev = this._prevElemHeight - this._prevContHeight;
                scrollContainer.scrollTop(Math.floor(1.0 * this._prevScrollTop / prev * curr));
            }
        }
    }
    Utilities.ScrollHandler = ScrollHandler;

    function createRelativeParts(param) {
        // here we store the resulting coordinates
        var coor = [];
        // if our parameter is just a simple number we create an array containig
        // equidistant parts
        if (typeof param === 'number') {
            var len = param > 0 ? param : 1;
            var part = 1.0 / len;
            for (var i = 0; i < len; i++) {
                coor.push(part);
            }
        }
        // in case of an array we add relative parts
        else if (param !== undefined && param !== null && $.isArray(param) && param.length > 0) {
            var validMaximaCnt = 0;
            var maximum = 0.0;
            for (var i = 0; i < param.length; i++) {
                if (param[i] > 0.0) {
                    validMaximaCnt++;
                    maximum += param[i];
                }
            }
            var invalidPart = 1.0 / param.length;
            var validMaxima = validMaximaCnt * invalidPart;
            for (var i = 0; i < param.length; i++) {
                var part = param[i] > 0.0 && maximum > 0 ? param[i] / maximum * validMaxima : invalidPart;
                coor.push(part);
            }
        } else {
            coor.push(1.0);
        }
        return coor;
    }
    Utilities.createRelativeParts = createRelativeParts;

    function formatTimestamp(date, hideMillis) {
        let txt = ('0000' + date.getFullYear()).slice(-4);
        txt += '-';
        txt += ('00' + (date.getMonth() + 1)).slice(-2);
        txt += '-';
        txt += ('00' + date.getDate()).slice(-2);
        txt += ' ';
        txt += ('00' + date.getHours()).slice(-2);
        txt += ':';
        txt += ('00' + date.getMinutes()).slice(-2);
        txt += ':';
        txt += ('00' + date.getSeconds()).slice(-2);
        if (!hideMillis) {
            txt += '.';
            txt += ('000' + date.getMilliseconds()).slice(-3);
        }
        return txt;
    }
    Utilities.formatTimestamp = formatTimestamp;

    function formatNumber(value, postDecimalPositions) {
        if (postDecimalPositions < 1 || postDecimalPositions > 14) {
            return value;
        }
        let e = Math.pow(10, postDecimalPositions);
        let k = (Math.round(value * e) / e).toString();
        if (k.indexOf('.') == -1) {
            k += '.';
        }
        k += e.toString().substring(1);
        return k.substring(0, k.indexOf('.') + postDecimalPositions + 1);
    }
    Utilities.formatNumber = formatNumber;

    function loadClientTextFile(onResponse) {
        // Note: This next code looks really ugly but unfortunatelly there
        // seems to be be no other solluting for loading an client side text
        // file into the browser.
        let input = $('<input type="file" style="display: none" />');
        input.on('change', function (i_change) {
            var reader = new FileReader();
            reader.onload = function () {
                onResponse(reader.result);
            };
            reader.readAsText(i_change.target.files[0]);
        });
        input.trigger("click");
    }
    Utilities.loadClientTextFile = loadClientTextFile;

    Utilities.utf8Symbols = {
        ok: '✅',
        error: '❌',
        check: '✔️',
        cancel: '❌',
        info: 'ℹ️',
        warning: '⚠️',
        exclamation: '❗️',
        question: '❓',
        star: '⭐',
        starBlack: '★',
        heart: '♥',
        sun: '☀️',
        cloud: '☁️',
        phone: '☎️',
        checkboxOn: '☑️',
        checkboxOff: '☐'
    }

    Object.freeze(Utilities);
    if (isNodeJS) {
        module.Utilities = Utilities;
    }
    else {
        root.Utilities = Utilities;
    }
}(globalThis));
