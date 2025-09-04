/**
 * Regex.js Author: Markus Hardardt <markus.hardardt@gmx.ch> Version: 1.0 Build
 * date: 2018-11-25
 */
(function (root) {
  "use strict";

  const isNodeJS = typeof require === 'function';

  var each = function (i_regex, i_text, i_callback, i_matches) {
    var res, off = 0, idx, len;
    i_regex.lastIndex = 0;
    while (res = i_regex.exec(i_text)) {
      idx = res.index;
      len = res[0].length;
      // if not only matches requested and not an empty string
      if (i_matches !== true && idx > off) {
        // call for text before next match
        i_callback(off, idx);
      }
      // if not only the parts between the matches are requested
      if (i_matches !== false) {
        // call for matched text
        i_callback(idx, idx + len, res);
      }
      off = i_regex.lastIndex;
      // if not global we do not loop
      if (i_regex.global !== true || len === 0) {
        break;
      }
    }
    // if not only matches requested and not an empty string
    if (i_matches !== true && off < i_text.length) {
      // call for text behind last match
      i_callback(off, i_text.length);
    }
  };

  var replace = function (i_regex, i_text, i_replacement) {
    var res, off = 0, txt = '', idx, len;
    i_regex.lastIndex = 0;
    while (res = i_regex.exec(i_text)) {
      idx = res.index;
      len = res[0].length;
      // if not an empty string
      if (idx > off) {
        txt += i_text.substring(off, idx);
      }
      // prepare for next loop and set behind match
      txt += typeof i_replacement === 'function' ? i_replacement(idx, idx + len, res) : i_replacement;
      off = i_regex.lastIndex;
      // if not global we do not loop
      if (i_regex.global !== true || len === 0) {
        break;
      }
    }
    // if not only an empty string left
    if (off < i_text.length) {
      txt += i_text.substring(off, i_text.length);
    }
    // return the resulting text
    return txt;
  };

  var get_next_match = function (i_text, i_elements, i_elem_idx, i_regex) {
    if (i_regex.global !== true) {
      throw new Error('EXCEPTION! Regex is not global: "' + i_regex.toString() + '"');
    }
    // if already at the end we have no match
    else if (i_elem_idx.value >= i_elements.length) {
      return null;
    }
    // get the current element and set our next search start offset to
    // the elements start
    var elem = i_elements[i_elem_idx.value], match;
    i_regex.lastIndex = elem.start;
    // while we have any matches
    while (match = i_regex.exec(i_text)) {
      while (i_elem_idx.value < i_elements.length) {
        elem = i_elements[i_elem_idx.value];
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
            while (i_elem_idx.value < i_elements.length - 1) {
              i_elem_idx.value++;
              if (i_elements[i_elem_idx.value].code) {
                break;
              }
            }
            break;
          }
        }
        else {
          // the match is behind our current element so we step forward
          i_elem_idx.value++;
        }
      }
      if (i_elem_idx.value >= i_elements.length) {
        break;
      }
      // prepare for the
      i_regex.lastIndex = i_elements[i_elem_idx.value].start;
    }
    // no more matches available
    return null;
  };

  var follow_matches = function (i_config, i_text, i_elements) {
    var elem_idx = {
      value: 0
    }, elem, match, end, id;
    var Regex = i_config.first;
    while (match = get_next_match(i_text, i_elements, elem_idx, Regex)) {
      id = typeof i_config.convertMatchToId === 'function' ? i_config.convertMatchToId(match[0]) : match[0];
      elem = i_elements[elem_idx.value];
      end = match.index + match[0].length;
      if (match.index > elem.start) {
        if (end < elem.end) {
          // #1: "codeMATCHcode"
          i_elements.splice(elem_idx.value, 0, {
            code: true,
            start: elem.start,
            end: match.index
          });
          elem_idx.value++;
          i_elements.splice(elem_idx.value, 0, id);
          elem_idx.value++;
          i_elements[elem_idx.value].start = end;
        }
        else {
          // #2: "codeMATCH"
          elem.end = match.index;
          elem_idx.value++;
          i_elements.splice(elem_idx.value, 0, id);
          elem_idx.value++;
        }
      }
      else {
        if (end < elem.end) {
          // #3: "MATCHcode"
          i_elements.splice(elem_idx.value, 0, id);
          elem_idx.value++;
          elem.start = end;
        }
        else {
          // #4: "MATCH"
          i_elements.splice(elem_idx.value, 1, id);
        }
      }
      Regex = i_config.next[id];
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
    if (i_config.finalNullRequired === true) {
      // reaching this point means we did not end successfully
      throw new Error('EXCEPTION! Unexpected end of file');
    }
    else {
      // return last match
      return id;
    }
  };

  var analyse = function (i_config, i_text, i_elements) {
    var offset = 0;
    if (i_config.comment !== undefined) {
      // first we separate code and comments
      each(i_config.comment, i_text, function (i_start, i_end, i_match) {
        // add all segments - if we got a comment match the segment represents
        // code
        i_elements.push({
          code: !i_match,
          start: i_start,
          end: i_end
        });
      });
    }
    else {
      // we start with a single segment containing all
      i_elements.push({
        code: true,
        start: 0,
        end: i_text.length
      });
    }
    // next we follow all found matches
    var final = follow_matches(i_config, i_text, i_elements);
    // finally we remove empty segments
    var idx = 0, elem, not_empty_regex = /[^\s]/gi, match;
    while (idx < i_elements.length) {
      elem = i_elements[idx];
      if (typeof elem !== 'string' && elem.code) {
        not_empty_regex.lastIndex = elem.start;
        match = not_empty_regex.exec(i_text);
        if (match && match.index < elem.end) {
          elem.start = match.index;
          idx++;
        }
        else {
          i_elements.splice(idx, 1);
        }
        continue;
      }
      idx++;
    }
    // done
    return final;
  };

  var escape = function (i_string) {
    return i_string.replace(/[-\/\\^$*+?.()|\[\]{}]/g, '\\$&');
  };

  var exp = {
    /**
     * @param i_regex:
     *          regular expression
     * @param i_text:
     *          text to proceed
     * @param i_callback:
     *          function that will be called depending on the results
     * @param i_matches:
     *          if true only matches, if false only the part between the
     *          matches, or in all other cases both type of results will be
     *          called back
     */
    each: each,
    /**
     * @param i_regex:
     *          regular expression
     * @param i_text:
     *          text to proceed
     * @param i_replacement:
     *          the replacement string or function that will be called
     */
    replace: replace,
    /**
     * @param i_config:
     *          regular expression configuration containing "comment", "first"
     *          and "next" and an optional "convertMatchToId"
     * @param i_text:
     *          text to analyse TODO add some more info
     */
    analyse: analyse,
    /**
     * Escape string for usage inside Regex
     */
    escape: escape
  };

  if (isNodeJS) {
    module.exports = exp;
  } else {
    root.Regex = exp;
  }
}(globalThis));
