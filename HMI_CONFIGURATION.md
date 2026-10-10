# HMI Object Configuration Reference

This reference describes the configuration fields and callback functions read by
`ObjectLifecycleManager` and the built-in layout, control, and graph helpers. It
covers the built-in types registered in this repository; additional types may
be registered by extensions.

## Object model and type selection

An HMI definition is a JavaScript object. `type` selects a built-in renderer:

| `type` | Renderer |
| --- | --- |
| `grid` | Grid layout |
| `split` | Pane-based split layout |
| `float` | Freely positioned layout |
| `container` | Dynamically replaceable child content |
| `textfield` | Single-line input |
| `textarea` | Multi-line input or code editor |
| `table` | DataTable |
| `tree` | Fancytree |
| `graph` | Canvas graph |
| `task` | Lifecycle/task object; no visual control is created |

Objects with an absent or unregistered `type` use the basic HTML renderer.
(`task` objects without a `type` are also accepted in Node.js.) `children` is
the recursive object list used by layouts and graphs; other types may instead
have their own data arrays, such as `tree.data` or `graph.curves`.

An object may wrap another object in an `object` property. The lifecycle manager
follows these wrappers to the innermost HMI object. It adds runtime-only
`hmi_object` and `_hmi_*` fields while the object is mounted and removes them
during teardown. Those injected fields are not configuration.

## Shared HMI object fields

These fields are read by the base object manager or basic HTML renderer. A
field only has an effect on renderers that use the corresponding behavior.

| Field | Accepted form / effect |
| --- | --- |
| `type` | Renderer selector listed above. Unknown strings use the basic HTML renderer. |
| `id` | Optional object identifier used for node lookup, lifecycle data routing, and graph references. |
| `object` | Optional object wrapper; see the object model above. |
| `children` | Optional array of child definitions. The expected child fields depend on the parent type. |
| `visible` | Defaults to visible. `false` hides the object; a string is checked with `hmi.env.isInstance`; an array of strings is visible if any instance matches; a function is called and hides only when it returns `false`. |
| `classes` | A space-separated string or array of CSS class names applied to the outer HTML element. |
| `bold` | `true` adds the default bold class to HTML objects. Graph text also uses it. |
| `background` | CSS background string for an HTML object. |
| `color` | CSS text color string for an HTML object. |
| `border` | `true` requests an embossed border; `false` requests an engraved border. |
| `selected` | `true` adds the default selected class to an HTML object. |
| `scrollable` | `true` selects the default scrolling container for basic HTML content; otherwise content is clipped. |
| `html` | String inserted as HTML by the basic renderer. Takes precedence over `text` and `image`. |
| `text` | String, number, or boolean shown as text when `html` is absent and before `image`. |
| `image` | Image source string used when neither `html` nor `text` is selected. |
| `domtype` | HTML tag name used for basic text; defaults to `span`. |
| `textClasses` | Space-separated string or array of classes applied to the generated text element. |
| `imageClasses` | Space-separated string or array of classes applied to the generated image element. |
| `fontsize` | Numeric font size in CSS pixels for basic HTML text. |
| `imageWidth`, `imageHeight` | Optional HTML image dimensions. The image is otherwise fitted to its container. |
| `align` | String containing `left`, `right`, `top`, or `bottom`, or an object with numeric `x` and/or `y` alignment factors. Missing axes are centered. Used by image/text alignment and the float/graph layouts. |
| `margin` | Image inset as a number or `{ left, right, top, bottom }`; each side may be a number. A `true` value uses `separator` as the inset. |
| `separator` | Numeric spacing/gap for grid cells. For image fitting, it is also used as the border/inset value when applicable. |
| `watch` | Data identifier string or array of strings. The manager subscribes to these IDs and updates text/HTML or calls the data callbacks below. Non-string array members are ignored. |
| `data` | Custom payload. For draggable objects, `data.object` is the referenced object and optional `data.width`, `data.height`, and `data.init` describe its inserted size and initialization data. |
| `draggable` | String drag/drop scope used by runtime drag/drop registration. When clicked, an object with the payload above can be inserted into the matching droppable. |
| `clickable` | Set to `false` to suppress click-to-insert behavior for a draggable object. Defaults to enabled. |
| `enabled` | Set to `false` to initially disable button-style handling when one of its event callbacks is present. |
| `verbose` | `true` enables button logging on an HMI object or diagnostic output on a `ropeline` curve definition. |
| `minimumTimeout` | Positive milliseconds to keep the button pressed state for at least this long; defaults to no minimum. |
| `timeout` | Positive milliseconds before a button press is treated as a long click; defaults to no long-click timeout. |

