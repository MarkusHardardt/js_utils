(function (root) {
    "use strict";
    const SplitLayout = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    const SPLIT_LEFT = 0x10;
    const SPLIT_RIGHT = 0x08;
    const SPLIT_TOP = 0x04;
    const SPLIT_BOTTOM = 0x02;
    const SPLIT_CENTER = 0x01;

    function applySplit(that, onSuccess, onError) {
        let tasks = [];
        let _cont = that._hmi_context.container;
        function initHmiObjectDom(split) {
            const hmiobj = split._hmi_object;
            if (hmiobj && hmiobj._hmi_init_dom) {
                // #split: 1
                tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: split._hmi_splitElement }, onSuc, onErr));
            }
        };
        let _instance = undefined;
        function preparePanesAndInitHmiObjectDom(north, south, west, east, center) {
            const layout = {};
            const width = _cont.width();
            const height = _cont.height();
            if (north) {
                if (south) {
                    layout.north__size = Math.floor(height * (typeof that.topSize === 'number' ? that.topSize : 0.3));
                    layout.south__size = Math.floor(height * (typeof that.bottomSize === 'number' ? that.bottomSize : 0.3));
                } else {
                    layout.north__size = Math.floor(height * (typeof that.topSize === 'number' ? that.topSize : (typeof that.bottomSize === 'number' ? 1 - that.bottomSize : 0.5)));
                }
            } else if (south) {
                layout.south__size = Math.floor(height * (typeof that.bottomSize === 'number' ? that.bottomSize : 0.5));
            }
            if (west) {
                if (east) {
                    layout.west__size = Math.floor(width * (typeof that.leftSize === 'number' ? that.leftSize : 0.3));
                    layout.east__size = Math.floor(width * (typeof that.rightSize === 'number' ? that.rightSize : 0.3));
                } else {
                    layout.west__size = Math.floor(width * (typeof that.leftSize === 'number' ? that.leftSize : (typeof that.rightSize === 'number' ? 1 - that.rightSize : 0.5)));
                }
            } else if (east) {
                layout.east__size = Math.floor(width * (typeof that.rightSize === 'number' ? that.rightSize : 0.5));
            }
            if (north) {
                north._hmi_splitContainer = $('<div class="ui-layout-north" />');
                north._hmi_splitContainer.appendTo(_cont);
                north._hmi_splitElement = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                north._hmi_splitElement.appendTo(north._hmi_splitContainer);
                layout.north__onresize_end = (paneName, paneElement, paneState, paneOptions, layoutName) => {
                    const hmiobj = north._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (south) {
                south._hmi_splitContainer = $('<div class="ui-layout-south" />');
                south._hmi_splitContainer.appendTo(_cont);
                south._hmi_splitElement = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                south._hmi_splitElement.appendTo(south._hmi_splitContainer);
                layout.south__onresize_end = (paneName, paneElement, paneState, paneOptions, layoutName) => {
                    const hmiobj = south._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (west) {
                west._hmi_splitContainer = $('<div class="ui-layout-west" />');
                west._hmi_splitContainer.appendTo(_cont);
                west._hmi_splitElement = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                west._hmi_splitElement.appendTo(west._hmi_splitContainer);
                layout.west__onresize_end = (paneName, paneElement, paneState, paneOptions, layoutName) => {
                    const hmiobj = west._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (east) {
                east._hmi_splitContainer = $('<div class="ui-layout-east" />');
                east._hmi_splitContainer.appendTo(_cont);
                east._hmi_splitElement = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                east._hmi_splitElement.appendTo(east._hmi_splitContainer);
                layout.east__onresize_end = (paneName, paneElement, paneState, paneOptions, layoutName) => {
                    const hmiobj = east._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (center) {
                center._hmi_splitContainer = $('<div class="ui-layout-center" />');
                center._hmi_splitContainer.appendTo(_cont);
                center._hmi_splitElement = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                center._hmi_splitElement.appendTo(center._hmi_splitContainer);
                layout.center__onresize_end = (paneName, paneElement, paneState, paneOptions, layoutName) => {
                    const hmiobj = center._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            // do layout
            _instance = _cont.layout(layout);
        };
        // here we store the container
        let _left = undefined;
        let _right = undefined;
        let _top = undefined;
        let _bottom = undefined;
        let _center = undefined;
        let _mask = 0;
        // compute child constellation bit mask
        if (Array.isArray(that.children)) {
            for (let i = 0; i < that.children.length; i++) {
                const child = that.children[i];
                const hmiobj = child._hmi_object;
                if (hmiobj) {
                    if (ObjectLifecycleManager.isTaskType(hmiobj)) {
                        if (hmiobj._hmi_init_dom) {
                            // #split: 2
                            tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: _cont }, onSuc, onErr));
                        }
                    } else if (child.location === 'left') {
                        _left = child;
                        _mask |= SPLIT_LEFT;
                    } else if (child.location === 'right') {
                        _right = child;
                        _mask |= SPLIT_RIGHT;
                    } else if (child.location === 'top') {
                        _top = child;
                        _mask |= SPLIT_TOP;
                    } else if (child.location === 'bottom') {
                        _bottom = child;
                        _mask |= SPLIT_BOTTOM;
                    } else if (child.location === 'center') {
                        _center = child;
                        _mask |= SPLIT_CENTER;
                    }
                }
            }
        }
        // PREPARE
        _cont.addClass('overflow-hidden');
        switch (_mask) {
            // 00001 center
            case 0x01:
                _center._hmi_splitElement = _cont;
                break;
            // 00010 bottom
            case 0x02:
                _bottom._hmi_splitElement = _cont;
                break;
            // 00011 bottom center
            case 0x03:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, undefined, undefined, _center);
                break;
            // 00100 top
            case 0x04:
                _top._hmi_splitElement = _cont;
                break;
            // 00101 top center
            case 0x05:
                preparePanesAndInitHmiObjectDom(_top, undefined, undefined, undefined, _center);
                break;
            // 00110 top bottom
            case 0x06:
                preparePanesAndInitHmiObjectDom(_top, undefined, undefined, undefined, _bottom);
                break;
            // 00111 top bottom center
            case 0x07:
                preparePanesAndInitHmiObjectDom(_top, _bottom, undefined, undefined, _center);
                break;
            // 01000 right
            case 0x08:
                _right._hmi_splitElement = _cont;
                break;
            // 01001 right center
            case 0x09:
                preparePanesAndInitHmiObjectDom(undefined, undefined, undefined, _right, _center);
                break;
            // 01010 right bottom
            case 0x0a:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, undefined, undefined, _right);
                break;
            // 01011 right bottom center
            case 0x0b:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, undefined, _right, _center);
                break;
            // 01100 right top
            case 0x0c:
                preparePanesAndInitHmiObjectDom(_top, undefined, undefined, undefined, _right);
                break;
            // 01101 right top center
            case 0x0d:
                preparePanesAndInitHmiObjectDom(_top, undefined, undefined, _right, _center);
                break;
            // 01110 right top bottom
            case 0x0e:
                preparePanesAndInitHmiObjectDom(_top, _bottom, undefined, undefined, _right);
                break;
            // 01111 right top bottom center
            case 0x0f:
                preparePanesAndInitHmiObjectDom(_top, _bottom, undefined, _right, _center);
                break;
            // 10000 left
            case 0x10:
                _left._hmi_splitElement = _cont;
                break;
            // 10001 left center
            case 0x11:
                preparePanesAndInitHmiObjectDom(undefined, undefined, _left, undefined, _center);
                break;
            // 10010 left bottom
            case 0x12:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, undefined, undefined, _left);
                break;
            // 10011 left bottom center
            case 0x13:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, _left, undefined, _center);
                break;
            // 10100 left top
            case 0x14:
                preparePanesAndInitHmiObjectDom(_top, undefined, undefined, undefined, _left);
                break;
            // 10101 left top center
            case 0x15:
                preparePanesAndInitHmiObjectDom(_top, undefined, _left, undefined, _center);
                break;
            // 10110 left top bottom
            case 0x16:
                preparePanesAndInitHmiObjectDom(_top, _bottom, undefined, undefined, _left);
                break;
            // 10111 left top bottom center
            case 0x17:
                preparePanesAndInitHmiObjectDom(_top, _bottom, _left, undefined, _center);
                break;
            // 11000 left right
            case 0x18:
                preparePanesAndInitHmiObjectDom(undefined, undefined, _left, undefined, _right);
                break;
            // 11001 left right center
            case 0x19:
                preparePanesAndInitHmiObjectDom(undefined, undefined, _left, _right, _center);
                break;
            // 11010 left right bottom
            case 0x1a:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, undefined, _right, _left);
                break;
            // 11011 left right bottom center
            case 0x1b:
                preparePanesAndInitHmiObjectDom(undefined, _bottom, _left, _right, _center);
                break;
            // 11100 left right top
            case 0x1c:
                preparePanesAndInitHmiObjectDom(_top, undefined, _left, undefined, _right);
                break;
            // 11101 left right top center
            case 0x1d:
                preparePanesAndInitHmiObjectDom(_top, undefined, _left, _right, _center);
                break;
            // 11110 left right top bottom
            case 0x1e:
                preparePanesAndInitHmiObjectDom(_top, _bottom, _left, undefined, _right);
                break;
            // 11111 left right top bottom center
            case 0x1f:
                preparePanesAndInitHmiObjectDom(_top, _bottom, _left, _right, _center);
                break;
            default:
                break;
        }
        // INIT DOM
        if (_left) {
            initHmiObjectDom(_left);
        }
        if (_right) {
            initHmiObjectDom(_right);
        }
        if (_top) {
            initHmiObjectDom(_top);
        }
        if (_bottom) {
            initHmiObjectDom(_bottom);
        }
        if (_center) {
            initHmiObjectDom(_center);
        }
        that._hmi_resizes.push(() => {
            if (_instance) {
                _instance.resizeAll();
            }
        });
        that._hmi_destroys.push(() => {
            if (Array.isArray(that.children)) {
                for (let i = that.children.length - 1; i >= 0; i--) {
                    const child = that.children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj && hmiobj._hmi_destroy_dom) {
                        // #split: 1 + 2
                        hmiobj._hmi_destroy_dom();
                    }
                    if (child._hmi_splitElement) {
                        child._hmi_splitElement.remove();
                        delete child._hmi_splitElement;
                    }
                    if (child._hmi_splitContainer) {
                        child._hmi_splitContainer.remove();
                        delete child._hmi_splitContainer;
                    }
                }
            }
            _cont.layout().destroy();
            _cont.empty();
            _cont = undefined;
            initHmiObjectDom = undefined;
            preparePanesAndInitHmiObjectDom = undefined;
            _mask = undefined;
            // TODO: What is this? createPanes = undefined;
            _left = undefined;
            _right = undefined;
            _top = undefined;
            _bottom = undefined;
            _center = undefined;
            that = undefined;
        });
        Executor.run(tasks, onSuccess, onError);
    }

    ObjectLifecycleManager.addApplyFunctionForType('split', applySplit);

    Object.freeze(SplitLayout);
    if (isNodeJS) {
        module.exports = SplitLayout;
    } else {
        root.SplitLayout = SplitLayout;
    }
}(globalThis));
