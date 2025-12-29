/**
 * Regex.js Author: Markus Hardardt <markus.hardardt@gmx.ch> Version: 1.0 Build
 * date: 2018-11-25
 */
(function (root) {
    "use strict";
    const Regex = {};

    const isNodeJS = typeof require === 'function';

    function each(rx, text, callback, matches) {
        let match, off = 0, idx, len;
        rx.lastIndex = 0;
        while (match = rx.exec(text)) {
            idx = match.index;
            len = match[0].length;
            // if not only matches requested and not an empty string
            if (matches !== true && idx > off) {
                // call for text before next match
                callback(off, idx);
            }
            // if not only the parts between the matches are requested
            if (matches !== false) {
                // call for matched text
                callback(idx, idx + len, match);
            }
            off = rx.lastIndex;
            // if not global we do not loop
            if (rx.global !== true || len === 0) {
                break;
            }
        }
        // if not only matches requested and not an empty string
        if (matches !== true && off < text.length) {
            // call for text behind last match
            callback(off, text.length);
        }
    }
    Regex.each = each;

    function replace(rx, text, replacement) {
        let res, off = 0, txt = '', idx, len;
        rx.lastIndex = 0;
        while (res = rx.exec(text)) {
            idx = res.index;
            len = res[0].length;
            // if not an empty string
            if (idx > off) {
                txt += text.substring(off, idx);
            }
            // prepare for next loop and set behind match
            txt += typeof replacement === 'function' ? replacement(idx, idx + len, res) : replacement;
            off = rx.lastIndex;
            // if not global we do not loop
            if (rx.global !== true || len === 0) {
                break;
            }
        }
        // if not only an empty string left
        if (off < text.length) {
            txt += text.substring(off, text.length);
        }
        // return the resulting text
        return txt;
    }
    Regex.replace = replace;

    function getNextMatch(text, elements, elementIndex, rx) {
        if (rx.global !== true) {
            throw new Error('EXCEPTION! Regex is not global: "' + rx.toString() + '"');
        }
        // if already at the end we have no match
        else if (elementIndex.value >= elements.length) {
            return null;
        }
        // get the current element and set our next search start offset to
        // the elements start
        var elem = elements[elementIndex.value], match;
        rx.lastIndex = elem.start;
        // while we have any matches
        while (match = rx.exec(text)) {
            while (elementIndex.value < elements.length) {
                elem = elements[elementIndex.value];
                if (match.index + match[0].length <= elem.end) {
                    // we have a match on our current element
                    if (elem.code) {
                        // the match is on a code segment so we return it as valid match
                        return match;
                    }
                    else {
                        // the match is located inside o comment so we run the search
                        // again starting at the start position of our next found code
                        // segments
                        while (elementIndex.value < elements.length - 1) {
                            elementIndex.value++;
                            if (elements[elementIndex.value].code) {
                                break;
                            }
                        }
                        break;
                    }
                }
                else {
                    // the match is behind our current element so we step forward
                    elementIndex.value++;
                }
            }
            if (elementIndex.value >= elements.length) {
                break;
            }
            // prepare for the
            rx.lastIndex = elements[elementIndex.value].start;
        }
        // no more matches available
        return null;
    }

    function followMatches(config, text, elements) {
        var elem_idx = {
            value: 0
        }, elem, match, end, id;
        var Regex = config.first;
        while (match = getNextMatch(text, elements, elem_idx, Regex)) {
            id = typeof config.convertMatchToId === 'function' ? config.convertMatchToId(match[0]) : match[0];
            elem = elements[elem_idx.value];
            end = match.index + match[0].length;
            if (match.index > elem.start) {
                if (end < elem.end) {
                    // #1: "codeMATCHcode"
                    elements.splice(elem_idx.value, 0, {
                        code: true,
                        start: elem.start,
                        end: match.index
                    });
                    elem_idx.value++;
                    elements.splice(elem_idx.value, 0, id);
                    elem_idx.value++;
                    elements[elem_idx.value].start = end;
                }
                else {
                    // #2: "codeMATCH"
                    elem.end = match.index;
                    elem_idx.value++;
                    elements.splice(elem_idx.value, 0, id);
                    elem_idx.value++;
                }
            }
            else {
                if (end < elem.end) {
                    // #3: "MATCHcode"
                    elements.splice(elem_idx.value, 0, id);
                    elem_idx.value++;
                    elem.start = end;
                }
                else {
                    // #4: "MATCH"
                    elements.splice(elem_idx.value, 1, id);
                }
            }
            Regex = config.next[id];
            if (Regex === null) {
                return id;
            }
            else if (Regex === undefined) {
                throw new Error('EXCEPTION! Unexpected match: "' + match[0] + '" at index: ' + match.index);
            }
            else if (Regex.global !== true) {
                throw new Error('EXCEPTION! Regex is not global: "' + Regex.toString() + '"');
            }
        }
        if (config.finalNullRequired === true) {
            // reaching this point means we did not end successfully
            throw new Error('EXCEPTION! Unexpected end of file');
        }
        else {
            // return last match
            return id;
        }
    }

    function analyse(config, text, elements) {
        var offset = 0;
        if (config.comment !== undefined) {
            // first we separate code and comments
            each(config.comment, text, function (i_start, i_end, i_match) {
                // add all segments - if we got a comment match the segment represents
                // code
                elements.push({
                    code: !i_match,
                    start: i_start,
                    end: i_end
                });
            });
        }
        else {
            // we start with a single segment containing all
            elements.push({
                code: true,
                start: 0,
                end: text.length
            });
        }
        // next we follow all found matches
        var final = followMatches(config, text, elements);
        // finally we remove empty segments
        var idx = 0, elem, not_empty_regex = /[^\s]/gi, match;
        while (idx < elements.length) {
            elem = elements[idx];
            if (typeof elem !== 'string' && elem.code) {
                not_empty_regex.lastIndex = elem.start;
                match = not_empty_regex.exec(text);
                if (match && match.index < elem.end) {
                    elem.start = match.index;
                    idx++;
                }
                else {
                    elements.splice(idx, 1);
                }
                continue;
            }
            idx++;
        }
        // done
        return final;
    }
    Regex.analyse = analyse;

    function escape(text) {
        return text.replace(/[-\/\\^$*+?.()|\[\]{}]/g, '\\$&');
    }
    Regex.escape = escape;

    Object.freeze(Regex);
    if (isNodeJS) {
        module.exports = Regex;
    } else {
        root.Regex = Regex;
    }
}(globalThis));
