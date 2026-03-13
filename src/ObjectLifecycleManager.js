(function (root) {
    /*  TODO:
        - Move all browser specific stuff to separate file(s)
    */
    const ObjectLifecycleManager = {};
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Mathematics = isNodeJS ? require('./Mathematics.js') : root.Mathematics;
    const ObjectPositionSystem = isNodeJS ? require('./ObjectPositionSystem.js') : root.ObjectPositionSystem;
    const Sorting = isNodeJS ? require('./Sorting.js') : root.Sorting;
    const $ = isNodeJS ? require('jquery') : root.$;
    /*
     * Usage check of: "._hmi_init_dom(" [11] and "._hmi_destroy_dom(" [6] to
     * prevent memory leaks:
     * 
     * #grid: 2 x _hmi_init_dom: called on all children but with "is
     * TaskObjectImpl?" true without or false with html division 1 x
     * _hmi_destroy_dom: called on all children
     * 
     * #float: 2 x _hmi_init_dom: called on all children but with "is
     * TaskObjectImpl?" true without or false with html division 1 x
     * _hmi_destroy_dom: called on all children
     * 
     * #split: 2 x _hmi_init_dom: called on all possible split parts and all with
     * "is TaskObjectImpl?" 1 x _hmi_destroy_dom: called on all possible split
     * parts and all with "is TaskObjectImpl?"
     * 
     * #task: TaskObjectImpl 1 x _hmi_init_dom: called on children that are
     * handlers as well (all others ignored) 1 x _hmi_destroy_dom: called on
     * children that are handlers as well (all others ignored)
     * 
     * #graph: 3 x _hmi_init_dom: called on children that are graphics as well,
     * html objects or handlers 1 x _hmi_destroy_dom: called on all children
     * 
     * #create/destroy_hmi_object_branch: 1 + 2 2 x _hmi_init_dom: called on
     * object (debug or not) 1 x _hmi_destroy_dom: called on object
     * 
     * ==> all initialized objects destroyed! (Hm, 2015-07-29)
     */

    const DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION = '<div style="box-sizing: border-box;position: relative;width: 100%;height: 100%;" />';
    ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION = DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION;
    const DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION = '<div style="box-sizing: border-box;position: absolute;" />';
    ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION = DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION;

    /**
     * Analyzes the passed object and returns true if it is an object with the attribute 'type' with the value 'task'.
     * On node js we only can handle 'task' objects so we just check if it is not another type.
     * @param {*} object 
     * @returns true for task objects
     */
    function isTaskType(object) {
        if (object === undefined) {
            return false;
        } else if (object === null) {
            return false;
        } else if (typeof object !== 'object') {
            return false;
        } else {
            return (isNodeJS && object.type === undefined) || object.type === 'task';
        }
    }
    ObjectLifecycleManager.isTaskType = isTaskType;

    let s_applyGraphicObject = null;
    const s_types = {};

    const s_extensions = [];

    function attachHmiObject(object) {
        // If we got a valid object we iterate to the actual visualization object
        // first. [1]
        // Then we iterate again and connect all objects to the visualization
        // object. [2]
        // Finally we call ourself recursively on all children. [3]
        if (object !== null && typeof object === 'object') {
            // step to hmi-object [1]
            let obj = object;
            let cld = obj.object;
            while (cld !== null && typeof cld === 'object') {
                obj = cld;
                cld = obj.object;
            }
            // store hmi object
            const hmiobj = obj;
            // step again and attach [2]
            obj = object;
            obj._hmi_object = hmiobj;
            obj.hmi_object = hmiobj;
            cld = obj.object;
            while (cld !== null && typeof cld === 'object') {
                cld._hmi_object = hmiobj;
                cld.hmi_object = hmiobj;
                obj = cld;
                cld = obj.object;
            }
            // handle children [3]
            const children = hmiobj.children;
            if (Array.isArray(children)) {
                for (let i = 0, l = children.length; i < l; i++) {
                    attachHmiObject(children[i]);
                }
            }
        }
    }

    function detachHmiObject(object) {
        if (object !== null && typeof object === 'object') {
            // detach children
            const children = object._hmi_object.children;
            if (Array.isArray(children)) {
                for (let i = children.length - 1; i >= 0; i--) {
                    detachHmiObject(children[i]);
                }
            }
            // delete all
            let obj = object;
            delete obj._hmi_object;
            delete obj.hmi_object;
            let cld = obj.object;
            while (cld !== null && typeof cld === 'object') {
                delete cld._hmi_object;
                delete cld.hmi_object;
                obj = cld;
                cld = obj.object;
            }
        }
    }

    function processObjectSubTree(object, fromRootToLeaf, isValid, callback) {
        if (isValid === undefined || isValid(object) === true) {
            // perform callback if from root to leaf
            if (fromRootToLeaf === true) {
                callback(object);
            }
            // if children available iterate over all children
            const children = object.children;
            if (Array.isArray(children)) {
                if (fromRootToLeaf === true) {
                    for (let i = 0, l = children.length; i < l; i++) {
                        processObjectSubTree(children[i]._hmi_object, fromRootToLeaf, isValid, callback);
                    }
                } else {
                    for (let i = children.length - 1; i >= 0; i--) {
                        processObjectSubTree(children[i]._hmi_object, fromRootToLeaf, isValid, callback);
                    }
                }
            }
            // perform callback if not from root to leaf
            if (fromRootToLeaf !== true) {
                callback(object);
            }
        }
    }
    ObjectLifecycleManager.processObjectSubTree = processObjectSubTree;

    function setBounds(element, bounds) {
        element.css('left', bounds.x.toString() + 'px');
        element.css('top', bounds.y.toString() + 'px');
        element.css('width', bounds.width.toString() + 'px');
        element.css('height', bounds.height.toString() + 'px');
    }
    ObjectLifecycleManager.setBounds = setBounds;

    function getPixelValue(value) {
        if (typeof value !== 'string') {
            return undefined;
        }
        const idx = value.indexOf('px');
        if (idx <= 0) {
            return undefined;
        }
        const px = value.substring(0, idx);
        if (isNaN(px)) {
            return undefined;
        }
        return parseFloat(px);
    }
    ObjectLifecycleManager.getPixelValue = getPixelValue;

    function getAlignment(align, result, mirrorX, mirrorY) {
        const res = result || {};
        if (typeof align === 'string') {
            if (align.indexOf('left') !== -1) {
                res.x = mirrorX === true ? 1.0 : 0.0;
            } else if (align.indexOf('right') !== -1) {
                res.x = mirrorX === true ? 0.0 : 1.0;
            } else {
                res.x = 0.5;
            }
            if (align.indexOf('bottom') !== -1) {
                res.y = mirrorY === true ? 1.0 : 0.0;
            } else if (align.indexOf('top') !== -1) {
                res.y = mirrorY === true ? 0.0 : 1.0;
            } else {
                res.y = 0.5;
            }
        } else if (align !== null && typeof align === 'object') {
            const x = align.x;
            const y = align.y;
            res.x = typeof x === 'number' ? (mirrorX === true ? 1.0 - x : x) : 0.5;
            res.y = typeof y === 'number' ? (mirrorY === true ? 1.0 - y : y) : 0.5;
        } else {
            res.x = 0.5;
            res.y = 0.5;
        }
        return res;
    }
    ObjectLifecycleManager.getAlignment = getAlignment;

    function updateCoordinates(element, x, y, width, height, containerWidth, containerHeight, align) { // TODO: Used?
        // get the alignment
        const alignment = getAlignment(align, undefined, false, true);
        // get pixel values as number if available (returns undefined if not
        // something like "42px")
        const parX = getPixelValue(x);
        const parY = getPixelValue(y);
        const parW = getPixelValue(width);
        const parH = getPixelValue(height);
        // compute the pixel values
        const pixX = typeof parX === 'number' ? parX : (typeof x === 'number' ? x : 0);
        const pixY = typeof parY === 'number' ? parY : (typeof y === 'number' ? y : 0);
        const pixW = typeof parW === 'number' ? parW : (typeof width === 'number' ? width : containerWidth);
        const pixH = typeof parH === 'number' ? parH : (typeof height === 'number' ? height : containerHeight);
        // update the view
        element.css('left', Math.floor(pixX - pixW * alignment.x).toString() + 'px');
        element.css('width', Math.floor(pixW).toString() + 'px');
        element.css('top', Math.floor(pixY - pixH * alignment.y).toString() + 'px');
        element.css('height', Math.floor(pixH).toString() + 'px');
    }
    ObjectLifecycleManager.updateCoordinates = updateCoordinates;

    function applyListenerSupport(that) {
        let listeners = [];
        that._hmi_addEditListener = listener => {
            for (let i = 0, l = listeners.length; i < l; i++) {
                if (listeners[i] === listener) {
                    return false;
                }
            }
            listeners.push(listener);
            return true;
        };
        that._hmi_removeEditListener = listener => {
            for (let i = 0, l = listeners.length; i < l; i++) {
                if (listeners[i] === listener) {
                    listeners.splice(i, 1);
                    return true;
                }
            }
            return false;
        };
        that._hmi_forAllEditListeners = callback => {
            for (let i = 0, l = listeners.length; i < l; i++) {
                callback(listeners[i]);
            }
        };
        that._hmi_destroys.push(() => {
            delete that._hmi_forAllEditListeners;
            delete that._hmi_addEditListener;
            delete that._hmi_removeEditListener;
            listeners.splice(0, listeners.length);
            listeners = undefined;
            that = undefined;
        });
    }
    ObjectLifecycleManager.applyListenerSupport = applyListenerSupport;

    let _lastUserActionDate = undefined;

    function preventDefaultAndStopPropagation(event) {
        // do not perform default browser actions
        if (typeof event.preventDefault === 'function') {
            event.preventDefault();
        }
        // do not delegate to parent elements
        if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
        }
        _lastUserActionDate = new Date().getTime();
    }
    ObjectLifecycleManager.preventDefaultAndStopPropagation = preventDefaultAndStopPropagation;

    function getLastUserActionDate() {
        return _lastUserActionDate;
    }
    ObjectLifecycleManager.getLastUserActionDate = getLastUserActionDate;

    function initObject(object, data) {
        if (typeof object.init === 'function') {
            try {
                object.init(data);
            } catch (exc) {
                console.error(`EXCEPTION Calling init(): '${exc}' '${object.init.toString()}'`);
            }
        }
    }
    ObjectLifecycleManager.initObject = initObject;

    const s_eventListeners = [];
    ObjectLifecycleManager.addEventListener = listener => {
        for (const l of s_eventListeners) {
            if (listener === l) {
                throw new Error(`Event listener already stored: ${listener.toString()}`);
            }
        }
        if (typeof listener !== 'object') {
            throw new Error('Event listener is not an object');
        }
        s_eventListeners.push(listener);
    };
    ObjectLifecycleManager.removeEventListener = listener => {
        for (let l = 0; l < s_eventListeners.length; l++) {
            if (listener === s_eventListeners[l]) {
                s_eventListeners.splice(l, 1);
                return;
            }
        }
        throw new Error(`Event listener not stored: ${listener.toString()}`);
    };
    function updateEventListenersState(enabled) {
        for (let i = 0, l = s_eventListeners.length; i < l; i++) {
            s_eventListeners[i][enabled ? '_hmi_addEventListeners' : '_hmi_removeEventListeners']();
        }
    }

    function applyButtonHandling(that, context) {
        let _timeout = undefined;
        let _pressed = false;
        let _minimumTimeoutTimer = undefined;
        let _enabled = true;
        let _cont = context.container;
        function updateState(isDown, longClickTimeoutExpired) {
            // only if the pressed state has changed
            if (_pressed !== isDown) {
                // update for the next call
                _pressed = isDown === true;
                // if we want a border we got to update
                if (that.hmi_updateBorder) {
                    that.hmi_updateBorder(_pressed);
                }
                // if the button has been touched or the mouse pointer went down on it
                if (_pressed) {
                    if (_minimumTimeoutTimer !== undefined) {
                        clearTimeout(_minimumTimeoutTimer);
                        _minimumTimeoutTimer = undefined;
                    }
                    if (typeof that.minimumTimeout === 'number' && that.minimumTimeout > 0) {
                        _minimumTimeoutTimer = setTimeout(function () {
                            _minimumTimeoutTimer = undefined;
                            if (_pressed !== true) {
                                _pressed = true;
                                updateState(false, false);
                            }
                        }, that.minimumTimeout);
                    }
                    // if a timeout is required and has not already been started we start
                    // a timeout
                    if (typeof that.timeout === 'number' && that.timeout > 0 && _timeout === undefined) {
                        _timeout = setTimeout(function () {
                            _timeout = undefined;
                            updateState(false, true);
                        }, that.timeout);
                    }
                    // if we implement the method
                    if (that.verbose === true) {
                        console.log('button pressed');
                    }
                    // if the handler method is available call it
                    if (typeof that.pressed === 'function') {
                        try {
                            that.pressed();
                        } catch (error) {
                            console.error(`Failed calling pressed(): ${that.pressed.toString()}`, error);
                        }
                    }
                } else if (_minimumTimeoutTimer === undefined) { // if the button has been untouched, the mouse pointer went up or leaves the element or the timeout expired
                    // first we got to clear eventual timeouts
                    if (_timeout !== undefined) {
                        clearTimeout(_timeout);
                        _timeout = undefined;
                    }
                    if (that.verbose === true) {
                        console.log('button released');
                    }
                    // if the handler method is available call it
                    if (typeof that.released === 'function') {
                        try {
                            that.released();
                        } catch (error) {
                            console.error(`Failed calling released(): ${that.released.toString()}`, error);
                        }
                    }
                    // if we got a timeout
                    if (longClickTimeoutExpired === true) {
                        if (that.verbose === true) {
                            console.log('button long clicked');
                        }
                        // if the handler method is available call it
                        if (typeof that.longClicked === 'function') {
                            try {
                                that.longClicked();
                            } catch (error) {
                                console.error(`Failed calling longClicked(): ${that.longClicked.toString()}`, error);
                            }
                        }
                    } else {
                        if (that.verbose === true) {
                            console.log('button clicked');
                        }
                        // if the handler method is available call it
                        if (typeof that.clicked === 'function') {
                            try {
                                that.clicked();
                            } catch (error) {
                                console.error(`Failed calling clicked(): ${that.clicked.toString()}`, error);
                            }
                        }
                    }
                }
            }
        }
        function pressed(event) {
            preventDefaultAndStopPropagation(event);
            // handle the event
            updateState(true, false);
        }
        function released(event) {
            preventDefaultAndStopPropagation(event);
            // handle the event
            updateState(false, false);
        }
        function updateEnabled() {
            if (that._hmi_graphics !== true) {
                _cont[_enabled ? 'addClass' : 'removeClass']('hmi-cursor-pointer');
                _cont[_enabled ? 'removeClass' : 'addClass']('hmi-button-disabled');
                _cont[_enabled ? 'on' : 'off']('touchstart mousedown', pressed);
                // info: "mouseleave" is required because if a button opens the popup
                // the release event won't be fired!
                _cont[_enabled ? 'on' : 'off']('touchend mouseup mouseleave', released);
            }
            // if the handler method is available call it
            if (typeof that.updateEnabled === 'function') {
                try {
                    that.updateEnabled(_enabled);
                } catch (error) {
                    console.error(`Failed calling updateEnabled(): ${that.updateEnabled.toString()}`, error);
                }
            }
        };
        that.hmi_setEnabled = enabled => {
            if (_enabled !== enabled) {
                _enabled = enabled === true;
                updateEnabled();
            }
        };
        that.hmi_isEnabled = () => _enabled === true;
        if (that.hmi_updateBorder) {
            that.hmi_updateBorder(false);
        }
        if (that.enabled === false) {
            that.hmi_setEnabled(false);
        }
        updateEnabled();
        that._hmi_destroys.push(() => {
            _enabled = false;
            if (_minimumTimeoutTimer !== undefined) {
                clearTimeout(_minimumTimeoutTimer);
                _minimumTimeoutTimer = undefined;
            }
            if (_timeout !== undefined) {
                clearTimeout(_timeout);
                _timeout = undefined;
            }
            updateEnabled();
            delete that.hmi_setEnabled;
            delete that.hmi_isEnabled;
            _timeout = undefined;
            _pressed = undefined;
            _enabled = undefined;
            _cont = undefined;
            that = undefined;
        });
    };
    applyButtonHandling.isRequired = (object, disableVisuEvents) => {
        if (disableVisuEvents === true) {
            return false;
        }
        return typeof object.pressed === 'function' || typeof object.released === 'function' || typeof object.clicked === 'function' || typeof object.longClicked === 'function';
    };

    function dumpLifecycle(state) { // TODO: Replace with monitoring of server tasks
        if (false) {
            console.log(`lifecycle state: ${state}`)
        }
    }

    function applyContainer(that, context, disableVisuEvents, enableEditorEvents) {
        let _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        let _div = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
        _div.appendTo(_cont);
        let _object = undefined;
        that.hmi_getContent = () => _object;
        that.hmi_setContent = (object, onSuccess, onError, initData, disableVisuEvents, enableEditorEvents) => {
            if (_object === undefined && object !== null && typeof object === 'object' && !Array.isArray(object)) {
                createObjectSubTree(object, _div, () => {
                    _object = object;
                    onSuccess();
                }, error => {
                    _div.empty();
                    onError(error);
                }, that.hmi, initData, that, object.id, that.hmi_node(), disableVisuEvents, enableEditorEvents, dumpLifecycle);
            }
        };
        that.hmi_removeContent = (onSuccess, onError) => {
            if (_object !== undefined) {
                const obj = _object;
                _object = undefined;
                killObjectSubTree(obj, () => {
                    _div.empty();
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, error => {
                    if (typeof onError === 'function') {
                        onError(error);
                    } else {
                        console.error(error);
                    }
                }, dumpLifecycle);
            } else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        };
        that._hmi_resizes.push(() => {
            if (_object) {
                const hmiobj = _object._hmi_object;
                if (hmiobj._hmi_resize) {
                    hmiobj._hmi_resize();
                }
            }
        });
        that._hmi_destroys.push(() => {
            _div.remove();
            _div = undefined;
            delete that.hmi_getContent;
            delete that.hmi_setContent;
            delete that.hmi_removeContent;
            _object = undefined;
            _cont = undefined;
            that = undefined;
        });
    }
    s_types['container'] = applyContainer;

    function applyTimeRangeSelector(that) {
        let _min = undefined;
        let _max = undefined;
        let _from = undefined;
        let _to = undefined;
        let _syncInterval = undefined;
        let _shiftUpInterval = undefined;
        let _shiftDownInterval = undefined;
        let doublingClickCount = typeof that.doublingClickCount === 'number' && that.doublingClickCount >= 1 ? that.doublingClickCount : 2;
        let _zoom = Math.exp(Math.log(2.0) / doublingClickCount);
        let _zoomInv = 1.0 / _zoom;
        let _shiftFactor = typeof that.shiftFactor === 'number' && that.shiftFactor > 0.0 && that.shiftFactor < 1.0 ? that.shiftFactor : 0.2;
        function update() {
            if (_from < _min) {
                _from = _min;
            }
            if (_to > _max) {
                _to = _max;
            }
            if (that.onlyInteger === true) {
                _from = Math.floor(_from);
                _to = Math.ceil(_to);
            }
            if (typeof that.handleRangeUpdate === 'function') {
                try {
                    that.handleRangeUpdate(_from, _to, _syncInterval !== undefined);
                } catch (error) {
                    console.error(`Failed calling handleRangeUpdate(): ${that.handleRangeUpdate.toString()}`, error);
                }
            }
        };
        that.hmi_setAbsoluteRange = (min, max) => {
            if (typeof min === 'number') {
                _min = that.onlyInteger === true ? Math.floor(min) : min;
            }
            if (typeof max === 'number') {
                _max = that.onlyInteger === true ? Math.ceil(max) : max;
            }
        };
        that.hmi_setCurrentRange = (from, to) => {
            if (typeof from === 'number') {
                _from = that.onlyInteger === true ? Math.floor(from) : from;
            }
            if (typeof to === 'number') {
                _to = that.onlyInteger === true ? Math.ceil(to) : to;
            }
            if (_from < _min) {
                _from = _min;
            }
            if (_to > _max) {
                _to = _max;
            }
        };
        that.hmi_maximizeRange = () => {
            _from = _min;
            _to = _max;
            update();
        };
        that.hmi_zoomOut = () => {
            const val = ((_to - _from) * (_zoom - 1.0)) * 0.5;
            _from -= val;
            _to += val;
            update();
        };
        that.hmi_zoomIn = () => {
            const val = ((_to - _from) * (1.0 - _zoomInv)) * 0.5;
            _from += val;
            _to -= val;
            update();
        };
        function shift(up) {
            const diff = up === true ? Math.min(_shiftFactor * (_to - _from), _max - _to) : -Math.min(_shiftFactor * (_to - _from), _from - _min);
            _from += diff;
            _to += diff;
            update();
        };
        that.hmi_shiftDown = pressed => {
            if (pressed === true) {
                if (_shiftDownInterval === undefined) {
                    _shiftDownInterval = setInterval(() => shift(false), typeof that.shiftMillis === 'number' && that.shiftMillis > 0 ? that.shiftMillis : 1000);
                }
                shift(false);
            } else {
                if (_shiftDownInterval !== undefined) {
                    clearInterval(_shiftDownInterval);
                    _shiftDownInterval = undefined;
                }
            }
        };
        that.hmi_shiftUp = pressed => {
            if (pressed === true) {
                if (_shiftUpInterval === undefined) {
                    _shiftUpInterval = setInterval(() => shift(true), typeof that.shiftMillis === 'number' && that.shiftMillis > 0 ? that.shiftMillis : 1000);
                }
                shift(true);
            } else {
                if (_shiftUpInterval !== undefined) {
                    clearInterval(_shiftUpInterval);
                    _shiftUpInterval = undefined;
                }
            }
        };
        that.hmi_synchronize = enable => {
            if (enable === true) {
                if (_syncInterval === undefined) {
                    _syncInterval = setInterval(update, typeof that.syncMillis === 'number' && that.syncMillis > 0 ? that.syncMillis : 1000);
                    update();
                }
            } else {
                if (_syncInterval !== undefined) {
                    clearInterval(_syncInterval);
                    _syncInterval = undefined;
                }
            }
        };
        that.hmi_isSynchronized = () => _syncInterval !== undefined;
        that.hmi_isShiftingUp = () => _shiftUpInterval !== undefined;
        that.hmi_isShiftingDown = () => _shiftDownInterval !== undefined;
        that.hmi_getFrom = () => _from;
        that.hmi_getTo = () => _to;
        that.hmi_getRange = () => _to - _from;
        that._hmi_destroys.push(() => {
            if (_syncInterval !== undefined) {
                clearInterval(_syncInterval);
                _syncInterval = undefined;
            }
            delete that.hmi_setAbsoluteRange;
            delete that.hmi_setCurrentRange;
            delete that.hmi_maximizeRange;
            delete that.hmi_zoomOut;
            delete that.hmi_zoomIn;
            delete that.hmi_shiftUp;
            delete that.hmi_shiftDown;
            delete that.hmi_synchronize;
            delete that.hmi_isSynchronized;
            delete that.hmi_getFrom;
            delete that.hmi_getTo;
            delete that.hmi_getRange;
            update = undefined;
            shift = undefined;
            that = undefined;
        });
    };
    applyTimeRangeSelector.isRequired = object => typeof object.handleRangeUpdate === 'function';

    function isVisible(visible) {
        if (visible === false) {
            return false;
        } else if (typeof visible === 'string') {
            return that.hmi.env.isInstance(visible);
        } else if (Array.isArray(visible) && visible.length > 0) {
            for (let i = 0; i < visible.length; i++) {
                if (that.hmi.env.isInstance(visible[i]) === true) {
                    return true;
                }
            }
            return false;
        } else if (typeof visible === 'function') {
            try {
                return visible() !== false;
            } catch (error) {
                console.error(`Failed calling visible: ${visible.toString()}`, error);
                return true;
            }
        } else {
            return true;
        }
    };

    function getDimensionParameter(object, attributeName, separator) {
        if (object === true) {
            return separator;
        } else if (typeof object === 'number') {
            return object;
        } else if (object !== null && typeof object === 'object') {
            const margin = object[attributeName];
            if (margin === true) {
                return separator;
            } else if (typeof margin === 'number') {
                return margin;
            } else {
                return 0;
            }
        } else {
            return 0;
        }
    }
    ObjectLifecycleManager.getDimensionParameter = getDimensionParameter;

    function computeCentralRectangle(sourceWidth, sourceHeight, targetWidth, targetHeight, targetMargin, targetBorder, relativeX, relativeY) {
        // first we compute the maximum dimension we have for our image
        const marginLeft = getDimensionParameter(targetMargin, 'left', targetBorder);
        const marginRight = getDimensionParameter(targetMargin, 'right', targetBorder);
        const marginTop = getDimensionParameter(targetMargin, 'top', targetBorder);
        const marginBottom = getDimensionParameter(targetMargin, 'bottom', targetBorder);
        const border = typeof targetBorder === 'number' && targetBorder > 0 ? targetBorder : 0;
        const tgtWidth = targetWidth - marginLeft - marginRight - border * 2;
        const tgtHeight = targetHeight - marginTop - marginBottom - border * 2;
        // now we compute the scales to fit within the maximum dimension
        const scaleX = tgtWidth / sourceWidth;
        const scaleY = tgtHeight / sourceHeight;
        // get the relevant scale
        const scale = scaleX >= scaleY ? scaleY : scaleX;
        // compute the resulting dimension
        const width = scale * sourceWidth;
        const height = scale * sourceHeight;
        // compute the offsets
        const relx = typeof relativeX === 'number' ? relativeX : 0.5;
        const rely = typeof relativeY === 'number' ? relativeY : 0.5;
        const offsetX = (tgtWidth - width) * relx;
        const offsetY = (tgtHeight - height) * rely;
        // return the resulting values
        return {
            x: marginLeft + border + offsetX,
            y: marginTop + border + offsetY,
            width,
            height,
            scale
        };
    };

    let _dummyText = undefined;
    function getTextSize(text, font) {
        if (_dummyText === undefined) {
            _dummyText = $('<span></span>').hide().appendTo(document.body);
        }
        _dummyText.text(text !== undefined && text !== null ? (typeof text === 'string' ? text : text.toString()) : '');
        if (typeof font === 'string') {
            _dummyText.css('font', font);
        }
        const dimension = { width: _dummyText.width(), height: _dummyText.height() };
        _dummyText.text('');
        return dimension;
    }
    ObjectLifecycleManager.getTextSize = getTextSize;

    function applyDefaultHtmlObject(that) {
        let _cont = that._hmi_context.container;
        _cont.data('hmi_object', that);
        that._hmi_resizes = [];
        // RESIZE
        that._hmi_resize = () => {
            if (_cont !== undefined) {
                const width = _cont.width();
                const height = _cont.height();
                if (width > 0 && height > 0) {
                    for (let i = 0; i < that._hmi_resizes.length; i++) {
                        const func = that._hmi_resizes[i];
                        if (typeof func === 'function') {
                            try {
                                func(width, height);
                            } catch (error) {
                                console.error(`Failed calling resize: ${func.toString()}`, error);
                            }
                        }
                    }
                    if (typeof that.resized === 'function') {
                        try {
                            that.resized(width, height);
                        } catch (error) {
                            console.error(`Failed calling resized: ${that.resized.toString()}`, error);
                        }
                    }
                }
                if (that._hmi_updateAlignment) {
                    that._hmi_updateAlignment();
                }
            }
        };
        that.hmi_fireResized = () => that._hmi_resize();
        that.hmi_updateBorder = engraved => {
            const width = _cont.width();
            const height = _cont.height();
            if (that.border === true) {
                _cont[engraved === true ? 'removeClass' : 'addClass']('hmi-border-embossed');
                _cont[engraved === true ? 'addClass' : 'removeClass']('hmi-border-engraved');
            } else if (that.border === false) {
                _cont[engraved === true ? 'removeClass' : 'addClass']('hmi-border-engraved');
                _cont[engraved === true ? 'addClass' : 'removeClass']('hmi-border-embossed');
            }
            if (width !== _cont.width() || height !== _cont.height()) {
                that._hmi_resize();
            }
        };
        that.hmi_setVisible = visible => {
            const vis = visible === true;
            if (that._hmi_visible !== vis) {
                that._hmi_visible = vis;
                _cont[that._hmi_visible ? 'show' : 'hide']();
                if (that._hmi_visible) {
                    that._hmi_resize();
                }
            }
        };
        that.hmi_isVisible = () => that._hmi_visible;
        // JQUERY ELEMENT
        that.hmi_element = () => _cont;
        that.hmi_addClass = cls => {
            _cont.addClass(cls);
            if (that._hmi_updateAlignment) {
                that._hmi_updateAlignment();
            }
        };
        that.hmi_removeClass = cls => {
            _cont.removeClass(cls);
            if (that._hmi_updateAlignment) {
                that._hmi_updateAlignment();
            }
        };
        that.hmi_css = (key, value) => {
            if (value === null || value === '') {
                _cont.css(key, '');
            } else if (typeof value === 'string') {
                _cont.css(key, value);
                if (that._hmi_updateAlignment) {
                    that._hmi_updateAlignment();
                }
            } else {
                return _cont.css(key);
            }
        };
        that.hmi_attr = (key, value) => {
            if (typeof value === 'string') {
                _cont.attr(key, value);
                if (that._hmi_updateAlignment) {
                    that._hmi_updateAlignment();
                }
            } else {
                return _cont.attr(key);
            }
        };
        that.hmi_setSelected = (selected, cssClass) => {
            const width = _cont.width();
            const height = _cont.height();
            _cont[selected === true ? 'addClass' : 'removeClass'](typeof cssClass === 'string' ? cssClass : 'hmi-selected');
            if (width !== _cont.width() || height !== _cont.height()) {
                that._hmi_resize();
            }
        };
        // BORDER
        that.hmi_updateBorder(false);
        // CLASSES
        let classes = typeof that.classes === 'string' ? that.classes.split(' ') : that.classes;
        if (Array.isArray(classes)) {
            for (let i = 0; i < classes.length; i++) {
                const cls = classes[i];
                if (typeof cls === 'string' && cls.length > 0) {
                    _cont.addClass(cls);
                }
            }
        }
        if (that.bold === true) {
            _cont.addClass('font-bold');
        }
        if (typeof that.background === 'string' && that.background.length > 0) {
            _cont.css('background', that.background);
        }
        if (typeof that.color === 'string' && that.color.length > 0) {
            _cont.css('color', that.color);
        }
        // SELECTED
        if (that.selected === true) {
            that.hmi_setSelected(true);
        }
        // WINDOW RESIZE
        if (that._hmi_nodeParent === null || typeof that._hmi_nodeParent !== 'object') {
            $(window).bind('resize', that._hmi_resize);
        }
        that._hmi_destroys.push(() => {
            if (that._hmi_nodeParent === null || typeof that._hmi_nodeParent !== 'object') {
                $(window).unbind('resize', that._hmi_resize);
            }
            _cont.data('hmi_object', null);
            if (typeof that.border === 'boolean') {
                _cont.removeClass('hmi-border-embossed');
                _cont.removeClass('hmi-border-engraved');
            }
            if (that.bold === true) {
                _cont.removeClass('font-bold');
            }
            delete that.hmi_updateBorder;
            delete that.hmi_setVisible;
            delete that.hmi_isVisible;
            delete that.hmi_element;
            delete that.hmi_addClass;
            delete that.hmi_removeClass;
            delete that.hmi_css;
            delete that.hmi_attr;
            delete that.hmi_setSelected;
            that._hmi_resizes.splice(0, that._hmi_resizes.length);
            delete that._hmi_resizes;
            delete that.hmi_fireResized;
            delete that._hmi_resize;
            _cont = undefined;
            that = undefined;
        });
    }
    ObjectLifecycleManager.applyDefaultHtmlObject = applyDefaultHtmlObject;
    function getWatch(watch) {
        if (Array.isArray(watch)) {
            let found = false;
            for (let i = 0; i < watch.length; i++) {
                if (typeof watch[i] === 'string') {
                    found = true;
                    break;
                }
            }
            if (found) {
                const ws = [];
                for (let i = 0; i < watch.length; i++) {
                    const w = watch[i];
                    if (typeof w === 'string') {
                        ws.push(w);
                    }
                }
                return ws;
            } else {
                return undefined;
            }
        } else if (typeof watch === 'string') {
            return [watch];
        } else {
            return undefined;
        }
    }

    function applySimpleHtmlObject(that) {
        let _cont = that._hmi_context.container;
        let _image = undefined;
        let _text = undefined;
        let _html = undefined;
        // ADD STANDARD METHODS
        that.hmi_setImageSource = source => {
            if (_text !== undefined) {
                _text.remove();
                _text = undefined;
            }
            if (_html !== undefined) {
                _html = undefined;
                _cont.empty();
            }
            if (_image === undefined) {
                let img = '<img draggable="false"';
                if (that.imageWidth !== undefined) {
                    img += ` width="${that.imageWidth}"`;
                }
                if (that.imageHeight !== undefined) {
                    img += ` height="${that.imageHeight}"`;
                }
                img += '></img>';
                _image = $(img);
                _image.appendTo(_cont);
                const classes = typeof that.imageClasses === 'string' ? that.imageClasses.split(' ') : that.imageClasses;
                if (Array.isArray(classes)) {
                    for (let i = 0; i < classes.length; i++) {
                        const cls = classes[i];
                        if (typeof cls === 'string' && cls.length > 0) {
                            _image.addClass(cls);
                        }
                    }
                }
                _image.on('load', that._hmi_updateAlignment);
            }
            const src = typeof source === 'string' ? source : '';
            _image.attr('src', src);
            _image[src.length > 0 ? 'show' : 'hide']();
        };
        that.hmi_getImageWidth = () => {
            if (_image !== undefined) {
                const img = _image[0];
                return img !== undefined ? img.naturalWidth : undefined;
            } else {
                return undefined;
            }
        };
        that.hmi_getImageHeight = () => {
            if (_image !== undefined) {
                const img = _image[0];
                return img !== undefined ? img.naturalHeight : undefined;
            } else {
                return undefined;
            }
        };
        that.hmi_text = text => {
            if (_image !== undefined) {
                _image.off('load', that._hmi_updateAlignment);
                _image.remove();
                _image = undefined;
            }
            if (_html !== undefined) {
                _html = undefined;
                _cont.empty();
            }
            if (_text === undefined) {
                const type = typeof that.domtype === 'string' && that.domtype.length > 0 ? that.domtype : 'span';
                _text = $('<' + type + ' style="display:inline-block;"></' + type + '>');
                _text.appendTo(_cont);
                const classes = typeof that.textClasses === 'string' ? that.textClasses.split(' ') : that.textClasses;
                if (Array.isArray(classes)) {
                    for (let i = 0; i < classes.length; i++) {
                        const cls = classes[i];
                        if (typeof cls === 'string' && cls.length > 0) {
                            _text.addClass(cls);
                        }
                    }
                }
                if (typeof that.fontsize === 'number') {
                    _text.css('font-size', that.fontsize.toString() + 'px');
                }
            }
            if (text !== undefined && text !== null) {
                _text.empty();
                _text.text(typeof text === 'string' ? text : text.toString());
                that._hmi_updateAlignment();
            } else {
                return _text.text();
            }
        };
        that.hmi_html = html => {
            if (_text !== undefined) {
                _text.remove();
                _text = undefined;
            }
            if (_image !== undefined) {
                _image.off('load', that._hmi_updateAlignment);
                _image.remove();
                _image = undefined;
            }
            if (html !== undefined) {
                _html = true;
                _cont.empty();
                _cont.html(typeof html === 'string' ? html : html.toString());
            } else {
                return _cont.html();
            }
        };
        that._hmi_updateAlignment = () => {
            if (_text !== undefined) {
                if (_text._hmi_marginLeft !== undefined) {
                    _text._hmi_marginLeft = undefined;
                    _text.css('margin-left', '');
                }
                if (_text._hmi_marginTop !== undefined) {
                    _text._hmi_marginTop = undefined;
                    _text.css('margin-top', '');
                }
                const align = getAlignment(that.align, undefined, false, true);
                const containerWidth = Math.floor(_cont.innerWidth());
                const containerHeight = Math.floor(_cont.innerHeight());
                const contentWidth = Math.ceil(_text.width());
                const contentHeight = Math.ceil(_text.height());
                const left = Math.floor((containerWidth - contentWidth) * align.x) - 1;
                if (left > 0) {
                    if (_text._hmi_marginLeft !== left) {
                        _text._hmi_marginLeft = left;
                        _text.css('margin-left', left.toString() + 'px');
                    }
                } else {
                    if (_text._hmi_marginLeft !== undefined) {
                        _text._hmi_marginLeft = undefined;
                        _text.css('margin-left', '');
                    }
                }
                const top = Math.floor((containerHeight - contentHeight) * align.y) - 1;
                if (top > 0) {
                    if (_text._hmi_marginTop !== top) {
                        _text._hmi_marginTop = top;
                        _text.css('margin-top', top.toString() + 'px');
                    }
                } else {
                    if (_text._hmi_marginTop !== undefined) {
                        _text._hmi_marginTop = undefined;
                        _text.css('margin-top', '');
                    }
                }
            } else if (_image !== undefined) {
                const align = getAlignment(that.align, undefined, false, true);
                const containerWidth = Math.floor(_cont.innerWidth());
                const containerHeight = Math.floor(_cont.innerHeight());
                const contentWidth = Math.ceil(_image[0].naturalWidth);
                const contentHeight = Math.ceil(_image[0].naturalHeight);
                const rect = computeCentralRectangle(contentWidth, contentHeight, containerWidth, containerHeight, that.margin, that.separator, align.x, align.y);
                const width = Math.floor(rect.width);
                if (_image._hmi_width !== width) {
                    _image._hmi_width = width;
                    _image.attr('width', width);
                }
                const height = Math.floor(rect.height);
                if (_image._hmi_height !== height) {
                    _image._hmi_height = height;
                    _image.attr('height', height);
                }
                const left = Math.floor(rect.x);
                if (_image._hmi_x !== left) {
                    _image._hmi_x = left;
                    _image.css('margin-left', left.toString() + 'px');
                }
                const top = Math.floor(rect.y);
                if (_image._hmi_y !== top) {
                    _image._hmi_y = top;
                    _image.css('margin-top', top.toString() + 'px');
                }
            }
        };
        if (typeof that.html === 'string') { // HTML CONTENT
            _html = true;
            _cont.addClass(that.scrollable === true ? 'default-scroll-container' : 'overflow-hidden');
            _cont.html(that.html);
        } else if (typeof that.text === 'string' || typeof that.text === 'number' || typeof that.text === 'boolean') { // TEXT CONTENT
            _cont.addClass(that.scrollable === true ? 'default-scroll-container' : 'overflow-hidden');
            that.hmi_text(that.text);
        } else if (typeof that.image === 'string') { // IMAGE CONTENT
            _cont.addClass('overflow-hidden');
            that.hmi_setImageSource(that.image);
        } else { // NO CONTENT
            _cont.addClass(that.scrollable === true ? 'default-scroll-container' : 'overflow-hidden');
        }
        that._hmi_destroys.push(() => {
            if (_image !== undefined) {
                _image.off('load', that._hmi_updateAlignment);
                _image.remove();
                _image = undefined;
            }
            if (_text !== undefined) {
                _text.remove();
                _text = undefined;
            }
            if (_html !== undefined) {
                _html = undefined;
            }
            _cont = undefined;
            that = undefined;
        });
    };

    function applyTaskObject(that, context, disableVisuEvents, enableEditorEvents, onSuccess, onError) {
        let tasks = [];
        let _cont = that._hmi_context.container;
        that.hmi_text = text => {
            if (text !== undefined && text !== null) {
                that.text = typeof text === 'string' ? text : text.toString();
            } else {
                return that.text;
            }
        };
        let _children = undefined;
        if (Array.isArray(that.children)) {
            _children = that.children;
            for (let i = 0, l = _children.length; i < l; i++) {
                // closure
                (function () {
                    const child = _children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj && isTaskType(hmiobj) && hmiobj._hmi_init_dom) {
                        // #task: 1
                        tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: _cont }, onSuc, onErr));
                    }
                }());
            }
        }
        that._hmi_destroys.push((onSuc, onErr) => {
            const tasks = [];
            if (_children) {
                for (let i = _children.length - 1; i >= 0; i--) {
                    const child = _children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj && isTaskType(hmiobj) && hmiobj._hmi_destroy_dom) {
                        (function () {
                            const ho = hmiobj;
                            // #task: 1
                            tasks.push((os, oe) => ho._hmi_destroy_dom(os, oe))
                        }());
                    }
                }
                _children = undefined;
            }
            delete that.hmi_text;
            _cont = undefined;
            that = undefined;
            Executor.run(tasks, onSuc, onErr);
        });
        Executor.run(tasks, onSuccess, onError);
    }

    /**
     * This is our actual hmi object implementation
     */
    let s_objectId = 0;
    function applyObject(that, disableVisuEvents, enableEditorEvents) {
        let _cont = undefined;
        that._hmi_objectId = s_objectId++;
        // TODO what for graph or handler objects???
        let _fClickedDraggable = undefined;
        // LISTENERS
        let _watch = undefined;
        let _onEventCallbacks = undefined;
        that._hmi_listenerAdds = [];
        that._hmi_listenerRemoves = [];
        // REFRESH AND DESTROY
        that._hmi_refreshs = [];
        that._hmi_destroys = [];
        // CONTEXT
        that.hmi_context = () => that._hmi_context;
        that.hmi_getHtmlTextSize = text => _cont ? getTextSize(text, _cont.css('font')) : undefined;
        // objects are visible as default
        that._hmi_visible = true;
        // //////////////////////////////////////////////////////////////////////////////
        // INTERNAL METHODS
        // //////////////////////////////////////////////////////////////////////////////

        // INITIALIZE THE DOCUMENT
        that._hmi_init_dom = (context, onSuccess, onError) => {
            const tasks = [];
            that._hmi_context = context;
            _cont = context.container;
            if (isTaskType(that)) {
                tasks.push((onSuc, onErr) => applyTaskObject(that, that._hmi_context, disableVisuEvents, enableEditorEvents, onSuc, onErr));
            } else {
                if (that.type === 'graph') {
                    // if a graphics object apply graphic functionality
                    if (s_applyGraphicObject) {
                        tasks.push((onSuc, onErr) => s_applyGraphicObject(that, that._hmi_context, disableVisuEvents, enableEditorEvents, onSuc, onErr));
                    } else {
                        onError('Type "graph" is not supported');
                    }
                } else {
                    tasks.push((onSuc, onErr) => {
                        applyDefaultHtmlObject(that);
                        onSuc();
                    });
                    // get type if available
                    const applyType = typeof that.type === 'string' ? s_types[that.type] : false;
                    // if type is available
                    if (typeof applyType === 'function') {
                        tasks.push((onSuc, onErr) => {
                            // apply type specific functionality
                            switch (that.type) {
                                case 'container':
                                    applyType(that, that._hmi_context, disableVisuEvents, enableEditorEvents);
                                    onSuc();
                                    break;
                                case 'grid':
                                case 'float':
                                case 'split':
                                case 'table':
                                case 'textfield':
                                case 'textarea':
                                case 'tree':
                                    applyType(that, that._hmi_context, disableVisuEvents, enableEditorEvents, onSuc, onErr);
                                    onSuc();
                                    break;
                                default:
                                    applyType.call(that, that._hmi_context, disableVisuEvents, enableEditorEvents, onSuc, onErr); // TODO: Still required???
                                    break;
                            }
                        });
                    } else { // no type
                        tasks.push((onSuc, onErr) => {
                            applySimpleHtmlObject(that);
                            onSuc();
                        });
                    }
                    // EXTENSIONS
                    if (applyButtonHandling.isRequired(that, disableVisuEvents)) {
                        tasks.push((onSuc, onErr) => {
                            applyButtonHandling(that, that._hmi_context);
                            onSuc();
                        });
                    }
                    if (applyTimeRangeSelector.isRequired(that)) {
                        tasks.push((onSuc, onErr) => {
                            applyTimeRangeSelector(that);
                            onSuc();
                        });
                    }
                    tasks.push((onSuc, onErr) => {
                        // used for editor only! move somewhere?
                        if (typeof that.draggable === 'string' && enableEditorEvents !== true) {
                            if (_cont) {
                                _cont.draggable({
                                    // set the drag and drop scope
                                    scope: that.draggable,
                                    // helper : 'clone' means we just clone the original
                                    /*
                                     * helper : function() { const clone = _cont.clone();
                                     * clone.appendTo(document.body); return clone; },
                                     */
                                    helper: 'clone',
                                    revert: 'invalid',
                                    revertDuration: 777,
                                    appendTo: 'body',
                                    // the transparency value (alpha)
                                    opacity: 0.7,
                                    // the distance that must be dragged before the actual drag
                                    // starts
                                    distance: 20,
                                    // ignore iframes
                                    iframeFix: true,
                                    // do not scroll if we reach edge of browser frame
                                    scroll: false,
                                    start: (event, ui) => updateEventListenersState(false),
                                    stop: (event, ui) => updateEventListenersState(true)
                                });
                                if (that.clickable !== false) {
                                    _fClickedDraggable = event => {
                                        if ($(that).is('.ui-draggable-dragging')) {
                                            return;
                                        }
                                        preventDefaultAndStopPropagation(event);
                                        const target = that.hmi.droppables[that.draggable];
                                        const data = that.data;
                                        if (target !== null && typeof target === 'object' && typeof target.add === 'function' && data !== null && typeof data === 'object' && typeof data.object === 'string') {
                                            target.add(data.object, data.width, data.height, data.init);
                                        }
                                    };
                                    // touch support???
                                    _cont.on('click', _fClickedDraggable);
                                }
                            }
                        }
                        onSuc();
                    });
                }
                tasks.push((onSuc, onErr) => {
                    try {
                        // VISIBILITY (default is true)
                        if (isVisible(that.visible) === false) {
                            if (disableVisuEvents === true) {
                                that.hmi_setVisible(true);
                                if (_cont && (that._hmi_graphicsRoot === true || that._hmi_graphics !== true)) {
                                    // this is for our editor
                                    _cont.css('opacity', '0.3819660112501052');
                                }
                            } else {
                                that.hmi_setVisible(false);
                            }
                        } else {
                            that.hmi_setVisible(true);
                        }
                        onSuc();
                    } catch (error) {
                        onErr(error);
                    }
                });
            }
            // add extensions is available
            for (let i = 0; i < s_extensions.length; i++) { // TODO: Clean up this
                const impl = s_extensions[i];
                if (impl.isExtension(that, that._hmi_context, disableVisuEvents, enableEditorEvents)) {
                    tasks.push((onSuc, onErr) => impl.call(that, that._hmi_context, disableVisuEvents, enableEditorEvents, onSuc, onErr));
                }
            }
            tasks.parallel = false;
            Executor.run(tasks, () => {
                // delete method to prevent other calls
                delete that._hmi_init_dom;
                onSuccess();
            }, onError);
        };
        // ADD LISTENERS
        that._hmi_addListeners = (hmiObject, onSuccess, onError) => {
            // WATCH / TEXT
            _watch = getWatch(that.watch);
            if (Array.isArray(_watch)) {
                _onEventCallbacks = [];
                for (let i = 0; i < _watch.length; i++) {
                    (function () { // Closure
                        const dataId = _watch[i];
                        let type;
                        try {
                            type = that.hmi.access.getType(dataId);
                        } catch (error) {
                            type = Core.DataType.Unknown;
                        }
                        try {
                            const onRefresh = value => {
                                try {
                                    if (typeof that.handleDataUpdate === 'function') {
                                        that.handleDataUpdate(dataId, value, type);
                                    } else if (type === Core.DataType.HTML) {
                                        if (that.hmi_html) {
                                            that.hmi_html(value !== null ? value : 'null');
                                        }
                                    } else if (that.hmi_text) {
                                        if (typeof that.formatValue === 'function') {
                                            const text = that.formatValue(dataId, value, type);
                                            that.hmi_text(text);
                                        } else if (typeof value === 'number') {
                                            const text = typeof that.factor === 'number' ? that.factor * value : value;
                                            that.hmi_text(Utilities.formatNumber(text, typeof that.postDecimalPositions === 'number' ? that.postDecimalPositions : 0));
                                        } else {
                                            that.hmi_text(value !== null ? value : 'null');
                                        }
                                    }
                                } catch (error) {
                                    console.error(`Failed to handle value on refresh: ${error}`);
                                }
                            };
                            _onEventCallbacks.push(onRefresh);
                            try {
                                that.hmi.access.registerObserver(dataId, onRefresh);
                            } catch (error) {
                                console.error(`Failed subscribing to '${dataId}':\n${error.message}`);
                            }
                        } catch (error) {
                            console.error(`Failed to get type for '${dataId}':\n${error.message}`);
                        }
                    }());
                }
            }
            if (typeof that.handleLanguageChanged === 'function') {
                function onLanguageChanged(language) {
                    that.handleLanguageChanged(language);
                }
                try {
                    that.hmi.lang.addLanguageObserver(onLanguageChanged);
                    that._hmi_onLanguageChanged = onLanguageChanged;
                } catch (error) {
                    console.error(`Failed subscribing on language:\n${error.message}`);
                }
            }
            // add listeners
            for (let i = 0; i < that._hmi_listenerAdds.length; i++) {
                const func = that._hmi_listenerAdds[i];
                if (typeof func === 'function') {
                    try {
                        func();
                    } catch (error) {
                        console.error(`Failed adding listeners: ${func.toString()}`, error);
                    }
                }
            }
            // delete method to prevent other calls
            delete that._hmi_addListeners;
            onSuccess();
        };
        // REMOVE LISTENERS
        that._hmi_removeListeners = (hmiObject, onSuccess, onError) => {
            // remove listeners
            for (let i = that._hmi_listenerRemoves.length - 1; i >= 0; i--) {
                const func = that._hmi_listenerRemoves[i];
                if (typeof func === 'function') {
                    try {
                        func();
                    }
                    catch (error) {
                        console.error(`Failed removing listeners: ${func.toString()}`, error);
                    }
                }
            }
            if (that._hmi_onLanguageChanged) {
                try {
                    that.hmi.lang.removeLanguageObserver(that._hmi_onLanguageChanged);
                } catch (error) {
                    console.error(`Failed subscribing from language:\n${error.message}`);
                }
                delete that._hmi_onLanguageChanged;
            }
            if (Array.isArray(_watch)) {
                for (let i = _watch.length - 1; i >= 0; i--) {
                    try {
                        that.hmi.access.unregisterObserver(_watch[i], _onEventCallbacks[i]);
                    } catch (error) {
                        console.error(`Failed unsubscribing from '${_watch[i]}':\n${error.message}`);
                    }
                }
                _watch.splice(0, _watch.length);
                _watch = undefined;
                _onEventCallbacks = undefined;
            }
            // delete method to prevent other calls
            delete that._hmi_removeListeners;
            onSuccess();
        };
        // CLEAN UP
        that._hmi_destroy_dom = () => {
            that._hmi_refreshs.splice(0, that._hmi_refreshs.length);
            // perform all destroys and remove all
            for (let i = that._hmi_destroys.length - 1; i >= 0; i--) {
                const func = that._hmi_destroys[i];
                if (typeof func === 'function') {
                    try {
                        func();
                    } catch (error) {
                        console.error(`Failed destroying object with id '${that._hmi_objectId}': ${func.toString()}`, error);
                    }
                }
            }
            that._hmi_destroys.splice(0, that._hmi_destroys.length);
            if (_cont) {
                if (_fClickedDraggable !== undefined) {
                    _cont.off('click', _fClickedDraggable);
                    _fClickedDraggable = undefined;
                }
                if (typeof that.draggable === 'string' && enableEditorEvents !== true) {
                    _cont.draggable('destroy');
                }
                _cont.empty();
            }
            _cont = undefined;
            // prevent other calls
            delete that._hmi_destroy_dom;
        };
        // DESTROY VISU OBJECT
        that._hmi_destroy = () => {
            // remove listener adds and removes
            that._hmi_listenerAdds.splice(0, that._hmi_listenerAdds.length);
            delete that._hmi_listenerAdds;
            that._hmi_listenerRemoves.splice(0, that._hmi_listenerRemoves.length);
            delete that._hmi_listenerRemoves;
            delete that._hmi_removeListeners;
            delete that._hmi_addListeners;
            // remove all added public attributes and methods
            delete that.hmi_getHtmlTextSize;
            delete that.hmi_context;
            delete that.hmi_setImageSource;
            delete that.hmi_getImageWidth;
            delete that.hmi_getImageHeight;
            delete that.hmi_text;
            delete that.hmi_html;
            // remove all added private attributes and methods
            delete that._hmi_refreshs;
            delete that._hmi_destroys;
            delete that._hmi_context;
            delete that._hmi_init_dom;
            delete that._hmi_destroy_dom;
            delete that._hmi_visible;
            delete that._hmi_updateAlignment;
            delete that._hmi_objectId;
            delete that._hmi_destroy;
            // reset references
            that = undefined;
        };
    }

    function showDialog(hmi, config, onSuccess, onError) {
        // dialog opacity: search for "ui-widget-overlay" in CSS and modify:
        // opacity: .0;
        const dialogElement = $('<div class="hmi-light" />');
        let _buttons = undefined;
        function fnClose() {
            dialogElement.dialog('close');
        };
        const options = {
            // configure
            autoOpen: true,
            modal: true,
            close: (event, ui) => {
                if (config.object !== null && typeof config.object === 'object') {
                    delete config.object.hmi_close;
                }
                if (Array.isArray(_buttons)) {
                    for (let i = _buttons.length - 1; i >= 0; i--) {
                        const button = _buttons[i];
                        if (config.object && config.object._hmi_object) {
                            destroyIdNodeSubTree(button);
                        }
                        delete button.hmi_setVisible;
                        delete button._hmi_element;
                    }
                }
                killObjectSubTree(config.object, () => { }, error => console.error(`Error closing dialog: ${error}`));
                dialogElement.dialog('destroy');
                dialogElement.remove();
                if (typeof config.closed === 'function') {
                    config.closed(event, ui);
                }
            }
        };
        if (config.object !== null && typeof config.object === 'object') {
            config.object.hmi_close = fnClose;
        }
        if (typeof config.title === 'string') {
            // set title
            options.title = config.title;
        }
        if (typeof config.width === 'number') {
            options.width = config.width;
        }
        if (typeof config.height === 'number') {
            options.height = config.height;
        }
        const win = $(window);
        if (typeof options.width === 'number' && options.width > win.width()) {
            options.width = win.width();
        }
        if (typeof options.height === 'number' && options.height > win.height()) {
            options.height = win.height();
        }
        if (config.noClose === true) {
            options.dialogClass = 'no-close';
            options.closeOnEscape = false;
        } else {
            options.closeOnEscape = true;
        }
        dialogElement.dialog(options);
        createObjectSubTree(config.object, dialogElement, () => {
            const hmiobj = config.object._hmi_object;
            if (hmiobj) {
                _buttons = Array.isArray(hmiobj.buttons) ? hmiobj.buttons : (Array.isArray(config.buttons) ? config.buttons : undefined);
                if (Array.isArray(_buttons) && _buttons.length > 0) {
                    const buttons = [];
                    for (let i = 0; i < _buttons.length; i++) {
                        (function () { // closure
                            const button = _buttons[i];
                            if (typeof button.click === 'function') {
                                createIdNodeSubTree(button, hmiobj, button.id, hmiobj);
                                button._hmi_buttonId = Utilities.getUniqueId();
                                buttons.push({
                                    text: typeof button.text === 'string' ? button.text : '?',
                                    id: button._hmi_buttonId,
                                    click: () => {
                                        if (typeof button.click === 'function') {
                                            button.click(fnClose, button);
                                        }
                                    }
                                });
                                button.hmi_setVisible = visible => button._hmi_element[visible === true ? 'show' : 'hide']();
                            }
                        }());
                    }
                    dialogElement.dialog('option', 'buttons', buttons);
                    for (let i = 0; i < _buttons.length; i++) {
                        const button = _buttons[i];
                        if (typeof button.click === 'function') {
                            button._hmi_element = $('#' + button._hmi_buttonId);
                            button._hmi_element.attr('id', null);
                            delete button._hmi_buttonId;
                            if (isVisible(button.visible) === false) {
                                button.hmi_setVisible(false);
                            }
                        }
                    }
                    if (hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                }
            }
            if (typeof onSuccess === 'function') {
                try {
                    onSuccess();
                } catch (error) {
                    console.error(`Failed calling ready callback: ${onSuccess.toString()}`, error);
                }
            }
        }, onError, hmi, config.init);
        return fnClose;
    }
    ObjectLifecycleManager.showDialog = showDialog;

    function showDefaultConfirmationDialog(hmi, config, onSuccess, onError) {
        function perform(callback, close) {
            try {
                callback();
            } catch (error) {
                console.error(`Failed calling callback: ${callback.toString()}`, error);
            }
            close();
        };
        const buttons = [];
        if (typeof config.ok === 'function') {
            buttons.push({
                text: typeof config.okLabelId === 'string' ? that.hmi.access.Get(config.okLabelId) : 'OK', // TODO: Get() not exists!
                click: close => perform(config.ok, close)
            });
        }
        if (typeof config.yes === 'function') {
            buttons.push({
                text: typeof config.yesLabelId === 'string' ? that.hmi.access.Get(config.yesLabelId) : 'Yes', // TODO: Get() not exists!
                click: close => perform(config.yes, close)
            });
        }
        if (typeof config.no === 'function') {
            buttons.push({
                text: typeof config.noLabelId === 'string' ? that.hmi.access.Get(config.noLabelId) : 'No', // TODO: Get() not exists!
                click: close => perform(config.no, close)
            });
        }
        if (typeof config.cancel === 'function') {
            buttons.push({
                text: typeof config.cancelLabelId === 'string' ? that.hmi.access.Get(config.cancelLabelId) : 'Cancel', // TODO: Get() not exists!
                click: close => perform(config.cancel, close)
            });
        }
        let object = undefined;
        if (config.object !== null && typeof config.object === 'object') {
            object = config.object;
        } else if (config.text !== undefined) {
            object = { text: config.text };
        } else if (config.html !== undefined) {
            object = { html: config.html };
        }
        const dialog = {
            title: config.title,
            width: config.width,
            height: config.height,
            object,
            noClose: true,
            buttons
        };
        if (typeof config.closed === 'function') {
            dialog.closed = config.closed;
        }
        return showDialog(hmi, dialog, onSuccess, onError);
    }
    ObjectLifecycleManager.showDefaultConfirmationDialog = showDefaultConfirmationDialog;

    /**
     * This method transfers the specified attribute from the source to the
     * target. If source and target attribute are both arrays we treat their
     * elements analogically. If source and target attribute are both objects we
     * transfer all primitive attributes and treat array and object attributes
     * analogically.
     * 
     * @param {Object}
     *          source The source object or array
     * @param {Object}
     *          target The target object or array
     * @param {Object}
     *          attribute The attribute name.
     */
    function transferAttribute(source, target, attribute) {
        const sourceAttribute = source[attribute];
        const targetAttribute = target[attribute];
        if (Array.isArray(sourceAttribute)) {
            if (Array.isArray(targetAttribute)) {
                transferAttributes(sourceAttribute, targetAttribute, undefined);
            } else {
                target[attribute] = sourceAttribute;
            }
        } else if (sourceAttribute !== null && typeof sourceAttribute === 'object') {
            if (Array.isArray(targetAttribute)) {
                target[attribute] = sourceAttribute;
            } else if (targetAttribute !== null && typeof targetAttribute === 'object') {
                transferAttributes(sourceAttribute, targetAttribute, undefined);
            } else {
                target[attribute] = sourceAttribute;
            }
        } else if (sourceAttribute !== undefined) {
            target[attribute] = sourceAttribute;
        }
    }
    /**
     * This method transfers all attributes from the source to the target. If
     * source and target are both arrays we iterate over all elements. If source
     * and target are both objects we iterate over all attributes.
     * 
     * @param {Object}
     *          source The source object or array
     * @param {Object}
     *          target The target object or array
     * @param {boolean}
     *          ignoreAttribute If true attributes named 'id' will be ignored
     */
    function transferAttributes(source, target, ignoreAttribute) {
        if (Array.isArray(source)) {
            for (let i = 0; i < source.length; i++) {
                transferAttribute(source, target, i);
            }
        } else {
            for (const attr in source) {
                if (source.hasOwnProperty(attr) && (ignoreAttribute === undefined || ignoreAttribute !== attr)) {
                    transferAttribute(source, target, attr);
                }
            }
        }
    }
    /**
     * This function performs a from node to node navigation via the given path.
     * @param {Object}
     *          node The start node
     * @param {Object}
     *          path The path (parts separated by slash)
     */
    const NODE_ID_PATH_DELIMITER = '/';
    function getIdNode(node, path) {
        if (typeof path !== 'string') {
            return undefined;
        }
        const pathParts = path.split(NODE_ID_PATH_DELIMITER);
        let idNode = node;
        for (let i = 0; i < pathParts.length; i++) {
            const id = pathParts[i];
            if (id === '.') {
                // same node ==> nothing to do
                continue;
            }
            if (id === '..') {
                // go to parent node
                const parent = idNode._hmi_nodeParent;
                if (parent !== undefined && parent !== null) {
                    idNode = parent;
                    continue;
                } else {
                    return undefined;
                }
            }
            if (id === '' && i === 0) {
                // get root
                const parent = idNode._hmi_nodeParent;
                while (parent !== undefined && parent !== null) {
                    idNode = parent;
                    parent = idNode._hmi_nodeParent;
                }
                continue;
            }
            const children = idNode._hmi_nodeChildren;
            if (Array.isArray(children)) {
                let found = false;
                for (let j = 0; j < children.length; j++) {
                    const child = children[j];
                    if (child._hmi_nodeId === id) {
                        idNode = child;
                        found = true;
                        break;
                    }
                }
                if (found === true) {
                    continue;
                } else {
                    return undefined;
                }
            }
            return undefined;
        }
        return idNode;
    }
    function createIdNodeSubTree(object, parentObject, id, nodeParent) {
        object.hmi_node = path => {
            const node = typeof object._hmi_nodeId === 'string' || object._hmi_nodeParent === undefined || object._hmi_nodeParent === null ? object : object._hmi_nodeParent;
            return typeof path === 'string' ? getIdNode(node, path) : node;
        };
        object.hmi_path = () => {
            const path = [];
            let node = object.hmi_node('.');
            while (node !== null && typeof node === 'object' && typeof node._hmi_nodeId === 'string') {
                path.splice(0, 0, node._hmi_nodeId);
                node = node.hmi_node('..');
            }
            return path.join(NODE_ID_PATH_DELIMITER);
        };
        if (parentObject) {
            object.hmi_parentObject = parentObject;
        }
        if (typeof id === 'string') {
            object._hmi_nodeId = id;
        } else if (typeof object.id === 'string') {
            object._hmi_nodeId = object.id;
        } else {
            delete object._hmi_nodeId;
        }
        if (nodeParent !== null && typeof nodeParent === 'object') {
            object._hmi_nodeParent = nodeParent;
            if (nodeParent._hmi_nodeChildren === undefined) {
                nodeParent._hmi_nodeChildren = [];
            } else if (object._hmi_nodeId !== undefined) {
                const clds = nodeParent._hmi_nodeChildren;
                for (let i = 0; i < clds.length; i++) {
                    if (clds[i]._hmi_nodeId === object._hmi_nodeId) {
                        // node traversing may not work like expected because nodes will be
                        // unreachable! ==> modify your object id's
                        console.warn('WARNING! NODE USER-ID CONFILCT: ID ALREADY EXISTS: "' + object._hmi_nodeId + '" path: "' + object.hmi_path() + '"');
                        break;
                    }
                }
            }
            nodeParent._hmi_nodeChildren.push(object);
        }
        const children = object.children;
        if (Array.isArray(children)) {
            const parent = object.hmi_node();
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                child.hmi_parentObject = object;
                const hmiobj = child._hmi_object;
                if (hmiobj) {
                    hmiobj.hmi_locator = child;
                    createIdNodeSubTree(hmiobj, object, child.id, parent);
                }
            }
        }
    }
    function destroyIdNodeSubTree(object) {
        const children = object.children;
        if (Array.isArray(children)) {
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                const hmiobj = child._hmi_object;
                if (hmiobj) {
                    destroyIdNodeSubTree(hmiobj);
                    delete hmiobj.hmi_locator;
                }
                delete child.hmi_parentObject;
            }
        }
        delete object.hmi_path;
        delete object.hmi_node;
        const parent = object._hmi_nodeParent;
        if (parent !== null && typeof parent === 'object') {
            const nodeChildren = parent._hmi_nodeChildren;
            if (Array.isArray(nodeChildren)) {
                for (let j = nodeChildren.length - 1; j >= 0; j--) {
                    if (nodeChildren[j] === object) {
                        nodeChildren.splice(j, 1);
                        break;
                    }
                }
                if (nodeChildren.length === 0) {
                    delete parent._hmi_nodeChildren;
                }
            }
        }
        delete object._hmi_nodeParent;
        delete object._hmi_nodeId;
        delete object.hmi_parentObject;
    }
    /**
     * This methods handles the given data on the given object. If data is an
     * object the data attributes will be copied to the object. If data is an
     * array this function will be called recursively on all elements. If data is
     * a function the function will be called repeatedly as long it returns true.
     * 
     * @param {Object}
     *          object The object
     * @param {Object}
     *          data The data
     * @param {Object}
     *          onSuccess This method will be called if we have completely with
     *          our procedure.
     */
    function performDataOnHmiObject(contextObject, object, data, onSuccess, onError) {
        if (typeof data === 'function') {
            try {
                // call the function as method of our context object (meaning inside our
                // function "this" refers to the context object)
                data.call(contextObject, object, onSuccess, onError);
            } catch (error) {
                onError('EXCEPTION! Calling function:\n' + data.toString() + '\nreason: ' + error);
            }
        } else if (Array.isArray(data)) {
            if (data.length > 0) {
                // we call ourself recursively for all array elements within a pipe to
                // handle asynchronous operations
                const tasks = [];
                for (let i = 0, l = data.length; i < l; i++) {
                    // handle within closure for asynchronous callback access to the data
                    (function () {
                        const d = data[i];
                        tasks.push((onSuc, onErr) => performDataOnHmiObject(contextObject, object, d, onSuc, onErr));
                    }());
                }
                // add final action
                Executor.run(tasks, onSuccess, onError);
            } else {
                onSuccess();
            }
        } else if (data !== null && typeof data === 'object') {
            if (typeof data.id === 'string') {
                // we got to find a specific visualization object
                const hmiObject = typeof object.hmi_node === 'function' ? object.hmi_node(data.id) : undefined;
                if (hmiObject !== null && typeof hmiObject === 'object') {
                    transferAttributes(data, hmiObject, 'id');
                }
            } else {
                // just call on visualization object
                transferAttributes(data, object, 'id');
            }
            onSuccess();
        } else {
            onSuccess();
        }
    };

    /**
     * This function transfers data to object attributes and iterates over objects
     * children recursively . What comes first must be specified by the "from root
     * to leaf" flag.
     * 
     * @param {Object}
     *          object The object
     * @param {Object}
     *          attributeName The attribute name of the data object, array or function
     * @param {Object}
     *          fromRootToLeaf If true we call handle the object before we
     *          iterate over it's children.
     * @param {Object}
     *          onSuccess This function will be called when done.
     */
    function performAttributeOnObjectSubTree(object, attributeName, fromRootToLeaf, onSuccess, onError, hmi) {
        // if we where called with object = object.children (in case of object
        // is grid, split, float, ...)
        if (Array.isArray(object)) {
            if (object.length > 0) {
                const tasks = [], children = object;
                for (let i = 0; i < children.length; i++) {
                    (function () {
                        const idx = i;
                        tasks.push((onSuc, onErr) => {
                            const child = children[fromRootToLeaf === true ? idx : children.length - 1 - idx];
                            performAttributeOnObjectSubTree(child, attributeName, fromRootToLeaf, onSuc, onErr, hmi);
                        });
                    }());
                }
                Executor.run(tasks, onSuccess, onError);
            } else {
                onSuccess();
            }
        } else if (object !== null && typeof object === 'object') { // if we are an object or a holder
            if (hmi) {
                object.hmi = hmi;
            }
            const success = hmi === false ? () => {
                delete object.hmi;
                onSuccess();
            } : onSuccess;
            const subObject = object.object;
            if (subObject !== null && typeof subObject === 'object') {
                // we contain an object named object so we are a holder
                const data = object[attributeName];
                if (data !== undefined && data !== null) {
                    let hmiobj = object._hmi_object;
                    if (hmiobj === undefined) {
                        let obj = subObject;
                        let cld = obj.object;
                        while (cld !== null && typeof cld === 'object') {
                            obj = cld;
                            cld = obj.object;
                        }
                        hmiobj = obj;
                    }
                    if (fromRootToLeaf === true) {
                        performDataOnHmiObject(object, hmiobj, data, () => performAttributeOnObjectSubTree(subObject, attributeName, fromRootToLeaf, success, onError, hmi), onError);
                    } else {
                        performAttributeOnObjectSubTree(subObject, attributeName, fromRootToLeaf, () => performDataOnHmiObject(object, hmiobj, data, success, onError), onError, hmi);
                    }
                } else {
                    performAttributeOnObjectSubTree(subObject, attributeName, fromRootToLeaf, success, onError, hmi);
                }
            } else { // we contain no object named object so we are the hmi object
                const data = object[attributeName];
                if (data !== undefined && data !== null) {
                    if (fromRootToLeaf === true) {
                        performDataOnHmiObject(object, object, data, () => performAttributeOnObjectSubTree(object.children, attributeName, fromRootToLeaf, success, onError, hmi), onError);
                    } else {
                        performAttributeOnObjectSubTree(object.children, attributeName, fromRootToLeaf, () => performDataOnHmiObject(object, object, data, success, onError), onError, hmi);
                    }
                } else {
                    performAttributeOnObjectSubTree(object.children, attributeName, fromRootToLeaf, success, onError, hmi);
                }
            }
        } else {
            onSuccess();
        }
    }

    const s_root_objects = [];

    const LifecycleLevel = Object.freeze({ Idle: 0, Initialized: 1, BaseFeaturesAdded: 2, DOMFeaturesAdded: 3, ListenersAdded: 4, Running: 5 });
    const LifecycleState = Object.freeze({
        Idle: 0, Build: 1, Apply: 2, Prepare: 3, Start: 4,
        Running: 5, Stop: 6, Destroy: 7, Remove: 8, Cleanup: 9
    });
    const LifecycleUserMethod = Object.freeze({
        Build: 'build', Apply: 'apply', Prepare: 'prepare', Start: 'start',
        Stop: 'stop', Destroy: 'destroy', Remove: 'remove', Cleanup: 'cleanup'
    });
    const LifecycleUserMethodTimeout = Object.freeze({
        Create: 'createTimeout', Build: 'buildTimeout', Apply: 'applyTimeout', Prepare: 'prepareTimeout', Start: 'startTimeout',
        Kill: 'killTimeout', Stop: 'stopTimeout', Destroy: 'destroyTimeout', Remove: 'removeTimeout', Cleanup: 'cleanupTimeout'
    });
    ObjectLifecycleManager.LifecycleState = LifecycleState;
    ObjectLifecycleManager.formatObjectLifecycleState = state => {
        for (const name in LifecycleState) {
            if (LifecycleState.hasOwnProperty(name) && LifecycleState[name] === state) {
                return name;
            }
        }
        return `Unknown state: ${state}`;
    };
    const DEFAULT_TIMEOUT = 5000;

    // /////////////////////////////////////////////////////////////////////////////////////////
    // INITIALIZATION AND DESTROY
    // /////////////////////////////////////////////////////////////////////////////////////////
    function createObjectSubTree(object, jQueryElement, onSuccess, onError, hmi, initData, parentObject, nodeId, parentNode, disableVisuEvents, enableEditorEvents, onLifecycleStateChanged) { // TODO: Clean up this argument list
        if (object !== null && typeof object === 'object' && !Array.isArray(object)) {
            const onStateChanged = typeof onLifecycleStateChanged === 'function' ? onLifecycleStateChanged : state => { };
            const tasks = [];
            let hmiobj = undefined;
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr('Object has been killed before initialization');
                } else {
                    initObject(object, initData);
                    object._hmi_lifecycleLevel = LifecycleLevel.Initialized;
                    onSuc();
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr(`Object has been killed before ${LifecycleUserMethod.Build}()`);
                } else {
                    onStateChanged(LifecycleState.Build);
                    const timeout = object[LifecycleUserMethodTimeout.Build];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Build, true, os, oe, hmi),
                            onSuc, onErr, () => onErr(`timeout expired during ${LifecycleUserMethod.Build}() (${timeout} ms)`), timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Build, true, onSuc, onErr, hmi);
                    }
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr('Object has been killed before adding core features');
                } else {
                    attachHmiObject(object);
                    hmiobj = object._hmi_object;
                    createIdNodeSubTree(hmiobj, parentObject, nodeId, parentNode);
                    processObjectSubTree(hmiobj, true, undefined, processObject => applyObject(processObject, disableVisuEvents, hmiobj === processObject && enableEditorEvents));
                    object._hmi_lifecycleLevel = LifecycleLevel.BaseFeaturesAdded;
                    onSuc();
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr(`Object has been killed before ${LifecycleUserMethod.Apply}()`);
                } else {
                    onStateChanged(LifecycleState.Apply);
                    const timeout = object[LifecycleUserMethodTimeout.Apply];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Apply, false, os, oe),
                            onSuc, onErr, () => onErr(`timeout expired during ${LifecycleUserMethod.Apply}() (${timeout} ms)`), timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Apply, false, onSuc, onErr);
                    }
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr('Object has been killed before adding dom features');
                } else if (typeof hmiobj._hmi_init_dom !== 'function') {
                    onErr(`Missing '_hmi_init_dom()'`);
                } else {
                    // #create/destroy_hmi_object_branch: 2
                    hmiobj._hmi_init_dom({ container: jQueryElement }, () => {
                        object._hmi_lifecycleLevel = LifecycleLevel.DOMFeaturesAdded;
                        onSuc();
                    }, onErr);
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr(`Object has been killed before ${LifecycleUserMethod.Prepare}()`);
                } else {
                    onStateChanged(LifecycleState.Prepare);
                    const timeout = object[LifecycleUserMethodTimeout.Prepare];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Prepare, true, os, oe),
                            onSuc, onErr, () => onErr(`timeout expired during ${LifecycleUserMethod.Prepare}() (${timeout} ms)`), timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Prepare, true, onSuc, onErr);
                    }
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr('Object has been killed before adding listeners');
                } else {
                    // TODO: handle external sources here
                    performAttributeOnObjectSubTree(object, '_hmi_addListeners', true, () => {
                        object._hmi_lifecycleLevel = LifecycleLevel.ListenersAdded;
                        onSuc();
                    }, onErr);
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr(`Object has been killed before ${LifecycleUserMethod.Start}()`);
                } else {
                    onStateChanged(LifecycleState.Start);
                    const timeout = object[LifecycleUserMethodTimeout.Start];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Start, false, os, oe),
                            onSuc, onErr, () => onErr(`timeout expired during ${LifecycleUserMethod.Start}() (${timeout} ms)`), timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Start, false, onSuc, onErr);
                    }
                }
            });
            tasks.push((onSuc, onErr) => {
                if (object._hmi_kill) {
                    onErr('Object has been killed before running');
                } else {
                    // set alive
                    processObjectSubTree(hmiobj, true, undefined, processObject => processObject._hmi_alive = true);
                    // handle root objects
                    let found = false;
                    for (let i = 0; i < s_root_objects.length; i++) {
                        if (s_root_objects[i] === hmiobj) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        s_root_objects.push(hmiobj);
                    }
                    object._hmi_lifecycleLevel = LifecycleLevel.Running;
                    onSuc();
                }
            });
            let timeout = object[LifecycleUserMethodTimeout.Create];
            if (typeof timeout !== 'number' || timeout <= 0) {
                timeout = DEFAULT_TIMEOUT;
            }
            Executor.run(tasks, () => {
                onStateChanged(LifecycleState.Running);
                onSuccess();
            }, onError, () => onError(`timeout expired during 'create' procedure (${timeout} ms)`), timeout);
        } else {
            onError('Invalid object');
        }
    }
    ObjectLifecycleManager.createObject = createObjectSubTree;

    function killObjectSubTree(object, onSuccess, onError, onLifecycleStateChanged) {
        if (object === undefined || object === null || typeof object !== 'object' && Array.isArray(object)) {
            onError('Invalid object');
        } else if (object._hmi_kill) {
            onError('Object killing procedure has already been triggered');
        } else {
            const hmiobj = object._hmi_object;
            const onStateChanged = typeof onLifecycleStateChanged === 'function' ? onLifecycleStateChanged : state => { };
            object._hmi_kill = true;
            let firstError = undefined;
            function storeFirstError(error) {
                if (!firstError) {
                    firstError = error;
                }
            }
            const tasks = [];
            const objectLifecycleLevel = typeof object._hmi_lifecycleLevel === 'number' ? object._hmi_lifecycleLevel : LifecycleLevel.Idle;
            if (objectLifecycleLevel >= LifecycleLevel.Running) {
                tasks.push((onSuc, onErr) => {
                    // handle root objects
                    for (let i = 0; i < s_root_objects.length; i++) {
                        if (s_root_objects[i] === hmiobj) {
                            s_root_objects.splice(i, 1);
                            break;
                        }
                    }
                    // reset alive
                    processObjectSubTree(hmiobj, false, undefined, processObject => delete processObject._hmi_alive);
                    onSuc();
                });
            }
            if (objectLifecycleLevel >= LifecycleLevel.ListenersAdded) {
                tasks.push((onSuc, onErr) => {
                    onStateChanged(LifecycleState.Stop);
                    const timeout = object[LifecycleUserMethodTimeout.Stop];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Stop, true, os, oe), onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        }, () => {
                            storeFirstError(`timeout expired during ${LifecycleUserMethod.Stop}() (${timeout} ms)`);
                            onSuc();
                        }, timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Stop, true, onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        });
                    }
                });
                tasks.push((onSuc, onErr) => performAttributeOnObjectSubTree(object, '_hmi_removeListeners', false, onSuc, error => {
                    storeFirstError(error);
                    onSuc();
                }));
            }
            if (objectLifecycleLevel >= LifecycleLevel.DOMFeaturesAdded) {
                tasks.push((onSuc, onErr) => {
                    onStateChanged(LifecycleState.Destroy);
                    const timeout = object[LifecycleUserMethodTimeout.Destroy];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Destroy, false, os, oe), onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        }, () => {
                            storeFirstError(`timeout expired during ${LifecycleUserMethod.Destroy}() (${timeout} ms)`);
                            onSuc();
                        }, timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Destroy, false, onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        });
                    }
                });
                tasks.push((onSuc, onErr) => {
                    if (typeof hmiobj._hmi_destroy_dom === 'function') {
                        // #create/destroy_hmi_object_branch: 1 + 2
                        hmiobj._hmi_destroy_dom();
                    }
                    onSuc();
                });
            }
            if (objectLifecycleLevel >= LifecycleLevel.BaseFeaturesAdded) {
                tasks.push((onSuc, onErr) => {
                    onStateChanged(LifecycleState.Remove);
                    const timeout = object[LifecycleUserMethodTimeout.Remove];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Remove, true, os, oe), onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        }, () => {
                            storeFirstError(`timeout expired during ${LifecycleUserMethod.Remove}() (${timeout} ms)`);
                            onSuc();
                        }, timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Remove, true, onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        });
                    }
                });
                tasks.push((onSuc, onErr) => {
                    processObjectSubTree(hmiobj, false, undefined, processObject => {
                        if (processObject._hmi_destroy) {
                            processObject._hmi_destroy();
                        }
                    });
                    destroyIdNodeSubTree(hmiobj);
                    detachHmiObject(object);
                    onSuc();
                });
            }
            if (objectLifecycleLevel >= LifecycleLevel.Initialized) {
                tasks.push((onSuc, onErr) => {
                    onStateChanged(LifecycleState.Cleanup);
                    const timeout = object[LifecycleUserMethodTimeout.Cleanup];
                    if (typeof timeout === 'number' && timeout > 0) {
                        Executor.run((os, oe) => performAttributeOnObjectSubTree(object, LifecycleUserMethod.Cleanup, false, os, oe, false), onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        }, () => {
                            storeFirstError(`timeout expired during ${LifecycleUserMethod.Cleanup}() (${timeout} ms)`);
                            onSuc();
                        }, timeout);
                    } else {
                        performAttributeOnObjectSubTree(object, LifecycleUserMethod.Cleanup, false, onSuc, error => {
                            storeFirstError(error);
                            onSuc();
                        }, false); // Note: passing false as 'hmi' will delete the reference on the object
                    }
                });
            }
            tasks.push((onSuc, onErr) => {
                delete object._hmi_lifecycleLevel;
                delete object._hmi_kill;
                onStateChanged(LifecycleState.Idle);
                onSuc();
            });
            let timeout = object[LifecycleUserMethodTimeout.Kill];
            if (typeof timeout !== 'number' || timeout <= 0) {
                timeout = DEFAULT_TIMEOUT;
            }
            Executor.run(tasks, () => {
                if (firstError) {
                    onError(firstError);
                } else {
                    onSuccess();
                }
            }, onError, () => onError(`timeout expired during 'kill' procedure (${timeout} ms)`), timeout);
        }
    }
    ObjectLifecycleManager.killObject = killObjectSubTree;

    function refreshObjectRecursive(object, date) {
        // first we call all found user refresh functions
        processObjectSubTree(object, true, undefined, processObject => {
            if (processObject._hmi_alive === true) {
                if (typeof processObject.refresh === 'function') {
                    try {
                        processObject.refresh(processObject, date);
                    } catch (error) {
                        console.error(`Failed calling refresh: '${error}' '${processObject.refresh.toString()}'`);
                    }
                }
            }
        });
        // next we call system _hmi_refreshs
        processObjectSubTree(object, true, undefined, processObject => {
            if (processObject._hmi_alive === true) {
                const refreshs = processObject._hmi_refreshs;
                if (refreshs !== undefined && Array.isArray(refreshs)) {
                    for (let r = 0, rl = refreshs.length; r < rl; r++) {
                        const func = refreshs[r];
                        if (typeof func === 'function') {
                            try {
                                func(date);
                            } catch (error) {
                                console.error(`Failed calling _hmi_refresh: ${func.toString()}`, error);
                            }
                        }
                    }
                }
            }
        });
    }
    ObjectLifecycleManager.refreshObject = refreshObjectRecursive;

    function refreshRootObjects(date) {
        for (const object of s_root_objects) {
            refreshObjectRecursive(object, date);
        }
    }
    ObjectLifecycleManager.refreshRootObjects = refreshRootObjects;

    function setApplyGraphicObjectFunction(apply) {
        if (typeof apply !== 'function') {
            throw new Error(`Invalid type '${type}' apply function`);
        } else {
            s_applyGraphicObject = apply;
        }
    }
    ObjectLifecycleManager.setApplyGraphicObjectFunction = setApplyGraphicObjectFunction;

    /**
     * Add a new type to the visualization object handler.
     * 
     * The type function may use the following standard object arrays to add
     * functions that will be called by the framework.
     * 
     * Add/remove listeners: Push function() into the arrays
     * this._hmi_listenerAdds and this._hmi_listenerRemoves to add and remove
     * listeners
     * 
     * Resize: Push function(width, height) to the array this._hmi_resizes to
     * handle resize events. "width" and "height" represent the dimension of
     * the objects HTML container.
     * 
     * Refresh: Push function(time, repaint) to the array this._hmi_refreshs
     * to handle refresh events. "time" will be the UTC time value in
     * milliseconds and the "repaint" flag will be true if the refresh is
     * called from the requestAnimationFrame mechanism on repaint events if
     * the window is visible or false if called periodically if the window is
     * invisible.
     * 
     * Destroy: Push function() to the array this._hmi_destroys to handle
     * destroying your object.
     * 
     * @param {Object}
     *          type Function as closure for type specific features.
     */
    function addApplyFunctionForType(type, apply) {
        if (typeof type !== 'string' || type.length === 0) {
            throw new Error('Invalid type');
        } else if (s_types[type] !== undefined) {
            throw new Error(`Type '${type}' alreday exists`);
        } else if (typeof apply !== 'function') {
            throw new Error(`Invalid type '${type}' apply function`);
        } else {
            s_types[type] = apply;
        }
    }
    ObjectLifecycleManager.addApplyFunctionForType = addApplyFunctionForType;
    function _add_extension(extension) {
        if (typeof extension === 'function' && typeof extension.isExtension === 'function') {
            s_extensions.push(extension);
        }
    }
    ObjectLifecycleManager._add_extension = _add_extension;

    Object.seal(ObjectLifecycleManager);
    // export
    if (isNodeJS) {
        module.exports = ObjectLifecycleManager;
    }
    else {
        window.ObjectLifecycleManager = ObjectLifecycleManager;
    }
}(globalThis));
