(function (root) {
    "use strict";
    const JsonFX = {};
    const isNodeJS = typeof require === 'function';
    const beautify_js = isNodeJS ? require('js-beautify').js : root.js_beautify;

    const standardFunctionRegex = /^\s*function\s*\(\s*(?:[_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*\{(?:.|\n)*?\}\s*$/m;
    const lambdaFunctionRegex = /^\s*\(\s*(?:[_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*=>\s*(?:(?:\{(?:.|\n)*?\})|(?:(?:.|\n)*?))\s*$/;
    const lambdaFunctionSingleArgumentRegex = /^\s*(?:[_$a-zA-Z][_$a-zA-Z0-9]*)\s*=>\s*(?:(?:\{(?:.|\n)*?\})|(?:(?:.|\n)*?))\s*$/;

    const _cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const _escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
    const _meta = Object.freeze({// table of character substitutions
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    });
    const _beautify_opts = Object.freeze({
        indent_size: 2,
        indent_char: ' ',
        max_preserve_newlines: 1,
        preserve_newlines: true,
        keep_array_indentation: false,
        break_chained_methods: false,
        indent_scripts: 'normal',
        brace_style: 'collapse', // 'expand',
        space_before_conditional: true,
        unescape_strings: false,
        jslint_happy: false,
        end_with_newline: false,
        wrap_line_length: 0,
        indent_inner_html: false,
        comma_first: false,
        e4x: false,
    });

    function addQuotes(test, slapQuotes) {
        // If the string contains no control characters, no quote characters, and no
        // backslash characters, then we can safely slap some quotes around it.
        // Otherwise we must also replace the offending characters with safe escape
        // sequences.
        _escapable.lastIndex = 0;
        let txt = '';
        if (slapQuotes) {
            txt += '"';
        }
        if (_escapable.test(test)) {
            txt += test.replace(_escapable, a => {
                const c = _meta[a];
                return typeof c === 'string' ? c : '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
            });
        } else {
            txt += test;
        }
        if (slapQuotes) {
            txt += '"';
        }
        return txt;
    }

    function getString(key, holder, pretty) {
        // Produce a string from holder[i_key].
        let i, // The loop counter.
            k, // The member key.
            v, // The member value.
            length, partial, value = holder[key];
        // What happens next depends on the value's type.
        switch (typeof value) {
            case 'string':
                return addQuotes(value, true);
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
                        partial[i] = getString(i, value, pretty) || 'null';
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
                        v = getString(k, value, pretty);
                        if (v) {
                            partial.push(addQuotes(k, !pretty) + ':' + v);
                        }
                    }
                }
                // Join all of the member texts together, separated with commas,
                // and wrap them in braces.
                v = partial.length === 0 ? '{}' : '{' + partial.join(',') + '}';
                return v;
            case 'function':
                // this is the main JsonFX feature: functions as strings
                // get the function source
                const func_str = value.toString()
                    // replace all different styles of line ending with single linefeed
                    .replace(/\r?\n|\r/g, '\n')
                    // replace tabs with whitespaces
                    .replace(/\t/g, ' ')
                    // remove leading and ending whitespaces
                    .replace(/^\s*(.+?)\s*$/gm, '$1');
                // return with or without qoutes
                return pretty ? func_str : addQuotes(func_str, true);
        }
    }

    /** Converts a value into a string
     * @param {boolean|number|string|object|array|function} value - The value for converting into a string
     * @param {boolean} pretty - If false a compact string without linebreaks as known from JSON.stringify(value) will be returned. 
     * On functions toString() will be called, all different styles of line endings will be replaced by single linefeeds, 
     * tabulators will be replaced by single whitespace, and on each line leading and ending whitespaces will be removed.
     * If true the value will be converted into multiline text. Object attribute names will be written without quotes 
     * and functions will be formatted with indentation using a beautyfier (like a programming tool would do).
     * @returns The string representation of the passed value.
     */
    function stringify(value, pretty) {
        // The stringify method takes a value and an optional replacer, and an
        // optional
        // space parameter, and returns a JSON text. The replacer can be a function
        // that can replace values, or an array of strings that will select the
        // keys.
        // A default replacer method can be provided. Use of the space parameter
        // can produce text that is more easily readable.

        // Make a fake root object containing our value under the key of ''.
        // Return the result of stringifying the value.
        const str = getString('', { '': value }, pretty === true);
        return pretty === true ? beautify_js(str, _beautify_opts) : str;
    }
    JsonFX.stringify = stringify;

    /*  Call this function recursive on each object attribute or array element.
        Transforms strings to boolean, number or function if possible.  */
    function reconstruct(object, evalFunc) {
        if (object !== undefined && object !== null) {
            if (Array.isArray(object)) { // Handle array elements by calling recursive
                for (let i = 0, l = object.length; i < l; i++) {
                    object[i] = reconstruct(object[i], evalFunc);
                }
            } else if (typeof object === 'object') { // Handle object attributes by calling recursive
                for (const attr in object) {
                    if (object.hasOwnProperty(attr)) {
                        object[attr] = reconstruct(object[attr], evalFunc);
                    }
                }
            } else if (typeof object === 'string' && object.length > 0) { // Check if boolean, number or function as string and convert
                if (isNaN(object)) {
                    if (object === 'true') {
                        object = true;
                    } else if (object === 'false') {
                        object = false;
                    } else if (standardFunctionRegex.test(object) || lambdaFunctionRegex.test(object) || lambdaFunctionSingleArgumentRegex.test(object)) {
                        try {
                            object = evalFunc ? evalFunc(object) : eval(`(${object})`);
                        } catch (error) {
                            console.error('Failed evaluating function', error);
                        }
                    }
                } else {
                    object = object.indexOf('.') !== -1 ? parseFloat(object) : parseInt(object);
                }
            }
        }
        return object;
    }
    JsonFX.reconstruct = reconstruct;

    function parse(text, sourceIsPretty, doReconstruct, evalFunc) {
        // Parsing happens in four stages. In the first stage, we replace certain
        // Unicode characters with escape sequences. JavaScript handles many
        // characters
        // incorrectly, either silently deleting them, or treating them as line
        // endings.
        let txt = String(text);
        _cx.lastIndex = 0;
        if (_cx.test(txt)) {
            txt = txt.replace(_cx, a => '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4));
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
        if (sourceIsPretty === true || /^[\],:{}\s]*$/.test(txt.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@').replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').replace(/(?:^|:|,)(?:\s*\[)+/g, ""))) {
            // In the third stage we use the eval function to compile the text into a JavaScript structure. 
            // The '{' operator is subject to a syntactic ambiguity in JavaScript: it can begin a block or an object literal. 
            // We wrap the text in parens to eliminate the ambiguity.
            const value = evalFunc ? evalFunc(txt) : eval(`(${txt})`);
            // In the optional fourth stage, we recursively walk the new structure, 
            // passing each name/value pair to a reviver function for possible transformation.
            return doReconstruct === true ? reconstruct(value, evalFunc) : value;
        }
        // If the text is not JSON parseable, then a SyntaxError is thrown.
        throw new SyntaxError('JsonFX.parse systax error');
    }
    JsonFX.parse = parse;

    Object.freeze(JsonFX);
    if (isNodeJS) {
        module.exports = JsonFX;
    }
    else {
        root.JsonFX = JsonFX;
    }
}(globalThis));
