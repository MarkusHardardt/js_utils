import Executor from './Executor.js';
import JsonFX from './JsonFX.js';
import Regex from './Regex.js';
import Sorting from './Sorting.js';
import Utilities from './Utilities.js';
import Client from './Client.js';
import Core from './Core.js';
import HashLists from './HashLists.js';
import Mathematics from './Mathematics.js';
import Common from './Common.js';
import ObjectLifecycleManager from './ObjectLifecycleManager.js';
import Access from './Access.js';
import Logger from './Logger.js';
import ContentManager from './ContentManager.js';
import { basicSetup, EditorView } from 'codemirror';
import { Compartment, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { Decoration, ViewPlugin } from '@codemirror/view';
import { html } from '@codemirror/lang-html';
import { javascript, javascriptLanguage, scopeCompletionSource } from '@codemirror/lang-javascript';
import { SearchQuery, search } from '@codemirror/search';

const TextControl = {};
const autocompleteScope = {
    Executor,
    JsonFX,
    Regex,
    Sorting,
    Utilities,
    Client,
    Core,
    HashLists,
    Mathematics,
    Common,
    ObjectLifecycleManager,
    Access,
    Logger,
    ContentManager
};

const setTextSearch = StateEffect.define();
function createTextSearchQuery(searchText) {
    return new SearchQuery({
        search: searchText,
        caseSensitive: false,
        literal: true,
        regexp: false,
        wholeWord: false
    });
}
const textSearch = StateField.define({
    create: () => '',
    update: (value, transaction) => {
        for (const effect of transaction.effects) {
            if (effect.is(setTextSearch)) {
                value = effect.value;
            }
        }
        return value;
    }
});
const textSearchMark = Decoration.mark({ class: 'cm-hmi-searchMatch' });
const textSearchHighlight = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = this.highlight(view);
    }
    update(update) {
        if (update.docChanged || update.viewportChanged ||
            update.startState.field(textSearch) !== update.state.field(textSearch)) {
            this.decorations = this.highlight(update.view);
        }
    }
    highlight(view) {
        const searchText = view.state.field(textSearch);
        if (!searchText) {
            return Decoration.none;
        }
        const query = createTextSearchQuery(searchText);
        const decorations = new RangeSetBuilder();
        const ranges = view.visibleRanges;
        for (let i = 0; i < ranges.length; i++) {
            let { from, to } = ranges[i];
            while (i < ranges.length - 1 && to > ranges[i + 1].from - 2 * searchText.length) {
                to = ranges[++i].to;
            }
            const cursor = query.getCursor(view.state, Math.max(0, from - searchText.length),
                Math.min(view.state.doc.length, to + searchText.length));
            let match;
            while (!(match = cursor.next()).done) {
                decorations.add(match.value.from, match.value.to, textSearchMark);
            }
        }
        return decorations.finish();
    }
}, {
    decorations: plugin => plugin.decorations
});
const textSearchTheme = EditorView.baseTheme({
    '.cm-hmi-searchMatch': { backgroundColor: '#ffff0054' },
    '&dark .cm-hmi-searchMatch': { backgroundColor: '#00ffff8a' }
});

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
    let _searchScrollPending = false;
    const _changeListeners = new Set();
    const scrollToFirstSearchMatch = () => {
        if (!_code) {
            return false;
        }
        const searchText = _code.state.field(textSearch);
        if (!searchText) {
            _searchScrollPending = false;
            return false;
        }
        const cursor = _code.getSearchCursor(searchText, 0, true);
        if (!cursor.findNext()) {
            return false;
        }
        const position = cursor.from();
        const offset = _code.state.doc.line(position.line + 1).from + position.ch;
        _searchScrollPending = false;
        _code.dispatch({
            effects: EditorView.scrollIntoView(offset, { y: 'center' })
        });
        return true;
    };
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
    that.hmi_getScrolling = () => {
        if (_code) {
            const scrollLeftMax = _code.scrollDOM.scrollWidth - _code.scrollDOM.clientWidth;
            const left = scrollLeftMax > 0 ? _code.scrollDOM.scrollLeft / scrollLeftMax : 0.0;
            const scrollTopMax = _code.scrollDOM.scrollHeight - _code.scrollDOM.clientHeight;
            const top = scrollTopMax > 0 ? _code.scrollDOM.scrollTop / scrollTopMax : 0.0;
            return left > 0 || top > 0 ? { left, top } : null;
        } else {
            return null;
        }
    };
    that.hmi_setScrolling = scrolling => {
        if (_code) {
            const scrollLeftMax = _code.scrollDOM.scrollWidth - _code.scrollDOM.clientWidth;
            const left = scrolling ? scrolling.left * scrollLeftMax : 0;
            const scrollTopMax = _code.scrollDOM.scrollHeight - _code.scrollDOM.clientHeight;
            const top = scrolling ? scrolling.top * scrollTopMax : 0;
            _code.scrollDOM.scrollTo(Math.max(0, Math.min(scrollLeftMax, Math.floor(left))), Math.max(0, Math.min(scrollTopMax, Math.floor(top))));
        }
    };
    that.hmi_searchText = text => {
        if (_code) {
            const searchText = typeof text === 'string' ? text : '';
            _searchScrollPending = searchText.length > 0;
            _code.dispatch({
                effects: setTextSearch.of(searchText)
            });
            scrollToFirstSearchMatch();
        }
    };
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
        const language = that.code === 'javascript'
            ? [
                javascript(),
                javascriptLanguage.data.of({
                    autocomplete: scopeCompletionSource(Object.assign(Object.create(globalThis), autocompleteScope))
                })
            ]
            : html();
        const initialValue = _textarea.val();
        _textarea.remove();
        _code = new EditorView({
            doc: initialValue,
            extensions: [
                basicSetup,
                search(),
                textSearch,
                textSearchHighlight,
                textSearchTheme,
                language,
                EditorView.lineWrapping,
                editable.of(EditorView.editable.of(!readOnly)),
                EditorView.updateListener.of(update => {
                    update.view.contentDOM.setAttribute('contenteditable', String(!editorReadOnly));
                    if (update.docChanged) {
                        for (const listener of _changeListeners) {
                            listener(update.view, update);
                        }
                        if (_searchScrollPending) {
                            queueMicrotask(() => scrollToFirstSearchMatch());
                        }
                    }
                })
            ],
            parent: _cont[0]
        });
        _code.readOnly = readOnly;
        _code.contentDOM.setAttribute('aria-readonly', String(readOnly));
        if (readOnly) {
            _code.contentDOM.setAttribute('tabindex', '0');
        }
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
                if (editorReadOnly) {
                    _code.contentDOM.setAttribute('tabindex', '0');
                } else {
                    _code.contentDOM.removeAttribute('tabindex');
                }
            }
        };
        _code.getOption = name => name === 'readOnly' ? _code.readOnly : undefined;
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
        delete that.hmi_searchText;
        delete that.hmi_getSearchCursor;
        delete that.hmi_editor;
        delete that.hmi_value;
        if (_code) {
            _code.destroy();
        }
        id = undefined;
        _textarea = undefined;
        _code = undefined;
        _searchScrollPending = false;
        _changeListeners.clear();
        delete that.hmi_addChangeListener;
        delete that.hmi_removeChangeListener;
        delete that.hmi_getScrolling;
        delete that.hmi_setScrolling;
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
