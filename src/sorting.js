(function (root) {
  "use strict";

  var BIGGER = 1;
  var EQUAL = 0;
  var SMALLER = -1;

  // store for performance reasons

  var utilities = typeof module !== "undefined" && module.exports ? require('./utilities') : root.utilities;
  var get_first_index_of_identical = utilities.getFirstIndexOfIdentical;

  var compare_objects = function (object1, object2, compare) {
    if (object1 === object2) {
      return EQUAL;
    }
    else if (typeof compare === 'function') {
      return compare(object1, object2);
    }
    else if (typeof object1.compareTo === 'function') {
      return object1.compareTo(object2);
    }
    else if (typeof object2.compareTo === 'function') {
      return -object2.compareTo(object1);
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
   *          value The object to insert
   * @param {Object}
   *          array The sorted array
   * @param {Object}
   *          negativeOnEqual If this flag is true the index will be the
   *          actual index minus the length of the array. To get the index as it
   *          should be calculate index + array.length.
   * @param {Object}
   *          compare The compare function for objects.
   */
  var get_insertion_index = function (value, array, negativeOnEqual, compare) {
    var size = array.length, negativeOnEqual = negativeOnEqual === true;
    switch (size) {
      case 0:
        return 0;
      case 1:
        var result = compare_objects(value, array[0], compare);
        if (negativeOnEqual && result === 0) {
          return -size;
        }
        return result < 0 ? 0 : 1;
      default:
        var result = compare_objects(value, array[0], compare);
        if (negativeOnEqual && result === 0) {
          return -size;
        }
        else if (result < 0) {
          return 0;
        }
        result = compare_objects(value, array[size - 1], compare);
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
        result = compare_objects(value, array[Math.floor(half)], compare);
        if (negativeOnEqual && result === 0) {
          return half - size;
        }
        var idx = result < 0 ? 0 : size - half;
        half = Math.floor(half / 2);
        while (half > 0) {
          result = compare_objects(value, array[Math.floor(idx + half)], compare);
          if (negativeOnEqual && result === 0) {
            return idx + half - size;
          }
          else if (result >= 0) {
            idx += half;
          }
          half = Math.floor(half / 2);
        }
        if (negativeOnEqual && compare_objects(value, array[Math.floor(idx)], compare) === 0) {
          return idx - size;
        }
        idx++;
        if (negativeOnEqual && compare_objects(value, array[Math.floor(idx)], compare) === 0) {
          return idx - size;
        }
        return idx;
    }
  };

  var quicksort_recursion = function (array, compare, low, high) {
    var i = low;
    var j = high;
    var middle = array[Math.floor((low + high) / 2)];
    do {
      while (compare_objects(middle, array[i], compare) > 0) {
        i++;
      }
      while (compare_objects(middle, array[j], compare) < 0) {
        j--;
      }
      if (i <= j) {
        var help = array[i];
        array[i] = array[j];
        array[j] = help;
        i++;
        j--;
      }
    } while (i <= j);
    if (low < j) {
      quicksort_recursion(array, compare, low, j);
    }
    if (i < high) {
      quicksort_recursion(array, compare, i, high);
    }
  };

  var quicksort = function (array, compare) {
    if (array.length > 1) {
      quicksort_recursion(array, compare, 0, array.length - 1);
    }
    return array;
  };

  var compare_strings_ignorecase = function (string1, string2) {
    var idx = 0, l1 = string1.length, l2 = string2.length, c1, c2;
    var len = l1 <= l2 ? l1 : l2;
    while (idx < len) {
      c1 = string1.charAt(idx).toLowerCase();
      c2 = string2.charAt(idx).toLowerCase();
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

  var compare_texts_and_numbers = function (string1, string2, ignoreCase, signed) {
    var ic = ignoreCase === true, sg = signed == true;
    var o1 = 0, l1 = string1.length, c1, nc1, m1, e1, nl1, ni1;
    var o2 = 0, l2 = string2.length, c2, nc2, m2, e2, nl2, ni2;
    while (o1 < l1 && o2 < l2) {
      // get next character codes, check for minus and move index if required
      c1 = string1.charCodeAt(o1);
      m1 = sg && c1 === MINUS && o1 + 1 < l1;
      if (m1) {
        nc1 = string1.charCodeAt(o1 + 1);
        m1 = nc1 >= ZERO && nc1 <= NINE;
        if (m1) {
          o1++;
          c1 = nc1;
        }
      }
      c2 = string2.charCodeAt(o2);
      m2 = sg && c2 === MINUS && o2 + 1 < l2;
      if (m2) {
        nc2 = string2.charCodeAt(o2 + 1);
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
              c1 = string1.charCodeAt(o1 + 1);
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
            c1 = string1.charCodeAt(e1);
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
              c2 = string2.charCodeAt(o2 + 1);
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
            c2 = string2.charCodeAt(e2);
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
            c1 = m1 ? -string1.charCodeAt(ni1) : string1.charCodeAt(ni1);
            c2 = m2 ? -string2.charCodeAt(ni2) : string2.charCodeAt(ni2);
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
            c1 = string1.charAt(o1).toLowerCase();
            c2 = string2.charAt(o2).toLowerCase();
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

  var SortedSet = function (noEqualObjectsAllowed, compare) {
    this._noEqualObjectsAllowed = noEqualObjectsAllowed === true;
    this._compare = compare;
    this._array = [];
  };

  SortedSet.prototype = {
    resort: function () {
      quicksort(this._array, this._compare);
    },
    setCompareFunction: function (compare) {
      this._compare = compare;
      this.resort();
    },
    insert: function (value) {
      var array = this._array;
      var idx = get_insertion_index(value, array, this._noEqualObjectsAllowed, this._compare);
      if (idx >= 0) {
        array.splice(idx, 0, value);
      }
      return idx;
    },
    remove: function (value) {
      var array = this._array;
      if (typeof value === 'number') {
        return array.splice(value, 1);
      }
      else {
        var idx = get_first_index_of_identical(array, value);
        if (idx !== -1) {
          return array.splice(idx, 1);
        }
      }
      return null;
    },
    size: function () {
      return this._array.length;
    },
    get: function (index) {
      return this._array[index];
    },
    clear: function (offset, length) {
      var array = this._array;
      var offset = typeof offset === 'number' ? Math.max(offset, 0) : 0;
      var length = typeof length === 'number' ? Math.min(length, array.length - offset) : array.length;
      array.splice(offset, length);
    }
  };

  var exp = {
    BIGGER: BIGGER,
    SMALLER: SMALLER,
    EQUAL: EQUAL,
    compareNumber: function (i_number1, i_number2) {
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
    getInsertionIndex: get_insertion_index,
    // first equal
    getIndexOfFirstEqual: function (value, array, compare) {
      var idx = get_insertion_index(value, array, true, compare);
      return idx < 0 ? idx + array.length : -1;
    },
    // perform a quick sort
    quicksort: quicksort,
    // texts and numbers comparison
    compareStringsIgnorecase: compare_strings_ignorecase,
    compareTextsAndNumbers: compare_texts_and_numbers,
    getTextsAndNumbersCompareFunction: function (ignoreCase, signed, upward) {
      return function (i_string1, i_string2) {
        var res = compare_texts_and_numbers(i_string1, i_string2, ignoreCase, signed);
        return upward !== false ? res : -res;
      };
    },
    compareDates: function (date1, date2) {
      var time1 = date1.getTime();
      var time2 = date2.getTime();
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
    SortedSet: SortedSet
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exp;
  } else {
    root.sorting = exp;
  }
}(globalThis));
