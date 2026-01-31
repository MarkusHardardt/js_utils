(function (root) {
    "use strict";
    const ContentEditor = {};
    const isNodeJS = typeof require === 'function';
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;

    const DEFAULT_ROW_HEIGHT = '24px';
    const DEFAULT_COLUMN_WIDTH = '64px';
    const SMALL_COLUMN_WIDTH = '42px';
    const DEFAULT_TIMEOUT = 2000;
    const ALARM_COLOR = '#ff0000';
    const VALID_COLOR = '#000000';
    const SEPARATOR = 4;

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // DIVERSE
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getCheckbox() {
        let checked = false;
        let onChanged = null;
        function setValue(value) {
            checked = value === true;
            check.hmi_setVisible(checked);
            if (typeof onChanged === 'function') {
                onChanged(checked);
            }
        }
        const check = {
            type: "graph",
            strokeStyle: "black",
            lineWidth: 0.1,
            visible: false,
            points: [{ x: 0.2, y: 0.6 }, { x: 0.5, y: 0.2 }, { x: 0.8, y: 0.8 }]
        };
        return {
            type: "graph",
            strokeStyle: "black",
            lineWidth: 0.1,
            x: 0.5,
            y: 0.5,
            width: 1,
            height: 1,
            bounds: {
                x: -0.2,
                y: -0.2,
                width: 1.4,
                height: 1.4
            },
            children: [check],
            setValue,
            getValue: () => checked,
            pressed: () => {
                if (onChanged) {
                    setValue(!checked);
                }
            },
            setOnChanged: callback => onChanged = typeof callback === 'function' ? callback : null
        };
    }

    function handleScrolls(scrolls, id, textarea, restore) {
        const scrs = textarea.hmi_handleScrollParams(scrolls[id], restore);
        if (scrs.viewport_left > 0 || scrs.viewport_top) {
            scrolls[id] = scrs;
        }
        else {
            delete scrolls[id];
        }
    }

    function updateScrolls(scrolls, params) {
        let objs = params.objects, i, l = scrolls.length, scrs, src = params.source, data, attr, copy;
        switch (params.action) {
            case ContentManager.COPY:
                for (src in objs) {
                    if (objs.hasOwnProperty(src)) {
                        for (i = 0; i < l; i++) {
                            scrs = scrolls[i];
                            data = scrs[src];
                            if (data) {
                                copy = {};
                                for (attr in data) {
                                    if (data.hasOwnProperty(attr)) {
                                        copy[attr] = data[attr];
                                    }
                                }
                                scrs[objs[src]] = copy;
                            }
                        }
                    }
                }
                break;
            case ContentManager.MOVE:
                for (src in objs) {
                    if (objs.hasOwnProperty(src)) {
                        for (i = 0; i < l; i++) {
                            scrs = scrolls[i];
                            data = scrs[src];
                            if (data) {
                                delete scrs[src];
                                scrs[objs[src]] = data;
                            }
                        }
                    }
                }
                break;
            case ContentManager.DELETE:
                if (objs) {
                    for (src in objs) {
                        if (objs.hasOwnProperty(src)) {
                            for (i = 0; i < l; i++) {
                                delete scrolls[i][src];
                            }
                        }
                    }
                }
                else {
                    for (i = 0; i < l; i++) {
                        delete scrolls[i][src];
                    }
                }
                break;
            case ContentManager.INSERT:
            case ContentManager.UPDATE:
            case ContentManager.NONE:
                // nothing to do
                break;
        }
    }

    function updateContainer(container, previous, next, data, language, onSuccess, onError) {
        if (previous) {
            if (next) {
                if (previous !== next) {
                    previous.onKeyChanged(false, language, () => {
                        container.hmi_removeContent(() => {
                            container.hmi_setContent(next, () => next.onKeyChanged(data, language, onSuccess, onError), onError);
                        }, onError);
                    }, onError);
                } else {
                    next.onKeyChanged(data, language, onSuccess, onError);
                }
            } else {
                previous.onKeyChanged(false, language, () => container.hmi_removeContent(onSuccess, onError), onError);
            }
        } else if (next) {
            container.hmi_setContent(next, () => next.onKeyChanged(data, language, onSuccess, onError), onError);
        } else {
            onSuccess();
        }
    }

    function performModification(hmi, startEditChecksum, startEditId, id, language, value, onSuccess, onError) {
        let cms = hmi.env.cms, tasks = [], checksum = false, equal_id = startEditId === id;
        if (equal_id) {
            tasks.push((onSuc, onErr) => {
                cms.GetChecksum(id, cs => {
                    checksum = cs;
                    onSuc();
                }, onErr);
            });
        }
        Executor.run(tasks, () => {
            if (equal_id && startEditChecksum !== checksum) {
                let html = '<b>';
                html += `Object '${id}' has been modified!`;
                html += '</b><br><code>';
                html += id;
                html += '</code><br><br>';
                html += 'Select new id';
                hmi.showDefaultConfirmationDialog({
                    width: $(window).width() * 0.4,
                    height: $(window).height() * 0.3,
                    title: 'Warning',
                    html,
                    ok: () => onSuccess(false),
                    closed: () => onSuccess(false)
                });
            } else {
                cms.GetModificationParams(id, language, value, params => {
                    if (typeof params.error === 'string') {
                        if (typeof onError === 'function') {
                            onError(params.error);
                        }
                    } else if (params.action === ContentManager.DELETE) {
                        if (Array.isArray(params.externalUsers) && params.externalUsers.length > 0) {
                            let html = '<b>';
                            html += `Object '${id}' is referenced!`;
                            html += '</b><br><b>';
                            html += 'Sure to proceed?';
                            html += '</b><br><code>';
                            for (let i = 0; i < params.externalUsers.length; i++) {
                                if (i > 10) {
                                    html += '<br>...';
                                    break;
                                }
                                html += '<br>';
                                html += params.externalUsers[i];
                            }
                            html += '</code>';
                            hmi.showDefaultConfirmationDialog({
                                width: $(window).width() * 0.8,
                                height: $(window).height() * 0.8,
                                title: 'Warning',
                                html,
                                yes: () => cms.SetObject(id, language, value, params.checksum, () => onSuccess(params), onError),
                                cancel: () => onSuccess(false),
                                closed: () => onSuccess(false)
                            });
                        } else {
                            cms.SetObject(id, language, value, params.checksum, () => onSuccess(params), onError);
                        }
                    } else if (params.action === ContentManager.NONE) {
                        hmi.showDefaultConfirmationDialog({
                            width: $(window).width() * 0.8,
                            height: $(window).height() * 0.8,
                            title: 'Info',
                            html: `<b>Object '${id}' has not changed!</b>`,
                            ok: () => onSuccess(params),
                            closed: () => onSuccess(params)
                        });
                    } else if (!equal_id) {
                        // if the id has changed
                        cms.Exists(id, exists => {
                            if (exists !== false) {
                                let txt = '<b>';
                                txt += `Identificator '${id}' already exists!`;
                                txt += '</b><br><code>';
                                txt += id;
                                txt += '</code><br><br>';
                                txt += 'Sure to proceed?';
                                hmi.showDefaultConfirmationDialog({
                                    width: $(window).width() * 0.8,
                                    height: $(window).height() * 0.8,
                                    title: 'Warning',
                                    html: txt,
                                    yes: () => cms.SetObject(id, language, value, params.checksum, () => onSuccess(params), onError),
                                    cancel: () => onSuccess(false),
                                    closed: () => onSuccess(false)
                                });
                            } else {
                                cms.SetObject(id, language, value, params.checksum, () => onSuccess(params), onError);
                            }
                        }, onError)
                    } else {
                        // selected node has changed
                        cms.SetObject(id, language, value, params.checksum, () => onSuccess(params), onError);
                    }
                }, onError);
            }
        }, onError);
    }

    function PerformRefactoring(hmi, source, target, action, onSuccess, onEerror) {
        var cms = hmi.env.cms;
        cms.GetRefactoringParams(source, target, action, params => {
            if (typeof params.error === 'string') {
                hmi.showDefaultConfirmationDialog({
                    width: $(window).width() * 0.8,
                    height: $(window).height() * 0.8,
                    title: 'Warning',
                    html: params.error,
                    ok: () => onSuccess(false),
                    closed: () => onSuccess(false)
                });
            } else if (params.action === ContentManager.DELETE) {
                let txt = '';
                if (params.externalUsers !== undefined && Array.isArray(params.externalUsers) && params.externalUsers.length > 0) {
                    txt += '<b>';
                    txt += `Object '${source}' is referenced!`;
                    txt += '</b><br><code>';
                    for (let i = 0; i < params.externalUsers.length; i++) {
                        if (i > 10) {
                            txt += '<br>...';
                            break;
                        }
                        txt += '<br>';
                        txt += params.externalUsers[i];
                    }
                    txt += '</code>';
                } else {
                    txt += '<b>';
                    txt += 'Delete:'; // TODO: What is this???
                    txt += ':</b><br><code>';
                    txt += source;
                    txt += '</code>';
                }
                txt += '<br><br><b>';
                txt += 'Sure to proceed?';
                txt += '</b>';
                hmi.showDefaultConfirmationDialog({
                    width: $(window).width() * 0.8,
                    height: $(window).height() * 0.8,
                    title: 'Warning',
                    html: txt,
                    yes: () => cms.PerformRefactoring(source, target, action, params.checksum, () => onSuccess(params), onEerror),
                    cancel: () => onSuccess(false),
                    closed: () => onSuccess(false)
                });
            } else if (params.action === ContentManager.MOVE || params.action === ContentManager.COPY) {
                if (params.existingTargets !== undefined && Array.isArray(params.existingTargets) && params.existingTargets.length > 0) {
                    let txt = '<b>';
                    txt += `Object '${source}' already exists!`;
                    txt += '</b><br><code>';
                    for (let i = 0; i < params.existingTargets.length; i++) {
                        if (i > 10) {
                            txt += '<br>...';
                            break;
                        }
                        txt += '<br>';
                        txt += params.existingTargets[i];
                    }
                    txt += '</code>';
                    txt += '<br><br><b>';
                    txt += 'Sure to proceed?';
                    txt += '</b>';
                    hmi.showDefaultConfirmationDialog({
                        width: $(window).width() * 0.8,
                        height: $(window).height() * 0.8,
                        title: 'Warning',
                        html: txt,
                        yes: () => cms.PerformRefactoring(source, target, action, params.checksum, () => onSuccess(params), onEerror),
                        cancel: () => onSuccess(false),
                        closed: () => onSuccess(false)
                    });
                } else {
                    cms.PerformRefactoring(source, target, action, params.checksum, () => onSuccess(params), onEerror);
                }
            } else {
                onSuccess(false);
            }
        }, onEerror);
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // LANGUAGES
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getLanguageSelector(hmi, adapter) {
        const languageSwitching = hmi.env.lang;
        const langs = languageSwitching.GetLanguages(), columns = [1];
        let language = languageSwitching.GetLanguage();
        const children = [{
            x: 0,
            y: 0,
            align: 'right',
            text: 'languages:'
        }];
        function selectLanguage(btn) {
            for (let i = 0, l = children.length; i < l; i++) {
                const button = children[i];
                button.hmi_setSelected(button === btn);
            }
            language = btn.text;
            languageSwitching.LoadLanguage(language, () => {
                console.log(`loaded language '${language}'`);
                adapter.languageChanged(language);
            }, error => {
                console.error(`failed loading language '${language}': ${error}`);
            });
        };
        for (let i = 0; i < langs.length; i++) {
            (function () {
                const lang = langs[i];
                const button = {
                    x: i + 1,
                    y: 0,
                    text: lang,
                    border: true,
                    selected: lang === language,
                    clicked: () => selectLanguage(button)
                };
                children.push(button);
                columns.push(DEFAULT_COLUMN_WIDTH);
            }());
        }
        return {
            type: 'grid',
            columns,
            rows: 1,
            separator: SEPARATOR,
            children,
            getLanguage: () => language
        };
    }

    function compareErrors(error1, error2) {
        let time1 = error1.date.getTime();
        let time2 = error2.date.getTime();
        return time2 !== time1 ? time2 - time1 : Sorting.compareTextsAndNumbers(error1.text, i_error12.text, false, false);
    }

    function getLogHandler(hmi) {
        let last_read_offset = 0;
        const errors = [], push = entry => {
            const idx = Sorting.getInsertionIndex(entry, errors, false, compareErrors);
            errors.splice(idx, 0, entry);
            last_read_offset++;
            update();
        }, update = () => {
            const active = last_read_offset > 0;
            // button[active ? 'hmi_removeClass' :
            // 'hmi_addClass']('highlighted-green');
            button[active ? 'hmi_addClass' : 'hmi_removeClass']('highlighted-red');
            button.hmi_text(active ? 'error' : 'info');
            button.hmi_css('color', active ? 'white' : 'black');
            // container.hmi_setEnabled(active);
            if (active) {
                let txt = errors[0].text;
                if (errors.length > 1) {
                    txt += ' (' + (errors.length - 1) + ' more errors)';
                }
                info.hmi_value(txt);
            }
        }, info = {
            type: 'textfield',
            editable: false
        }, button = {
            text: 'info',
            border: true,
            clicked: () => {
                const table = {
                    location: 'top',
                    type: 'table',
                    highlightSelectedRow: true,
                    searching: true,
                    paging: false,
                    columns: [{
                        width: 15,
                        text: 'timestamp',
                        textsAndNumbers: true
                    }, {
                        width: 85,
                        text: 'error',
                        textsAndNumbers: true
                    }],
                    getRowCount: () => errors.length,
                    getCellHtml: (row, column) => {
                        const error = errors[row];
                        switch (column) {
                            case 0:
                                return Utilities.formatTimestamp(error.date);
                            case 1:
                                return error.text;
                            default:
                                return '';
                        }
                    },
                    prepare: (that, onSuccess, onError) => {
                        table.hmi_reload();
                        onSuccess();
                    },
                    handleTableRowClicked: row => {
                        const error = errors[row];
                        textarea.hmi_value(`${Utilities.formatTimestamp(error.date)}\n${error.text}`);
                    }
                };
                const textarea = {
                    location: 'bottom',
                    type: 'textarea',
                    editable: false
                };
                const popup_object = {
                    type: 'split',
                    topSize: Mathematics.GOLDEN_CUT_INVERTED,
                    columns: 1,
                    rows: [3, 1],
                    children: [table, textarea]
                };
                const buttons = [];
                if (errors.length > 0) {
                    buttons.push({
                        text: 'clear all',
                        click: onClose => {
                            errors.splice(0, errors.length);
                            last_read_offset = 0;
                            info.hmi_value('');
                            update();
                            onClose();
                        }
                    });
                }
                if (last_read_offset > 0) {
                    buttons.push({
                        text: 'reset',
                        click: onClose => {
                            last_read_offset = 0;
                            info.hmi_value('');
                            update();
                            onClose();
                        }
                    });
                    buttons.push({
                        text: 'cancel',
                        click: onClose => {
                            update();
                            onClose();
                        }
                    });
                }
                else {
                    buttons.push({
                        text: 'ok',
                        click: onClose => {
                            update();
                            onClose();
                        }
                    });
                }
                hmi.showDialog({
                    title: 'errors',
                    width: Math.floor($(window).width() * 0.9),
                    height: Math.floor($(window).height() * 0.95),
                    object: popup_object,
                    buttons
                });
            },
            pushError: error => {
                push({
                    date: new Date(),
                    data: error,
                    text: typeof error === 'string' ? error : (error ? error.toString() : 'unknown'),
                    timeout: false
                });
                console.error(error);
            },
            pushTimeout: message => {
                push({
                    date: new Date(),
                    data: message,
                    text: typeof message === 'string' ? message : (message ? message.toString() : 'unknown'),
                    timeout: true
                });
                console.error(message);
            },
            prepare: (that, onSuccess, onError) => {
                update();
                onSuccess();
            },
            reset: () => {
                last_read_offset = 0;
                info.hmi_value('');
                update();
            },
            updateInfo: inf => {
                if (last_read_offset === 0) {
                    info.hmi_value(inf);
                }
            }
        };
        button.info = info;
        return button;
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // KEY TEXTFIELD
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getKeyTextfield(hmi, adapter) {
        const cms = hmi.env.cms;
        const keyTextField = {
            x: 0,
            y: 0,
            type: 'textfield',
            border: false,
            prepare: (that, onSuccess, onError) => {
                that._keyup = event => {
                    if (event.which === 13) {
                        var path = that.hmi_value().trim();
                        adapter.keySelected(cms.AnalyzeId(path));
                    }
                };
                that.hmi_getTextField().on('keyup', that._keyup);
                that._on_change = () => {
                    var data = cms.AnalyzeId(that.hmi_value().trim());
                    that._update_color(data);
                    adapter.keyEdited(data);
                };
                that.hmi_addChangeListener(that._on_change);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_getTextField().off('keyup', that._keyup);
                delete that._keyup;
                that.hmi_removeChangeListener(that._on_change);
                delete that._on_change;
                onSuccess();
            },
            _update_color: data => keyTextField.hmi_getTextField().css('color', data.file || data.folder ? VALID_COLOR : ALARM_COLOR),
            update: data => {
                keyTextField.hmi_value(data.id);
                keyTextField._update_color(data);
            },
            getIdData: () => cms.AnalyzeId(keyTextField.hmi_value().trim())
        };
        return keyTextField;
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // BROWSER TREE
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getBrowserTree(hmi, adapter) {
        const cms = hmi.env.cms, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let sel_data, selected = false;
        const tree = {
            x: 0,
            y: 2,
            type: 'tree',
            rootURL: ContentManager.GET_CONTENT_TREE_NODES_URL,
            rootRequest: ContentManager.COMMAND_GET_CHILD_TREE_NODES,
            compareNodes: (node1, node2) => cms.CompareIds(node1.data.path, node2.data.path),
            nodeActivated: node => {
                let path = node.data.path;
                if (selected !== path) {
                    selected = path;
                    adapter.keySelected(cms.AnalyzeId(path));
                }
            },
            nodeClicked: node => {
                selected = node.data.path;
                adapter.keySelected(cms.AnalyzeId(selected));
            },
            expand: data => {
                unstress((onSuccess, onError) => {
                    sel_data = data;
                    tree.hmi_setActivePath(data.id, node => tree.hmi_updateLoadedNodes(onSuccess, onError), onError);
                });
            }
        };
        return tree;
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // SEARCH CONTAINER
    // ///////////////////////////////////////////////////////////////////////////////////////////////
    function getSearchContainer(hmi, adapter) {
        let search_running = false;
        const cms = hmi.env.cms, perform_search = () => {
            let key = search_key_textfield.hmi_value().trim();
            let value = search_value_textfield.hmi_value().trim();
            if (key.length > 0 || value.length > 0) {
                search_running = true;
                button_search.hmi_setEnabled(false);
                cms.GetSearchResults(key, value, results => {
                    search_running = false;
                    button_search.hmi_setEnabled(true);
                    search_results.splice(0, search_results.length);
                    for (let i = 0, l = results.length; i < l; i++) {
                        let id = results[i], icon = cms.GetIcon(id);
                        search_results.push({
                            id: id,
                            icon: icon
                        });
                    }
                    search_table.hmi_reload();
                }, error => adapter.notifyError(error));
            }
        }, trigger_search = event => {
            if (event.which === 13 && !search_running) {
                perform_search();
            }
        }, search_key_textfield = {
            x: 1,
            y: 0,
            type: 'textfield',
            border: false,
            prepare: (that, onSuccess, onError) => {
                that.hmi_getTextField().on('keyup', trigger_search);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_getTextField().off('keyup', trigger_search);
                onSuccess();
            }
        }, search_value_textfield = {
            x: 3,
            y: 0,
            type: 'textfield',
            border: false,
            prepare: (that, onSuccess, onError) => {
                that.hmi_getTextField().on('keyup', trigger_search);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_getTextField().off('keyup', trigger_search);
                onSuccess();
            }
        }, button_search = {
            x: 4,
            y: 0,
            text: 'search',
            border: true,
            clicked: () => {
                if (!search_running) {
                    perform_search();
                }
            }
        }, search_results = [], search_table = {
            x: 0,
            y: 1,
            width: 5,
            height: 1,
            type: 'table',
            searching: false,
            paging: false,
            highlightSelectedRow: true,
            columns: [{
                width: 150,
                text: 'identificator',
                textsAndNumbers: true
            }, {
                width: 10,
                text: 'type'
            }],
            getRowCount: () => search_results.length,
            getCellHtml: (row, column) => {
                let result = search_results[row];
                switch (column) {
                    case 0:
                        let id = result.id;
                        return id.length < 80 ? id : id.substr(0, 35) + ' ... ' + id.substr(id.length - 45, id.length);
                    case 1:
                        return '<img src="' + result.icon + '" />';
                    default:
                        return '';
                }
            },
            handleTableRowClicked: row => adapter.keySelected(cms.AnalyzeId(search_results[row].id))
        };
        return {
            visible: false,
            type: 'grid',
            x: 0,
            y: 2,
            separator: SEPARATOR,
            columns: [SMALL_COLUMN_WIDTH, 1, SMALL_COLUMN_WIDTH, 1, DEFAULT_COLUMN_WIDTH],
            rows: [DEFAULT_ROW_HEIGHT, 1],
            children: [{
                x: 0,
                y: 0,
                text: 'key:',
                align: 'right'
            }, search_key_textfield, {
                x: 2,
                y: 0,
                text: 'value:',
                align: 'right'
            }, search_value_textfield, button_search, search_table]
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // MAIN NAIGATION BROWSER
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getNavigator(hmi, adapter, keyTextfield, browserTree, searchContainer) {
        function update_mode(button) {
            button_select_browse.selected = button === button_select_browse;
            button_select_browse.hmi_setSelected(button_select_browse.selected);
            button_select_search.selected = button === button_select_search;
            button_select_search.hmi_setSelected(button_select_search.selected);
            if (button_select_browse.selected) {
                adapter.showBrowserTree();
            } else {
                adapter.showSearchTable();
            }
        };
        const button_select_browse = {
            x: 1,
            y: 0,
            text: 'browse',
            border: true,
            selected: true,
            clicked: () => update_mode(button_select_browse)
        };
        const button_select_search = {
            x: 2,
            y: 0,
            text: 'search',
            border: true,
            clicked: () => update_mode(button_select_search)
        };
        const button_reload = {
            x: 3,
            y: 0,
            text: 'reload',
            border: true,
            clicked: adapter.reload
        };
        return {
            type: 'grid',
            columns: 1,
            rows: [DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, 1],
            children: [keyTextfield, {
                type: 'grid',
                x: 0,
                y: 1,
                columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
                rows: [DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, 1],
                children: [{
                    x: 0,
                    y: 0,
                    align: 'right',
                    text: 'hmijs-content-manager'
                }, button_select_browse, button_select_search, button_reload]
            }, browserTree, searchContainer],
            showBrowser: () => update_mode(button_select_browse)
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // CROSS REFERENCES BROWSER
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getReferences(hmi, adapter) {
        const cms = hmi.env.cms, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let sel_data, selected = false;
        const text = {
            x: 0,
            y: 1,
            width: 4,
            height: 1,
            id: 'path',
            type: 'textfield',
            readonly: true
        };
        const tree = {
            x: 0,
            y: 2,
            width: 4,
            height: 1,
            type: 'tree',
            rootURL: ContentManager.GET_CONTENT_TREE_NODES_URL,
            rootRequest: ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES,
            compareNodes: (node1, node2) => cms.CompareIds(node1.data.path, node2.data.path),
            nodeActivated: node => {
                const path = node.data.path;
                text.hmi_value(path);
                if (selected !== path) {
                    selected = path;
                    adapter.keySelected(cms.AnalyzeId(path));
                }
            },
            nodeClicked: node => {
                selected = node.data.path;
                text.hmi_value(selected);
                adapter.keySelected(cms.AnalyzeId(selected));
            }
        };
        function updateReferences(button) {
            if (button) {
                buttonRefTo.hmi_setSelected(buttonRefTo === button);
                buttonRefFrom.hmi_setSelected(buttonRefFrom === button);
            }
            unstress((onSuccess, onError) => {
                const id = sel_data ? sel_data.id : '';
                text.hmi_value(id);
                tree.hmi_setRootPath(id, onSuccess, onError);
            });
        };
        const buttonRefTo = {
            x: 1,
            y: 0,
            border: true,
            text: 'uses',
            selected: true,
            clicked: () => {
                tree.rootRequest = ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES;
                updateReferences(buttonRefTo);
            }
        };
        const buttonRefFrom = {
            x: 2,
            y: 0,
            border: true,
            text: 'users',
            clicked: () => {
                tree.rootRequest = ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES;
                updateReferences(buttonRefFrom);
            }
        };
        const buttonEdit = {
            x: 3,
            y: 0,
            border: true,
            text: 'browse',
            clicked: () => adapter.selectInNavigator(cms.AnalyzeId(text.hmi_value()))
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, 1],
            children: [text, {
                x: 0,
                y: 0,
                align: 'right',
                text: 'cross references:'
            }, buttonRefTo, buttonRefFrom, buttonEdit, tree],
            setRootIdData: data => {
                sel_data = data;
                updateReferences();
            },
            update: updateReferences,
            getIdData: () => cms.AnalyzeId(text.hmi_value())
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // LABELS - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getLabelView(hmi, adapter, editable) {
        const cms = hmi.env.cms, langs = cms.GetLanguages(), children = [], rows = [], values = {};
        function onKeyChanged(data, language, onSuccess, onError) {
            if (data && data.file) {
                cms.GetObject(data.file, undefined, editable === true ? ContentManager.RAW : ContentManager.INCLUDE, result => {
                    if (result !== undefined) {
                        for (let i = 0, l = langs.length; i < l; i++) {
                            const lang = langs[i], lab = result[lang];
                            values[lang].hmi_value(lab || '');
                        }
                    } else {
                        for (let i = 0, l = langs.length; i < l; i++) {
                            values[langs[i]].hmi_value('');
                        }
                    }
                    onSuccess();
                }, error => {
                    for (let i = 0, l = langs.length; i < l; i++) {
                        values[langs[i]].hmi_value('');
                    }
                    onError(error);
                });
            } else {
                for (let i = 0, l = langs.length; i < l; i++) {
                    values[langs[i]].hmi_value('');
                }
                onSuccess();
            }
        };
        for (let i = 0, l = langs.length; i < l; i++) {
            const lang = langs[i];
            children.push({
                x: 0,
                y: i,
                text: lang,
                border: false,
                classes: 'hmi-dark'
            });
            const obj = {
                x: 1,
                y: i,
                type: 'textfield',
                editable: editable === true,
                border: false,
                classes: 'hmi-dark',
                prepare: (that, onSuccess, onError) => {
                    if (editable === true) {
                        that.hmi_addChangeListener(adapter.edited);
                    }
                    onSuccess();
                },
                destroy: (that, onSuccess, onError) => {
                    if (editable === true) {
                        that.hmi_removeChangeListener(adapter.edited);
                    }
                    onSuccess();
                }
            };
            children.push(obj);
            values[lang] = obj;
            rows.push(DEFAULT_ROW_HEIGHT);
        }
        rows.push(1);
        return {
            type: 'grid',
            columns: [DEFAULT_COLUMN_WIDTH, 1],
            rows,
            children,
            onKeyChanged,
            getValue: () => {
                let value = {};
                for (let lang in values) {
                    if (values.hasOwnProperty(lang)) {
                        value[lang] = values[lang].hmi_value().trim();
                    }
                }
                return value;
            }
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // HTML - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getHtmlPreview(hmi, adapter) {
        let mode = ContentManager.RAW;
        function update_mode(md) {
            mode = md;
            button_include.selected = md === ContentManager.INCLUDE;
            button_include.hmi_setSelected(button_include.selected);
            button_raw.selected = md === ContentManager.RAW;
            button_raw.hmi_setSelected(button_raw.selected);
            adapter.triggerReload();
        };
        function reload(data, language, onSuccess, onError) {
            if (data && data.file) {
                switch (mode) {
                    case ContentManager.RAW:
                        hmi.env.cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                            preview.hmi_html(raw !== undefined ? raw : '');
                            onSuccess();
                        }, error => {
                            preview.hmi_html('');
                            onError(error);
                        });
                        break;
                    case ContentManager.INCLUDE:
                        hmi.env.cms.GetObject(data.file, language, ContentManager.INCLUDE, build => {
                            preview.hmi_html(build !== undefined ? build : '');
                            onSuccess();
                        }, error => {
                            preview.hmi_html('');
                            onError(error);
                        });
                        break;
                }
            } else {
                preview.hmi_html('');
                onSuccess();
            }
        };
        const preview = {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
            border: false,
            scrollable: true
        };
        const info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        const button_include = {
            x: 1,
            y: 1,
            text: ContentManager.INCLUDE,
            border: true,
            clicked: () => update_mode(ContentManager.INCLUDE)
        };
        const button_raw = {
            x: 2,
            y: 1,
            text: ContentManager.RAW,
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [preview, info_lang, button_include, button_raw],
            onKeyChanged: (data, language, onSuccess, onError) => {
                info_lang.hmi_text(`language: '${language}'`);
                button_include.hmi_setEnabled(false);
                button_raw.hmi_setEnabled(false);
                reload(data, language, () => {
                    button_include.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onSuccess();
                }, error => {
                    button_include.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onError(error);
                });
            }
        };
    }

    function getHtmlEditor(hmi, adapter) {
        const cms = hmi.env.cms, scrolls = {};
        function onKeyChanged(data, language, onSuccess, onError) {
            info_lang.hmi_text(`language: '${language}'`);
            if (textarea.file) {
                handleScrolls(scrolls, textarea.file, textarea, false);
                delete textarea.file;
            }
            if (data && data.file) {
                cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                    textarea.hmi_value(raw !== undefined ? raw : '');
                    if (raw !== undefined) {
                        textarea.file = data.file;
                        handleScrolls(scrolls, textarea.file, textarea, true);
                    }
                    onSuccess();
                }, error => {
                    textarea.hmi_html('');
                    onError(error);
                });
            } else {
                textarea.hmi_value('');
                onSuccess();
            }
        };
        const textarea = {
            x: 0,
            y: 0,
            type: 'textarea',
            code: 'html',
            editable: true,
            beautify: true,
            prepare: (that, onSuccess, onError) => {
                that.hmi_addChangeListener(adapter.edited);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(adapter.edited);
                onSuccess();
            }
        };
        const info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        return {
            type: 'grid',
            columns: 1,
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [textarea, info_lang],
            onKeyChanged,
            getValue: () => textarea.hmi_value().trim(),
            scrolls: scrolls
        };
    };

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // TEXT - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getTextPreview(hmi, adapter) {
        const cms = hmi.env.cms, scrolls_raw = {}, scrolls_build = {};
        let mode = ContentManager.RAW;
        function update_mode(md) {
            mode = md;
            button_include.selected = md === ContentManager.INCLUDE;
            button_include.hmi_setSelected(button_include.selected);
            button_raw.selected = md === ContentManager.RAW;
            button_raw.hmi_setSelected(button_raw.selected);
            adapter.triggerReload();
        };
        function reload(data, language, onSuccess, onError) {
            if (textarea.file_raw) {
                handleScrolls(scrolls_raw, textarea.file_raw, textarea, false);
                delete textarea.file_raw;
            }
            if (textarea.file_build) {
                handleScrolls(scrolls_build, textarea.file_build, textarea, false);
                delete textarea.file_build;
            }
            if (data && data.file) {
                switch (mode) {
                    case ContentManager.RAW:
                        cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                            textarea.hmi_value(raw !== undefined ? raw : '');
                            if (raw !== undefined) {
                                textarea.file_raw = data.file;
                                handleScrolls(scrolls_raw, textarea.file_raw, textarea, true);
                            }
                            onSuccess();
                        }, error => {
                            textarea.hmi_value('');
                            onError(error);
                        });
                        break;
                    case ContentManager.INCLUDE:
                        cms.GetObject(data.file, language, ContentManager.INCLUDE, build => {
                            textarea.hmi_value(build !== undefined ? build : '');
                            if (build !== undefined) {
                                textarea.file_build = data.file;
                                handleScrolls(scrolls_build, textarea.file_build, textarea, true);
                            }
                            onSuccess();
                        }, error => {
                            textarea.hmi_value('');
                            onError(error);
                        });
                        break;
                }
            } else {
                textarea.hmi_value('');
                onSuccess();
            }
        };
        const textarea = {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
            type: 'textarea',
            code: 'javascript',
            editable: false
        };
        const info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        const button_include = {
            x: 1,
            y: 1,
            text: ContentManager.INCLUDE,
            border: true,
            clicked: () => update_mode(ContentManager.INCLUDE)
        };
        const button_raw = {
            x: 2,
            y: 1,
            text: ContentManager.RAW,
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [textarea, info_lang, button_include, button_raw],
            onKeyChanged: (data, language, onSuccess, onError) => {
                info_lang.hmi_text(`language: '${language}'`);
                button_include.hmi_setEnabled(false);
                button_raw.hmi_setEnabled(false);
                reload(data, language, () => {
                    button_include.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onSuccess();
                }, error => {
                    button_include.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onError(error);
                });
            },
            scrolls_raw,
            scrolls_build
        };
    }

    function getTextEditor(hmi, adapter) {
        const cms = hmi.env.cms, scrolls = {};
        function onKeyChanged(data, language, onSuccess, onError) {
            info_lang.hmi_text(`language: '${language}'`);
            if (textarea.file) {
                handleScrolls(scrolls, textarea.file, textarea, false);
                delete textarea.file;
            }
            if (data && data.file) {
                cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                    textarea.hmi_value(raw !== undefined ? raw : '');
                    if (raw !== undefined) {
                        textarea.file = data.file;
                        handleScrolls(scrolls, textarea.file, textarea, true);
                    }
                    onSuccess();
                }, error => {
                    textarea.hmi_value('');
                    onError(error);
                });
            } else {
                textarea.hmi_value('');
                onSuccess();
            }
        };
        const textarea = {
            x: 0,
            y: 0,
            type: 'textarea',
            code: 'javascript',
            editable: true,
            prepare: (that, onSuccess, onError) => {
                that.hmi_addChangeListener(adapter.edited);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(adapter.edited);
                onSuccess();
            }
        };
        const info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        return {
            type: 'grid',
            columns: 1,
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [textarea, info_lang],
            onKeyChanged,
            getValue: () => textarea.hmi_value().trim(),
            scrolls
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // JSONFX - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getJsonFxPreview(hmi, adapter) {
        const cms = hmi.env.cms, scrolls_raw = {}, scrolls_build = {};
        let mode = ContentManager.RAW;
        function update_mode(md) {
            mode = md;
            button_hmi.selected = md === ContentManager.PARSE;
            button_hmi.hmi_setSelected(button_hmi.selected);
            button_include.selected = md === ContentManager.INCLUDE;
            button_include.hmi_setSelected(button_include.selected);
            button_raw.selected = md === ContentManager.RAW;
            button_raw.hmi_setSelected(button_raw.selected);
            adapter.triggerReload();
        };
        function reload(data, language, onSuccess, onError) {
            if (textarea.file_raw) {
                handleScrolls(scrolls_raw, textarea.file_raw, textarea, false);
                delete textarea.file_raw;
            }
            if (textarea.file_build) {
                handleScrolls(scrolls_build, textarea.file_build, textarea, false);
                delete textarea.file_build;
            }
            if (data && data.file) {
                switch (mode) {
                    case ContentManager.RAW:
                        container.hmi_removeContent(function () {
                            cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                                let value = raw !== undefined ? JsonFX.stringify(JsonFX.reconstruct(raw), true) : '';
                                textarea.value = value;
                                container.hmi_setContent(textarea, () => {
                                    if (raw !== undefined) {
                                        textarea.file_raw = data.file;
                                        handleScrolls(scrolls_raw, textarea.file_raw, textarea, true);
                                    }
                                    onSuccess();
                                }, onError);
                            }, onError);
                        }, onError);
                        break;
                    case ContentManager.INCLUDE:
                        container.hmi_removeContent(() => {
                            cms.GetObject(data.file, language, ContentManager.INCLUDE, build => {
                                var value = build !== undefined ? JsonFX.stringify(JsonFX.reconstruct(build), true) : '';
                                textarea.value = value;
                                container.hmi_setContent(textarea, () => {
                                    if (build !== undefined) {
                                        textarea.file_build = data.file;
                                        handleScrolls(scrolls_build, textarea.file_build, textarea, true);
                                    }
                                    onSuccess();
                                }, onError);
                            }, onError);
                        }, onError);
                        break;
                    case ContentManager.PARSE:
                        container.hmi_removeContent(() => {
                            cms.GetObject(data.file, language, ContentManager.PARSE, parsed => {
                                if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                    container.hmi_setContent(parsed, onSuccess, onError);
                                } else if (parsed !== undefined) {
                                    container.hmi_setContent({
                                        html: '<b>Invalid hmi-object: "' + data.file + '"</b><br>Type is: ' + (Array.isArray(parsed) ? 'array' : typeof parsed)
                                    }, onSuccess, onError);
                                } else {
                                    container.hmi_setContent({
                                        html: '<b>No data available: "' + data.file + '"</b>'
                                    }, onSuccess, onError);
                                }
                            }, onError);
                        }, onError);
                        break;
                }
            } else {
                container.hmi_removeContent(onSuccess, onError);
            }
        };
        const textarea = {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
            type: 'textarea',
            code: 'javascript',
            editable: false
        };
        const container = {
            x: 0,
            y: 0,
            width: 4,
            height: 1,
            type: 'container'
        };
        const info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        const button_hmi = {
            x: 1,
            y: 1,
            text: 'hmi',
            border: true,
            clicked: () => update_mode(ContentManager.PARSE)
        };
        const button_include = {
            x: 2,
            y: 1,
            text: ContentManager.INCLUDE,
            border: true,
            clicked: () => update_mode(ContentManager.INCLUDE)
        };
        const button_raw = {
            x: 3,
            y: 1,
            text: ContentManager.RAW,
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [container, info_lang, button_hmi, button_include, button_raw],
            onKeyChanged: (data, language, onSuccess, onError) => {
                info_lang.hmi_text(`language: '${language}'`);
                button_hmi.hmi_setEnabled(false);
                button_include.hmi_setEnabled(false);
                button_raw.hmi_setEnabled(false);
                reload(data, language, () => {
                    button_hmi.hmi_setEnabled(true);
                    button_include.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onSuccess();
                }, error => {
                    button_hmi.hmi_setEnabled(true);
                    button_include.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onError(error);
                });
            },
            scrolls_raw,
            scrolls_build
        };
    }

    function getJsonFxEditor(hmi, adapter) {
        const cms = hmi.env.cms, scrolls = {};
        let mode = ContentManager.RAW;
        function update_mode(md) {
            mode = md;
            button_hmi.selected = md === ContentManager.PARSE;
            button_hmi.hmi_setSelected(button_hmi.selected);
            button_raw.selected = md === ContentManager.RAW;
            button_raw.hmi_setSelected(button_raw.selected);
            adapter.triggerReload();
        };
        let edited = false, object, raw;
        function reload(data, language, onSuccess, onError) {
            if (textarea.file) {
                handleScrolls(scrolls, textarea.file, textarea, false);
                delete textarea.file;
            }
            raw = undefined;
            if (object) {
                if (typeof object._hmi_removeEditListener === 'function') {
                    object._hmi_removeEditListener(edit_listener);
                }
                object = undefined;
            }
            if (data && data.file) {
                switch (mode) {
                    case ContentManager.RAW:
                        container.hmi_removeContent(() => {
                            cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                                raw = raw !== undefined ? JsonFX.reconstruct(raw) : undefined;
                                textarea.value = raw !== undefined ? JsonFX.stringify(raw, true) : '';
                                container.hmi_setContent(textarea, () => {
                                    if (raw !== undefined) {
                                        textarea.file = data.file;
                                        handleScrolls(scrolls, textarea.file, textarea, true);
                                    }
                                    onSuccess();
                                }, onError);
                            }, onError);
                        }, onError);
                        break;
                    case ContentManager.PARSE:
                        container.hmi_removeContent(() => {
                            cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                                if (raw !== undefined) {
                                    raw = JsonFX.reconstruct(raw);
                                    cms.GetObject(data.file, language, ContentManager.PARSE, parsed => {
                                        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                            object = parsed;
                                            container.hmi_setContent(object, () => {
                                                if (typeof object._hmi_addEditListener === 'function') {
                                                    object._hmi_addEditListener(edit_listener);
                                                }
                                                onSuccess();
                                            }, onError, undefined, true, true);
                                        } else if (parsed !== undefined) {
                                            container.hmi_setContent({
                                                html: '<b>Invalid hmi-object: "' + data.file + '"</b><br>Type is: ' + (Array.isArray(parsed) ? 'array' : typeof parsed)
                                            }, onSuccess, onError);
                                        } else {
                                            container.hmi_setContent({
                                                html: '<b>No data available: "' + data.file + '"</b>'
                                            }, onSuccess, onError);
                                        }
                                    }, onError);
                                } else {
                                    container.hmi_setContent({
                                        html: '<b>No data available: "' + data.file + '"</b>'
                                    }, onSuccess, onError);
                                }
                            }, onError);
                        }, onError);
                        break;
                }
            } else {
                container.hmi_removeContent(onSuccess, onError);
            }
        };
        const textarea = {
            type: 'textarea',
            code: 'javascript',
            beautify: true,
            editable: true,
            value: raw !== undefined ? JsonFX.stringify(raw, true) : '',
            prepare: (that, onSuccess, onError) => {
                that._on_change = () => {
                    if (!edited) {
                        edited = true;
                        adapter.edited();
                        button_hmi.hmi_setEnabled(false);
                        button_raw.hmi_setEnabled(false);
                    }
                };
                that.hmi_addChangeListener(that._on_change);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(that._on_change);
                delete that._on_change;
                onSuccess();
            }
        };
        const edit_listener = {
            notifyEdited: () => {
                if (!edited) {
                    edited = true;
                    adapter.edited();
                    button_hmi.hmi_setEnabled(false);
                    button_raw.hmi_setEnabled(false);
                }
            },
            showChildObjectEditor: (index, child) => {
                if (!edited) {
                    if (raw !== undefined && Array.isArray(raw.children)) {
                        const obj = raw.children[index] || {
                            x: child && typeof child.x === 'number' ? child.x : 0,
                            y: child && typeof child.y === 'number' ? child.y : 0,
                            width: child && typeof child.width === 'number' ? child.width : 1,
                            height: child && typeof child.height === 'number' ? child.height : 1,
                            id: 'enter object node id here',
                            type: 'enter type here',
                            classes: 'highlighted-yellow',
                            text: 'enter text here',
                        };
                        const value = JsonFX.stringify(JsonFX.reconstruct(obj), true);
                        const src_obj = {
                            x: 0,
                            y: 0,
                            type: 'textarea',
                            code: 'javascript',
                            beautify: true,
                            value
                        };
                        const info_obj = {
                            x: 0,
                            y: 1,
                            align: 'left'
                        };
                        const popup_obj = {
                            type: 'grid',
                            columns: 1,
                            rows: [1, '30px'],
                            children: [src_obj, info_obj]
                        };
                        hmi.showDialog({
                            title: 'Edit',
                            width: Math.floor($(window).width() * 0.9),
                            height: Math.floor($(window).height() * 0.95),
                            object: popup_obj,
                            buttons: [{
                                text: 'commit',
                                click: onClose => {
                                    try {
                                        const value = src_obj.hmi_value().trim();
                                        const object = value.length > 0 ? JsonFX.parse(value, true, true) : undefined;
                                        if (object !== undefined) {
                                            raw.children[typeof index === 'number' && index >= 0 ? index : raw.children.length] = object;
                                        } else if (typeof index === 'number' && index >= 0) {
                                            raw.children.splice(index, 1);
                                        }
                                        adapter.performCommit(JsonFX.stringify(raw, false));
                                        onClose();
                                    } catch (exc) {
                                        info_obj.hmi_addClass('highlighted-red');
                                        info_obj.hmi_text(exc);
                                    }
                                }
                            }, {
                                text: 'cancel',
                                click: onClose
                            }]
                        });
                    }
                }
            }
        };
        const container = {
            x: 0,
            y: 0,
            type: 'container'
        };
        const info_lang = {
            x: 0,
            y: 0,
            align: 'left'
        };
        const button_hmi = {
            x: 1,
            y: 0,
            text: 'hmi',
            border: true,
            clicked: () => update_mode(ContentManager.PARSE)
        };
        const button_raw = {
            x: 2,
            y: 0,
            text: ContentManager.RAW,
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        function get_value() {
            switch (mode) {
                case ContentManager.RAW:
                    const value = textarea.hmi_value().trim();
                    return value.length > 0 ? JsonFX.stringify(JsonFX.parse(value, true, true), false) : '';
                case ContentManager.PARSE:
                    if ((object.type === 'grid' || object.type === 'float') && Array.isArray(raw.children) && Array.isArray(object.children)) {
                        // first we got to update our raw coordinates
                        for (let i = 0, l = raw.children.length; i < l; i++) {
                            const raw_child = raw.children[i];
                            const obj_child = object.children[i];
                            if (typeof obj_child.x === 'number') {
                                raw_child.x = obj_child.x;
                            }
                            if (typeof obj_child.y === 'number') {
                                raw_child.y = obj_child.y;
                            }
                        }
                        return JsonFX.stringify(raw, false);
                    } else {
                        throw new Error('Invalid hmi-edit-content');
                    }
                default:
                    throw new Error(`Invalid mode: ${mode}`);
            }
        };
        return {
            type: 'grid',
            columns: 1,
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [container, {
                x: 0,
                y: 1,
                type: 'grid',
                columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
                rows: 1,
                children: [info_lang, button_hmi, button_raw]
            }],
            onKeyChanged: (data, language, onSuccess, onError) => {
                edited = false;
                info_lang.hmi_text(`language: '${language}'`);
                button_hmi.hmi_setEnabled(false);
                button_raw.hmi_setEnabled(false);
                reload(data, language, () => {
                    button_hmi.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onSuccess();
                }, error => {
                    button_hmi.hmi_setEnabled(true);
                    button_raw.hmi_setEnabled(true);
                    onError(error);
                });
            },
            getValue: get_value,
            destroy: (that, onSuccess, onError) => {
                if (object && typeof object._hmi_removeEditListener === 'function') {
                    console.log('object._hmi_removeEditListener(edit_listener);');
                    object._hmi_removeEditListener(edit_listener);
                }
                onSuccess();
            },
            scrolls
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // HMIS - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    /*
    adapter = {
        edited: () => { }, must be called if data has been edited
    }
    */
    function getHmiView(hmi, adapter, editable) {
        const cms = hmi.env.cms;
        let watchEditActions = false;
        function onEdited() {
            if (watchEditActions) {
                adapter.edited();
            }
        }
        function onKeyChanged(data, language, onSuccess, onError) {
            watchEditActions = false;
            if (data && data.file) {
                cms.GetObject(data.file, undefined, ContentManager.RAW, data => {
                    if (data !== undefined) {
                        viewObjectValue.hmi_value(data.viewObjectColumn);
                        queryParameterValue.hmi_value(data.queryParameterColumn);
                        enableCheckbox.setValue((data.flagsColumn & ContentManager.HMI_FLAG_ENABLE) !== 0);
                        enableCheckbox.setOnChanged(editable === true ? onEdited : null);
                        watchEditActions = true;
                    } else {
                        viewObjectValue.hmi_value('');
                        queryParameterValue.hmi_value('');
                        enableCheckbox.setValue(false);
                        enableCheckbox.setOnChanged(null);
                    }
                    onSuccess();
                }, error => {
                    viewObjectValue.hmi_value('');
                    queryParameterValue.hmi_value('');
                    enableCheckbox.setValue(false);
                    enableCheckbox.setOnChanged(null);
                    onError(error);
                });
            } else {
                viewObjectValue.hmi_value('');
                queryParameterValue.hmi_value('');
                enableCheckbox.setValue(false);
                enableCheckbox.setOnChanged(null);
                onSuccess();
            }
        };
        const viewObjectLabel = {
            x: 0,
            y: 0,
            text: 'JsonFX object:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const viewObjectValue = {
            x: 1,
            y: 0,
            type: 'textfield',
            editable: editable === true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_addChangeListener(onEdited);
                }
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_removeChangeListener(onEdited);
                }
                onSuccess();
            }
        };
        const queryParameterLabel = {
            x: 0,
            y: 1,
            text: 'query parameter:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const queryParameterValue = {
            x: 1,
            y: 1,
            type: 'textfield',
            editable: editable === true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_addChangeListener(onEdited);
                }
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_removeChangeListener(onEdited);
                }
                onSuccess();
            }
        };
        const enableLabel = {
            x: 0,
            y: 2,
            text: 'enable:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const enableCheckbox = getCheckbox();
        const enableValue = {
            x: 1,
            y: 2,
            type: 'grid',
            columns: ['40px', 1],
            children: [{
                object: enableCheckbox
            }]
        };
        return {
            type: 'grid',
            columns: ['140px', 1],
            rows: [DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, 1],
            children: [viewObjectLabel, viewObjectValue, queryParameterLabel, queryParameterValue, enableLabel, enableValue],
            onKeyChanged,
            getValue: () => {
                let flags = 0;
                if (enableCheckbox.getValue()) {
                    flags |= ContentManager.HMI_FLAG_ENABLE;
                }
                return {
                    viewObjectColumn: viewObjectValue.hmi_value(),
                    queryParameterColumn: queryParameterValue.hmi_value(),
                    flagsColumn: flags
                };
            }
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // TASKS - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getTaskView(hmi, adapter, editable) {
        const cms = hmi.env.cms;
        let watchEditActions = false;
        function onEdited() {
            if (watchEditActions) {
                adapter.edited();
            }
        }
        function onKeyChanged(data, language, onSuccess, onError) {
            watchEditActions = false;
            if (data && data.file) {
                cms.GetObject(data.file, undefined, ContentManager.RAW, data => {
                    if (data !== undefined) {
                        taskObjectValue.hmi_value(data.taskObjectColumn);
                        autorunCheckbox.setValue((data.flagsColumn & ContentManager.TASK_FLAG_AUTORUN) !== 0);
                        autorunCheckbox.setOnChanged(editable === true ? onEdited : null);
                        cycleIntervalMillisValue.hmi_value(data.cycleIntervalMillisColumn.toString());
                        watchEditActions = true;
                    } else {
                        taskObjectValue.hmi_value('');
                        autorunCheckbox.setValue(false);
                        autorunCheckbox.setOnChanged(null);
                        cycleIntervalMillisValue.hmi_value('');
                    }
                    onSuccess();
                }, error => {
                    taskObjectValue.hmi_value('');
                    autorunCheckbox.setValue(false);
                    autorunCheckbox.setOnChanged(null);
                    cycleIntervalMillisValue.hmi_value('');
                    onError(error);
                });
            } else {
                taskObjectValue.hmi_value('');
                autorunCheckbox.setValue(false);
                autorunCheckbox.setOnChanged(null);
                cycleIntervalMillisValue.hmi_value('');
                onSuccess();
            }
        };
        const taskObjectLabel = {
            x: 0,
            y: 0,
            text: 'JsonFX object:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const taskObjectValue = {
            x: 1,
            y: 0,
            type: 'textfield',
            editable: editable === true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_addChangeListener(onEdited);
                }
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_removeChangeListener(onEdited);
                }
                onSuccess();
            }
        };
        const autorunLabel = {
            x: 0,
            y: 1,
            text: 'autorun:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const autorunCheckbox = getCheckbox();
        if (editable === true) {
            autorunCheckbox.setOnChanged(onEdited);
        }
        const autorunValue = {
            x: 1,
            y: 1,
            type: 'grid',
            columns: ['40px', 1],
            children: [{
                object: autorunCheckbox
            }]
        };
        const cycleMillisLabel = {
            x: 0,
            y: 2,
            text: 'cycle millis:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const cycleIntervalMillisValue = {
            x: 1,
            y: 2,
            type: 'textfield',
            editable: editable === true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_addChangeListener(onEdited);
                }
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                if (editable === true) {
                    that.hmi_removeChangeListener(onEdited);
                }
                onSuccess();
            }
        };
        return {
            type: 'grid',
            columns: ['140px', 1],
            rows: [DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, DEFAULT_ROW_HEIGHT, 1],
            children: [taskObjectLabel, taskObjectValue, autorunLabel, autorunValue, cycleMillisLabel, cycleIntervalMillisValue],
            onKeyChanged,
            getValue: () => {
                let flags = 0;
                if (autorunCheckbox.getValue()) {
                    flags |= ContentManager.TASK_FLAG_AUTORUN;
                }
                const cycleIntervalMillisString = cycleIntervalMillisValue.hmi_value();
                let cycleIntervalMillis = 0;
                if (isNaN(cycleIntervalMillisString)) {
                    adapter.notifyError(`Invalid cycle interval millis '${cycleIntervalMillisString}`)
                } else {
                    cycleIntervalMillis = parseInt(cycleIntervalMillisString);
                }
                return {
                    taskObjectColumn: taskObjectValue.hmi_value(),
                    flagsColumn: flags,
                    cycleIntervalMillisColumn: cycleIntervalMillis
                };
            }
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // MAIN - PREVIEW & EDITOR & CONTENT EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getPreview(hmi, adapter) {
        const cms = hmi.env.cms, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let preview = false, sel_data, language;
        function reload() {
            unstress((onSuccess, onError) => {
                const handler = sel_data.extension ? handlers[sel_data.extension] : false;
                const next = handler ? handler : false;
                updateContainer(container, preview, next, sel_data, language, () => {
                    preview = next;
                    onSuccess();
                }, onError);
            });
        };
        adapter.triggerReload = reload;
        const jsonFxPreview = getJsonFxPreview(hmi, adapter);
        const textPreview = getTextPreview(hmi, adapter);
        const labelPreview = getLabelView(hmi, adapter, false);
        const htmlPreview = getHtmlPreview(hmi, adapter);
        const hmiPreview = getHmiView(hmi, adapter, false);
        const taskPreview = getTaskView(hmi, adapter, false);
        const handlers = {};
        handlers[cms.GetExtensionForType(ContentManager.DataType.JsonFX)] = jsonFxPreview;
        handlers[cms.GetExtensionForType(ContentManager.DataType.Text)] = textPreview;
        handlers[cms.GetExtensionForType(ContentManager.DataType.Label)] = labelPreview;
        handlers[cms.GetExtensionForType(ContentManager.DataType.HTML)] = htmlPreview;
        handlers[cms.GetExtensionForType(ContentManager.DataType.HMI)] = hmiPreview;
        handlers[cms.GetExtensionForType(ContentManager.DataType.Task)] = taskPreview;
        const container = {
            type: 'container',
            update: (data, lang) => {
                sel_data = data;
                language = lang;
                reload();
            },
            scrolls_txt_raw: textPreview.scrolls_raw,
            scrolls_txt_build: textPreview.scrolls_build,
            scrolls_jso_raw: jsonFxPreview.scrolls_raw,
            scrolls_jso_build: jsonFxPreview.scrolls_build
        };
        return container;
    }

    function getRefactoring(hmi, adapter) {
        const cms = hmi.env.cms;
        let sel_data = false, mode = false, source = false, enabled = true;
        function update() {
            button_move.hmi_setEnabled(enabled && sel_data !== false && (sel_data.file !== undefined || sel_data.folder !== undefined));
            button_move.hmi_setSelected(enabled && source !== false && mode === ContentManager.MOVE);
            button_copy.hmi_setEnabled(enabled && sel_data !== false && (sel_data.file !== undefined || sel_data.folder !== undefined));
            button_copy.hmi_setSelected(enabled && source !== false && mode === ContentManager.COPY);
            let paste_enabled = enabled && source !== false;
            if (source.extension && !sel_data.extension) {
                paste_enabled = false;
            }
            if (source.folder && !sel_data.folder) {
                paste_enabled = false;
            }
            if (source.id === sel_data.id) {
                paste_enabled = false;
            }
            button_paste.hmi_setEnabled(paste_enabled);
            button_delete.hmi_setEnabled(enabled && sel_data !== false && (sel_data.file !== undefined || sel_data.folder !== undefined));
            button_export.hmi_setEnabled(enabled && sel_data !== false && (sel_data.file !== undefined || sel_data.folder !== undefined));
            button_import.hmi_setEnabled(enabled);
            if (mode !== undefined && source !== false) {
                let info = mode;
                info += ': "';
                info += source.id;
                info += '" to: ';
                if (paste_enabled) {
                    info += '"';
                    info += sel_data.id;
                    info += '"';
                } else {
                    info += '?';
                }
                adapter.updateInfo(info);
            }
        };
        const button_move = {
            x: 1,
            y: 0,
            text: ContentManager.MOVE,
            border: true,
            enabled: false,
            clicked: () => {
                source = sel_data;
                mode = ContentManager.MOVE;
                update();
            }
        };
        const button_copy = {
            x: 2,
            y: 0,
            text: ContentManager.COPY,
            enabled: false,
            border: true,
            clicked: () => {
                source = sel_data;
                mode = ContentManager.COPY;
                update();
            }
        };
        const button_paste = {
            x: 3,
            y: 0,
            text: 'paste',
            enabled: false,
            border: true,
            clicked: () => {
                PerformRefactoring(hmi, source.id, sel_data.id, mode, params => {
                    let m = mode;
                    mode = false;
                    source = false;
                    update();
                    adapter.updateInfo('performed ' + m);
                    adapter.updateScrollParams(params);
                    adapter.reload(sel_data);
                }, error => {
                    mode = false;
                    source = false;
                    update();
                    adapter.notifyError(error);
                });
            }
        };
        const button_delete = {
            x: 4,
            y: 0,
            text: ContentManager.DELETE,
            enabled: false,
            border: true,
            clicked: () => {
                PerformRefactoring(hmi, sel_data.id, undefined, ContentManager.DELETE, params => {
                    mode = false;
                    source = false;
                    update();
                    adapter.updateInfo('performed remove');
                    adapter.updateScrollParams(params);
                    adapter.reload();
                }, error => { // TODO: This has not been called for SQL errors
                    mode = false;
                    source = false;
                    update();
                    adapter.notifyError(error);
                });
            }
        };
        const button_export = {
            x: 5,
            y: 0,
            text: 'export',
            enabled: false,
            border: true,
            timeout: 1000,
            longClicked: () => {
                const handler = cms.GetExchangeHandler();
                handler.HandleExport(sel_data.id, state => adapter.updateInfo(state !== undefined ? 'export ' + state : 'export ready'), adapter.notifyError);
            }
        };
        const button_import = {
            x: 6,
            y: 0,
            text: 'import',
            border: true,
            clicked: () => {
                Utilities.loadClientTextFile(text => {
                    const handler = cms.GetExchangeHandler();
                    handler.HandleImport(hmi, text.replace(/\r?\n|\r/g, '\n'), state => {
                        if (state !== undefined) {
                            adapter.updateInfo('import ' + state);
                        } else {
                            adapter.updateInfo('import ready');
                            adapter.reload();
                        }
                    }, adapter.notifyError);
                });
            }
        };
        const container = {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: 1,
            separator: SEPARATOR,
            children: [{
                x: 0,
                y: 0,
                align: 'right',
                text: 'refactoring:'
            }, button_move, button_copy, button_paste, button_delete, button_export, button_import],
            update: data => {
                sel_data = data;
                update();
            },
            setEnabled: en => {
                enabled = en;
                if (!en) {
                    source = false;
                }
                update();
            }
        };
        return container;
    }

    const HmiObjectsTableColumn = Object.freeze({
        Id: 0,
        ViewObject: 1,
        QueryParameter: 2,
        Enable: 3
    });

    function showHmisConfigurationDialog(hmi, adapter, currentlySelectedData) {
        const cms = hmi.env.cms;
        let hmiObjects = null;
        let selectedDataIndex = -1;
        let selectedDataEdited = false;
        function reload() {
            selectedDataIndex = -1;
            selectedDataEdited = false;
            viewObjectValue.hmi_value('');
            enableCheckbox.setOnChanged(null);
            enableCheckbox.setValue(false);
            queryParameterValue.hmi_value('');
            commitButton.hmi_setVisible(false);
            resetButton.hmi_setVisible(false);
            browseHmiObjectButton.hmi_setVisible(false);
            browseJsonFXObjectButton.hmi_setVisible(false);
            cms.GetHMIObjects(result => {
                hmiObjects = result;
                const tasks = [];
                for (let hmiObj of hmiObjects) {
                    (function () {
                        const obj = hmiObj;
                        obj.edited = false;
                        tasks.push((onSuccess, onError) => {
                            cms.GetChecksum(obj.file, checksum => {
                                obj.checksum = checksum;
                                onSuccess();
                            }, onError)
                        });
                    }());
                }
                Executor.run(tasks, () => {
                    try {
                        table.hmi_reload();
                    } catch (error) {
                        adapter.notifyError(`Error preparing hmi objects table: ${error}`);
                    }
                }, error => adapter.notifyError(`Error loading hmi objects: ${error}`));
            }, error => adapter.notifyError(`Error loading hmi objects: ${error}`));
        }
        const table = {
            y: 0,
            type: 'table',
            searching: true,
            paging: false,
            highlightSelectedRow: true,
            columns: [{
                width: 100,
                text: 'HMI object',
                textsAndNumbers: true
            }, {
                width: 100,
                text: 'JsonFX object',
                textsAndNumbers: true
            }, {
                width: 100,
                text: 'query parameter',
                textsAndNumbers: true
            }, {
                width: 10,
                text: 'enabled'
            }],
            getRowCount: () => hmiObjects ? hmiObjects.length : 0,
            getCellHtml: (rowIndex, columnIndex) => {
                const row = hmiObjects[rowIndex];
                switch (columnIndex) {
                    case HmiObjectsTableColumn.Id:
                        return row.id;
                    case HmiObjectsTableColumn.ViewObject:
                        return row.viewObject;
                    case HmiObjectsTableColumn.QueryParameter:
                        return row.queryParameter;
                    case HmiObjectsTableColumn.Enable:
                        return (row.flags & ContentManager.HMI_FLAG_ENABLE) !== 0 ? 'enabled' : 'disabled';
                    default:
                        return '';
                }
            },
            handleTableRowClicked: rowIndex => {
                if (rowIndex !== selectedDataIndex) {
                    const selectedData = hmiObjects[selectedDataIndex = rowIndex];
                    viewObjectValue.hmi_value(selectedData.viewObject);
                    enableCheckbox.setOnChanged(null);
                    enableCheckbox.setValue((selectedData.flags & ContentManager.HMI_FLAG_ENABLE) !== 0);
                    enableCheckbox.setOnChanged(onEnableEdited);
                    queryParameterValue.hmi_value(selectedData.queryParameter);
                    const hmiActionButtonsEnabled = !selectedDataEdited;
                    browseHmiObjectButton.hmi_setVisible(hmiActionButtonsEnabled);
                    browseJsonFXObjectButton.hmi_setVisible(hmiActionButtonsEnabled);
                }
            }
        };
        function onEdited() {
            if (!selectedDataEdited) {
                selectedDataEdited = true;
                commitButton.hmi_setVisible(true);
                resetButton.hmi_setVisible(true);
                browseHmiObjectButton.hmi_setVisible(false);
                browseJsonFXObjectButton.hmi_setVisible(false);
            }
        }
        const viewObjectLabel = {
            x: 0,
            text: 'JsonFX object:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const viewObjectValue = {
            x: 1,
            type: 'textfield',
            editable: true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                that.hmi_addChangeListener(onViewObjectEdited);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(onViewObjectEdited);
                onSuccess();
            }
        };
        function onViewObjectEdited() {
            if (selectedDataIndex !== -1) {
                onEdited();
                const selectedData = hmiObjects[selectedDataIndex];
                selectedData.edited = true;
                const value = viewObjectValue.hmi_value();
                if (value !== selectedData.viewObject) {
                    selectedData.viewObject = value;
                    table.hmi_value(selectedDataIndex, HmiObjectsTableColumn.ViewObject, value);
                }
            }
        }
        const queryParameterLabel = {
            x: 2,
            text: 'query parameter:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const queryParameterValue = {
            x: 3,
            type: 'textfield',
            editable: true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                that.hmi_addChangeListener(onQueryParameterEdited);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(onQueryParameterEdited);
                onSuccess();
            }
        };
        function onQueryParameterEdited() {
            if (selectedDataIndex !== -1) {
                onEdited();
                const selectedData = hmiObjects[selectedDataIndex];
                selectedData.edited = true;
                const value = queryParameterValue.hmi_value();
                if (value !== selectedData.queryParameter) {
                    selectedData.queryParameter = value;
                    table.hmi_value(selectedDataIndex, HmiObjectsTableColumn.QueryParameter, value);
                }
            }
        }
        const enableLabel = {
            x: 4,
            text: 'enable:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const enableCheckbox = getCheckbox();
        const enableValue = {
            x: 5,
            type: 'grid',
            columns: ['40px', 1],
            children: [{
                object: enableCheckbox
            }]
        };
        function onEnableEdited() {
            if (selectedDataIndex !== -1) {
                onEdited();
                const selectedData = hmiObjects[selectedDataIndex];
                selectedData.edited = true;
                const value = enableCheckbox.getValue();
                let flags = 0;
                if (value) {
                    flags |= ContentManager.HMI_FLAG_ENABLE;
                }
                if (flags !== selectedData.flags) {
                    selectedData.flags = flags;
                    table.hmi_value(selectedDataIndex, HmiObjectsTableColumn.Enable, value ? 'enabled' : 'disabled');
                }
            }
        }
        const editorGrid = {
            y: 1,
            type: 'grid',
            columns: ['140px', 3, '140px', 1, '140px', '80px'],
            rows: 1,
            children: [viewObjectLabel, viewObjectValue, queryParameterLabel, queryParameterValue, enableLabel, enableValue],
        };
        const commitButton = {
            text: 'commit',
            visible: false,
            click: onClose => {
                const tasks = [];
                for (let hmiObj of hmiObjects) {
                    if (hmiObj.edited) {
                        (function () {
                            const obj = hmiObj;
                            tasks.push((onSuccess, onError) => {
                                performModification(hmi, obj.checksum, obj.file, obj.file, undefined, {
                                    viewObjectColumn: obj.viewObject,
                                    queryParameterColumn: obj.queryParameter,
                                    flagsColumn: obj.flags
                                }, params => onSuccess(), onError);
                            });
                        }());
                    }
                }
                Executor.run(tasks, () => {
                    reload();
                    if (currentlySelectedData) {
                        adapter.stateChanged(false, currentlySelectedData);
                    }
                }, error => {
                    adapter.notifyError(`Error loading hmi objects: ${error}`);
                    reload();
                    if (currentlySelectedData) {
                        adapter.stateChanged(false, currentlySelectedData);
                    }
                });
            }
        }
        const resetButton = { text: 'reset', visible: false, click: onClose => reload() }
        const browseHmiObjectButton = {
            text: 'browse HMI object',
            visible: false,
            click: onClose => {
                if (selectedDataIndex !== -1) {
                    adapter.selectInNavigator(cms.AnalyzeId(hmiObjects[selectedDataIndex].id));
                }
                onClose();
            }
        };
        const browseJsonFXObjectButton = {
            text: 'browse JsonFX object',
            visible: false,
            click: onClose => {
                if (selectedDataIndex !== -1) {
                    adapter.selectInNavigator(cms.AnalyzeId(hmiObjects[selectedDataIndex].viewObject));
                }
                onClose();
            }
        };
        const dialogObject = {
            title: 'HMI object configuration',
            width: Math.floor($(window).width() * 0.9),
            height: Math.floor($(window).height() * 0.95),
            object: {
                type: 'grid',
                rows: [1, '24px'],
                children: [table, editorGrid]
            },
            buttons: [commitButton, resetButton, browseHmiObjectButton, browseJsonFXObjectButton, {
                text: 'close',
                click: onClose => onClose()
            }]
        };
        hmi.showDialog(dialogObject);
        reload();
    }

    const TaskObjectsTableColumn = Object.freeze({
        Id: 0,
        TaskObject: 1,
        CycleMillis: 2,
        Autorun: 3,
        State: 4
    });

    function showTasksConfigurationDialog(hmi, adapter, currentlySelectedData) {
        const cms = hmi.env.cms;
        let taskObjects = null;
        let selectedDataIndex = -1;
        let selectedDataEdited = false;
        function reload() {
            selectedDataIndex = -1;
            selectedDataEdited = false;
            taskObjectValue.hmi_value('');
            cycleIntervalMillisValue.hmi_value('');
            autorunCheckbox.setOnChanged(null);
            autorunCheckbox.setValue(false);
            commitButton.hmi_setVisible(false);
            resetButton.hmi_setVisible(false);
            startTaskButton.hmi_setVisible(false);
            stopTaskButton.hmi_setVisible(false);
            browseTaskObjectButton.hmi_setVisible(false);
            browseJsonFXObjectButton.hmi_setVisible(false);
            taskObjects = hmi.env.tasks.GetTasks();
            const tasks = [];
            for (let i = 0; i < taskObjects.length; i++) {
                (function () {
                    const taskObject = taskObjects[i];
                    taskObject.edited = false;
                    tasks.push((onSuccess, onError) => {
                        cms.GetChecksum(taskObject.config.file, checksum => {
                            taskObject.checksum = checksum;
                            onSuccess();
                        }, onError)
                    });
                }());
            }
            Executor.run(tasks, () => {
                try {
                    table.hmi_reload();
                } catch (error) {
                    adapter.notifyError(`Error preparing task objects table: ${error}`);
                }
            }, error => adapter.notifyError(`Error loading task objects: ${error}`));
        }
        function onStateChanged(path, state) {
            // TODO: remove console.log(`task '${path}', state: '${ObjectLifecycleManager.formatObjectLifecycleState(state)}'`);
            if (taskObjects) {
                for (let i = 0; i < taskObjects.length; i++) {
                    const taskObject = taskObjects[i];
                    if (taskObject.config.path === path) {
                        if (state !== taskObject.state) {
                            taskObject.state = state;
                            table.hmi_value(i, TaskObjectsTableColumn.State, ObjectLifecycleManager.formatObjectLifecycleState(state));
                        }
                        break;
                    }
                }
                if (!selectedDataEdited && selectedDataIndex !== -1) {
                    const selectedData = taskObjects[selectedDataIndex];
                    startTaskButton.hmi_setVisible(selectedData.state === ObjectLifecycleManager.LifecycleState.Idle);
                    stopTaskButton.hmi_setVisible(selectedData.state !== ObjectLifecycleManager.LifecycleState.Idle);
                }
            }
        }
        const table = {
            y: 0,
            type: 'table',
            searching: true,
            paging: false,
            highlightSelectedRow: true,
            columns: [{
                width: 100,
                text: 'task object',
                textsAndNumbers: true
            }, {
                width: 100,
                text: 'JsonFX object',
                textsAndNumbers: true
            }, {
                width: 50,
                text: 'cycle millis',
                textsAndNumbers: true
            }, {
                width: 10,
                text: 'autorun'
            }, {
                width: 20,
                text: 'state'
            }],
            getRowCount: () => taskObjects ? taskObjects.length : 0,
            getCellHtml: (rowIndex, columnIndex) => {
                const taskObject = taskObjects[rowIndex];
                switch (columnIndex) {
                    case TaskObjectsTableColumn.Id:
                        return taskObject.config.id;
                    case TaskObjectsTableColumn.TaskObject:
                        return taskObject.config.taskObject;
                    case TaskObjectsTableColumn.CycleMillis:
                        return taskObject.config.cycleMillis;
                    case TaskObjectsTableColumn.Autorun:
                        return (taskObject.config.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0 ? 'enabled' : 'disabled';
                    case TaskObjectsTableColumn.State:
                        return ObjectLifecycleManager.formatObjectLifecycleState(taskObject.state);
                    default:
                        return '';
                }
            },
            handleTableRowClicked: rowIndex => {
                if (rowIndex !== selectedDataIndex) {
                    const selectedData = taskObjects[selectedDataIndex = rowIndex];
                    const config = selectedData.config;
                    taskObjectValue.hmi_value(config.taskObject);
                    cycleIntervalMillisValue.hmi_value(config.cycleMillis.toString());
                    autorunCheckbox.setOnChanged(null);
                    autorunCheckbox.setValue((config.flags & ContentManager.TASK_FLAG_AUTORUN) !== 0);
                    autorunCheckbox.setOnChanged(onAutorunEdited);
                    startTaskButton.hmi_setVisible(!selectedDataEdited && selectedData.state === ObjectLifecycleManager.LifecycleState.Idle);
                    stopTaskButton.hmi_setVisible(!selectedDataEdited && selectedData.state !== ObjectLifecycleManager.LifecycleState.Idle);
                    browseTaskObjectButton.hmi_setVisible(!selectedDataEdited);
                    browseJsonFXObjectButton.hmi_setVisible(!selectedDataEdited);
                }
            }
        };
        function onEdited() {
            if (!selectedDataEdited) {
                selectedDataEdited = true;
                commitButton.hmi_setVisible(true);
                resetButton.hmi_setVisible(true);
                startTaskButton.hmi_setVisible(false);
                stopTaskButton.hmi_setVisible(false);
                browseTaskObjectButton.hmi_setVisible(false);
                browseJsonFXObjectButton.hmi_setVisible(false);
            }
        }
        const taskObjectLabel = {
            x: 0,
            text: 'JsonFX object:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const taskObjectValue = {
            x: 1,
            type: 'textfield',
            editable: true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                that.hmi_addChangeListener(onTaskObjectEdited);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(onTaskObjectEdited);
                onSuccess();
            }
        };
        function onTaskObjectEdited() {
            if (selectedDataIndex !== -1) {
                onEdited();
                const selectedData = taskObjects[selectedDataIndex];
                selectedData.edited = true;
                const value = taskObjectValue.hmi_value();
                if (value !== selectedData.config.taskObject) {
                    selectedData.config.taskObject = value;
                    table.hmi_value(selectedDataIndex, TaskObjectsTableColumn.TaskObject, value);
                }
            }
        }
        const cycleMillisLabel = {
            x: 2,
            text: 'cycle millis:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const cycleIntervalMillisValue = {
            x: 3,
            type: 'textfield',
            editable: true,
            border: false,
            classes: 'hmi-dark',
            prepare: (that, onSuccess, onError) => {
                that.hmi_addChangeListener(onCycleIntervalMillisEdited);
                onSuccess();
            },
            destroy: (that, onSuccess, onError) => {
                that.hmi_removeChangeListener(onCycleIntervalMillisEdited);
                onSuccess();
            }
        };
        function onCycleIntervalMillisEdited() {
            if (selectedDataIndex !== -1) {
                onEdited();
                const selectedData = taskObjects[selectedDataIndex];
                selectedData.edited = true;
                const cycleMillisString = cycleIntervalMillisValue.hmi_value();
                let cycleMillis = 0;
                if (isNaN(cycleMillisString)) {
                    adapter.notifyError(`Invalid cycle interval millis '${cycleMillisString}`)
                } else {
                    cycleMillis = parseInt(cycleMillisString);
                }
                if (cycleMillis !== selectedData.config.cycleMillis) {
                    selectedData.config.cycleMillis = cycleMillis;
                    table.hmi_value(selectedDataIndex, TaskObjectsTableColumn.CycleMillis, cycleMillis.toString());
                }
            }
        }
        const autorunLabel = {
            x: 4,
            text: 'autorun:',
            align: 'right',
            border: false,
            classes: 'hmi-dark'
        };
        const autorunCheckbox = getCheckbox();
        const autorunValue = {
            x: 5,
            type: 'grid',
            columns: ['40px', 1],
            children: [{
                object: autorunCheckbox
            }]
        };
        function onAutorunEdited() {
            if (selectedDataIndex !== -1) {
                onEdited();
                const selectedData = taskObjects[selectedDataIndex];
                selectedData.edited = true;
                const value = autorunCheckbox.getValue();
                let flags = 0;
                if (value) {
                    flags |= ContentManager.TASK_FLAG_AUTORUN;
                }
                if (flags !== selectedData.config.flags) {
                    selectedData.config.flags = flags;
                    table.hmi_value(selectedDataIndex, TaskObjectsTableColumn.Autorun, value ? 'enabled' : 'disabled');
                }
            }
        }
        const editorGrid = {
            y: 1,
            type: 'grid',
            columns: ['140px', 3, '140px', 1, '140px', '80px'],
            rows: 1,
            children: [taskObjectLabel, taskObjectValue, cycleMillisLabel, cycleIntervalMillisValue, autorunLabel, autorunValue],
        };
        const commitButton = {
            text: 'commit',
            visible: false,
            click: onClose => {
                const tasks = [];
                for (let taskObj of taskObjects) {
                    if (taskObj.edited) {
                        (function () {
                            const obj = taskObj;
                            tasks.push((onSuccess, onError) => {
                                const config = obj.config;
                                performModification(hmi, obj.checksum, config.file, config.file, undefined, {
                                    taskObjectColumn: config.taskObject,
                                    cycleIntervalMillisColumn: config.cycleMillis,
                                    flagsColumn: config.flags
                                }, params => onSuccess(), onError);
                            });
                        }());
                    }
                }
                Executor.run(tasks, () => {
                    selectedDataEdited = false;
                    if (currentlySelectedData) {
                        adapter.stateChanged(false, currentlySelectedData);
                    }
                }, error => {
                    adapter.notifyError(`Error loading hmi objects: ${error}`);
                    selectedDataEdited = false;
                    if (currentlySelectedData) {
                        adapter.stateChanged(false, currentlySelectedData);
                    }
                });
            }
        }
        const resetButton = { text: 'reset', visible: false, click: onClose => reload() }
        const startTaskButton = {
            text: 'start task',
            visible: false,
            click: onClose => {
                if (selectedDataIndex !== -1) {
                    const taskObject = taskObjects[selectedDataIndex];
                    hmi.env.tasks.StartTask(taskObject.config.path, response => adapter.updateInfo(response), error => adapter.notifyError(error));
                }
            }
        };
        const stopTaskButton = {
            text: 'stop task',
            visible: false,
            click: onClose => {
                if (selectedDataIndex !== -1) {
                    const taskObject = taskObjects[selectedDataIndex];
                    hmi.env.tasks.StopTask(taskObject.config.path, response => adapter.updateInfo(response), error => adapter.notifyError(error));
                }
            }
        };
        const browseTaskObjectButton = {
            text: 'browse task object',
            visible: false,
            click: onClose => {
                if (selectedDataIndex !== -1) {
                    adapter.selectInNavigator(cms.AnalyzeId(taskObjects[selectedDataIndex].config.id));
                }
                hmi.env.tasks.OnConfigChanged = null;
                hmi.env.tasks.OnStateChanged = null;
                onClose();
            }
        };
        const browseJsonFXObjectButton = {
            text: 'browse JsonFX object',
            visible: false,
            click: onClose => {
                if (selectedDataIndex !== -1) {
                    adapter.selectInNavigator(cms.AnalyzeId(taskObjects[selectedDataIndex].config.taskObject));
                }
                hmi.env.tasks.OnConfigChanged = null;
                hmi.env.tasks.OnStateChanged = null;
                onClose();
            }
        };
        const dialogObject = {
            title: 'Task object configuration',
            width: Math.floor($(window).width() * 0.9),
            height: Math.floor($(window).height() * 0.95),
            object: {
                type: 'grid',
                rows: [1, '24px'],
                children: [table, editorGrid]
            },
            buttons: [commitButton, resetButton, startTaskButton, stopTaskButton, browseTaskObjectButton, browseJsonFXObjectButton, {
                text: 'close',
                click: onClose => {
                    hmi.env.tasks.OnConfigChanged = null;
                    hmi.env.tasks.OnStateChanged = null;
                    onClose();
                }
            }]
        };
        hmi.showDialog(dialogObject);
        reload();
        hmi.env.tasks.OnConfigChanged = () => {
            if (!selectedDataEdited) {
                reload();
            }
        };
        hmi.env.tasks.OnStateChanged = onStateChanged;
    }

    function getEditController(hmi, adapter) {
        const cms = hmi.env.cms, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let editor = false, sel_data = false, sel_cs = false, edit_data = false, edit_cs = false, sel_lang, edit_lang;
        function reload() {
            unstress((onSuccess, onError) => {
                sel_cs = false;
                const handler = sel_data !== false && sel_data.extension ? handlers[sel_data.extension] : false;
                const next = handler ? handler : false;
                editListenerEnabled = false;
                updateContainer(editContainer, editor, next, sel_data, sel_lang, () => {
                    editListenerEnabled = true;
                    editor = next;
                    if (sel_data.file) {
                        cms.GetChecksum(sel_data.file, checksum => {
                            sel_cs = checksum;
                            onSuccess();
                        }, onError)
                    } else {
                        onSuccess();
                    }
                }, onError);
            });
        };
        let edited = false, editListenerEnabled = true, pending_commit = false, pending_reset = false;
        function updateEditorButtons() {
            const isJsonFX = sel_data.type === ContentManager.DataType.JsonFX;
            tasksButton.hmi_setEnabled(!edited && !pending_commit && !pending_reset);
            if (isJsonFX) {
                cms.IsTaskObject(sel_data.id, response => {
                    tasksButton.hmi_setSelected(response === true);
                    if (typeof response === 'string') {
                        adapter.notifyError(response);
                    }
                }, error => {
                    tasksButton.hmi_setSelected(false);
                    adapter.notifyError(error);
                });
            } else {
                tasksButton.hmi_setSelected(false);
            }
            hmisButton.hmi_setEnabled(!edited && !pending_commit && !pending_reset);
            if (isJsonFX) {
                cms.IsHMIObject(sel_data.id, response => {
                    hmisButton.hmi_setSelected(response === true);
                    if (typeof response === 'string') {
                        adapter.notifyError(response);
                    }
                }, error => {
                    hmisButton.hmi_setSelected(false);
                    adapter.notifyError(error);
                });
            } else {
                hmisButton.hmi_setSelected(false);
            }
            commitButton.hmi_setEnabled(edited && !pending_commit && !pending_reset && edit_data.extension === sel_data.extension);
            resetButton.hmi_setEnabled(edited && !pending_commit && !pending_reset);
            if (edited && !pending_commit && !pending_reset) {
                let info = `edited: '${edit_data.id}'`;
                if (edit_data.extension === sel_data.extension) {
                    if (edit_data.id === sel_data.id) {
                        info += ' commit enabled';
                    } else {
                        info += ` commit as: '${sel_data.id}'`;
                    }
                } else {
                    info += ' commit disabled - invalid object id';
                }
                adapter.updateInfo(info);
            }
        };
        function performCommit(value) {
            pending_commit = true;
            updateEditorButtons();
            const data = adapter.getIdData();
            const lang = sel_data.type === ContentManager.DataType.Label ? undefined : edit_lang;
            performModification(hmi, edit_cs, edit_data.file, data.file, lang, value, params => {
                pending_commit = false;
                if (params) {
                    edited = false;
                    edit_data = false;
                    edit_cs = false;
                    edit_lang = false;
                    updateEditorButtons();
                    adapter.updateInfo('performed commit');
                    adapter.updateScrollParams(params);
                    adapter.stateChanged(false, data);
                } else {
                    updateEditorButtons();
                }
            }, error => {
                pending_commit = false;
                edit_data = false;
                edit_cs = false;
                edit_lang = false;
                updateEditorButtons();
                adapter.notifyError(error);
            });
        };
        adapter.triggerReload = reload;
        adapter.edited = () => {
            if (editListenerEnabled && !edited) {
                edited = true;
                edit_data = sel_data;
                edit_cs = sel_cs;
                edit_lang = sel_lang;
                updateEditorButtons();
                adapter.stateChanged(true);
            }
        };
        adapter.performCommit = value => {
            edit_data = sel_data;
            edit_cs = sel_cs;
            edit_lang = sel_lang;
            performCommit(value);
        };
        const jsonFxEditor = getJsonFxEditor(hmi, adapter);
        const textEditor = getTextEditor(hmi, adapter);
        const labelEditor = getLabelView(hmi, adapter, true);
        const htmlEditor = getHtmlEditor(hmi, adapter);
        const hmiEditor = getHmiView(hmi, adapter, true);
        const taskEditor = getTaskView(hmi, adapter, true);
        const handlers = {};
        handlers[cms.GetExtensionForType(ContentManager.DataType.JsonFX)] = jsonFxEditor;
        handlers[cms.GetExtensionForType(ContentManager.DataType.Text)] = textEditor;
        handlers[cms.GetExtensionForType(ContentManager.DataType.Label)] = labelEditor;
        handlers[cms.GetExtensionForType(ContentManager.DataType.HTML)] = htmlEditor;
        handlers[cms.GetExtensionForType(ContentManager.DataType.HMI)] = hmiEditor;
        handlers[cms.GetExtensionForType(ContentManager.DataType.Task)] = taskEditor;
        const editContainer = {
            type: 'container'
        };
        const hmisButton = {
            enabled: true,
            x: 1,
            y: 0,
            border: true,
            text: 'hmis',
            clicked: () => showHmisConfigurationDialog(hmi, adapter, sel_data),
            longClicked: () => {
                try {
                    if (sel_data && sel_data.type === ContentManager.DataType.JsonFX) {
                        cms.IsHMIObject(sel_data.id, response => {
                            if (response !== true) {
                                cms.AddDefaultHMIObject(sel_data.id, resp => {
                                    updateEditorButtons();
                                    adapter.reload();
                                }, error => {
                                    updateEditorButtons();
                                    adapter.notifyError(error);
                                });
                            }
                        }, error => adapter.notifyError(error));
                    }
                } catch (error) {
                    adapter.notifyError(error);
                }
            },
            timeout: 2000
        };
        const tasksButton = {
            enabled: true,
            x: 2,
            y: 0,
            border: true,
            text: 'tasks',
            clicked: () => showTasksConfigurationDialog(hmi, adapter, sel_data),
            longClicked: () => {
                try {
                    if (sel_data && sel_data.type === ContentManager.DataType.JsonFX) {
                        cms.IsTaskObject(sel_data.id, response => {
                            if (response !== true) {
                                cms.AddDefaultTaskObject(sel_data.id, resp => {
                                    updateEditorButtons();
                                    adapter.reload();
                                }, error => {
                                    updateEditorButtons();
                                    adapter.notifyError(error);
                                });
                            }
                        }, error => adapter.notifyError(error));
                    }
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            },
            timeout: 2000
        };
        const commitButton = {
            enabled: false,
            x: 3,
            y: 0,
            border: true,
            text: 'commit',
            clicked: () => {
                try {
                    performCommit(editor.getValue());
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            }
        };
        const resetButton = {
            x: 4,
            y: 0,
            text: 'reset',
            enabled: false,
            border: true,
            clicked: () => {
                edited = false;
                updateEditorButtons();
                adapter.stateChanged(false, sel_data);
                adapter.updateInfo('performed reset');
            }
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: 1,
            separator: SEPARATOR,
            children: [{
                x: 0,
                y: 0,
                align: 'right',
                text: 'editor:'
            }, tasksButton, hmisButton, commitButton, resetButton],
            update: (data, lang) => {
                sel_data = data;
                sel_lang = lang;
                if (!edited) {
                    reload();
                }
                updateEditorButtons();
            },
            editor: editContainer,
            scrolls_htm: htmlEditor.scrolls,
            scrolls_txt: textEditor.scrolls,
            scrolls_jso: jsonFxEditor.scrolls
        };
    }

    function create(hmi) {
        // For every kind of text editors or previews we store the scroll positions
        // so it it easy to switch between objects and stay where you are.
        const scroll_positions = [];
        // We show messages and show and collect error messages.
        const log_handler = getLogHandler(hmi);
        // All editor controls are encapsulated and do not have any knowledge about
        // any other control.
        // The signals between the controls are handled by the following adapters
        // with define the callbacks used inside the respective control.
        const language_selector_adapter = {
            languageChanged: language => {
                edit_ctrl.update(key_textfield.getIdData(), language);
                preview.update(references.getIdData(), language);
            }
        };
        const key_textfield_adapter = {
            keyEdited: data => {
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            },
            keySelected: data => {
                if (browser_tree.hmi_isVisible()) {
                    browser_tree.expand(data);
                }
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        const browser_tree_adapter = {
            notifyError: log_handler.pushError,
            notifyTimeout: data => log_handler.pushTimeout('timeout loading browser: "' + data.id + '"'),
            keySelected: data => {
                key_textfield.update(data);
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        const search_container_adapter = {
            notifyError: log_handler.pushError,
            keySelected: data => {
                key_textfield.update(data);
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        function selectInNavigator(data) {
            key_textfield.update(data);
            navigator.showBrowser();
            browser_tree.expand(data);
            references.setRootIdData(data);
            refactoring.update(data);
            edit_ctrl.update(data, language_selector.getLanguage());
            preview.update(data, language_selector.getLanguage());
        }
        const references_adapter = {
            notifyError: log_handler.pushError,
            notifyTimeout: data => log_handler.pushTimeout('timeout loading references: "' + data.id + '"'),
            keySelected: data => preview.update(data, language_selector.getLanguage()),
            selectInNavigator: data => selectInNavigator(data)
        };
        const refactoring_adapter = {
            updateInfo: log_handler.updateInfo,
            notifyError: log_handler.pushError,
            updateScrollParams: params => updateScrolls(scroll_positions, params),
            reload: d => {
                if (d) {
                    key_textfield.update(d);
                }
                const data = key_textfield.getIdData();
                if (browser_tree.hmi_isVisible()) {
                    browser_tree.expand(data);
                }
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
                // TODO correct to call this here?
                log_handler.reset();
            }
        };
        const navigator_adapter = {
            showBrowserTree: () => {
                search_container.hmi_setVisible(false);
                browser_tree.hmi_setVisible(true);
                browser_tree.hmi_updateLoadedNodes();
            },
            showSearchTable: () => {
                browser_tree.hmi_setVisible(false);
                search_container.hmi_setVisible(true);
            },
            reload: () => {
                if (browser_tree.hmi_isVisible()) {
                    browser_tree.hmi_updateLoadedNodes();
                }
                const data = key_textfield.getIdData();
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        const edit_ctrl_adapter = {
            notifyError: log_handler.pushError,
            notifyTimeout: data => log_handler.pushTimeout('timeout loading editor: "' + data.id + '"'),
            updateInfo: log_handler.updateInfo,
            getIdData: () => key_textfield.getIdData(),
            updateScrollParams: params => updateScrolls(scroll_positions, params),
            stateChanged: (edited, data) => {
                refactoring.setEnabled(!edited);
                if (!edited) {
                    key_textfield.update(data);
                    if (browser_tree.hmi_isVisible()) {
                        browser_tree.expand(data);
                    }
                    references.setRootIdData(data);
                    refactoring.update(data);
                    edit_ctrl.update(data, language_selector.getLanguage());
                    preview.update(data, language_selector.getLanguage());
                    // TODO correct to call this here?
                    log_handler.reset();
                }
            },
            reload: () => {
                if (browser_tree.hmi_isVisible()) {
                    browser_tree.hmi_updateLoadedNodes();
                }
                const data = key_textfield.getIdData();
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            },
            selectInNavigator: data => selectInNavigator(data)
        };
        const preview_adapter = {
            notifyError: log_handler.pushError,
            notifyTimeout: data => log_handler.pushTimeout('timeout loading preview: "' + data.id + '"')
        };
        // CONTROLS
        const language_selector = getLanguageSelector(hmi, language_selector_adapter);
        const key_textfield = getKeyTextfield(hmi, key_textfield_adapter);
        const browser_tree = getBrowserTree(hmi, browser_tree_adapter);
        const search_container = getSearchContainer(hmi, search_container_adapter);
        const navigator = getNavigator(hmi, navigator_adapter, key_textfield, browser_tree, search_container);
        const references = getReferences(hmi, references_adapter);
        const refactoring = getRefactoring(hmi, refactoring_adapter);
        const edit_ctrl = getEditController(hmi, edit_ctrl_adapter);
        const preview = getPreview(hmi, preview_adapter);
        // SCROLL POSITIONS
        scroll_positions.push(edit_ctrl.scrolls_htm);
        scroll_positions.push(edit_ctrl.scrolls_txt);
        scroll_positions.push(edit_ctrl.scrolls_jso);
        scroll_positions.push(preview.scrolls_txt_raw);
        scroll_positions.push(preview.scrolls_txt_build);
        scroll_positions.push(preview.scrolls_jso_raw);
        scroll_positions.push(preview.scrolls_jso_build);
        // HEADER
        language_selector.x = 0;
        language_selector.y = 0;
        refactoring.x = 1;
        refactoring.y = 0;
        edit_ctrl.x = 2;
        edit_ctrl.y = 0;
        const header = {
            x: 0,
            y: 0,
            type: 'grid',
            columns: [1, 1, 1],
            rows: 1,
            children: [language_selector, refactoring, edit_ctrl]
        };
        // FOOTER
        log_handler.x = 0;
        log_handler.y = 0;
        log_handler.info.x = 1;
        log_handler.info.y = 0;
        const time = {
            x: 2,
            y: 0,
            refresh: (that, date) => {
                // clock (updates every second)
                var last = footer._last, sec = Math.ceil(date.getTime() / 1000);
                if (last !== sec) {
                    last = sec;
                    time.hmi_text(date.toLocaleString());
                }
            }
        };
        const footer = {
            x: 0,
            y: 2,
            type: 'grid',
            columns: ['40px', 1, '160px'],
            rows: 1,
            separator: SEPARATOR,
            border: true,
            children: [log_handler, log_handler.info, time]
        };
        // CONTENT EDITOR
        navigator.location = 'top';
        references.location = 'bottom';
        edit_ctrl.editor.location = 'top';
        preview.location = 'bottom';
        return {
            type: 'grid',
            rows: [DEFAULT_ROW_HEIGHT, 1, DEFAULT_ROW_HEIGHT],
            children: [header, {
                x: 0,
                y: 1,
                type: 'split',
                rightSize: Mathematics.GOLDEN_CUT_INVERTED,
                children: [{
                    location: 'left',
                    type: 'split',
                    topSize: Mathematics.GOLDEN_CUT_INVERTED,
                    children: [navigator, references]
                }, {
                    location: 'right',
                    type: 'split',
                    children: [edit_ctrl.editor, preview]
                }]
            }, footer],
            notifyError: log_handler.pushError
        };
    }
    ContentEditor.create = create;

    Object.freeze(ContentEditor);
    root.ContentEditor = ContentEditor;
}(globalThis));
