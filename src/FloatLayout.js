(function (root) {
    "use strict";
    const FloatLayout = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    function applyFloat(that, context, disableVisuEvents, enableEditorEvents, onSuccess, onError) {
        let tasks = [];
        let _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        let _mainDiv = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
        _mainDiv.appendTo(_cont);
        let _children = Array.isArray(that.children) ? that.children : [];
        let _scope = undefined;
        if (enableEditorEvents === true) {
            ObjectLifecycleManager.applyListenerSupport(that);
            _scope = Utilities.getUniqueId();
            _mainDiv.droppable({
                scope: _scope,
                tolerance: 'pointer',
                hoverClass: 'default-background-hover',
                drop: (event, ui) => {
                    ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                    const source = ui.draggable.data('hmi_object');
                    for (let i = 0; i < _children.length; i++) {
                        const child = _children[i];
                        if (child._hmi_floatElement && child._hmi_object === source) {
                            const width = _mainDiv.width();
                            const height = _mainDiv.height();
                            // get the alignment
                            const align = getAlignment(child.align, undefined, false, true);
                            // get pixel values as number if available (returns undefined if
                            // not something like "42px")
                            const parX = getPixelValue(child.x);
                            const parY = getPixelValue(child.y);
                            const parW = getPixelValue(child.width);
                            const parH = getPixelValue(child.height);
                            // get the current views location and dimension
                            const pixW = getPixelValue(child._hmi_floatElement.css('width'));
                            const pixH = getPixelValue(child._hmi_floatElement.css('height'));
                            const pixX = getPixelValue(child._hmi_floatElement.css('left')) + pixW * align.x;
                            const pixY = getPixelValue(child._hmi_floatElement.css('top')) + pixH * align.y;
                            // update the rectangle attributes
                            child.x = typeof parX === 'number' ? pixX + 'px' : pixX / width;
                            child.y = typeof parY === 'number' ? pixY + 'px' : pixY / height;
                            child.width = typeof parW === 'number' ? pixW + 'px' : pixW / width;
                            child.height = typeof parH === 'number' ? pixH + 'px' : pixH / height;
                            const hmiobj = child._hmi_object;
                            if (hmiobj && hmiobj._hmi_resize) {
                                hmiobj._hmi_resize();
                            }
                            that._hmi_forAllEditListeners(listener => {
                                if (typeof listener.notifyEdited === 'function') {
                                    listener.notifyEdited();
                                }
                            });
                            break;
                        }
                    }
                }
            });
        }
        let width = _mainDiv.width();
        let height = _mainDiv.height();
        for (let i = 0; i < _children.length; i++) {
            // closure
            (function () {
                const idx = i;
                const child = _children[i];
                const hmiobj = child._hmi_object;
                if (hmiobj) {
                    if (ObjectLifecycleManager.isTaskType(hmiobj)) {
                        if (hmiobj._hmi_init_dom) {
                            // #float: 1
                            tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: _cont }, onSuc, onErr));
                        }
                    } else {
                        child._hmi_floatElement = $(ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                        child._hmi_floatElement.appendTo(_mainDiv);
                        ObjectLifecycleManager.setBounds(child._hmi_floatElement, getFloatingBounds(child, width, height));
                        if (hmiobj._hmi_init_dom) {
                            // #float: 2
                            tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: child._hmi_floatElement }, onSuc, onErr));
                        }
                        if (enableEditorEvents === true) {
                            child._hmi_floatElement.draggable({
                                scope: _scope,
                                // helper : 'clone',
                                revert: 'invalid',
                                revertDuration: 777,
                                appendTo: 'body',
                                // opacity : 0.7,
                                distance: 20,
                                iframeFix: true,
                                scroll: false
                            });
                        }
                        if (enableEditorEvents === true) {
                            child._hmi_clickedForEdit = event => {
                                ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                                that._hmi_forAllEditListeners(listener => {
                                    if (typeof listener.showChildObjectEditor === 'function') {
                                        listener.showChildObjectEditor(idx, child);
                                    }
                                });
                            };
                            child._hmi_floatElement.on('click', child._hmi_clickedForEdit);
                        }
                    }
                }
            }());
        }
        if (enableEditorEvents === true) {
            that._hmi_clickedForEdit = event => {
                ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                that._hmi_forAllEditListeners(listener => {
                    if (typeof listener.showChildObjectEditor === 'function') {
                        const w = _cont.width();
                        const h = _cont.height();
                        const offset = typeof event.offsetX !== 'number' || typeof event.offsetY !== 'number' ? $(event.target).offset() : undefined;
                        const x = offset === undefined ? event.offsetX : event.pageX - offset.left;
                        const y = offset === undefined ? event.offsetY : event.pageY - offset.top;
                        listener.showChildObjectEditor(-1, {
                            x: x / w,
                            y: y / h,
                            width: 0.5,
                            height: 0.5
                        });
                    }
                });
            };
            _cont.on('click', that._hmi_clickedForEdit);
        }
        that._hmi_resizes.push(() => {
            const width = _mainDiv.width();
            const height = _mainDiv.height();
            for (let i = 0; i < _children.length; i++) {
                const child = _children[i];
                if (child._hmi_floatElement) {
                    setBounds(child._hmi_floatElement, getFloatingBounds(child, width, height));
                    const hmiobj = child._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                }
            }
        });
        that._hmi_destroys.push(() => {
            if (enableEditorEvents === true) {
                _cont.off('click', that._hmi_clickedForEdit);
                delete that._hmi_clickedForEdit;
            }
            _scope = undefined;
            for (let i = _children.length - 1; i >= 0; i--) {
                const child = _children[i];
                const hmiobj = child._hmi_object;
                if (hmiobj._hmi_destroy_dom) {
                    // #float: 1 + 2
                    hmiobj._hmi_destroy_dom();
                }
                if (child._hmi_floatElement) {
                    if (enableEditorEvents === true) {
                        child._hmi_floatElement.off('click', child._hmi_clickedForEdit);
                        delete child._hmi_clickedForEdit;
                    }
                    if (enableEditorEvents === true) {
                        child._hmi_floatElement.draggable('destroy');
                    }
                    child._hmi_floatElement.remove();
                    delete child._hmi_floatElement;
                }
            }
            _children = undefined;
            if (enableEditorEvents === true) {
                _mainDiv.droppable('destroy');
            }
            _mainDiv.empty();
            _mainDiv = undefined;
            _cont.empty();
            _cont = undefined;
            that = undefined;
        });
        Executor.run(tasks, onSuccess, onError);
    };
    ObjectLifecycleManager.addApplyFunctionForType('float', applyFloat);

    Object.freeze(FloatLayout);
    if (isNodeJS) {
        module.exports = FloatLayout;
    } else {
        root.FloatLayout = FloatLayout;
    }
}(globalThis));
