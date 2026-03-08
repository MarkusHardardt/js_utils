(function (root) {
    "use strict";
    const GridLayout = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const ObjectLifecycleManager = isNodeJS ? require('./ObjectLifecycleManager.js') : root.ObjectLifecycleManager;

    function createGridCoordinates(parameter) {
        // here we store the resulting coordinates
        const coordinates = [];
        // if our parameter is just a simple number we create an array containing
        // equidistant parts
        if (typeof parameter === 'number') {
            const len = parameter > 0 ? parameter : 1;
            const part = 1.0 / len;
            for (let i = 0; i < len; i++) {
                coordinates.push({ part });
            }
        } else if (parameter !== undefined && parameter !== null && Array.isArray(parameter) && parameter.length > 0) { // in case of an array we add relative parts and absolute pixels
            let validPartCnt = 0;
            let validPixelCnt = 0;
            let sum = 0.0;
            for (let i = 0; i < parameter.length; i++) {
                const param = parameter[i];
                const coor = {};
                const pixel = ObjectLifecycleManager.getPixelValue(param);
                if (typeof pixel === 'number') {
                    coor.pixel = Math.floor(pixel);
                    validPixelCnt++;
                } else if (typeof param === 'number' && param > 0.0) {
                    sum += param;
                    validPartCnt++;
                }
                coordinates.push(coor);
            }
            if (validPixelCnt === parameter.length) { // if only valid pixels
                // exchange last coordinates pixel against part
                const coor = coordinates[coordinates.length - 1];
                delete coor.pixel;
                coor.part = 1.0;
            } else {
                const invalidPart = 1.0 / (parameter.length - validPixelCnt);
                const validSum = validPartCnt * invalidPart;
                for (let i = 0; i < parameter.length; i++) {
                    const param = parameter[i];
                    const coor = coordinates[i];
                    if (coor.pixel === undefined) {
                        if (typeof param === 'number' && param > 0.0 && sum > 0) {
                            coor.part = param / sum * validSum;
                        } else {
                            coor.part = invalidPart;
                        }
                    }
                }
            }
        } else {
            coordinates.push({ part: 1.0 });
        }
        return coordinates;
    }

    function computeGridAxisPixel(coordinates, size, separator, startMargin, endMargin) {
        let offset = startMargin;
        let sizeForRelativeParts = size - startMargin - separator * (coordinates.length - 1) - endMargin;
        for (let i = 0; i < coordinates.length; i++) {
            const coor = coordinates[i];
            if (typeof coor.pixel === 'number') {
                sizeForRelativeParts -= coor.pixel;
            }
        }
        for (let i = 0; i < coordinates.length; i++) {
            const coor = coordinates[i];
            const start = offset;
            const end = offset + (typeof coor.pixel === 'number' ? coor.pixel : coor.part * sizeForRelativeParts);
            coor.start = Math.floor(start);
            coor.end = Math.floor(end);
            offset = end + separator;
        }
    }

    function getGridCoordinate(coordinates, index, parameter) {
        const coor = index >= 0 ? (index < coordinates.length ? coordinates[index] : coordinates[coordinates.length - 1]) : coordinates[0];
        return coor[parameter];
    }

    const DEFAULT_MAX_STACK_SIZE = 1;

    /**
     * Determines whether or not the rectangle 1 and the rectangle 2 are equal.
     * 
     * @param {Object}
     *          rect1 The first rectangle
     * @param {Object}
     *          rect2 The second rectangle
     * @return <code>true</code> if the rectangles are equal; <code>false</code>
     *         otherwise.
     */
    function isEqualRectangle(rect1, rect2) {
        if (rect1 === rect2) { // the rectangles are equal if identical
            return true;
        } else if (rect1.x !== rect2.x || rect1.y !== rect2.y) { // not equal if different location
            return false;
        } else if (rect1.width !== rect2.width || rect1.height !== rect2.height) { // not equal if different size
            return false;
        } else { // if reaching that point and the id is equal
            return rect1.id === rect2.id;
        }
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
    function rectanglesIntersect(x1, y1, width1, height1, x2, y2, width2, height2) {
        let w1 = width1;
        let h1 = height1;
        let w2 = width2;
        let h2 = height2;
        // if any empty rectangle
        if (w2 <= 0 || h2 <= 0 || w1 <= 0 || h1 <= 0) {
            return false;
        }
        w2 += x2;
        h2 += y2;
        w1 += x1;
        h1 += y1;
        // overflow || intersect
        return ((w2 < x2 || w2 > x1) && (h2 < y2 || h2 > y1) && (w1 < x1 || w1 > x2) && (h1 < y1 || h1 > y2));
    }

    function performModification(rectanglesToHandle, rectanglesToIgnore, method, onSuccess, onError) {
        let cnt = 0;
        if (Array.isArray(rectanglesToHandle)) {
            const tasks = [], hl = rectanglesToHandle.length;
            for (let i = 0; i < hl; i++) {
                let rect = rectanglesToHandle[i];
                if (Array.isArray(rectanglesToIgnore)) {
                    const il = rectanglesToIgnore.length;
                    for (let j = 0; j < il; j++) {
                        if (isEqualRectangle(rect, rectanglesToIgnore[j])) {
                            rect = false;
                            break;
                        }
                    }
                }
                // if not found we perform the given method
                if (rect) {
                    (function () { // Closure
                        const r = rect;
                        tasks.push((onSuc, onErr) => {
                            try {
                                method(r.x, r.y, r.width, r.height, r.id, onSuc, onErr, r.init);
                            } catch (error) {
                                onErr(`Failed calling rectangle handler: ${method.toString()}, error: ${error.message}`);
                            }
                            cnt++;
                        });
                    }());
                }
            }
            tasks.parallel = true;
            Executor.run(tasks, () => onSuccess(cnt), onError);
        } else {
            onSuccess(0);
        }
    }

    function changeConstellation(source, target, onLoadRectangle, onUnloadRectangle, onSuccess, onError) {
        // first we iterate over all sources and check if they still exist in the targets
        performModification(source, target, onUnloadRectangle, removedCount =>
            performModification(target, source, onLoadRectangle, addedCount =>
                onSuccess(removedCount + addedCount), onError),
            onError
        );
    }

    class RectangleHandler {
        #columns;
        #rows;
        #maxStackSize;
        #onLoadRectangle;
        #onReloadRectangle;
        #onUnloadRectangle;
        #stack;
        #currentLevel;
        #set;
        constructor(columns, rows, maxStackSize, onLoadRectangle, onReloadRectangle, onUnloadRectangle) {
            this.#columns = columns;
            this.#rows = rows;
            this.#maxStackSize = maxStackSize ? maxStackSize : DEFAULT_MAX_STACK_SIZE;
            this.#onLoadRectangle = onLoadRectangle;
            this.#onReloadRectangle = onReloadRectangle;
            this.#onUnloadRectangle = onUnloadRectangle;
            this.#stack = [];
            this.#currentLevel = -1;
            this.#set = null;
        }
        prepareNextSet(empty) {
            if (this.#set === null) {
                this.#set = [];
            } else {
                this.#set.splice(0, this.#set.length);
            }
            // add all current existing rectangles if available
            if (empty === undefined && empty !== true && this.#currentLevel !== -1) {
                const curr = this.#stack[this.#currentLevel];
                for (let i = 0; i < curr.length; i++) {
                    this.#set.push(curr[i]);
                }
            }
            return true;
        }
        addRectangleForNextSetToDefinedLocation(rx, ry, width, height, id, init) {
            // if not valid we do not proceed
            if (this.#set === null) {
                return false;
            }
            // store these parameters because we might modify them
            let x = rx;
            let y = ry;
            // if outside of the range
            if (x < 0 || x >= this.#columns || y < 0 || y >= this.#rows) {
                return false;
            }
            // just in case we are too far on the right or bottom we update the
            // location
            if (x + width > this.#columns) {
                x = this.#columns - width;
            }
            if (y + height > this.#rows) {
                y = this.#rows - height;
            }
            // if not insertable because of the dimension
            if (x < 0 || x + width > this.#columns || y < 0 || y + height > this.#rows) {
                return false;
            }
            // now we got to check all currently existing id objects if available
            for (let i = 0; i < this.#set.length; i++) {
                // get the rectangle
                const rect = this.#set[i];
                // if same location and equal id
                if (x === rect.x && y === rect.y && id === rect.id) {
                    try {
                        this.#onReloadRectangle(id, init);
                    } catch (error) {
                        console.error(`Failed calling rectangle handler: ${this.#onReloadRectangle.toString()}`, error);
                    }
                    return false;
                }
            }
            // for all in reverse order
            for (let i = this.#set.length - 1; i >= 0; i--) {
                // get the other rect
                const other = this.#set[i];
                // if we got an equal id (at a different location) or the rectangles
                // intersect
                if (id === other.id || rectanglesIntersect(x, y, width, height, other.x, other.y, other.width, other.height)) {
                    this.#set.splice(i, 1);
                }
            }
            // finally we got to add and load the new rectangle
            this.#set.push({ x, y, width, height, id, init: init });
            return true;
        }
        addRectangleForNextSetToDefaultLocation(width, height, id, init) {
            if (this.#set === null) {
                return false;
            }
            // if we do not have a current level or the level is empty
            if (this.#set.length === 0) {
                // add to first place
                return this.addRectangleForNextSetToDefinedLocation(0, 0, width, height, id, init);
            }
            // we got to check if already exists
            for (let i = 0; i < this.#set.length; i++) {
                if (this.#set[i].id === id) {
                    try {
                        this.#onReloadRectangle(id, init);
                    } catch (error) {
                        console.error(`Failed calling rectangle handler: ${this.#onReloadRectangle.toString()}`, error);
                    }
                    return false;
                }
            }
            // reaching this point we check for the first empty space
            for (let row = 0; row <= this.#rows - height; row++) {
                for (let col = 0; col <= this.#columns - width; col++) {
                    let empty = true;
                    for (let i = 0; i < this.#set.length; i++) {
                        const rect = this.#set[i];
                        if (rectanglesIntersect(col, row, width, height, rect.x, rect.y, rect.width, rect.height)) {
                            empty = false;
                            break;
                        }
                    }
                    if (empty) {
                        return this.addRectangleForNextSetToDefinedLocation(col, row, width, height, id, init);
                    }
                }
            }
            // if we reach this point we did not find an empty place so we just add to
            // the front
            return this.addRectangleForNextSetToDefinedLocation(0, 0, width, height, id, init);
        }
        activateNextSet(onSuccess, onError) {
            if (this.#set !== null) {
                // get the current constellation if available
                const prevCon = this.#currentLevel !== -1 ? this.#stack[this.#currentLevel] : null;
                changeConstellation(prevCon, this.#set, this.#onLoadRectangle, this.#onUnloadRectangle, count => {
                    if (count > 0) {
                        // if the stack stores something after the current index we remove this constellations
                        if (this.#currentLevel < this.#stack.length - 1) {
                            this.#stack.splice(this.#currentLevel + 1, this.#stack.length - 1 - this.#currentLevel);
                        }
                        // add constellation to the stack
                        this.#stack.push(this.#set);
                        // if too many remove the constellations at front
                        if (this.#maxStackSize !== -1 && this.#stack.length > this.#maxStackSize) {
                            this.#stack.splice(0, this.#stack.length - this.#maxStackSize);
                        }
                        this.#currentLevel = this.#stack.length - 1;
                    }
                    this.#set = null;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, onError);
            } else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }
        isBackAvailable() {
            return this.#currentLevel > -1;
        }
        isForwardAvailable() {
            return this.#currentLevel < this.#stack.length - 1;
        }
        goBack(onSuccess, onError) {
            if (this.#currentLevel > 0) {
                changeConstellation(this.#stack[this.#currentLevel], this.#stack[this.#currentLevel - 1], this.#onLoadRectangle, this.#onUnloadRectangle, () => {
                    this.#currentLevel--;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, onError);
            } else if (this.#currentLevel === 0) {
                changeConstellation(this.#stack[this.#currentLevel], null, this.#onLoadRectangle, this.#onUnloadRectangle, () => {
                    this.#currentLevel--;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, onError);
            } else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }
        goForward(onSuccess, onError) {
            if (this.#currentLevel === -1) {
                changeConstellation(null, this.#stack[this.#currentLevel + 1], this.#onLoadRectangle, this.#onUnloadRectangle, () => {
                    this.#currentLevel++;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, onError);
            } else if (this.#currentLevel < this.#stack.length - 1) {
                changeConstellation(this.#stack[this.#currentLevel], this.#stack[this.#currentLevel + 1], this.#onLoadRectangle, this.#onUnloadRectangle, () => {
                    this.#currentLevel++;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, onError);
            } else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }
        goToStart(onSuccess, onError) {
            if (this.#currentLevel !== -1) {
                changeConstellation(this.#stack[this.#currentLevel], null, this.#onLoadRectangle, this.#onUnloadRectangle, () => {
                    this.#currentLevel = -1;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, onError);
            } else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }
        clear(onSuccess, oError) {
            if (this.#currentLevel !== -1) {
                changeConstellation(this.#stack[this.#currentLevel], null, this.#onLoadRectangle, this.#onUnloadRectangle, () => {
                    this.#stack.splice(0, this.#stack.length);
                    this.#currentLevel = -1;
                    if (typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }, oError);
            } else if (typeof onSuccess === 'function') {
                onSuccess();
            }
        }
        getCurrentSituation() {
            return this.#currentLevel !== -1 ? this.#stack[this.#currentLevel] : [];
        }
        setCurrentSituation(rectangles, onSuccess, onError) {
            // if we don't have a loader we do not proceed
            if (Array.isArray(rectangles)) {
                // try to read new constellation
                this.prepareNextSet(true);
                for (let i = 0; i < rectangles.length; i++) {
                    const rect = rectangles[i];
                    this.addRectangleForNextSetToDefinedLocation(rect.x, rect.y, rect.width, rect.height, rect.id, rect.init);
                }
                this.activateNextSet(onSuccess, onError);
                return true;
            }
            return false;
        }
    }

    class Grid {
        #columnCoordinates;
        #rowCoordinates;
        #margin;
        constructor(config) {
            // init coordinates
            this.#columnCoordinates = createGridCoordinates(config.columns);
            this.#rowCoordinates = createGridCoordinates(config.rows);
            this.#margin = config.margin;
        }
        getColumns() {
            return this.#columnCoordinates.length;
        }
        getRows() {
            return this.#rowCoordinates.length;
        }
        calculateGrid(widthPixels, heightPixels, separatorPixels) {
            const width = typeof widthPixels === 'number' && widthPixels > 0 ? widthPixels : 100;
            const height = typeof heightPixels === 'number' && heightPixels > 0 ? heightPixels : 100;
            const separator = typeof separatorPixels === 'number' && separatorPixels >= 0 ? separatorPixels : 0;
            const margin = this.#margin;
            const leftMargin = ObjectLifecycleManager.getDimensionParameter(margin, 'left', separator);
            const rightMargin = ObjectLifecycleManager.getDimensionParameter(margin, 'right', separator);
            const topMargin = ObjectLifecycleManager.getDimensionParameter(margin, 'top', separator);
            const bottomMargin = ObjectLifecycleManager.getDimensionParameter(margin, 'bottom', separator);
            computeGridAxisPixel(this.#columnCoordinates, width, separator, leftMargin, rightMargin);
            computeGridAxisPixel(this.#rowCoordinates, height, separator, topMargin, bottomMargin);
        }
        #getStartX(columnIndex) {
            return getGridCoordinate(this.#columnCoordinates, columnIndex, 'start');
        }
        #getEndX(columnIndex) {
            return getGridCoordinate(this.#columnCoordinates, columnIndex, 'end');
        }
        #getStartY(rowIndex) {
            return getGridCoordinate(this.#rowCoordinates, rowIndex, 'start');
        }
        #getEndY(rowIndex) {
            return getGridCoordinate(this.#rowCoordinates, rowIndex, 'end');
        }
        getBounds(rectangle) {
            const x = typeof rectangle.x === 'number' ? rectangle.x : 0;
            const y = typeof rectangle.y === 'number' ? rectangle.y : 0;
            const width = typeof rectangle.width === 'number' ? rectangle.width : 1;
            const height = typeof rectangle.height === 'number' ? rectangle.height : 1;
            const colCoorStart = this.#getStartX(x);
            const colCoorEnd = this.#getEndX(x + width - 1);
            const rowCoorStart = this.#getStartY(y);
            const rowCoorEnd = this.#getEndY(y + height - 1);
            return {
                x: Math.floor(colCoorStart),
                y: Math.floor(rowCoorStart),
                width: Math.floor(colCoorEnd - colCoorStart),
                height: Math.floor(rowCoorEnd - rowCoorStart)
            };
        }
    }

    function applyGrid(that, context, disableVisuEvents, enableEditorEvents, onSuccess, onError) {
        let _cont = that._hmi_context.container;
        let _scope = enableEditorEvents === true ? Utilities.getUniqueId() : undefined;
        _cont.addClass('overflow-hidden');
        let _mainDiv = $(ObjectLifecycleManager.DEFAULT_RELATIVE_POSITIONED_FILLED_BORDER_BOX_DIVISION);
        _mainDiv.appendTo(_cont);
        let _children = Array.isArray(that.children) ? that.children : [];
        // get the columns and rows (at least one single cell)
        let columns = 1;
        let rows = 1;
        for (let i = 0; i < _children.length; i++) {
            const child = _children[i];
            const hmiobj = child._hmi_object;
            if (hmiobj && !ObjectLifecycleManager.isTaskType(hmiobj)) {
                const x = typeof child.x === 'number' ? child.x : 0;
                const y = typeof child.y === 'number' ? child.y : 0;
                const width = typeof child.width === 'number' ? child.width : 1;
                const height = typeof child.height === 'number' ? child.height : 1;
                columns = Math.max(columns, x + width);
                rows = Math.max(rows, y + height);
            }
        }
        let _grid = new Grid({
            columns: that.columns !== undefined && that.columns !== null ? that.columns : columns,
            rows: that.rows !== undefined && that.rows !== null ? that.rows : rows,
            margin: that.margin
        });
        rows = undefined;
        columns = undefined;
        _grid.calculateGrid(_mainDiv.width(), _mainDiv.height(), typeof that.separator === 'number' ? that.separator : 0);
        let _placeholders = undefined;
        if (enableEditorEvents === true) {
            applyListenerSupport(that);
            _placeholders = [];
            for (const col = _grid.getColumns() - 1; col >= 0; col--) {
                for (const row = _grid.getRows() - 1; row >= 0; row--) {
                    // closure
                    (function () {
                        const placeholder = {};
                        placeholder.x = col;
                        placeholder.y = row;
                        const hmiobj = {};
                        placeholder.object = hmiobj;
                        placeholder._hmi_object = hmiobj;
                        placeholder.hmi_object = hmiobj;
                        hmiobj._hmi_object = hmiobj;
                        hmiobj.hmi_object = hmiobj;
                        placeholder._hmi_gridElement = $(ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                        placeholder._hmi_gridElement.appendTo(_mainDiv);
                        placeholder._hmi_gridElement.data('hmi_object', hmiobj);
                        ObjectLifecycleManager.setBounds(placeholder._hmi_gridElement, _grid.getBounds(placeholder));
                        _placeholders.push(placeholder);
                        placeholder._hmi_gridElement.droppable({
                            scope: _scope,
                            tolerance: 'pointer',
                            hoverClass: 'default-background-hover',
                            // that method will be called when dragged element has been
                            // dropped
                            drop: (event, ui) => {
                                ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                                // get the source object and data
                                const source = ui.draggable.data('hmi_object');
                                for (let i = 0; i < _children.length; i++) {
                                    const child = _children[i];
                                    if (child._hmi_gridElement && child._hmi_object === source) {
                                        child.x = placeholder.x;
                                        child.y = placeholder.y;
                                        ObjectLifecycleManager.setBounds(child._hmi_gridElement, _grid.getBounds(child));
                                        const hmiobj = child._hmi_object;
                                        if (hmiobj && hmiobj._hmi_resize) {
                                            hmiobj._hmi_resize();
                                        }
                                        that._hmi_forAllEditListeners(listener => {
                                            if (typeof listener.notifyEdited === 'function') {
                                                listener.notifyEdited();
                                            }
                                        });
                                    }
                                }
                            }
                        });
                        let intersects = false;
                        for (let i = 0; intersects === false && i < _children.length; i++) {
                            const child = _children[i];
                            const hmiobj = child._hmi_object;
                            if (hmiobj && !ObjectLifecycleManager.isTaskType(hmiobj)) {
                                const x = typeof child.x === 'number' ? child.x : 0;
                                const y = typeof child.y === 'number' ? child.y : 0;
                                const width = typeof child.width === 'number' ? child.width : 1;
                                const height = typeof child.height === 'number' ? child.height : 1;
                                if (rectanglesIntersect(x, y, width, height, col, row, 1, 1)) {
                                    intersects = true;
                                }
                            }
                        }
                        if (intersects === false) {
                            // The direct replacement for `.hover(fn1, fn2)`, is `.on("mouseenter", fn1).on("mouseleave", fn2)`.
                            // TODO: reuse or remove placeholder._hmi_gridElement.hover(event => placeholder._hmi_gridElement.addClass('default-background-hover'), event => placeholder._hmi_gridElement.removeClass('default-background-hover'));
                            placeholder._hmi_gridElement
                                .on('mouseenter', event => placeholder._hmi_gridElement.addClass('default-background-hover'))
                                .on('mouseleave', event => placeholder._hmi_gridElement.removeClass('default-background-hover'));
                            placeholder._hmi_clickedForEdit = event => {
                                ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                                that._hmi_forAllEditListeners(listener => {
                                    if (typeof listener.showChildObjectEditor === 'function') {
                                        listener.showChildObjectEditor(-1, placeholder);
                                    }
                                });
                            };
                            placeholder._hmi_gridElement.on('click', placeholder._hmi_clickedForEdit);
                        }
                    }());
                }
            }
        }
        let _rectHandler = undefined;
        let _rectHandlerPipe = undefined;
        let _dropable = undefined;
        let droppableCellAdded = undefined;
        let addPlaceholders = undefined;
        let loadRectangle = undefined;
        let reloadRectangle = undefined;
        let unloadRectangle = undefined;
        let tasks = [];
        if (typeof that.droppable === 'string') {
            if (enableEditorEvents !== true) {
                droppableCellAdded = child => {
                    child._hmi_gridElement.droppable({
                        // set the drag and drop scope
                        scope: that.droppable,
                        // only mouse pointer is relevant
                        tolerance: 'pointer',
                        // If specified, the class will be added to the droppable while an
                        // acceptable iconConfig is being hovered over the droppable.
                        hoverClass: typeof that.hoverClass === 'string' ? that.hoverClass : 'default-background-hover',
                        // that method will be called when dragged element has been
                        // dropped
                        drop: (event, ui) => {
                            ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                            // get the source object and data
                            const source = ui.draggable.data('hmi_object');
                            const data = source && source.data !== null && typeof source.data === 'object' ? source.data : undefined;
                            if (data && typeof data.object === 'string' && data.object.length > 0) {
                                const width = typeof data.width === 'number' ? data.width : 1;
                                const height = typeof data.height === 'number' ? data.height : 1;
                                _rectHandlerPipe((onRectHandlerSuccess, onRectHandlerError) => {
                                    _rectHandler.prepareNextSet();
                                    _rectHandler.addRectangleForNextSetToDefinedLocation(child.x, child.y, width, height, data.object, data.init);
                                    _rectHandler.activateNextSet(onRectHandlerSuccess, onRectHandlerError);
                                });
                            }
                        }
                    });
                };
                addPlaceholders = (x, y, width, height) => {
                    // CLASSES
                    const classes = typeof that.dropClasses === 'string' ? that.dropClasses.split(' ') : that.dropClasses;
                    for (let col = x + width - 1; col >= x; col--) {
                        for (let row = y + height - 1; row >= y; row--) {
                            const child = {};
                            child.x = col;
                            child.y = row;
                            const hmiobj = {};
                            child.object = hmiobj;
                            child._hmi_object = hmiobj;
                            child.hmi_object = hmiobj;
                            hmiobj._hmi_object = hmiobj;
                            hmiobj.hmi_object = hmiobj;
                            child._hmi_gridElement = $(ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                            child._hmi_gridElement.appendTo(_mainDiv);
                            if (Array.isArray(classes)) {
                                for (let i = 0; i < classes.length; i++) {
                                    const cls = classes[i];
                                    if (typeof cls === 'string' && cls.length > 0) {
                                        child._hmi_gridElement.addClass(cls);
                                    }
                                }
                            }
                            child._hmi_gridElement.data('hmi_object', hmiobj);
                            ObjectLifecycleManager.setBounds(child._hmi_gridElement, _grid.getBounds(child));
                            _children.push(child);
                            droppableCellAdded(child);
                        }
                    }
                };
                // that method will be called from inside of the rectangle handler in
                // case a new rectangle must be loaded
                loadRectangle = (x, y, width, height, objectReference, onSuc, onErr, initData) => {
                    that.hmi.cms.getObject(objectReference, that.hmi.lang.getLanguage(), ContentManager.PARSE, object => {
                        if (object !== null && typeof object === 'object' && !Array.isArray(object)) {
                            // first we got to remove all place holders
                            for (let col = x + width - 1; col >= x; col--) {
                                for (let row = y + height - 1; row >= y; row--) {
                                    for (let i = 0; i < _children.length; i++) {
                                        const child = _children[i];
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
                            const child = {};
                            child.objectReference = objectReference;
                            // use .object (see code below)
                            child.object = object;
                            child.x = x;
                            child.y = y;
                            child.width = width;
                            child.height = height;
                            child._hmi_gridElement = $(ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                            child._hmi_gridElement.appendTo(_mainDiv);
                            ObjectLifecycleManager.setBounds(child._hmi_gridElement, _grid.getBounds(child));
                            _children.push(child);
                            droppableCellAdded(child);
                            ObjectLifecycleManager.createObject(object, child._hmi_gridElement, () => {
                                child._hmi_object = object._hmi_object;
                                child.hmi_object = object._hmi_object;
                                onSuc();
                            }, onErr, that.hmi, initData, that, child.id, that.hmi_node());
                        } else {
                            // in case object is not available we at least call the callback
                            onSuc();
                        }
                        // in case of an error we at least call the callback
                    }, onErr);
                };
                // that method will be called from inside of the rectangle handler in
                // case a new rectangle must be reloaded
                reloadRectangle = (objectReference, initData) => {
                    for (let i = 0; i < _children.length; i++) {
                        const child = _children[i];
                        if (child.objectReference === objectReference && child.object) {
                            initObject(child.object, initData);
                        }
                    }
                };
                // that method will be called from inside of the rectangle handler in
                // case an existing rectangle must be unloaded
                unloadRectangle = (x, y, width, height, objectReference, onSuc, onErr) => {
                    for (let i = 0; i < _children.length; i++) {
                        const child = _children[i];
                        if (child.objectReference === objectReference) {
                            // here we use .object because we placed our object there (see
                            // code above)
                            ObjectLifecycleManager.killObject(child.object, () => {
                                delete child._hmi_object;
                                delete child.hmi_object;
                                delete child.object;
                                delete child.objectReference;
                                child._hmi_gridElement.data('hmi_object', null);
                                if (enableEditorEvents !== true) {
                                    child._hmi_gridElement.droppable('destroy');
                                }
                                child._hmi_gridElement.remove();
                                delete child._hmi_gridElement;
                                _children.splice(i, 1);
                                addPlaceholders(x, y, width, height);
                                onSuc();
                            }, onErr);
                            break;
                        }
                    }
                };
                _rectHandler = new RectangleHandler(_grid.getColumns(), _grid.getRows(), typeof that.maxStackSize === 'number' ? that.maxStackSize : 64, loadRectangle, reloadRectangle, unloadRectangle);
                _rectHandlerPipe = new Executor.pipe(error => console.error('Handle errors!', error)); // TODO: What is that for???
                addPlaceholders(0, 0, _grid.getColumns(), _grid.getRows());
                if (that.hmi.droppables[that.droppable] === undefined || that.hmi.droppables[that.droppable] === null) {
                    _dropable = {
                        add: (path, width, height, init, onDone) => {
                            const w = typeof width === 'number' ? width : 1;
                            const h = typeof height === 'number' ? height : 1;
                            _rectHandlerPipe((onRectHandlerSuccess, onRectHandlerError) => {
                                _rectHandler.prepareNextSet();
                                _rectHandler.addRectangleForNextSetToDefaultLocation(w, h, path, init);
                                _rectHandler.activateNextSet(() => {
                                    onRectHandlerSuccess();
                                    if (typeof onDone === 'function') {
                                        onDone();
                                    }
                                }, onRectHandlerError);
                            });
                        },
                        home: onDone => {
                            _rectHandlerPipe((onRectHandlerSuccess, onRectHandlerError) => {
                                _rectHandler.goToStart(() => {
                                    onRectHandlerSuccess();
                                    if (typeof onDone === 'function') {
                                        onDone();
                                    }
                                }, onRectHandlerError);
                            });
                        },
                        undo: onDone => {
                            _rectHandlerPipe((onRectHandlerSuccess, onRectHandlerError) => {
                                _rectHandler.goBack(() => {
                                    onRectHandlerSuccess();
                                    if (typeof onDone === 'function') {
                                        onDone();
                                    }
                                }, onRectHandlerError);
                            });
                        },
                        redo: onDone => {
                            _rectHandlerPipe((onRectHandlerSuccess, onRectHandlerError) => {
                                _rectHandler.goForward(() => {
                                    onRectHandlerSuccess();
                                    if (typeof onDone === 'function') {
                                        onDone();
                                    }
                                }, onRectHandlerError);
                            });
                        },
                        getCurrentSituation: () => _rectHandler.getCurrentSituation(),
                        setCurrentSituation: (rectangles, onDone) => {
                            _rectHandlerPipe((onRectHandlerSuccess, onRectHandlerError) => {
                                _rectHandler.setCurrentSituation(rectangles, () => {
                                    onRectHandlerSuccess();
                                    if (typeof onDone === 'function') {
                                        onDone();
                                    }
                                }, onRectHandlerError);
                            }); // TODO: This was: }, i_rectHandlerError);
                        }
                    };
                    that.hmi_dropable = () => _dropable;
                    that.hmi.droppables[that.droppable] = _dropable;
                }
            }
        } else {
            for (let i = 0, l = _children.length; i < l; i++) {
                // closure
                (function () {
                    const idx = i;
                    const child = _children[idx];
                    const hmiobj = child._hmi_object;
                    if (hmiobj) {
                        if (ObjectLifecycleManager.isTaskType(hmiobj)) {
                            if (hmiobj._hmi_init_dom) {
                                // #grid: 1
                                tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: _cont }, onSuc, onErr));
                            }
                        } else {
                            child._hmi_gridElement = $(ObjectLifecycleManager.DEFAULT_ABSOLUTE_POSITIONED_BORDER_BOX_DIVISION);
                            child._hmi_gridElement.appendTo(_mainDiv);
                            ObjectLifecycleManager.setBounds(child._hmi_gridElement, _grid.getBounds(child));
                            if (hmiobj._hmi_init_dom) {
                                // #grid: 2
                                tasks.push((onSuc, onErr) => hmiobj._hmi_init_dom({ container: child._hmi_gridElement }, onSuc, onErr));
                            }
                            if (enableEditorEvents === true) {
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
                            if (enableEditorEvents === true) {
                                child._hmi_clickedForEdit = event => {
                                    ObjectLifecycleManager.preventDefaultAndStopPropagation(event);
                                    that._hmi_forAllEditListeners(listener => {
                                        if (typeof listener.showChildObjectEditor === 'function') {
                                            listener.showChildObjectEditor(idx, child);
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
        that._hmi_resizes.push(() => {
            _grid.calculateGrid(_mainDiv.width(), _mainDiv.height(), typeof that.separator === 'number' ? that.separator : 0);
            if (Array.isArray(_placeholders)) {
                for (let i = 0; i < _placeholders.length; i++) {
                    const child = _placeholders[i];
                    ObjectLifecycleManager.setBounds(child._hmi_gridElement, _grid.getBounds(child));
                }
            }
            for (let i = 0; i < _children.length; i++) {
                const child = _children[i];
                if (child._hmi_gridElement) {
                    ObjectLifecycleManager.setBounds(child._hmi_gridElement, _grid.getBounds(child));
                    const hmiobj = child._hmi_object;
                    if (hmiobj && hmiobj._hmi_resize) {
                        hmiobj._hmi_resize();
                    }
                }
            }
        });
        that._hmi_destroys.push(() => {
            if (enableEditorEvents !== true && typeof that.droppable === 'string') {
                // clean up drop grid elements first ...
                const rect = that.hmi.droppables[that.droppable];
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
            delete that.hmi_dropable;
            _dropable = undefined;
            _scope = undefined;
            for (let i = _children.length - 1; i >= 0; i--) {
                const child = _children[i];
                const hmiobj = child._hmi_object;
                if (hmiobj && hmiobj._hmi_destroy_dom) {
                    // #grid: 1 + 2
                    hmiobj._hmi_destroy_dom();
                }
                if (child._hmi_gridElement) {
                    if (enableEditorEvents === true) {
                        child._hmi_gridElement.off('click', child._hmi_clickedForEdit);
                        delete child._hmi_clickedForEdit;
                    }
                    child._hmi_gridElement.remove();
                    delete child._hmi_gridElement;
                }
            }
            if (Array.isArray(_placeholders)) {
                for (let i = _placeholders.length - 1; i >= 0; i--) {
                    const placeholder = _placeholders[i];
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
        Executor.run(tasks, onSuccess, onError);
    }
    ObjectLifecycleManager.addApplyFunctionForType('grid', applyGrid);

    Object.freeze(GridLayout);
    if (isNodeJS) {
        module.exports = GridLayout;
    } else {
        root.GridLayout = GridLayout;
    }
}(globalThis));
