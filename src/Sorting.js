(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const Utilities = isNodeJS ? require('./Utilities') : root.Utilities;

    const CompareResult = Object.freeze({
        Bigger: 1,
        Equal: 0,
        Smaller: -1
    });

    function compareObjects(o1, o2, compare) {
        if (o1 === o2) {
            return CompareResult.Equal;
        }
        else if (typeof compare === 'function') {
            return compare(o1, o2);
        }
        else if (typeof o1.compareTo === 'function') {
            return o1.compareTo(o2);
        }
        else if (typeof o2.compareTo === 'function') {
            return -o2.compareTo(o1);
        }
        else {
            return CompareResult.Equal;
        }
    }

    /**
     * This method returns the insertion index for the given object. The array
     * must be sorted!
     * 
     * @param {Object}
     *          entry The object to insert
     * @param {Object}
     *          array The sorted array
     * @param {Object}
     *          negativeOnEqual If this flag is true the index will be the
     *          actual index minus the length of the array. To get the index as it
     *          should be calculate index + array.length.
     * @param {Object}
     *          compare The compare function for objects.
     */
    function getInsertionIndex(entry, array, negativeOnEqual, compare) {
        var size = array.length, negOnEq = negativeOnEqual === true;
        switch (size) {
            case 0:
                return 0;
            case 1:
                var result = compareObjects(entry, array[0], compare);
                return negOnEq && result === 0 ? -size : result < 0 ? 0 : 1;
            default:
                var result = compareObjects(entry, array[0], compare);
                if (negOnEq && result === 0) {
                    return -size;
                } else if (result < 0) {
                    return 0;
                }
                result = compareObjects(entry, array[size - 1], compare);
                if (negOnEq && result === 0) {
                    return -1;
                } else if (result >= 0) {
                    return size;
                }
                // the following is a simple implementation of a bisection algorithm
                var next2p = 1;
                while (next2p < size) {
                    next2p += next2p;
                }
                var half = Math.floor(next2p / 2);
                result = compareObjects(entry, array[Math.floor(half)], compare);
                if (negOnEq && result === 0) {
                    return half - size;
                }
                var idx = result < 0 ? 0 : size - half;
                half = Math.floor(half / 2);
                while (half > 0) {
                    result = compareObjects(entry, array[Math.floor(idx + half)], compare);
                    if (negOnEq && result === 0) {
                        return idx + half - size;
                    } else if (result >= 0) {
                        idx += half;
                    }
                    half = Math.floor(half / 2);
                }
                if (negOnEq && compareObjects(entry, array[Math.floor(idx)], compare) === 0) {
                    return idx - size;
                }
                idx++;
                if (negOnEq && compareObjects(entry, array[Math.floor(idx)], compare) === 0) {
                    return idx - size;
                }
                return idx;
        }
    }

    function _quicksort(array, compare, low, high) {
        var i = low;
        var j = high;
        var middle = array[Math.floor((low + high) / 2)];
        do {
            while (compareObjects(middle, array[i], compare) > 0) {
                i++;
            }
            while (compareObjects(middle, array[j], compare) < 0) {
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
            _quicksort(array, compare, low, j);
        }
        if (i < high) {
            _quicksort(array, compare, i, high);
        }
    }

    function quicksort(array, compare) {
        if (array.length > 1) {
            _quicksort(array, compare, 0, array.length - 1);
        }
        return array;
    }

    function compareStringsIgnorecase(s1, s2) {
        var idx = 0, l1 = s1.length, l2 = s2.length, c1, c2;
        var len = l1 <= l2 ? l1 : l2;
        while (idx < len) {
            c1 = s1.charAt(idx).toLowerCase();
            c2 = s2.charAt(idx).toLowerCase();
            if (c1 > c2) {
                return CompareResult.Bigger;
            } else if (c1 < c2) {
                return CompareResult.Smaller;
            }
            idx++;
        }
        var dl = l1 - l2;
        return dl > 0 ? CompareResult.Bigger : (dl < 0 ? CompareResult.Smaller : CompareResult.Equal);
    }

    const MINUS = 45;
    const ZERO = 48;
    const NINE = 57;

    function compareTextsAndNumbers(s1, s2, ignoreCase, signed) {
        var ic = ignoreCase === true, sg = signed == true;
        var o1 = 0, l1 = s1.length, c1, nc1, m1, e1, nl1, ni1;
        var o2 = 0, l2 = s2.length, c2, nc2, m2, e2, nl2, ni2;
        while (o1 < l1 && o2 < l2) {
            // get next character codes, check for minus and move index if required
            c1 = s1.charCodeAt(o1);
            m1 = sg && c1 === MINUS && o1 + 1 < l1;
            if (m1) {
                nc1 = s1.charCodeAt(o1 + 1);
                m1 = nc1 >= ZERO && nc1 <= NINE;
                if (m1) {
                    o1++;
                    c1 = nc1;
                }
            }
            c2 = s2.charCodeAt(o2);
            m2 = sg && c2 === MINUS && o2 + 1 < l2;
            if (m2) {
                nc2 = s2.charCodeAt(o2 + 1);
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
                            c1 = s1.charCodeAt(o1 + 1);
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
                        c1 = s1.charCodeAt(e1);
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
                            c2 = s2.charCodeAt(o2 + 1);
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
                        c2 = s2.charCodeAt(e2);
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
                        return m1 ? CompareResult.Smaller : CompareResult.Bigger;
                    }
                    else if (nl1 < nl2) {
                        return m2 ? CompareResult.Bigger : CompareResult.Smaller;
                    }
                    // handle equal number lenghts
                    ni1 = o1;
                    ni2 = o2;
                    while (ni1 < e1) {
                        c1 = m1 ? -s1.charCodeAt(ni1) : s1.charCodeAt(ni1);
                        c2 = m2 ? -s2.charCodeAt(ni2) : s2.charCodeAt(ni2);
                        if (c1 > c2) {
                            return CompareResult.Bigger;
                        }
                        else if (c1 < c2) {
                            return CompareResult.Smaller;
                        }
                        ni1++;
                        ni2++;
                    }
                    o1 = e1;
                    o2 = e2;
                }
                else {
                    // second is not a number
                    return CompareResult.Smaller;
                }
            }
            // first is not a number
            else {
                // second is a number
                if (c2 >= ZERO && c2 <= NINE) {
                    return CompareResult.Bigger;
                }
                else {
                    // second is not a number too
                    if (ic) {
                        c1 = s1.charAt(o1).toLowerCase();
                        c2 = s2.charAt(o2).toLowerCase();
                    }
                    if (c1 > c2) {
                        return CompareResult.Bigger;
                    }
                    else if (c1 < c2) {
                        return CompareResult.Smaller;
                    }
                    o1++;
                    o2++;
                }
            }
        }
        var dl = l1 - l2;
        return dl > 0 ? CompareResult.Bigger : (dl < 0 ? CompareResult.Smaller : CompareResult.Equal);
    }

    var SortedSet = function (i_noEqualObjectsAllowed, i_compare) {
        this._noEqualObjectsAllowed = i_noEqualObjectsAllowed === true;
        this._compare = i_compare;
        this._array = [];
    };

    SortedSet.prototype = {
        resort: function () {
            quicksort(this._array, this._compare);
        },
        setCompareFunction: function (i_compare) {
            this._compare = i_compare;
            this.resort();
        },
        insert: function (i_object) {
            var array = this._array;
            var idx = getInsertionIndex(i_object, array, this._noEqualObjectsAllowed, this._compare);
            if (idx >= 0) {
                array.splice(idx, 0, i_object);
            }
            return idx;
        },
        remove: function (i_value) {
            var array = this._array;
            if (typeof i_value === 'number') {
                return array.splice(i_value, 1);
            }
            else {
                var idx = Utilities.getFirstIndexOfIdentical(array, i_value);
                if (idx !== -1) {
                    return array.splice(idx, 1);
                }
            }
            return null;
        },
        size: function () {
            return this._array.length;
        },
        get: function (i_index) {
            return this._array[i_index];
        },
        clear: function (i_offset, i_length) {
            var array = this._array;
            var offset = typeof i_offset === 'number' ? Math.max(i_offset, 0) : 0;
            var length = typeof i_length === 'number' ? Math.min(i_length, array.length - offset) : array.length;
            array.splice(offset, length);
        }
    };

    var exp = {
        CompareResult.Bigger: CompareResult.Bigger,
        CompareResult.Smaller: CompareResult.Smaller,
        CompareResult.Equal: CompareResult.Equal,
        compareNumber: function (i_number1, i_number2) {
            if (i_number1 > i_number2) {
                return CompareResult.Bigger;
            }
            else if (i_number1 < i_number2) {
                return CompareResult.Smaller;
            }
            else {
                return CompareResult.Equal;
            }
        },
        // get the insertion index
        getInsertionIndex: getInsertionIndex,
        // first equal
        getIndexOfFirstEqual: function (i_object, i_array, i_compare) {
            var idx = getInsertionIndex(i_object, i_array, true, i_compare);
            return idx < 0 ? idx + i_array.length : -1;
        },
        // perform a quick sort
        quicksort: quicksort,
        // texts and numbers comparison
        compareStringsIgnorecase: compareStringsIgnorecase,
        compareTextsAndNumbers: compareTextsAndNumbers,
        getTextsAndNumbersCompareFunction: function (i_ignoreCase, i_signed, i_upward) {
            return function (i_string1, i_string2) {
                var res = compareTextsAndNumbers(i_string1, i_string2, i_ignoreCase, i_signed);
                return i_upward !== false ? res : -res;
            };
        },
        compareDates: function (i_date1, i_date2) {
            var time1 = i_date1.getTime();
            var time2 = i_date2.getTime();
            if (time1 < time2) {
                return CompareResult.Smaller;
            }
            else if (time1 > time2) {
                return CompareResult.Bigger;
            }
            else {
                return CompareResult.Equal;
            }
        },
        // create sorted set
        SortedSet: SortedSet
    };

    if (isNodeJS) {
        module.exports = exp;
    } else {
        root.Sorting = exp;
    }
}(globalThis));