### Shared callbacks and data binding

| Function | Signature / effect |
| --- | --- |
| `init(data)` | Called by the manager when it initializes an object with initialization data. |
| `refresh(object, date)` | Optional periodic object refresh callback. `date` is the UTC time in milliseconds. |
| `resized(width, height)` | Called after the object's HTML container is resized; dimensions are in pixels. |
| `handleDataUpdate(dataId, value, dataType)` | Handles a watched data update. If present, it takes precedence over the default display update. |
| `formatValue(dataId, value, dataType)` | Formats watched non-HTML values for the object's text display when `handleDataUpdate` is absent. |
| `handleLanguageChanged(language)` | Called when the HMI language changes. |
| `pressed()` | Called when a button-style object is pressed. |
| `released()` | Called when it is released; `minimumTimeout` can defer this callback. |
| `clicked()` | Called on release if the long-click timeout did not expire. |
| `longClicked()` | Called after `timeout` expires. |
| `updateEnabled(enabled)` | Called when button-style enabled state is applied or changes. |
| `build`, `apply`, `prepare`, `start` | Lifecycle phase handlers run during creation, in this order. |
| `stop`, `destroy`, `remove`, `cleanup` | Lifecycle phase handlers run during teardown, in this order. |

Lifecycle handlers may be a function, an array of functions/data objects, or an
object of data to transfer. A function is called with the current object as its
first argument and `onSuccess` and `onError` callbacks as its next arguments;
its `this` is the context object. Each lifecycle phase has an optional
`<phase>Timeout` in milliseconds (`createTimeout`, `buildTimeout`,
`applyTimeout`, `prepareTimeout`, `startTimeout`, `killTimeout`, `stopTimeout`,
`destroyTimeout`, `removeTimeout`, `cleanupTimeout`). Positive values override
the manager's 5000 ms default.

If `watch` is set, updates use `handleDataUpdate` first. Otherwise HTML-valued
data is sent to `hmi_html`; non-HTML data is formatted by `formatValue`, or
shown as text. The default numeric formatting multiplies by `factor` when it
is numeric, then uses `postDecimalPositions` (default `0`).

The base manager also supplies runtime methods such as `hmi_text`,
`hmi_element`, `hmi_setVisible`, and control-specific `hmi_*` methods. These
are attached during initialization and removed during destruction; they are
not database configuration fields.

### Optional time-range behavior

Defining `handleRangeUpdate(from, to, synchronized)` enables time-range
handling. It adds `hmi_setAbsoluteRange(min, max)`,
`hmi_setCurrentRange(from, to)`, `hmi_maximizeRange()`, `hmi_zoomIn()`,
`hmi_zoomOut()`, `hmi_shiftUp(pressed)`, `hmi_shiftDown(pressed)`,
`hmi_synchronize(enabled)`, and range/state getters at runtime.

