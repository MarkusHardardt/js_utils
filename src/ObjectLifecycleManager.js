(function (root) {
    /*  TODO:
        - Move all browser specific stuff to separate file(s)
    */
    const ObjectLifecycleManager = {};
    const isNodeJS = typeof require === 'function';
    const Regex = isNodeJS ? require('./Regex.js') : root.Regex;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Client = isNodeJS ? require('./Client.js') : root.Client;
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

    // load Mathematics library
    // var JsonFX = typeof require === 'function' ? require('./JsonFX.js') :
    // window.JsonFX;

    const SHOW_SERVER_ERROR_POPUP = true;
    const DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION = '<div style="box-sizing: border-box;position: relative;width: 100%;height: 100%;" />';
    const DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION = '<div style="box-sizing: border-box;position: absolute;" />';
    const NUMBER_EDITOR_OPEN_EDITOR_TIMEOUT = 1000;
    // In javascript integer numbers are 64 bit values.
    // That means the value range reaches from -9223372036854775808 to
    // 9223372036854775807.
    // So the worst case value is 19 digits long.
    const NUMBER_EDITOR_MAX_DIGIT_COUNT = 19;
    const NUMBER_EDITOR_MAX_POST_DECIMAL_POSITIONS = 13;

    const TREND_TIMESTAMP = 'timestamp';
    const TREND_DATETIME = 'datetime';
    const TREND_NUMBER = 'number';

    // store this for performance reasons
    const Transform = Mathematics.Transform;
    const ArcLine = Mathematics.ArcLine;
    const RopeLine = Mathematics.RopeLine;
    const CurveSection = Mathematics.CurveSection;
    const ZonePositionAdjuster = ObjectPositionSystem.ZonePositionAdjuster;

    const normalizeToPlusMinusPI = Mathematics.normalizeToPlusMinusPI;
    const normalizeToPlusMinus180deg = Mathematics.normalizeToPlusMinus180deg;
    const getHarmonicRGB = Mathematics.getHarmonicRGB;
    const RAD2DEG = Mathematics.RAD2DEG;
    const DEG2RAD = Mathematics.DEG2RAD;
    const PI = Math.PI;
    const TWO_PI = PI + PI;
    const HALF_PI = PI / 2;

    const regex_analyse = Regex.analyse;

    // zoom factor: double by three clicks: Math.exp(Math.log(2)/3)
    const ZOOM_FACTOR = Math.exp(Math.log(2) / 3);

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

    function isNumberOrPixelValue(value) {
        if (typeof value === 'string') {
            const idx = value.indexOf('px');
            return idx > 0 && isNaN(value.substring(0, idx)) === false;
        } else {
            return typeof value === 'number';
        }
    }

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

    function getFloatingBounds(child, containerWidth, containerHeight) {
        // get the alignment
        const alignment = getAlignment(child.align, undefined, false, true);
        // get pixel values as number if available (returns undefined if not
        // something like "42px")
        const parX = getPixelValue(child.x);
        const parY = getPixelValue(child.y);
        const parW = getPixelValue(child.width);
        const parH = getPixelValue(child.height);
        // compute the pixel values
        const pixX = typeof parX === 'number' ? parX : (typeof child.x === 'number' ? child.x * containerWidth : 0.0);
        const pixY = typeof parY === 'number' ? parY : (typeof child.y === 'number' ? child.y * containerHeight : 0.0);
        const pixW = typeof parW === 'number' ? parW : (typeof child.width === 'number' ? child.width * containerWidth : 0.1);
        const pixH = typeof parH === 'number' ? parH : (typeof child.height === 'number' ? child.height * containerHeight : 0.1);
        // return the bounds
        return {
            x: Math.floor(pixX - pixW * alignment.x),
            y: Math.floor(pixY - pixH * alignment.y),
            width: Math.floor(pixW),
            height: Math.floor(pixH)
        };
    }

    function updateCoordinates(element, x, y, width, height, containerWidth, containerHeight, align) {
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

    function ListenerSupport() {
        let that = this;
        let listeners = [];
        this._hmi_addEditListener = listener => {
            for (let i = 0, l = listeners.length; i < l; i++) {
                if (listeners[i] === listener) {
                    return false;
                }
            }
            listeners.push(listener);
            return true;
        };
        this._hmi_removeEditListener = listener => {
            for (let i = 0, l = listeners.length; i < l; i++) {
                if (listeners[i] === listener) {
                    listeners.splice(i, 1);
                    return true;
                }
            }
            return false;
        };
        this._hmi_forAllEditListeners = callback => {
            for (let i = 0, l = listeners.length; i < l; i++) {
                callback(listeners[i]);
            }
        };
        this._hmi_destroys.push(() => {
            delete that._hmi_forAllEditListeners;
            delete that._hmi_addEditListener;
            delete that._hmi_removeEditListener;
            listeners.splice(0, listeners.length);
            listeners = undefined;
            that = undefined;
        });
    }

    var _lastUserActionDate = undefined;

    function prevent_default_and_stop_propagation(i_event) {
        // do not perform default browser actions
        if (typeof i_event.preventDefault === 'function') {
            i_event.preventDefault();
        }
        // do not delegate to parent elements
        if (typeof i_event.stopPropagation === 'function') {
            i_event.stopPropagation();
        }
        _lastUserActionDate = new Date().getTime();
    }

    function get_last_user_action_date() {
        return _lastUserActionDate;
    }
    ObjectLifecycleManager.getLastUserActionDate = get_last_user_action_date;

    // mouse events
    var MOUSEEVENT_CLICK = 1;
    var MOUSEEVENT_DBLCLICK = 2;
    var MOUSEEVENT_HOVER = 3;
    var MOUSEEVENT_MOUSEDOWN = 4;
    var MOUSEEVENT_MOUSEENTER = 5;
    var MOUSEEVENT_MOUSELEAVE = 6;
    var MOUSEEVENT_MOUSEMOVE = 7;
    var MOUSEEVENT_MOUSEOUT = 8;
    var MOUSEEVENT_MOUSEOVER = 9;
    var MOUSEEVENT_MOUSEUP = 10;
    var MOUSEEVENT_CONTEXTMENU = 11;
    var MOUSEEVENT_MOUSEWHEEL = 12;
    // touch events
    var TOUCHEVENT_TOUCHSTART = 20;
    var TOUCHEVENT_TOUCHENTER = 21;
    var TOUCHEVENT_TOUCHMOVE = 22;
    var TOUCHEVENT_TOUCHEND = 23;
    var TOUCHEVENT_TOUCHLEAVE = 24;
    var TOUCHEVENT_TOUCHCANCEL = 25;

    var s_event_listeners = [];

    function initObject(object, data) {
        if (typeof object.init === 'function') {
            try {
                object.init(data);
            } catch (exc) {
                console.error(`EXCEPTION Calling init(): '${exc}' '${object.init.toString()}'`);
            }
        }
    }

    function updateEventListenersState(enabled) {
        for (let i = 0, l = s_event_listeners.length; i < l; i++) {
            s_event_listeners[i][enabled ? '_hmi_addEventListeners' : '_hmi_removeEventListeners']();
        }
    }

    function EventListener(i_context, i_callback) {
        var that = this;
        var _cont = i_context.container;
        var _listening = false;
        // callbacks for mouse events
        function mouseevent_click(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_CLICK);
        }
        function mouseevent_dblclick(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_DBLCLICK);
        }
        function mouseevent_hover(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_HOVER);
        }
        function mouseevent_mousedown(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEDOWN);
        }
        function mouseevent_mouseenter(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEENTER);
        }
        function mouseevent_mouseleave(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSELEAVE);
        }
        function mouseevent_mousemove(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEMOVE);
        }
        function mouseevent_mouseout(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEOUT);
        }
        function mouseevent_mouseover(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEOVER);
        }
        function mouseevent_mouseup(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEUP);
        }
        function mouseevent_contextmenu(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_CONTEXTMENU);
        }
        function mouseevent_mousewheel(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, MOUSEEVENT_MOUSEWHEEL);
        }
        // callbacks for touch events
        function touchevent_touchstart(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, TOUCHEVENT_TOUCHSTART);
        }
        function touchevent_touchenter(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, TOUCHEVENT_TOUCHENTER);
        }
        function touchevent_touchmove(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, TOUCHEVENT_TOUCHMOVE);
        }
        function touchevent_touchend(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, TOUCHEVENT_TOUCHEND);
        }
        function touchevent_touchleave(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, TOUCHEVENT_TOUCHLEAVE);
        }
        function touchevent_touchcancel(i_event) {
            prevent_default_and_stop_propagation(i_event);
            i_callback(i_event, TOUCHEVENT_TOUCHCANCEL);
        }
        this._hmi_addEventListeners = function () {
            if (_listening === false) {
                _listening = true;
                if (typeof i_callback === 'function') {
                    _cont.on('mousedown', mouseevent_mousedown);
                    _cont.on('touchstart', touchevent_touchstart);
                    _cont.on('click', mouseevent_click);
                    _cont.on('dblclick', mouseevent_dblclick);
                    _cont.on('hover', mouseevent_hover);
                    _cont.on('mouseenter', mouseevent_mouseenter);
                    _cont.on('mouseleave', mouseevent_mouseleave);
                    _cont.on('mousemove', mouseevent_mousemove);
                    _cont.on('mouseout', mouseevent_mouseout);
                    _cont.on('mouseover', mouseevent_mouseover);
                    _cont.on('mouseup', mouseevent_mouseup);
                    _cont.on('contextmenu', mouseevent_contextmenu);
                    _cont.on('mousewheel', mouseevent_mousewheel);
                    _cont.on('touchenter', touchevent_touchenter);
                    _cont.on('touchmove', touchevent_touchmove);
                    _cont.on('touchend', touchevent_touchend);
                    _cont.on('touchleave', touchevent_touchleave);
                    _cont.on('touchcancel', touchevent_touchcancel);
                }
            }
        };
        this._hmi_removeEventListeners = function () {
            if (_listening === true) {
                _listening = false;
                if (typeof i_callback === 'function') {
                    _cont.off('mousedown', mouseevent_mousedown);
                    _cont.off('touchstart', touchevent_touchstart);
                    _cont.off('click', mouseevent_click);
                    _cont.off('dblclick', mouseevent_dblclick);
                    _cont.off('hover', mouseevent_hover);
                    _cont.off('mouseenter', mouseevent_mouseenter);
                    _cont.off('mouseleave', mouseevent_mouseleave);
                    _cont.off('mousemove', mouseevent_mousemove);
                    _cont.off('mouseout', mouseevent_mouseout);
                    _cont.off('mouseover', mouseevent_mouseover);
                    _cont.off('mouseup', mouseevent_mouseup);
                    _cont.off('contextmenu', mouseevent_contextmenu);
                    _cont.off('mousewheel', mouseevent_mousewheel);
                    _cont.off('touchenter', touchevent_touchenter);
                    _cont.off('touchmove', touchevent_touchmove);
                    _cont.off('touchend', touchevent_touchend);
                    _cont.off('touchleave', touchevent_touchleave);
                    _cont.off('touchcancel', touchevent_touchcancel);
                }
            }
        };
        this._hmi_destroys.push(function () {
            for (var i = 0; i < s_event_listeners.length; i++) {
                if (s_event_listeners[i] === that) {
                    s_event_listeners.splice(i, 1);
                    break;
                }
            }
            delete that._hmi_addEventListeners;
            that._hmi_removeEventListeners();
            delete that._hmi_removeEventListeners;
            mouseevent_click = undefined;
            mouseevent_dblclick = undefined;
            mouseevent_hover = undefined;
            mouseevent_mousedown = undefined;
            mouseevent_mouseenter = undefined;
            mouseevent_mouseleave = undefined;
            mouseevent_mousemove = undefined;
            mouseevent_mouseout = undefined;
            mouseevent_mouseover = undefined;
            mouseevent_mouseup = undefined;
            mouseevent_contextmenu = undefined;
            mouseevent_mousewheel = undefined;
            touchevent_touchstart = undefined;
            touchevent_touchenter = undefined;
            touchevent_touchmove = undefined;
            touchevent_touchend = undefined;
            touchevent_touchleave = undefined;
            touchevent_touchcancel = undefined;
            _listening = undefined;
            _cont = undefined;
            that = undefined;
        });
        this._hmi_addEventListeners();
        s_event_listeners.push(this);
    }

    function DivButtonImpl(i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _timeout = undefined;
        var _pressed = false;
        var _minimumTimeout = undefined;
        var _enabled = true;
        var _cont = i_context.container;
        function updateState(i_pressed, i_longClickTimeoutExpired) {
            // only if the pressed state has changed
            if (_pressed !== i_pressed) {
                // update for the next call
                _pressed = i_pressed === true;
                // if we want a border we got to update
                if (that.hmi_updateBorder) {
                    that.hmi_updateBorder(_pressed);
                }
                // if the button has been touched or the mouse pointer went down on it
                if (_pressed) {
                    if (_minimumTimeout !== undefined) {
                        clearTimeout(_minimumTimeout);
                        _minimumTimeout = undefined;
                    }
                    if (typeof that.minimumTimeout === 'number' && that.minimumTimeout > 0) {
                        _minimumTimeout = setTimeout(function () {
                            _minimumTimeout = undefined;
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
                        }
                        catch (exc) {
                            console.error('EXCEPTION in pressed(): ' + exc + ' ' + that.pressed.toString());
                        }
                    }
                }
                // if the button has been untouched, the mouse pointer went up or
                // leaves
                // the element or the timeout expired
                else if (_minimumTimeout === undefined) {
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
                        }
                        catch (exc) {
                            console.error('EXCEPTION in released(): ' + exc + ' ' + that.released.toString());
                        }
                    }
                    // if we got a timeout
                    if (i_longClickTimeoutExpired === true) {
                        if (that.verbose === true) {
                            console.log('button long clicked');
                        }
                        // if the handler method is available call it
                        if (typeof that.longClicked === 'function') {
                            try {
                                that.longClicked();
                            }
                            catch (exc) {
                                console.error('EXCEPTION in longClicked(): ' + exc + ' ' + that.longClicked.toString());
                            }
                        }
                    }
                    else {
                        if (that.verbose === true) {
                            console.log('button clicked');
                        }
                        // if the handler method is available call it
                        if (typeof that.clicked === 'function') {
                            try {
                                that.clicked();
                            }
                            catch (exc) {
                                console.error('EXCEPTION in clicked(): ' + exc + ' ' + that.clicked.toString());
                            }
                        }
                    }
                }
            }
        }
        function pressed(i_event) {
            prevent_default_and_stop_propagation(i_event);
            // handle the event
            updateState(true, false);
        }
        function released(i_event) {
            prevent_default_and_stop_propagation(i_event);
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
                }
                catch (exc) {
                    console.error('EXCEPTION in updateEnabled(): ' + exc + ' ' + that.updateEnabled.toString());
                }
            }
        };
        this.hmi_setEnabled = function (i_enabled) {
            if (_enabled !== i_enabled) {
                _enabled = i_enabled === true;
                updateEnabled();
            }
        };
        this.hmi_isEnabled = function (i_enabled) {
            return _enabled === true;
        };
        if (that.hmi_updateBorder) {
            that.hmi_updateBorder(false);
        }
        if (that.enabled === false) {
            that.hmi_setEnabled(false);
        }
        updateEnabled();
        this._hmi_destroys.push(function () {
            _enabled = false;
            if (_minimumTimeout !== undefined) {
                clearTimeout(_minimumTimeout);
                _minimumTimeout = undefined;
            }
            if (_timeout !== undefined) {
                clearTimeout(_timeout);
                _timeout = undefined;
            }
            updateEnabled();
            delete that.hmi_setEnabled;
            delete that.hmi_isEnabled;
            updateEnabled = undefined;
            released = undefined;
            pressed = undefined;
            updateState = undefined;
            _timeout = undefined;
            _pressed = undefined;
            _enabled = undefined;
            _cont = undefined;
            that = undefined;
        });
        i_success();
    };
    DivButtonImpl.isRequired = function (i_object, i_context, i_disableVisuEvents) {
        if (i_disableVisuEvents === true) {
            return false;
        }
        return typeof i_object.pressed === 'function' || typeof i_object.released === 'function' || typeof i_object.clicked === 'function' || typeof i_object.longClicked === 'function';
    };

    function dumpLifecycle(state) { // TODO: Replace with monitoring of server tasks
        if (false) {
            console.log(`lifecycle state: ${state}`)
        }
    }

    s_types['container'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        var _div = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
        _div.appendTo(_cont);
        var _object = undefined;
        this.hmi_getContent = () => _object;
        this.hmi_setContent = (i_object, i_success, i_error, i_initData, i_disableVisuEvents, i_enableEditorEvents) => {
            if (_object === undefined && i_object !== null && typeof i_object === 'object' && !Array.isArray(i_object)) {
                createObjectSubTree(i_object, _div, () => {
                    _object = i_object;
                    i_success();
                }, i_exception => {
                    _div.empty();
                    i_error(i_exception);
                }, that.hmi, i_initData, that, i_object.id, that.hmi_node(), i_disableVisuEvents, i_enableEditorEvents, dumpLifecycle);
            }
        };
        this.hmi_removeContent = (onSuccess, onError) => {
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
            }
            else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        };
        this._hmi_resizes.push(() => {
            if (_object) {
                var hmiobj = _object._hmi_object;
                if (hmiobj._hmi_resize) {
                    hmiobj._hmi_resize();
                }
            }
        });
        this._hmi_destroys.push(() => {
            _div.remove();
            _div = undefined;
            delete that.hmi_getContent;
            delete that.hmi_setContent;
            delete that.hmi_removeContent;
            _object = undefined;
            _cont = undefined;
            that = undefined;
        });
        i_success();
    };

    function create_grid_coordinates(i_param) {
        // here we store the resulting coordinates
        var coordinates = [];
        // if our parameter is just a simple number we create an array containing
        // equidistant parts
        if (typeof i_param === 'number') {
            var len = i_param > 0 ? i_param : 1;
            var part = 1.0 / len;
            for (var i = 0; i < len; i++) {
                coordinates.push({
                    part: part
                });
            }
        }
        // in case of an array we add relative parts and absolute pixels
        else if (i_param !== undefined && i_param !== null && Array.isArray(i_param) && i_param.length > 0) {
            var validPartCnt = 0;
            var validPixelCnt = 0;
            var sum = 0.0;
            for (var i = 0; i < i_param.length; i++) {
                var param = i_param[i];
                var coor = {};
                var pixel = getPixelValue(param);
                if (typeof pixel === 'number') {
                    coor.pixel = Math.floor(pixel);
                    validPixelCnt++;
                }
                else if (typeof param === 'number' && param > 0.0) {
                    sum += param;
                    validPartCnt++;
                }
                coordinates.push(coor);
            }
            // if only valid pixels
            if (validPixelCnt === i_param.length) {
                // exchange last coordinates pixel against part
                var coor = coordinates[coordinates.length - 1];
                delete coor.pixel;
                coor.part = 1.0;
            }
            else {
                var invalidPart = 1.0 / (i_param.length - validPixelCnt);
                var validSum = validPartCnt * invalidPart;
                for (var i = 0; i < i_param.length; i++) {
                    var param = i_param[i];
                    var coor = coordinates[i];
                    if (coor.pixel === undefined) {
                        if (typeof param === 'number' && param > 0.0 && sum > 0) {
                            coor.part = param / sum * validSum;
                        }
                        else {
                            coor.part = invalidPart;
                        }
                    }
                }
            }
        }
        else {
            coordinates.push({
                part: 1.0
            });
        }
        return coordinates;
    }

    function compute_grid_axis_pixel(i_coordinates, i_size, i_separator, i_startMargin, i_endMargin) {
        var marginCount = i_coordinates.length - 1;
        var offset = i_startMargin;
        var sizeForRelativeParts = i_size - i_startMargin - i_separator * (i_coordinates.length - 1) - i_endMargin;
        for (var i = 0; i < i_coordinates.length; i++) {
            var coor = i_coordinates[i];
            if (typeof coor.pixel === 'number') {
                sizeForRelativeParts -= coor.pixel;
            }
        }
        for (var i = 0; i < i_coordinates.length; i++) {
            var coor = i_coordinates[i];
            var start = offset;
            var end = offset + (typeof coor.pixel === 'number' ? coor.pixel : coor.part * sizeForRelativeParts);
            coor.start = Math.floor(start);
            coor.end = Math.floor(end);
            offset = end + i_separator;
        }
    }

    function get_grid_coordinate(i_coordinates, i_index, i_param) {
        var coor = i_index >= 0 ? (i_index < i_coordinates.length ? i_coordinates[i_index] : i_coordinates[i_coordinates.length - 1]) : i_coordinates[0];
        return coor[i_param];
    }

    var DEFAULT_MAX_STACK_SIZE = 1;

    /**
     * Determines whether or not the rectangle 1 and the rectangle 2 are equal.
     * 
     * @param {Object}
     *          i_rect1 The first rectangle
     * @param {Object}
     *          i_rect2 The second rectangle
     * @return <code>true</code> if the rectangles are equal; <code>false</code>
     *         otherwise.
     */
    function is_equal_rectangle(i_rect1, i_rect2) {
        // the rectangles are equal if identical
        if (i_rect1 === i_rect2) {
            return true;
        }
        // not equal if different location
        if (i_rect1.x !== i_rect2.x || i_rect1.y !== i_rect2.y) {
            return false;
        }
        // not equal if different size
        if (i_rect1.width !== i_rect2.width || i_rect1.height !== i_rect2.height) {
            return false;
        }
        // if reaching this point and the id is equal
        return i_rect1.id === i_rect2.id;
    }

    /**
     * Determines whether or not the rectangle 1 and the rectangle 2 intersect.
     * Two rectangles intersect if their intersection is nonempty.
     * 
     * @param {Object}
     *          i_rect1 The first rectangle
     * @param {Object}
     *          i_rect2 The second rectangle
     * @return <code>true</code> if the rectangles intersect; <code>false</code>
     *         otherwise.
     */
    function rectangles_intersect(i_x1, i_y1, i_width1, i_height1, i_x2, i_y2, i_width2, i_height2) {
        var w1 = i_width1;
        var h1 = i_height1;
        var w2 = i_width2;
        var h2 = i_height2;
        // if any empty rectangle
        if (w2 <= 0 || h2 <= 0 || w1 <= 0 || h1 <= 0) {
            return false;
        }
        w2 += i_x2;
        h2 += i_y2;
        w1 += i_x1;
        h1 += i_y1;
        // overflow || intersect
        return ((w2 < i_x2 || w2 > i_x1) && (h2 < i_y2 || h2 > i_y1) && (w1 < i_x1 || w1 > i_x2) && (h1 < i_y1 || h1 > i_y2));
    }

    function RectangleHandler(i_columns, i_rows, i_maxStackSize, i_loadRectangle, i_reloadRectangle, i_unloadRectangle) {
        var that = this;
        var _maxStackSize = i_maxStackSize ? i_maxStackSize : DEFAULT_MAX_STACK_SIZE;
        var _stack = [];
        var _currentLevel = -1;
        var _set = null;

        function perform_modification(i_rectanglesToHandle, i_rectanglesToIgnore, i_method, i_success, i_error) {
            var cnt = 0;
            if (Array.isArray(i_rectanglesToHandle)) {
                var tasks = [], i, hl = i_rectanglesToHandle.length, j, il;
                for (i = 0; i < hl; i++) {
                    var rect = i_rectanglesToHandle[i];
                    if (Array.isArray(i_rectanglesToIgnore)) {
                        il = i_rectanglesToIgnore.length;
                        for (j = 0; j < il; j++) {
                            if (is_equal_rectangle(rect, i_rectanglesToIgnore[j])) {
                                rect = false;
                                break;
                            }
                        }
                    }
                    // if not found we perform the given method
                    if (rect) {
                        (function () {
                            var r = rect;
                            tasks.push(function (i_suc, i_err) {
                                try {
                                    i_method(r.x, r.y, r.width, r.height, r.id, i_suc, i_err, r.init);
                                }
                                catch (exc) {
                                    i_err('ERROR in rectangle handler call: ' + exc.toString() + ' ' + i_method.toString());
                                }
                                cnt++;
                            });
                        }());
                    }
                }
                tasks.parallel = true;
                Executor.run(tasks, function () {
                    i_success(cnt);
                }, i_error);
            }
            else {
                i_success(0);
            }
        };

        function change_constellation(i_source, i_target, i_success, i_error) {
            // first we iterate over all sources and check if they still exist in the
            // targets
            perform_modification(i_source, i_target, i_unloadRectangle, function (i_removedCount) {
                perform_modification(i_target, i_source, i_loadRectangle, function (i_addedCount) {
                    i_success(i_removedCount + i_addedCount);
                }, i_error);
            }, i_error);
        };

        this.prepareNextSet = function (i_empty) {
            if (_set === null) {
                _set = [];
            }
            else {
                _set.splice(0, _set.length);
            }
            // add all current existing rectangles if available
            if (i_empty === undefined && i_empty !== true && _currentLevel !== -1) {
                var curr = _stack[_currentLevel];
                for (var i = 0; i < curr.length; i++) {
                    _set.push(curr[i]);
                }
            }
            return true;
        };

        this.addRectangleForNextSetToDefinedLocation = function (i_x, i_y, i_width, i_height, i_id, i_init) {
            // if not valid we do not proceed
            if (_set === null) {
                return false;
            }
            // store these parameters because we might modify them
            var x = i_x;
            var y = i_y;
            // if outside of the range
            if (x < 0 || x >= i_columns || y < 0 || y >= i_rows) {
                return false;
            }
            // just in case we are too far on the right or bottom we update the
            // location
            if (x + i_width > i_columns) {
                x = i_columns - i_width;
            }
            if (y + i_height > i_rows) {
                y = i_rows - i_height;
            }
            // if not insertable because of the dimension
            if (x < 0 || x + i_width > i_columns || y < 0 || y + i_height > i_rows) {
                return false;
            }
            // now we got to check all currently existing id objects if available
            for (var i = 0; i < _set.length; i++) {
                // get the rectangle
                var rect = _set[i];
                // if same location and equal id
                if (x === rect.x && y === rect.y && i_id === rect.id) {
                    try {
                        i_reloadRectangle(i_id, i_init);
                    }
                    catch (exc) {
                        console.error('ERROR in rectangle handler ' + i_reloadRectangle + ' call: ' + exc.message + ' ' + i_reloadRectangle.toString());
                    }
                    return false;
                }
            }
            // for all in reverse order
            for (var i = _set.length - 1; i >= 0; i--) {
                // get the other rect
                var other = _set[i];
                // if we got an equal id (at a different location) or the rectangles
                // intersect
                if (i_id === other.id || rectangles_intersect(x, y, i_width, i_height, other.x, other.y, other.width, other.height)) {
                    _set.splice(i, 1);
                }
            }
            // finally we got to add and load the new rectangle
            _set.push({
                x: x,
                y: y,
                width: i_width,
                height: i_height,
                id: i_id,
                init: i_init
            });
            return true;
        };

        this.addRectangleForNextSetToDefaultLocation = function (i_width, i_height, i_id, i_init) {
            if (_set === null) {
                return false;
            }
            // if we do not have a current level or the level is empty
            if (_set.length === 0) {
                // add to first place
                return that.addRectangleForNextSetToDefinedLocation(0, 0, i_width, i_height, i_id, i_init);
            }
            // we got to check if already exists
            for (var i = 0; i < _set.length; i++) {
                if (_set[i].id === i_id) {
                    try {
                        i_reloadRectangle(i_id, i_init);
                    }
                    catch (exc) {
                        console.error('ERROR in rectangle handler ' + i_reloadRectangle + ' call: ' + exc.message + ' ' + i_reloadRectangle.toString());
                    }
                    return false;
                }
            }
            // reaching this point we check for the first empty space
            for (var row = 0; row <= i_rows - i_height; row++) {
                for (var col = 0; col <= i_columns - i_width; col++) {
                    var empty = true;
                    for (var i = 0; i < _set.length; i++) {
                        var rect = _set[i];
                        if (rectangles_intersect(col, row, i_width, i_height, rect.x, rect.y, rect.width, rect.height)) {
                            empty = false;
                            break;
                        }
                    }
                    if (empty) {
                        return that.addRectangleForNextSetToDefinedLocation(col, row, i_width, i_height, i_id, i_init);
                    }
                }
            }
            // if we reach this point we did not find an empty place so we just add to
            // the front
            return that.addRectangleForNextSetToDefinedLocation(0, 0, i_width, i_height, i_id, i_init);
        };

        this.activateNextSet = function (i_success, i_error) {
            if (_set !== null) {
                // get the current constellation if available
                var prevCon = _currentLevel !== -1 ? _stack[_currentLevel] : null;
                change_constellation(prevCon, _set, function (i_count) {
                    if (i_count > 0) {
                        // if the stack stores something after the current index we remove
                        // this
                        // constellations
                        if (_currentLevel < _stack.length - 1) {
                            _stack.splice(_currentLevel + 1, _stack.length - 1 - _currentLevel);
                        }
                        // add constellation to the stack
                        _stack.push(_set);
                        // if too many remove the constellations at front
                        if (_maxStackSize !== -1 && _stack.length > _maxStackSize) {
                            _stack.splice(0, _stack.length - _maxStackSize);
                        }
                        _currentLevel = _stack.length - 1;
                    }
                    _set = null;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (typeof i_success === 'function') {
                i_success();
            }
        };

        this.isBackAvailable = function () {
            return _currentLevel > -1;
        };

        this.isForwardAvailable = function () {
            return _currentLevel < _stack.length - 1;
        };

        this.goBack = function (i_success, i_error) {
            if (_currentLevel > 0) {
                change_constellation(_stack[_currentLevel], _stack[_currentLevel - 1], function () {
                    _currentLevel--;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (_currentLevel === 0) {
                change_constellation(_stack[_currentLevel], null, function () {
                    _currentLevel--;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (typeof i_success === 'function') {
                i_success();
            }
        };

        this.goForward = function (i_success, i_error) {
            if (_currentLevel === -1) {
                change_constellation(null, _stack[_currentLevel + 1], function () {
                    _currentLevel++;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (_currentLevel < _stack.length - 1) {
                change_constellation(_stack[_currentLevel], _stack[_currentLevel + 1], function () {
                    _currentLevel++;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (typeof i_success === 'function') {
                i_success();
            }
        };

        this.goToStart = function (i_success, i_error) {
            if (_currentLevel !== -1) {
                change_constellation(_stack[_currentLevel], null, function () {
                    _currentLevel = -1;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (typeof i_success === 'function') {
                i_success();
            }
        };

        this.clear = function (i_success, i_error) {
            if (_currentLevel !== -1) {
                change_constellation(_stack[_currentLevel], null, function () {
                    _stack.splice(0, _stack.length);
                    _currentLevel = -1;
                    if (typeof i_success === 'function') {
                        i_success();
                    }
                }, i_error);
            }
            else if (typeof i_success === 'function') {
                i_success();
            }
        };

        this.getCurrentSituation = function () {
            return _currentLevel !== -1 ? _stack[_currentLevel] : [];
        };
        // TODO i_error
        this.setCurrentSituation = function (i_rectangles, i_success, i_error) {
            // if we don't have a loader we do not proceed
            if (Array.isArray(i_rectangles)) {
                // try to read new constellation
                that.prepareNextSet(true);
                for (var i = 0; i < i_rectangles.length; i++) {
                    var rect = i_rectangles[i];
                    that.addRectangleForNextSetToDefinedLocation(rect.x, rect.y, rect.width, rect.height, rect.id, rect.init);
                }
                that.activateNextSet(i_success, i_error);
                return true;
            }
            return false;
        };
    };

    function Grid(i_config) {
        // init coordinates
        this._columnCoordinates = create_grid_coordinates(i_config.columns);
        this._rowCoordinates = create_grid_coordinates(i_config.rows);
        this._margin = i_config.margin;
    }
    Grid.prototype = {
        getColumns: function () {
            return this._columnCoordinates.length;
        },

        getRows: function () {
            return this._rowCoordinates.length;
        },

        calculateGrid: function (i_widthPixels, i_heightPixels, i_separatorPixels) {
            var width = typeof i_widthPixels === 'number' && i_widthPixels > 0 ? i_widthPixels : 100;
            var height = typeof i_heightPixels === 'number' && i_heightPixels > 0 ? i_heightPixels : 100;
            var separator = typeof i_separatorPixels === 'number' && i_separatorPixels >= 0 ? i_separatorPixels : 0;
            var margin = this._margin;
            var leftMargin = get_dimension_parameter(margin, 'left', separator);
            var rightMargin = get_dimension_parameter(margin, 'right', separator);
            var topMargin = get_dimension_parameter(margin, 'top', separator);
            var bottomMargin = get_dimension_parameter(margin, 'bottom', separator);
            compute_grid_axis_pixel(this._columnCoordinates, width, separator, leftMargin, rightMargin);
            compute_grid_axis_pixel(this._rowCoordinates, height, separator, topMargin, bottomMargin);
        },

        getStartX: function (i_columnIndex) {
            return get_grid_coordinate(this._columnCoordinates, i_columnIndex, 'start');
        },

        getEndX: function (i_columnIndex) {
            return get_grid_coordinate(this._columnCoordinates, i_columnIndex, 'end');
        },

        getStartY: function (i_rowIndex) {
            return get_grid_coordinate(this._rowCoordinates, i_rowIndex, 'start');
        },

        getEndY: function (i_rowIndex) {
            return get_grid_coordinate(this._rowCoordinates, i_rowIndex, 'end');
        },

        getBounds: function (i_rectangle) {
            var x = typeof i_rectangle.x === 'number' ? i_rectangle.x : 0;
            var y = typeof i_rectangle.y === 'number' ? i_rectangle.y : 0;
            var width = typeof i_rectangle.width === 'number' ? i_rectangle.width : 1;
            var height = typeof i_rectangle.height === 'number' ? i_rectangle.height : 1;
            var colCoorStart = this.getStartX(x);
            var colCoorEnd = this.getEndX(x + width - 1);
            var rowCoorStart = this.getStartY(y);
            var rowCoorEnd = this.getEndY(y + height - 1);
            return {
                x: Math.floor(colCoorStart),
                y: Math.floor(rowCoorStart),
                width: Math.floor(colCoorEnd - colCoorStart),
                height: Math.floor(rowCoorEnd - rowCoorStart)
            };
        }
    };
    ObjectLifecycleManager.Grid = Grid;

    s_types['grid'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _cont = that._hmi_context.container;
        var _scope = i_enableEditorEvents === true ? Utilities.getUniqueId() : undefined;
        _cont.addClass('overflow-hidden');
        var _mainDiv = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
        _mainDiv.appendTo(_cont);
        var _children = Array.isArray(this.children) ? this.children : [];
        // get the columns and rows (at least one single cell)
        var columns = 1;
        var rows = 1;
        for (var i = 0; i < _children.length; i++) {
            var child = _children[i];
            var hmiobj = child._hmi_object;
            if (hmiobj && !isTaskType(hmiobj)) {
                var x = typeof child.x === 'number' ? child.x : 0;
                var y = typeof child.y === 'number' ? child.y : 0;
                var width = typeof child.width === 'number' ? child.width : 1;
                var height = typeof child.height === 'number' ? child.height : 1;
                columns = Math.max(columns, x + width);
                rows = Math.max(rows, y + height);
            }
        }
        var _grid = new Grid({
            columns: that.columns !== undefined && that.columns !== null ? that.columns : columns,
            rows: that.rows !== undefined && that.rows !== null ? that.rows : rows,
            margin: that.margin
        });
        rows = undefined;
        columns = undefined;
        _grid.calculateGrid(_mainDiv.width(), _mainDiv.height(), typeof that.separator === 'number' ? that.separator : 0);
        var _placeholders = undefined;
        if (i_enableEditorEvents === true) {
            ListenerSupport.call(that);
            _placeholders = [];
            for (var col = _grid.getColumns() - 1; col >= 0; col--) {
                for (var row = _grid.getRows() - 1; row >= 0; row--) {
                    // closure
                    (function () {
                        var placeholder = {};
                        placeholder.x = col;
                        placeholder.y = row;
                        var hmiobj = {};
                        placeholder.object = hmiobj;
                        placeholder._hmi_object = hmiobj;
                        placeholder.hmi_object = hmiobj;
                        hmiobj._hmi_object = hmiobj;
                        hmiobj.hmi_object = hmiobj;
                        placeholder._hmi_gridElement = $(DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                        placeholder._hmi_gridElement.appendTo(_mainDiv);
                        placeholder._hmi_gridElement.data('hmi_object', hmiobj);
                        setBounds(placeholder._hmi_gridElement, _grid.getBounds(placeholder));
                        _placeholders.push(placeholder);
                        placeholder._hmi_gridElement.droppable({
                            scope: _scope,
                            tolerance: 'pointer',
                            hoverClass: 'default-background-hover',
                            // this method will be called when dragged element has been
                            // dropped
                            drop: function (i_event, i_ui) {
                                prevent_default_and_stop_propagation(i_event);
                                // get the source object and data
                                var source = i_ui.draggable.data('hmi_object');
                                for (var i = 0; i < _children.length; i++) {
                                    var child = _children[i];
                                    if (child._hmi_gridElement && child._hmi_object === source) {
                                        child.x = placeholder.x;
                                        child.y = placeholder.y;
                                        setBounds(child._hmi_gridElement, _grid.getBounds(child));
                                        var hmiobj = child._hmi_object;
                                        if (hmiobj && hmiobj._hmi_resize) {
                                            hmiobj._hmi_resize();
                                        }
                                        that._hmi_forAllEditListeners(function (i_listener) {
                                            if (typeof i_listener.notifyEdited === 'function') {
                                                i_listener.notifyEdited();
                                            }
                                        });
                                    }
                                }
                            }
                        });
                        var intersects = false;
                        for (var i = 0; intersects === false && i < _children.length; i++) {
                            var child = _children[i];
                            var hmiobj = child._hmi_object;
                            if (hmiobj && !isTaskType(hmiobj)) {
                                var x = typeof child.x === 'number' ? child.x : 0;
                                var y = typeof child.y === 'number' ? child.y : 0;
                                var width = typeof child.width === 'number' ? child.width : 1;
                                var height = typeof child.height === 'number' ? child.height : 1;
                                if (rectangles_intersect(x, y, width, height, col, row, 1, 1)) {
                                    intersects = true;
                                }
                            }
                        }
                        if (intersects === false) {
                            placeholder._hmi_gridElement.hover(function (i_event) {
                                placeholder._hmi_gridElement.addClass('default-background-hover');
                            }, function (i_event) {
                                placeholder._hmi_gridElement.removeClass('default-background-hover');
                            });
                            placeholder._hmi_clickedForEdit = function (i_event) {
                                prevent_default_and_stop_propagation(i_event);
                                that._hmi_forAllEditListeners(function (i_listener) {
                                    if (typeof i_listener.showChildObjectEditor === 'function') {
                                        i_listener.showChildObjectEditor(-1, placeholder);
                                    }
                                });
                            };
                            placeholder._hmi_gridElement.on('click', placeholder._hmi_clickedForEdit);
                        }
                    }());
                }
            }
        }
        var _rectHandler = undefined;
        var _rectHandlerPipe = undefined;
        var _dropable = undefined;
        var droppableCellAdded = undefined;
        var addPlaceholders = undefined;
        var loadRectangle = undefined;
        var reloadRectangle = undefined;
        var unloadRectangle = undefined;
        var tasks = [];
        if (typeof this.droppable === 'string') {
            if (i_enableEditorEvents !== true) {
                droppableCellAdded = function (i_child) {
                    i_child._hmi_gridElement.droppable({
                        // set the drag and drop scope
                        scope: that.droppable,
                        // only mouse pointer is relevant
                        tolerance: 'pointer',
                        // If specified, the class will be added to the droppable while an
                        // acceptable iconConfig is being hovered over the droppable.
                        hoverClass: typeof that.hoverClass === 'string' ? that.hoverClass : 'default-background-hover',
                        // this method will be called when dragged element has been
                        // dropped
                        drop: function (i_event, i_ui) {
                            prevent_default_and_stop_propagation(i_event);
                            // get the source object and data
                            var source = i_ui.draggable.data('hmi_object');
                            var data = source && source.data !== null && typeof source.data === 'object' ? source.data : undefined;
                            if (data && typeof data.object === 'string' && data.object.length > 0) {
                                var width = typeof data.width === 'number' ? data.width : 1;
                                var height = typeof data.height === 'number' ? data.height : 1;
                                _rectHandlerPipe(function (i_rectHandlerSuccess, i_rectHandlerError) {
                                    _rectHandler.prepareNextSet();
                                    _rectHandler.addRectangleForNextSetToDefinedLocation(i_child.x, i_child.y, width, height, data.object, data.init);
                                    _rectHandler.activateNextSet(i_rectHandlerSuccess, i_rectHandlerError);
                                });
                            }
                        }
                    });
                };

                addPlaceholders = function (i_x, i_y, i_width, i_height) {
                    // CLASSES
                    var classes = typeof that.dropClasses === 'string' ? that.dropClasses.split(' ') : that.dropClasses;
                    for (var col = i_x + i_width - 1; col >= i_x; col--) {
                        for (var row = i_y + i_height - 1; row >= i_y; row--) {
                            var child = {};
                            child.x = col;
                            child.y = row;
                            var hmiobj = {};
                            child.object = hmiobj;
                            child._hmi_object = hmiobj;
                            child.hmi_object = hmiobj;
                            hmiobj._hmi_object = hmiobj;
                            hmiobj.hmi_object = hmiobj;
                            child._hmi_gridElement = $(DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                            child._hmi_gridElement.appendTo(_mainDiv);
                            if (Array.isArray(classes)) {
                                for (var i = 0; i < classes.length; i++) {
                                    var cls = classes[i];
                                    if (typeof cls === 'string' && cls.length > 0) {
                                        child._hmi_gridElement.addClass(cls);
                                    }
                                }
                            }
                            child._hmi_gridElement.data('hmi_object', hmiobj);
                            setBounds(child._hmi_gridElement, _grid.getBounds(child));
                            _children.push(child);
                            droppableCellAdded(child);
                        }
                    }
                };

                // this method will be called from inside of the rectangle handler in
                // case a new rectangle must be loaded
                loadRectangle = function (i_x, i_y, i_width, i_height, i_objectReference, i_suc, i_err, i_initData) {
                    that.hmi.env.cms.GetObject(i_objectReference, that.hmi.env.lang.GetLanguage(), ContentManager.PARSE, function (i_object) {
                        if (i_object !== null && typeof i_object === 'object' && !Array.isArray(i_object)) {
                            // first we got to remove all place holders
                            for (var col = i_x + i_width - 1; col >= i_x; col--) {
                                for (var row = i_y + i_height - 1; row >= i_y; row--) {
                                    for (var i = 0; i < _children.length; i++) {
                                        var child = _children[i];
                                        if (child.x === col && child.y === row) {
                                            child._hmi_gridElement.remove();
                                            delete child._hmi_gridElement;
                                            delete child._hmi_object;
                                            delete child.hmi_object;
                                            _children.splice(i, 1);
                                            break;
                                        }
                                    }
                                }
                            }
                            var child = {};
                            child.objectReference = i_objectReference;
                            // use .object (see code below)
                            child.object = i_object;
                            child.x = i_x;
                            child.y = i_y;
                            child.width = i_width;
                            child.height = i_height;
                            child._hmi_gridElement = $(DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                            child._hmi_gridElement.appendTo(_mainDiv);
                            setBounds(child._hmi_gridElement, _grid.getBounds(child));
                            _children.push(child);
                            droppableCellAdded(child);
                            createObjectSubTree(i_object, child._hmi_gridElement, function () {
                                child._hmi_object = i_object._hmi_object;
                                child.hmi_object = i_object._hmi_object;
                                i_suc();
                            }, i_err, that.hmi, i_initData, that, child.id, that.hmi_node());
                        }
                        else {
                            // in case object is not available we at least call the callback
                            i_suc();
                        }
                        // in case of an error we at least call the callback
                    }, i_err);
                };

                // this method will be called from inside of the rectangle handler in
                // case a new rectangle must be reloaded
                reloadRectangle = function (i_objectReference, i_initData) {
                    for (var i = 0; i < _children.length; i++) {
                        var child = _children[i];
                        if (child.objectReference === i_objectReference && child.object) {
                            initObject(child.object, i_initData);
                        }
                    }
                };
                // this method will be called from inside of the rectangle handler in
                // case an existing rectangle must be unloaded
                unloadRectangle = function (i_x, i_y, i_width, i_height, i_objectReference, i_suc, i_err) {
                    for (var i = 0; i < _children.length; i++) {
                        var child = _children[i];
                        if (child.objectReference === i_objectReference) {
                            // here we use .object because we placed our object there (see
                            // code above)
                            killObjectSubTree(child.object, () => {
                                delete child._hmi_object;
                                delete child.hmi_object;
                                delete child.object;
                                delete child.objectReference;
                                child._hmi_gridElement.data('hmi_object', null);
                                if (i_enableEditorEvents !== true) {
                                    child._hmi_gridElement.droppable('destroy');
                                }
                                child._hmi_gridElement.remove();
                                delete child._hmi_gridElement;
                                _children.splice(i, 1);
                                addPlaceholders(i_x, i_y, i_width, i_height);
                                i_suc();
                            }, i_err);
                            break;
                        }
                    }
                };
                _rectHandler = new RectangleHandler(_grid.getColumns(), _grid.getRows(), typeof this.maxStackSize === 'number' ? this.maxStackSize : 64, loadRectangle, reloadRectangle, unloadRectangle);
                _rectHandlerPipe = new Executor.pipe(function (i_exception) {
                    console.error('TODO: handle errors!\nEXCEPTION: ' + i_exception);
                });
                addPlaceholders(0, 0, _grid.getColumns(), _grid.getRows());
                if (that.hmi.droppables[that.droppable] === undefined || that.hmi.droppables[that.droppable] === null) {
                    _dropable = {
                        add: function (i_path, i_width, i_height, i_init, i_callback) {
                            var width = typeof i_width === 'number' ? i_width : 1;
                            var height = typeof i_height === 'number' ? i_height : 1;
                            _rectHandlerPipe(function (i_rectHandlerSuccess, i_rectHandlerError) {
                                _rectHandler.prepareNextSet();
                                _rectHandler.addRectangleForNextSetToDefaultLocation(width, height, i_path, i_init);
                                _rectHandler.activateNextSet(function () {
                                    i_rectHandlerSuccess();
                                    if (typeof i_callback === 'function') {
                                        i_callback();
                                    }
                                }, i_rectHandlerError);
                            });
                        },
                        home: function (i_callback) {
                            _rectHandlerPipe(function (i_rectHandlerSuccess, i_rectHandlerError) {
                                _rectHandler.goToStart(function () {
                                    i_rectHandlerSuccess();
                                    if (typeof i_callback === 'function') {
                                        i_callback();
                                    }
                                }, i_rectHandlerError);
                            });
                        },
                        undo: function (i_callback) {
                            _rectHandlerPipe(function (i_rectHandlerSuccess, i_rectHandlerError) {
                                _rectHandler.goBack(function () {
                                    i_rectHandlerSuccess();
                                    if (typeof i_callback === 'function') {
                                        i_callback();
                                    }
                                }, i_rectHandlerError);
                            });
                        },
                        redo: function (i_callback) {
                            _rectHandlerPipe(function (i_rectHandlerSuccess, i_rectHandlerError) {
                                _rectHandler.goForward(function () {
                                    i_rectHandlerSuccess();
                                    if (typeof i_callback === 'function') {
                                        i_callback();
                                    }
                                }, i_rectHandlerError);
                            });
                        },
                        getCurrentSituation: function () {
                            return _rectHandler.getCurrentSituation();
                        },
                        setCurrentSituation: function (i_rectangles, i_callback) {
                            _rectHandlerPipe(function (i_rectHandlerSuccess, i_rectHandlerError) {
                                _rectHandler.setCurrentSituation(i_rectangles, function () {
                                    i_rectHandlerSuccess();
                                    if (typeof i_callback === 'function') {
                                        i_callback();
                                    }
                                });
                            }, i_rectHandlerError);
                        }
                    };
                    this.hmi_dropable = function () {
                        return _dropable;
                    };
                    that.hmi.droppables[that.droppable] = _dropable;
                }
            }
        }
        else {
            for (var i = 0, l = _children.length; i < l; i++) {
                // closure
                (function () {
                    var idx = i;
                    var child = _children[idx];
                    var hmiobj = child._hmi_object;
                    if (hmiobj) {
                        if (isTaskType(hmiobj)) {
                            if (hmiobj._hmi_init_dom) {
                                tasks.push(function (i_suc, i_err) {
                                    // #grid: 1
                                    hmiobj._hmi_init_dom({
                                        container: _cont
                                    }, i_suc, i_err);
                                });
                            }
                        }
                        else {
                            child._hmi_gridElement = $(DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                            child._hmi_gridElement.appendTo(_mainDiv);
                            setBounds(child._hmi_gridElement, _grid.getBounds(child));
                            if (hmiobj._hmi_init_dom) {
                                tasks.push(function (i_suc, i_err) {
                                    // #grid: 2
                                    hmiobj._hmi_init_dom({
                                        container: child._hmi_gridElement
                                    }, i_suc, i_err);
                                });
                            }
                            if (i_enableEditorEvents === true) {
                                child._hmi_gridElement.draggable({
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
                            if (i_enableEditorEvents === true) {
                                child._hmi_clickedForEdit = function (i_event) {
                                    prevent_default_and_stop_propagation(i_event);
                                    that._hmi_forAllEditListeners(function (i_listener) {
                                        if (typeof i_listener.showChildObjectEditor === 'function') {
                                            i_listener.showChildObjectEditor(idx, child);
                                        }
                                    });
                                };
                                child._hmi_gridElement.on('click', child._hmi_clickedForEdit);
                            }
                        }
                    }
                }());
            }
        }
        this._hmi_resizes.push(function () {
            _grid.calculateGrid(_mainDiv.width(), _mainDiv.height(), typeof that.separator === 'number' ? that.separator : 0);
            if (Array.isArray(_placeholders)) {
                for (var i = 0; i < _placeholders.length; i++) {
                    var child = _placeholders[i];
                    setBounds(child._hmi_gridElement, _grid.getBounds(child));
                }
            }
            for (var i = 0; i < _children.length; i++) {
                var child = _children[i];
                if (child._hmi_gridElement) {
                    setBounds(child._hmi_gridElement, _grid.getBounds(child));
                    var hmiobj = child._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                }
            }
        });
        this._hmi_destroys.push(function () {
            if (i_enableEditorEvents !== true && typeof that.droppable === 'string') {
                // clean up drop grid elements first ...
                var rect = that.hmi.droppables[that.droppable];
                if (rect && typeof rect.home === 'function') {
                    // ... by calling the home function (which empties the drop
                    // containers)
                    rect.home();
                }
                delete rect.add;
                delete rect.home;
                delete rect.undo;
                delete rect.redo;
                delete rect.getCurrentSituation;
                delete rect.setCurrentSituation;
                delete that.hmi.droppables[that.droppable];
            }
            delete this.hmi_dropable;
            _dropable = undefined;
            _scope = undefined;
            for (var i = _children.length - 1; i >= 0; i--) {
                var child = _children[i];
                var hmiobj = child._hmi_object;
                if (hmiobj && hmiobj._hmi_destroy_dom) {
                    // #grid: 1 + 2
                    hmiobj._hmi_destroy_dom();
                }
                if (child._hmi_gridElement) {
                    if (i_enableEditorEvents === true) {
                        child._hmi_gridElement.off('click', child._hmi_clickedForEdit);
                        delete child._hmi_clickedForEdit;
                    }
                    child._hmi_gridElement.remove();
                    delete child._hmi_gridElement;
                }
            }
            if (Array.isArray(_placeholders)) {
                for (var i = _placeholders.length - 1; i >= 0; i--) {
                    var placeholder = _placeholders[i];
                    if (typeof placeholder._hmi_clickedForEdit === 'function') {
                        placeholder._hmi_gridElement.off('click', placeholder._hmi_clickedForEdit);
                        delete placeholder._hmi_clickedForEdit;
                    }
                    placeholder._hmi_gridElement.remove();
                    delete placeholder._hmi_gridElement;
                }
            }
            if (typeof that.droppable === 'string') {
                _children.splice(0, _children.length);
            }
            if (_rectHandlerPipe !== undefined) {
                // TODO _rectHandlerPipe.stop();
            }
            _rectHandlerPipe = undefined;
            _rectHandler = undefined;
            droppableCellAdded = undefined;
            addPlaceholders = undefined;
            loadRectangle = undefined;
            reloadRectangle = undefined;
            unloadRectangle = undefined;
            _children = undefined;
            _mainDiv.empty();
            _mainDiv = undefined;
            _cont.empty();
            _cont = undefined;
            _grid = undefined;
            that = undefined;
        });
        Executor.run(tasks, i_success, i_error);
    };

    s_types['float'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this, tasks = [];
        var _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        var _mainDiv = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
        _mainDiv.appendTo(_cont);
        var _children = Array.isArray(this.children) ? this.children : [];
        var _scope = undefined;
        if (i_enableEditorEvents === true) {
            ListenerSupport.call(that);
            _scope = Utilities.getUniqueId();
            _mainDiv.droppable({
                scope: _scope,
                tolerance: 'pointer',
                hoverClass: 'default-background-hover',
                drop: function (i_event, i_ui) {
                    prevent_default_and_stop_propagation(i_event);
                    var source = i_ui.draggable.data('hmi_object');
                    for (var i = 0; i < _children.length; i++) {
                        var child = _children[i];
                        if (child._hmi_floatElement && child._hmi_object === source) {
                            var width = _mainDiv.width();
                            var height = _mainDiv.height();
                            // get the alignment
                            var align = getAlignment(child.align, undefined, false, true);
                            // get pixel values as number if available (returns undefined if
                            // not something like "42px")
                            var parX = getPixelValue(child.x);
                            var parY = getPixelValue(child.y);
                            var parW = getPixelValue(child.width);
                            var parH = getPixelValue(child.height);
                            // get the current views location and dimension
                            var pixW = getPixelValue(child._hmi_floatElement.css('width'));
                            var pixH = getPixelValue(child._hmi_floatElement.css('height'));
                            var pixX = getPixelValue(child._hmi_floatElement.css('left')) + pixW * align.x;
                            var pixY = getPixelValue(child._hmi_floatElement.css('top')) + pixH * align.y;
                            // update the rectangle attributes
                            child.x = typeof parX === 'number' ? pixX + 'px' : pixX / width;
                            child.y = typeof parY === 'number' ? pixY + 'px' : pixY / height;
                            child.width = typeof parW === 'number' ? pixW + 'px' : pixW / width;
                            child.height = typeof parH === 'number' ? pixH + 'px' : pixH / height;
                            var hmiobj = child._hmi_object;
                            if (hmiobj && hmiobj._hmi_resize) {
                                hmiobj._hmi_resize();
                            }
                            that._hmi_forAllEditListeners(function (i_listener) {
                                if (typeof i_listener.notifyEdited === 'function') {
                                    i_listener.notifyEdited();
                                }
                            });
                            break;
                        }
                    }
                }
            });
        }
        var width = _mainDiv.width();
        var height = _mainDiv.height();
        for (var i = 0; i < _children.length; i++) {
            // closure
            (function () {
                var idx = i;
                var child = _children[i];
                var hmiobj = child._hmi_object;
                if (hmiobj) {
                    if (isTaskType(hmiobj)) {
                        if (hmiobj._hmi_init_dom) {
                            tasks.push(function (i_suc, i_err) {
                                // #float: 1
                                hmiobj._hmi_init_dom({
                                    container: _cont
                                }, i_suc, i_err);
                            });
                        }
                    }
                    else {
                        child._hmi_floatElement = $(DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                        child._hmi_floatElement.appendTo(_mainDiv);
                        setBounds(child._hmi_floatElement, getFloatingBounds(child, width, height));
                        if (hmiobj._hmi_init_dom) {
                            tasks.push(function (i_suc, i_err) {
                                // #float: 2
                                hmiobj._hmi_init_dom({
                                    container: child._hmi_floatElement
                                }, i_suc, i_err);
                            });
                        }
                        if (i_enableEditorEvents === true) {
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
                        if (i_enableEditorEvents === true) {
                            child._hmi_clickedForEdit = function (i_event) {
                                prevent_default_and_stop_propagation(i_event);
                                that._hmi_forAllEditListeners(function (i_listener) {
                                    if (typeof i_listener.showChildObjectEditor === 'function') {
                                        i_listener.showChildObjectEditor(idx, child);
                                    }
                                });
                            };
                            child._hmi_floatElement.on('click', child._hmi_clickedForEdit);
                        }
                    }
                }
            }());
        }
        if (i_enableEditorEvents === true) {
            this._hmi_clickedForEdit = function (i_event) {
                prevent_default_and_stop_propagation(i_event);
                that._hmi_forAllEditListeners(function (i_listener) {
                    if (typeof i_listener.showChildObjectEditor === 'function') {
                        var w = _cont.width();
                        var h = _cont.height();
                        var offset = typeof i_event.offsetX !== 'number' || typeof i_event.offsetY !== 'number' ? $(i_event.target).offset() : undefined;
                        var x = offset === undefined ? i_event.offsetX : i_event.pageX - offset.left;
                        var y = offset === undefined ? i_event.offsetY : i_event.pageY - offset.top;
                        i_listener.showChildObjectEditor(-1, {
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
        this._hmi_resizes.push(function () {
            var width = _mainDiv.width();
            var height = _mainDiv.height();
            for (var i = 0; i < _children.length; i++) {
                var child = _children[i];
                if (child._hmi_floatElement) {
                    setBounds(child._hmi_floatElement, getFloatingBounds(child, width, height));
                    var hmiobj = child._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                }
            }
        });
        this._hmi_destroys.push(function () {
            if (i_enableEditorEvents === true) {
                _cont.off('click', that._hmi_clickedForEdit);
                delete that._hmi_clickedForEdit;
            }
            _scope = undefined;
            for (var i = _children.length - 1; i >= 0; i--) {
                var child = _children[i];
                var hmiobj = child._hmi_object;
                if (hmiobj._hmi_destroy_dom) {
                    // #float: 1 + 2
                    hmiobj._hmi_destroy_dom();
                }
                if (child._hmi_floatElement) {
                    if (i_enableEditorEvents === true) {
                        child._hmi_floatElement.off('click', child._hmi_clickedForEdit);
                        delete child._hmi_clickedForEdit;
                    }
                    if (i_enableEditorEvents === true) {
                        child._hmi_floatElement.draggable('destroy');
                    }
                    child._hmi_floatElement.remove();
                    delete child._hmi_floatElement;
                }
            }
            _children = undefined;
            if (i_enableEditorEvents === true) {
                _mainDiv.droppable('destroy');
            }
            _mainDiv.empty();
            _mainDiv = undefined;
            _cont.empty();
            _cont = undefined;
            that = undefined;
        });
        Executor.run(tasks, i_success, i_error);
    };

    var SPLIT_LEFT = 0x10;
    var SPLIT_RIGHT = 0x08;
    var SPLIT_TOP = 0x04;
    var SPLIT_BOTTOM = 0x02;
    var SPLIT_CENTER = 0x01;

    s_types['split'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this, tasks = [];
        var _cont = that._hmi_context.container;
        function init_hmi_object_dom(i_split) {
            var hmiobj = i_split._hmi_object;
            if (hmiobj && hmiobj._hmi_init_dom) {
                tasks.push(function (i_suc, i_err) {
                    // #split: 1
                    hmiobj._hmi_init_dom({
                        container: i_split._hmi_splitElement
                    }, i_suc, i_err);
                });
            }
        };
        var _instance = undefined;
        function prepare_panes_and_init_hmi_object_dom(i_north, i_south, i_west, i_east, i_center) {
            var layout = {};
            var width = _cont.width();
            var height = _cont.height();
            if (i_north) {
                if (i_south) {
                    layout.north__size = Math.floor(height * (typeof that.topSize === 'number' ? that.topSize : 0.3));
                    layout.south__size = Math.floor(height * (typeof that.bottomSize === 'number' ? that.bottomSize : 0.3));
                }
                else {
                    layout.north__size = Math.floor(height * (typeof that.topSize === 'number' ? that.topSize : (typeof that.bottomSize === 'number' ? 1 - that.bottomSize : 0.5)));
                }
            }
            else if (i_south) {
                layout.south__size = Math.floor(height * (typeof that.bottomSize === 'number' ? that.bottomSize : 0.5));
            }
            if (i_west) {
                if (i_east) {
                    layout.west__size = Math.floor(width * (typeof that.leftSize === 'number' ? that.leftSize : 0.3));
                    layout.east__size = Math.floor(width * (typeof that.rightSize === 'number' ? that.rightSize : 0.3));
                }
                else {
                    layout.west__size = Math.floor(width * (typeof that.leftSize === 'number' ? that.leftSize : (typeof that.rightSize === 'number' ? 1 - that.rightSize : 0.5)));
                }
            }
            else if (i_east) {
                layout.east__size = Math.floor(width * (typeof that.rightSize === 'number' ? that.rightSize : 0.5));
            }
            if (i_north) {
                i_north._hmi_splitContainer = $('<div class="ui-layout-north" />');
                i_north._hmi_splitContainer.appendTo(_cont);
                i_north._hmi_splitElement = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                i_north._hmi_splitElement.appendTo(i_north._hmi_splitContainer);
                layout.north__onresize_end = function (i_paneName, i_paneElement, i_paneState, i_paneOptions, i_layoutName) {
                    var hmiobj = i_north._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (i_south) {
                i_south._hmi_splitContainer = $('<div class="ui-layout-south" />');
                i_south._hmi_splitContainer.appendTo(_cont);
                i_south._hmi_splitElement = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                i_south._hmi_splitElement.appendTo(i_south._hmi_splitContainer);
                layout.south__onresize_end = function (i_paneName, i_paneElement, i_paneState, i_paneOptions, i_layoutName) {
                    var hmiobj = i_south._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (i_west) {
                i_west._hmi_splitContainer = $('<div class="ui-layout-west" />');
                i_west._hmi_splitContainer.appendTo(_cont);
                i_west._hmi_splitElement = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                i_west._hmi_splitElement.appendTo(i_west._hmi_splitContainer);
                layout.west__onresize_end = function (i_paneName, i_paneElement, i_paneState, i_paneOptions, i_layoutName) {
                    var hmiobj = i_west._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (i_east) {
                i_east._hmi_splitContainer = $('<div class="ui-layout-east" />');
                i_east._hmi_splitContainer.appendTo(_cont);
                i_east._hmi_splitElement = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                i_east._hmi_splitElement.appendTo(i_east._hmi_splitContainer);
                layout.east__onresize_end = function (i_paneName, i_paneElement, i_paneState, i_paneOptions, i_layoutName) {
                    var hmiobj = i_east._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            if (i_center) {
                i_center._hmi_splitContainer = $('<div class="ui-layout-center" />');
                i_center._hmi_splitContainer.appendTo(_cont);
                i_center._hmi_splitElement = $(DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
                i_center._hmi_splitElement.appendTo(i_center._hmi_splitContainer);
                layout.center__onresize_end = function (i_paneName, i_paneElement, i_paneState, i_paneOptions, i_layoutName) {
                    var hmiobj = i_center._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                };
            }
            // do layout
            _instance = _cont.layout(layout);
        };
        // here we store the container
        var _left = undefined;
        var _right = undefined;
        var _top = undefined;
        var _bottom = undefined;
        var _center = undefined;
        var _mask = 0;
        // compute child constellation bit mask
        if (Array.isArray(that.children)) {
            for (var i = 0; i < that.children.length; i++) {
                var child = that.children[i];
                var hmiobj = child._hmi_object;
                if (hmiobj) {
                    if (isTaskType(hmiobj)) {
                        if (hmiobj._hmi_init_dom) {
                            tasks.push(function (i_suc, i_err) {
                                // #split: 2
                                hmiobj._hmi_init_dom({
                                    container: _cont
                                }, i_suc, i_err);
                            });
                        }
                    }
                    else if (child.location === 'left') {
                        _left = child;
                        _mask |= SPLIT_LEFT;
                    }
                    else if (child.location === 'right') {
                        _right = child;
                        _mask |= SPLIT_RIGHT;
                    }
                    else if (child.location === 'top') {
                        _top = child;
                        _mask |= SPLIT_TOP;
                    }
                    else if (child.location === 'bottom') {
                        _bottom = child;
                        _mask |= SPLIT_BOTTOM;
                    }
                    else if (child.location === 'center') {
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
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, undefined, undefined, _center);
                break;
            // 00100 top
            case 0x04:
                _top._hmi_splitElement = _cont;
                break;
            // 00101 top center
            case 0x05:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, undefined, undefined, _center);
                break;
            // 00110 top bottom
            case 0x06:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, undefined, undefined, _bottom);
                break;
            // 00111 top bottom center
            case 0x07:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, undefined, undefined, _center);
                break;
            // 01000 right
            case 0x08:
                _right._hmi_splitElement = _cont;
                break;
            // 01001 right center
            case 0x09:
                prepare_panes_and_init_hmi_object_dom(undefined, undefined, undefined, _right, _center);
                break;
            // 01010 right bottom
            case 0x0a:
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, undefined, undefined, _right);
                break;
            // 01011 right bottom center
            case 0x0b:
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, undefined, _right, _center);
                break;
            // 01100 right top
            case 0x0c:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, undefined, undefined, _right);
                break;
            // 01101 right top center
            case 0x0d:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, undefined, _right, _center);
                break;
            // 01110 right top bottom
            case 0x0e:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, undefined, undefined, _right);
                break;
            // 01111 right top bottom center
            case 0x0f:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, undefined, _right, _center);
                break;
            // 10000 left
            case 0x10:
                _left._hmi_splitElement = _cont;
                break;
            // 10001 left center
            case 0x11:
                prepare_panes_and_init_hmi_object_dom(undefined, undefined, _left, undefined, _center);
                break;
            // 10010 left bottom
            case 0x12:
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, undefined, undefined, _left);
                break;
            // 10011 left bottom center
            case 0x13:
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, _left, undefined, _center);
                break;
            // 10100 left top
            case 0x14:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, undefined, undefined, _left);
                break;
            // 10101 left top center
            case 0x15:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, _left, undefined, _center);
                break;
            // 10110 left top bottom
            case 0x16:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, undefined, undefined, _left);
                break;
            // 10111 left top bottom center
            case 0x17:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, _left, undefined, _center);
                break;
            // 11000 left right
            case 0x18:
                prepare_panes_and_init_hmi_object_dom(undefined, undefined, _left, undefined, _right);
                break;
            // 11001 left right center
            case 0x19:
                prepare_panes_and_init_hmi_object_dom(undefined, undefined, _left, _right, _center);
                break;
            // 11010 left right bottom
            case 0x1a:
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, undefined, _right, _left);
                break;
            // 11011 left right bottom center
            case 0x1b:
                prepare_panes_and_init_hmi_object_dom(undefined, _bottom, _left, _right, _center);
                break;
            // 11100 left right top
            case 0x1c:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, _left, undefined, _right);
                break;
            // 11101 left right top center
            case 0x1d:
                prepare_panes_and_init_hmi_object_dom(_top, undefined, _left, _right, _center);
                break;
            // 11110 left right top bottom
            case 0x1e:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, _left, undefined, _right);
                break;
            // 11111 left right top bottom center
            case 0x1f:
                prepare_panes_and_init_hmi_object_dom(_top, _bottom, _left, _right, _center);
                break;
            default:
                break;
        }
        // INIT DOM
        if (_left) {
            init_hmi_object_dom(_left);
        }
        if (_right) {
            init_hmi_object_dom(_right);
        }
        if (_top) {
            init_hmi_object_dom(_top);
        }
        if (_bottom) {
            init_hmi_object_dom(_bottom);
        }
        if (_center) {
            init_hmi_object_dom(_center);
        }
        this._hmi_resizes.push(function () {
            if (_instance) {
                _instance.resizeAll();
            }
        });
        this._hmi_destroys.push(function () {
            if (Array.isArray(that.children)) {
                for (var i = that.children.length - 1; i >= 0; i--) {
                    var child = that.children[i];
                    var hmiobj = child._hmi_object;
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
            init_hmi_object_dom = undefined;
            prepare_panes_and_init_hmi_object_dom = undefined;
            _mask = undefined;
            createPanes = undefined;
            _left = undefined;
            _right = undefined;
            _top = undefined;
            _bottom = undefined;
            _center = undefined;
            that = undefined;
        });
        Executor.run(tasks, i_success, i_error);
    };

    // This is the global sorting of data tables: DO NOT REMOVE !!!
    if ($.fn && $.fn.DataTable) {
        $.fn.DataTable.ext.oSort['texts-and-numbers-asc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, true);
        $.fn.DataTable.ext.oSort['texts-and-numbers-desc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, false);
        $.fn.DataTable.ext.oSort['texts-and-numbers-signed-asc'] = Sorting.getTextsAndNumbersCompareFunction(true, true, true);
        $.fn.DataTable.ext.oSort['texts-and-numbers-signed-desc'] = Sorting.getTextsAndNumbersCompareFunction(true, true, false);
        $.fn.DataTable.ext.oSort['timestamp-asc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, false);
        $.fn.DataTable.ext.oSort['timestamp-desc'] = Sorting.getTextsAndNumbersCompareFunction(true, false, true);
    }

    s_types['table'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        var _tableId = Utilities.getUniqueId();
        // TODO???: var _scroller = new Utilities.ScrollHandler();
        var _columnCount = undefined;
        var _columns = [];
        if (typeof that.columns === 'number') {
            _columnCount = that.columns;
        }
        else if (Array.isArray(that.columns) && that.columns.length > 0) {
            _columnCount = that.columns.length;
            var widths = [];
            for (var i = 0; i < _columnCount; i++) {
                var column = that.columns[i];
                widths.push(typeof column.width === 'number' ? column.width : 1.0);
            }
            var parts = Utilities.createRelativeParts(widths);
            for (var i = 0; i < _columnCount; i++) {
                var column = that.columns[i];
                var cfg = {
                    width: (Math.floor(parts[i] * 10000) * 0.01).toString() + '%',
                    _id: Utilities.getUniqueId()
                };
                if (column.textsAndNumbers === true) {
                    cfg.type = 'texts-and-numbers';
                    cfg.orderable = true;
                }
                else if (column.timestamp === true) {
                    cfg.type = 'timestamp';
                    cfg.orderable = true;
                }
                else {
                    cfg.orderable = false;
                }
                _columns.push(cfg);
            }
        }
        function header_callback(i_header, i_data, i_start, i_end, i_display) {
            for (var i = 0, l = _columns.length; i < l; i++) {
                var column = that.columns[i];
                var cell = $('#' + _columns[i]._id);
                if (typeof column.labelId === 'string' && column.labelId.length > 0) {
                    cell.text(that.hmi.env.data.Get(column.labelId));
                }
                else if (typeof column.text === 'string' && column.text.length > 0) {
                    cell.text(column.text);
                }
            }
        };
        function row_callback(i_row, i_data, i_displayIndex, i_displayIndexFull) {
            if (typeof that.prepareTableRow === 'function') {
                that.prepareTableRow(i_row, i_row._DT_RowIndex);
            }
        };
        var txt = '<table width="100%" id="';
        txt += '';
        txt += _tableId;
        txt += '"';
        if (typeof that.tableStyle === 'string') {
            txt += ' style="';
            txt += that.tableStyle;
            txt += '"';
        }
        txt += '><thead><tr>';
        for (var i = 0, l = _columns.length; i < l; i++) {
            txt += '<th>';
            var column = that.columns[i];
            if (typeof column.labelId === 'string' && column.labelId.length > 0) {
                txt += '<b id="';
                txt += _columns[i]._id;
                txt += '">';
                // TODO
                txt += that.hmi.env.data.Get(column.labelId);
                txt += '</b>';
            }
            else if (typeof column.text === 'string' && column.text.length > 0) {
                txt += '<b id="';
                txt += _columns[i]._id;
                txt += '">';
                txt += column.text;
                txt += '</b>';
            }
            txt += '</th>';
        }
        txt += '</tr></thead>';
        txt += '</table>';
        var _table = $(txt);
        _table.appendTo(_cont);
        var _dataTable = undefined;
        var _scrollBody = undefined;
        var _languageListener = undefined;
        this.hmi_dataTable = function () {
            return _dataTable;
        };
        this.hmi_value = function (row, column, value) {
            const cell = _dataTable.cell(row, column);
            if (typeof value === 'string') {
                cell.data(value).draw(false);
            } else {
                return cell.data();
            }
        };
        this.hmi_isRowVisible = function (row) {
            const scrollBody = _scrollBody[0].getBoundingClientRect();
            const rowRect = _dataTable.row(row).node().getBoundingClientRect();
            return rowRect.bottom > scrollBody.top && rowRect.top < scrollBody.bottom;
        };
        this.hmi_isCellVisible = function (row, column) {
            const scrollBody = _scrollBody[0].getBoundingClientRect();
            const cellRect = _dataTable.cell(row, column).node().getBoundingClientRect();
            return cellRect.bottom > scrollBody.top && cellRect.top < scrollBody.bottom &&
                cellRect.right > scrollBody.left && cellRect.left < scrollBody.right;
        };
        this.hmi_reload = function () {
            if (_dataTable) {
                // we got to store some params to get adjust the scrolling after
                // reloading the table
                // TODO???: _scroller.prepare(_dataTable.parent(), _dataTable);
                // if we have a click handler for table rows
                if (typeof that.handleTableRowClicked === 'function') {
                    $('#' + _tableId + ' tbody tr').unbind('click');
                }
                // if we have a click handler for table row cells
                if (typeof that.handleTableCellClicked === 'function') {
                    $('#' + _tableId + ' tbody tr td').unbind('click');
                }
                _dataTable.clear();
                // check if data is available and load
                var rowCount = typeof that.getRowCount === 'function' ? that.getRowCount() : 0;
                if (rowCount > 0) {
                    var rows = [];
                    for (var r = 0; r < rowCount; r++) {
                        var cells = [];
                        for (var c = 0; c < _columns.length; c++) {
                            var cellHtml = typeof that.getCellHtml === 'function' ? that.getCellHtml(r, c) : undefined;
                            cells.push(cellHtml !== undefined && cellHtml !== null ? cellHtml : '');
                        }
                        rows.push(cells);
                    }
                    _dataTable.rows.add(rows, true);
                    // TODO???: _scroller.restore(_dataTable.parent(), _dataTable);
                    // if we have a click handler for table rows
                    if (typeof that.handleTableRowClicked === 'function') {
                        $('#' + _tableId + ' tbody').on('click', 'tr', function (i_event) {
                            if (that.highlightSelectedRow === true) {
                                _dataTable.$('tr.row_selected').removeClass('row_selected');
                                $(this).addClass('row_selected');
                            }
                            // var data = _dataTable.row( this ).data();
                            var rowIndex = i_event.currentTarget ? i_event.currentTarget._DT_RowIndex : undefined;
                            that.handleTableRowClicked(rowIndex);
                        });
                    }
                    // if we have a click handler for table row cells
                    if (typeof that.handleTableCellClicked === 'function') {
                        $('#' + _tableId + ' tbody').on('click', 'td', function (i_event) {
                            var rowIndex = i_event.currentTarget && i_event.currentTarget.parentNode ? i_event.currentTarget.parentNode._DT_RowIndex : undefined;
                            var columnIndex = i_event.currentTarget ? i_event.currentTarget.cellIndex : undefined;
                            that.handleTableCellClicked(rowIndex, columnIndex);
                        });
                    }
                }
                _dataTable.draw();
            }
        };
        this._hmi_listenerAdds.push(function () {
            // TODO: S4.env.languageSupport.addLanguageListener(_languageListener);
        });
        this._hmi_listenerRemoves.push(function () {
            // TODO: S4.env.languageSupport.removeLanguageListener(_languageListener);
        });
        this._hmi_destroys.push(function () {
            if (_dataTable) {
                _dataTable.clear();
                _dataTable.destroy();
                _dataTable = undefined;
            }
            _table.remove();
            delete that.hmi_value;
            delete that.hmi_isRowVisible;
            delete that.hmi_isCellVisible;
            delete that.hmi_dataTable;
            delete that.hmi_reload;
            _tableId = undefined;
            _table = undefined;
            _scrollBody = undefined;
            // TODO???: _scroller = undefined;
            _columnCount = undefined;
            _columns = undefined;
            _cont = undefined;
            that = undefined;
        });
        try {
            var paging = that.paging === true;
            _dataTable = _table.DataTable({
                ordering: true,
                autoWidth: false,
                lengthChange: false,
                scrollY: !paging ? _cont.height().toString() + 'px' : undefined,
                scrollCollapse: true,
                scroller: !paging,
                scrollResize: !paging,
                paging: paging,
                pageResize: paging,
                columns: _columns,
                headerCallback: header_callback,
                rowCallback: typeof that.prepareTableRow === 'function' ? row_callback : undefined,
                searching: that.searching === true,
                deferRender: true,
            });
            _scrollBody = _cont.find('.dataTables_scrollBody');
            _languageListener = {
                handleLanguageChanged: function (i_language) {
                    // _dataTable.fnDraw(); ==> does not update cells with direct query
                    // to
                    // labels
                    that.hmi_reload();
                }
            };

        }
        catch (exc) {
            console.error('EXCEPTION! Initializing data table: ' + exc);
        }
        i_success();
    };

    s_types['textarea'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        var _textarea = undefined;
        var _code = undefined;
        this.hmi_editor = function () {
            return _code ? _code : _textarea;
        };
        this.hmi_value = function (i_value) {
            if (typeof i_value === 'string') {
                if (_code) {
                    var source = i_value, opts = undefined;
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
                    }
                    else if (that.beautify !== null && typeof that.beautify === 'object') {
                        opts = that.beautify;
                    }
                    if (opts) {
                        try {
                            // source = unpacker_filter(source);
                            source = that.code === 'html' ? html_beautify(source, opts) : js_beautify(source, opts);
                        }
                        catch (exc) {
                            console.error('EXCEPTION! Beautifyer: ' + exc);
                        }
                    }
                    _code.doc.setValue(source);
                }
                else {
                    _textarea.val(i_value);
                }
            }
            else {
                return _code ? _code.doc.getValue() : _textarea.val();
            }
        };
        this._hmi_resizes.push(function () {
            if (_code) {
                _code.setSize(_cont.width(), _cont.height());
            }
        });
        this.hmi_setReadOnly = function (i_readOnly) {
            if (_code) {
                _code.setOption('readOnly', i_readOnly === true);
            }
        };
        this.hmi_handleScrollParams = function (i_params, i_restore) {
            if (_code) {
                var params = i_params || {};
                var scroll_info = _code.getScrollInfo();
                if (i_restore === true) {
                    var container_width = typeof params.container_width === 'number' ? params.container_width : 1;
                    var container_height = typeof params.container_height === 'number' ? params.container_height : 1;
                    var viewport_width = typeof params.viewport_width === 'number' ? params.viewport_width : 1;
                    var viewport_height = typeof params.viewport_height === 'number' ? params.viewport_height : 1;
                    var viewport_left = typeof params.viewport_left === 'number' ? params.viewport_left : 0;
                    var viewport_top = typeof params.viewport_top === 'number' ? params.viewport_top : 0;
                    var left, top;
                    if (viewport_left <= 0) {
                        left = 0;
                    }
                    else if (viewport_left >= container_width - viewport_width) {
                        left = scroll_info.width - scroll_info.clientWidth;
                    }
                    else {
                        left = Math.floor(viewport_left / (container_width - viewport_width) * (scroll_info.width - scroll_info.clientWidth));
                    }
                    if (viewport_top <= 0) {
                        top = 0;
                    }
                    else if (viewport_top >= container_height - viewport_height) {
                        top = scroll_info.height - scroll_info.clientHeight;
                    }
                    else {
                        top = Math.floor(viewport_top / (container_height - viewport_height) * (scroll_info.height - scroll_info.clientHeight));
                    }
                    _code.scrollTo(left, top);
                    scroll_info = _code.getScrollInfo();
                }
                params.container_width = scroll_info.width;
                params.container_height = scroll_info.height;
                params.viewport_width = scroll_info.clientWidth;
                params.viewport_height = scroll_info.clientHeight;
                params.viewport_left = scroll_info.left;
                params.viewport_top = scroll_info.top;
                return params;
            }
            else {
                return false;
            }
        };
        if (false) {
            // TODO try to implement search and mark
            this.hmi_search = function (i_query, i_start, i_caseFold) {
                if (_code) {
                    var searchCursor = _code.getSearchCursor(i_query, i_start, i_caseFold);
                    console.log('');
                }
            };
        }
        var id = Utilities.getUniqueId();
        // add text area
        var txt = '<textarea';
        if (that.readonly === true || that.editable === false) {
            txt += ' readonly';
        }
        txt += ' id="';
        txt += id;
        txt += '" style="font-family:Courier New;width: 100%; height: 100%;box-sizing: border-box;overflow: auto;"></textarea>';
        _textarea = $(txt);
        _textarea.appendTo(_cont);
        if (typeof that.code === 'string' && that.code.length > 0) { // TODO: Migrate to CodeMirror v6 (https://codemirror.net/docs/migration/)
            var mode = undefined;
            if (that.code === 'javascript') {
                mode = {
                    name: 'javascript',
                    globalVars: true
                };
            }
            else if (that.code === 'html') {
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
                extraKeys: {
                    'Ctrl-Space': 'autocomplete'
                },
                matchBrackets: true,
                autoCloseBrackets: true,
                highlightSelectionMatches: {
                    showToken: /\w/,
                    annotateScrollbar: true
                }
            });
            _code.setSize(_cont.width(), _cont.height());
            that.hmi_getSearchCursor = function (i_query, i_start, i_caseFold) {
                _code.getSearchCursor(i_query, i_start, i_caseFold);
            };
        }
        this.hmi_addChangeListener = function (i_listener) {
            if (_code) {
                _code.doc.on('change', i_listener);
            }
            else {
                _textarea.bind('input propertychange', i_listener);
            }
        };
        this.hmi_removeChangeListener = function (i_listener) {
            if (_code) {
                _code.doc.on('change', i_listener);
            }
            else {
                _textarea.unbind('input propertychange', i_listener);
            }
        };
        this._hmi_destroys.push(function () {
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
    };

    s_types['textfield'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _cont = that._hmi_context.container;
        _cont.addClass('overflow-hidden');
        var _textfield = undefined;
        this.hmi_getTextField = function () {
            return _textfield;
        };
        this.hmi_value = function (i_value) {
            if (typeof i_value === 'string') {
                _textfield.val(i_value);
            }
            else {
                return _textfield.val();
            }
        };
        var txt = '<input';
        if (that.readonly === true || that.editable === false) {
            txt += ' readonly';
        }
        txt += ' type="';
        txt += that.password === true ? 'password' : 'text';
        txt += '" style="font-family:Courier New;width: 100%;box-sizing: border-box;"></input>';
        _textfield = $(txt);
        _textfield.appendTo(_cont);
        this.hmi_addChangeListener = function (i_listener) {
            _textfield.bind('input propertychange', i_listener);
        };
        this.hmi_removeChangeListener = function (i_listener) {
            _textfield.unbind('input propertychange', i_listener);
        };
        this._hmi_destroys.push(function () {
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
        i_success();
    };

    function equal_tree_nodes(i_node1, i_node2) {
        return i_node1.data && i_node2.data && i_node1.data.path === i_node2.data.path;
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
                        Core.handleNotFound(current, loaded, equal_tree_nodes, rem => removed.push(rem));
                        // collect all nodes newly added
                        const added = [];
                        Core.handleNotFound(loaded, current, equal_tree_nodes, add => added.push(add));
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
            data: {
                path: node.data.path,
                request
            },
            success: function (i_result, i_textStatus, i_jqXHR) {
                var loaded = JsonFX.parse(i_result, false, true);
                var current = node.getChildren();
                // if we received an array of nodes from the database
                if (Array.isArray(loaded)) {
                    // if we got children in our tree
                    if (Array.isArray(current)) {
                        // collect all nodes not longer exists
                        var removed = [];
                        Core.handleNotFound(current, loaded, equal_tree_nodes, function (i_removed) {
                            removed.push(i_removed);
                        });
                        // collect all nodes newly added
                        var added = [];
                        Core.handleNotFound(loaded, current, equal_tree_nodes, function (i_added) {
                            added.push(i_added);
                        });
                        // remove tree nodes no longer exists
                        for (var i = 0, l = removed.length; i < l; i++) {
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
            },
            error: onError,
            timeout: 10000
        });
    }
    function update_child_tree_nodes_DISCARDED(i_url, i_request, i_node, i_compare, i_success, i_error) { // TODO: remove or reuse
        $.ajax({
            type: 'GET',
            url: i_url,
            data: {
                path: i_node.data.path,
                request: i_request
            },
            success: function (i_result, i_textStatus, i_jqXHR) {
                var loaded = JsonFX.parse(i_result, false, true);
                var current = i_node.getChildren();
                // if we received an array of nodes from the database
                if (Array.isArray(loaded)) {
                    // if we got children in our tree
                    if (Array.isArray(current)) {
                        // collect all nodes not longer exists
                        var removed = [];
                        Core.handleNotFound(current, loaded, equal_tree_nodes, function (i_removed) {
                            removed.push(i_removed);
                        });
                        // collect all nodes newly added
                        var added = [];
                        Core.handleNotFound(loaded, current, equal_tree_nodes, function (i_added) {
                            added.push(i_added);
                        });
                        // remove tree nodes no longer exists
                        for (var i = 0, l = removed.length; i < l; i++) {
                            i_node.removeChild(removed[i]);
                        }
                        // add new children
                        if (added.length > 0) {
                            i_node.addChildren(added);
                        }
                    }
                    // if we do not have children we add all
                    else if (loaded.length > 0) {
                        i_node.addChildren(loaded);
                    }
                    if (typeof i_compare === 'function') {
                        i_node.sortChildren(i_compare, false);
                    }
                }
                // if no children available in the database we remove all from the
                // tree node
                else if (Array.isArray(current)) {
                    i_node.removeChildren();
                }
                // notify
                i_success();
            },
            error: i_error,
            timeout: 10000
        });
    }

    /**
     * This function updates all children of the given node if it's a folder and
     * children have been loaded before. In case of available children after
     * update this function will be called recursively on every child.
     */
    function update_loaded_tree_nodes(i_url, i_request, i_node, i_compare, i_success, i_error) {
        // we only do this on folders and if not lazy anymore
        if ((i_node.isFolder() === true || i_node.isRoot() === true) && i_node.hasChildren() === true) {
            updateChildTreeNodes(i_url, i_request, i_node, i_compare, function () {
                var children = i_node.getChildren();
                if (Array.isArray(children)) {
                    var tasks = [];
                    for (var i = 0, l = children.length; i < l; i++) {
                        (function () {
                            var child = children[i];
                            tasks.push(function (i_suc, i_err) {
                                update_loaded_tree_nodes(child.data.url, child.data.request, child, i_compare, i_suc, i_err);
                            });
                        }());
                    }
                    tasks.parallel = true;
                    Executor.run(tasks, i_success, i_error);
                }
                else {
                    i_success();
                }
            }, i_error);
        }
        else {
            // no folder or no children loaded so far
            i_success();
        }
    };

    function expand_tree_path(i_url, i_request, i_node, i_path, i_compare, i_success, i_error) {
        updateChildTreeNodes(i_url, i_request, i_node, i_compare, function () {
            var children = i_node.getChildren();
            if (Array.isArray(children)) {
                var i, l = children.length, child, path;
                for (i = 0; i < l; i++) {
                    child = children[i];
                    path = child.data.path;
                    if (i_path.indexOf(path) === 0) {
                        if (i_path.length > path.length) {
                            if (child.isFolder()) {
                                child.makeVisible({
                                    scrollIntoView: false
                                });
                                expand_tree_path(i_url, i_request, child, i_path, i_compare, i_success, i_error);
                            }
                            else {
                                i_success(child);
                            }
                        }
                        else {
                            i_success(child);
                        }
                        return;
                    }
                }
            }
            // reaching this point means none of the available child nodes match to
            // our given path - we do not treat this as an error
            i_success(i_node);
        }, i_error);
    };

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

    s_types['tree'] = function (i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var _cont = that._hmi_context.container;
        _cont.addClass('default-scroll-container');
        this.hmi_setRootPath = function (i_path, i_success, i_error) {
            // this call returns a promise and by calling "then" on the promise we
            // catch success or error
            $.ui.fancytree.getTree(_cont).reload({
                url: that.rootURL,
                cache: false,
                data: {
                    path: i_path,
                    request: that.rootRequest
                }
            }).then(i_success, i_error);
        };
        this.hmi_getRootNode = function () {
            return $.ui.fancytree.getTree(_cont).getRootNode();
        };
        var _setEnabled = this.hmi_setEnabled;
        this.hmi_setEnabled = function (i_enabled) {
            if (typeof _setEnabled === 'function') {
                _setEnabled(i_enabled);
            }
            _cont.fancytree(i_enabled === true ? 'enable' : 'disable');
        };
        this.hmi_updateLoadedNodes = function (i_success, i_error) {
            var root = that.hmi_getRootNode();
            update_loaded_tree_nodes(that.rootURL, that.rootRequest, root, that.compareNodes, i_success || function () {
                // nothing to do
            }, i_error || function (i_exception) {
                console.error(i_exception);
            });
        };
        this.hmi_setActivePath = function (i_path, i_success, i_error) {
            var root = that.hmi_getRootNode();
            expand_tree_path(that.rootURL, that.rootRequest, root, i_path, that.compareNodes, function (i_node) {
                i_node.makeVisible({
                    scrollIntoView: true
                });
                i_node.setActive(true);
                if (typeof i_success === 'function') {
                    i_success(i_node);
                }
                // nothing to do
            }, i_error || function (i_exception) {
                console.error(i_exception);
            });
        };
        // build tree source
        var source = Array.isArray(that.data) ? that.data : {
            url: that.rootURL,
            cache: false,
            data: {
                path: '',
                request: that.rootRequest
            }
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
                    data: {
                        path: i_data.node.data.path,
                        request: i_data.node.data.request
                    }
                };
            },
            // This will be called in the following situations:
            // - on hmi_setActivePath(...)
            // - after a node has been selected by mouse click but only if already
            // selected before
            // - after a node has been selected by keybord arrow switches
            activate: function (i_event, i_data) {
                if (typeof that.nodeActivated === 'function') {
                    that.nodeActivated(i_data.node);
                }
            },
            focus: function (i_event, i_data) {
                if (typeof that.selectedNodeHasFocus === 'function') {
                    that.selectedNodeHasFocus(i_data.node);
                }
            },
            blur: function (i_event, i_data) {
                if (typeof that.selectedNodeLostFocus === 'function') {
                    that.selectedNodeLostFocus(i_data.node);
                }
            },
            click: function (i_event, i_data) {
                if (typeof that.nodeClicked === 'function') {
                    that.nodeClicked(i_data.node);
                }
            }
        });
        this._hmi_destroys.push(function () {
            try {
                _cont.fancytree('destroy');
            }
            catch (exc) {
                console.error('EXCEPTION! Cannot destroy tree: ' + exc);
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
        i_success();
    };

    function TimeRangeSelectorImpl() {
        var that = this;
        var _min = undefined;
        var _max = undefined;
        var _from = undefined;
        var _to = undefined;
        var _syncInterval = undefined;
        var _shiftUpInterval = undefined;
        var _shiftDownInterval = undefined;
        var doublingClickCount = typeof that.doublingClickCount === 'number' && that.doublingClickCount >= 1 ? that.doublingClickCount : 2;
        var _zoom = Math.exp(Math.log(2.0) / doublingClickCount);
        var _zoomInv = 1.0 / _zoom;
        var _shiftFactor = typeof that.shiftFactor === 'number' && that.shiftFactor > 0.0 && that.shiftFactor < 1.0 ? that.shiftFactor : 0.2;

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
                }
                catch (exc) {
                    console.error('EXCEPTION! Cannot update range: ' + exc + ' ' + that.handleRangeUpdate.toString());
                }
            }
        };
        this.hmi_setAbsoluteRange = function (i_min, i_max) {
            if (typeof i_min === 'number') {
                _min = that.onlyInteger === true ? Math.floor(i_min) : i_min;
            }
            if (typeof i_max === 'number') {
                _max = that.onlyInteger === true ? Math.ceil(i_max) : i_max;
            }
        };
        this.hmi_setCurrentRange = function (i_from, i_to) {
            if (typeof i_from === 'number') {
                _from = that.onlyInteger === true ? Math.floor(i_from) : i_from;
            }
            if (typeof i_to === 'number') {
                _to = that.onlyInteger === true ? Math.ceil(i_to) : i_to;
            }
            if (_from < _min) {
                _from = _min;
            }
            if (_to > _max) {
                _to = _max;
            }
        };
        this.hmi_maximizeRange = function () {
            _from = _min;
            _to = _max;
            update();
        };
        this.hmi_zoomOut = function () {
            var val = ((_to - _from) * (_zoom - 1.0)) * 0.5;
            _from -= val;
            _to += val;
            update();
        };
        this.hmi_zoomIn = function () {
            var val = ((_to - _from) * (1.0 - _zoomInv)) * 0.5;
            _from += val;
            _to -= val;
            update();
        };
        function shift(i_up) {
            var diff = i_up === true ? Math.min(_shiftFactor * (_to - _from), _max - _to) : -Math.min(_shiftFactor * (_to - _from), _from - _min);
            _from += diff;
            _to += diff;
            update();
        };
        this.hmi_shiftDown = function (i_pressed) {
            if (i_pressed === true) {
                if (_shiftDownInterval === undefined) {
                    _shiftDownInterval = setInterval(function () {
                        shift(false);
                    }, typeof that.shiftMillis === 'number' && that.shiftMillis > 0 ? that.shiftMillis : 1000);
                }
                shift(false);
            }
            else {
                if (_shiftDownInterval !== undefined) {
                    clearInterval(_shiftDownInterval);
                    _shiftDownInterval = undefined;
                }
            }
        };
        this.hmi_shiftUp = function (i_pressed) {
            if (i_pressed === true) {
                if (_shiftUpInterval === undefined) {
                    _shiftUpInterval = setInterval(function () {
                        shift(true);
                    }, typeof that.shiftMillis === 'number' && that.shiftMillis > 0 ? that.shiftMillis : 1000);
                }
                shift(true);
            }
            else {
                if (_shiftUpInterval !== undefined) {
                    clearInterval(_shiftUpInterval);
                    _shiftUpInterval = undefined;
                }
            }
        };
        this.hmi_synchronize = function (i_enable) {
            if (i_enable === true) {
                if (_syncInterval === undefined) {
                    _syncInterval = setInterval(update, typeof that.syncMillis === 'number' && that.syncMillis > 0 ? that.syncMillis : 1000);
                    update();
                }
            }
            else {
                if (_syncInterval !== undefined) {
                    clearInterval(_syncInterval);
                    _syncInterval = undefined;
                }
            }
        };
        this.hmi_isSynchronized = function () {
            return _syncInterval !== undefined;
        };
        this.hmi_isShiftingUp = function () {
            return _shiftUpInterval !== undefined;
        };
        this.hmi_isShiftingDown = function () {
            return _shiftDownInterval !== undefined;
        };
        this.hmi_getFrom = function () {
            return _from;
        };
        this.hmi_getTo = function () {
            return _to;
        };
        this.hmi_getRange = function () {
            return _to - _from;
        };
        this._hmi_destroys.push(function () {
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

    TimeRangeSelectorImpl.isRequired = function (i_object) {
        return typeof i_object.handleRangeUpdate === 'function';
    };
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
                console.error(`EXCEPTION! Calling visible: '${error}' '${visible.toString()}'`);
                return true;
            }
        } else {
            return true;
        }
    };

    /**
     * Get the margin. If margin is a boolean we return the separator. In case of
     * a number, its value will be returned. If it is an object, we use the
     * selector to get the attribute. If the attribute is a boolean we return the
     * separator. In case of a number we return its value. In all other cases we
     * return zero.
     * 
     * @param {Object}
     *          i_margin The margin configuration parameter
     * @param {Object}
     *          i_attributeName The selective attribute name (top, bottom, left or
     *          right)
     * @param {Object}
     *          i_separator The separator value
     */
    function get_dimension_parameter(i_object, i_attributeName, i_separator) {
        if (i_object === true) {
            return i_separator;
        }
        else if (typeof i_object === 'number') {
            return i_object;
        }
        else if (i_object !== null && typeof i_object === 'object') {
            var margin = i_object[i_attributeName];
            if (margin === true) {
                return i_separator;
            }
            else if (typeof margin === 'number') {
                return margin;
            }
            else {
                return 0;
            }
        }
        else {
            return 0;
        }
    };
    function compute_central_rectangle(i_sourceWidth, i_sourceHeight, i_targetWidth, i_targetHeight, i_targetMargin, i_targetBorder, i_relativeX, i_relativeY) {
        // first we compute the maximum dimension we have for our image
        var marginLeft = get_dimension_parameter(i_targetMargin, 'left', i_targetBorder);
        var marginRight = get_dimension_parameter(i_targetMargin, 'right', i_targetBorder);
        var marginTop = get_dimension_parameter(i_targetMargin, 'top', i_targetBorder);
        var marginBottom = get_dimension_parameter(i_targetMargin, 'bottom', i_targetBorder);
        var border = typeof i_targetBorder === 'number' && i_targetBorder > 0 ? i_targetBorder : 0;
        var targetWidth = i_targetWidth - marginLeft - marginRight - border * 2;
        var targetHeight = i_targetHeight - marginTop - marginBottom - border * 2;
        // now we compute the scales to fit within the maximum dimension
        var scaleX = targetWidth / i_sourceWidth;
        var scaleY = targetHeight / i_sourceHeight;
        // get the relevant scale
        var scale = scaleX >= scaleY ? scaleY : scaleX;
        // compute the resulting dimension
        var width = scale * i_sourceWidth;
        var height = scale * i_sourceHeight;
        // compute the offsets
        var relx = typeof i_relativeX === 'number' ? i_relativeX : 0.5;
        var rely = typeof i_relativeY === 'number' ? i_relativeY : 0.5;
        var offsetX = (targetWidth - width) * relx;
        var offsetY = (targetHeight - height) * rely;
        // return the resulting values
        return {
            x: marginLeft + border + offsetX,
            y: marginTop + border + offsetY,
            width: width,
            height: height,
            scale: scale
        };
    };

    var _dummyText = undefined;
    function get_text_size(i_text, i_font) {
        if (_dummyText === undefined) {
            _dummyText = $('<span></span>').hide().appendTo(document.body);
        }
        _dummyText.text(i_text !== undefined && i_text !== null ? (typeof i_text === 'string' ? i_text : i_text.toString()) : '');
        if (typeof i_font === 'string') {
            _dummyText.css('font', i_font);
        }
        var dimension = {
            width: _dummyText.width(),
            height: _dummyText.height(),
        };
        _dummyText.text('');
        return dimension;
    }
    ObjectLifecycleManager.getTextSize = get_text_size;

    function DefaultHtmlObjectImpl() {
        var that = this;
        var _cont = that._hmi_context.container;
        _cont.data('hmi_object', that);
        this._hmi_resizes = [];
        // RESIZE
        this._hmi_resize = function () {
            if (_cont !== undefined) {
                var width = _cont.width();
                var height = _cont.height();
                if (width > 0 && height > 0) {
                    for (var i = 0; i < that._hmi_resizes.length; i++) {
                        var func = that._hmi_resizes[i];
                        if (typeof func === 'function') {
                            try {
                                func(width, height);
                            }
                            catch (exc) {
                                console.error('EXCEPTION! Cannot resize: ' + exc + ' ' + func.toString());
                            }
                        }
                    }
                    if (typeof that.resized === 'function') {
                        try {
                            that.resized(width, height);
                        }
                        catch (exc) {
                            console.error('EXCEPTION! Calling resized: ' + exc + ' ' + that.resized.toString());
                        }
                    }
                }
                if (that._hmi_updateAlignment) {
                    that._hmi_updateAlignment();
                }
            }
        };
        this.hmi_fireResized = function () {
            this._hmi_resize();
        };
        this.hmi_updateBorder = function (i_engraved) {
            var width = _cont.width();
            var height = _cont.height();
            if (that.border === true) {
                _cont[i_engraved === true ? 'removeClass' : 'addClass']('hmi-border-embossed');
                _cont[i_engraved === true ? 'addClass' : 'removeClass']('hmi-border-engraved');
            }
            else if (that.border === false) {
                _cont[i_engraved === true ? 'removeClass' : 'addClass']('hmi-border-engraved');
                _cont[i_engraved === true ? 'addClass' : 'removeClass']('hmi-border-embossed');
            }
            if (width !== _cont.width() || height !== _cont.height()) {
                that._hmi_resize();
            }
        };
        this.hmi_setVisible = function (i_visible) {
            var visible = i_visible === true;
            if (that._hmi_visible !== visible) {
                that._hmi_visible = visible;
                _cont[that._hmi_visible ? 'show' : 'hide']();
                if (that._hmi_visible) {
                    that._hmi_resize();
                }
            }
        };
        this.hmi_isVisible = function () {
            return that._hmi_visible;
        };
        // JQUERY ELEMENT
        this.hmi_element = function () {
            return _cont;
        };
        this.hmi_addClass = function (i_class) {
            _cont.addClass(i_class);
            if (that._hmi_updateAlignment) {
                that._hmi_updateAlignment();
            }
        };
        this.hmi_removeClass = function (i_class) {
            _cont.removeClass(i_class);
            if (that._hmi_updateAlignment) {
                that._hmi_updateAlignment();
            }
        };
        this.hmi_css = function (i_key, i_value) {
            if (i_value === null || i_value === '') {
                _cont.css(i_key, '');
            }
            else if (typeof i_value === 'string') {
                _cont.css(i_key, i_value);
                if (that._hmi_updateAlignment) {
                    that._hmi_updateAlignment();
                }
            }
            else {
                return _cont.css(i_key);
            }
        };
        this.hmi_attr = function (i_key, i_value) {
            if (typeof i_value === 'string') {
                _cont.attr(i_key, i_value);
                if (that._hmi_updateAlignment) {
                    that._hmi_updateAlignment();
                }
            }
            else {
                return _cont.attr(i_key);
            }
        };
        this.hmi_setSelected = function (i_selected, i_cssClass) {
            var width = _cont.width();
            var height = _cont.height();
            _cont[i_selected === true ? 'addClass' : 'removeClass'](typeof i_cssClass === 'string' ? i_cssClass : 'hmi-selected');
            if (width !== _cont.width() || height !== _cont.height()) {
                that._hmi_resize();
            }
        };
        // BORDER
        that.hmi_updateBorder(false);
        // CLASSES
        var classes = typeof that.classes === 'string' ? that.classes.split(' ') : that.classes;
        if (Array.isArray(classes)) {
            for (var i = 0; i < classes.length; i++) {
                var cls = classes[i];
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
        this._hmi_destroys.push(function () {
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
    };

    function get_watch(i_watch) {
        if (Array.isArray(i_watch)) {
            var found = false;
            for (var i = 0; i < i_watch.length; i++) {
                if (typeof i_watch[i] === 'string') {
                    found = true;
                    break;
                }
            }
            if (found) {
                var watch = [];
                for (var i = 0; i < i_watch.length; i++) {
                    var w = i_watch[i];
                    if (typeof w === 'string') {
                        watch.push(w);
                    }
                }
                return watch;
            }
            else {
                return undefined;
            }
        }
        else if (typeof i_watch === 'string') {
            return [i_watch];
        }
        else {
            return undefined;
        }
    };

    function SimpleHtmlObjectImpl() {
        var that = this;
        var _cont = that._hmi_context.container;
        var _image = undefined;
        var _text = undefined;
        var _html = undefined;
        // ADD STANDARD METHODS
        that.hmi_setImageSource = function (i_source) {
            if (_text !== undefined) {
                _text.remove();
                _text = undefined;
            }
            if (_html !== undefined) {
                _html = undefined;
                _cont.empty();
            }
            if (_image === undefined) {
                var img = '<img draggable="false"';
                if (that.imageWidth !== undefined) {
                    img += ' width="';
                    img += that.imageWidth;
                    img += '"';
                }
                if (that.imageHeight !== undefined) {
                    img += ' height="';
                    img += that.imageHeight;
                    img += '"';
                }
                img += '></img>';
                _image = $(img);
                _image.appendTo(_cont);
                var classes = typeof that.imageClasses === 'string' ? that.imageClasses.split(' ') : that.imageClasses;
                if (Array.isArray(classes)) {
                    for (var i = 0; i < classes.length; i++) {
                        var cls = classes[i];
                        if (typeof cls === 'string' && cls.length > 0) {
                            _image.addClass(cls);
                        }
                    }
                }
                _image.on('load', that._hmi_updateAlignment);
            }
            var src = typeof i_source === 'string' ? i_source : '';
            _image.attr('src', src);
            _image[src.length > 0 ? 'show' : 'hide']();
        };
        this.hmi_getImageWidth = function () {
            if (_image !== undefined) {
                var img = _image[0];
                return img !== undefined ? img.naturalWidth : undefined;
            }
            else {
                return undefined;
            }
        };
        this.hmi_getImageHeight = function () {
            if (_image !== undefined) {
                var img = _image[0];
                return img !== undefined ? img.naturalHeight : undefined;
            }
            else {
                return undefined;
            }
        };
        that.hmi_text = function (i_text) {
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
                var type = typeof that.domtype === 'string' && that.domtype.length > 0 ? that.domtype : 'span';
                _text = $('<' + type + ' style="display:inline-block;"></' + type + '>');
                _text.appendTo(_cont);
                var classes = typeof that.textClasses === 'string' ? that.textClasses.split(' ') : that.textClasses;
                if (Array.isArray(classes)) {
                    for (var i = 0; i < classes.length; i++) {
                        var cls = classes[i];
                        if (typeof cls === 'string' && cls.length > 0) {
                            _text.addClass(cls);
                        }
                    }
                }
                if (typeof that.fontsize === 'number') {
                    _text.css('font-size', that.fontsize.toString() + 'px');
                }
            }
            if (i_text !== undefined && i_text !== null) {
                _text.empty();
                _text.text(typeof i_text === 'string' ? i_text : i_text.toString());
                that._hmi_updateAlignment();
            }
            else {
                return _text.text();
            }
        };
        that.hmi_html = function (i_html) {
            if (_text !== undefined) {
                _text.remove();
                _text = undefined;
            }
            if (_image !== undefined) {
                _image.off('load', that._hmi_updateAlignment);
                _image.remove();
                _image = undefined;
            }
            if (i_html !== undefined) {
                _html = true;
                _cont.empty();
                _cont.html(typeof i_html === 'string' ? i_html : i_html.toString());
            }
            else {
                return _cont.html();
            }
        };
        this._hmi_updateAlignment = function () {
            if (_text !== undefined) {
                if (_text._hmi_marginLeft !== undefined) {
                    _text._hmi_marginLeft = undefined;
                    _text.css('margin-left', '');
                }
                if (_text._hmi_marginTop !== undefined) {
                    _text._hmi_marginTop = undefined;
                    _text.css('margin-top', '');
                }
                var align = getAlignment(that.align, undefined, false, true);
                var containerWidth = Math.floor(_cont.innerWidth());
                var containerHeight = Math.floor(_cont.innerHeight());
                var contentWidth = Math.ceil(_text.width());
                var contentHeight = Math.ceil(_text.height());
                var left = Math.floor((containerWidth - contentWidth) * align.x) - 1;
                if (left > 0) {
                    if (_text._hmi_marginLeft !== left) {
                        _text._hmi_marginLeft = left;
                        _text.css('margin-left', left.toString() + 'px');
                    }
                }
                else {
                    if (_text._hmi_marginLeft !== undefined) {
                        _text._hmi_marginLeft = undefined;
                        _text.css('margin-left', '');
                    }
                }
                var top = Math.floor((containerHeight - contentHeight) * align.y) - 1;
                if (top > 0) {
                    if (_text._hmi_marginTop !== top) {
                        _text._hmi_marginTop = top;
                        _text.css('margin-top', top.toString() + 'px');
                    }
                }
                else {
                    if (_text._hmi_marginTop !== undefined) {
                        _text._hmi_marginTop = undefined;
                        _text.css('margin-top', '');
                    }
                }
            }
            else if (_image !== undefined) {
                var align = getAlignment(that.align, undefined, false, true);
                var containerWidth = Math.floor(_cont.innerWidth());
                var containerHeight = Math.floor(_cont.innerHeight());
                var contentWidth = Math.ceil(_image[0].naturalWidth);
                var contentHeight = Math.ceil(_image[0].naturalHeight);
                var rect = compute_central_rectangle(contentWidth, contentHeight, containerWidth, containerHeight, that.margin, that.separator, align.x, align.y);
                var width = Math.floor(rect.width);
                if (_image._hmi_width !== width) {
                    _image._hmi_width = width;
                    _image.attr('width', width);
                }
                var height = Math.floor(rect.height);
                if (_image._hmi_height !== height) {
                    _image._hmi_height = height;
                    _image.attr('height', height);
                }
                var left = Math.floor(rect.x);
                if (_image._hmi_x !== left) {
                    _image._hmi_x = left;
                    _image.css('margin-left', left.toString() + 'px');
                }
                var top = Math.floor(rect.y);
                if (_image._hmi_y !== top) {
                    _image._hmi_y = top;
                    _image.css('margin-top', top.toString() + 'px');
                }
            }
        };
        // HTML CONTENT
        if (typeof that.html === 'string') {
            _html = true;
            _cont.addClass(that.scrollable === true ? 'default-scroll-container' : 'overflow-hidden');
            _cont.html(that.html);
        }
        // TEXT CONTENT
        else if (typeof that.text === 'string' || typeof that.text === 'number' || typeof that.text === 'boolean') {
            _cont.addClass(that.scrollable === true ? 'default-scroll-container' : 'overflow-hidden');
            that.hmi_text(that.text);
        }
        // IMAGE CONTENT
        else if (typeof that.image === 'string') {
            _cont.addClass('overflow-hidden');
            that.hmi_setImageSource(that.image);
        }
        // NO CONTENT
        else {
            _cont.addClass(that.scrollable === true ? 'default-scroll-container' : 'overflow-hidden');
        }
        this._hmi_destroys.push(function () {
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

    function TaskObjectImpl(i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        var tasks = [];
        var _cont = that._hmi_context.container;
        that.hmi_text = function (i_text) {
            if (i_text !== undefined && i_text !== null) {
                that.text = typeof i_text === 'string' ? i_text : i_text.toString();
            }
            else {
                return that.text;
            }
        };
        var _children = undefined;
        if (Array.isArray(this.children)) {
            _children = this.children;
            for (var i = 0, l = _children.length; i < l; i++) {
                // closure
                (function () {
                    var child = _children[i];
                    var hmiobj = child._hmi_object;
                    if (hmiobj && isTaskType(hmiobj) && hmiobj._hmi_init_dom) {
                        tasks.push(function (i_suc, i_err) {
                            // #task: 1
                            hmiobj._hmi_init_dom({
                                container: _cont
                            }, i_suc, i_err);
                        });
                    }
                }());
            }
        }
        this._hmi_destroys.push(function (i_suc, i_err) {
            var tasks = [];
            if (_children) {
                for (var i = _children.length - 1; i >= 0; i--) {
                    var child = _children[i];
                    var hmiobj = child._hmi_object;
                    if (hmiobj && isTaskType(hmiobj) && hmiobj._hmi_destroy_dom) {
                        (function () {
                            tasks.push(function (i_s, i_e) {
                                // #task: 1
                                hmiobj._hmi_destroy_dom(i_s, i_e);
                            })
                        }());
                    }
                }
                _children = undefined;
            }
            delete that.hmi_text;
            _cont = undefined;
            that = undefined;
            Executor.run(tasks, i_suc, i_err);
        });
        Executor.run(tasks, i_success, i_error);
    };
    function get_canvas_attribute(i_hmiObject, i_attr) {
        var object = i_hmiObject;
        while (object !== null && typeof object === 'object') {
            var val = object[i_attr];
            if (val !== undefined) {
                return val;
            }
            else if (object._hmi_canvas !== undefined) {
                // this is our canvas root object so we must not search on higher level
                return undefined;
            }
            var child = object.hmi_locator;
            if (child !== undefined) {
                val = child[i_attr];
                if (val !== undefined) {
                    return val;
                }
            }
            object = object.hmi_parentObject;
        }
        return undefined;
    };
    function get_canvas_pixel(i_object, i_attribute, i_scale, i_default) {
        var val = get_canvas_attribute(i_object, i_attribute);
        var pix = getPixelValue(val);
        return typeof pix === 'number' ? pix : (typeof val === 'number' ? val * i_scale : i_default);
    };
    function get_pixel_size(i_value, i_scale, i_default) {
        var pix = getPixelValue(i_value);
        return typeof pix === 'number' ? pix : (typeof i_value === 'number' ? i_value * i_scale : i_default);
    };

    function ZoomImpl(i_disableVisuEvents, i_enableEditorEvents) {
        var that = this;
        var _p = {};
        var _cont = this._hmi_context.container;
        var _ctx = this._hmi_context.context2d;
        var _tf = this._hmi_context.transform;
        var _bounds = this.bounds;
        var _mouse = false, _id1, _x1, _y1, _ix1, _iy1, _id2, _x2, _y2, _ix2, _iy2, _di = undefined;
        this._hmi_handleZoomEvent = function (i_event, i_type) {
            var offs = _cont.offset();
            var tt = i_event.originalEvent ? i_event.originalEvent.targetTouches : undefined;
            switch (i_type) {
                case MOUSEEVENT_MOUSEDOWN:
                    that._hmi_event = i_event;
                    _mouse = true;
                    _ix1 = i_event.clientX - offs.left;
                    _iy1 = i_event.clientY - offs.top;
                    _tf.transformInverse(_ix1, _iy1, _p);
                    _x1 = _p.x;
                    _y1 = _p.y;
                    if (i_enableEditorEvents === true && i_event.button === 2) {
                        console.log('x: ' + _x1 + ', y: ' + _y1);
                    }
                    break;
                case MOUSEEVENT_MOUSEMOVE:
                    if (_mouse && _bounds) {
                        delete _bounds.x;
                        delete _bounds.y;
                        delete _bounds.width;
                        delete _bounds.height;
                        _ix1 = i_event.clientX - offs.left;
                        _iy1 = i_event.clientY - offs.top;
                        _tf.initForPoint(_x1, _y1, _ix1, _iy1);
                        _tf.transformInverse(0, 0, _p);
                        _bounds.x1 = _p.x;
                        _bounds.y1 = _p.y;
                        _tf.transformInverse(_cont.width(), _cont.height(), _p);
                        _bounds.x2 = _p.x;
                        _bounds.y2 = _p.y;
                        that._hmi_event = i_event;
                    }
                    break;
                case MOUSEEVENT_MOUSEUP:
                    if (_mouse && _bounds) {
                        delete _bounds.x;
                        delete _bounds.y;
                        delete _bounds.width;
                        delete _bounds.height;
                        _tf.initForPoint(_x1, _y1, i_event.clientX - offs.left, i_event.clientY - offs.top);
                        _tf.transformInverse(0, 0, _p);
                        _bounds.x1 = _p.x;
                        _bounds.y1 = _p.y;
                        _tf.transformInverse(_cont.width(), _cont.height(), _p);
                        _bounds.x2 = _p.x;
                        _bounds.y2 = _p.y;
                        _x1 = undefined;
                        _y1 = undefined;
                        _ix1 = undefined;
                        _iy1 = undefined;
                        delete that._hmi_event;
                    }
                    _mouse = false;
                    break;
                case MOUSEEVENT_MOUSELEAVE:
                case MOUSEEVENT_MOUSEOUT:
                    _x1 = undefined;
                    _y1 = undefined;
                    _ix1 = undefined;
                    _iy1 = undefined;
                    _mouse = false;
                    delete that._hmi_event;
                    break;
                case MOUSEEVENT_CLICK:
                case MOUSEEVENT_DBLCLICK:
                case MOUSEEVENT_HOVER:
                case MOUSEEVENT_MOUSEENTER:
                case MOUSEEVENT_MOUSEOVER:
                case MOUSEEVENT_CONTEXTMENU:
                    break;
                case MOUSEEVENT_MOUSEWHEEL:
                    if (_bounds) {
                        if (i_event.originalEvent && typeof i_event.originalEvent.wheelDelta === 'number' && i_event.originalEvent.wheelDelta !== 0) {
                            var wd = i_event.originalEvent.wheelDelta / 120;
                            // scrolling without shift down (scrolling up: wd > 0)
                            delete _bounds.x;
                            delete _bounds.y;
                            delete _bounds.width;
                            delete _bounds.height;
                            // first get the current metric scroll location
                            _tf.transformInverse(i_event.clientX - offs.left, i_event.clientY - offs.top, _p);
                            var x = _p.x;
                            var y = _p.y;
                            // next get the current metric bound locations
                            _tf.transformInverse(0, 0, _p);
                            var x1 = _p.x;
                            var y1 = _p.y;
                            _tf.transformInverse(_cont.width(), _cont.height(), _p);
                            var x2 = _p.x;
                            var y2 = _p.y;
                            // finally adjust the bounds
                            var zoom = wd > 0 ? wd / ZOOM_FACTOR : -wd * ZOOM_FACTOR;
                            _bounds.x1 = x + (x1 - x) * zoom;
                            _bounds.y1 = y + (y1 - y) * zoom;
                            _bounds.x2 = x + (x2 - x) * zoom;
                            _bounds.y2 = y + (y2 - y) * zoom;
                        }
                    }
                    break;
                case TOUCHEVENT_TOUCHSTART:
                    _mouse = false;
                    if (tt) {
                        switch (tt.length) {
                            case 1:
                                that._hmi_event = i_event;
                                var t = tt[0];
                                _id1 = t.identifier;
                                _ix1 = t.clientX - offs.left;
                                _iy1 = t.clientY - offs.top;
                                _tf.transformInverse(_ix1, _iy1, _p);
                                _x1 = _p.x;
                                _y1 = _p.y;
                                break;
                            case 2:
                                if (that.multitouch === true) {
                                    that._hmi_event = i_event;
                                    var t = tt[1];
                                    if (t.identifier === _id1) {
                                        t = tt[0];
                                    }
                                    _id2 = t.identifier;
                                    _ix2 = t.clientX - offs.left;
                                    _iy2 = t.clientY - offs.top;
                                    _tf.transformInverse(_ix2, _iy2, _p);
                                    _x2 = _p.x;
                                    _y2 = _p.y;

                                    var dix = (_ix2 - _ix1);
                                    var diy = (_iy2 - _iy1);
                                    _di = Math.sqrt(dix * dix + diy * diy);
                                }
                                break;
                            default:
                                _id1 = undefined;
                                _x1 = undefined;
                                _y1 = undefined;
                                _ix1 = undefined;
                                _iy1 = undefined;
                                _id2 = undefined;
                                _x2 = undefined;
                                _y2 = undefined;
                                _ix2 = undefined;
                                _iy2 = undefined;
                                _di = undefined;
                                delete that._hmi_event;
                                break;
                        }
                    }
                    break;
                case TOUCHEVENT_TOUCHMOVE:
                    _mouse = false;
                    if (tt && _bounds) {
                        switch (tt.length) {
                            case 1:
                                delete _bounds.x;
                                delete _bounds.y;
                                delete _bounds.width;
                                delete _bounds.height;
                                that._hmi_event = i_event;
                                var t = tt[0];
                                _tf.initForPoint(_x1, _y1, t.clientX - offs.left, t.clientY - offs.top);
                                _tf.transformInverse(0, 0, _p);
                                _bounds.x1 = _p.x;
                                _bounds.y1 = _p.y;
                                _tf.transformInverse(_cont.width(), _cont.height(), _p);
                                _bounds.x2 = _p.x;
                                _bounds.y2 = _p.y;
                                break;
                            case 2:
                                if (that.multitouch === true) {
                                    that._hmi_event = i_event;
                                    var t1 = tt[0];
                                    var t2 = tt[1];
                                    if (t2.identifier === _id1) {
                                        var t = t1;
                                        t1 = t2;
                                        t2 = t;
                                    }
                                    var ix1 = t1.clientX - offs.left;
                                    var iy1 = t1.clientY - offs.top;
                                    var ix2 = t2.clientX - offs.left;
                                    var iy2 = t2.clientY - offs.top;
                                    if (that.zoom_rotation === true) {
                                        _tf.initForPoints(_x1, _y1, _x2, _y2, ix1, iy1, ix2, iy2);
                                        // we got to set this flag because the standard
                                        // initForBounds()
                                        // method does not handle rotation
                                        that._hmi_rotated = true;
                                    }
                                    else {
                                        delete _bounds.x;
                                        delete _bounds.y;
                                        delete _bounds.width;
                                        delete _bounds.height;
                                        var dix = (ix2 - ix1);
                                        var diy = (iy2 - iy1);
                                        var di = Math.sqrt(dix * dix + diy * diy);
                                        var s = di / _di;
                                        var ix = (ix1 + ix2) / 2;
                                        var iy = (iy1 + iy2) / 2;
                                        var dx2 = (_ix2 - _ix1) / 2 * s;
                                        var dy2 = (_iy2 - _iy1) / 2 * s;
                                        _tf.initForPoints(_x1, _y1, _x2, _y2, ix - dx2, iy - dy2, ix + dx2, iy + dy2);
                                        _tf.transformInverse(0, 0, _p);
                                        _bounds.x1 = _p.x;
                                        _bounds.y1 = _p.y;
                                        _tf.transformInverse(_cont.width(), _cont.height(), _p);
                                        _bounds.x2 = _p.x;
                                        _bounds.y2 = _p.y;
                                    }
                                }
                                break;
                            default:
                                _id1 = undefined;
                                _x1 = undefined;
                                _y1 = undefined;
                                _ix1 = undefined;
                                _iy1 = undefined;
                                _id2 = undefined;
                                _x2 = undefined;
                                _y2 = undefined;
                                _ix2 = undefined;
                                _iy2 = undefined;
                                delete that._hmi_event;
                                break;
                        }
                    }
                    break;
                case TOUCHEVENT_TOUCHEND:
                    _mouse = false;
                    if (tt) {
                        switch (tt.length) {
                            case 1:
                                that._hmi_event = i_event;
                                var t = tt[0];
                                _id1 = t.identifier;
                                _ix1 = t.clientX - offs.left;
                                _iy1 = t.clientY - offs.top;
                                _tf.transformInverse(_ix1, _iy1, _p);
                                _x1 = _p.x;
                                _y1 = _p.y;
                                break;
                            default:
                                _id1 = undefined;
                                _x1 = undefined;
                                _y1 = undefined;
                                _ix1 = undefined;
                                _iy1 = undefined;
                                delete that._hmi_event;
                                break;
                        }
                        _id2 = undefined;
                        _x2 = undefined;
                        _y2 = undefined;
                    }
                    break;
                case TOUCHEVENT_TOUCHENTER:
                    _mouse = false;
                    break;
                case TOUCHEVENT_TOUCHLEAVE:
                case TOUCHEVENT_TOUCHCANCEL:
                    _mouse = false;
                    _id1 = undefined;
                    _x1 = undefined;
                    _y1 = undefined;
                    _ix1 = undefined;
                    _iy1 = undefined;
                    _id2 = undefined;
                    _x2 = undefined;
                    _y2 = undefined;
                    _ix2 = undefined;
                    _iy2 = undefined;
                    delete that._hmi_event;
                    break;
                default:
                    _mouse = false;
                    break;
            }
        };
        this._hmi_destroys.push(function () {
            delete that._hmi_handleZoomEvent;
            delete that._hmi_event;
            delete that._hmi_rotated;
            _bounds = undefined;
            _p = undefined;
            _cont = undefined;
            _ctx = undefined;
            _tf = undefined;
            _id1 = undefined;
            _x1 = undefined;
            _y1 = undefined;
            _ix1 = undefined;
            _iy1 = undefined;
            _id2 = undefined;
            _x2 = undefined;
            _y2 = undefined;
            _ix2 = undefined;
            _iy2 = undefined;
            _di = undefined;
            _mouse = undefined;
            that = undefined;
        });
    };

    var REQUIRED_CONTEXT2D_METHODS = ['save', 'restore', 'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'stroke', 'fill', 'translate', 'rotate', 'scale', 'arc', 'rect', 'fillText', 'strokeText', 'drawImage'];
    function is_valid_context2d(i_context) {
        for (var i = 0; i < REQUIRED_CONTEXT2D_METHODS.length; i++) {
            if (typeof i_context[REQUIRED_CONTEXT2D_METHODS[i]] !== 'function') {
                return REQUIRED_CONTEXT2D_METHODS[i];
            }
        }
        return true;
    };

    /**
     * <code> compare(1,2)
     * 2 \ 1 |  f  |  l  |  b
     * ------+-----+-----+------
     *     f | 0 #1|-1 #4|-1 #7
     *     l | 1 #2| X #5|-1 #8
     *     b | 1 #3| 1 #6| 0 #9
     * </code>
     */
    function compare_graphic_object_layer(i_object1, i_object2, i_mirror) {
        var z1 = i_object1._hmi_z;
        var z2 = i_object2._hmi_z;
        if (z1 === 'foreground') {
            // #1 or #2/#3
            return z2 === 'foreground' ? Sorting.EQUAL : Sorting.BIGGER;
        }
        else if (z1 === 'background') {
            // #9 or #7/#8
            return z2 === 'background' ? Sorting.EQUAL : Sorting.SMALLER;
        }
        else {
            if (z2 === 'foreground') {
                // #4
                return Sorting.SMALLER;
            }
            else if (z2 === 'background') {
                // #6
                return Sorting.BIGGER;
            }
            else {
                // #5
                if (typeof z1 === 'number') {
                    var res = Sorting.compareNumber(z1, typeof z2 === 'number' ? z2 : 0);
                    return i_mirror ? -res : res;
                }
                else if (typeof z2 === 'number') {
                    res = Sorting.compareNumber(0, z2);
                    return i_mirror ? -res : res;
                }
                else {
                    return Sorting.EQUAL;
                }
            }
        }
    };

    // graph types
    var ARC = 1;
    var RECT = 2;
    var IMAGE = 3;
    var TEXT = 4;
    var PATH = 5;
    var CURVE = 6;

    var EVENT_CROSS_SIZE = 20;
    function stroke_cross(i_context, i_x, i_y) {
        i_context.beginPath();
        i_context.moveTo(i_x - EVENT_CROSS_SIZE, i_y - EVENT_CROSS_SIZE);
        i_context.lineTo(i_x + EVENT_CROSS_SIZE, i_y + EVENT_CROSS_SIZE);
        i_context.moveTo(i_x - EVENT_CROSS_SIZE, i_y + EVENT_CROSS_SIZE);
        i_context.lineTo(i_x + EVENT_CROSS_SIZE, i_y - EVENT_CROSS_SIZE);
        i_context.stroke();
    };

    function update_bounds(i_bounds, i_x, i_y) {
        // get the current bound values
        var x1 = i_bounds.x1, y1 = i_bounds.y1, x2 = i_bounds.x2, y2 = i_bounds.y2;
        if (x1 === undefined || i_x < x1) {
            i_bounds.x1 = i_x;
        }
        if (y1 === undefined || i_y < y1) {
            i_bounds.y1 = i_y;
        }
        if (x2 === undefined || i_x > x2) {
            i_bounds.x2 = i_x;
        }
        if (y2 === undefined || i_y > y2) {
            i_bounds.y2 = i_y;
        }
    };

    var s_bounds_transform = new Transform();

    var s_layouts_regex = {
        finalNullRequired: false,
        first: /\b(?:top|bottom|left|right)\b/g,
        next: {
            'top': /\b(?:left|right)\b/g,
            'bottom': /\b(?:left|right)\b/g,
            'left': /\b(?:top|bottom)\b/g,
            'right': /\b(?:top|bottom)\b/g,
        },
        convertMatchToId: function (i_id) {
            return i_id;
        }
    };
    var s_layout_parts = [];

    function layout_children(i_children, i_layout, i_separator) {
        // check for layout rules
        var layout = i_layout && typeof i_layout === 'string' && i_layout.length > 0 ? i_layout : '';
        s_layout_parts.splice(0, s_layout_parts.length);
        regex_analyse(s_layouts_regex, layout, s_layout_parts);
        var first = s_layout_parts[0], second = s_layout_parts[1];
        // default for first rule is vertical
        var vertical1 = !first || /^(?:top|bottom)$/.test(first);
        // default for first rule in vertical mode is decreasing but in horizontal
        // mode it is increasing
        var inc1 = first ? (vertical1 ? /^bottom$/.test(first) : /^left$/.test(first)) : (vertical1 ? false : true);
        // default for second rule in vertical mode is increasing but in horizontal
        // mode it is decreasing
        var inc2 = second ? (vertical1 ? /^left$/.test(second) : /^bottom$/.test(second)) : (vertical1 ? true : false);
        // get the first and second child attribute names
        var v1 = vertical1 ? 'y' : 'x', v2 = vertical1 ? 'x' : 'y';
        // get the first and second bounds attribute names
        var v11 = v1 + '1', v12 = v1 + '2', v21 = v2 + '1', v22 = v2 + '2';
        // we got to update our childrens layouts and bounds
        var len = i_children.length, i, child, object;
        var sta = 0, end, bounds, cen1, val11, val12, val21, val22, d1, d2, dim1, dim2, d, size, off1 = 0, off2 = 0, size1, size2, val1, val2, min1, max1, dif1;
        // compute the separator
        var sep = typeof i_separator === 'number' && i_separator >= 0.0 ? i_separator : 0.0;
        while (sta < len) {
            // set end to next position and search next new line
            end = sta + 1;
            while (end < len && i_children[end].next !== true) {
                end++;
            }
            // we got to handle the second dimension next
            dim2 = 0;
            cen1 = -1;
            min1 = undefined;
            max1 = undefined;
            // collect some dimension parameters
            for (i = sta; i < end; i++) {
                // get the child and its hmi object bounds
                child = i_children[i];
                object = child.hmi_object;
                if (child !== object) {
                    object.hmi_updateBounds();
                    bounds = object.bounds;
                    val11 = bounds[v11];
                    val12 = bounds[v12];
                    val21 = bounds[v21];
                    val22 = bounds[v22];
                    if (typeof val11 === 'number' && typeof val12 === 'number' && typeof val21 === 'number' && typeof val22 === 'number') {
                        bounds._hmi_valid = true;
                        // compute the dimension
                        d1 = val12 - val11;
                        d2 = val22 - val21;
                        // store temporary
                        bounds._hmi_d1 = d1;
                        bounds._hmi_d2 = d2;
                        // for the first dimension we are interested in min and max
                        if (child.align2 === true) {
                            val2 = val12;
                            val1 = val11;
                        }
                        else {
                            val2 = d1 / 2;
                            val1 = -val2;
                        }
                        if (max1 === undefined || val2 > max1) {
                            max1 = val2;
                        }
                        if (min1 === undefined || val1 < min1) {
                            min1 = val1;
                        }
                        // for the second dimension we accumulate all
                        if (dim2 > 0.0) {
                            dim2 += sep;
                        }
                        dim2 += d2;
                        // check for first center
                        if (cen1 === -1 && child.align1 === true) {
                            cen1 = i;
                        }
                    }
                }
            }
            if (max1 !== undefined && min1 !== undefined) {
                // if we got a center element this defines coordinate offset
                if (cen1 !== -1) {
                    child = i_children[cen1];
                    object = child.hmi_object;
                    bounds = object.bounds;
                    if (child !== object && bounds._hmi_valid === true) {
                        if (inc2) {
                            off2 = bounds[v21];
                            for (i = cen1 - 1; i >= sta; i--) {
                                child = i_children[i];
                                object = child.hmi_object;
                                bounds = object.bounds;
                                if (child !== object && bounds._hmi_valid === true) {
                                    if (i > sta) {
                                        off2 -= sep;
                                    }
                                    off2 -= bounds._hmi_d2;
                                }
                            }
                        }
                        else {
                            off2 = bounds[v22];
                            for (i = cen1 + 1; i < end; i++) {
                                child = i_children[i];
                                object = child.hmi_object;
                                bounds = object.bounds;
                                if (child !== object && bounds._hmi_valid === true) {
                                    if (i < end - 1) {
                                        off2 += sep;
                                    }
                                    off2 += bounds._hmi_d2;
                                }
                            }
                        }
                    }
                }
                // no explicit center means we center the whole row
                else {
                    off2 = (inc2 ? -dim2 : dim2) / 2;
                }
                dif1 = max1 - min1;
                off1 += inc1 ? -min1 : -max1;
                // write locations
                for (i = sta; i < end; i++) {
                    child = i_children[i];
                    object = child.hmi_object;
                    bounds = object.bounds;
                    if (child !== object && bounds._hmi_valid === true) {
                        if (child.align2 === true) {
                            child[v1] = off1;
                        }
                        else {
                            d1 = bounds._hmi_d1;
                            child[v1] = off1 + bounds._hmi_d1 / 2 - bounds[v12];
                        }
                        if (i > sta) {
                            off2 += inc2 ? sep : -sep;
                        }
                        child[v2] = inc2 ? off2 - bounds[v21] : off2 - bounds[v22];
                        off2 += inc2 ? bounds._hmi_d2 : -bounds._hmi_d2;
                        delete bounds._hmi_d1;
                        delete bounds._hmi_d2;
                        delete bounds._hmi_valid;
                    }
                }
                off1 += inc1 ? max1 : min1;
                off1 += inc1 ? sep : -sep;
            }
            sta = end;
        }
    };

    function GraphicObjectImpl(i_context, i_disableVisuEvents, i_enableEditorEvents, i_success, i_error) {
        var that = this;
        this._hmi_graphics = true;
        this._hmi_isButton = typeof this.pressed === 'function';
        // here we store some internal data for performance reasons
        var _children = undefined;
        var _curves = undefined;
        var event = undefined;
        var clicked = undefined;
        var _p = {};
        var _cont = this._hmi_context.container;
        var _ctx = this._hmi_context.context2d;
        var _tf = this._hmi_context.transform;
        if (_ctx === undefined) {
            DefaultHtmlObjectImpl.call(that);
            // no context so far so we are the root object
            this._hmi_graphicsRoot = true;
            /*
             * We need only one single canvas to draw our whole graphical objects
             * tree. Within the next lines we create the canvas, store the context and
             * create and store the base transform.
             */
            _cont.addClass('overflow-hidden');
            var width = Math.floor(_cont.width());
            var height = Math.floor(_cont.height());
            this._hmi_canvas = $('<canvas width="' + width + '" height="' + height + '" />');
            this._hmi_canvas.appendTo(_cont);
            _ctx = this._hmi_canvas[0].getContext('2d');
            this._hmi_context.context2d = _ctx;
            this._hmi_validContext2d = is_valid_context2d(_ctx);
            // if valid
            if (this._hmi_validContext2d === true) {
                _ctx.save();
                _tf = new Transform();
                this._hmi_context.transform = _tf;
                _tf.initForBounds(that.bounds, width, height, that.mirrorX === true, that.mirrorY !== false);
                // here we store our visible and paintable objects during repaint
                this._hmi_canvasElements = [];
                // handle resize
                this._hmi_resizes.push(function () {
                    // just resize the canvas (the repaint will be performed anyway at
                    // refresh calls)
                    var width = _cont.width();
                    var height = _cont.height();
                    if (width > 0 && height > 0) {
                        var canvas = that._hmi_canvas[0];
                        canvas.width = Math.floor(width);
                        canvas.height = Math.floor(height);
                    }
                });
                var _white = true;
                // handle refresh
                this._hmi_refreshs.push(function (i_date) {
                    /*
                     * This is the repaint function for the whole canvas object tree.
                     * 
                     * The framework calls this function after the optional configuration
                     * objects refresh method has been called.
                     * 
                     * The following operations will be performed in this order: 1.
                     * Initialize base coordinate transformation to transform between the
                     * given bounds and our canvas. The default canvas origin is top left
                     * but we want a kartesian coordinate system so we mirror y if not
                     * defined. Update curve coordinates as well if available. 2. Handle
                     * moving vehicles 3. Clear canvas elements array first and then
                     * iterate recursively from root to all leafs thru our whole graphic
                     * objects tree and collect all visible and paintable objects sorted
                     * by the z-coordinate value (representing a virtual layer). If a
                     * transform must be updated this will be done as well. 4. Finally we
                     * reset the canvas context and paint all collected graphic objects on
                     * our canvas.
                     */
                    var width = _cont.width();
                    var height = _cont.height();
                    // if repaint is required and we are visible
                    if (width > 0 && height > 0) {
                        // initialize base transform [1]
                        if (that._hmi_rotated !== true) {
                            _tf.initForBounds(that.bounds, width, height, that.mirrorX === true, that.mirrorY !== false);
                        }
                        // handle curves if available
                        if (_curves) {
                            for (var i = 0; i < _curves.length; i++) {
                                var curve = _curves[i];
                                var cu = curve._hmi_curveImpl;
                                if (cu && cu.adjust) {
                                    cu.adjust();
                                }
                            }
                        }
                        // moving vehicles [2]
                        processObjectSubTree(that, true, function (i_hmiObject) {
                            // this is our valid? call
                            return _ctx === i_hmiObject._hmi_context.context2d;
                        }, function (i_hmiObject) {
                            var vps = i_hmiObject._hmi_vps;
                            var segments = i_hmiObject._hmi_segments;
                            var id = i_hmiObject.id;
                            delete i_hmiObject.hmi_vehicleSegment;
                            delete i_hmiObject.hmi_vehiclePosition;
                            delete i_hmiObject.hmi_vehiclePositionAdjusted;
                            if (vps && segments && id !== undefined) {
                                var visible = false;
                                if (vps.hmi_getLocation(id, _p)) {
                                    var seg_idx = _p.segment;
                                    var seg = seg_idx >= 0 && seg_idx < segments.length ? segments[seg_idx] : undefined;
                                    if (seg) {
                                        var cursec = seg._hmi_curveSection;
                                        var posadj = seg._hmi_positionAdjuster;
                                        if (cursec && posadj) {
                                            // get the raw position
                                            var rawpos = _p.position;
                                            // if we got an offset we add it to our raw position
                                            var vps_offset = i_hmiObject.vps_offset;
                                            if (typeof vps_offset === 'number') {
                                                rawpos += vps_offset;
                                            }
                                            // get the vehicle position
                                            var vhpos = posadj.adjust(rawpos);
                                            // if stress is required and we got a stressable rope
                                            // curve we update out stress position
                                            var curve = seg._hmi_curve;
                                            if (i_hmiObject.stress === true && curve && curve.setVehiclePosition) {
                                                // update vehicle position
                                                curve.setVehiclePosition(cursec.fromSectionToCurve(vhpos));
                                            }
                                            // if we found a segment we update out vehicle locator
                                            // (i_hmiObject.hmi_locator) for the vehicle position on
                                            // the found segment
                                            cursec.transform(vhpos, undefined, i_hmiObject.hmi_locator);
                                            i_hmiObject.hmi_vehicleSegment = seg_idx;
                                            i_hmiObject.hmi_vehiclePosition = rawpos;
                                            i_hmiObject.hmi_vehiclePositionAdjusted = vhpos;
                                            i_hmiObject._hmi_vehicleCurveSection = cursec;
                                            i_hmiObject._hmi_vehiclePositionAdjuster = posadj;
                                            visible = true;
                                        }
                                    }
                                }
                                i_hmiObject.hmi_setVisible(visible);
                            }
                        });
                        // collect and update [3]
                        var elems = that._hmi_canvasElements;
                        elems.splice(0, elems.length);
                        processObjectSubTree(that, true, function (i_hmiObject) {
                            // this is our valid? call
                            return _ctx === i_hmiObject._hmi_context.context2d;
                        }, function (i_hmiObject) {
                            if (i_hmiObject._hmi_updateChildrenTransforms) {
                                i_hmiObject._hmi_updateChildrenTransforms();
                            }
                            if (i_hmiObject._hmi_repaint) {
                                var obj = i_hmiObject;
                                var visible = obj._hmi_visible;
                                while (visible && obj._hmi_graphicsRoot !== true) {
                                    obj = obj.hmi_parentObject;
                                    visible = obj._hmi_visible;
                                }
                                if (visible) {
                                    i_hmiObject._hmi_z = get_canvas_attribute(i_hmiObject, 'z');
                                    var idx = Sorting.getInsertionIndex(i_hmiObject, elems, false, function (i_object1, i_object2) {
                                        return compare_graphic_object_layer(i_object1, i_object2, that.mirrorZ === true);
                                    });
                                    elems.splice(idx, 0, i_hmiObject);
                                }
                            }
                        });
                        // paint [4]
                        _ctx.setTransform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                        _ctx.clearRect(0, 0, width, height);
                        _ctx.save();
                        for (var i = 0; i < elems.length; i++) {
                            elems[i]._hmi_repaint(i_date);
                        }
                        // if editor
                        if (i_disableVisuEvents === true && that._hmi_mouseMoveX !== undefined && that._hmi_mouseMoveY !== undefined) {
                            var x = that._hmi_mouseMoveX;
                            var y = that._hmi_mouseMoveY;
                            for (var i = 0; i < elems.length; i++) {
                                var e = elems[i];
                                if (e._hmi_isPointOnObject && e._hmi_repaint) {
                                    var result = e._hmi_isPointOnObject(x, y);
                                    if (result) {
                                        // console.log('IN');
                                        e._hmi_repaint(i_date);
                                    }
                                }
                            }
                        }
                        var evt = that._hmi_event;
                        if (evt) {
                            // draw mouse or touch points
                            _ctx.lineWidth = 1;
                            _ctx.strokeStyle = _white ? 'white' : 'black';
                            _white = _white === false;
                            var offs = _cont.offset();
                            var tt = evt.originalEvent ? evt.originalEvent.targetTouches : undefined;
                            if (tt) {
                                for (var i = 0; i < tt.length; i++) {
                                    var t = tt[i];
                                    stroke_cross(_ctx, t.clientX - offs.left, t.clientY - offs.top);
                                }
                            }
                            else {
                                var x = evt.clientX - offs.left;
                                var y = evt.clientY - offs.top;
                                stroke_cross(_ctx, evt.clientX - offs.left, evt.clientY - offs.top);
                            }
                        }
                        else {
                            _white = true;
                        }
                        _ctx.restore();
                    }
                });
                if (this.zoom === true && this.bounds !== null && typeof this.bounds === 'object') {
                    ZoomImpl.call(this, i_disableVisuEvents, i_enableEditorEvents);
                }
                // TODO make this running
                if (false && i_disableVisuEvents === true) {
                    // TODO why do we have to copy this reference???
                    var container = _cont;
                    function on_mouse_move(i_event) {
                        // var rect = that._hmi_canvas.getBoundingClientRect();
                        var rect = container.offset();
                        that._hmi_mouseMoveX = i_event.clientX - rect.left;
                        that._hmi_mouseMoveY = i_event.clientY - rect.top;
                    };
                    container.on('mousemove', on_mouse_move);
                    this._hmi_destroys.push(function () {
                        container.off('mousemove', on_mouse_move);
                        on_mouse_move = undefined;
                    });
                }
                clicked = function (i_event, i_x, i_y) {
                    var search = true;
                    _ctx.setTransform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                    _ctx.save();
                    processObjectSubTree(that, true, function (i_hmiObject) {
                        // this is our valid? call
                        return search && _ctx === i_hmiObject._hmi_context.context2d;
                    }, function (i_hmiObject) {
                        if (search && i_hmiObject._hmi_isButton && _ctx === i_hmiObject._hmi_context.context2d && i_hmiObject._hmi_isPointOnObject) {
                            var obj = i_hmiObject;
                            var visible = obj._hmi_visible;
                            while (visible && obj._hmi_graphicsRoot !== true) {
                                obj = obj.hmi_parentObject;
                                visible = obj._hmi_visible;
                            }
                            if (visible) {
                                if (i_hmiObject._hmi_isPointOnObject(i_x, i_y)) {
                                    search = false;
                                    try {
                                        i_hmiObject.pressed(i_event);
                                    }
                                    catch (exc) {
                                        console.error('EXCEPTION! Calling pressed(): ' + exc + ' ' + i_hmiObject.pressed.toString());
                                    }
                                }
                            }
                        }
                    });
                    _ctx.restore();
                };
                event = function (i_event, i_type) {
                    switch (i_type) {
                        case MOUSEEVENT_MOUSEDOWN:
                            var offs = _cont.offset();
                            clicked(i_event, i_event.clientX - offs.left, i_event.clientY - offs.top);
                            break;
                        case TOUCHEVENT_TOUCHSTART:
                            var offs = _cont.offset();
                            var tt = i_event.originalEvent ? i_event.originalEvent.targetTouches : undefined;
                            if (tt && tt[0]) {
                                clicked(i_event, tt[0].clientX - offs.left, tt[0].clientY - offs.top);
                            }
                            break;
                        case MOUSEEVENT_CLICK:
                        case MOUSEEVENT_DBLCLICK:
                        case MOUSEEVENT_HOVER:
                        case MOUSEEVENT_MOUSEENTER:
                        case MOUSEEVENT_MOUSELEAVE:
                        case MOUSEEVENT_MOUSEMOVE:
                        case MOUSEEVENT_MOUSEOUT:
                        case MOUSEEVENT_MOUSEOVER:
                        case MOUSEEVENT_MOUSEUP:
                        case MOUSEEVENT_CONTEXTMENU:
                        case MOUSEEVENT_MOUSEWHEEL:
                        case TOUCHEVENT_TOUCHENTER:
                        case TOUCHEVENT_TOUCHMOVE:
                        case TOUCHEVENT_TOUCHEND:
                        case TOUCHEVENT_TOUCHLEAVE:
                        case TOUCHEVENT_TOUCHCANCEL:
                        default:
                            break;
                    }
                    if (that._hmi_handleZoomEvent) {
                        that._hmi_handleZoomEvent(i_event, i_type);
                    }
                };
                EventListener.call(that, i_context, event);
            }
            else {
                this._hmi_canvas.remove();
                var div = '<div style="box-sizing: border-box;position: relative;width: 100%;height: 100%;"><h1>';
                div += '!!! INVALID CANVAS CONTEXT 2D !!!';
                div += '</h1><br><b>';
                div += 'Your browser does not support the required canvas rendering context methods!';
                div += '</b><br><br>Developer information:<br>first missing: canvas.context2d.';
                div += this._hmi_validContext2d;
                div += '()</div>';
                $(div).appendTo(_cont);
            }
        }
        else {
            this.hmi_setVisible = function (i_visible) {
                that._hmi_visible = i_visible === true;
            };
            this.hmi_isVisible = function () {
                return that._hmi_visible;
            };
        }
        this.hmi_setImageSource = function (i_source, i_callback) {
            that.image = i_source;
            if (that._hmi_image === undefined) {
                that._hmi_image = new Image();
            }
            that._hmi_image.onload = i_callback;
            that._hmi_image.src = i_source;
        };
        this.hmi_getImageWidth = function () {
            var img = that._hmi_image;
            return img !== undefined ? img.naturalWidth : undefined;
        };
        this.hmi_getImageHeight = function () {
            var img = that._hmi_image;
            return img !== undefined ? img.naturalHeight : undefined;
        };
        var tasks = [];
        if (typeof that.image === 'string') {
            tasks.push(function (i_suc, i_err) {
                that.hmi_setImageSource(that.image, i_suc, i_err);
            });
        }
        this.hmi_text = function (i_text) {
            if (i_text !== undefined && i_text !== null) {
                that.text = typeof i_text === 'string' ? i_text : i_text.toString();
            }
            else {
                return that.text;
            }
        };
        this.hmi_getGraphTextSize = function (i_config, i_text, i_result) {
            var result = i_result || {};
            _ctx.save();
            var scale = _tf.scale;
            var fontSize = get_canvas_pixel(i_config, 'fontSize', scale);
            if (typeof fontSize !== 'number') {
                fontSize = 10;
            }
            var font = i_config.bold === true ? 'bold ' : '';
            font += Math.ceil(fontSize);
            font += 'px';
            var fontFamily = get_canvas_attribute(i_config, 'fontFamily');
            font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
            _ctx.font = font;
            if (Array.isArray(i_text)) {
                var width = 0.0;
                for (var i = 0; i < i_text.length; i++) {
                    var txt = i_text[i];
                    if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                        txt = txt.toString();
                    }
                    width = Math.max(width, _ctx.measureText(txt).width);
                }
                result.width = width / scale;
                result.height = i_text.length * fontSize / scale;
            }
            else {
                var txt = i_text;
                if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                    txt = txt.toString();
                }
                result.width = _ctx.measureText(txt).width / scale;
                result.height = fontSize / scale;
            }
            _ctx.restore();
            return result;
        };

        this._hmi_repaint = function (i_date) {
            // The following function paints the current object on our
            // canvas using our coordinate system transform.
            // To perform fast we try to find out if anything must be
            // painted (or not) as soon as possible.
            var paint = that.paint;
            if (typeof paint === 'function') {
                try {
                    paint.call(that, i_date);
                    return true;
                }
                catch (exc) {
                    console.error('EXCEPTION! Calling paint(): ' + exc + ' ' + paint.toString());
                    return false;
                }
            }
            // get some parameters
            var scale = _tf.scale;
            var r = that.r;
            var w = that.width;
            var h = that.height;
            var text = that.text;
            var fontSize = undefined;
            var points = that.points;
            var type = undefined;
            var img = that._hmi_image;
            var curve = that._hmi_curve;
            var from = that.hmi_from;
            var to = that.hmi_to;
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // In the next blocks we update some values and try to find out what we
            // are (arc, text, rect, image or path) and if we are visible
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            if (r !== undefined) {
                r = get_pixel_size(r, scale);
                if (typeof r !== 'number' || r <= 0.5) {
                    return false;
                }
                type = ARC;
            }
            else if (w !== undefined && h !== undefined) {
                w = get_pixel_size(w, scale);
                h = get_pixel_size(h, scale);
                if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                    return false;
                }
                if (img !== undefined) {
                    if (typeof img.naturalWidth !== 'number' || img.naturalWidth <= 1 || typeof img.naturalHeight !== 'number' || img.naturalHeight <= 1) {
                        return false;
                    }
                    type = IMAGE;
                }
                else {
                    type = RECT;
                }
            }
            else if (w !== undefined && img !== undefined) {
                w = get_pixel_size(w, scale);
                if (typeof w !== 'number' || w < 0.5) {
                    return false;
                }
                h = Math.floor(w * img.naturalHeight / img.naturalWidth);
                w = Math.floor(w);
                type = IMAGE;
            }
            else if (h !== undefined && img !== undefined) {
                h = get_pixel_size(h, scale);
                if (typeof h !== 'number' || h < 0.5) {
                    return false;
                }
                w = Math.floor(h * img.naturalWidth / img.naturalHeight);
                h = Math.floor(h);
                type = IMAGE;
            }
            else if (text !== undefined) {
                fontSize = get_canvas_pixel(that, 'fontSize', scale);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                }
                else if (fontSize < 2) {
                    return false;
                }
                type = TEXT;
            }
            else if (Array.isArray(points) && points.length >= 2) {
                type = PATH;
            }
            else if (curve && curve.stroke && typeof from === 'number' && typeof to === 'number') {
                type = CURVE;
            }
            else if (img) {
                w = img.naturalWidth;
                h = img.naturalHeight;
                type = IMAGE;
            }
            if (type === undefined) {
                return false;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // rotate origin for rectangle (round or not), image or text
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var x = that.x;
            if (typeof x !== 'number') {
                x = 0.0;
            }
            var y = that.y;
            if (typeof y !== 'number') {
                y = 0.0;
            }
            _tf.transform(x, y, _p);
            var ox = _p.x;
            var oy = _p.y;
            var mx = _tf.mirrorX;
            var my = _tf.mirrorY;
            var tfrot = _tf.rotation;
            _ctx.save();
            switch (type) {
                case IMAGE:
                case RECT:
                case TEXT:
                    var sc = that.scale;
                    if (typeof sc !== 'number') {
                        sc = 1.0;
                    }
                    var phi = that.phi;
                    var angle = that.angle;
                    if (typeof phi === 'number') {
                        _ctx.translate(ox, oy);
                        var theta = mx === my ? phi : -phi;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    }
                    else if (typeof angle === 'number') {
                        _ctx.translate(ox, oy);
                        var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    }
                    else if (that.upright !== true) {
                        _ctx.translate(ox, oy);
                        _ctx.rotate(tfrot);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    }
                    break;
                case ARC:
                case PATH:
                case CURVE:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // create path and check dimension
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var closed = that.closed === true;
            switch (type) {
                case ARC:
                    // try to get the angles
                    var phi1 = 0;
                    var phi2 = TWO_PI;
                    if (typeof that.phi1 === 'number' && typeof that.phi2 === 'number') {
                        phi1 = that.phi1;
                        phi2 = that.phi2;
                    }
                    else if (typeof that.angle1 === 'number' && typeof that.angle2 === 'number') {
                        phi1 = that.angle1 * DEG2RAD;
                        phi2 = that.angle2 * DEG2RAD;
                    }
                    if (mx) {
                        phi1 = PI - phi1;
                        phi2 = PI - phi2;
                    }
                    if (my) {
                        phi1 = -phi1;
                        phi2 = -phi2;
                    }
                    // normalize
                    while (phi1 > PI) {
                        phi1 -= TWO_PI;
                        phi2 -= TWO_PI;
                    }
                    while (phi1 <= -PI) {
                        phi1 += TWO_PI;
                        phi2 += TWO_PI;
                    }
                    // create path
                    _ctx.beginPath();
                    _ctx.arc(ox, oy, r, phi1 + tfrot, phi2 + tfrot, mx !== my);
                    break;
                case RECT:
                    _ctx.beginPath();
                    getAlignment(that.align, _p, mx, my);
                    var x = ox - _p.x * w;
                    var y = oy - _p.y * h;
                    var rb = get_canvas_pixel(that, 'roundBorder', scale);
                    if (typeof rb === 'number' && rb > 1.0) {
                        // start 1. round edge
                        var xw = x + w;
                        var xr = xw - rb;
                        _ctx.moveTo(xr, y);
                        var yh = y + h;
                        _ctx.arcTo(xw, y, xw, yh, rb);
                        // 2. round edge
                        _ctx.arcTo(xw, yh, x, yh, rb);
                        // 3. round edge
                        _ctx.arcTo(x, yh, x, y, rb);
                        // 4. round edge
                        _ctx.arcTo(x, y, xr, y, rb);
                        _ctx.closePath();
                    }
                    else {
                        _ctx.rect(x, y, w, h);
                    }
                    break;
                case PATH:
                    _ctx.beginPath();
                    var len = points.length;
                    for (var i = 0; i < len; i++) {
                        var p = points[i];
                        var rad = p.r;
                        _tf.transform(p.x, p.y, _p);
                        var x1 = _p.x;
                        var y1 = _p.y;
                        if (i === 0 || p.move === true) {
                            _ctx.moveTo(x1, y1);
                        }
                        else if (typeof rad === 'number' && rad > 0.0 && (closed ? i < len : i < len - 1)) {
                            var p = points[(i + 1) % len];
                            _tf.transform(p.x, p.y, _p);
                            var x2 = _p.x;
                            var y2 = _p.y;
                            _ctx.arcTo(x1, y1, x2, y2, rad * scale);
                        }
                        else {
                            _ctx.lineTo(x1, y1);
                        }
                    }
                    break;
                case CURVE:
                case TEXT:
                case IMAGE:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // check if stroke is required
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var stroke = false;
            switch (type) {
                case PATH:
                case CURVE:
                    if (typeof that.lineCap === 'string' || typeof that.lineJoin === 'string') {
                        stroke = true;
                        break;
                    }
                case ARC:
                case RECT:
                case TEXT:
                    if (that.stroke === true || isNumberOrPixelValue(that.lineWidth) || typeof that.strokeStyle === 'string') {
                        stroke = true;
                    }
                    break;
                case IMAGE:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // check if fill is required
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var fill = false;
            switch (type) {
                case PATH:
                case CURVE:
                case ARC:
                case RECT:
                case TEXT:
                    if (that.fill === true || typeof that.fillStyle === 'string') {
                        fill = true;
                    }
                    break;
                case IMAGE:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // apply context parameters
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            switch (type) {
                case PATH:
                case CURVE:
                    if (stroke) {
                        var lineCap = get_canvas_attribute(that, 'lineCap');
                        if (typeof lineCap === 'string') {
                            _ctx.lineCap = lineCap;
                        }
                        var lineJoin = get_canvas_attribute(that, 'lineJoin');
                        if (typeof lineJoin === 'string') {
                            _ctx.lineJoin = lineJoin;
                        }
                    }
                    if (fill || closed) {
                        _ctx.closePath();
                    }
                case ARC:
                case RECT:
                case TEXT:
                    if (fill) {
                        var fillStyle = get_canvas_attribute(that, 'fillStyle');
                        if (typeof fillStyle === 'string') {
                            _ctx.fillStyle = fillStyle;
                        }
                    }
                    if (stroke) {
                        var lineWidth = get_canvas_pixel(that, 'lineWidth', scale);
                        if (typeof lineWidth === 'number') {
                            _ctx.lineWidth = lineWidth;
                        }
                        var strokeStyle = get_canvas_attribute(that, 'strokeStyle');
                        if (typeof strokeStyle === 'string') {
                            _ctx.strokeStyle = strokeStyle;
                        }
                    }
                    break;
                case IMAGE:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // perform actual painting
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            switch (type) {
                case CURVE:
                    if (stroke) {
                        var cs = that._hmi_curveSection;
                        var left = 0.0;
                        var l = that.left;
                        if (typeof l === 'number') {
                            left = l;
                        }
                        else {
                            var r = that.right;
                            if (typeof r === 'number') {
                                left = -r;
                            }
                        }
                        curve.stroke(_ctx, _tf, cs.fromSectionToCurve(from), cs.fromSectionToCurve(to), left);
                    }
                    break;
                case PATH:
                case ARC:
                case RECT:
                    if (fill) {
                        _ctx.fill();
                    }
                    if (stroke) {
                        _ctx.stroke();
                    }
                    break;
                case TEXT:
                    if (fill || stroke) {
                        var fontSize = get_canvas_pixel(that, 'fontSize', scale);
                        if (typeof fontSize !== 'number') {
                            fontSize = 10;
                        }
                        var font = that.bold === true ? 'bold ' : '';
                        font += Math.floor(fontSize);
                        font += 'px';
                        var fontFamily = get_canvas_attribute(that, 'fontFamily');
                        font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                        _ctx.font = font;
                        getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                        _ctx.textAlign = 'center';
                        _ctx.textBaseline = 'middle';
                        if (Array.isArray(text)) {
                            var y0 = oy - (_p.y * text.length - 0.5) * fontSize;
                            for (var i = 0; i < text.length; i++) {
                                var txt = text[i];
                                if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                    txt = txt.toString();
                                }
                                var x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                                var y = y0 + i * fontSize;
                                if (fill) {
                                    _ctx.fillText(txt, x, y);
                                }
                                if (stroke) {
                                    _ctx.strokeText(txt, x, y);
                                }
                            }
                        }
                        else {
                            var txt = text;
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            var x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                            var y = oy - (_p.y - 0.5) * fontSize;
                            if (fill) {
                                _ctx.fillText(txt, x, y);
                            }
                            if (stroke) {
                                _ctx.strokeText(txt, x, y);
                            }
                        }
                    }
                    break;
                case IMAGE:
                    getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                    var x = ox - _p.x * w;
                    var y = oy - _p.y * h;
                    _ctx.globalAlpha = typeof that.alpha === 'number' ? Math.max(Math.min(that.alpha, 1.0), 0.0) : 1.0; // 0 == transparent .. 1 == full
                    _ctx.drawImage(img, x, y, w, h);
                    break;
                default:
                    break;
            }
            // done
            _ctx.restore();
            return true;
        };

        this._hmi_isPointOnObject = function (i_pixelX, i_pixelY) {
            var paint = that.paint;
            if (typeof paint === 'function') {
                return false;
            }
            var scale = _tf.scale;
            var r = that.r;
            var w = that.width;
            var h = that.height;
            var text = that.text;
            var fontSize = undefined;
            var points = that.points;
            var type = undefined;
            var img = that._hmi_image;
            var curve = that._hmi_curve;

            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // In the next blocks we update some values and try to find out what we
            // are and if we are visible
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            if (r !== undefined) {
                r = get_pixel_size(r, scale);
                if (typeof r !== 'number' || r <= 0.5) {
                    return false;
                }
                type = ARC;
            }
            else if (w !== undefined && h !== undefined) {
                w = get_pixel_size(w, scale);
                h = get_pixel_size(h, scale);
                if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                    return false;
                }
                if (img !== undefined) {
                    if (typeof img.naturalWidth !== 'number' || img.naturalWidth <= 1 || typeof img.naturalHeight !== 'number' || img.naturalHeight <= 1) {
                        return false;
                    }
                    type = IMAGE;
                }
                else {
                    type = RECT;
                }
            }
            else if (w !== undefined && img !== undefined) {
                w = get_pixel_size(w, scale);
                if (typeof w !== 'number' || w < 0.5) {
                    return false;
                }
                h = Math.floor(w * img.naturalHeight / img.naturalWidth);
                w = Math.floor(w);
                type = IMAGE;
            }
            else if (h !== undefined && img !== undefined) {
                h = get_pixel_size(h, scale);
                if (typeof h !== 'number' || h < 0.5) {
                    return false;
                }
                w = Math.floor(h * img.naturalWidth / img.naturalHeight);
                h = Math.floor(h);
                type = IMAGE;
            }
            else if (text !== undefined) {
                fontSize = get_canvas_pixel(that, 'fontSize', scale);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                }
                else if (fontSize < 5) {
                    return false;
                }
                type = TEXT;
            }
            else if (Array.isArray(points) && points.length >= 2) {
                type = PATH;
            }
            else if (curve) {
                type = CURVE;
            }
            else if (img) {
                w = img.naturalWidth;
                h = img.naturalHeight;
                type = IMAGE;
            }
            if (type === undefined) {
                return false;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // rotate origin for rectangle (round or not), image or text
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var x = that.x;
            if (typeof x !== 'number') {
                x = 0.0;
            }
            var y = that.y;
            if (typeof y !== 'number') {
                y = 0.0;
            }
            _tf.transform(x, y, _p);
            var ox = _p.x;
            var oy = _p.y;
            var mx = _tf.mirrorX;
            var my = _tf.mirrorY;
            var tfrot = _tf.rotation;
            _ctx.save();
            switch (type) {
                case TEXT:
                case IMAGE:
                case RECT:
                    var sc = that.scale;
                    if (typeof sc !== 'number') {
                        sc = 1.0;
                    }
                    var phi = that.phi;
                    var angle = that.angle;
                    if (typeof phi === 'number') {
                        _ctx.translate(ox, oy);
                        var theta = mx === my ? phi : -phi;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    }
                    else if (typeof angle === 'number') {
                        _ctx.translate(ox, oy);
                        var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    }
                    else if (that.upright !== true) {
                        _ctx.translate(ox, oy);
                        _ctx.rotate(tfrot);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    }
                    break;
                case PATH:
                case CURVE:
                case ARC:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // create path and check dimension
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var closed = that.closed === true;
            switch (type) {
                case ARC:
                    // try to get the angles
                    var phi1 = 0;
                    var phi2 = TWO_PI;
                    if (typeof that.phi1 === 'number' && typeof that.phi2 === 'number') {
                        phi1 = that.phi1;
                        phi2 = that.phi2;
                    }
                    else if (typeof that.angle1 === 'number' && typeof that.angle2 === 'number') {
                        phi1 = that.angle1 * DEG2RAD;
                        phi2 = that.angle2 * DEG2RAD;
                    }
                    if (mx) {
                        phi1 = PI - phi1;
                        phi2 = PI - phi2;
                    }
                    if (my) {
                        phi1 = -phi1;
                        phi2 = -phi2;
                    }
                    // normalize
                    while (phi1 > PI) {
                        phi1 -= TWO_PI;
                        phi2 -= TWO_PI;
                    }
                    while (phi1 <= -PI) {
                        phi1 += TWO_PI;
                        phi2 += TWO_PI;
                    }
                    // create path
                    _ctx.beginPath();
                    _ctx.arc(ox, oy, r, phi1 + tfrot, phi2 + tfrot, mx !== my);
                    break;
                case RECT:
                    _ctx.beginPath();
                    getAlignment(that.align, _p, mx, my);
                    var x = ox - _p.x * w;
                    var y = oy - _p.y * h;
                    var rb = get_canvas_pixel(that, 'roundBorder', scale);
                    if (typeof rb === 'number' && rb > 1.0) {
                        // start 1. round edge
                        var xw = x + w;
                        var xr = xw - rb;
                        _ctx.moveTo(xr, y);
                        var yh = y + h;
                        _ctx.arcTo(xw, y, xw, yh, rb);
                        // 2. round edge
                        _ctx.arcTo(xw, yh, x, yh, rb);
                        // 3. round edge
                        _ctx.arcTo(x, yh, x, y, rb);
                        // 4. round edge
                        _ctx.arcTo(x, y, xr, y, rb);
                        _ctx.closePath();
                    }
                    else {
                        _ctx.rect(x, y, w, h);
                    }
                    break;
                case PATH:
                    _ctx.beginPath();
                    var len = points.length;
                    for (var i = 0; i < len; i++) {
                        var p = points[i];
                        _tf.transform(p.x, p.y, _p);
                        var x1 = _p.x;
                        var y1 = _p.y;
                        if (i === 0 || p.move === true) {
                            _ctx.moveTo(x1, y1);
                        }
                        else if (typeof rad === 'number' && rad > 0.0 && (closed ? i < len : i < len - 1)) {
                            var p = points[i + 1];
                            _tf.transform(p.x, p.y, _p);
                            var x2 = _p.x;
                            var y2 = _p.y;
                            _ctx.arcTo(x1, y1, x2, y2, p.r * scale);
                        }
                        else {
                            _ctx.lineTo(x1, y1);
                        }
                    }
                    break;
                case CURVE:
                    if (stroke) {
                        // TODO implement
                    }
                    break;
                case TEXT:
                    var fontSize = get_canvas_pixel(that, 'fontSize', scale);
                    if (typeof fontSize !== 'number') {
                        fontSize = 10;
                    }
                    var font = that.bold === true ? 'bold ' : '';
                    font += Math.ceil(fontSize);
                    font += 'px';
                    var fontFamily = get_canvas_attribute(that, 'fontFamily');
                    font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                    _ctx.font = font;
                    _ctx.beginPath();
                    getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                    // Bugfix #text_click (2016-09-09, Hm)
                    if (Array.isArray(text)) {
                        // #text_click: var y0 = oy - (_p.y * text.length - 0.5) * fontSize;
                        var y0 = oy - _p.y * text.length * fontSize;
                        var x0 = undefined;
                        var x1 = undefined;
                        for (var i = 0; i < text.length; i++) {
                            var txt = text[i];
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            var tw = _ctx.measureText(txt).width;
                            // #text_click: var x = ox - (_p.x - 0.5) * tw;
                            var x = ox - _p.x * tw;
                            if (x0 === undefined || x < x0) {
                                x0 = x;
                            }
                            x += tw;
                            if (x1 === undefined || x > x1) {
                                x1 = x;
                            }
                        }
                        _ctx.rect(x0, y0, x1 - x0, fontSize * text.length);
                    }
                    else {
                        var txt = text;
                        if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                            txt = txt.toString();
                        }
                        var w = _ctx.measureText(text).width;
                        // #text_click: var x = ox - (_p.x - 0.5) * w;
                        var x = ox - _p.x * w;
                        // #text_click: var y = oy - (_p.y - 0.5) * fontSize;
                        var y = oy - _p.y * fontSize;
                        _ctx.rect(x, y, w, fontSize);
                    }
                    break;
                case IMAGE:
                    _ctx.beginPath();
                    getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                    var x = ox - _p.x * w;
                    var y = oy - _p.y * h;
                    _ctx.rect(x, y, w, h);
                    break;
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // check if fill is required
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var fill = false;
            switch (type) {
                case PATH:
                case CURVE:
                case ARC:
                case RECT:
                case TEXT:
                    if (that.fill === true || typeof that.fillStyle === 'string') {
                        fill = true;
                        break;
                    }
                    break;
                case IMAGE:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // apply context parameters
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            switch (type) {
                case PATH:
                case CURVE:
                    if (fill || closed) {
                        _ctx.closePath();
                    }
                    break;
                case ARC:
                case RECT:
                case TEXT:
                case IMAGE:
                default:
                    break;
            }
            // check
            var result = _ctx.isPointInPath(i_pixelX, i_pixelY);
            _ctx.restore();
            return result;
        };

        this.hmi_getBounds = function () { // Note: No not change to lambda function, because 'arguments' will not work anymore!
            var recursive, bounds, arg;
            // try to read from arguments
            for (var i = 0, l = arguments.length; i < l; i++) {
                arg = arguments[i];
                if (recursive === undefined && typeof arg === 'boolean') {
                    recursive = arg;
                }
                else if (bounds === undefined && arg !== null && typeof arg === 'object') {
                    bounds = arg;
                }
            }
            // if no bounds we create them
            if (bounds === undefined) {
                bounds = {};
            }
            // init and get this bounds
            s_bounds_transform.setToIdentity();
            that._hmi_getBounds(s_bounds_transform, bounds, recursive === undefined || recursive === true);
            return bounds;
        };

        this.hmi_updateBounds = function () {
            var bounds = this.bounds;
            if (bounds === null || typeof bounds !== 'object') {
                bounds = {};
                this.bounds = bounds;
            }
            this.hmi_getBounds(bounds, true);
        };

        this._hmi_getBounds = function (i_transform, i_bounds, i_recursive) {
            // delete bounds
            delete i_bounds.x1;
            delete i_bounds.y1;
            delete i_bounds.x2;
            delete i_bounds.y2;
            // if children must be checked too
            if (i_recursive && _children) {
                for (var i = 0; i < _children.length; i++) {
                    var child = _children[i];
                    var hmiobj = child._hmi_object;
                    if (hmiobj && _ctx === hmiobj._hmi_context.context2d && hmiobj._hmi_getBounds) {
                        if (child !== hmiobj) {
                            i_transform.save();
                            i_transform.setToCoordinateTransform(child);
                        }
                        hmiobj._hmi_getBounds(i_transform, _p, true);
                        update_bounds(i_bounds, _p.x1, _p.y1);
                        update_bounds(i_bounds, _p.x2, _p.y2);
                        if (child !== hmiobj) {
                            i_transform.restore();
                        }
                    }
                }
            }
            // now we check our own bounds
            var paint = that.paint;
            if (typeof paint === 'function') {
                return;
            }
            var r = that.r;
            var w = that.width;
            var h = that.height;
            var text = that.text;
            var fontSize = undefined;
            var points = that.points;
            var type = undefined;
            var img = that._hmi_image;
            var curve = that._hmi_curve;

            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // In the next blocks we update some values and try to find out what we
            // are and if we are visible
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            if (r !== undefined) {
                r = get_pixel_size(r, 1.0);
                if (typeof r !== 'number' || r <= 0.0) {
                    return;
                }
                type = ARC;
            }
            else if (w !== undefined && h !== undefined) {
                w = get_pixel_size(w, 1.0);
                h = get_pixel_size(h, 1.0);
                if (typeof w !== 'number' || w <= 0.0 || typeof h !== 'number' || h <= 0.0) {
                    return;
                }
                if (img !== undefined) {
                    if (typeof img.naturalWidth !== 'number' || img.naturalWidth <= 0 || typeof img.naturalHeight !== 'number' || img.naturalHeight <= 0) {
                        return;
                    }
                    type = IMAGE;
                }
                else {
                    type = RECT;
                }
            }
            else if (w !== undefined && img !== undefined) {
                w = get_pixel_size(w, 1.0);
                if (typeof w !== 'number' || w <= 0.0) {
                    return;
                }
                h = w * img.naturalHeight / img.naturalWidth;
                type = IMAGE;
            }
            else if (h !== undefined && img !== undefined) {
                h = get_pixel_size(h, 1.0);
                if (typeof h !== 'number' || h <= 0.0) {
                    return;
                }
                w = h * img.naturalWidth / img.naturalHeight;
                type = IMAGE;
            }
            else if (text !== undefined) {
                fontSize = get_canvas_pixel(that, 'fontSize', 1.0);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                }
                else if (fontSize <= 0) {
                    return;
                }
                type = TEXT;
            }
            else if (Array.isArray(points) && points.length >= 2) {
                type = PATH;
            }
            else if (curve) {
                type = CURVE;
            }
            else if (img) {
                w = img.naturalWidth;
                h = img.naturalHeight;
                type = IMAGE;
            }
            if (type === undefined) {
                return;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // rotate origin for rectangle (round or not), image or text
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            i_transform.save();
            var ox = that.x;
            if (typeof ox !== 'number') {
                ox = 0.0;
            }
            var oy = that.y;
            if (typeof oy !== 'number') {
                oy = 0.0;
            }
            switch (type) {
                case TEXT:
                case IMAGE:
                case RECT:
                    var sc = that.scale;
                    if (typeof sc !== 'number') {
                        sc = 1.0;
                    }
                    var phi = that.phi;
                    var angle = that.angle;
                    if (typeof phi === 'number') {
                        i_transform.translate(ox, oy);
                        i_transform.rotate(phi);
                        i_transform.setScale(sc);
                        i_transform.translate(-ox, -oy);
                    }
                    else if (typeof angle === 'number') {
                        i_transform.translate(ox, oy);
                        i_transform.rotate(angle * DEG2RAD);
                        i_transform.setScale(sc);
                        i_transform.translate(-ox, -oy);
                    }
                    else if (that.upright !== true) {
                        i_transform.translate(ox, oy);
                        i_transform.setScale(sc);
                        i_transform.translate(-ox, -oy);
                    }
                    break;
                case PATH:
                case CURVE:
                case ARC:
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // create path and check dimension
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            var closed = that.closed === true;
            switch (type) {
                case ARC:
                    update_bounds(i_bounds, ox - r, oy - r);
                    update_bounds(i_bounds, ox - r, oy + r);
                    update_bounds(i_bounds, ox + r, oy + r);
                    update_bounds(i_bounds, ox + r, oy - r);
                    break;
                case RECT:
                    getAlignment(that.align, _p, false, false);
                    var x = ox - _p.x * w;
                    var y = oy - _p.y * h;
                    i_transform.transform(x, y, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    i_transform.transform(x + w, y, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    i_transform.transform(x, y + h, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    i_transform.transform(x + w, y + h, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    break;
                case PATH:
                    var len = points.length;
                    for (var i = 0; i < len; i++) {
                        var p = points[i];
                        i_transform.transform(p.x, p.y, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                    }
                    break;
                case CURVE:
                    if (stroke) {
                        // TODO implement
                    }
                    break;
                case TEXT:
                    _ctx.save();
                    var fontSize = get_canvas_pixel(that, 'fontSize', 1.0);
                    if (typeof fontSize !== 'number') {
                        fontSize = 10;
                    }
                    var font = that.bold === true ? 'bold ' : '';
                    font += '100px';
                    var fontFamily = get_canvas_attribute(that, 'fontFamily');
                    font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                    _ctx.font = font;
                    getAlignment(that.align, _p, false, false);
                    if (Array.isArray(text)) {
                        var y0 = oy - _p.y * text.length * fontSize;
                        var x0 = undefined;
                        var x1 = undefined;
                        for (var i = 0; i < text.length; i++) {
                            var txt = text[i];
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            var tw = _ctx.measureText(txt).width / 100 * fontSize;
                            var x = ox - _p.x * tw;
                            if (x0 === undefined || x < x0) {
                                x0 = x;
                            }
                            x += tw;
                            if (x1 === undefined || x > x1) {
                                x1 = x;
                            }
                        }
                        var h = fontSize * text.length;
                        i_transform.transform(x0, y0, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                        i_transform.transform(x1, y0, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                        i_transform.transform(x0, y0 + h, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                        i_transform.transform(x1, y0 + h, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                    }
                    else {
                        var txt = text;
                        if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                            txt = txt.toString();
                        }
                        var w = _ctx.measureText(text).width / 100 * fontSize;
                        var x = ox - _p.x * w;
                        var y = oy - _p.y * fontSize;
                        i_transform.transform(x, y, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                        i_transform.transform(x + w, y, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                        i_transform.transform(x, y + fontSize, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                        i_transform.transform(x + w, y + fontSize, _p);
                        update_bounds(i_bounds, _p.x, _p.y);
                    }
                    _ctx.restore();
                    break;
                case IMAGE:
                    getAlignment(that.align, _p, false, false);
                    var x = ox - _p.x * w;
                    var y = oy - _p.y * h;
                    i_transform.transform(x, y, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    i_transform.transform(x + w, y, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    i_transform.transform(x, y + h, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    i_transform.transform(x + w, y + h, _p);
                    update_bounds(i_bounds, _p.x, _p.y);
                    break;
                default:
                    break;
            }
            i_transform.restore();
        };

        // only if we got a paint method we add the paint functions
        if (typeof this.paint === 'function') {
            this.hmi_context2d = _ctx;
            this.hmi_save = function () {
                return _ctx.save();
            };

            this.hmi_restore = function () {
                return _ctx.restore();
            };

            this.hmi_transform = function (i_config) {
                var x = i_config.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                var y = i_config.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                _tf.transform(x, y, _p);
                var ox = _p.x;
                var oy = _p.y;
                var mx = _tf.mirrorX;
                var my = _tf.mirrorY;
                var tfrot = _tf.rotation;
                var sc = i_config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                var phi = i_config.phi;
                var angle = i_config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? phi : -phi;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (i_config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
            };

            this.hmi_prepareRect = function (i_config) {
                _ctx.beginPath();
                var scale = _tf.scale;
                var w = i_config.width;
                var h = i_config.height;
                if (w !== undefined && h !== undefined) {
                    w = get_pixel_size(w, scale);
                    h = get_pixel_size(h, scale);
                    if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                        return;
                    }
                }
                var x = i_config.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                var y = i_config.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                _tf.transform(x, y, _p);
                var ox = _p.x;
                var oy = _p.y;
                var mx = _tf.mirrorX;
                var my = _tf.mirrorY;
                var tfrot = _tf.rotation;
                var sc = i_config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                var phi = i_config.phi;
                var angle = i_config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? phi : -phi;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (i_config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                _ctx.beginPath();
                getAlignment(i_config.align, _p, mx, my);
                var x = ox - _p.x * w;
                var y = oy - _p.y * h;
                var rb = get_canvas_pixel(i_config, 'roundBorder', scale);
                if (typeof rb === 'number' && rb > 1.0) {
                    // start 1. round edge
                    var xw = x + w;
                    var xr = xw - rb;
                    _ctx.moveTo(xr, y);
                    var yh = y + h;
                    _ctx.arcTo(xw, y, xw, yh, rb);
                    // 2. round edge
                    _ctx.arcTo(xw, yh, x, yh, rb);
                    // 3. round edge
                    _ctx.arcTo(x, yh, x, y, rb);
                    // 4. round edge
                    _ctx.arcTo(x, y, xr, y, rb);
                    _ctx.closePath();
                }
                else {
                    _ctx.rect(x, y, w, h);
                }
            };

            this.hmi_prepareArc = function (i_config) {
                _ctx.beginPath();
                var scale = _tf.scale;
                var r = i_config.r;
                if (r !== undefined) {
                    r = get_pixel_size(r, scale);
                    if (typeof r !== 'number' || r <= 0.5) {
                        return;
                    }
                }
                var x = i_config.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                var y = i_config.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                // try to get the angles
                var phi1 = 0;
                var phi2 = TWO_PI;
                if (typeof i_config.phi1 === 'number' && typeof i_config.phi2 === 'number') {
                    phi1 = i_config.phi1;
                    phi2 = i_config.phi2;
                }
                else if (typeof i_config.angle1 === 'number' && typeof i_config.angle2 === 'number') {
                    phi1 = i_config.angle1 * DEG2RAD;
                    phi2 = i_config.angle2 * DEG2RAD;
                }
                var mx = _tf.mirrorX;
                if (mx) {
                    phi1 = PI - phi1;
                    phi2 = PI - phi2;
                }
                var my = _tf.mirrorY;
                if (my) {
                    phi1 = -phi1;
                    phi2 = -phi2;
                }
                // normalize
                while (phi1 > PI) {
                    phi1 -= TWO_PI;
                    phi2 -= TWO_PI;
                }
                while (phi1 <= -PI) {
                    phi1 += TWO_PI;
                    phi2 += TWO_PI;
                }
                var tfrot = _tf.rotation;
                _tf.transform(x, y, _p);
                _ctx.arc(_p.x, _p.y, r, phi1 + tfrot, phi2 + tfrot, mx !== my);
            };

            this.hmi_preparePath = function (i_config) {
                _ctx.beginPath();
                var points = i_config.points;
                if (Array.isArray(points) === false || points.length < 2) {
                    return;
                }
                // ///////////////////////////////////////////////////////////////////////////////////////////////
                // create path and check dimension
                // ///////////////////////////////////////////////////////////////////////////////////////////////
                var scale = _tf.scale;
                var len = points.length;
                for (var i = 0; i < len; i++) {
                    var p = points[i];
                    var rad = p.r;
                    _tf.transform(p.x, p.y, _p);
                    var x1 = _p.x;
                    var y1 = _p.y;
                    if (i === 0 || p.move === true) {
                        _ctx.moveTo(x1, y1);
                    }
                    else if (typeof rad === 'number' && rad > 0.0 && i < len - 1) {
                        var p = points[i + 1];
                        _tf.transform(p.x, p.y, _p);
                        var x2 = _p.x;
                        var y2 = _p.y;
                        _ctx.arcTo(x1, y1, x2, y2, rad * scale);
                    }
                    else {
                        _ctx.lineTo(x1, y1);
                    }
                }
            };

            this.hmi_setFont = function (i_config) {
                var fontSize = get_pixel_size(i_config.fontSize, _tf.scale);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                }
                var font = i_config.bold === true ? 'bold ' : '';
                font += Math.floor(fontSize);
                font += 'px';
                var fontFamily = i_config.fontFamily;
                font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                _ctx.font = font;
            };
            // TODO this is shit
            this.hmi_getTextHeight = function (i_config) {
                return get_pixel_size(i_config.fontSize, _tf.scale);
            };

            this.hmi_getTextWidth = function (i_text) {
                return _ctx.measureText(i_text).width;
            };

            this.hmi_paintText = function (i_config, i_text) {
                // context.textAlign="center|end|left|right|start";
                // context.textBaseline="alphabetic|top|hanging|middle|ideographic|bottom";
                var scale = _tf.scale;
                var fontSize = get_canvas_pixel(i_config, 'fontSize', scale);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                }
                else if (fontSize < 5) {
                    return;
                }
                var x = i_config.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                var y = i_config.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                _tf.transform(x, y, _p);
                var ox = _p.x;
                var oy = _p.y;
                var mx = _tf.mirrorX;
                var my = _tf.mirrorY;
                var tfrot = _tf.rotation;
                var sc = i_config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                var phi = i_config.phi;
                var angle = i_config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? phi : -phi;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (i_config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                var stroke = false;
                if (i_config.stroke === true || isNumberOrPixelValue(i_config.lineWidth) || typeof i_config.strokeStyle === 'string') {
                    stroke = true;
                }
                var fill = false;
                if (i_config.fill === true || typeof i_config.fillStyle === 'string') {
                    fill = true;
                }
                if (fill) {
                    var fillStyle = i_config.fillStyle;
                    if (typeof fillStyle === 'string') {
                        _ctx.fillStyle = fillStyle;
                    }
                }
                if (stroke) {
                    var lineWidth = get_pixel_size(i_config.lineWidth, scale);
                    if (typeof lineWidth === 'number') {
                        _ctx.lineWidth = lineWidth;
                    }
                    var strokeStyle = i_config.strokeStyle;
                    if (typeof strokeStyle === 'string') {
                        _ctx.strokeStyle = strokeStyle;
                    }
                }
                if (fill || stroke) {
                    var fontSize = get_pixel_size(i_config.fontSize, scale);
                    if (typeof fontSize !== 'number') {
                        fontSize = 10;
                    }
                    var font = i_config.bold === true ? 'bold ' : '';
                    font += Math.floor(fontSize);
                    font += 'px';
                    var fontFamily = i_config.fontFamily;
                    font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                    _ctx.font = font;
                    getAlignment(i_config.align, _p, mx !== (i_config.flipX === true), my !== (i_config.flipY === true));
                    _ctx.textAlign = 'center';
                    _ctx.textBaseline = 'middle';
                    if (Array.isArray(i_text)) {
                        var y0 = oy - (_p.y * i_text.length - 0.5) * fontSize;
                        for (var i = 0; i < i_text.length; i++) {
                            var txt = i_text[i];
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            var x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                            var y = y0 + i * fontSize;
                            if (fill) {
                                _ctx.fillText(txt, x, y);
                            }
                            if (stroke) {
                                _ctx.strokeText(txt, x, y);
                            }
                        }
                    }
                    else {
                        var txt = i_text;
                        if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                            txt = txt.toString();
                        }
                        var x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                        var y = oy - (_p.y - 0.5) * fontSize;
                        if (fill) {
                            _ctx.fillText(txt, x, y);
                        }
                        if (stroke) {
                            _ctx.strokeText(txt, x, y);
                        }
                    }
                }
            };

            this.hmi_paintImage = function (i_config, i_image) {
                if (i_image === undefined || typeof i_image.naturalWidth !== 'number' || i_image.naturalWidth <= 1 || typeof i_image.naturalHeight !== 'number' || i_image.naturalHeight <= 1) {
                    return;
                }
                var scale = _tf.scale;
                var w = i_config.width;
                var h = i_config.height;
                if (w !== undefined && h !== undefined) {
                    w = get_pixel_size(w, scale);
                    h = get_pixel_size(h, scale);
                    if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                        return;
                    }
                }
                else if (w !== undefined) {
                    w = get_pixel_size(w, scale);
                    if (typeof w !== 'number' || w < 0.5) {
                        return;
                    }
                    h = Math.floor(w * i_image.naturalHeight / i_image.naturalWidth);
                    w = Math.floor(w);
                }
                else if (h !== undefined) {
                    h = get_pixel_size(h, scale);
                    if (typeof h !== 'number' || h < 0.5) {
                        return;
                    }
                    w = Math.floor(h * i_image.naturalWidth / i_image.naturalHeight);
                    h = Math.floor(h);
                }
                else {
                    w = i_image.naturalWidth;
                    h = i_image.naturalHeight;
                }
                var x = i_config.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                var y = i_config.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                _tf.transform(x, y, _p);
                var ox = _p.x;
                var oy = _p.y;
                var mx = _tf.mirrorX;
                var my = _tf.mirrorY;
                var tfrot = _tf.rotation;
                var sc = i_config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                var phi = i_config.phi;
                var angle = i_config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? phi : -phi;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (i_config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                else if (i_config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(i_config.flipX === true ? -sc : sc, i_config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                getAlignment(i_config.align, _p, mx !== (i_config.flipX === true), my !== (i_config.flipY === true));
                var x = ox - _p.x * w;
                var y = oy - _p.y * h;
                _ctx.drawImage(i_image, x, y, w, h);
            };
            this.hmi_beginPath = function () {
                _ctx.beginPath();
            };

            this.hmi_moveTo = function (i_x, i_y) {
                _tf.transform(i_x, i_y, _p);
                _ctx.moveTo(_p.x, _p.y);
            };

            this.hmi_lineTo = function (i_x, i_y) {
                _tf.transform(i_x, i_y, _p);
                _ctx.lineTo(_p.x, _p.y);
            };

            this.hmi_arcTo = function (i_x1, i_y1, i_x2, i_y2, i_radius) {
                _tf.transform(i_x1, i_y1, _p);
                var x1 = _p.x;
                var y1 = _p.y;
                _tf.transform(i_x2, i_y2, _p);
                _ctx.arcTo(x1, y1, _p.x, _p.y, i_radius * _tf.scale);
            };

            this.hmi_quadraticCurveTo = function (i_x1, i_y1, i_x2, i_y2) {
                _tf.transform(i_x1, i_y1, _p);
                var x1 = _p.x;
                var y1 = _p.y;
                _tf.transform(i_x2, i_y2, _p);
                _ctx.quadraticCurveTo(x1, y1, _p.x, _p.y);
            };

            this.hmi_bezierCurveTo = function (i_x1, i_y1, i_x2, i_y2, i_x2, i_y2) {
                _tf.transform(i_x1, i_y1, _p);
                var x1 = _p.x;
                var y1 = _p.y;
                _tf.transform(i_x2, i_x2, _p);
                var x2 = _p.x;
                var y2 = _p.y;
                _tf.transform(i_x3, i_y3, _p);
                _ctx.bezierCurveTo(x1, y1, x2, y2, _p.x, _p.y);
            };

            this.hmi_closePath = function () {
                _ctx.closePath();
            };

            this.hmi_fill = function (i_config) {
                if (i_config) {
                    var fillStyle = i_config.fillStyle;
                    if (typeof fillStyle === 'string') {
                        _ctx.fillStyle = fillStyle;
                    }
                }
                _ctx.fill();
            };

            this.hmi_stroke = function (i_config) {
                if (i_config) {
                    var lineCap = i_config.lineCap;
                    if (typeof lineCap === 'string') {
                        _ctx.lineCap = lineCap;
                    }
                    var lineJoin = i_config.lineJoin;
                    if (typeof lineJoin === 'string') {
                        _ctx.lineJoin = lineJoin;
                    }
                    var lineWidth = get_pixel_size(i_config.lineWidth, _tf.scale);
                    if (typeof lineWidth === 'number') {
                        _ctx.lineWidth = lineWidth;
                    }
                    var strokeStyle = i_config.strokeStyle;
                    if (typeof strokeStyle === 'string') {
                        _ctx.strokeStyle = strokeStyle;
                    }
                }
                _ctx.stroke();
            };
        }
        // handle children
        _children = this.children;
        if (Array.isArray(_children)) {
            /*
             * Our graphical object may be a group or paintable. Groups may contain
             * paintable object or other groups. Every child of our group has its own
             * coordinate transform that may be translated, rotated, scaled and
             * mirrored at the x or y axis.
             * 
             * In the next lines we iterate over all children and those which are
             * graphical objects will be handled recursively.
             */
            function updateHtmlChildPosition(i_hmiObject, i_child, i_width, i_height, i_callResize) {
                var elem = i_child._hmi_graphHtmlElement;
                // update size and resize object if required
                var resized = false;
                var cw = Math.floor(i_width);
                if (i_child._hmi_w !== cw) {
                    i_child._hmi_w = cw;
                    elem.css('width', cw + 'px');
                    resized = true;
                }
                var ch = Math.floor(i_height);
                if (i_child._hmi_h !== ch) {
                    i_child._hmi_h = ch;
                    elem.css('height', ch + 'px');
                    resized = true;
                }
                if (resized && i_callResize && i_hmiObject._hmi_resize) {
                    i_hmiObject._hmi_resize();
                }
                // locate object depending on the align
                var x = i_child.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                var y = i_child.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                _tf.transform(x, y, _p);
                var ox = Math.floor(_p.x);
                var oy = Math.floor(_p.y);
                // TODO not sure about mirrors
                var mx = _tf.mirrorX !== (i_child.mirrorX === true);
                var my = _tf.mirrorY !== (i_child.mirrorY === true);
                getAlignment(i_child.align, _p, mx, my);
                var ax = _p.x;
                var ay = _p.y;
                // var x1 = ox - ( mx ? 1.0 - ax : ax) * i_width;
                // var y1 = oy - ( my ? ay : 1.0 - ay) * i_height;
                var x1 = ox - ax * i_width;
                var y1 = oy - ay * i_height;
                if (i_child._hmi_x !== x1) {
                    i_child._hmi_x = x1;
                    elem.css('left', x1 + 'px');
                }
                if (i_child._hmi_y !== y1) {
                    i_child._hmi_y = y1;
                    elem.css('top', y1 + 'px');
                }
                var tfrot = _tf.rotation;
                var phi = i_child.phi;
                var angle = i_child.angle;
                var rot = 0;
                if (typeof phi === 'number') {
                    var theta = mx === my ? phi : -phi;
                    if (i_child.upright !== true) {
                        theta += tfrot;
                    }
                    rot = Math.floor(normalizeToPlusMinus180deg(theta * RAD2DEG));
                }
                else if (typeof angle === 'number') {
                    var theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (i_child.upright !== true) {
                        theta += tfrot;
                    }
                    rot = Math.floor(normalizeToPlusMinus180deg(theta * RAD2DEG));
                }
                else if (i_child.upright !== true) {
                    rot = Math.floor(normalizeToPlusMinus180deg(tfrot * RAD2DEG));
                }
                var scale = i_child.scale;
                if (typeof scale !== 'number') {
                    scale = 1.0;
                }
                if (resized || i_child._hmi_rot !== rot || i_child._hmi_scale !== scale) {
                    i_child._hmi_rot = rot;
                    i_child._hmi_scale = scale;
                    var dx = Math.floor(i_width / 2);
                    var dy = Math.floor(i_height / 2);
                    var a_x = (mx ? 1.0 - 2.0 * ax : 2.0 * ax - 1.0) * dx;
                    var a_y = (my ? 2.0 * ay - 1.0 : 1.0 - 2.0 * ay) * dy;
                    var tf = 'translate(';
                    tf += a_x;
                    tf += 'px, ';
                    tf += a_y;
                    tf += 'px) rotate(';
                    tf += rot;
                    tf += 'deg) scale(';
                    tf += i_child.flipX === true ? -scale : scale;
                    tf += ', ';
                    tf += i_child.flipY === true ? -scale : scale;
                    tf += ') translate(';
                    tf += -a_x;
                    tf += 'px, ';
                    tf += -a_y;
                    tf += 'px)';
                    elem.css('transform', tf);
                }
            };

            /*
             * Update children transforms.
             */
            this._hmi_updateChildrenTransforms = function () {
                for (var i = 0; i < _children.length; i++) {
                    var child = _children[i];
                    var hmiobj = child._hmi_object;
                    if (hmiobj) {
                        if (hmiobj._hmi_isSection === true) {
                            var cs = hmiobj._hmi_curveSection;
                            for (var j = 0; j < cs.getItemCount(); j++) {
                                var item = cs.getItem(j);
                                var ic = item.child;
                                cs.transform(item.position, ic, _p);
                                ic.x = _p.x;
                                ic.y = _p.y;
                                if (ic.upright !== true) {
                                    ic.phi = _p.phi;
                                }
                            }
                        }
                        if (hmiobj.type === 'graph') {
                            if (child !== hmiobj) {
                                hmiobj._hmi_context.transform.setToCoordinateTransform(child, _tf);
                            }
                        }
                        else if (!isTaskType(hmiobj)) {
                            var width = get_pixel_size(child.width, _tf.scale);
                            var height = get_pixel_size(child.height, _tf.scale);
                            if (typeof width === 'number' && typeof height === 'number') {
                                updateHtmlChildPosition(hmiobj, child, width, height, true);
                            }
                        }
                    }
                }
            };

            _curves = this.curves;
            if (Array.isArray(_curves)) {
                // within the next loop we create the curves
                for (var i = 0; i < _curves.length; i++) {
                    var curve = _curves[i];
                    if (curve.type === 'arcline') {
                        var al = new ArcLine(curve);
                        curve._hmi_curveImpl = al;
                    }
                    else if (curve.type === 'ropeline') {
                        var rl = new RopeLine(curve);
                        curve._hmi_curveImpl = rl;
                    }
                }
            }
            else {
                _curves = undefined;
            }
            for (var i = 0; i < _children.length; i++) {
                // closure
                (function () {
                    var child = _children[i];
                    var hmiobj = child._hmi_object;
                    if (hmiobj) {
                        var vps = hmiobj.vps;
                        var scene = hmiobj.scene;
                        if (typeof vps === 'string' && typeof scene === 'string') {
                            // get reference to vehicle position system (VPS) and store
                            // all segments for fast access during refresh
                            vps = hmiobj.hmi_node(vps);
                            scene = hmiobj.hmi_node(scene);
                            if (vps && scene && Array.isArray(scene.children)) {
                                hmiobj._hmi_vps = vps;
                                hmiobj._hmi_segments = [];
                                var clds = scene.children;
                                for (var k = 0; k < clds.length; k++) {
                                    var c = clds[k];
                                    if (typeof c.segment === 'number') {
                                        hmiobj._hmi_segments[c.segment] = c;
                                    }
                                }
                                hmiobj.hmi_getPointOnCurveSection = function (i_position, i_offset, i_point, i_adjusted) {
                                    var cursec = this._hmi_vehicleCurveSection;
                                    var posadj = this._hmi_vehiclePositionAdjuster;
                                    var pos = i_adjusted === true && posadj ? posadj.adjust(i_position) : i_position;
                                    return cursec ? cursec.transform(pos, i_offset, i_point) : false;
                                };
                            }
                        }
                        if (_curves) {
                            for (var j = 0; j < _curves.length; j++) {
                                var curve = _curves[j];
                                if (child.curve === curve.id) {
                                    var cu = curve._hmi_curveImpl;
                                    var curveLength = cu.getLength();
                                    var from = typeof child.from === 'number' ? child.from : 0.0;
                                    var to = typeof child.to === 'number' ? child.to : 1.0;
                                    var cs = new CurveSection(cu, curve.id, from * curveLength, to * curveLength, hmiobj.children);
                                    var pa = new ZonePositionAdjuster(cs, hmiobj.length, that.hmi.env.isSimulationEnabled() === true);
                                    pa.addListeners();
                                    hmiobj.hmi_from = 0.0;
                                    hmiobj.hmi_to = cs.length;
                                    hmiobj._hmi_isSection = true;
                                    hmiobj._hmi_curveSection = cs;
                                    hmiobj._hmi_curve = cu;
                                    hmiobj._hmi_positionAdjuster = pa;
                                    hmiobj.hmi_getPointOnCurveSection = function (i_position, i_offset, i_point, i_adjusted) {
                                        var pos = i_adjusted === true ? this._hmi_positionAdjuster.adjust(i_position) : i_position;
                                        return this._hmi_curveSection.transform(pos, i_offset, i_point);
                                    };
                                    for (var z = 0; z < cs.getZoneCount(); z++) {
                                        var zonevisobj = cs.getZoneObject(z)._hmi_object;
                                        if (zonevisobj) {
                                            zonevisobj._hmi_curveSection = cs;
                                            zonevisobj._hmi_curve = cu;
                                            zonevisobj.hmi_from = cs.getZoneStart(z);
                                            zonevisobj.hmi_to = cs.getZoneEnd(z);
                                        }
                                    }
                                    for (var z = 0; z < cs.getItemCount(); z++) {
                                        var itemvisobj = cs.getItem(z).child._hmi_object;
                                        if (itemvisobj) {
                                            itemvisobj.hmi_position = cs.getItemPosition(z);
                                        }
                                    }
                                    break;
                                }
                            }
                        }
                        if (hmiobj._hmi_init_dom) {
                            if (hmiobj.type === 'graph') {
                                var ctf = _tf;
                                if (child !== hmiobj) {
                                    ctf = new Transform();
                                    ctf.setToCoordinateTransform(child, _tf);
                                }
                                tasks.push(function (i_suc, i_err) {
                                    // #graph: 1
                                    hmiobj._hmi_init_dom({
                                        container: _cont,
                                        transform: ctf,
                                        context2d: _ctx
                                    }, i_suc, i_err);
                                });
                            }
                            else if (isTaskType(hmiobj)) {
                                tasks.push(function (i_suc, i_err) {
                                    // #graph: 2
                                    hmiobj._hmi_init_dom({
                                        container: _cont
                                    }, i_suc, i_err);
                                });
                            }
                            else {
                                child._hmi_graphHtmlElement = $(DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                                child._hmi_graphHtmlElement.appendTo(_cont);
                                var width = get_pixel_size(child.width, _tf.scale);
                                var height = get_pixel_size(child.height, _tf.scale);
                                if (typeof width === 'number' && typeof height === 'number') {
                                    updateHtmlChildPosition(hmiobj, child, width, height, false);
                                }
                                tasks.push(function (i_suc, i_err) {
                                    // #graph: 3
                                    hmiobj._hmi_init_dom({
                                        container: child._hmi_graphHtmlElement
                                    }, i_suc, i_err);
                                });
                            }
                        }
                    }
                }());
            }
            // layout
            this.hmi_layout = function (i_layout, i_separator) {
                layout_children(_children, i_layout, i_separator);
            };
        }
        // finally we remove all we created
        this._hmi_destroys.push(function () {
            if (that._hmi_graphicsRoot === true) {
                clicked = undefined;
                event = undefined;
            }
            if (_children) {
                for (var i = _children.length - 1; i >= 0; i--) {
                    var child = _children[i];
                    var hmiobj = child._hmi_object;
                    if (hmiobj) {
                        if (hmiobj._hmi_destroy_dom) {
                            // #graph: 1
                            hmiobj._hmi_destroy_dom();
                        }
                        var cs = hmiobj._hmi_curveSection;
                        if (cs) {
                            for (var z = cs.getItemCount() - 1; z >= 0; z--) {
                                var itemvisobj = cs.getItem(z).child._hmi_object;
                                if (itemvisobj) {
                                    delete itemvisobj.hmi_position;
                                }
                            }
                            for (var z = cs.getZoneCount() - 1; z >= 0; z--) {
                                var zonevisobj = cs.getZoneObject(z)._hmi_object;
                                if (zonevisobj) {
                                    delete zonevisobj._hmi_curveSection;
                                    delete zonevisobj._hmi_curve;
                                    delete zonevisobj.hmi_from;
                                    delete zonevisobj.hmi_to;
                                }
                            }
                            delete hmiobj._hmi_curveSection;
                            delete hmiobj.hmi_from;
                            delete hmiobj.hmi_to;
                            delete hmiobj._hmi_curve;
                            delete hmiobj._hmi_isSection;
                        }
                        if (hmiobj._hmi_positionAdjuster) {
                            hmiobj._hmi_positionAdjuster.removeListeners();
                            hmiobj._hmi_positionAdjuster.destroy();
                            delete hmiobj._hmi_positionAdjuster;
                            delete hmiobj.hmi_getPointOnCurveSection;
                        }
                        if (hmiobj._hmi_segments) {
                            hmiobj._hmi_segments.splice(0, hmiobj._hmi_segments.length);
                            delete hmiobj._hmi_segments;
                        }
                        delete hmiobj.hmi_vehicleSegment;
                        delete hmiobj.hmi_vehiclePosition;
                        delete hmiobj.hmi_vehiclePositionAdjusted;
                        delete hmiobj.hmi_getPointOnCurveSection;
                        delete hmiobj._hmi_vehicleCurveSection;
                        delete hmiobj._hmi_vehiclePositionAdjuster;
                        delete hmiobj._hmi_vps;
                    }
                    if (child._hmi_graphHtmlElement) {
                        child._hmi_graphHtmlElement.remove();
                        delete child._hmi_graphHtmlElement;
                    }
                }
                if (_curves) {
                    for (var i = _curves.length - 1; i >= 0; i--) {
                        var curve = _curves[i];
                        delete curve._hmi_curveImpl;
                    }
                    _curves = undefined;
                }
                _children = undefined;
                delete that._hmi_updateChildrenTransforms;
            }
            if (that._hmi_image) {
                that._hmi_image.src = '';
                delete that._hmi_image;
            }
            if (that._hmi_graphicsRoot === true) {
                _ctx.restore();
                if (that._hmi_validContext2d === true) {
                    that._hmi_canvasElements.splice(0, that._hmi_canvasElements.length);
                    delete that._hmi_canvasElements;
                    delete that._hmi_validContext2d;
                }
                that._hmi_canvas.remove();
                delete that._hmi_canvas;
                delete that._hmi_graphicsRoot;
            }
            else {
                delete that.hmi_setVisible;
                delete that.hmi_isVisible;
            }
            stroke_curve_parts = undefined;
            stroke_curve = undefined;
            delete that.hmi_getGraphTextSize;
            delete that.hmi_setImageSource;
            delete that.hmi_getImageWidth;
            delete that.hmi_getImageHeight;
            delete that.hmi_text;
            delete that._hmi_repaint;
            delete that._hmi_isPointOnObject;
            delete that.hmi_layout;
            delete that.hmi_getBounds;
            delete that.hmi_updateBounds;
            delete that._hmi_getBounds;
            delete that.hmi_transform;
            delete that.hmi_prepareRect;
            delete that.hmi_prepareArc;
            delete that.hmi_preparePath;
            delete that.hmi_setFont;
            delete that.hmi_getTextHeight;
            delete that.hmi_getTextWidth;
            delete that.hmi_paintText;
            delete that.hmi_paintImage;
            delete that.hmi_beginPath;
            delete that.hmi_moveTo;
            delete that.hmi_lineTo;
            delete that.hmi_arcTo;
            delete that.hmi_quadraticCurveTo;
            delete that.hmi_bezierCurveTo;
            delete that.hmi_closePath;
            delete that.hmi_fill;
            delete that.hmi_stroke;
            delete that.hmi_save;
            delete that.hmi_restore;
            delete that._hmi_context.transform;
            delete that._hmi_context.context2d;
            delete that._hmi_graphics;
            _cont = undefined;
            delete that.hmi_context2d;
            _ctx = undefined;
            _tf = undefined;
            that = undefined;
        });
        Executor.run(tasks, i_success, i_error);
    };

    /**
     * This is our actual hmi object implementation
     */
    var s_objectId = 0;
    function ObjectImpl(i_disableVisuEvents, i_enableEditorEvents) {
        let that = this;
        var _cont = undefined;
        this._hmi_objectId = s_objectId++;

        // TODO what for graph or handler objects???
        var _fClickedDraggable = undefined;

        // LISTENERS
        var _watch = undefined;
        var _onEventCallbacks = undefined;
        this._hmi_listenerAdds = [];
        this._hmi_listenerRemoves = [];

        // REFRESH AND DESTROY
        this._hmi_refreshs = [];
        this._hmi_destroys = [];

        // CONTEXT
        this.hmi_context = function () {
            return that._hmi_context;
        };
        this.hmi_getHtmlTextSize = function (i_text) {
            return _cont ? get_text_size(i_text, _cont.css('font')) : undefined;
        };
        // objects are visible as default
        this._hmi_visible = true;

        // //////////////////////////////////////////////////////////////////////////////
        // INTERNAL METHODS
        // //////////////////////////////////////////////////////////////////////////////

        // INITIALIZE THE DOCUMENT
        // TODO use: i_success, i_error
        this._hmi_init_dom = function (i_context, i_success, i_error) {
            const tasks = [];
            that._hmi_context = i_context;
            _cont = i_context.container;
            if (isTaskType(that)) {
                tasks.push(function (i_suc, i_err) {
                    TaskObjectImpl.call(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents, i_suc, i_err);
                });
            }
            else {
                if (that.type === 'graph') {
                    // if a graphics object apply graphic functionality
                    tasks.push(function (i_suc, i_err) {
                        GraphicObjectImpl.call(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents, i_suc, i_err);
                    });
                }
                else {
                    tasks.push(function (i_suc, i_err) {
                        DefaultHtmlObjectImpl.call(that);
                        i_suc();
                    });
                    // get type if available
                    var type = typeof that.type === 'string' ? s_types[that.type] : false;
                    // if type is available
                    if (typeof type === 'function') {
                        tasks.push(function (i_suc, i_err) {
                            // apply type specific functionality
                            type.call(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents, i_suc, i_err);
                        });
                    }
                    // no type
                    else {
                        tasks.push(function (i_suc, i_err) {
                            SimpleHtmlObjectImpl.call(that);
                            i_suc();
                        });
                    }
                    // EXTENSIONS
                    if (DivButtonImpl.isRequired(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents)) {
                        tasks.push(function (i_suc, i_err) {
                            DivButtonImpl.call(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents, i_suc, i_err);
                        });
                    }
                    if (TimeRangeSelectorImpl.isRequired(that)) {
                        tasks.push(function (i_suc, i_err) {
                            TimeRangeSelectorImpl.call(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents, i_suc, i_err);
                        });
                    }
                    tasks.push(function (i_suc, i_err) {
                        // used for editor only! move somewhere?
                        if (typeof that.draggable === 'string' && i_enableEditorEvents !== true) {
                            if (_cont) {
                                _cont.draggable({
                                    // set the drag and drop scope
                                    scope: that.draggable,
                                    // helper : 'clone' means we just clone the original
                                    /*
                                     * helper : function() { var clone = _cont.clone();
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
                                    start: function (event, ui) {
                                        updateEventListenersState(false);
                                    },
                                    stop: function (event, ui) {
                                        updateEventListenersState(true);
                                    }
                                });
                                if (that.clickable !== false) {
                                    _fClickedDraggable = function (i_event) {
                                        if ($(this).is('.ui-draggable-dragging')) {
                                            return;
                                        }
                                        prevent_default_and_stop_propagation(i_event);
                                        var target = that.hmi.droppables[that.draggable];
                                        var data = that.data;
                                        if (target !== null && typeof target === 'object' && typeof target.add === 'function' && data !== null && typeof data === 'object' && typeof data.object === 'string') {
                                            target.add(data.object, data.width, data.height, data.init);
                                        }
                                    };
                                    // touch support???
                                    _cont.on('click', _fClickedDraggable);
                                }
                            }
                        }
                        i_suc();
                    });
                }
                tasks.push(function (i_suc, i_err) {
                    try {
                        // VISIBILITY (default is true)
                        if (isVisible(that.visible) === false) {
                            if (i_disableVisuEvents === true) {
                                that.hmi_setVisible(true);
                                if (_cont && (that._hmi_graphicsRoot === true || that._hmi_graphics !== true)) {
                                    // this is for our editor
                                    _cont.css('opacity', '0.3819660112501052');
                                }
                            }
                            else {
                                that.hmi_setVisible(false);
                            }
                        }
                        else {
                            that.hmi_setVisible(true);
                        }
                        i_suc();
                    }
                    catch (e) {
                        i_err(e);
                    }
                });
            }
            // add extensions is available
            for (var i = 0; i < s_extensions.length; i++) {
                var impl = s_extensions[i];
                if (impl.isExtension(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents)) {
                    tasks.push(function (i_suc, i_err) {
                        impl.call(that, that._hmi_context, i_disableVisuEvents, i_enableEditorEvents, i_suc, i_err);
                    });
                }
            }
            tasks.parallel = false;
            Executor.run(tasks, function () {
                // delete method to prevent other calls
                delete that._hmi_init_dom;
                i_success();
            }, i_error);
        };

        // ADD LISTENERS
        this._hmi_addListeners = (i_hmiObject, i_success, i_error) => {
            // WATCH / TEXT
            _watch = get_watch(that.watch);
            if (Array.isArray(_watch)) {
                _onEventCallbacks = [];
                function tryGetType(dataId) {
                    try {
                        return that.hmi.env.data.GetType(dataId);
                    } catch (error) {
                        console.error(`Failed calling GetType('${dataId}'):\n${error.message}`);
                        return Core.DataType.Unknown;
                    }
                }
                for (var i = 0; i < _watch.length; i++) {
                    (function () {
                        const dataId = _watch[i];
                        try {
                            const type = that.hmi.env.data.GetType(dataId);
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
                                that.hmi.env.data.SubscribeData(dataId, onRefresh);
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
                    that.hmi.env.lang.SubscribeLanguage(onLanguageChanged);
                    that._hmi_onLanguageChanged = onLanguageChanged;
                } catch (error) {
                    console.error(`Failed subscribing on language:\n${error.message}`);
                }
            }
            // add listeners
            for (var i = 0; i < that._hmi_listenerAdds.length; i++) {
                var func = that._hmi_listenerAdds[i];
                if (typeof func === 'function') {
                    try {
                        func();
                    } catch (exc) {
                        console.error('EXCEPTION! Cannot add listeners: ' + exc + ' ' + func.toString());
                    }
                }
            }
            // delete method to prevent other calls
            delete that._hmi_addListeners;
            i_success();
        };

        // REMOVE LISTENERS
        this._hmi_removeListeners = function (i_hmiObject, i_success, i_error) {
            // remove listeners
            for (var i = that._hmi_listenerRemoves.length - 1; i >= 0; i--) {
                var func = that._hmi_listenerRemoves[i];
                if (typeof func === 'function') {
                    try {
                        func();
                    }
                    catch (exc) {
                        console.error('EXCEPTION! Cannot remove listeners: ' + exc + ' ' + func.toString());
                    }
                }
            }
            if (that._hmi_onLanguageChanged) {
                try {
                    that.hmi.env.lang.UnsubscribeLanguage(that._hmi_onLanguageChanged);
                } catch (error) {
                    console.error(`Failed subscribing from language:\n${error.message}`);
                }
                delete that._hmi_onLanguageChanged;
            }
            if (Array.isArray(_watch)) {
                for (var i = _watch.length - 1; i >= 0; i--) {
                    try {
                        that.hmi.env.data.UnsubscribeData(_watch[i], _onEventCallbacks[i]);
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
            i_success();
        };

        // CLEAN UP
        this._hmi_destroy_dom = function () {
            that._hmi_refreshs.splice(0, that._hmi_refreshs.length);
            // perform all destroys and remove all
            for (var i = that._hmi_destroys.length - 1; i >= 0; i--) {
                var func = that._hmi_destroys[i];
                if (typeof func === 'function') {
                    try {
                        func();
                    }
                    catch (exc) {
                        console.error('EXCEPTION! Cannot destroy object with id "' + that._hmi_objectId + '": ' + exc + ' ' + func.toString());
                    }
                }
            }
            that._hmi_destroys.splice(0, that._hmi_destroys.length);
            if (_cont) {
                if (_fClickedDraggable !== undefined) {
                    _cont.off('click', _fClickedDraggable);
                    _fClickedDraggable = undefined;
                }
                if (typeof that.draggable === 'string' && i_enableEditorEvents !== true) {
                    _cont.draggable('destroy');
                }
                _cont.empty();
            }
            _cont = undefined;
            // prevent other calls
            delete that._hmi_destroy_dom;
        };

        // DESTROY VISU OBJECT
        this._hmi_destroy = function () {
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
    };

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
                        // closure
                        (function () {
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
                } catch (exc) {
                    console.error('EXCEPTION! Calling ready callback: ' + exc + ' ' + onSuccess.toString());
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
            } catch (exc) {
                console.error(`EXCEPTION! Calling callback: '${exc}' '${callback.toString()}'`);
            }
            close();
        };
        const buttons = [];
        if (typeof config.ok === 'function') {
            buttons.push({
                text: typeof config.okLabelId === 'string' ? that.hmi.env.data.Get(config.okLabelId) : 'OK',
                click: close => perform(config.ok, close)
            });
        }
        if (typeof config.yes === 'function') {
            buttons.push({
                text: typeof config.yesLabelId === 'string' ? that.hmi.env.data.Get(config.yesLabelId) : 'Yes',
                click: close => perform(config.yes, close)
            });
        }
        if (typeof config.no === 'function') {
            buttons.push({
                text: typeof config.noLabelId === 'string' ? that.hmi.env.data.Get(config.noLabelId) : 'No',
                click: close => perform(config.no, close)
            });
        }
        if (typeof config.cancel === 'function') {
            buttons.push({
                text: typeof config.cancelLabelId === 'string' ? that.hmi.env.data.Get(config.cancelLabelId) : 'Cancel',
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
     *          i_source The source object or array
     * @param {Object}
     *          i_target The target object or array
     * @param {Object}
     *          i_attribute The attribute name.
     */
    function transfer_attribute(i_source, i_target, i_attribute) {
        var sourceAttribute = i_source[i_attribute];
        var targetAttribute = i_target[i_attribute];
        if (Array.isArray(sourceAttribute)) {
            if (Array.isArray(targetAttribute)) {
                transfer_attributes(sourceAttribute, targetAttribute, undefined);
            }
            else {
                i_target[i_attribute] = sourceAttribute;
            }
        }
        else if (sourceAttribute !== null && typeof sourceAttribute === 'object') {
            if (Array.isArray(targetAttribute)) {
                i_target[i_attribute] = sourceAttribute;
            }
            else if (targetAttribute !== null && typeof targetAttribute === 'object') {
                transfer_attributes(sourceAttribute, targetAttribute, undefined);
            }
            else {
                i_target[i_attribute] = sourceAttribute;
            }
        }
        else if (sourceAttribute !== undefined) {
            i_target[i_attribute] = sourceAttribute;
        }
    };

    /**
     * This method transfers all attributes from the source to the target. If
     * source and target are both arrays we iterate over all elements. If source
     * and target are both objects we iterate over all attributes.
     * 
     * @param {Object}
     *          i_source The source object or array
     * @param {Object}
     *          i_target The target object or array
     * @param {boolean}
     *          i_ignoreAttribute If true attributes named 'id' will be ignored
     */
    function transfer_attributes(i_source, i_target, i_ignoreAttribute) {
        if (Array.isArray(i_source)) {
            for (var i = 0; i < i_source.length; i++) {
                transfer_attribute(i_source, i_target, i);
            }
        }
        else {
            for (var attr in i_source) {
                if (i_source.hasOwnProperty(attr) && (i_ignoreAttribute === undefined || i_ignoreAttribute !== attr)) {
                    transfer_attribute(i_source, i_target, attr);
                }
            }
        }
    };

    /**
     * This function performs a from node to node navigation via the given path.
     * 
     * @param {Object}
     *          i_node The start node
     * @param {Object}
     *          i_path The path (parts separated by slash)
     */
    var NODE_ID_PATH_DELIMITER = '/';
    function get_id_node(i_node, i_path) {
        if (typeof i_path !== 'string') {
            return undefined;
        }
        var path = i_path.split(NODE_ID_PATH_DELIMITER);
        var node = i_node;
        for (var i = 0; i < path.length; i++) {
            var id = path[i];
            if (id === '.') {
                // same node ==> nothing to do
                continue;
            }
            if (id === '..') {
                // go to parent node
                var parent = node._hmi_nodeParent;
                if (parent !== undefined && parent !== null) {
                    node = parent;
                    continue;
                }
                else {
                    return undefined;
                }
            }
            if (id === '' && i === 0) {
                // get root
                var parent = node._hmi_nodeParent;
                while (parent !== undefined && parent !== null) {
                    node = parent;
                    parent = node._hmi_nodeParent;
                }
                continue;
            }
            var children = node._hmi_nodeChildren;
            if (Array.isArray(children)) {
                var found = false;
                for (var j = 0; j < children.length; j++) {
                    var child = children[j];
                    if (child._hmi_nodeId === id) {
                        node = child;
                        found = true;
                        break;
                    }
                }
                if (found === true) {
                    continue;
                }
                else {
                    return undefined;
                }
            }
            return undefined;
        }
        return node;
    };

    function createIdNodeSubTree(object, parentObject, id, nodeParent) {
        object.hmi_node = path => {
            const node = typeof object._hmi_nodeId === 'string' || object._hmi_nodeParent === undefined || object._hmi_nodeParent === null ? object : object._hmi_nodeParent;
            return typeof path === 'string' ? get_id_node(node, path) : node;
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
    };

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
    };

    /**
     * This methods handles the given data on the given object. If data is an
     * object the data attributes will be copied to the object. If data is an
     * array this function will be called recursively on all elements. If data is
     * a function the function will be called repeatedly as long it returns true.
     * 
     * @param {Object}
     *          i_object The object
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
                    transfer_attributes(data, hmiObject, 'id');
                }
            } else {
                // just call on visualization object
                transfer_attributes(data, object, 'id');
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
     *          i_attr The attribute name of the data object, array or function
     * @param {Object}
     *          fromRootToLeaf If true we call handle the object before we
     *          iterate over it's children.
     * @param {Object}
     *          onSuccess This function will be called when done.
     */
    function performAttributeOnObjectSubTree(object, attributeName, fromRootToLeaf, onSuccess, onError, hmi) {
        // if we where called with i_object = object.children (in case of i_object
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
                    var hmiobj = object._hmi_object;
                    if (hmiobj === undefined) {
                        var obj = subObject;
                        var cld = obj.object;
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

    var s_root_objects = [];

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
                    processObjectSubTree(hmiobj, true, undefined, processObject => ObjectImpl.call(processObject, disableVisuEvents, hmiobj === processObject && enableEditorEvents));
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
    ObjectLifecycleManager.create = createObjectSubTree;

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
    ObjectLifecycleManager.kill = killObjectSubTree;

    function refreshAllRecursive(date) {
        for (let i = 0, l = s_root_objects.length; i < l; i++) {
            // first we call all found user refresh functions
            processObjectSubTree(s_root_objects[i], true, undefined, processObject => {
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
            processObjectSubTree(s_root_objects[i], true, undefined, processObject => {
                if (processObject._hmi_alive === true) {
                    const refreshs = processObject._hmi_refreshs;
                    if (refreshs !== undefined && Array.isArray(refreshs)) {
                        for (let r = 0, rl = refreshs.length; r < rl; r++) {
                            const func = refreshs[r];
                            if (typeof func === 'function') {
                                try {
                                    func(date);
                                } catch (exc) {
                                    console.error(`Failed calling _hmi_refresh: '${exc}' '${func.toString()}'`);
                                }
                            }
                        }
                    }
                }
            });
        }
    }
    ObjectLifecycleManager.refresh = refreshAllRecursive;

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
     *          i_type Function as closure for type specific features.
     */
    function _add_type(i_type, i_impl) {
        if (typeof i_type !== 'string' || i_type.length === 0) {
            throw new Error('Invalid type');
        }
        else if (s_types[i_type] !== undefined) {
            throw new Error('Type "' + i_type + '" alreday exists');
        }
        else if (typeof i_impl !== 'function') {
            throw new Error('Invalid type "' + i_type + '" implmentation');
        }
        else {
            s_types[i_type] = i_impl;
        }
    }
    ObjectLifecycleManager._add_type = _add_type;
    function _add_extension(i_impl) {
        if (typeof i_impl === 'function' && typeof i_impl.isExtension === 'function') {
            s_extensions.push(i_impl);
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
