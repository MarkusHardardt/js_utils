(function (root) {
  "use strict";

  const isNodeJS = typeof require === 'function';

  var get_first_index_of_identical = function (i_array, i_value) {
    for (var i = 0, l = i_array.length; i < l; i++) {
      if (i_array[i] === i_value) {
        return i;
      }
    }
    return -1;
  };

  var equals = function (i_value1, i_value2, i_compareFunctions) {
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
      }
      else if (i_value2 === null) {
        return false;
      }
      else {
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
    }
    else if (typeof i_value1 === 'function') {
      return typeof i_compareFunctions === 'function' ? i_compareFunctions(i_value1, i_value2) : true;
    }
    else {
      return i_value1 === i_value2;
    }
  };

  /** The place holder object */
  var DNYNAMIC_LIST_DUMMY = {};

  var DynamicList = function (i_create) {
    this._create = i_create;
    this._array = [];
  };

  DynamicList.prototype = {
    /**
     * Get the object with the given index. If not exists it will be created
     * by calling the creators create method
     * 
     * @param i_index
     *          The index (must not be zero)
     * @return The object
     */
    get: function (i_index) {
      var array = this._array;
      if (i_index < 0) {
        throw new Error('EXCEPTION! Invalid index: ' + i_index);
      }
      while (i_index >= array.length) {
        array.push(DNYNAMIC_LIST_DUMMY);
      }
      var object = array[i_index];
      if (object === DNYNAMIC_LIST_DUMMY) {
        try {
          object = this._create();
          if (object === undefined || object === null || typeof object !== 'object') {
            throw new Error('Exception! Create method returns null!');
          }
          array.splice(i_index, 1, object);
        }
        catch (exc) {
          throw new Error('EXCEPTION! Cannot create_' + exc);
        }
      }
      return object;
    },
    remove: function (i_index) {
      var array = this._array;
      if (i_index >= 0 && i_index < array.length) {
        var object = array.splice(i_index, 1);
        return object !== DNYNAMIC_LIST_DUMMY ? object : undefined;
      }
      else {
        return undefined;
      }
    },
    clear: function () {
      var array = this._array;
      array.splice(0, array.length);
    },
    getCurrentSize: function () {
      return this._array.length;
    }
  };

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
  var transfer_property = function (i_arrayMode, i_source, i_target, i_key, i_pre_include_source) {
    var srcval = i_source[i_key];
    var tgtval = i_target[i_key];
    if (Array.isArray(srcval)) {
      // #1
      if (Array.isArray(tgtval)) {
        // #2
        transfer_properties(srcval, tgtval);
      }
      else {
        // #3
        if (i_arrayMode) {
          i_target[i_key] = srcval;
        }
        else {
          if (i_pre_include_source && tgtval !== undefined) {
            i_pre_include_source[i_key] = tgtval;
          }
          i_target[i_key] = srcval;
        }
      }
    }
    else if (typeof srcval === 'object') {
      // #4
      if (Array.isArray(tgtval)) {
        // #5
        if (i_arrayMode) {
          i_target[i_key] = srcval;
        }
        else {
          if (i_pre_include_source && tgtval !== undefined) {
            i_pre_include_source[i_key] = tgtval;
          }
          i_target[i_key] = srcval;
        }
      }
      else if (typeof tgtval === 'object') {
        // #6
        transfer_properties(srcval, tgtval);
      }
      else {
        // #7
        if (i_arrayMode) {
          i_target[i_key] = srcval;
        }
        else {
          if (i_pre_include_source && tgtval !== undefined) {
            i_pre_include_source[i_key] = tgtval;
          }
          i_target[i_key] = srcval;
        }
      }
    }
    else if (srcval !== undefined) {
      // #8
      if (i_arrayMode) {
        i_target[i_key] = srcval;
      }
      else {
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
   *          i_source The source object or array
   * @param {Object}
   *          i_target The target object or array
   * @param {Object}
   *          i_pre_include_source Storage object for included sources
   */
  var transfer_properties = function (i_source, i_target, i_pre_include_source) {
    var arrayMode = Array.isArray(i_source) && Array.isArray(i_target);
    if (arrayMode) {
      for (var key = 0, len = i_source.length; key < len; key++) {
        transfer_property(arrayMode, i_source, i_target, key, i_pre_include_source);
      }
    }
    else if (typeof i_source === 'object' && i_source !== null && typeof i_target === 'object' && i_target !== null) {
      for (var key in i_source) {
        if (i_source.hasOwnProperty(key)) {
          transfer_property(arrayMode, i_source, i_target, key, i_pre_include_source);
        }
      }
    }
  };

  var md5 = isNodeJS ? require('md5') : function (i_string, i_options) {
    return CryptoJS.MD5(i_string, i_options).toString(CryptoJS.enc.Hex);
  };

  // this is used for building unique ID's
  var _unique_id = 0;

  var ScrollHandler = function () {
    // nop
  };

  ScrollHandler.prototype = {
    prepare: function (i_scrollContainer, i_element) {
      this._prevContWidth = i_scrollContainer.width();
      this._prevContHeight = i_scrollContainer.height();
      this._prevElemWidth = i_element.width();
      this._prevElemHeight = i_element.height();
      this._prevScrollLeft = i_scrollContainer.scrollLeft();
      this._prevScrollTop = i_scrollContainer.scrollTop();
    },
    restore: function (i_scrollContainer, i_element) {
      // restore horizontal scroll position
      if (this._prevScrollLeft <= 0) {
        i_scrollContainer.scrollLeft(0);
      }
      else if (this._prevScrollLeft >= this._prevElemWidth - this._prevContWidth) {
        i_scrollContainer.scrollLeft(i_element.width() - i_scrollContainer.width());
      }
      else {
        var curr = i_element.width() - i_scrollContainer.width();
        var prev = this._prevElemWidth - this._prevContWidth;
        i_scrollContainer.scrollLeft(Math.floor(1.0 * this._prevScrollLeft / prev * curr));
      }
      // restore vertical scroll position
      if (this._prevScrollTop <= 0) {
        i_scrollContainer.scrollTop(0);
      }
      else if (this._prevScrollTop >= this._prevElemHeight - this._prevContHeight) {
        i_scrollContainer.scrollTop(i_element.height() - i_scrollContainer.height());
      }
      else {
        var curr = i_element.height() - i_scrollContainer.height();
        var prev = this._prevElemHeight - this._prevContHeight;
        i_scrollContainer.scrollTop(Math.floor(1.0 * this._prevScrollTop / prev * curr));
      }
    }
  };

  var createRelativeParts = function (i_param) {
    // here we store the resulting coordinates
    var coor = [];
    // if our parameter is just a simple number we create an array containig
    // equidistant parts
    if (typeof i_param === 'number') {
      var len = i_param > 0 ? i_param : 1;
      var part = 1.0 / len;
      for (var i = 0; i < len; i++) {
        coor.push(part);
      }
    }
    // in case of an array we add relative parts
    else if (i_param !== undefined && i_param !== null && $.isArray(i_param) && i_param.length > 0) {
      var validMaximaCnt = 0;
      var maximum = 0.0;
      for (var i = 0; i < i_param.length; i++) {
        if (i_param[i] > 0.0) {
          validMaximaCnt++;
          maximum += i_param[i];
        }
      }
      var invalidPart = 1.0 / i_param.length;
      var validMaxima = validMaximaCnt * invalidPart;
      for (var i = 0; i < i_param.length; i++) {
        var part = i_param[i] > 0.0 && maximum > 0 ? i_param[i] / maximum * validMaxima : invalidPart;
        coor.push(part);
      }
    }
    else {
      coor.push(1.0);
    }
    return coor;
  };

  // export
  var exp = {
    getFirstIndexOfIdentical: get_first_index_of_identical,
    equals: equals,
    getObjectProperties: function (i_object, i_properties) {
      var props = i_properties ? i_properties : [];
      for (var id in i_object) {
        if (i_object.hasOwnProperty(id)) {
          props.push(id);
        }
      }
      return props;
    },
    getObjectAttributes: function (i_object, i_attributes) {
      var attrs = i_attributes.split('.'), idx = 0, len = attrs.length, obj = i_object;
      while (idx < len) {
        if (obj === null || typeof obj !== 'object') {
          return undefined;
        }
        obj = obj[attrs[idx++]];
      }
      return obj;
    },
    DynamicList: DynamicList,
    /**
     * This method transfers all attributes from the source to the target. If
     * source and target are both arrays we iterate over all elements. If
     * source and target are both objects we iterate over all attributes. In
     * any other case, no data will be transfered.
     */
    transferProperties: transfer_properties,
    /**
     * Conpute message digest (md5 algorithm)
     */
    md5: md5,
    /**
     * Copy array
     */
    copyArray: function (i_source, i_target) {
      var array = i_target || [], i, l = i_source.length;
      for (i = 0; i < l; i++) {
        array[i] = i_source[i];
      }
      return array;
    },
    handleNotFound: function (i_sources, i_targets, i_equal, i_callback, i_backward) {
      var sidx, slen = i_sources.length, tidx, tlen = i_targets.length;
      for (sidx = 0; sidx < slen; sidx++) {
        var source = i_backward === true ? i_sources[slen - 1 - sidx] : i_sources[sidx];
        var found = false;
        for (tidx = 0; tidx < tlen; tidx++) {
          var target = i_targets[tidx];
          if (typeof i_equal === 'function' ? i_equal(source, target) : source === target) {
            found = true;
            break;
          }
        }
        if (!found) {
          try {
            i_callback(source);
          }
          catch (exc) {
            console.error('EXCEPTION! In callback: ' + exc);
          }
        }
      }
    },
    // provider for unique ids
    getUniqueId: function () {
      return 'uid' + (_unique_id++);
    },
    // scrolling
    ScrollHandler: ScrollHandler,
    // ???
    createRelativeParts: createRelativeParts,
    // timestamp
    formatTimestamp: function (i_date, i_hideMillis) {
      var txt = ('0000' + i_date.getFullYear()).slice(-4);
      txt += '-';
      txt += ('00' + (i_date.getMonth() + 1)).slice(-2);
      txt += '-';
      txt += ('00' + i_date.getDate()).slice(-2);
      txt += ' ';
      txt += ('00' + i_date.getHours()).slice(-2);
      txt += ':';
      txt += ('00' + i_date.getMinutes()).slice(-2);
      txt += ':';
      txt += ('00' + i_date.getSeconds()).slice(-2);
      if (!i_hideMillis) {
        txt += '.';
        txt += ('000' + i_date.getMilliseconds()).slice(-3);
      }
      return txt;
    },
    formatNumber: function (i_value, i_postDecimalPositions) {
      if (i_postDecimalPositions < 1 || i_postDecimalPositions > 14) {
        return i_value;
      }
      var e = Math.pow(10, i_postDecimalPositions);
      var k = (Math.round(i_value * e) / e).toString();
      if (k.indexOf('.') == -1) {
        k += '.';
      }
      k += e.toString().substring(1);
      return k.substring(0, k.indexOf('.') + i_postDecimalPositions + 1);
    },
    loadClientTextFile: function (i_callback) {
      // Note: This next code looks really ugly but unfortunatelly there
      // seems to be be no other solluting for loading an client side text
      // file into the browser.
      var that = this, input = $('<input type="file" style="display: none" />');
      input.on('change', function (i_change) {
        var reader = new FileReader();
        reader.onload = function () {
          i_callback(reader.result);
        };
        reader.readAsText(i_change.target.files[0]);
      });
      input.trigger("click");
    }
  };

  if (isNodeJS) {
    module.exports = exp;
  }
  else {
    root.utilities = exp;
  }
}(globalThis));
