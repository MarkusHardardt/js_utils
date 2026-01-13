(function (root) {
    "use strict";
    const ContentEditor = {};
    const isNodeJS = typeof require === 'function';
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;

    const DEFAULT_ROW_HEIGHT = '24px';
    const DEFAULT_COLUMN_WIDTH = '64px';
    const SMALL_COLUMN_WIDTH = '42px';
    const BIG_COLUMN_WIDTH = '80px';
    const HEADER_HEIGHT = '54px';
    const DEFAULT_TIMEOUT = 2000;
    const ALARM_COLOR = '#ff0000';
    const VALID_COLOR = '#000000';
    const SEPARATOR = 4;

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // DIVERSE
    // ///////////////////////////////////////////////////////////////////////////////////////////////

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
                // nothing to do
                break;
            case ContentManager.UPDATE:
                // nothing to do
                break;
        }
    }

    function getHandler(desc, lab, htm, txt, jso) {
        if (!desc) {
            return false;
        } else if (desc.JsonFX) {
            return { cont: jso, desc };
        } else if (!desc.multilingual) {
            return { cont: txt, desc };
        } else if (desc.multiedit) {
            return { cont: lab, desc };
        } else {
            return { cont: htm, desc };
        }
    }

    function updateContainer(container, previous, next, data, language, onSuccess, onError) {
        if (previous) {
            if (next) {
                if (previous !== next) {
                    previous.keyChanged(false, language, () => {
                        container.hmi_removeContent(() => {
                            container.hmi_setContent(next, () => next.keyChanged(data, language, onSuccess, onError), onError);
                        }, onError);
                    }, onError);
                } else {
                    next.keyChanged(data, language, onSuccess, onError);
                }
            } else {
                previous.keyChanged(false, language, () => container.hmi_removeContent(onSuccess, onError), onError);
            }
        } else if (next) {
            container.hmi_setContent(next, () => next.keyChanged(data, language, onSuccess, onError), onError);
        } else {
            onSuccess();
        }
    }

    function performModification(hmi, startEditChecksum, startEditId, id, language, value, onSuccess, onError) {
        let cms = hmi.cms, tasks = [], checksum = false, equal_id = startEditId === id;
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
                let txt = '<b>';
                txt += 'Object has been modified!';
                txt += '</b><br><code>';
                txt += id;
                txt += '</code><br><br>';
                txt += 'Select new id';
                hmi.showDefaultConfirmationPopup({
                    width: $(window).width() * 0.4,
                    height: $(window).height() * 0.3,
                    title: 'Warning',
                    html: txt,
                    ok: () => onSuccess(false),
                    closed: () => onSuccess(false)
                });
            } else {
                cms.GetModificationParams(id, language, value, params => {
                    if (typeof params.error === 'string') {
                        if (typeof onError === 'function') {
                            onError(params.error);
                        }
                    } else if (params.action === 'delete') {
                        if (Array.isArray(params.externalUsers) && params.externalUsers.length > 0) {
                            let txt = '<b>';
                            txt += 'Object is referenced!';
                            txt += '</b><br><b>';
                            txt += 'Sure to proceed?';
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
                            hmi.showDefaultConfirmationPopup({
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
                    } else if (!equal_id) {
                        // if the id has changed
                        cms.Exists(id, exists => {
                            if (exists !== false) {
                                let txt = '<b>';
                                txt += 'Identificator already exists!';
                                txt += '</b><br><code>';
                                txt += id;
                                txt += '</code><br><br>';
                                txt += 'Sure to proceed?';
                                hmi.showDefaultConfirmationPopup({
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
        var cms = hmi.cms;
        cms.GetRefactoringParams(source, target, action, params => {
            // console.log(JSONX.stringify(i_params));
            if (typeof params.error === 'string') {
                hmi.showDefaultConfirmationPopup({
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
                    txt += 'Object is referenced!';
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
                    txt += 'Delete:';
                    txt += ':</b><br><code>';
                    txt += source;
                    txt += '</code>';
                }
                txt += '<br><br><b>';
                txt += 'Sure to proceed?';
                txt += '</b>';
                hmi.showDefaultConfirmationPopup({
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
                    txt += 'Object already exists!';
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
                    hmi.showDefaultConfirmationPopup({
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
        let langs = hmi.cms.GetLanguages(), language = langs[0], children = [{
            x: 0,
            y: 0,
            align: 'right',
            text: 'languages:'
        }], columns = [1], select_language = btn => {
            for (let i = 0, l = children.length; i < l; i++) {
                let button = children[i];
                button.hmi_setSelected(button === btn);
            }
            language = btn.text;
            adapter.languageChanged(language);
        };
        for (let i = 0, l = langs.length; i < l; i++) {
            let lang = langs[i];
            children.push({
                x: i + 1,
                y: 0,
                text: lang,
                border: true,
                selected: i === 0,
                clicked: function () { // Note: Do not change to lambda function becaus 'this' will not be the button anymore!
                    select_language(this);
                }
            });
            columns.push(DEFAULT_COLUMN_WIDTH);
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
        let errors = [], last_read_offset = 0, push = entry => {
            let idx = Sorting.getInsertionIndex(entry, errors, false, compareErrors);
            errors.splice(idx, 0, entry);
            last_read_offset++;
            update();
        }, update = () => {
            let active = last_read_offset > 0;
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
                let table = {
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
                        let error = errors[row];
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
                    handleTableRowClicked: (row) => {
                        let error = errors[row];
                        textarea.hmi_value(Utilities.formatTimestamp(error.date) + '\n' + error.text);
                    }
                };
                let textarea = {
                    location: 'bottom',
                    type: 'textarea',
                    editable: false
                };
                let popup_object = {
                    type: 'split',
                    topSize: Mathematics.GOLDEN_CUT_INVERTED,
                    columns: 1,
                    rows: [3, 1],
                    children: [table, textarea]
                };
                let buttons = [];
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
                hmi.showPopup({
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
        const cms = hmi.cms;
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
        let cms = hmi.cms, sel_data, selected = false, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
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
        let cms = hmi.cms, search_running = false, perform_search = () => {
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
        let button_select_browse = {
            x: 1,
            y: 0,
            text: 'browse',
            border: true,
            selected: true,
            clicked: () => update_mode(button_select_browse)
        };
        let button_select_search = {
            x: 2,
            y: 0,
            text: 'search',
            border: true,
            clicked: () => update_mode(button_select_search)
        };
        let button_reload = {
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
        let cms = hmi.cms, sel_data, selected = false, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let text = {
            x: 0,
            y: 1,
            width: 4,
            height: 1,
            id: 'path',
            type: 'textfield',
            readonly: true
        };
        let tree = {
            x: 0,
            y: 2,
            width: 4,
            height: 1,
            type: 'tree',
            rootURL: ContentManager.GET_CONTENT_TREE_NODES_URL,
            rootRequest: ContentManager.COMMAND_GET_REFERENCES_TO_TREE_NODES,
            compareNodes: (node1, node2) => cms.CompareIds(node1.data.path, node2.data.path),
            nodeActivated: node => {
                let path = node.data.path;
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
                text.hmi_value(sel_data.id);
                tree.hmi_setRootPath(sel_data.id, onSuccess, onError);
            });
        };
        let buttonRefTo = {
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
        let buttonRefFrom = {
            x: 2,
            y: 0,
            border: true,
            text: 'users',
            clicked: () => {
                tree.rootRequest = ContentManager.COMMAND_GET_REFERENCES_FROM_TREE_NODES;
                updateReferences(buttonRefFrom);
            }
        };
        let buttonEdit = {
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

    function getLabPreview(hmi, adapter) {
        let cms = hmi.cms, langs = hmi.cms.GetLanguages(), children = [], rows = [], values = {};
        function reload(data, language, onSuccess, onError) {
            if (data && data.file) {
                cms.GetObject(data.file, undefined, ContentManager.INCLUDE, build => {
                    if (build !== undefined) {
                        for (let i = 0, l = langs.length; i < l; i++) {
                            let lang = langs[i], lab = build[lang];
                            values[lang].hmi_html(lab || '');
                        }
                    } else {
                        for (let i = 0, l = langs.length; i < l; i++) {
                            values[langs[i]].hmi_html('');
                        }
                    }
                    onSuccess();
                }, error => {
                    for (let i = 0, l = langs.length; i < l; i++) {
                        values[langs[i]].hmi_html('');
                    }
                    onError(error);
                });
            } else {
                for (let i = 0, l = langs.length; i < l; i++) {
                    values[langs[i]].hmi_html('');
                }
                onSuccess();
            }
        };
        for (let i = 0, l = langs.length; i < l; i++) {
            let lang = langs[i];
            children.push({
                x: 0,
                y: i,
                text: lang,
                border: false,
                classes: 'hmi-dark'
            });
            let obj = {
                x: 1,
                y: i,
                align: 'left',
                border: false,
                classes: 'hmi-dark'
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
            keyChanged: (data, language, onSuccess, onError) => reload(data, language, onSuccess, onError)
        };
    }

    function getLabEditor(hmi, adapter) {
        let cms = hmi.cms, langs = cms.GetLanguages(), children = [], rows = [], values = {};
        function reload(data, language, onSuccess, onError) {
            if (data && data.file) {
                cms.GetObject(data.file, undefined, ContentManager.RAW, raw => {
                    if (raw !== undefined) {
                        for (let i = 0, l = langs.length; i < l; i++) {
                            let lang = langs[i], lab = raw[lang];
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
            let lang = langs[i];
            children.push({
                x: 0,
                y: i,
                text: lang,
                border: false,
                classes: 'hmi-dark'
            });
            let obj = {
                x: 1,
                y: i,
                type: 'textfield',
                editable: true,
                border: false,
                classes: 'hmi-dark',
                prepare: (that, onSuccess, onError) => {
                    that.hmi_addChangeListener(adapter.edited);
                    onSuccess();
                },
                destroy: (that, onSuccess, onError) => {
                    that.hmi_removeChangeListener(adapter.edited);
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
            keyChanged: reload,
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

    function getHtmPreview(hmi, adapter) {
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
                        hmi.cms.GetObject(data.file, language, ContentManager.RAW, raw => {
                            preview.hmi_html(raw !== undefined ? raw : '');
                            onSuccess();
                        }, error => {
                            preview.hmi_html('');
                            onError(error);
                        });
                        break;
                    case ContentManager.INCLUDE:
                        hmi.cms.GetObject(data.file, language, ContentManager.INCLUDE, build => {
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
        let preview = {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
            border: false,
            scrollable: true
        };
        let info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        let button_include = {
            x: 1,
            y: 1,
            text: 'include',
            border: true,
            clicked: () => update_mode(ContentManager.INCLUDE)
        };
        let button_raw = {
            x: 2,
            y: 1,
            text: 'raw',
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [preview, info_lang, button_include, button_raw],
            keyChanged: (data, language, onSuccess, onError) => {
                info_lang.hmi_text('language: "' + language + '"');
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

    function getHtmEditor(hmi, adapter) {
        let cms = hmi.cms, scrolls = {};
        function reload(data, language, onSuccess, onError) {
            info_lang.hmi_text('language: "' + language + '"');
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
        var textarea = {
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
        var info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        return {
            type: 'grid',
            columns: 1,
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [textarea, info_lang],
            keyChanged: reload,
            getValue: () => textarea.hmi_value().trim(),
            scrolls: scrolls
        };
    };

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // TEXT - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getTxtPreview(hmi, adapter) {
        let cms = hmi.cms, mode = ContentManager.RAW, scrolls_raw = {}, scrolls_build = {};
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
        let textarea = {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
            type: 'textarea',
            code: 'javascript',
            editable: false
        };
        let info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        let button_include = {
            x: 1,
            y: 1,
            text: 'include',
            border: true,
            clicked: () => update_mode(ContentManager.INCLUDE)
        };
        let button_raw = {
            x: 2,
            y: 1,
            text: 'raw',
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [textarea, info_lang, button_include, button_raw],
            keyChanged: (data, language, onSuccess, onError) => {
                info_lang.hmi_text('language: "' + language + '"');
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

    function getTxtEditor(hmi, adapter) {
        let cms = hmi.cms, scrolls = {};
        function reload(data, language, onSuccess, onError) {
            info_lang.hmi_text('language: "' + language + '"');
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
        let textarea = {
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
        let info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        return {
            type: 'grid',
            columns: 1,
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [textarea, info_lang],
            keyChanged: reload,
            getValue: () => textarea.hmi_value().trim(),
            scrolls
        };
    }

    // ///////////////////////////////////////////////////////////////////////////////////////////////
    // JSONFX - PREVIEW & EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getJsoPreview(hmi, adapter) {
        let cms = hmi.cms, scrolls_raw = {}, scrolls_build = {}, mode = ContentManager.RAW;
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
        let textarea = {
            x: 0,
            y: 0,
            width: 3,
            height: 1,
            type: 'textarea',
            code: 'javascript',
            editable: false
        };
        let container = {
            x: 0,
            y: 0,
            width: 4,
            height: 1,
            type: 'container'
        };
        let info_lang = {
            x: 0,
            y: 1,
            align: 'left'
        };
        let button_hmi = {
            x: 1,
            y: 1,
            text: 'hmi',
            border: true,
            clicked: () => update_mode(ContentManager.PARSE)
        };
        let button_include = {
            x: 2,
            y: 1,
            text: 'include',
            border: true,
            clicked: () => update_mode(ContentManager.INCLUDE)
        };
        let button_raw = {
            x: 3,
            y: 1,
            text: 'raw',
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        return {
            type: 'grid',
            columns: [1, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH, DEFAULT_COLUMN_WIDTH],
            rows: [1, DEFAULT_ROW_HEIGHT],
            children: [container, info_lang, button_hmi, button_include, button_raw],
            keyChanged: (data, language, onSuccess, onError) => {
                info_lang.hmi_text('language: "' + language + '"');
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

    function getJsoEditor(hmi, adapter) {
        let cms = hmi.cms, scrolls = {}, mode = ContentManager.RAW;
        function update_mode(md) {
            mode = md;
            button_hmi.selected = md === ContentManager.PARSE;
            button_hmi.hmi_setSelected(button_hmi.selected);
            button_raw.selected = md === ContentManager.RAW;
            button_raw.hmi_setSelected(button_raw.selected);
            adapter.triggerReload();
        };
        let edited = false, object, raw, sel_data;
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
        let textarea = {
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
        let edit_listener = {
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
                        let obj = raw.children[index] || {
                            x: child && typeof child.x === 'number' ? child.x : 0,
                            y: child && typeof child.y === 'number' ? child.y : 0,
                            width: child && typeof child.width === 'number' ? child.width : 1,
                            height: child && typeof child.height === 'number' ? child.height : 1,
                            id: 'enter object node id here',
                            type: 'enter type here',
                            classes: 'highlighted-yellow',
                            text: 'enter text here',
                        };
                        let value = JsonFX.stringify(JsonFX.reconstruct(obj), true);
                        let src_obj = {
                            x: 0,
                            y: 0,
                            type: 'textarea',
                            code: 'javascript',
                            beautify: true,
                            value: value
                        };
                        let info_obj = {
                            x: 0,
                            y: 1,
                            align: 'left'
                        };
                        let popup_obj = {
                            type: 'grid',
                            columns: 1,
                            rows: [1, '30px'],
                            children: [src_obj, info_obj]
                        };
                        hmi.showPopup({
                            title: 'Edit',
                            width: Math.floor($(window).width() * 0.9),
                            height: Math.floor($(window).height() * 0.95),
                            object: popup_obj,
                            buttons: [{
                                text: 'commit',
                                click: onClose => {
                                    try {
                                        let value = src_obj.hmi_value().trim();
                                        let object = value.length > 0 ? JsonFX.parse(value, true, true) : undefined;
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
        let container = {
            x: 0,
            y: 0,
            type: 'container'
        };
        let info_lang = {
            x: 0,
            y: 0,
            align: 'left'
        };
        let button_hmi = {
            x: 1,
            y: 0,
            text: 'hmi',
            border: true,
            clicked: () => update_mode(ContentManager.PARSE)
        };
        let button_raw = {
            x: 2,
            y: 0,
            text: 'raw',
            border: true,
            selected: true,
            clicked: () => update_mode(ContentManager.RAW)
        };
        function get_value() {
            switch (mode) {
                case ContentManager.RAW:
                    let value = textarea.hmi_value().trim();
                    return value.length > 0 ? JsonFX.stringify(JsonFX.parse(value, true, true), false) : '';
                case ContentManager.PARSE:
                    if ((object.type === 'grid' || object.type === 'float') && Array.isArray(raw.children) && Array.isArray(object.children)) {
                        // first we got to update our raw coordinates
                        for (let i = 0, l = raw.children.length; i < l; i++) {
                            let raw_child = raw.children[i];
                            let obj_child = object.children[i];
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
                    throw new Error('Invalid mode: "' + mode + '"');
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
            keyChanged: (data, language, onSuccess, onError) => {
                edited = false;
                sel_data = data;
                info_lang.hmi_text('language: "' + language + '"');
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
    // MAIN - PREVIEW & EDITOR & CONTENT EDITOR
    // ///////////////////////////////////////////////////////////////////////////////////////////////

    function getPreview(hmi, adapter) {
        let cms = hmi.cms, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let preview = false, sel_data, language;
        function reload() {
            unstress((onSuccess, onError) => {
                var handler = sel_data.extension ? handlers[sel_data.extension] : false;
                var next = handler ? handler.cont : false;
                updateContainer(container, preview, next, sel_data, language, () => {
                    preview = next;
                    onSuccess();
                }, onError);
            });
        };
        adapter.triggerReload = reload;
        let lab = getLabPreview(hmi, adapter);
        let htm = getHtmPreview(hmi, adapter);
        let txt = getTxtPreview(hmi, adapter);
        let jso = getJsoPreview(hmi, adapter);
        let handlers = {};
        cms.GetDescriptors((ext, desc) => handlers[ext] = getHandler(desc, lab, htm, txt, jso));
        let container = {
            type: 'container',
            update: (data, lang) => {
                sel_data = data;
                language = lang;
                reload();
            },
            scrolls_txt_raw: txt.scrolls_raw,
            scrolls_txt_build: txt.scrolls_build,
            scrolls_jso_raw: jso.scrolls_raw,
            scrolls_jso_build: jso.scrolls_build
        };
        return container;
    }

    function getRefactoring(hmi, adapter) {
        let cms = hmi.cms, sel_data = false, mode = false, source = false, enabled = true;
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
        let button_move = {
            x: 1,
            y: 0,
            text: 'move',
            border: true,
            enabled: false,
            clicked: () => {
                source = sel_data;
                mode = ContentManager.MOVE;
                update();
            }
        };
        let button_copy = {
            x: 2,
            y: 0,
            text: 'copy',
            enabled: false,
            border: true,
            clicked: () => {
                source = sel_data;
                mode = ContentManager.COPY;
                update();
            }
        };
        let button_paste = {
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
        let button_delete = {
            x: 4,
            y: 0,
            text: 'delete',
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
                }, error => {
                    mode = false;
                    source = false;
                    update();
                    adapter.notifyError(error);
                });
            }
        };
        let button_export = {
            x: 5,
            y: 0,
            text: 'export',
            enabled: false,
            border: true,
            timeout: 1000,
            longClicked: () => {
                let handler = cms.GetExchangeHandler();
                handler.HandleExport(sel_data.id, state => adapter.updateInfo(state !== undefined ? 'export ' + state : 'export ready'), adapter.notifyError);
            }
        };
        let button_import = {
            x: 6,
            y: 0,
            text: 'import',
            border: true,
            clicked: () => {
                Utilities.loadClientTextFile(text => {
                    var handler = cms.GetExchangeHandler();
                    handler.HandleImport(hmi, text.replace(/\r?\n|\r/g, '\n'), state => {
                        if (state === undefined) {
                            adapter.updateInfo('import ' + state);
                        } else {
                            adapter.updateInfo('import ready');
                            adapter.reload();
                        }
                    }, adapter.notifyError);
                });
            }
        };
        let container = {
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

    function getEditController(hmi, adapter) {
        let cms = hmi.cms, unstress = Executor.unstress(adapter.notifyError, () => adapter.notifyTimeout(sel_data), DEFAULT_TIMEOUT);
        let editor = false, handler = false, valid_file = false, sel_data = false, sel_cs = false, edit_data = false, edit_cs = false, sel_lang, edit_lang;
        function reload() {
            unstress((onSuccess, onError) => {
                sel_cs = false;
                handler = sel_data !== false && sel_data.extension ? handlers[sel_data.extension] : false;
                let next = handler ? handler.cont : false;
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
        function update() {
            // TODO: console.log(`Selected: ${JSON.stringify(sel_data)}`);
            const isJsonFX = sel_data.JsonFX === true;
            tasksButton.hmi_setEnabled(!edited && !pending_commit && !pending_reset && isJsonFX);
            if (isJsonFX) {
                cms.IsProcessObject(sel_data.id, response => {
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
            hmisButton.hmi_setEnabled(!edited && !pending_commit && !pending_reset && isJsonFX);
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
                let info = 'edited: "';
                info += edit_data.id;
                info += '"';
                if (edit_data.extension === sel_data.extension) {
                    if (edit_data.id === sel_data.id) {
                        info += ' commit enabled';
                    } else {
                        info += ' commit as: "';
                        info += sel_data.id;
                        info += '"';
                    }
                } else {
                    info += ' commit disabled - invalid object id';
                }
                adapter.updateInfo(info);
            }
        };
        function perform_commit(value) {
            pending_commit = true;
            update();
            var data = adapter.getIdData();
            var lang = sel_data.multiedit ? undefined : edit_lang;
            performModification(hmi, edit_cs, edit_data.file, data.file, lang, value, params => {
                pending_commit = false;
                if (params) {
                    edited = false;
                    edit_data = false;
                    edit_cs = false;
                    edit_lang = false;
                    update();
                    adapter.updateInfo('performed commit');
                    adapter.updateScrollParams(params);
                    adapter.stateChanged(false, data);
                } else {
                    update();
                }
            }, error => {
                pending_commit = false;
                edit_data = false;
                edit_cs = false;
                edit_lang = false;
                update();
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
                update();
                adapter.stateChanged(true);
            }
        };
        adapter.performCommit = value => {
            edit_data = sel_data;
            edit_cs = sel_cs;
            edit_lang = sel_lang;
            perform_commit(value);
        };
        let lab = getLabEditor(hmi, adapter);
        let htm = getHtmEditor(hmi, adapter);
        let txt = getTxtEditor(hmi, adapter);
        let jso = getJsoEditor(hmi, adapter);
        let handlers = {};
        cms.GetDescriptors((ext, desc) => handlers[ext] = getHandler(desc, lab, htm, txt, jso));
        let editContainer = {
            type: 'container'
        };
        let hmisButton = {
            enabled: false,
            x: 1,
            y: 0,
            border: true,
            text: 'hmis',
            clicked: () => {
                try {
                    // TODO perform_commit(editor.getValue());
                    console.log('Clicked hmis button');
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            },
            longClicked: () => {
                try {
                    cms.IsHMIObject(sel_data.id, response => {
                        cms.SetAvailabilityAsHMIObject(sel_data.id, response !== true, resp => update(), error => {
                            update();
                            adapter.notifyError(error);
                        });
                    }, error => adapter.notifyError(error));
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            },
            timeout: 2000
        };
        let tasksButton = {
            enabled: false,
            x: 2,
            y: 0,
            border: true,
            text: 'tasks',
            clicked: () => {
                try {
                    // TODO perform_commit(editor.getValue());
                    console.log('Clicked hmis button');
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            },
            longClicked: () => {
                try {
                    cms.IsProcessObject(sel_data.id, response => {
                        cms.SetAvailabilityAsProcessObject(sel_data.id, response !== true, resp => update(), error => {
                            update();
                            adapter.notifyError(error);
                        });
                    }, error => adapter.notifyError(error));
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            },
            timeout: 2000
        };
        let commitButton = {
            enabled: false,
            x: 3,
            y: 0,
            border: true,
            text: 'commit',
            clicked: () => {
                try {
                    perform_commit(editor.getValue());
                } catch (exc) {
                    adapter.notifyError(exc);
                }
            }
        };
        let resetButton = {
            x: 4,
            y: 0,
            text: 'reset',
            enabled: false,
            border: true,
            clicked: () => {
                edited = false;
                update();
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
                update();
            },
            editor: editContainer,
            scrolls_htm: htm.scrolls,
            scrolls_txt: txt.scrolls,
            scrolls_jso: jso.scrolls
        };
    }

    function create(hmi) {
        // For every kind of text editors or previews we store the scroll positions
        // so it it easy to switch between objects and stay where you are.
        let scroll_positions = [];
        // We show messages and show and collect error messages.
        let log_handler = getLogHandler(hmi);
        // All editor controls are encapsulated and do not have any knowledge about
        // any other control.
        // The signals between the controls are handled by the following adapters
        // with define the callbacks used inside the respective control.
        let language_selector_adapter = {
            languageChanged: language => {
                edit_ctrl.update(key_textfield.getIdData(), language);
                preview.update(references.getIdData(), language);
            }
        };
        let key_textfield_adapter = {
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
        let browser_tree_adapter = {
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
        let search_container_adapter = {
            notifyError: log_handler.pushError,
            keySelected: data => {
                key_textfield.update(data);
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        let references_adapter = {
            notifyError: log_handler.pushError,
            notifyTimeout: data => log_handler.pushTimeout('timeout loading references: "' + data.id + '"'),
            keySelected: data => preview.update(data, language_selector.getLanguage()),
            selectInNavigator: data => {
                key_textfield.update(data);
                navigator.showBrowser();
                browser_tree.expand(data);
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        let refactoring_adapter = {
            updateInfo: log_handler.updateInfo,
            notifyError: log_handler.pushError,
            updateScrollParams: params => updateScrolls(scroll_positions, params),
            reload: d => {
                if (d) {
                    key_textfield.update(d);
                }
                let data = key_textfield.getIdData();
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
        let navigator_adapter = {
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
                let data = key_textfield.getIdData();
                references.setRootIdData(data);
                refactoring.update(data);
                edit_ctrl.update(data, language_selector.getLanguage());
                preview.update(data, language_selector.getLanguage());
            }
        };
        let edit_ctrl_adapter = {
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
            }
        };
        let preview_adapter = {
            notifyError: log_handler.pushError,
            notifyTimeout: data => log_handler.pushTimeout('timeout loading preview: "' + data.id + '"')
        };
        // CONTROLS
        let language_selector = getLanguageSelector(hmi, language_selector_adapter);
        let key_textfield = getKeyTextfield(hmi, key_textfield_adapter);
        let browser_tree = getBrowserTree(hmi, browser_tree_adapter);
        let search_container = getSearchContainer(hmi, search_container_adapter);
        let navigator = getNavigator(hmi, navigator_adapter, key_textfield, browser_tree, search_container);
        let references = getReferences(hmi, references_adapter);
        let refactoring = getRefactoring(hmi, refactoring_adapter);
        let edit_ctrl = getEditController(hmi, edit_ctrl_adapter);
        let preview = getPreview(hmi, preview_adapter);
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
        let header = {
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
        let time = {
            x: 2,
            y: 0,
            refresh: date => {
                // clock (updates every second)
                var last = footer._last, sec = Math.ceil(date.getTime() / 1000);
                if (last !== sec) {
                    last = sec;
                    time.hmi_text(date.toLocaleString());
                }
            }
        };
        let footer = {
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
            }, footer]
        };
    }
    ContentEditor.create = create;

    Object.freeze(ContentEditor);
    root.ContentEditor = ContentEditor;
}(globalThis));