| Field | Accepted form / effect |
| --- | --- |
| `onlyInteger` | `true` rounds range endpoints to integer boundaries. |
| `doublingClickCount` | Number at least `1`; controls how many zoom steps double/halve the range. Defaults to `2`. |
| `shiftFactor` | Number strictly between `0` and `1`; fraction of the current range moved per shift. Defaults to `0.2`. |
| `shiftMillis` | Positive interval in milliseconds for repeated range shifting. Defaults to `1000`. |
| `syncMillis` | Positive interval in milliseconds for repeated range updates. Defaults to `1000`. |

## `task`

Task objects run lifecycle functions but do not receive a visual HTML control.
If `children` is an array, task children are initialized and destroyed against
the parent's container. In a browser, declare `type: "task"`; an untyped object
is treated as a task only in Node.js.

## Basic HTML object (missing or unknown `type`)

This renderer uses the shared fields above. Content selection is `html`, then
`text`, then `image`. HTML and text content can be made scrollable with
`scrollable`; images are scaled to fit, preserving their aspect ratio, using
`align`, `margin`, and `separator`.

## `container`

| Field | Accepted form / effect |
| --- | --- |
| `children` | Not used for the displayed content. Content is set at runtime through `hmi_setContent`. |

The container exposes runtime methods `hmi_getContent()`,
`hmi_setContent(object, onSuccess, onError, initData, disableVisuEvents, enableEditorEvents)`,
and `hmi_removeContent(onSuccess, onError)`. These methods mount and dispose a
single content subtree; they are not stored configuration callbacks.

## `grid`

| Field | Accepted form / effect |
| --- | --- |
| `columns`, `rows` | Number of equally sized tracks, or an array of track sizes. Array entries may be positive relative weights or pixel strings such as `"80px"`; unspecified/invalid entries are distributed as relative tracks. If omitted, the extents are inferred from children. |
| `margin` | Numeric margin or `{ left, right, top, bottom }` margins; `true` for a side uses the separator width. |
| `separator` | Numeric gap in pixels between rows and columns. Defaults to `0`. |
| `children` | Child object array. Each visual child uses `x`, `y`, `width`, and `height` as zero-based grid coordinates/spans; defaults are `0`, `0`, `1`, `1`. Task children are initialized without a grid cell. |
| `droppable` | String drop scope enabling dynamic object insertion into grid cells. |
| `hoverClass` | CSS class added to a drop target while an acceptable item is hovered; defaults to `default-background-hover`. |
| `dropClasses` | Space-separated string or array of CSS classes applied to empty drop-cell placeholders. |
| `maxStackSize` | Maximum number of stacked rectangles accepted by the dynamic grid handler; defaults to `64`. |

Dropping a draggable payload into a cell loads the referenced object from the
content manager. Its `data.width`, `data.height`, and `data.init` supply the
inserted cell span and initialization data.

## `split`

| Field | Accepted form / effect |
| --- | --- |
| `children` | Child objects with a `location` value of `left`, `right`, `top`, `bottom`, or `center`. A task child is initialized against the outer container. |
| `topSize`, `bottomSize` | Numeric fraction of container height assigned to the respective pane. With both panes, defaults are `0.3` each; with only one, it defaults to `0.5` (or the complement of the opposite size, if supplied). |
| `leftSize`, `rightSize` | Numeric fraction of container width assigned to the respective pane. With both panes, defaults are `0.3` each; with only one, it defaults to `0.5` (or the complement of the opposite size, if supplied). |
| Child `location` | Selects the pane. At most one child per location is represented by this layout. |

## `float`

| Field | Accepted form / effect |
| --- | --- |
| `children` | Child objects positioned within the container. Task children initialize against the outer container. |
| Child `x`, `y` | Numeric fractions of container width/height, or pixel strings such as `"24px"`. Defaults to `0`. |
| Child `width`, `height` | Numeric fractions of container width/height, or pixel strings. Defaults to `0.1` of the corresponding dimension. |
| Child `align` | Alignment at the child's `x`,`y` anchor; accepts the shared string or `{ x, y }` form. Defaults to the center anchor. |

