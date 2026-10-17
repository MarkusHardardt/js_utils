const root = globalThis;

const ObjectLifecycleHelper = {};

ObjectLifecycleHelper.isTaskType = object => {
    if (object === undefined) {
        return false;
    } else if (object === null) {
        return false;
    } else if (typeof object !== 'object') {
        return false;
    } else {
        return (isNodeJS && object.type === undefined) || object.type === 'task';
    }
};

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
ObjectLifecycleHelper.processObjectSubTree = processObjectSubTree;

ObjectLifecycleHelper.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION = '<div style="box-sizing: border-box;position: relative;width: 100%;height: 100%;" />';
ObjectLifecycleHelper.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION = '<div style="box-sizing: border-box;position: absolute;" />';

ObjectLifecycleHelper.getPixelValue = value => {
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
};

ObjectLifecycleHelper.getAlignment = (align, result, mirrorX, mirrorY) => {
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
};

ObjectLifecycleHelper.getDimensionParameter = (object, attributeName, separator) => {
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
};

ObjectLifecycleHelper.setBounds = (element, bounds) => {
    element.css('left', bounds.x.toString() + 'px');
    element.css('top', bounds.y.toString() + 'px');
    element.css('width', bounds.width.toString() + 'px');
    element.css('height', bounds.height.toString() + 'px');
};

ObjectLifecycleHelper.applyListenerSupport = that => {
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
};

ObjectLifecycleHelper.preventDefaultAndStopPropagation = event => {
    // do not perform default browser actions
    if (typeof event.preventDefault === 'function') {
        event.preventDefault();
    }
    // do not delegate to parent elements
    if (typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    _lastUserActionDate = new Date().getTime();
};

Object.freeze(ObjectLifecycleHelper);

export default ObjectLifecycleHelper;
