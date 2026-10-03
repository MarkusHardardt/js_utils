import ObjectLifecycleManager from './ObjectLifecycleManager.js';
import Utilities from './Utilities.js';
import { basicSetup, EditorView } from 'codemirror';
import { Compartment } from '@codemirror/state';

const TextControl = {};

function applyTextField(that, onSuccess) {
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

function applyTextArea(that, onSuccess) {
    let _cont = that._hmi_context.container;
    _cont.addClass('overflow-hidden');
    let _textarea = undefined;
    let _code = undefined;
    const _changeListeners = new Set();
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
                _code.setValue(source);
            } else {
                _textarea.val(value);
            }
        } else {
            return _code ? _code.getValue() : _textarea.val();
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
    if (typeof that.code === 'string' && that.code.length > 0) {
        const readOnly = that.readonly === true || that.editable === false;
        const editable = new Compartment();
        let editorReadOnly = readOnly;
        const initialValue = _textarea.val();
        _textarea.remove();
        _code = new EditorView({
            doc: initialValue,
            extensions: [
                basicSetup,
                EditorView.lineWrapping,
                editable.of(EditorView.editable.of(!readOnly)),
                EditorView.updateListener.of(update => {
                    update.view.contentDOM.setAttribute('contenteditable', String(!editorReadOnly));
                    if (update.docChanged) {
                        for (const listener of _changeListeners) {
                            listener(update.view, update);
                        }
                    }
                })
            ],
            parent: _cont[0]
        });
        _code.readOnly = readOnly;
        _code.contentDOM.setAttribute('aria-readonly', String(readOnly));
        _code.getValue = () => _code.state.doc.toString();
        _code.setValue = value => _code.dispatch({
            changes: { from: 0, to: _code.state.doc.length, insert: value }
        });
        _code.setSize = (width, height) => {
            _code.dom.style.width = `${width}px`;
            _code.dom.style.height = `${height}px`;
            _code.requestMeasure();
        };
        _code.setOption = (name, value) => {
            if (name === 'readOnly') {
                editorReadOnly = value === true;
                _code.readOnly = editorReadOnly;
                _code.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!editorReadOnly)) });
                _code.contentDOM.setAttribute('aria-readonly', String(_code.readOnly));
            }
        };
        _code.getOption = name => name === 'readOnly' ? _code.readOnly : undefined;
        _code.getScrollInfo = () => ({
            width: _code.scrollDOM.scrollWidth,
            height: _code.scrollDOM.scrollHeight,
            clientWidth: _code.scrollDOM.clientWidth,
            clientHeight: _code.scrollDOM.clientHeight,
            left: _code.scrollDOM.scrollLeft,
            top: _code.scrollDOM.scrollTop
        });
        _code.scrollTo = (left, top) => _code.scrollDOM.scrollTo(left, top);
        _code.doc = {
            getValue: _code.getValue,
            setValue: _code.setValue,
            on: (event, listener) => {
                if (event === 'change') {
                    _changeListeners.add(listener);
                }
            },
            off: (event, listener) => {
                if (event === 'change') {
                    _changeListeners.delete(listener);
                }
            }
        };
        _code.on = _code.doc.on;
        _code.off = _code.doc.off;
        _code.getSearchCursor = (query, start, caseFold) => {
            const getOffset = position => {
                if (typeof position === 'number') {
                    return position;
                }
                if (position && typeof position.line === 'number') {
                    return _code.state.doc.line(position.line + 1).from + (position.ch || 0);
                }
                return 0;
            };
            const makePattern = () => {
                const flags = query instanceof RegExp ? query.flags.replace(/g/g, '') : '';
                const source = query instanceof RegExp ? query.source : String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return new RegExp(source, `${flags}${caseFold && !flags.includes('i') ? 'i' : ''}g`);
            };
            let current;
            let nextOffset = getOffset(start);
            const find = (from, before) => {
                const text = _code.getValue();
                const pattern = makePattern();
                let match, result;
                while ((match = pattern.exec(text)) !== null) {
                    if (before) {
                        if (match.index >= from) {
                            break;
                        }
                        result = match;
                    } else if (match.index >= from) {
                        result = match;
                        break;
                    }
                    if (match[0].length === 0) {
                        pattern.lastIndex++;
                    }
                }
                return result;
            };
            const positionAt = offset => {
                const line = _code.state.doc.lineAt(offset);
                return { line: line.number - 1, ch: offset - line.from };
            };
            const cursor = {
                findNext: () => {
                    current = find(nextOffset, false);
                    if (current) {
                        nextOffset = current.index + Math.max(current[0].length, 1);
                        return true;
                    }
                    return false;
                },
                findPrevious: () => {
                    const limit = current ? current.index : nextOffset;
                    current = find(limit, true);
                    if (current) {
                        nextOffset = current.index + Math.max(current[0].length, 1);
                    }
                    return !!current;
                },
                from: () => current ? positionAt(current.index) : undefined,
                to: () => current ? positionAt(current.index + current[0].length) : undefined,
                current: () => current ? current[0] : undefined,
                replace: value => {
                    if (current) {
                        _code.dispatch({ changes: { from: current.index, to: current.index + current[0].length, insert: value } });
                        current = undefined;
                    }
                }
            };
            return cursor;
        };
        that.hmi_getSearchCursor = (query, start, caseFold) => _code.getSearchCursor(query, start, caseFold);
        _code.setSize(_cont.width(), _cont.height());
    }
    that.hmi_addChangeListener = listener => {
        if (_code) {
            _changeListeners.add(listener);
        } else {
            _textarea.bind('input propertychange', listener);
        }
    };
    that.hmi_removeChangeListener = listener => {
        if (_code) {
            _changeListeners.delete(listener);
        } else {
            _textarea.unbind('input propertychange', listener);
        }
    };
    that._hmi_destroys.push(() => {
        _cont.empty();
        delete that.hmi_getSearchCursor;
        delete that.hmi_editor;
        delete that.hmi_value;
        if (_code) {
            _code.destroy();
        }
        id = undefined;
        _textarea = undefined;
        _code = undefined;
        _changeListeners.clear();
        delete that.hmi_addChangeListener;
        delete that.hmi_removeChangeListener;
        delete that.hmi_handleScrollParams;
        _cont = undefined;
        that = undefined;
    });
    if (that.value !== undefined) {
        that.hmi_value(that.value);
    }
    onSuccess();
}
ObjectLifecycleManager.addApplyFunctionForType('textarea', applyTextArea);

Object.freeze(TextControl);

export default TextControl;