The editor can drag visual children to update their position and size while
preserving whether each coordinate/dimension was configured as pixels or a
relative fraction.

## `textfield`

| Field | Accepted form / effect |
| --- | --- |
| `value` | Initial string value. |
| `readonly` | `true` creates a read-only input. |
| `editable` | `false` also creates a read-only input. |
| `password` | `true` creates a password input; otherwise it is a text input. |

Runtime methods include `hmi_value(value?)`, `hmi_getTextField()`,
`hmi_addChangeListener(listener)`, and `hmi_removeChangeListener(listener)`.
The listener functions are attached at runtime, not supplied as configuration.

## `textarea`

| Field | Accepted form / effect |
| --- | --- |
| `value` | Initial string value. |
| `readonly` | `true` makes the textarea/editor read-only. |
| `editable` | `false` also makes it read-only. |
| `code` | Non-empty string enables the code editor. `"javascript"` selects JavaScript mode; `"html"` selects HTML mode/beautifier, and other values use HTML editor mode. If absent/empty, a plain textarea is used. |
| `beautify` | `true` applies the default formatter options when setting a value; an object is passed as formatter options. |

Runtime methods include `hmi_value(value?)`, `hmi_editor()`,
`hmi_setReadOnly(readOnly)`, `hmi_searchText(text)`, and change-listener
registration methods. `hmi_handleScrollParams(params, restore)` saves/restores
editor scroll state; `params` uses `container_width`, `container_height`,
`viewport_width`, `viewport_height`, `viewport_left`, and `viewport_top`.

## `table`

| Field | Accepted form / effect |
| --- | --- |
| `columns` | Number of columns, or an array of column definitions. |
| Column `width` | Numeric relative width weight; defaults to `1`. Weights are normalized across columns. |
| Column `labelId` | Language/access-system label identifier for the header. |
| Column `text` | Literal header text, used if `labelId` is absent. |
| Column `textsAndNumbers` | `true` enables text-and-number sorting for this column. |
| Column `timestamp` | `true` enables timestamp sorting if `textsAndNumbers` is not set. |
| `paging` | `true` enables paging; otherwise the table uses a scrolling body. |
| `searching` | `true` enables DataTables searching. |
| `tableStyle` | String placed in the table's inline `style` attribute. |
| `getRowCount()` | Returns the number of rows to load. |
| `getCellHtml(row, column)` | Returns a cell's content; `null`/`undefined` becomes an empty cell. |
| `prepareTableRow(rowElement, rowIndex)` | Optional row callback used by DataTables. |
| `handleTableRowClicked(rowIndex)` | Called when a row is clicked. |
| `handleTableCellClicked(rowIndex, columnIndex)` | Called when a cell is clicked. |
| `highlightSelectedRow` | `true` highlights the clicked row when row-click handling is enabled. |

The table exposes `hmi_reload()`, `hmi_value(row, column, value?)`,
`hmi_isRowVisible(row)`, `hmi_isCellVisible(row, column)`, and
`hmi_dataTable()` at runtime.

## `tree`

| Field | Accepted form / effect |
| --- | --- |
| `data` | Array of local Fancytree node definitions. If not an array, the tree loads its root nodes remotely using `rootURL` and `rootRequest`. |
| `rootURL` | URL used to fetch root and lazy-loaded child nodes. |
| `rootRequest` | Request value sent with the node path in the AJAX `request` parameter. |
| `compareNodes(node1, node2)` | Optional comparator used when refreshing loaded child nodes. |
| `nodeActivated(node)` | Called when a node is activated. |
| `selectedNodeHasFocus(node)` | Called when the selected node receives focus. |
| `selectedNodeLostFocus(node)` | Called when the selected node loses focus. |
| `nodeClicked(node)` | Called when a node is clicked. |

Node definitions in `data` use the following recognized fields:

