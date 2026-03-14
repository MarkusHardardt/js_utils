(function (root) {
    "use strict";
    const GraphControl = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Mathematics = isNodeJS ? require('./Mathematics.js') : root.Mathematics;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    const RAD2DEG = Mathematics.RAD2DEG;
    const DEG2RAD = Mathematics.DEG2RAD;
    const PI = Math.PI;
    const TWO_PI = PI + PI;
    // zoom factor: double by three clicks: Math.exp(Math.log(2)/3)
    const ZOOM_FACTOR = Math.exp(Math.log(2) / 3);

    function getCanvasAttribute(hmiObject, attribute) {
        let object = hmiObject;
        while (object !== null && typeof object === 'object') {
            let val = object[attribute];
            if (val !== undefined) {
                return val;
            } else if (object._hmi_canvas !== undefined) {
                // this is our canvas root object so we must not search on higher level
                return undefined;
            }
            const child = object.hmi_locator;
            if (child !== undefined) {
                val = child[attribute];
                if (val !== undefined) {
                    return val;
                }
            }
            object = object.hmi_parentObject;
        }
        return undefined;
    }

    function getCanvasPixel(object, attribute, scale, defaultValue) {
        const val = getCanvasAttribute(object, attribute);
        const pix = ObjectLifecycleManager.getPixelValue(val);
        return typeof pix === 'number' ? pix : (typeof val === 'number' ? val * scale : defaultValue);
    }

    function getPixelSize(value, scale, defaultValue) {
        const pix = ObjectLifecycleManager.getPixelValue(value);
        return typeof pix === 'number' ? pix : (typeof value === 'number' ? value * scale : defaultValue);
    }

    function applyZoom(that, disableVisuEvents, enableEditorEvents) {
        let _p = {};
        let _cont = that._hmi_context.container;
        let _tf = that._hmi_context.transform;
        let _bounds = that.bounds;
        let _mouse = false, _id1, _x1, _y1, _ix1, _iy1, _id2, _x2, _y2, _ix2, _iy2, _di = undefined;
        that._hmi_handleZoomEvent = (event, type) => {
            const offs = _cont.offset();
            const tt = event.originalEvent ? event.originalEvent.targetTouches : undefined;
            switch (type) {
                case MOUSEEVENT_MOUSEDOWN:
                    that._hmi_event = event;
                    _mouse = true;
                    _ix1 = event.clientX - offs.left;
                    _iy1 = event.clientY - offs.top;
                    _tf.transformInverse(_ix1, _iy1, _p);
                    _x1 = _p.x;
                    _y1 = _p.y;
                    if (enableEditorEvents === true && event.button === 2) {
                        console.log(`x: ${_x1}, y: ${_y1}`);
                    }
                    break;
                case MOUSEEVENT_MOUSEMOVE:
                    if (_mouse && _bounds) {
                        delete _bounds.x;
                        delete _bounds.y;
                        delete _bounds.width;
                        delete _bounds.height;
                        _ix1 = event.clientX - offs.left;
                        _iy1 = event.clientY - offs.top;
                        _tf.initForPoint(_x1, _y1, _ix1, _iy1);
                        _tf.transformInverse(0, 0, _p);
                        _bounds.x1 = _p.x;
                        _bounds.y1 = _p.y;
                        _tf.transformInverse(_cont.width(), _cont.height(), _p);
                        _bounds.x2 = _p.x;
                        _bounds.y2 = _p.y;
                        that._hmi_event = event;
                    }
                    break;
                case MOUSEEVENT_MOUSEUP:
                    if (_mouse && _bounds) {
                        delete _bounds.x;
                        delete _bounds.y;
                        delete _bounds.width;
                        delete _bounds.height;
                        _tf.initForPoint(_x1, _y1, event.clientX - offs.left, event.clientY - offs.top);
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
                        if (event.originalEvent && typeof event.originalEvent.wheelDelta === 'number' && event.originalEvent.wheelDelta !== 0) {
                            const wd = event.originalEvent.wheelDelta / 120;
                            // scrolling without shift down (scrolling up: wd > 0)
                            delete _bounds.x;
                            delete _bounds.y;
                            delete _bounds.width;
                            delete _bounds.height;
                            // first get the current metric scroll location
                            _tf.transformInverse(event.clientX - offs.left, event.clientY - offs.top, _p);
                            const x = _p.x;
                            const y = _p.y;
                            // next get the current metric bound locations
                            _tf.transformInverse(0, 0, _p);
                            const x1 = _p.x;
                            const y1 = _p.y;
                            _tf.transformInverse(_cont.width(), _cont.height(), _p);
                            const x2 = _p.x;
                            const y2 = _p.y;
                            // finally adjust the bounds
                            const zoom = wd > 0 ? wd / ZOOM_FACTOR : -wd * ZOOM_FACTOR;
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
                                that._hmi_event = event;
                                const t = tt[0];
                                _id1 = t.identifier;
                                _ix1 = t.clientX - offs.left;
                                _iy1 = t.clientY - offs.top;
                                _tf.transformInverse(_ix1, _iy1, _p);
                                _x1 = _p.x;
                                _y1 = _p.y;
                                break;
                            case 2:
                                if (that.multitouch === true) {
                                    that._hmi_event = event;
                                    const t = tt[1];
                                    if (t.identifier === _id1) {
                                        t = tt[0];
                                    }
                                    _id2 = t.identifier;
                                    _ix2 = t.clientX - offs.left;
                                    _iy2 = t.clientY - offs.top;
                                    _tf.transformInverse(_ix2, _iy2, _p);
                                    _x2 = _p.x;
                                    _y2 = _p.y;
                                    const dix = (_ix2 - _ix1);
                                    const diy = (_iy2 - _iy1);
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
                                that._hmi_event = event;
                                const t = tt[0];
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
                                    that._hmi_event = event;
                                    const t1 = tt[0];
                                    const t2 = tt[1];
                                    if (t2.identifier === _id1) {
                                        const t = t1;
                                        t1 = t2;
                                        t2 = t;
                                    }
                                    const ix1 = t1.clientX - offs.left;
                                    const iy1 = t1.clientY - offs.top;
                                    const ix2 = t2.clientX - offs.left;
                                    const iy2 = t2.clientY - offs.top;
                                    if (that.zoom_rotation === true) { // TODO: Why is this not running?
                                        _tf.initForPoints(_x1, _y1, _x2, _y2, ix1, iy1, ix2, iy2);
                                        // we got to set this flag because the standard
                                        // initForBounds()
                                        // method does not handle rotation
                                        that._hmi_rotated = true;
                                    } else {
                                        delete _bounds.x;
                                        delete _bounds.y;
                                        delete _bounds.width;
                                        delete _bounds.height;
                                        const dix = (ix2 - ix1);
                                        const diy = (iy2 - iy1);
                                        const di = Math.sqrt(dix * dix + diy * diy);
                                        const s = di / _di;
                                        const ix = (ix1 + ix2) / 2;
                                        const iy = (iy1 + iy2) / 2;
                                        const dx2 = (_ix2 - _ix1) / 2 * s;
                                        const dy2 = (_iy2 - _iy1) / 2 * s;
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
                                that._hmi_event = event;
                                const t = tt[0];
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
        that._hmi_destroys.push(() => {
            delete that._hmi_handleZoomEvent;
            delete that._hmi_event;
            delete that._hmi_rotated;
            _bounds = undefined;
            _p = undefined;
            _cont = undefined;
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
    }

    const REQUIRED_CONTEXT2D_METHODS = ['save', 'restore', 'setTransform', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arcTo', 'stroke', 'fill', 'translate', 'rotate', 'scale', 'arc', 'rect', 'fillText', 'strokeText', 'drawImage'];
    function isValidContext2d(context) {
        for (let i = 0; i < REQUIRED_CONTEXT2D_METHODS.length; i++) {
            if (typeof context[REQUIRED_CONTEXT2D_METHODS[i]] !== 'function') {
                return REQUIRED_CONTEXT2D_METHODS[i];
            }
        }
        return true;
    }

    function validateAsContext2d(instance) { // TODO: Use or remove
        return Core.validateAs('Context2d', instance, [
            'save|function',
            'restore|function',
            'setTransform|function',
            'clearRect|function',
            'fillRect|function',
            'strokeRect|function',
            'beginPath|function',
            'closePath|function',
            'moveTo|function',
            'lineTo|function',
            'arcTo|function',
            'stroke|function',
            'fill|function',
            'translate|function',
            'rotate|function',
            'scale|function',
            'arc|function',
            'rect|function',
            'fillText|function',
            'strokeText|function',
            'drawImage|function'
        ], false);
    }

    /**
     * <code> compare(1,2)
     * 2 \ 1 |  f  |  l  |  b
     * ------+-----+-----+------
     *     f | 0 #1|-1 #4|-1 #7
     *     l | 1 #2| X #5|-1 #8
     *     b | 1 #3| 1 #6| 0 #9
     * </code>
     */
    function compareGraphicObjectLayer(object1, object2, mirror) {
        const z1 = object1._hmi_z;
        const z2 = object2._hmi_z;
        if (z1 === 'foreground') {
            // #1 or #2/#3
            return z2 === 'foreground' ? Sorting.EQUAL : Sorting.BIGGER;
        } else if (z1 === 'background') {
            // #9 or #7/#8
            return z2 === 'background' ? Sorting.EQUAL : Sorting.SMALLER;
        } else {
            if (z2 === 'foreground') {
                // #4
                return Sorting.SMALLER;
            } else if (z2 === 'background') {
                // #6
                return Sorting.BIGGER;
            } else {
                // #5
                if (typeof z1 === 'number') {
                    const res = Sorting.compareNumber(z1, typeof z2 === 'number' ? z2 : 0);
                    return mirror ? -res : res;
                } else if (typeof z2 === 'number') {
                    const res = Sorting.compareNumber(0, z2);
                    return mirror ? -res : res;
                } else {
                    return Sorting.EQUAL;
                }
            }
        }
    }

    // graph types
    const ARC = 1;
    const RECT = 2;
    const IMAGE = 3;
    const TEXT = 4;
    const PATH = 5;
    const CURVE = 6;

    const EVENT_CROSS_SIZE = 20;
    function strokeCross(context, x, y) {
        context.beginPath();
        context.moveTo(x - EVENT_CROSS_SIZE, y - EVENT_CROSS_SIZE);
        context.lineTo(x + EVENT_CROSS_SIZE, y + EVENT_CROSS_SIZE);
        context.moveTo(x - EVENT_CROSS_SIZE, y + EVENT_CROSS_SIZE);
        context.lineTo(x + EVENT_CROSS_SIZE, y - EVENT_CROSS_SIZE);
        context.stroke();
    }

    function updateBounds(bounds, x, y) {
        // get the current bound values
        const x1 = bounds.x1, y1 = bounds.y1, x2 = bounds.x2, y2 = bounds.y2;
        if (x1 === undefined || x < x1) {
            bounds.x1 = x;
        }
        if (y1 === undefined || y < y1) {
            bounds.y1 = y;
        }
        if (x2 === undefined || x > x2) {
            bounds.x2 = x;
        }
        if (y2 === undefined || y > y2) {
            bounds.y2 = y;
        }
    }

    const s_bounds_transform = new Mathematics.Transform();

    const s_layouts_regex = {
        finalNullRequired: false,
        first: /\b(?:top|bottom|left|right)\b/g,
        next: {
            'top': /\b(?:left|right)\b/g,
            'bottom': /\b(?:left|right)\b/g,
            'left': /\b(?:top|bottom)\b/g,
            'right': /\b(?:top|bottom)\b/g,
        },
        convertMatchToId: id => id
    };

    function layoutChildren(children, layoutRules, separator) { // TODO: Check if this still works after refactoring
        // check for layout rules
        const layout = layoutRules && typeof layoutRules === 'string' && layoutRules.length > 0 ? layoutRules : '';
        const layoutParts = [];
        Regex.analyse(s_layouts_regex, layout, layoutParts);
        const first = layoutParts[0], second = layoutParts[1];
        // default for first rule is vertical
        const vertical1 = !first || /^(?:top|bottom)$/.test(first);
        // default for first rule in vertical mode is decreasing but in horizontal
        // mode it is increasing
        const inc1 = first ? (vertical1 ? /^bottom$/.test(first) : /^left$/.test(first)) : (vertical1 ? false : true);
        // default for second rule in vertical mode is increasing but in horizontal
        // mode it is decreasing
        const inc2 = second ? (vertical1 ? /^left$/.test(second) : /^bottom$/.test(second)) : (vertical1 ? true : false);
        // get the first and second child attribute names
        const v1 = vertical1 ? 'y' : 'x', v2 = vertical1 ? 'x' : 'y';
        // get the first and second bounds attribute names
        const v11 = v1 + '1', v12 = v1 + '2', v21 = v2 + '1', v22 = v2 + '2';
        // we got to update our childrens layouts and bounds
        const len = children.length;
        let sta = 0, end, cen1, dim2, off1 = 0, off2 = 0, val1, val2, min1, max1;
        // compute the separator
        const sep = typeof separator === 'number' && separator >= 0.0 ? separator : 0.0;
        while (sta < len) {
            // set end to next position and search next new line
            end = sta + 1;
            while (end < len && children[end].next !== true) {
                end++;
            }
            // we got to handle the second dimension next
            dim2 = 0;
            cen1 = -1;
            min1 = undefined;
            max1 = undefined;
            // collect some dimension parameters
            for (let i = sta; i < end; i++) {
                // get the child and its hmi object bounds
                const child = children[i];
                const object = child.hmi_object;
                if (child !== object) {
                    object.hmi_updateBounds();
                    const bounds = object.bounds;
                    const val11 = bounds[v11];
                    const val12 = bounds[v12];
                    const val21 = bounds[v21];
                    const val22 = bounds[v22];
                    if (typeof val11 === 'number' && typeof val12 === 'number' && typeof val21 === 'number' && typeof val22 === 'number') {
                        bounds._hmi_valid = true;
                        // compute the dimension
                        const d1 = val12 - val11;
                        const d2 = val22 - val21;
                        // store temporary
                        bounds._hmi_d1 = d1;
                        bounds._hmi_d2 = d2;
                        // for the first dimension we are interested in min and max
                        if (child.align2 === true) {
                            val2 = val12;
                            val1 = val11;
                        } else {
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
                    let child = children[cen1];
                    let object = child.hmi_object;
                    let bounds = object.bounds;
                    if (child !== object && bounds._hmi_valid === true) {
                        if (inc2) {
                            let off2 = bounds[v21];
                            for (let i = cen1 - 1; i >= sta; i--) {
                                child = children[i];
                                object = child.hmi_object;
                                bounds = object.bounds;
                                if (child !== object && bounds._hmi_valid === true) {
                                    if (i > sta) {
                                        off2 -= sep;
                                    }
                                    off2 -= bounds._hmi_d2;
                                }
                            }
                        } else {
                            off2 = bounds[v22];
                            for (let i = cen1 + 1; i < end; i++) {
                                child = children[i];
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
                } else { // no explicit center means we center the whole row
                    off2 = (inc2 ? -dim2 : dim2) / 2;
                }
                dif1 = max1 - min1;
                off1 += inc1 ? -min1 : -max1;
                // write locations
                for (let i = sta; i < end; i++) {
                    const child = children[i];
                    const object = child.hmi_object;
                    const bounds = object.bounds;
                    if (child !== object && bounds._hmi_valid === true) {
                        if (child.align2 === true) {
                            child[v1] = off1;
                        } else {
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
    }

    // mouse events
    const MOUSEEVENT_CLICK = 1;
    const MOUSEEVENT_DBLCLICK = 2;
    const MOUSEEVENT_HOVER = 3;
    const MOUSEEVENT_MOUSEDOWN = 4;
    const MOUSEEVENT_MOUSEENTER = 5;
    const MOUSEEVENT_MOUSELEAVE = 6;
    const MOUSEEVENT_MOUSEMOVE = 7;
    const MOUSEEVENT_MOUSEOUT = 8;
    const MOUSEEVENT_MOUSEOVER = 9;
    const MOUSEEVENT_MOUSEUP = 10;
    const MOUSEEVENT_CONTEXTMENU = 11;
    const MOUSEEVENT_MOUSEWHEEL = 12;
    // touch events
    const TOUCHEVENT_TOUCHSTART = 20;
    const TOUCHEVENT_TOUCHENTER = 21;
    const TOUCHEVENT_TOUCHMOVE = 22;
    const TOUCHEVENT_TOUCHEND = 23;
    const TOUCHEVENT_TOUCHLEAVE = 24;
    const TOUCHEVENT_TOUCHCANCEL = 25;

    function applyEventListener(that, context, onEvent) {
        let _cont = context.container;
        let _listening = false;
        // callbacks for mouse events
        function mouseevent_click(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_CLICK);
        }
        function mouseevent_dblclick(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_DBLCLICK);
        }
        function mouseevent_hover(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_HOVER);
        }
        function mouseevent_mousedown(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEDOWN);
        }
        function mouseevent_mouseenter(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEENTER);
        }
        function mouseevent_mouseleave(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSELEAVE);
        }
        function mouseevent_mousemove(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEMOVE);
        }
        function mouseevent_mouseout(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEOUT);
        }
        function mouseevent_mouseover(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEOVER);
        }
        function mouseevent_mouseup(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEUP);
        }
        function mouseevent_contextmenu(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_CONTEXTMENU);
        }
        function mouseevent_mousewheel(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, MOUSEEVENT_MOUSEWHEEL);
        }
        // callbacks for touch events
        function touchevent_touchstart(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, TOUCHEVENT_TOUCHSTART);
        }
        function touchevent_touchenter(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, TOUCHEVENT_TOUCHENTER);
        }
        function touchevent_touchmove(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, TOUCHEVENT_TOUCHMOVE);
        }
        function touchevent_touchend(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, TOUCHEVENT_TOUCHEND);
        }
        function touchevent_touchleave(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, TOUCHEVENT_TOUCHLEAVE);
        }
        function touchevent_touchcancel(event) {
            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
            onEvent(event, TOUCHEVENT_TOUCHCANCEL);
        }
        that._hmi_addEventListeners = () => {
            if (_listening === false) {
                _listening = true;
                if (typeof onEvent === 'function') {
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
        that._hmi_removeEventListeners = () => {
            if (_listening === true) {
                _listening = false;
                if (typeof onEvent === 'function') {
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
        that._hmi_destroys.push(() => {
            ObjectLifecycleManager.removeEventListener(that);
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
        that._hmi_addEventListeners();
        ObjectLifecycleManager.addEventListener(that);
    }

    function isNumberOrPixelValue(value) {
        if (typeof value === 'string') {
            const idx = value.indexOf('px');
            return idx > 0 && isNaN(value.substring(0, idx)) === false;
        } else {
            return typeof value === 'number';
        }
    }

    function applyGraphicObject(that, context, disableVisuEvents, enableEditorEvents, onSuccess, onError) {
        that._hmi_graphics = true;
        that._hmi_isButton = typeof that.pressed === 'function';
        // here we store some internal data for performance reasons
        let _children = undefined;
        let _curves = undefined;
        let onEvent = undefined;
        let clicked = undefined;
        let _p = {};
        let _cont = that._hmi_context.container;
        let _ctx = that._hmi_context.context2d;
        let _tf = that._hmi_context.transform;
        if (_ctx === undefined) {
            ObjectLifecycleManager.applyDefaultHtmlObject(that);
            // no context so far so we are the root object
            that._hmi_graphicsRoot = true;
            /*
             * We need only one single canvas to draw our whole graphical objects
             * tree. Within the next lines we create the canvas, store the context and
             * create and store the base transform.
             */
            _cont.addClass('overflow-hidden');
            const width = Math.floor(_cont.width());
            const height = Math.floor(_cont.height());
            that._hmi_canvas = $(`<canvas width="${width}" height="${height}" />`);
            that._hmi_canvas.appendTo(_cont);
            _ctx = that._hmi_canvas[0].getContext('2d');
            that._hmi_context.context2d = _ctx;
            that._hmi_validContext2d = isValidContext2d(_ctx);
            // if valid
            if (that._hmi_validContext2d === true) {
                _ctx.save();
                _tf = new Mathematics.Transform();
                that._hmi_context.transform = _tf;
                _tf.initForBounds(that.bounds, width, height, that.mirrorX === true, that.mirrorY !== false);
                // here we store our visible and paintable objects during repaint
                that._hmi_canvasElements = [];
                // handle resize
                that._hmi_resizes.push(() => {
                    // just resize the canvas (the repaint will be performed anyway at
                    // refresh calls)
                    const width = _cont.width();
                    const height = _cont.height();
                    if (width > 0 && height > 0) {
                        const canvas = that._hmi_canvas[0];
                        canvas.width = Math.floor(width);
                        canvas.height = Math.floor(height);
                    }
                });
                let _white = true;
                // handle refresh
                that._hmi_refreshs.push(date => {
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
                    const width = _cont.width();
                    const height = _cont.height();
                    // if repaint is required and we are visible
                    if (width > 0 && height > 0) {
                        // initialize base transform [1]
                        if (that._hmi_rotated !== true) {
                            _tf.initForBounds(that.bounds, width, height, that.mirrorX === true, that.mirrorY !== false);
                        }
                        // handle curves if available
                        if (_curves) {
                            for (let i = 0; i < _curves.length; i++) {
                                const curve = _curves[i];
                                const cu = curve._hmi_curveImpl;
                                if (cu && cu.adjust) {
                                    cu.adjust();
                                }
                            }
                        }
                        // moving vehicles [2]
                        ObjectLifecycleManager.processObjectSubTree(that, true, hmiObject => _ctx === hmiObject._hmi_context.context2d, hmiObject => {
                            const vps = hmiObject._hmi_vps;
                            const segments = hmiObject._hmi_segments;
                            const id = hmiObject.id;
                            delete hmiObject.hmi_vehicleSegment;
                            delete hmiObject.hmi_vehiclePosition;
                            delete hmiObject.hmi_vehiclePositionAdjusted;
                            if (vps && segments && id !== undefined) {
                                let visible = false;
                                if (vps.hmi_getLocation(id, _p)) {
                                    const seg_idx = _p.segment;
                                    const seg = seg_idx >= 0 && seg_idx < segments.length ? segments[seg_idx] : undefined;
                                    if (seg) {
                                        const cursec = seg._hmi_curveSection;
                                        const posadj = seg._hmi_positionAdjuster;
                                        if (cursec && posadj) {
                                            // get the raw position
                                            let rawpos = _p.position;
                                            // if we got an offset we add it to our raw position
                                            const vps_offset = hmiObject.vps_offset;
                                            if (typeof vps_offset === 'number') {
                                                rawpos += vps_offset;
                                            }
                                            // get the vehicle position
                                            const vhpos = posadj.adjust(rawpos);
                                            // if stress is required and we got a stressable rope
                                            // curve we update out stress position
                                            const curve = seg._hmi_curve;
                                            if (hmiObject.stress === true && curve && curve.setVehiclePosition) {
                                                // update vehicle position
                                                curve.setVehiclePosition(cursec.fromSectionToCurve(vhpos));
                                            }
                                            // if we found a segment we update out vehicle locator
                                            // (hmiObject.hmi_locator) for the vehicle position on
                                            // the found segment
                                            cursec.transform(vhpos, undefined, hmiObject.hmi_locator);
                                            hmiObject.hmi_vehicleSegment = seg_idx;
                                            hmiObject.hmi_vehiclePosition = rawpos;
                                            hmiObject.hmi_vehiclePositionAdjusted = vhpos;
                                            hmiObject._hmi_vehicleCurveSection = cursec;
                                            hmiObject._hmi_vehiclePositionAdjuster = posadj;
                                            visible = true;
                                        }
                                    }
                                }
                                hmiObject.hmi_setVisible(visible);
                            }
                        });
                        // collect and update [3]
                        const elems = that._hmi_canvasElements;
                        elems.splice(0, elems.length);
                        ObjectLifecycleManager.processObjectSubTree(that, true, hmiObject => _ctx === hmiObject._hmi_context.context2d, hmiObject => {
                            if (hmiObject._hmi_updateChildrenTransforms) {
                                hmiObject._hmi_updateChildrenTransforms();
                            }
                            if (hmiObject._hmi_repaint) {
                                let obj = hmiObject;
                                let visible = obj._hmi_visible;
                                while (visible && obj._hmi_graphicsRoot !== true) {
                                    obj = obj.hmi_parentObject;
                                    visible = obj._hmi_visible;
                                }
                                if (visible) {
                                    hmiObject._hmi_z = getCanvasAttribute(hmiObject, 'z');
                                    const idx = Sorting.getInsertionIndex(hmiObject, elems, false, (o1, o2) => compareGraphicObjectLayer(o1, o2, that.mirrorZ === true));
                                    elems.splice(idx, 0, hmiObject);
                                }
                            }
                        });
                        // paint [4]
                        _ctx.setTransform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                        _ctx.clearRect(0, 0, width, height);
                        _ctx.save();
                        for (let i = 0; i < elems.length; i++) {
                            elems[i]._hmi_repaint(date);
                        }
                        // if editor
                        if (disableVisuEvents === true && that._hmi_mouseMoveX !== undefined && that._hmi_mouseMoveY !== undefined) {
                            const x = that._hmi_mouseMoveX;
                            const y = that._hmi_mouseMoveY;
                            for (let i = 0; i < elems.length; i++) {
                                const e = elems[i];
                                if (e._hmi_isPointOnObject && e._hmi_repaint) {
                                    const result = e._hmi_isPointOnObject(x, y);
                                    if (result) {
                                        // console.log('IN');
                                        e._hmi_repaint(date);
                                    }
                                }
                            }
                        }
                        const evt = that._hmi_event;
                        if (evt) {
                            // draw mouse or touch points
                            _ctx.lineWidth = 1;
                            _ctx.strokeStyle = _white ? 'white' : 'black';
                            _white = _white === false;
                            const offs = _cont.offset();
                            const tt = evt.originalEvent ? evt.originalEvent.targetTouches : undefined;
                            if (tt) {
                                for (let i = 0; i < tt.length; i++) {
                                    const t = tt[i];
                                    strokeCross(_ctx, t.clientX - offs.left, t.clientY - offs.top);
                                }
                            } else {
                                strokeCross(_ctx, evt.clientX - offs.left, evt.clientY - offs.top);
                            }
                        } else {
                            _white = true;
                        }
                        _ctx.restore();
                    }
                });
                if (that.zoom === true && that.bounds !== null && typeof that.bounds === 'object') {
                    applyZoom(that, disableVisuEvents, enableEditorEvents);
                }
                // TODO make this running
                if (false && disableVisuEvents === true) {
                    // TODO why do we have to copy this reference???
                    const container = _cont;
                    function on_mouse_move(event) {
                        // const rect = that._hmi_canvas.getBoundingClientRect();
                        const rect = container.offset();
                        that._hmi_mouseMoveX = event.clientX - rect.left;
                        that._hmi_mouseMoveY = event.clientY - rect.top;
                    };
                    container.on('mousemove', on_mouse_move);
                    that._hmi_destroys.push(() => {
                        container.off('mousemove', on_mouse_move);
                        on_mouse_move = undefined;
                    });
                }
                clicked = (event, x, y) => {
                    let search = true;
                    _ctx.setTransform(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
                    _ctx.save();
                    ObjectLifecycleManager.processObjectSubTree(that, true, hmiObject => search && _ctx === hmiObject._hmi_context.context2d, hmiObject => {
                        if (search && hmiObject._hmi_isButton && _ctx === hmiObject._hmi_context.context2d && hmiObject._hmi_isPointOnObject) {
                            let obj = hmiObject;
                            let visible = obj._hmi_visible;
                            while (visible && obj._hmi_graphicsRoot !== true) {
                                obj = obj.hmi_parentObject;
                                visible = obj._hmi_visible;
                            }
                            if (visible) {
                                if (hmiObject._hmi_isPointOnObject(x, y)) {
                                    search = false;
                                    try {
                                        hmiObject.pressed(event);
                                    } catch (error) {
                                        console.error(`Failed calling pressed(): ${hmiObject.pressed.toString()}`, error);
                                    }
                                }
                            }
                        }
                    });
                    _ctx.restore();
                };
                onEvent = (event, type) => {
                    switch (type) {
                        case MOUSEEVENT_MOUSEDOWN:
                            {
                                const offs = _cont.offset();
                                clicked(event, event.clientX - offs.left, event.clientY - offs.top);
                                break;
                            }
                        case TOUCHEVENT_TOUCHSTART:
                            {
                                const offs = _cont.offset();
                                const tt = event.originalEvent ? event.originalEvent.targetTouches : undefined;
                                if (tt && tt[0]) {
                                    clicked(event, tt[0].clientX - offs.left, tt[0].clientY - offs.top);
                                }
                                break;
                            }
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
                        that._hmi_handleZoomEvent(event, type);
                    }
                };
                applyEventListener(that, context, onEvent);
            } else {
                that._hmi_canvas.remove();
                let div = '<div style="box-sizing: border-box;position: relative;width: 100%;height: 100%;"><h1>';
                div += '!!! INVALID CANVAS CONTEXT 2D !!!';
                div += '</h1><br><b>';
                div += 'Your browser does not support the required canvas rendering context methods!';
                div += '</b><br><br>Developer information:<br>first missing: canvas.context2d.';
                div += that._hmi_validContext2d;
                div += '()</div>';
                $(div).appendTo(_cont);
            }
        } else {
            that.hmi_setVisible = visible => that._hmi_visible = visible === true;
            that.hmi_isVisible = () => that._hmi_visible;
        }
        that.hmi_setImageSource = (source, onLoad) => {
            that.image = source;
            if (that._hmi_image === undefined) {
                that._hmi_image = new Image();
            }
            that._hmi_image.onload = onLoad;
            that._hmi_image.src = source;
        };
        that.hmi_getImageWidth = () => {
            const img = that._hmi_image;
            return img !== undefined ? img.naturalWidth : undefined;
        };
        that.hmi_getImageHeight = () => {
            const img = that._hmi_image;
            return img !== undefined ? img.naturalHeight : undefined;
        };
        let tasks = [];
        if (typeof that.image === 'string') {
            tasks.push((onSuc, onErr) => that.hmi_setImageSource(that.image, onSuc, onErr));
        }
        that.hmi_text = text => {
            if (text !== undefined && text !== null) {
                that.text = typeof text === 'string' ? text : text.toString();
            } else {
                return that.text;
            }
        };
        that.hmi_getGraphTextSize = (config, text, result) => {
            const res = result || {};
            _ctx.save();
            const scale = _tf.scale;
            let fontSize = getCanvasPixel(config, 'fontSize', scale);
            if (typeof fontSize !== 'number') {
                fontSize = 10;
            }
            let font = config.bold === true ? 'bold ' : '';
            font += Math.ceil(fontSize);
            font += 'px';
            const fontFamily = getCanvasAttribute(config, 'fontFamily');
            font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
            _ctx.font = font;
            if (Array.isArray(text)) {
                let width = 0.0;
                for (let i = 0; i < text.length; i++) {
                    let txt = text[i];
                    if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                        txt = txt.toString();
                    }
                    width = Math.max(width, _ctx.measureText(txt).width);
                }
                res.width = width / scale;
                res.height = text.length * fontSize / scale;
            } else {
                let txt = text;
                if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                    txt = txt.toString();
                }
                res.width = _ctx.measureText(txt).width / scale;
                res.height = fontSize / scale;
            }
            _ctx.restore();
            return res;
        };
        that._hmi_repaint = date => {
            // The following function paints the current object on our canvas using our coordinate system transform.
            // To perform fast we try to find out if anything must be painted (or not) as soon as possible.
            const paint = that.paint;
            if (typeof paint === 'function') {
                try {
                    paint.call(that, date);
                    return true;
                } catch (error) {
                    console.error(`Failed calling paint(): ${paint.toString()}`, error);
                    return false;
                }
            }
            // get some parameters
            const scale = _tf.scale;
            let r = that.r;
            let w = that.width;
            let h = that.height;
            const text = that.text;
            let fontSize = undefined;
            const points = that.points;
            let type = undefined;
            const img = that._hmi_image;
            const curve = that._hmi_curve;
            const from = that.hmi_from;
            const to = that.hmi_to;
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // In the next blocks we update some values and try to find out what we
            // are (arc, text, rect, image or path) and if we are visible
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            if (r !== undefined) {
                r = getPixelSize(r, scale);
                if (typeof r !== 'number' || r <= 0.5) {
                    return false;
                }
                type = ARC;
            } else if (w !== undefined && h !== undefined) {
                w = getPixelSize(w, scale);
                h = getPixelSize(h, scale);
                if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                    return false;
                }
                if (img !== undefined) {
                    if (typeof img.naturalWidth !== 'number' || img.naturalWidth <= 1 || typeof img.naturalHeight !== 'number' || img.naturalHeight <= 1) {
                        return false;
                    }
                    type = IMAGE;
                } else {
                    type = RECT;
                }
            } else if (w !== undefined && img !== undefined) {
                w = getPixelSize(w, scale);
                if (typeof w !== 'number' || w < 0.5) {
                    return false;
                }
                h = Math.floor(w * img.naturalHeight / img.naturalWidth);
                w = Math.floor(w);
                type = IMAGE;
            } else if (h !== undefined && img !== undefined) {
                h = getPixelSize(h, scale);
                if (typeof h !== 'number' || h < 0.5) {
                    return false;
                }
                w = Math.floor(h * img.naturalWidth / img.naturalHeight);
                h = Math.floor(h);
                type = IMAGE;
            } else if (text !== undefined) {
                fontSize = getCanvasPixel(that, 'fontSize', scale);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                } else if (fontSize < 2) {
                    return false;
                }
                type = TEXT;
            } else if (Array.isArray(points) && points.length >= 2) {
                type = PATH;
            } else if (curve && curve.stroke && typeof from === 'number' && typeof to === 'number') {
                type = CURVE;
            } else if (img) {
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
            let x = that.x;
            if (typeof x !== 'number') {
                x = 0.0;
            }
            let y = that.y;
            if (typeof y !== 'number') {
                y = 0.0;
            }
            _tf.transform(x, y, _p);
            const ox = _p.x;
            const oy = _p.y;
            const mx = _tf.mirrorX;
            const my = _tf.mirrorY;
            const tfrot = _tf.rotation;
            _ctx.save();
            switch (type) {
                case IMAGE:
                case RECT:
                case TEXT:
                    let sc = that.scale;
                    if (typeof sc !== 'number') {
                        sc = 1.0;
                    }
                    const phi = that.phi;
                    const angle = that.angle;
                    if (typeof phi === 'number') {
                        _ctx.translate(ox, oy);
                        let theta = mx === my ? phi : -phi;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    } else if (typeof angle === 'number') {
                        _ctx.translate(ox, oy);
                        let theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    } else if (that.upright !== true) {
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
            const closed = that.closed === true;
            switch (type) {
                case ARC:
                    // try to get the angles
                    let phi1 = 0;
                    let phi2 = TWO_PI;
                    if (typeof that.phi1 === 'number' && typeof that.phi2 === 'number') {
                        phi1 = that.phi1;
                        phi2 = that.phi2;
                    } else if (typeof that.angle1 === 'number' && typeof that.angle2 === 'number') {
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
                    ObjectLifecycleManager.getAlignment(that.align, _p, mx, my);
                    const x = ox - _p.x * w;
                    const y = oy - _p.y * h;
                    const rb = getCanvasPixel(that, 'roundBorder', scale);
                    if (typeof rb === 'number' && rb > 1.0) {
                        // start 1. round edge
                        const xw = x + w;
                        const xr = xw - rb;
                        _ctx.moveTo(xr, y);
                        const yh = y + h;
                        _ctx.arcTo(xw, y, xw, yh, rb);
                        // 2. round edge
                        _ctx.arcTo(xw, yh, x, yh, rb);
                        // 3. round edge
                        _ctx.arcTo(x, yh, x, y, rb);
                        // 4. round edge
                        _ctx.arcTo(x, y, xr, y, rb);
                        _ctx.closePath();
                    } else {
                        _ctx.rect(x, y, w, h);
                    }
                    break;
                case PATH:
                    _ctx.beginPath();
                    const len = points.length;
                    for (let i = 0; i < len; i++) {
                        const p = points[i];
                        const rad = p.r;
                        _tf.transform(p.x, p.y, _p);
                        const x1 = _p.x;
                        const y1 = _p.y;
                        if (i === 0 || p.move === true) {
                            _ctx.moveTo(x1, y1);
                        } else if (typeof rad === 'number' && rad > 0.0 && (closed ? i < len : i < len - 1)) {
                            const p = points[(i + 1) % len];
                            _tf.transform(p.x, p.y, _p);
                            const x2 = _p.x;
                            const y2 = _p.y;
                            _ctx.arcTo(x1, y1, x2, y2, rad * scale);
                        } else {
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
            let stroke = false;
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
            let fill = false;
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
                        const lineCap = getCanvasAttribute(that, 'lineCap');
                        if (typeof lineCap === 'string') {
                            _ctx.lineCap = lineCap;
                        }
                        const lineJoin = getCanvasAttribute(that, 'lineJoin');
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
                        const fillStyle = getCanvasAttribute(that, 'fillStyle');
                        if (typeof fillStyle === 'string') {
                            _ctx.fillStyle = fillStyle;
                        }
                    }
                    if (stroke) {
                        const lineWidth = getCanvasPixel(that, 'lineWidth', scale);
                        if (typeof lineWidth === 'number') {
                            _ctx.lineWidth = lineWidth;
                        }
                        const strokeStyle = getCanvasAttribute(that, 'strokeStyle');
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
                        const cs = that._hmi_curveSection;
                        let left = 0.0;
                        const l = that.left;
                        if (typeof l === 'number') {
                            left = l;
                        } else {
                            const r = that.right;
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
                        let fontSize = getCanvasPixel(that, 'fontSize', scale);
                        if (typeof fontSize !== 'number') {
                            fontSize = 10;
                        }
                        let font = that.bold === true ? 'bold ' : '';
                        font += Math.floor(fontSize);
                        font += 'px';
                        const fontFamily = getCanvasAttribute(that, 'fontFamily');
                        font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                        _ctx.font = font;
                        ObjectLifecycleManager.getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                        _ctx.textAlign = 'center';
                        _ctx.textBaseline = 'middle';
                        if (Array.isArray(text)) {
                            const y0 = oy - (_p.y * text.length - 0.5) * fontSize;
                            for (let i = 0; i < text.length; i++) {
                                let txt = text[i];
                                if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                    txt = txt.toString();
                                }
                                const x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                                const y = y0 + i * fontSize;
                                if (fill) {
                                    _ctx.fillText(txt, x, y);
                                }
                                if (stroke) {
                                    _ctx.strokeText(txt, x, y);
                                }
                            }
                        } else {
                            let txt = text;
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            const x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                            const y = oy - (_p.y - 0.5) * fontSize;
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
                    ObjectLifecycleManager.getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                    const x = ox - _p.x * w;
                    const y = oy - _p.y * h;
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
        // TODO: Go on here
        that._hmi_isPointOnObject = (pixelX, pixelY) => {
            const paint = that.paint;
            if (typeof paint === 'function') {
                return false;
            }
            const scale = _tf.scale;
            let r = that.r;
            let w = that.width;
            let h = that.height;
            const text = that.text;
            let fontSize = undefined;
            const points = that.points;
            let type = undefined;
            const img = that._hmi_image;
            const curve = that._hmi_curve;

            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // In the next blocks we update some values and try to find out what we
            // are and if we are visible
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            if (r !== undefined) {
                r = getPixelSize(r, scale);
                if (typeof r !== 'number' || r <= 0.5) {
                    return false;
                }
                type = ARC;
            } else if (w !== undefined && h !== undefined) {
                w = getPixelSize(w, scale);
                h = getPixelSize(h, scale);
                if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                    return false;
                }
                if (img !== undefined) {
                    if (typeof img.naturalWidth !== 'number' || img.naturalWidth <= 1 || typeof img.naturalHeight !== 'number' || img.naturalHeight <= 1) {
                        return false;
                    }
                    type = IMAGE;
                } else {
                    type = RECT;
                }
            } else if (w !== undefined && img !== undefined) {
                w = getPixelSize(w, scale);
                if (typeof w !== 'number' || w < 0.5) {
                    return false;
                }
                h = Math.floor(w * img.naturalHeight / img.naturalWidth);
                w = Math.floor(w);
                type = IMAGE;
            } else if (h !== undefined && img !== undefined) {
                h = getPixelSize(h, scale);
                if (typeof h !== 'number' || h < 0.5) {
                    return false;
                }
                w = Math.floor(h * img.naturalWidth / img.naturalHeight);
                h = Math.floor(h);
                type = IMAGE;
            } else if (text !== undefined) {
                fontSize = getCanvasPixel(that, 'fontSize', scale); // TODO: Why we do this twice?
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                } else if (fontSize < 5) {
                    return false;
                }
                type = TEXT;
            } else if (Array.isArray(points) && points.length >= 2) {
                type = PATH;
            } else if (curve) {
                type = CURVE;
            } else if (img) {
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
            _tf.transform(typeof that.x === 'number' ? that.x : 0.0, typeof that.y === 'number' ? that.y : 0.0, _p);
            const ox = _p.x;
            const oy = _p.y;
            const mx = _tf.mirrorX;
            const my = _tf.mirrorY;
            const tfrot = _tf.rotation;
            _ctx.save();
            switch (type) {
                case TEXT:
                case IMAGE:
                case RECT:
                    let sc = that.scale;
                    if (typeof sc !== 'number') {
                        sc = 1.0;
                    }
                    const phi = that.phi;
                    const angle = that.angle;
                    if (typeof phi === 'number') {
                        _ctx.translate(ox, oy);
                        const theta = mx === my ? phi : -phi;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    } else if (typeof angle === 'number') {
                        _ctx.translate(ox, oy);
                        const theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                        if (that.upright !== true) {
                            theta += tfrot;
                        }
                        _ctx.rotate(theta);
                        _ctx.scale(that.flipX === true ? -sc : sc, that.flipY === true ? -sc : sc);
                        _ctx.translate(-ox, -oy);
                    } else if (that.upright !== true) {
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
            const closed = that.closed === true;
            switch (type) {
                case ARC:
                    // try to get the angles
                    let phi1 = 0;
                    let phi2 = TWO_PI;
                    if (typeof that.phi1 === 'number' && typeof that.phi2 === 'number') {
                        phi1 = that.phi1;
                        phi2 = that.phi2;
                    } else if (typeof that.angle1 === 'number' && typeof that.angle2 === 'number') {
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
                    ObjectLifecycleManager.getAlignment(that.align, _p, mx, my);
                    const x = ox - _p.x * w;
                    const y = oy - _p.y * h;
                    const rb = getCanvasPixel(that, 'roundBorder', scale);
                    if (typeof rb === 'number' && rb > 1.0) {
                        // start 1. round edge
                        const xw = x + w;
                        const xr = xw - rb;
                        _ctx.moveTo(xr, y);
                        const yh = y + h;
                        _ctx.arcTo(xw, y, xw, yh, rb);
                        // 2. round edge
                        _ctx.arcTo(xw, yh, x, yh, rb);
                        // 3. round edge
                        _ctx.arcTo(x, yh, x, y, rb);
                        // 4. round edge
                        _ctx.arcTo(x, y, xr, y, rb);
                        _ctx.closePath();
                    } else {
                        _ctx.rect(x, y, w, h);
                    }
                    break;
                case PATH:
                    _ctx.beginPath();
                    const len = points.length;
                    for (let i = 0; i < len; i++) {
                        const p = points[i];
                        _tf.transform(p.x, p.y, _p);
                        const x1 = _p.x;
                        const y1 = _p.y;
                        if (i === 0 || p.move === true) {
                            _ctx.moveTo(x1, y1);
                        } else if (typeof rad === 'number' && rad > 0.0 && (closed ? i < len : i < len - 1)) {
                            const p = points[i + 1];
                            _tf.transform(p.x, p.y, _p);
                            const x2 = _p.x;
                            const y2 = _p.y;
                            _ctx.arcTo(x1, y1, x2, y2, p.r * scale);
                        } else {
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
                    fontSize = getCanvasPixel(that, 'fontSize', scale); // TODO: Why we do this twice?
                    if (typeof fontSize !== 'number') {
                        fontSize = 10;
                    }
                    let font = that.bold === true ? 'bold ' : '';
                    font += Math.ceil(fontSize);
                    font += 'px';
                    const fontFamily = getCanvasAttribute(that, 'fontFamily');
                    font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                    _ctx.font = font;
                    _ctx.beginPath();
                    ObjectLifecycleManager.getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                    // Bugfix #text_click (2016-09-09, Hm)
                    if (Array.isArray(text)) {
                        // #text_click: const y0 = oy - (_p.y * text.length - 0.5) * fontSize;
                        const y0 = oy - _p.y * text.length * fontSize;
                        let x0 = undefined;
                        let x1 = undefined;
                        for (let i = 0; i < text.length; i++) {
                            let txt = text[i];
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            const tw = _ctx.measureText(txt).width;
                            // #text_click: const x = ox - (_p.x - 0.5) * tw;
                            const x = ox - _p.x * tw;
                            if (x0 === undefined || x < x0) {
                                x0 = x;
                            }
                            x += tw;
                            if (x1 === undefined || x > x1) {
                                x1 = x;
                            }
                        }
                        _ctx.rect(x0, y0, x1 - x0, fontSize * text.length);
                    } else {
                        let txt = text;
                        if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                            txt = txt.toString();
                        }
                        const tw = _ctx.measureText(text).width;
                        // #text_click: const x = ox - (_p.x - 0.5) * w;
                        const x = ox - _p.x * tw;
                        // #text_click: const y = oy - (_p.y - 0.5) * fontSize;
                        const y = oy - _p.y * fontSize;
                        _ctx.rect(x, y, tw, fontSize);
                    }
                    break;
                case IMAGE:
                    {
                        _ctx.beginPath();
                        ObjectLifecycleManager.getAlignment(that.align, _p, mx !== (that.flipX === true), my !== (that.flipY === true));
                        const x = ox - _p.x * w;
                        const y = oy - _p.y * h;
                        _ctx.rect(x, y, w, h);
                        break;
                    }
                default:
                    break;
            }
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // check if fill is required
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            let fill = false;
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
            const result = _ctx.isPointInPath(pixelX, pixelY);
            _ctx.restore();
            return result;
        };
        that.hmi_getBounds = function () { // Note: No not change to lambda function, because 'arguments' will not work anymore!
            let recursive, bounds;
            // try to read from arguments
            for (let i = 0, l = arguments.length; i < l; i++) {
                const arg = arguments[i];
                if (recursive === undefined && typeof arg === 'boolean') {
                    recursive = arg;
                } else if (bounds === undefined && arg !== null && typeof arg === 'object') {
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
        that.hmi_updateBounds = () => {
            let bounds = that.bounds;
            if (bounds === null || typeof bounds !== 'object') {
                that.bounds = bounds = {};
            }
            that.hmi_getBounds(bounds, true);
        };
        that._hmi_getBounds = (transform, bounds, recursive) => {
            // delete bounds
            delete bounds.x1;
            delete bounds.y1;
            delete bounds.x2;
            delete bounds.y2;
            // if children must be checked too
            if (recursive && _children) {
                for (let i = 0; i < _children.length; i++) {
                    const child = _children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj && _ctx === hmiobj._hmi_context.context2d && hmiobj._hmi_getBounds) {
                        if (child !== hmiobj) {
                            transform.save();
                            transform.setToCoordinateTransform(child);
                        }
                        hmiobj._hmi_getBounds(transform, _p, true);
                        updateBounds(bounds, _p.x1, _p.y1);
                        updateBounds(bounds, _p.x2, _p.y2);
                        if (child !== hmiobj) {
                            transform.restore();
                        }
                    }
                }
            }
            // now we check our own bounds
            const paint = that.paint;
            if (typeof paint === 'function') {
                return;
            }
            let r = that.r;
            let w = that.width;
            let h = that.height;
            const text = that.text;
            let fontSize = undefined;
            const points = that.points;
            let type = undefined;
            const img = that._hmi_image;
            const curve = that._hmi_curve;

            // ///////////////////////////////////////////////////////////////////////////////////////////////
            // In the next blocks we update some values and try to find out what we
            // are and if we are visible
            // ///////////////////////////////////////////////////////////////////////////////////////////////
            if (r !== undefined) {
                r = getPixelSize(r, 1.0);
                if (typeof r !== 'number' || r <= 0.0) {
                    return;
                }
                type = ARC;
            } else if (w !== undefined && h !== undefined) {
                w = getPixelSize(w, 1.0);
                h = getPixelSize(h, 1.0);
                if (typeof w !== 'number' || w <= 0.0 || typeof h !== 'number' || h <= 0.0) {
                    return;
                }
                if (img !== undefined) {
                    if (typeof img.naturalWidth !== 'number' || img.naturalWidth <= 0 || typeof img.naturalHeight !== 'number' || img.naturalHeight <= 0) {
                        return;
                    }
                    type = IMAGE;
                } else {
                    type = RECT;
                }
            } else if (w !== undefined && img !== undefined) {
                w = getPixelSize(w, 1.0);
                if (typeof w !== 'number' || w <= 0.0) {
                    return;
                }
                h = w * img.naturalHeight / img.naturalWidth;
                type = IMAGE;
            } else if (h !== undefined && img !== undefined) {
                h = getPixelSize(h, 1.0);
                if (typeof h !== 'number' || h <= 0.0) {
                    return;
                }
                w = h * img.naturalWidth / img.naturalHeight;
                type = IMAGE;
            } else if (text !== undefined) {
                fontSize = getCanvasPixel(that, 'fontSize', 1.0);  // TODO: Why we do this twice?
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                } else if (fontSize <= 0) {
                    return;
                }
                type = TEXT;
            } else if (Array.isArray(points) && points.length >= 2) {
                type = PATH;
            } else if (curve) {
                type = CURVE;
            } else if (img) {
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
            transform.save();
            let ox = that.x;
            if (typeof ox !== 'number') {
                ox = 0.0;
            }
            let oy = that.y;
            if (typeof oy !== 'number') {
                oy = 0.0;
            }
            switch (type) {
                case TEXT:
                case IMAGE:
                case RECT:
                    let sc = that.scale;
                    if (typeof sc !== 'number') {
                        sc = 1.0;
                    }
                    const phi = that.phi;
                    const angle = that.angle;
                    if (typeof phi === 'number') {
                        transform.translate(ox, oy);
                        transform.rotate(phi);
                        transform.setScale(sc);
                        transform.translate(-ox, -oy);
                    } else if (typeof angle === 'number') {
                        transform.translate(ox, oy);
                        transform.rotate(angle * DEG2RAD);
                        transform.setScale(sc);
                        transform.translate(-ox, -oy);
                    } else if (that.upright !== true) {
                        transform.translate(ox, oy);
                        transform.setScale(sc);
                        transform.translate(-ox, -oy);
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
            // TODO: Use or remove  const closed = that.closed === true;
            switch (type) {
                case ARC:
                    updateBounds(bounds, ox - r, oy - r);
                    updateBounds(bounds, ox - r, oy + r);
                    updateBounds(bounds, ox + r, oy + r);
                    updateBounds(bounds, ox + r, oy - r);
                    break;
                case RECT:
                    {
                        ObjectLifecycleManager.getAlignment(that.align, _p, false, false);
                        const x = ox - _p.x * w;
                        const y = oy - _p.y * h;
                        transform.transform(x, y, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x + w, y, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x, y + h, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x + w, y + h, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        break;
                    }
                case PATH:
                    const len = points.length;
                    for (let i = 0; i < len; i++) {
                        const p = points[i];
                        transform.transform(p.x, p.y, _p);
                        updateBounds(bounds, _p.x, _p.y);
                    }
                    break;
                case CURVE:
                    if (stroke) {
                        // TODO implement
                    }
                    break;
                case TEXT:
                    _ctx.save();
                    fontSize = getCanvasPixel(that, 'fontSize', 1.0); // TODO: Why we do this twice?
                    if (typeof fontSize !== 'number') {
                        fontSize = 10;
                    }
                    let font = that.bold === true ? 'bold ' : '';
                    font += '100px';
                    const fontFamily = getCanvasAttribute(that, 'fontFamily');
                    font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                    _ctx.font = font;
                    ObjectLifecycleManager.getAlignment(that.align, _p, false, false);
                    if (Array.isArray(text)) {
                        const y0 = oy - _p.y * text.length * fontSize;
                        let x0 = undefined;
                        let x1 = undefined;
                        for (let i = 0; i < text.length; i++) {
                            let txt = text[i];
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            const tw = _ctx.measureText(txt).width / 100 * fontSize;
                            let x = ox - _p.x * tw;
                            if (x0 === undefined || x < x0) {
                                x0 = x;
                            }
                            x += tw;
                            if (x1 === undefined || x > x1) {
                                x1 = x;
                            }
                        }
                        const h = fontSize * text.length;
                        transform.transform(x0, y0, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x1, y0, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x0, y0 + h, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x1, y0 + h, _p);
                        updateBounds(bounds, _p.x, _p.y);
                    } else {
                        let txt = text;
                        if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                            txt = txt.toString();
                        }
                        const w = _ctx.measureText(text).width / 100 * fontSize;
                        const x = ox - _p.x * w;
                        const y = oy - _p.y * fontSize;
                        transform.transform(x, y, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x + w, y, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x, y + fontSize, _p);
                        updateBounds(bounds, _p.x, _p.y);
                        transform.transform(x + w, y + fontSize, _p);
                        updateBounds(bounds, _p.x, _p.y);
                    }
                    _ctx.restore();
                    break;
                case IMAGE:
                    ObjectLifecycleManager.getAlignment(that.align, _p, false, false);
                    const x = ox - _p.x * w;
                    const y = oy - _p.y * h;
                    transform.transform(x, y, _p);
                    updateBounds(bounds, _p.x, _p.y);
                    transform.transform(x + w, y, _p);
                    updateBounds(bounds, _p.x, _p.y);
                    transform.transform(x, y + h, _p);
                    updateBounds(bounds, _p.x, _p.y);
                    transform.transform(x + w, y + h, _p);
                    updateBounds(bounds, _p.x, _p.y);
                    break;
                default:
                    break;
            }
            transform.restore();
        };
        // only if we got a paint method we add the paint functions
        if (typeof that.paint === 'function') {
            that.hmi_context2d = _ctx;
            that.hmi_save = () => _ctx.save();
            that.hmi_restore = () => _ctx.restore();
            that.hmi_transform = config => {
                _tf.transform(typeof config.x === 'number' ? config.x : 0.0, typeof config.y === 'number' ? config.y : 0.0, _p);
                const ox = _p.x;
                const oy = _p.y;
                const mx = _tf.mirrorX;
                const my = _tf.mirrorY;
                const tfrot = _tf.rotation;
                let sc = config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                const phi = config.phi;
                const angle = config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? phi : -phi;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
            };
            that.hmi_prepareRect = config => {
                _ctx.beginPath();
                const scale = _tf.scale;
                let w = config.width;
                let h = config.height;
                if (w !== undefined && h !== undefined) {
                    w = getPixelSize(w, scale);
                    h = getPixelSize(h, scale);
                    if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                        return;
                    }
                }
                _tf.transform(typeof config.x === 'number' ? config.x : 0.0, typeof config.y === 'number' ? config.y : 0.0, _p);
                const ox = _p.x;
                const oy = _p.y;
                const mx = _tf.mirrorX;
                const my = _tf.mirrorY;
                const tfrot = _tf.rotation;
                let sc = config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                const phi = config.phi;
                const angle = config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? phi : -phi;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                _ctx.beginPath();
                ObjectLifecycleManager.getAlignment(config.align, _p, mx, my);
                const x = ox - _p.x * w;
                const y = oy - _p.y * h;
                const rb = getCanvasPixel(config, 'roundBorder', scale);
                if (typeof rb === 'number' && rb > 1.0) {
                    // start 1. round edge
                    const xw = x + w;
                    const xr = xw - rb;
                    _ctx.moveTo(xr, y);
                    const yh = y + h;
                    _ctx.arcTo(xw, y, xw, yh, rb);
                    // 2. round edge
                    _ctx.arcTo(xw, yh, x, yh, rb);
                    // 3. round edge
                    _ctx.arcTo(x, yh, x, y, rb);
                    // 4. round edge
                    _ctx.arcTo(x, y, xr, y, rb);
                    _ctx.closePath();
                } else {
                    _ctx.rect(x, y, w, h);
                }
            };
            that.hmi_prepareArc = config => {
                _ctx.beginPath();
                const scale = _tf.scale;
                let r = config.r;
                if (r !== undefined) {
                    r = getPixelSize(r, scale);
                    if (typeof r !== 'number' || r <= 0.5) {
                        return;
                    }
                }
                let x = config.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                let y = config.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                // try to get the angles
                let phi1 = 0;
                let phi2 = TWO_PI;
                if (typeof config.phi1 === 'number' && typeof config.phi2 === 'number') {
                    phi1 = config.phi1;
                    phi2 = config.phi2;
                } else if (typeof config.angle1 === 'number' && typeof config.angle2 === 'number') {
                    phi1 = config.angle1 * DEG2RAD;
                    phi2 = config.angle2 * DEG2RAD;
                }
                const mx = _tf.mirrorX;
                if (mx) {
                    phi1 = PI - phi1;
                    phi2 = PI - phi2;
                }
                const my = _tf.mirrorY;
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
                const tfrot = _tf.rotation;
                _tf.transform(x, y, _p);
                _ctx.arc(_p.x, _p.y, r, phi1 + tfrot, phi2 + tfrot, mx !== my);
            };
            that.hmi_preparePath = config => {
                _ctx.beginPath();
                const points = config.points;
                if (Array.isArray(points) === false || points.length < 2) {
                    return;
                }
                // ///////////////////////////////////////////////////////////////////////////////////////////////
                // create path and check dimension
                // ///////////////////////////////////////////////////////////////////////////////////////////////
                const scale = _tf.scale;
                const len = points.length;
                for (let i = 0; i < len; i++) {
                    const p = points[i];
                    const rad = p.r;
                    _tf.transform(p.x, p.y, _p);
                    const x1 = _p.x;
                    const y1 = _p.y;
                    if (i === 0 || p.move === true) {
                        _ctx.moveTo(x1, y1);
                    } else if (typeof rad === 'number' && rad > 0.0 && i < len - 1) {
                        const p = points[i + 1];
                        _tf.transform(p.x, p.y, _p);
                        const x2 = _p.x;
                        const y2 = _p.y;
                        _ctx.arcTo(x1, y1, x2, y2, rad * scale);
                    } else {
                        _ctx.lineTo(x1, y1);
                    }
                }
            };
            that.hmi_setFont = config => {
                let fontSize = getPixelSize(config.fontSize, _tf.scale);
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                }
                let font = config.bold === true ? 'bold ' : '';
                font += Math.floor(fontSize);
                font += 'px';
                const fontFamily = config.fontFamily;
                font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                _ctx.font = font;
            };
            // TODO this is shit
            that.hmi_getTextHeight = config => getPixelSize(config.fontSize, _tf.scale);
            that.hmi_getTextWidth = text => _ctx.measureText(text).width;
            that.hmi_paintText = (config, text) => {
                // context.textAlign="center|end|left|right|start";
                // context.textBaseline="alphabetic|top|hanging|middle|ideographic|bottom";
                const scale = _tf.scale;
                let fontSize = getCanvasPixel(config, 'fontSize', scale); // TODO: Why we do this twice?
                if (typeof fontSize !== 'number') {
                    fontSize = 10;
                } else if (fontSize < 5) {
                    return;
                }
                _tf.transform(typeof config.x === 'number' ? config.x : 0.0, typeof config.y === 'number' ? config.y : 0.0, _p);
                const ox = _p.x;
                const oy = _p.y;
                const mx = _tf.mirrorX;
                const my = _tf.mirrorY;
                const tfrot = _tf.rotation;
                let sc = config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                const phi = config.phi;
                const angle = config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? phi : -phi;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                let stroke = false;
                if (config.stroke === true || isNumberOrPixelValue(config.lineWidth) || typeof config.strokeStyle === 'string') {
                    stroke = true;
                }
                let fill = false;
                if (config.fill === true || typeof config.fillStyle === 'string') {
                    fill = true;
                }
                if (fill) {
                    const fillStyle = config.fillStyle;
                    if (typeof fillStyle === 'string') {
                        _ctx.fillStyle = fillStyle;
                    }
                }
                if (stroke) {
                    const lineWidth = getPixelSize(config.lineWidth, scale);
                    if (typeof lineWidth === 'number') {
                        _ctx.lineWidth = lineWidth;
                    }
                    const strokeStyle = config.strokeStyle;
                    if (typeof strokeStyle === 'string') {
                        _ctx.strokeStyle = strokeStyle;
                    }
                }
                if (fill || stroke) {
                    fontSize = getPixelSize(config.fontSize, scale); // TODO: Why we do this twice?
                    if (typeof fontSize !== 'number') {
                        fontSize = 10;
                    }
                    let font = config.bold === true ? 'bold ' : '';
                    font += Math.floor(fontSize);
                    font += 'px';
                    const fontFamily = config.fontFamily;
                    font += typeof fontFamily === 'string' && fontFamily.length > 0 ? ' ' + fontFamily : ' Verdana';
                    _ctx.font = font;
                    ObjectLifecycleManager.getAlignment(config.align, _p, mx !== (config.flipX === true), my !== (config.flipY === true));
                    _ctx.textAlign = 'center';
                    _ctx.textBaseline = 'middle';
                    if (Array.isArray(text)) {
                        const y0 = oy - (_p.y * text.length - 0.5) * fontSize;
                        for (let i = 0; i < text.length; i++) {
                            let txt = text[i];
                            if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                                txt = txt.toString();
                            }
                            const x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                            const y = y0 + i * fontSize;
                            if (fill) {
                                _ctx.fillText(txt, x, y);
                            }
                            if (stroke) {
                                _ctx.strokeText(txt, x, y);
                            }
                        }
                    } else {
                        let txt = text;
                        if (typeof txt !== 'string' && txt !== undefined && txt !== null) {
                            txt = txt.toString();
                        }
                        const x = ox - (_p.x - 0.5) * _ctx.measureText(txt).width;
                        const y = oy - (_p.y - 0.5) * fontSize;
                        if (fill) {
                            _ctx.fillText(txt, x, y);
                        }
                        if (stroke) {
                            _ctx.strokeText(txt, x, y);
                        }
                    }
                }
            };
            that.hmi_paintImage = (config, image) => {
                if (image === undefined || typeof image.naturalWidth !== 'number' || image.naturalWidth <= 1 || typeof image.naturalHeight !== 'number' || image.naturalHeight <= 1) {
                    return;
                }
                const scale = _tf.scale;
                let w = config.width;
                let h = config.height;
                if (w !== undefined && h !== undefined) {
                    w = getPixelSize(w, scale);
                    h = getPixelSize(h, scale);
                    if (typeof w !== 'number' || w <= 0.5 || typeof h !== 'number' || h <= 0.5) {
                        return;
                    }
                } else if (w !== undefined) {
                    w = getPixelSize(w, scale);
                    if (typeof w !== 'number' || w < 0.5) {
                        return;
                    }
                    h = Math.floor(w * image.naturalHeight / image.naturalWidth);
                    w = Math.floor(w);
                } else if (h !== undefined) {
                    h = getPixelSize(h, scale);
                    if (typeof h !== 'number' || h < 0.5) {
                        return;
                    }
                    w = Math.floor(h * image.naturalWidth / image.naturalHeight);
                    h = Math.floor(h);
                } else {
                    w = image.naturalWidth;
                    h = image.naturalHeight;
                }
                _tf.transform(typeof config.x === 'number' ? config.x : 0.0, typeof config.y === 'number' ? config.y : 0.0, _p);
                const ox = _p.x;
                const oy = _p.y;
                const mx = _tf.mirrorX;
                const my = _tf.mirrorY;
                const tfrot = _tf.rotation;
                let sc = config.scale;
                if (typeof sc !== 'number') {
                    sc = 1.0;
                }
                const phi = config.phi;
                const angle = config.angle;
                if (typeof phi === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? phi : -phi;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (typeof angle === 'number') {
                    _ctx.translate(ox, oy);
                    const theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (config.upright !== true) {
                        theta += tfrot;
                    }
                    _ctx.rotate(theta);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                } else if (config.upright !== true) {
                    _ctx.translate(ox, oy);
                    _ctx.rotate(tfrot);
                    _ctx.scale(config.flipX === true ? -sc : sc, config.flipY === true ? -sc : sc);
                    _ctx.translate(-ox, -oy);
                }
                ObjectLifecycleManager.getAlignment(config.align, _p, mx !== (config.flipX === true), my !== (config.flipY === true));
                const x = ox - _p.x * w;
                const y = oy - _p.y * h;
                _ctx.drawImage(image, x, y, w, h);
            };
            that.hmi_beginPath = () => _ctx.beginPath();
            that.hmi_moveTo = (x, y) => {
                _tf.transform(x, y, _p);
                _ctx.moveTo(_p.x, _p.y);
            };
            that.hmi_lineTo = (x, y) => {
                _tf.transform(x, y, _p);
                _ctx.lineTo(_p.x, _p.y);
            };
            that.hmi_arcTo = (x1, y1, x2, y2, radius) => {
                _tf.transform(x1, y1, _p);
                const px1 = _p.x;
                const py1 = _p.y;
                _tf.transform(x2, y2, _p);
                _ctx.arcTo(px1, py1, _p.x, _p.y, radius * _tf.scale);
            };
            that.hmi_quadraticCurveTo = (x1, y1, x2, y2) => {
                _tf.transform(x1, y1, _p);
                const px1 = _p.x;
                const py1 = _p.y;
                _tf.transform(x2, y2, _p);
                _ctx.quadraticCurveTo(px1, py1, _p.x, _p.y);
            };
            that.hmi_bezierCurveTo = (x1, y1, x2, y2, x3, y3) => {
                _tf.transform(x1, y1, _p);
                const px1 = _p.x;
                const py1 = _p.y;
                _tf.transform(x2, y2, _p);
                const px2 = _p.x;
                const py2 = _p.y;
                _tf.transform(x3, y3, _p);
                _ctx.bezierCurveTo(px1, py1, px2, py2, _p.x, _p.y);
            };
            that.hmi_closePath = () => _ctx.closePath();
            that.hmi_fill = config => {
                if (config) {
                    const fillStyle = config.fillStyle;
                    if (typeof fillStyle === 'string') {
                        _ctx.fillStyle = fillStyle;
                    }
                }
                _ctx.fill();
            };
            that.hmi_stroke = config => {
                if (config) {
                    const lineCap = config.lineCap;
                    if (typeof lineCap === 'string') {
                        _ctx.lineCap = lineCap;
                    }
                    const lineJoin = config.lineJoin;
                    if (typeof lineJoin === 'string') {
                        _ctx.lineJoin = lineJoin;
                    }
                    const lineWidth = getPixelSize(config.lineWidth, _tf.scale);
                    if (typeof lineWidth === 'number') {
                        _ctx.lineWidth = lineWidth;
                    }
                    const strokeStyle = config.strokeStyle;
                    if (typeof strokeStyle === 'string') {
                        _ctx.strokeStyle = strokeStyle;
                    }
                }
                _ctx.stroke();
            };
        }
        // handle children
        _children = that.children;
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
            function updateHtmlChildPosition(hmiObject, child, width, height, doResize) {
                const elem = child._hmi_graphHtmlElement;
                // update size and resize object if required
                let resized = false;
                const cw = Math.floor(width);
                if (child._hmi_w !== cw) {
                    child._hmi_w = cw;
                    elem.css('width', cw + 'px');
                    resized = true;
                }
                const ch = Math.floor(height);
                if (child._hmi_h !== ch) {
                    child._hmi_h = ch;
                    elem.css('height', ch + 'px');
                    resized = true;
                }
                if (resized && doResize && hmiObject._hmi_resize) {
                    hmiObject._hmi_resize();
                }
                // locate object depending on the align
                const x = child.x;
                if (typeof x !== 'number') {
                    x = 0.0;
                }
                const y = child.y;
                if (typeof y !== 'number') {
                    y = 0.0;
                }
                _tf.transform(x, y, _p);
                const ox = Math.floor(_p.x);
                const oy = Math.floor(_p.y);
                // TODO not sure about mirrors
                const mx = _tf.mirrorX !== (child.mirrorX === true);
                const my = _tf.mirrorY !== (child.mirrorY === true);
                ObjectLifecycleManager.getAlignment(child.align, _p, mx, my);
                const ax = _p.x;
                const ay = _p.y;
                // TODO: Use or remove const x1 = ox - ( mx ? 1.0 - ax : ax) * width;
                // TODO: Use or remove const y1 = oy - ( my ? ay : 1.0 - ay) * height;
                const x1 = ox - ax * width;
                const y1 = oy - ay * height;
                if (child._hmi_x !== x1) {
                    child._hmi_x = x1;
                    elem.css('left', x1 + 'px');
                }
                if (child._hmi_y !== y1) {
                    child._hmi_y = y1;
                    elem.css('top', y1 + 'px');
                }
                const tfrot = _tf.rotation;
                const phi = child.phi;
                const angle = child.angle;
                let rot = 0;
                if (typeof phi === 'number') {
                    const theta = mx === my ? phi : -phi;
                    if (child.upright !== true) {
                        theta += tfrot;
                    }
                    rot = Math.floor(Mathematics.normalizeToPlusMinus180deg(theta * RAD2DEG));
                } else if (typeof angle === 'number') {
                    const theta = mx === my ? angle * DEG2RAD : -angle * DEG2RAD;
                    if (child.upright !== true) {
                        theta += tfrot;
                    }
                    rot = Math.floor(Mathematics.normalizeToPlusMinus180deg(theta * RAD2DEG));
                } else if (child.upright !== true) {
                    rot = Math.floor(Mathematics.normalizeToPlusMinus180deg(tfrot * RAD2DEG));
                }
                let scale = child.scale;
                if (typeof scale !== 'number') {
                    scale = 1.0;
                }
                if (resized || child._hmi_rot !== rot || child._hmi_scale !== scale) {
                    child._hmi_rot = rot;
                    child._hmi_scale = scale;
                    const dx = Math.floor(width / 2);
                    const dy = Math.floor(height / 2);
                    const a_x = (mx ? 1.0 - 2.0 * ax : 2.0 * ax - 1.0) * dx;
                    const a_y = (my ? 2.0 * ay - 1.0 : 1.0 - 2.0 * ay) * dy;
                    const sx = child.flipX === true ? -scale : scale;
                    const sy = child.flipY === true ? -scale : scale;
                    elem.css('transform', `translate(${a_x}px, ${a_y}px) rotate(${rot}deg) scale(${sx}, ${sy}) translate(${-a_x}px, ${-a_y}px)`);
                }
            }
            that._hmi_updateChildrenTransforms = () => {
                for (let i = 0; i < _children.length; i++) {
                    const child = _children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj) {
                        if (hmiobj._hmi_isSection === true) {
                            const cs = hmiobj._hmi_curveSection;
                            for (let j = 0; j < cs.getItemCount(); j++) {
                                const item = cs.getItem(j);
                                const ic = item.child;
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
                        } else if (!ObjectLifecycleManager.isTaskType(hmiobj)) {
                            const width = getPixelSize(child.width, _tf.scale);
                            const height = getPixelSize(child.height, _tf.scale);
                            if (typeof width === 'number' && typeof height === 'number') {
                                updateHtmlChildPosition(hmiobj, child, width, height, true);
                            }
                        }
                    }
                }
            };
            _curves = that.curves;
            if (Array.isArray(_curves)) {
                // within the next loop we create the curves
                for (let i = 0; i < _curves.length; i++) {
                    const curve = _curves[i];
                    if (curve.type === 'arcline') {
                        const al = new Mathematics.ArcLine(curve);
                        curve._hmi_curveImpl = al;
                    } else if (curve.type === 'ropeline') {
                        const rl = new Mathematics.RopeLine(curve);
                        curve._hmi_curveImpl = rl;
                    }
                }
            } else {
                _curves = undefined;
            }
            for (let i = 0; i < _children.length; i++) {
                (function () { // closure
                    const child = _children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj) {
                        let vps = hmiobj.vps;
                        let scene = hmiobj.scene;
                        if (typeof vps === 'string' && typeof scene === 'string') {
                            // get reference to vehicle position system (VPS) and store
                            // all segments for fast access during refresh
                            vps = hmiobj.hmi_node(vps);
                            scene = hmiobj.hmi_node(scene);
                            if (vps && scene && Array.isArray(scene.children)) {
                                hmiobj._hmi_vps = vps;
                                hmiobj._hmi_segments = [];
                                const clds = scene.children;
                                for (let k = 0; k < clds.length; k++) {
                                    const c = clds[k];
                                    if (typeof c.segment === 'number') {
                                        hmiobj._hmi_segments[c.segment] = c;
                                    }
                                }
                                hmiobj.hmi_getPointOnCurveSection = (position, offset, point, adjusted) => {
                                    const cursec = that._hmi_vehicleCurveSection;
                                    const posadj = that._hmi_vehiclePositionAdjuster;
                                    const pos = adjusted === true && posadj ? posadj.adjust(position) : position;
                                    return cursec ? cursec.transform(pos, offset, point) : false;
                                };
                            }
                        }
                        if (_curves) {
                            for (let j = 0; j < _curves.length; j++) {
                                const curve = _curves[j];
                                if (child.curve === curve.id) {
                                    const cu = curve._hmi_curveImpl;
                                    const curveLength = cu.getLength();
                                    const from = typeof child.from === 'number' ? child.from : 0.0;
                                    const to = typeof child.to === 'number' ? child.to : 1.0;
                                    const cs = new Mathematics.CurveSection(cu, curve.id, from * curveLength, to * curveLength, hmiobj.children);
                                    const pa = new ObjectPositionSystem.ZonePositionAdjuster(cs, hmiobj.length, that.hmi.env.isSimulationEnabled() === true);
                                    pa.addListeners();
                                    hmiobj.hmi_from = 0.0;
                                    hmiobj.hmi_to = cs.length;
                                    hmiobj._hmi_isSection = true;
                                    hmiobj._hmi_curveSection = cs;
                                    hmiobj._hmi_curve = cu;
                                    hmiobj._hmi_positionAdjuster = pa;
                                    hmiobj.hmi_getPointOnCurveSection = (position, offset, point, adjusted) => {
                                        const pos = adjusted === true ? that._hmi_positionAdjuster.adjust(position) : position;
                                        return that._hmi_curveSection.transform(pos, offset, point);
                                    };
                                    for (let z = 0; z < cs.getZoneCount(); z++) {
                                        const zonevisobj = cs.getZoneObject(z)._hmi_object;
                                        if (zonevisobj) {
                                            zonevisobj._hmi_curveSection = cs;
                                            zonevisobj._hmi_curve = cu;
                                            zonevisobj.hmi_from = cs.getZoneStart(z);
                                            zonevisobj.hmi_to = cs.getZoneEnd(z);
                                        }
                                    }
                                    for (let z = 0; z < cs.getItemCount(); z++) {
                                        const itemvisobj = cs.getItem(z).child._hmi_object;
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
                                let ctf = _tf;
                                if (child !== hmiobj) {
                                    ctf = new Mathematics.Transform();
                                    ctf.setToCoordinateTransform(child, _tf);
                                }
                                // #graph: 1
                                tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: _cont, transform: ctf, context2d: _ctx }, onSuc, onErr));
                            } else if (ObjectLifecycleManager.isTaskType(hmiobj)) {
                                // #graph: 2
                                tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: _cont }, onSuc, onErr));
                            } else {
                                child._hmi_graphHtmlElement = $(ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                                child._hmi_graphHtmlElement.appendTo(_cont);
                                const width = getPixelSize(child.width, _tf.scale);
                                const height = getPixelSize(child.height, _tf.scale);
                                if (typeof width === 'number' && typeof height === 'number') {
                                    updateHtmlChildPosition(hmiobj, child, width, height, false);
                                }
                                // #graph: 3
                                tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: child._hmi_graphHtmlElement }, onSuc, onErr));
                            }
                        }
                    }
                }());
            }
            // layout
            that.hmi_layout = (layout, separator) => layoutChildren(_children, layout, separator);
        }
        // finally we remove all we created
        that._hmi_destroys.push(() => {
            if (that._hmi_graphicsRoot === true) {
                clicked = undefined;
                onEvent = undefined;
            }
            if (_children) {
                for (let i = _children.length - 1; i >= 0; i--) {
                    const child = _children[i];
                    const hmiobj = child._hmi_object;
                    if (hmiobj) {
                        if (hmiobj._hmi_destroy_dom) {
                            // #graph: 1
                            hmiobj._hmi_destroy_dom();
                        }
                        const cs = hmiobj._hmi_curveSection;
                        if (cs) {
                            for (let z = cs.getItemCount() - 1; z >= 0; z--) {
                                const itemvisobj = cs.getItem(z).child._hmi_object;
                                if (itemvisobj) {
                                    delete itemvisobj.hmi_position;
                                }
                            }
                            for (let z = cs.getZoneCount() - 1; z >= 0; z--) {
                                const zonevisobj = cs.getZoneObject(z)._hmi_object;
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
                    for (let i = _curves.length - 1; i >= 0; i--) {
                        const curve = _curves[i];
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
            } else {
                delete that.hmi_setVisible;
                delete that.hmi_isVisible;
            }
            // stroke_curve_parts = undefined; // TODO: What ist this?
            // stroke_curve = undefined; // TODO: What ist this?
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
        Executor.run(tasks, onSuccess, onError);
    }

    ObjectLifecycleManager.setApplyGraphicObjectFunction(applyGraphicObject);

    Object.freeze(GraphControl);
    if (isNodeJS) {
        module.exports = GraphControl;
    } else {
        root.GraphControl = GraphControl;
    }
}(globalThis));
