(function(root) {
  "use strict";

  var BIGGER = 1;
  var EQUAL = 0;
  var SMALLER = -1;

  // store for performance reasons
  var Utilities = typeof require === 'function' ? require('./Utilities.js') : window.Utilities;
  var get_first_index_of_identical = Utilities.getFirstIndexOfIdentical;

  var compare_objects = function(i_object1, i_object2, i_compare) {
    if (i_object1 === i_object2) {
      return EQUAL;
    }
    else if (typeof i_compare === 'function') {
      return i_compare(i_object1, i_object2);
    }
    else if (typeof i_object1.compareTo === 'function') {
      return i_object1.compareTo(i_object2);
    }
    else if (typeof i_object2.compareTo === 'function') {
      return -i_object2.compareTo(i_object1);
    }
    else {
      return EQUAL;
    }
  };
  /**
   * This method returns the insertion index for the given object. The array
   * must be sorted!
   * 
   * @param {Object}
   *          i_object The object to insert
   * @param {Object}
   *          i_array The sorted array
   * @param {Object}
   *          i_negativeOnEqual If this flag is true the index will be the
   *          actual index minus the length of the array. To get the index as it
   *          should be calculate index + array.length.
   * @param {Object}
   *          i_compare The compare function for objects.
   */
  var get_insertion_index = function(i_object, i_array, i_negativeOnEqual, i_compare) {
    var size = i_array.length, negativeOnEqual = i_negativeOnEqual === true;
    switch (size) {
    case 0:
      return 0;
    case 1:
      var result = compare_objects(i_object, i_array[0], i_compare);
      if (negativeOnEqual && result === 0) {
        return -size;
      }
      return result < 0 ? 0 : 1;
    default:
      var result = compare_objects(i_object, i_array[0], i_compare);
      if (negativeOnEqual && result === 0) {
        return -size;
      }
      else if (result < 0) {
        return 0;
      }
      result = compare_objects(i_object, i_array[size - 1], i_compare);
      if (negativeOnEqual && result === 0) {
        return -1;
      }
      else if (result >= 0) {
        return size;
      }
      // the following is a simple implementation of a bisection algorithm
      var next2p = 1;
      while (next2p < size) {
        next2p += next2p;
      }
      var half = Math.floor(next2p / 2);
      result = compare_objects(i_object, i_array[Math.floor(half)], i_compare);
      if (negativeOnEqual && result === 0) {
        return half - size;
      }
      var idx = result < 0 ? 0 : size - half;
      half = Math.floor(half / 2);
      while (half > 0) {
        result = compare_objects(i_object, i_array[Math.floor(idx + half)], i_compare);
        if (negativeOnEqual && result === 0) {
          return idx + half - size;
        }
        else if (result >= 0) {
          idx += half;
        }
        half = Math.floor(half / 2);
      }
      if (negativeOnEqual && compare_objects(i_object, i_array[Math.floor(idx)], i_compare) === 0) {
        return idx - size;
      }
      idx++;
      if (negativeOnEqual && compare_objects(i_object, i_array[Math.floor(idx)], i_compare) === 0) {
        return idx - size;
      }
      return idx;
    }
  };

  var _quicksort = function(i_array, i_compare, i_low, i_high) {
    var i = i_low;
    var j = i_high;
    var middle = i_array[Math.floor((i_low + i_high) / 2)];
    do {
      while (compare_objects(middle, i_array[i], i_compare) > 0) {
        i++;
      }
      while (compare_objects(middle, i_array[j], i_compare) < 0) {
        j--;
      }
      if (i <= j) {
        var help = i_array[i];
        i_array[i] = i_array[j];
        i_array[j] = help;
        i++;
        j--;
      }
    } while (i <= j);
    if (i_low < j) {
      _quicksort(i_array, i_compare, i_low, j);
    }
    if (i < i_high) {
      _quicksort(i_array, i_compare, i, i_high);
    }
  };

  var quicksort = function(i_array, i_compare) {
    if (i_array.length > 1) {
      _quicksort(i_array, i_compare, 0, i_array.length - 1);
    }
    return i_array;
  };

  var compare_strings_ignorecase = function(i_string1, i_string2) {
    var idx = 0, l1 = i_string1.length, l2 = i_string2.length, c1, c2;
    var len = l1 <= l2 ? l1 : l2;
    while (idx < len) {
      c1 = i_string1.charAt(idx).toLowerCase();
      c2 = i_string2.charAt(idx).toLowerCase();
      if (c1 > c2) {
        return BIGGER;
      }
      else if (c1 < c2) {
        return SMALLER;
      }
      idx++;
    }
    var dl = l1 - l2;
    return dl > 0 ? BIGGER : (dl < 0 ? SMALLER : EQUAL);
  };

  var MINUS = 45;
  var ZERO = 48;
  var NINE = 57;

  var compare_texts_and_numbers = function(i_string1, i_string2, i_ignoreCase, i_signed) {
    var ic = i_ignoreCase === true, sg = i_signed == true;
    var o1 = 0, l1 = i_string1.length, c1, nc1, m1, e1, nl1, ni1;
    var o2 = 0, l2 = i_string2.length, c2, nc2, m2, e2, nl2, ni2;
    while (o1 < l1 && o2 < l2) {
      // get next character codes, check for minus and move index if required
      c1 = i_string1.charCodeAt(o1);
      m1 = sg && c1 === MINUS && o1 + 1 < l1;
      if (m1) {
        nc1 = i_string1.charCodeAt(o1 + 1);
        m1 = nc1 >= ZERO && nc1 <= NINE;
        if (m1) {
          o1++;
          c1 = nc1;
        }
      }
      c2 = i_string2.charCodeAt(o2);
      m2 = sg && c2 === MINUS && o2 + 1 < l2;
      if (m2) {
        nc2 = i_string2.charCodeAt(o2 + 1);
        m2 = nc2 >= ZERO && nc2 <= NINE;
        if (m2) {
          o2++;
          c2 = nc2;
        }
      }
      // first is a number
      if (c1 >= ZERO && c1 <= NINE) {
        // second is a number too
        if (c2 >= ZERO && c2 <= NINE) {
          // skip leading zeros and step to end of number of first string
          if (c1 === ZERO) {
            while (o1 + 1 < l1) {
              c1 = i_string1.charCodeAt(o1 + 1);
              if (c1 === ZERO) {
                o1++;
              }
              else if (c1 > ZERO && c1 <= NINE) {
                o1++;
                break;
              }
              else {
                break;
              }
            }
          }
          e1 = o1 + 1;
          while (e1 < l1) {
            c1 = i_string1.charCodeAt(e1);
            if (c1 >= ZERO && c1 <= NINE) {
              e1++;
            }
            else {
              break;
            }
          }
          // skip leading zeros and step to end of number of second string as
          // well
          if (c2 === ZERO) {
            while (o2 + 1 < l2) {
              c2 = i_string2.charCodeAt(o2 + 1);
              if (c2 === ZERO) {
                o2++;
              }
              else if (c2 > ZERO && c2 <= NINE) {
                o2++;
                break;
              }
              else {
                break;
              }
            }
          }
          e2 = o2 + 1;
          while (e2 < l2) {
            c2 = i_string2.charCodeAt(e2);
            if (c2 >= ZERO && c2 <= NINE) {
              e2++;
            }
            else {
              break;
            }
          }
          // now o1/o2 point to our first digit and e1/e2 point to the
          // first non-digit or end of string after our number
          // compute number lengths
          nl1 = e1 - o1;
          nl2 = e2 - o2;
          // handle different number lenghts
          if (nl1 > nl2) {
            return m1 ? SMALLER : BIGGER;
          }
          else if (nl1 < nl2) {
            return m2 ? BIGGER : SMALLER;
          }
          // handle equal number lenghts
          ni1 = o1;
          ni2 = o2;
          while (ni1 < e1) {
            c1 = m1 ? -i_string1.charCodeAt(ni1) : i_string1.charCodeAt(ni1);
            c2 = m2 ? -i_string2.charCodeAt(ni2) : i_string2.charCodeAt(ni2);
            if (c1 > c2) {
              return BIGGER;
            }
            else if (c1 < c2) {
              return SMALLER;
            }
            ni1++;
            ni2++;
          }
          o1 = e1;
          o2 = e2;
        }
        else {
          // second is not a number
          return SMALLER;
        }
      }
      // first is not a number
      else {
        // second is a number
        if (c2 >= ZERO && c2 <= NINE) {
          return BIGGER;
        }
        else {
          // second is not a number too
          if (ic) {
            c1 = i_string1.charAt(o1).toLowerCase();
            c2 = i_string2.charAt(o2).toLowerCase();
          }
          if (c1 > c2) {
            return BIGGER;
          }
          else if (c1 < c2) {
            return SMALLER;
          }
          o1++;
          o2++;
        }
      }
    }
    var dl = l1 - l2;
    return dl > 0 ? BIGGER : (dl < 0 ? SMALLER : EQUAL);
  };

  var SortedSet = function(i_noEqualObjectsAllowed, i_compare) {
    this._noEqualObjectsAllowed = i_noEqualObjectsAllowed === true;
    this._compare = i_compare;
    this._array = [];
  };

  SortedSet.prototype = {
      resort : function() {
        quicksort(this._array, this._compare);
      },
      setCompareFunction : function(i_compare) {
        this._compare = i_compare;
        this.resort();
      },
      insert : function(i_object) {
        var array = this._array;
        var idx = get_insertion_index(i_object, array, this._noEqualObjectsAllowed, this._compare);
        if (idx >= 0) {
          array.splice(idx, 0, i_object);
        }
        return idx;
      },
      remove : function(i_value) {
        var array = this._array;
        if (typeof i_value === 'number') {
          return array.splice(i_value, 1);
        }
        else {
          var idx = get_first_index_of_identical(array, i_value);
          if (idx !== -1) {
            return array.splice(idx, 1);
          }
        }
        return null;
      },
      size : function() {
        return this._array.length;
      },
      get : function(i_index) {
        return this._array[i_index];
      },
      clear : function(i_offset, i_length) {
        var array = this._array;
        var offset = typeof i_offset === 'number' ? Math.max(i_offset, 0) : 0;
        var length = typeof i_length === 'number' ? Math.min(i_length, array.length - offset) : array.length;
        array.splice(offset, length);
      }
  };

  var exp = {
      BIGGER : BIGGER,
      SMALLER : SMALLER,
      EQUAL : EQUAL,
      compareNumber : function(i_number1, i_number2) {
        if (i_number1 > i_number2) {
          return BIGGER;
        }
        else if (i_number1 < i_number2) {
          return SMALLER;
        }
        else {
          return EQUAL;
        }
      },
      // get the insertion index
      getInsertionIndex : get_insertion_index,
      // first equal
      getIndexOfFirstEqual : function(i_object, i_array, i_compare) {
        var idx = get_insertion_index(i_object, i_array, true, i_compare);
        return idx < 0 ? idx + i_array.length : -1;
      },
      // perform a quick sort
      quicksort : quicksort,
      // texts and numbers comparison
      compareStringsIgnorecase : compare_strings_ignorecase,
      compareTextsAndNumbers : compare_texts_and_numbers,
      getTextsAndNumbersCompareFunction : function(i_ignoreCase, i_signed, i_upward) {
        return function(i_string1, i_string2) {
          var res = compare_texts_and_numbers(i_string1, i_string2, i_ignoreCase, i_signed);
          return i_upward !== false ? res : -res;
        };
      },
      compareDates : function(i_date1, i_date2) {
        var time1 = i_date1.getTime();
        var time2 = i_date2.getTime();
        if (time1 < time2) {
          return SMALLER;
        }
        else if (time1 > time2) {
          return BIGGER;
        }
        else {
          return EQUAL;
        }
      },
      // create sorted set
      SortedSet : SortedSet
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exp;
  } else {
    root.sorting = exp;
  }
}(globalThis));