| Node field | Effect |
| --- | --- |
| `title` | Node text; may contain HTML. |
| `key` | Unique key; generated when omitted. |
| `refKey` | Reserved by Fancytree. |
| `expanded`, `folder`, `hideCheckbox`, `lazy`, `selected`, `unselectable` | Boolean node options. |
| `active`, `focus` | Initial state only; not retained as normal node state. |
| `children` | Array of child node definitions. |
| `tooltip` | Node tooltip string. |
| `extraClasses` | Space-separated CSS classes for the node. |
| `data` | Object copied to `node.data`. |
| Other node fields | Copied to `node.data` under the same field name. |

Runtime operations include `hmi_setRootPath(path, onSuccess, onError)`,
`hmi_getRootNode()`, `hmi_updateLoadedNodes(onSuccess, onError)`, and
`hmi_setActivePath(path, onSuccess, onError)`.

## `graph`

The graph renderer uses one canvas for a tree of graphical objects. Numeric
coordinates and dimensions are in graph units and scale with the graph;
pixel strings such as `"12px"` are absolute pixels where a pixel value is
accepted.

### Graph root and child fields

| Field | Accepted form / effect |
| --- | --- |
| `bounds` | Graph coordinate rectangle `{ x, y, width, height }` or `{ x1, y1, x2, y2 }`. Defaults to origin `(0,0)` and size `1 x 1` when omitted. |
| `mirrorX` | `true` mirrors the horizontal graph axis. |
| `mirrorY` | `false` disables the default vertical-axis mirror; otherwise the y-axis is mirrored. |
| `zoom` | `true` enables pointer/touch pan and wheel zoom when `bounds` is an object. |
| `zoom_rotation` | `true` enables the graph's two-touch rotation behavior. |
| `multitouch` | `true` enables two-finger gestures. |
| `children` | Graph child objects. Use `type: "graph"` for canvas-rendered graphical objects; their primitive is inferred from their drawing fields below, and they may contain further graph children. Task children initialize against the graph container; other types are HTML HMI objects positioned by their child geometry. |
| Child `x`, `y` | Graph coordinate anchor; default `0`. |
| Child `width`, `height` | Graph coordinate dimensions for rectangles/images and embedded HTML children. |
| Child `z` | Drawing layer: number for order, or `"background"` / `"foreground"` for fixed back/front placement. |
| Child `id` | Identifier used by graph curve/vehicle references. |
| Child `mirrorX`, `mirrorY` | Child-level axis direction controls. |
| `mirrorZ` | Reverses numeric child z-order. |
| Child `align` | Anchor alignment, using the shared string or `{ x, y }` format. |
| Child `scale` | Numeric child scale; defaults to `1`. |
| Child `angle` | Rotation in degrees. |
| Child `phi` | Rotation in radians; takes precedence over `angle`. |
| Child `upright` | `true` prevents the inherited graph rotation from rotating the child. |
| Child `flipX`, `flipY` | `true` flips the child around the respective axis. |
| Child `pressed()` | Makes the graphic object button-like and is called when the object is pressed. |
| Child `vps`, `scene` | String IDs of the vehicle-position system and scene objects. When both resolve, scene children with numeric `segment` values are used as vehicle segments. |
| Child `length` | Object length supplied to the vehicle position adjuster. |
| Child `vps_offset` | Numeric offset added to the raw vehicle position. |
| Child `stress` | `true` updates the linked rope curve's vehicle stress position. |

### Built-in canvas primitives

A graphic child is inferred from its fields; there is no separate primitive
`type` field:

| Primitive | Fields that select it |
| --- | --- |
| Arc | `r` (radius). Optional `phi1`/`phi2` angles in radians or `angle1`/`angle2` in degrees define its angular range. |
| Rectangle | `width` and `height`. Optional `roundBorder` sets rounded corners. |
| Image | `image` alone uses the source's natural size; with `width` and/or `height`, a missing dimension is inferred from the source aspect ratio. |
| Text | `text`; may be a string or an array of lines. |
| Path | `points` array with at least two points. Each point has `x` and `y`, optional corner radius `r`, and optional `move: true` to begin a new subpath. |
| Curve section | `curve` references a curve ID from the root `curves` array; optional `from` and `to` fractions select the section, defaulting to `0` and `1`. |

