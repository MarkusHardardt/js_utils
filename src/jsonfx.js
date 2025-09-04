(function(root) {
  "use strict";

  const isNodeJS = typeof require === 'function';

  var _fx = /^\s*function\s*\(\s*(?:[_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*\{(?:.|\n)*?\}\s*$/m;
  var _cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  var _escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
  var _meta = {// table of character substitutions
      '\b' : '\\b',
      '\t' : '\\t',
      '\n' : '\\n',
      '\f' : '\\f',
      '\r' : '\\r',
      '"' : '\\"',
      '\\' : '\\\\'
  };
  var _beautify_opts = {
      indent_size : 2,
      indent_char : ' ',
      max_preserve_newlines : 1,
      preserve_newlines : true,
      keep_array_indentation : false,
      break_chained_methods : false,
      indent_scripts : 'normal',
      brace_style : 'collapse', // 'expand',
      space_before_conditional : true,
      unescape_strings : false,
      jslint_happy : false,
      end_with_newline : false,
      wrap_line_length : 0,
      indent_inner_html : false,
      comma_first : false,
      e4x : false,
  };

  var beautify_js = isNodeJS ? require('js-beautify').js : root.js_beautify;

  var _pretty;

  var add_quotes = function(i_string, i_slapQuotes) {
    // If the string contains no control characters, no quote characters, and no
    // backslash characters, then we can safely slap some quotes around it.
    // Otherwise we must also replace the offending characters with safe escape
    // sequences.
    _escapable.lastIndex = 0;
    var txt = '';
    if (i_slapQuotes) {
      txt += '"';
    }
    if (_escapable.test(i_string)) {
      txt += i_string.replace(_escapable, function(a) {
        var c = _meta[a];
        return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      });
    }
    else {
      txt += i_string;
    }
    if (i_slapQuotes) {
      txt += '"';
    }
    return txt;
  };

  var get_string = function(i_key, i_holder) {
    // Produce a string from holder[i_key].
    var i, // The loop counter.
    k, // The member key.
    v, // The member value.
    length, partial, value = i_holder[i_key];
    // What happens next depends on the value's type.
    switch (typeof value) {
    case 'string':
      return add_quotes(value, true);
    case 'number':
      // JSON numbers must be finite. Encode non-finite numbers as null.
      return isFinite(value) ? String(value) : 'null';
    case 'boolean':
    case 'null':
      // If the value is a boolean or null, convert it to a string. Note:
      // typeof null does not produce 'null'. The case is included here in
      // the remote chance that this gets fixed someday.
      return String(value);
      // If the type is 'object', we might be dealing with an object or an array
      // or
      // null.
    case 'object':
      // Due to a specification blunder in ECMAScript, typeof null is 'object',
      // so watch out for that case.
      if (!value) {
        return 'null';
      }
      // Make an array to hold the partial results of stringifying this object
      // value.
      partial = [];
      // Is the value an array?
      if (Array.isArray(value)) {
        // The value is an array. Stringify every element. Use null as a
        // placeholder
        // for non-JSON values.
        length = value.length;
        for (i = 0; i < length; i += 1) {
          partial[i] = get_string(i, value) || 'null';
        }
        // Join all of the elements together, separated with commas, and wrap
        // them in
        // brackets.
        v = partial.length === 0 ? '[]' : '[' + partial.join(',') + ']';
        return v;
      }
      // iterate through all of the keys in the object.
      for (k in value) {
        if (Object.prototype.hasOwnProperty.call(value, k)) {
          v = get_string(k, value);
          if (v) {
            partial.push(add_quotes(k, !_pretty) + ':' + v);
          }
        }
      }
      // Join all of the member texts together, separated with commas,
      // and wrap them in braces.
      v = partial.length === 0 ? '{}' : '{' + partial.join(',') + '}';
      return v;
    case 'function':
      // this is the main JSON'X' feature: functions as strings (added by Hm -
      // 2014)
      // get the function source
      var func_str = value.toString();
      // replace all different styles of line ending with single linefeed
      func_str = func_str.replace(/\r?\n|\r/g, '\n');
      // replace tabs with whitespaces
      func_str = func_str.replace(/\t/g, ' ');
      // remove leading and ending whitespaces
      func_str = func_str.replace(/^\s*(.+?)\s*$/gm, '$1');
      // return with or without qoutes
      return _pretty ? func_str : add_quotes(func_str, true);
    }
  };

  var stringify = function(i_value, i_pretty) {
    // The stringify method takes a value and an optional replacer, and an
    // optional
    // space parameter, and returns a JSON text. The replacer can be a function
    // that can replace values, or an array of strings that will select the
    // keys.
    // A default replacer method can be provided. Use of the space parameter
    // can
    // produce text that is more easily readable.
    var i;
    _pretty = i_pretty === true;
    // Make a fake root object containing our value under the key of ''.
    // Return the result of stringifying the value.
    var str = get_string('', {
      '' : i_value
    });
    return _pretty ? beautify_js(str, _beautify_opts) : str;
  };

  var reconstruct = function(i_object) {
    var object = i_object;
    if (object !== undefined && object !== null) {
      if (Array.isArray(object)) {
        for (var i = 0, l = object.length; i < l; i++) {
          object[i] = reconstruct(object[i]);
        }
      }
      else if (typeof object === 'object') {
        for ( var attr in object) {
          if (object.hasOwnProperty(attr)) {
            object[attr] = reconstruct(object[attr]);
          }
        }
      }
      else if (typeof object === 'string' && object.length > 0) {
        if (isNaN(object)) {
          if (object === 'true') {
            object = true;
          }
          else if (object === 'false') {
            object = false;
          }
          else if (_fx.test(object)) {
            try {
              object = eval('(' + object + ')');
            }
            catch (exc) {
              console.error('EXCEPTION! Cannot evaluate function: ' + exc);
            }
          }
        }
        else {
          object = object.indexOf('.') !== -1 ? parseFloat(object) : parseInt(object);
        }
      }
    }
    return object;
  };

  var parse = function(i_text, i_source_is_pretty, i_reconstruct) {
    // Parsing happens in four stages. In the first stage, we replace certain
    // Unicode characters with escape sequences. JavaScript handles many
    // characters
    // incorrectly, either silently deleting them, or treating them as line
    // endings.
    var text = String(i_text);
    _cx.lastIndex = 0;
    if (_cx.test(text)) {
      text = text.replace(_cx, function(a) {
        return '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
      });
    }
    // In the second stage, we run the text against regular expressions that
    // look
    // for non-JSONFX patterns. We are especially concerned with '()' and 'new'
    // because they can cause invocation, and '=' because it can cause
    // mutation.
    // But just to be safe, we want to reject all unexpected forms.

    // We split the second stage into 4 regexp operations in order to work
    // around
    // crippling inefficiencies in IE's and Safari's regexp engines. First we
    // replace the JSONFX backslash pairs with '@' (a non-JSONFX character).
    // Second, we
    // replace all simple value tokens with ']' characters. Third, we delete
    // all
    // open brackets that follow a colon or comma or that begin the text.
    // Finally,
    // we look to see that the remaining characters are only whitespace or ']'
    // or
    // ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.
    if (i_source_is_pretty === true || /^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) {
      // In the third stage we use the eval function to compile the text into a
      // JavaScript structure. The '{' operator is subject to a syntactic
      // ambiguity
      // in JavaScript: it can begin a block or an object literal. We wrap the
      // text
      // in parens to eliminate the ambiguity.
      var value = eval('(' + text + ')');
      // In the optional fourth stage, we recursively walk the new structure,
      // passing
      // each name/value pair to a reviver function for possible
      // transformation.
      return i_reconstruct === true ? reconstruct(value) : value;
    }
    // If the text is not JSON parseable, then a SyntaxError is thrown.
    throw new SyntaxError('jsonfx.parse systax error');
  };

  var exp = {
      stringify : stringify,
      parse : parse,
      reconstruct : reconstruct
  };
  if (isNodeJS) {
    module.exports = exp;
  }
  else {
    root.jsonfx = exp;
  }
}(globalThis));
