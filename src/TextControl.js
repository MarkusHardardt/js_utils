(function (root) {
    "use strict";
    const TextControl = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    function applyTextField(that, context, disableVisuEvents, enableEditorEvents, onSuccess, onError) {
        let _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        let _textfield = undefined;
        that.hmi_getTextField = () => _textfield;
        that.hmi_value = value => {
            if (typeof value === 'string') {
                _textfield.val(value);
            } else {
                return _textfield.val();
            }
        };
        let txt = '<input';
        if (that.readonly === true || that.editable === false) {
            txt += ' readonly';
        }
        txt += ' type="';
        txt += that.password === true ? 'password' : 'text';
        txt += '" style="font-family:Courier New;width: 100%;box-sizing: border-box;"></input>';
        _textfield = $(txt);
        _textfield.appendTo(_cont);
        that.hmi_addChangeListener = listener => _textfield.bind('input propertychange', listener);
        that.hmi_removeChangeListener = listener => _textfield.unbind('input propertychange', listener);
        that._hmi_destroys.push(() => {
            _cont.empty();
            delete that.hmi_getTextField;
            delete that.hmi_value;
            _textfield = undefined;
            delete that.hmi_addChangeListener;
            delete that.hmi_removeChangeListener;
            _cont = undefined;
            that = undefined;
        });
        if (that.value !== undefined) {
            that.hmi_value(that.value);
        }
        onSuccess();
    }
    ObjectLifecycleManager.addApplyFunctionForType('textfield', applyTextField);

    function applyTextArea(that, i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        let _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        let _textarea = undefined;
        let _code = undefined;
        that.hmi_editor = () => _code ? _code : _textarea;
        that.hmi_value = value => {
            if (typeof value === 'string') {
                if (_code) {
                    let source = value, opts = undefined;
                    if (that.beautify === true) {
                        opts = {
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
                        };
                    } else if (that.beautify !== null && typeof that.beautify === 'object') {
                        opts = that.beautify;
                    }
                    if (opts) {
                        try {
                            // source = unpacker_filter(source);
                            source = that.code === 'html' ? html_beautify(source, opts) : js_beautify(source, opts);
                        } catch (error) {
                            console.error('Beautifyer failed', error);
                        }
                    }
                    _code.doc.setValue(source);
                } else {
                    _textarea.val(value);
                }
            } else {
                return _code ? _code.doc.getValue() : _textarea.val();
            }
        };
        that._hmi_resizes.push(() => {
            if (_code) {
                _code.setSize(_cont.width(), _cont.height());
            }
        });
        that.hmi_setReadOnly = readOnly => {
            if (_code) {
                _code.setOption('readOnly', readOnly === true);
            }
        };
        that.hmi_handleScrollParams = (params, restore) => {
            if (_code) {
                const par = params || {};
                let scroll_info = _code.getScrollInfo();
                if (restore === true) {
                    const container_width = typeof par.container_width === 'number' ? par.container_width : 1;
                    const container_height = typeof par.container_height === 'number' ? par.container_height : 1;
                    const viewport_width = typeof par.viewport_width === 'number' ? par.viewport_width : 1;
                    const viewport_height = typeof par.viewport_height === 'number' ? par.viewport_height : 1;
                    const viewport_left = typeof par.viewport_left === 'number' ? par.viewport_left : 0;
                    const viewport_top = typeof par.viewport_top === 'number' ? par.viewport_top : 0;
                    let left, top;
                    if (viewport_left <= 0) {
                        left = 0;
                    } else if (viewport_left >= container_width - viewport_width) {
                        left = scroll_info.width - scroll_info.clientWidth;
                    } else {
                        left = Math.floor(viewport_left / (container_width - viewport_width) * (scroll_info.width - scroll_info.clientWidth));
                    }
                    if (viewport_top <= 0) {
                        top = 0;
                    } else if (viewport_top >= container_height - viewport_height) {
                        top = scroll_info.height - scroll_info.clientHeight;
                    } else {
                        top = Math.floor(viewport_top / (container_height - viewport_height) * (scroll_info.height - scroll_info.clientHeight));
                    }
                    _code.scrollTo(left, top);
                    scroll_info = _code.getScrollInfo();
                }
                par.container_width = scroll_info.width;
                par.container_height = scroll_info.height;
                par.viewport_width = scroll_info.clientWidth;
                par.viewport_height = scroll_info.clientHeight;
                par.viewport_left = scroll_info.left;
                par.viewport_top = scroll_info.top;
                return par;
            } else {
                return false;
            }
        };
        if (false) {
            // TODO try to implement search and mark
            that.hmi_search = function (i_query, i_start, i_caseFold) {
                if (_code) {
                    const searchCursor = _code.getSearchCursor(i_query, i_start, i_caseFold);
                    console.log('');
                }
            };
        }
        let id = Utilities.getUniqueId();
        // add text area
        let txt = '<textarea';
        if (that.readonly === true || that.editable === false) {
            txt += ' readonly';
        }
        txt += ` id="${id}" style="font-family:Courier New;width: 100%; height: 100%;box-sizing: border-box;overflow: auto;"></textarea>`;
        _textarea = $(txt);
        _textarea.appendTo(_cont);
        if (typeof that.code === 'string' && that.code.length > 0) { // TODO: Migrate to CodeMirror v6 (https://codemirror.net/docs/migration/)
            let mode = undefined;
            if (that.code === 'javascript') {
                mode = {
                    name: 'javascript',
                    globalVars: true
                };
            } else if (that.code === 'html') {
                mode = {
                    name: 'xml',
                    htmlMode: true
                };
            }
            _code = CodeMirror.fromTextArea(document.getElementById(id), {
                mode: mode,
                readOnly: that.readonly === true || that.editable === false,
                lineNumbers: true,
                lineWrapping: true,
                extraKeys: { 'Ctrl-Space': 'autocomplete' },
                matchBrackets: true,
                autoCloseBrackets: true,
                highlightSelectionMatches: { showToken: /\w/, annotateScrollbar: true }
            });
            _code.setSize(_cont.width(), _cont.height());
            that.hmi_getSearchCursor = (query, start, caseFold) => _code.getSearchCursor(query, start, caseFold);
        }
        that.hmi_addChangeListener = listener => {
            if (_code) {
                _code.doc.on('change', listener);
            } else {
                _textarea.bind('input propertychange', listener);
            }
        };
        that.hmi_removeChangeListener = listener => {
            if (_code) {
                _code.doc.on('change', listener);
            } else {
                _textarea.unbind('input propertychange', listener);
            }
        };
        that._hmi_destroys.push(() => {
            _cont.empty();
            delete that.hmi_getSearchCursor;
            delete that.hmi_editor;
            delete that.hmi_value;
            id = undefined;
            _textarea = undefined;
            _code = undefined;
            delete that.hmi_addChangeListener;
            delete that.hmi_removeChangeListener;
            delete that.hmi_handleScrollParams;
            _cont = undefined;
            that = undefined;
        });
        if (that.value !== undefined) {
            that.hmi_value(that.value);
        }
        i_success();
    }
    ObjectLifecycleManager.addApplyFunctionForType('textarea', applyTextArea);

    Object.freeze(TextControl);
    if (isNodeJS) {
        module.exports = TextControl;
    } else {
        root.TextControl = TextControl;
    }
}(globalThis));