Additional drawing fields:

| Field | Effect |
| --- | --- |
| `closed` | `true` closes a path/curve. |
| `fill`, `fillStyle` | Enables fill when `fill` is `true` or `fillStyle` is a string; `fillStyle` is a canvas color/style. |
| `stroke`, `strokeStyle`, `lineWidth` | Enables stroke when `stroke` is `true`, or a valid `lineWidth`/`strokeStyle` is supplied. Numeric/pixel `lineWidth` is accepted. |
| `lineCap`, `lineJoin` | Canvas line-cap and line-join strings; also trigger path/curve stroke. |
| `alpha` | Image opacity, clamped from `0` (transparent) to `1` (opaque). |
| `fontSize`, `fontFamily`, `bold` | Text font settings. `fontSize` may be numeric or a pixel string; default size is `10`, default family is `Verdana`. |
| `left`, `right` | Signed offset from a referenced curve section; `left` takes precedence. |
| `paint(date)` | Optional custom painter. When provided, it replaces the built-in primitive painter. |

`fillStyle`, `strokeStyle`, `lineWidth`, `lineCap`, `lineJoin`, `fontSize`,
`fontFamily`, and `roundBorder` are inherited from the graphic object's
`hmi_locator`/parent chain if not defined on the object itself.

A graph object may also contain `curves`, an array of curve definitions:

| Curve field | Effect |
| --- | --- |
| `type` | `"arcline"` or `"ropeline"`. |
| `id` | Reference used by child `curve` values. |
| `points` | Array of points with numeric `x` and `y`; optional `r` rounds a point, `position` records a curve position, and `id` identifies a point. |
| `closed` | `true` closes the curve. |
| `weightPerMeter` | Positive rope weight per meter for a `ropeline`. |
| `maxIterations` | Positive maximum iteration count for rope calculation. |
| `distanceTolerance` | Positive rope calculation tolerance. |
| `stressX`, `stressSag` | Numeric stress point and sag settings for a rope curve. |
| `verbose` | `true` enables curve diagnostic logging. |

Curve definitions also use the graph coordinate transform fields (`x`, `y`,
`scale`, `angle`/`phi`, `mirrorX`, `mirrorY`) where applicable.

## Dialog helper configuration

The following options are accepted by the manager's dialog helpers. They
configure dialog calls, not an object's `type`.

| Field | Effect |
| --- | --- |
| `object` | HMI object rendered inside the dialog. For the default confirmation helper, if absent, `text` or `html` is wrapped into a basic object. |
| `text`, `html` | Content used by the default confirmation helper when `object` is absent. |
| `title`, `width`, `height` | Dialog title and numeric pixel dimensions. Dimensions are capped at the window size. |
| `noClose` | `true` hides the close control and disables closing with Escape. |
| `init` | Initialization data passed to the dialog object's subtree. |
| `buttons` | Array of button definitions. Each button needs a `click(close, button)` function to be displayed; optional fields are `id`, `text`, and `visible`. |
| `closed(event, ui)` | Called when the dialog closes. |
| `ok`, `yes`, `no`, `cancel` | In the default confirmation helper, callbacks for the corresponding buttons. |
| `okLabelId`, `yesLabelId`, `noLabelId`, `cancelLabelId` | Optional label IDs for confirmation button captions; otherwise captions are `OK`, `Yes`, `No`, and `Cancel`. |

## Extension points

The manager permits additional types through `addApplyFunctionForType(type,
apply)` and additional object behavior through its extension mechanism. Their
configuration fields are defined by those extensions and are not part of this
built-in reference.
