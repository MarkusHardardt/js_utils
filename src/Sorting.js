(function (root) {
    "use strict";
    const Sorting = {};

    const isNodeJS = typeof require === 'function';

    const CompareResult = Object.freeze({
        Bigger: 1,
        Equal: 0,
        Smaller: -1
    });
    Sorting.CompareResult = CompareResult;
    Sorting.BIGGER = CompareResult.Bigger;
    Sorting.SMALLER = CompareResult.Smaller;
    Sorting.EQUAL = CompareResult.Equal;

    function compareNumber(n1, n2) {
        if (n1 > n2) {
            return CompareResult.Bigger;
        } else if (n1 < n2) {
            return CompareResult.Smaller;
        } else {
            return CompareResult.Equal;
        }
    }
    Sorting.compareNumber = compareNumber;

    function compareObjects(o1, o2, compare) {
        if (o1 === o2) {
            return CompareResult.Equal;
        } else if (typeof compare === 'function') {
            return compare(o1, o2);
        } else if (typeof o1.compareTo === 'function') {
            return o1.compareTo(o2);
        } else if (typeof o2.compareTo === 'function') {
            return -o2.compareTo(o1);
        } else {
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
        const size = array.length, negOnEq = negativeOnEqual === true;
        switch (size) {
            case 0:
                return 0;
            case 1: {
                const result = compareObjects(entry, array[0], compare);
                return negOnEq && result === 0 ? -size : result < 0 ? 0 : 1;
            }
            default: {
                let result = compareObjects(entry, array[0], compare);
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
                let next2p = 1;
                while (next2p < size) {
                    next2p += next2p;
                }
                let half = Math.floor(next2p / 2);
                result = compareObjects(entry, array[Math.floor(half)], compare);
                if (negOnEq && result === 0) {
                    return half - size;
                }
                let idx = result < 0 ? 0 : size - half;
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
    }
    Sorting.getInsertionIndex = getInsertionIndex;

    // first equal
    function getIndexOfFirstEqual(value, array, compare) {
        const idx = getInsertionIndex(value, array, true, compare);
        return idx < 0 ? idx + array.length : -1;
    }
    Sorting.getIndexOfFirstEqual = getIndexOfFirstEqual;

    function getFirstIndexOfIdentical(array, value) {
        for (let i = 0, l = array.length; i < l; i++) {
            if (array[i] === value) {
                return i;
            }
        }
        return -1;
    }
    Sorting.getFirstIndexOfIdentical = getFirstIndexOfIdentical;

    function _quicksort(array, compare, low, high) {
        let i = low;
        let j = high;
        const middle = array[Math.floor((low + high) / 2)];
        do {
            while (compareObjects(middle, array[i], compare) > 0) {
                i++;
            }
            while (compareObjects(middle, array[j], compare) < 0) {
                j--;
            }
            if (i <= j) {
                const help = array[i];
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
    Sorting.quicksort = quicksort;

    function compareStringsIgnorecase(s1, s2) {
        let idx = 0;
        const l1 = s1.length, l2 = s2.length;
        const len = l1 <= l2 ? l1 : l2;
        while (idx < len) {
            const c1 = s1.charAt(idx).toLowerCase();
            const c2 = s2.charAt(idx).toLowerCase();
            if (c1 > c2) {
                return CompareResult.Bigger;
            } else if (c1 < c2) {
                return CompareResult.Smaller;
            }
            idx++;
        }
        const dl = l1 - l2;
        return dl > 0 ? CompareResult.Bigger : (dl < 0 ? CompareResult.Smaller : CompareResult.Equal);
    }
    Sorting.compareStringsIgnorecase = compareStringsIgnorecase;

    const MINUS = 45;
    const ZERO = 48;
    const NINE = 57;

    function compareTextsAndNumbers(s1, s2, ignoreCase, signed) {
        const ic = ignoreCase === true, sg = signed == true, l1 = s1.length, l2 = s2.length;
        let o1 = 0, c1, nc1, m1, e1, nl1, ni1;
        let o2 = 0, c2, nc2, m2, e2, nl2, ni2;
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
                            } else if (c1 > ZERO && c1 <= NINE) {
                                o1++;
                                break;
                            } else {
                                break;
                            }
                        }
                    }
                    e1 = o1 + 1;
                    while (e1 < l1) {
                        c1 = s1.charCodeAt(e1);
                        if (c1 >= ZERO && c1 <= NINE) {
                            e1++;
                        } else {
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
                            } else if (c2 > ZERO && c2 <= NINE) {
                                o2++;
                                break;
                            } else {
                                break;
                            }
                        }
                    }
                    e2 = o2 + 1;
                    while (e2 < l2) {
                        c2 = s2.charCodeAt(e2);
                        if (c2 >= ZERO && c2 <= NINE) {
                            e2++;
                        } else {
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
                    } else if (nl1 < nl2) {
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
                        } else if (c1 < c2) {
                            return CompareResult.Smaller;
                        }
                        ni1++;
                        ni2++;
                    }
                    o1 = e1;
                    o2 = e2;
                } else {
                    // second is not a number
                    return CompareResult.Smaller;
                }
            } else { // first is not a number
                // second is a number
                if (c2 >= ZERO && c2 <= NINE) {
                    return CompareResult.Bigger;
                } else {
                    // second is not a number too
                    if (ic) {
                        c1 = s1.charAt(o1).toLowerCase();
                        c2 = s2.charAt(o2).toLowerCase();
                    }
                    if (c1 > c2) {
                        return CompareResult.Bigger;
                    } else if (c1 < c2) {
                        return CompareResult.Smaller;
                    }
                    o1++;
                    o2++;
                }
            }
        }
        const dl = l1 - l2;
        return dl > 0 ? CompareResult.Bigger : (dl < 0 ? CompareResult.Smaller : CompareResult.Equal);
    }
    Sorting.compareTextsAndNumbers = compareTextsAndNumbers;

    function getTextsAndNumbersCompareFunction(ignoreCase, signed, upward) {
        return function (s1, s2) {
            var res = compareTextsAndNumbers(s1, s2, ignoreCase, signed);
            return upward !== false ? res : -res;
        };
    }
    Sorting.getTextsAndNumbersCompareFunction = getTextsAndNumbersCompareFunction;

    function compareDates(d1, d2) {
        const time1 = d1.getTime(), time2 = d2.getTime();
        if (time1 < time2) {
            return CompareResult.Smaller;
        } else if (time1 > time2) {
            return CompareResult.Bigger;
        } else {
            return CompareResult.Equal;
        }
    }
    Sorting.compareDates = compareDates;

    class SortedSet {
        #noEqualObjectsAllowed;
        #compare;
        #array;
        constructor(noEqualObjectsAllowed, compare) {
            this.#noEqualObjectsAllowed = noEqualObjectsAllowed === true;
            this.#compare = compare;
            this.#array = [];
        }

        resort() {
            quicksort(this.#array, this.#compare);
        }

        set compare(value) {
            if (typeof value !== 'function') {
                throw new Error(`Invalid function ompare(o1,o2): ${value}`);
            } else {
                this.#compare = compare;
                this.resort();
            }

        }

        insert(value) {
            const idx = getInsertionIndex(value, this.#array, this.#noEqualObjectsAllowed, this.#compare);
            if (idx >= 0) {
                this.#array.splice(idx, 0, value);
            }
            return idx;
        }

        remove(value) {
            if (typeof value === 'number') {
                return this.#array.splice(value, 1);
            } else {
                const idx = getFirstIndexOfIdentical(this.#array, value);
                if (idx !== -1) {
                    return this.#array.splice(idx, 1);
                }
            }
            return null;
        }

        size() {
            return this.#array.length;
        }

        get(index) {
            return this.#array[index];
        }

        clear(offset, length) {
            const off = typeof offset === 'number' ? Math.max(offset, 0) : 0;
            const len = typeof length === 'number' ? Math.min(length, this.#array.length - off) : this.#array.length;
            this.#array.splice(off, len);
        }
    }
    Sorting.SortedSet = SortedSet;

    Object.freeze(Sorting);
    if (isNodeJS) {
        module.exports = Sorting;
    } else {
        root.Sorting = Sorting;
    }
}(globalThis));
