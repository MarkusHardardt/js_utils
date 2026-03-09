(function (root) {
    "use strict";
    const Utilities = {};
    const isNodeJS = typeof require === 'function';

    function equals(value1, value2, compareFunctions) {
        if (typeof value1 !== typeof value2) {
            return false;
        } else if (Array.isArray(value1)) {
            if (value1.length !== value2.length) {
                return false;
            }
            for (let i = 0, l = value1.length; i < l; i++) {
                if (!equals(value1[i], value2[i])) {
                    return false;
                }
            }
            return true;
        } else if (typeof value1 === 'object') {
            if (value1 === null) {
                return value2 === null;
            } else if (value2 === null) {
                return false;
            } else {
                for (const attr in value1) {
                    if (value1.hasOwnProperty(attr)) {
                        if (!equals(value1[attr], value2[attr])) {
                            return false;
                        }
                    }
                }
                for (attr in value2) {
                    if (value2.hasOwnProperty(attr)) {
                        if (!equals(value1[attr], value2[attr])) {
                            return false;
                        }
                    }
                }
                return true;
            }
        } else if (typeof value1 === 'function') {
            return typeof compareFunctions === 'function' ? compareFunctions(value1, value2) : true;
        } else {
            return value1 === value2;
        }
    }
    Utilities.equals = equals;

    /** The place holder object */
    const DNYNAMIC_LIST_DUMMY = {};

    class DynamicList {
        #create;
        #array;
        constructor(create) {
            this.#create = create;
            this.#array = [];
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
            const array = this.#array;
            if (index < 0) {
                throw new Error('EXCEPTION! Invalid index: ' + index);
            }
            while (index >= array.length) {
                array.push(DNYNAMIC_LIST_DUMMY);
            }
            let object = array[index];
            if (object === DNYNAMIC_LIST_DUMMY) {
                try {
                    object = this.#create();
                    if (object === undefined || object === null || typeof object !== 'object') {
                        throw new Error('Exception! Create method returns null!');
                    }
                    array.splice(index, 1, object);
                } catch (error) {
                    throw new Error('EXCEPTION! Cannot create_' + error);
                }
            }
            return object;
        }
        remove(index) {
            const array = this.#array;
            if (index >= 0 && index < array.length) {
                const object = array.splice(index, 1);
                return object !== DNYNAMIC_LIST_DUMMY ? object : undefined;
            } else {
                return undefined;
            }
        }
        clear() {
            const array = this.#array;
            array.splice(0, array.length);
        }
        getCurrentSize() {
            return this.#array.length;
        }
    }
    Utilities.DynamicList = DynamicList;

    function getObjectProperties(object, properties) {
        const props = properties ? properties : [];
        for (const id in object) {
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
     *          arrayMode True if source and target are arrays, false if both
     *          are objects
     * @param {Object}
     *          source The source object or array
     * @param {Object}
     *          target The target object or array
     * @param {Object}
     *          key The attribute name.
     * @param {Object}
     *          source An optional object for storing replaced attributes from
     *          our included object
     */
    function transferProperty(arrayMode, source, target, key, preIncludeSource) {
        const srcval = source[key];
        const tgtval = target[key];
        if (Array.isArray(srcval)) {
            // #1
            if (Array.isArray(tgtval)) {
                // #2
                transferProperties(srcval, tgtval);
            } else {
                // #3
                if (arrayMode) {
                    target[key] = srcval;
                } else {
                    if (preIncludeSource && tgtval !== undefined) {
                        preIncludeSource[key] = tgtval;
                    }
                    target[key] = srcval;
                }
            }
        } else if (typeof srcval === 'object') {
            // #4
            if (Array.isArray(tgtval)) {
                // #5
                if (arrayMode) {
                    target[key] = srcval;
                } else {
                    if (preIncludeSource && tgtval !== undefined) {
                        preIncludeSource[key] = tgtval;
                    }
                    target[key] = srcval;
                }
            } else if (typeof tgtval === 'object') {
                // #6
                transferProperties(srcval, tgtval);
            } else {
                // #7
                if (arrayMode) {
                    target[key] = srcval;
                } else {
                    if (preIncludeSource && tgtval !== undefined) {
                        preIncludeSource[key] = tgtval;
                    }
                    target[key] = srcval;
                }
            }
        } else if (srcval !== undefined) {
            // #8
            if (arrayMode) {
                target[key] = srcval;
            } else {
                if (preIncludeSource && tgtval !== undefined) {
                    preIncludeSource[key] = tgtval;
                }
                target[key] = srcval;
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
     *          preIncludeSource Storage object for included sources
     */
    function transferProperties(source, target, preIncludeSource) {
        const arrayMode = Array.isArray(source) && Array.isArray(target);
        if (arrayMode) {
            for (let key = 0, len = source.length; key < len; key++) {
                transferProperty(arrayMode, source, target, key, preIncludeSource);
            }
        } else if (typeof source === 'object' && source !== null && typeof target === 'object' && target !== null) {
            for (let key in source) {
                if (source.hasOwnProperty(key)) {
                    transferProperty(arrayMode, source, target, key, preIncludeSource);
                }
            }
        }
    }
    Utilities.transferProperties = transferProperties;

    const md5 = isNodeJS ? require('md5') : function (text, options) {
        return CryptoJS.MD5(text, options).toString(CryptoJS.enc.Hex);
    };
    Utilities.md5 = md5; // TODO: Replace with Server.createSHA256()  !!! WILL ONLY RUN ON SERVER SIDE !!!

    function copyArray(source, target) {
        let array = target || [];
        for (let i = 0; i < source.length; i++) {
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
                const curr = element.width() - scrollContainer.width();
                const prev = this._prevElemWidth - this._prevContWidth;
                scrollContainer.scrollLeft(Math.floor(1.0 * this._prevScrollLeft / prev * curr));
            }
            // restore vertical scroll position
            if (this._prevScrollTop <= 0) {
                scrollContainer.scrollTop(0);
            } else if (this._prevScrollTop >= this._prevElemHeight - this._prevContHeight) {
                scrollContainer.scrollTop(element.height() - scrollContainer.height());
            } else {
                const curr = element.height() - scrollContainer.height();
                const prev = this._prevElemHeight - this._prevContHeight;
                scrollContainer.scrollTop(Math.floor(1.0 * this._prevScrollTop / prev * curr));
            }
        }
    }
    Utilities.ScrollHandler = ScrollHandler;

    function createRelativeParts(param) {
        // here we store the resulting coordinates
        const coor = [];
        // if our parameter is just a simple number we create an array containig
        // equidistant parts
        if (typeof param === 'number') {
            const len = param > 0 ? param : 1;
            const part = 1.0 / len;
            for (let i = 0; i < len; i++) {
                coor.push(part);
            }
        } else if (param !== undefined && param !== null && $.isArray(param) && param.length > 0) { // in case of an array we add relative parts
            let validMaximaCnt = 0;
            let maximum = 0.0;
            for (let i = 0; i < param.length; i++) {
                if (param[i] > 0.0) {
                    validMaximaCnt++;
                    maximum += param[i];
                }
            }
            const invalidPart = 1.0 / param.length;
            const validMaxima = validMaximaCnt * invalidPart;
            for (let i = 0; i < param.length; i++) {
                const part = param[i] > 0.0 && maximum > 0 ? param[i] / maximum * validMaxima : invalidPart;
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
            const reader = new FileReader();
            reader.onload = () => onResponse(reader.result);
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
        module.exports = Utilities;
    }
    else {
        root.Utilities = Utilities;
    }
}(globalThis));
