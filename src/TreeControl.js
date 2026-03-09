(function (root) {
    "use strict";
    const TreeControl = {};
    const isNodeJS = typeof require === 'function';
    const Client = isNodeJS ? require('./Client.js') : root.Client;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    function equalTreeVodes(node1, node2) {
        return node1.data && node2.data && node1.data.path === node2.data.path;
    };

    /**
     * This function asks the server for all children of the given node. Depending
     * on the response the given node will be updated - meaning the nodes children
     * will be added or removed.
     */
    function updateChildTreeNodes(url, request, node, compare, onSuccess, onError) {
        if (false) { // TODO: Get this running and the remove $.ajax(...);
            Client.fetchGet(url, { path: node.data.path, request }, response => {
                const loaded = JsonFX.parse(response, false, true);
                const current = node.getChildren();
                // if we received an array of nodes from the database
                if (Array.isArray(loaded)) {
                    // if we got children in our tree
                    if (Array.isArray(current)) {
                        // collect all nodes not longer exists
                        const removed = [];
                        Core.handleNotFound(current, loaded, equalTreeVodes, rem => removed.push(rem));
                        // collect all nodes newly added
                        const added = [];
                        Core.handleNotFound(loaded, current, equalTreeVodes, add => added.push(add));
                        // remove tree nodes no longer exists
                        for (let i = 0, l = removed.length; i < l; i++) {
                            node.removeChild(removed[i]);
                        }
                        // add new children
                        if (added.length > 0) {
                            node.addChildren(added);
                        }
                    }
                    // if we do not have children we add all
                    else if (loaded.length > 0) {
                        node.addChildren(loaded);
                    }
                    if (typeof compare === 'function') {
                        node.sortChildren(compare, false);
                    }
                }
                // if no children available in the database we remove all from the
                // tree node
                else if (Array.isArray(current)) {
                    node.removeChildren();
                }
                // notify
                onSuccess();
            }, onError, true);
            return;
        }
        $.ajax({
            type: 'GET',
            url: url,
            data: { path: node.data.path, request },
            success: (result, textStatus, jqXHR) => {
                const loaded = JsonFX.parse(result, false, true);
                const current = node.getChildren();
                if (Array.isArray(loaded)) { // if we received an array of nodes from the database
                    if (Array.isArray(current)) { // if we got children in our tree
                        // collect all nodes not longer exists
                        const removedNodes = [];
                        Core.handleNotFound(current, loaded, equalTreeVodes, removed => removedNodes.push(removed));
                        // collect all nodes newly added
                        const addedNodes = [];
                        Core.handleNotFound(loaded, current, equalTreeVodes, added => addedNodes.push(added));
                        // remove tree nodes no longer exists
                        for (let i = 0, l = removedNodes.length; i < l; i++) {
                            node.removeChild(removedNodes[i]);
                        }
                        // add new children
                        if (addedNodes.length > 0) {
                            node.addChildren(addedNodes);
                        }
                    } else if (loaded.length > 0) { // if we do not have children we add all
                        node.addChildren(loaded);
                    }
                    if (typeof compare === 'function') {
                        node.sortChildren(compare, false);
                    }
                } else if (Array.isArray(current)) { // if no children available in the database we remove all from the tree node
                    node.removeChildren();
                }
                // notify
                onSuccess();
            },
            error: onError,
            timeout: 10000
        });
    }

    /**
     * This function updates all children of the given node if it's a folder and
     * children have been loaded before. In case of available children after
     * update this function will be called recursively on every child.
     */
    function updateLoadedTreeNodes(url, request, node, compare, onSuccess, onError) {
        if ((node.isFolder() === true || node.isRoot() === true) && node.hasChildren() === true) { // we only do this on folders and if not lazy anymore
            updateChildTreeNodes(url, request, node, compare, function () {
                const children = node.getChildren();
                if (Array.isArray(children)) {
                    const tasks = [];
                    for (let i = 0, l = children.length; i < l; i++) {
                        (function () { // Closure
                            const child = children[i];
                            tasks.push((onSuc, onErr) => updateLoadedTreeNodes(child.data.url, child.data.request, child, compare, onSuc, onErr));
                        }());
                    }
                    tasks.parallel = true;
                    Executor.run(tasks, onSuccess, onError);
                } else {
                    onSuccess();
                }
            }, onError);
        } else { // no folder or no children loaded so far
            onSuccess();
        }
    }

    function expandTreePath(url, request, node, path, compare, onSuccess, onError) {
        updateChildTreeNodes(url, request, node, compare, () => {
            const children = node.getChildren();
            if (Array.isArray(children)) {
                for (let i = 0; i < children.length; i++) {
                    const child = children[i];
                    const p = child.data.path;
                    if (path.indexOf(p) === 0) {
                        if (path.length > p.length) {
                            if (child.isFolder()) {
                                child.makeVisible({ scrollIntoView: false });
                                expandTreePath(url, request, child, path, compare, onSuccess, onError);
                            } else {
                                onSuccess(child);
                            }
                        } else {
                            onSuccess(child);
                        }
                        return;
                    }
                }
            }
            // reaching this point means none of the available child nodes match to
            // our given path - we do not treat this as an error
            onSuccess(node);
        }, onError);
    }

    // @formatter:off
    // The following attributes are available as 'node.PROPERTY':
    // Type | Name | Description
    // -----------+--------------+----------------------------------------------------------
    // String | title | node text (may contain HTML tags)
    // String | key | unique key for this node (auto-generated if omitted)
    // String | refKey | (reserved)
    // Boolean | expanded |
    // Boolean | active | (initialization only, but will not be stored with the
    // node).
    // Boolean | focus | (initialization only, but will not be stored with the
    // node).
    // Boolean | folder |
    // Boolean | hideCheckbox |
    // Boolean | lazy |
    // Boolean | selected |
    // Boolean | unselectable |
    // NodeData[] | children | optional array of child nodes
    // String | tooltip |
    // String | extraClasses | class names added to the node markup (separate with
    // space)
    // object | data | all properties from will be copied to `node.data`
    // any | OTHER | attributes other than listed above will be copied to
    // `node.data`
    // All other fields are considered custom and will be added to the nodes data
    // object as 'node.data.PROPERTY' (e.g. 'node.data.myOwnAttr').
    // @formatter:on
    function applyTree(that, context, disableVisuEvents, enableEditorEvents, onSuccess, onError) {
        let _cont = that._hmi_context.container;
        _cont.addClass('default-scroll-container');
        that.hmi_setRootPath = (path, onSuc, onErr) => {
            // this call returns a promise and by calling "then" on the promise we
            // catch success or error
            $.ui.fancytree.getTree(_cont).reload({
                url: that.rootURL,
                cache: false,
                data: {
                    path,
                    request: that.rootRequest
                }
            }).then(onSuc, onErr);
        };
        that.hmi_getRootNode = () => $.ui.fancytree.getTree(_cont).getRootNode();
        let _setEnabled = that.hmi_setEnabled;
        that.hmi_setEnabled = enabled => {
            if (typeof _setEnabled === 'function') {
                _setEnabled(enabled);
            }
            _cont.fancytree(enabled === true ? 'enable' : 'disable');
        };
        that.hmi_updateLoadedNodes = (onSuc, onErr) => {
            const root = that.hmi_getRootNode();
            updateLoadedTreeNodes(that.rootURL, that.rootRequest, root, that.compareNodes, onSuc || function () {
                // nothing to do
            }, onErr || function (error) {
                console.error(error);
            });
        };
        that.hmi_setActivePath = (path, onSuc, onErr) => {
            const root = that.hmi_getRootNode();
            expandTreePath(that.rootURL, that.rootRequest, root, path, that.compareNodes, function (i_node) {
                i_node.makeVisible({ scrollIntoView: true });
                i_node.setActive(true);
                if (typeof onSuc === 'function') {
                    onSuc(i_node);
                }
                // nothing to do
            }, onErr || function (error) {
                console.error(error);
            });
        };
        // build tree source
        let source = Array.isArray(that.data) ? that.data : {
            url: that.rootURL,
            cache: false,
            data: { path: '', request: that.rootRequest }
        };
        // initialize tree
        _cont.fancytree({
            autoScroll: true,
            // selectMode: 2, // multi-select
            scrollParent: _cont,
            // this will be used for loading root nodes
            source: source,
            lazyLoad: function (i_event, i_data) {
                // this will be called on node expansion and used for child loading
                i_data.result = {
                    url: i_data.node.data.url,
                    cache: false,
                    data: { path: i_data.node.data.path, request: i_data.node.data.request }
                };
            },
            // This will be called in the following situations:
            // - on hmi_setActivePath(...)
            // - after a node has been selected by mouse click but only if already
            // selected before
            // - after a node has been selected by keybord arrow switches
            activate: (event, data) => {
                if (typeof that.nodeActivated === 'function') {
                    that.nodeActivated(data.node);
                }
            },
            focus: (event, data) => {
                if (typeof that.selectedNodeHasFocus === 'function') {
                    that.selectedNodeHasFocus(data.node);
                }
            },
            blur: (event, data) => {
                if (typeof that.selectedNodeLostFocus === 'function') {
                    that.selectedNodeLostFocus(data.node);
                }
            },
            click: (event, data) => {
                if (typeof that.nodeClicked === 'function') {
                    that.nodeClicked(data.node);
                }
            }
        });
        that._hmi_destroys.push(() => {
            try {
                _cont.fancytree('destroy');
            } catch (error) {
                console.error('Failed destroying tree', error);
            }
            delete that.hmi_setRootPath;
            delete that.hmi_getRootNode;
            delete that.hmi_setEnabled;
            that.hmi_setEnabled = _setEnabled;
            _setEnabled = undefined;
            delete that.hmi_updateLoadedNodes;
            delete that.hmi_expandPath;
            delete that.hmi_setActivePath;
            _cont = undefined;
            that = undefined;
        });
        onSuccess();
    }
    ObjectLifecycleManager.addApplyFunctionForType('tree', applyTree);

    Object.freeze(TreeControl);
    if (isNodeJS) {
        module.exports = TreeControl;
    } else {
        root.TreeControl = TreeControl;
    }
}(globalThis));
