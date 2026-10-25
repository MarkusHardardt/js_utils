# Mathematics module

`src/Mathematics.js` exports one frozen default object. Import it as follows:

```js
import Mathematics from './src/Mathematics.js';

const point = new Mathematics.Transform().transform(2, 3);
```

The module contains numeric constants and conversions, coordinate transforms,
curve geometry, chain and rope models, discretization, maze generation, and
weighted-graph path finding. Angles passed to methods are in radians unless
otherwise stated.

For curve offsets, `left` is a signed distance measured to the left of the
curve's direction of travel: a positive value moves left, and a negative value
moves right. This convention applies to `ArcLine`, `RopeLine`, and
`CurveSection` offsets, including drawing methods that accept a `left` argument.

## Constants

| Member | Meaning |
| --- | --- |
| `THIRD` | `1 / 3`. |
| `TWO_PI` | `2π` radians. |
| `HALF_PI` | `π / 2` radians. |
| `QUARTER_PI` | `π / 4` radians. |
| `RAD2DEG` | Multiplier for converting radians to degrees. |
| `DEG2RAD` | Multiplier for converting degrees to radians. |
| `GOLDEN_CUT` | Golden ratio, `(1 + √5) / 2`. |
| `GOLDEN_CUT_INVERTED` | Reciprocal of `GOLDEN_CUT`. |
| `SPECIFIC_GRAVITY_OF_STEEL` | Steel density used by the rope helper, in kg/m³ (`7860`). |
| `EARTH_GRAVITATION` | Standard gravitational acceleration, in m/s² (`9.80665`). |

## Numeric functions

| Function | Description |
| --- | --- |
| `sinh(value)` | Hyperbolic sine. Uses the native `Math.sinh` when available. |
| `cosh(value)` | Hyperbolic cosine. Uses the native `Math.cosh` when available. |
| `asinh(value)` | Inverse hyperbolic sine. Uses the native `Math.asinh` when available. |
| `acosh(value)` | Inverse hyperbolic cosine. Uses the native `Math.acosh` when available. |
| `createBiomialCoefficients(maxN)` | Intended to return a triangular array of binomial coefficients from row `0` through `maxN` (Pascal's triangle). Despite the historical spelling, the exported name is `createBiomialCoefficients`. Throws if `maxN < 0` or `maxN >= 68`. **Current limitation:** for `maxN >= 2`, the implementation can overwrite interior/edge entries with `NaN`; results are reliable only for rows `0` and `1`. |
| `getSmoothNormalizedTransfer(value, position1, position2)` | Returns a smooth, symmetric transfer/falloff value. `value` is treated as an absolute distance; the two transition positions are clamped to `[0, 1]` and may be supplied in either order. Non-numeric `value` is treated as `0`, and missing/non-numeric positions default to `0` and `1`. |
| `normalizeToPlusMinusPI(phi)` | Wraps an angle in radians into `(-π, π]`. |
| `normalizeToPlusMinus180deg(angle)` | Wraps a degree value into `(-180, 180]`. |
| `getHarmonicRGB(value, min, max)` | Generates a cycling RGB string (`rgb(r,g,b)`) using three phase-shifted cosine channels. Optional channel limits default to `0` and `256`, and are clamped to that range. |
| `toBool(value)` | Returns `true` only when `value === true`; all other values become `false`. |
| `toS8(value)` / `toU8(value)` | Floors and wraps a value to an 8-bit signed / unsigned integer. |
| `toS16(value)` / `toU16(value)` | Floors and wraps a value to a 16-bit signed / unsigned integer. |
| `toS32(value)` / `toU32(value)` | Floors and wraps a value to a 32-bit signed / unsigned integer. |
| `getS32bit(value, bit)` | Tests the signed 32-bit integer bit at `bit % 32`; returns a boolean. |
| `setOffset(offset, point)` | Converts a number or offset object into `{x, y}`. A number or `offset.offset` supplies `x`; `offset.left` supplies signed `y` (negative means a shift right), while `offset.right` supplies the inverse sign (positive means a shift right). Reuses and returns `point` when supplied. |
| `getArc(x1, y1, x2, y2, x3, y3, radius)` | Calculates a circular fillet tangent to the segments `(x1,y1)→(x2,y2)` and `(x2,y2)→(x3,y3)`. Returns `false` if the geometry is degenerate; otherwise returns `{left, right, centerX, centerY, radius, startX, startY, startPhi, endX, endY, endPhi}`. Angles are radians. |

### Integer conversion notes

These helpers use `Math.floor` followed by bitwise operations; they do not
validate or clamp their input. For example, values outside the target width wrap
to the representable range.

## `Transform`

`new Transform()` creates an identity 2D affine transform. It stores both the
forward and inverse matrices, along with scale, rotation and mirror metadata.
The forward mapping is:

```text
x' = d00*x + d01*y + tx
y' = d10*x + d11*y + ty
```

Here `tx` and `ty` are stored in the public translation fields `x` and `y`.
The coordinate mapping and the relationship between metric and screen axes are
illustrated in [the affine transform diagram](./docs/images/mathematics-affine-transform.svg).

| Method | Description |
| --- | --- |
| `setToIdentity()` | Resets the transform and inverse to identity; returns `this`. |
| `init(transform)` | Copies the matrix and metadata from another transform; returns `this`. |
| `setScale(scale)` | Applies a uniform scale to the current transform and inverse; returns `this`. |
| `translate(translateX, translateY)` | Applies a translation in the transform's local coordinates; returns `this`. |
| `rotate(phi, mirrorX, mirrorY)` | Applies a rotation in radians and updates mirror flags. The mirror arguments are enabled only by literal `true`; returns `this`. |
| `concatenate(transform)` | Post-concatenates another transform (`this = this × transform`); returns `this`. |
| `preConcatenate(transform)` | Pre-concatenates another transform (`this = transform × this`); returns `this`. |
| `invert()` | Swaps the forward and inverse matrices and inverts scale/rotation. Mutates the instance; returns `undefined`. |
| `initForPoints(metricX1, metricY1, metricX2, metricY2, pixelX1, pixelY1, pixelX2, pixelY2)` | Builds a transform mapping a pair of metric points to a pair of pixel points, preserving the existing mirror flags; returns `this`. |
| `initForPoint(metricX, metricY, pixelX, pixelY)` | Sets translation so the given metric point maps to the given pixel point without changing the linear part; returns `this`. |
| `initForBounds(metric, pixelWidth, pixelHeight, mirrorX, mirrorY)` | Fits metric bounds into a pixel rectangle, preserving aspect ratio and centering the result. `metric` may have `{x, y, width, height}` or `{x1, y1, x2, y2}`. Returns `true` on success; invalid or zero-size bounds reset the transform and return `false`. |
| `applyCoordinateTransformation(translateX, translateY, scale, phi, mirrorX, mirrorY)` | Applies translation, scale, then rotation/mirroring. `phi` is in radians. Mutates the instance and returns `undefined`. |
| `setToCoordinateTransform(params, parent)` | Initializes from an optional parent transform, then applies `{x, y, scale, phi, angle, mirrorX, mirrorY, upright}`. `phi` is radians; `angle` is degrees and is used if `phi` is not numeric. Mutates the instance. |
| `transform(x, y, point)` | Applies the forward transform and returns `{x, y}`; reuses `point` if supplied. |
| `transformInverse(x, y, point)` | Applies the inverse transform and returns `{x, y}`; reuses `point` if supplied. |
| `save()` | Pushes a copy of the current transform onto an instance-local stack. |
| `restore()` | Restores the last saved transform; if the stack is empty, resets to identity. |

Public matrix fields are `d00`, `d01`, `x`, `d10`, `d11`, `y` for the forward
matrix, `i00`, `i01`, `i02`, `i10`, `i11`, `i12` for its inverse, and
`scale`, `rotation`, `mirrorX`, `mirrorY` for transform metadata.

## `Adjuster`

`Adjuster` maps values along a sequence of corresponding source and target
intervals. Both axes must progress strictly and consistently in one direction;
flat or direction-reversing intervals are rejected.

| Method / field | Description |
| --- | --- |
| `reset(source, target, id)` | Clears configured intervals. Optional starting values default to `0`; stores the starting identifier. |
| `add(source, target, id)` | Adds an interval endpoint and its identifier. Returns `false` for a flat interval or a direction change, otherwise `true`. |
| `adjust(source)` | Maps a source value to its target value, linearly extrapolating outside the configured range. Returns `false` if there are no intervals. |
| `adjustInverse(target)` | Maps in the reverse direction with linear extrapolation. Returns `false` if there are no intervals. |
| `format()` | Returns a human-readable description of the interval scale factors, or `false` when empty. |
| `valid` | Readable state flag, set to `true` after at least one successful `add`. |
| `incrementSource`, `incrementTarget` | Readable booleans describing the configured directions. |

## Curve geometry

### `ArcLine`

`new ArcLine(curve)` builds a line-and-arc path from `curve.points`. Each point
must have numeric `x` and `y`; an optional positive `r` creates a tangent arc
at that point. Optional numeric `position` and optional `id` are used by the
internal position adjustment. `curve.closed === true` closes the path.
Coordinate-transform settings on `curve` are applied through `Transform`.

| Method / field | Description |
| --- | --- |
| `adjust()` | Reapplies the curve's coordinate transform. |
| `getLength()` | Returns the calculated path length. The same value is exposed as `length`. |
| `transform(position, left, point)` | Maps distance along the path to `{x, y, phi}`. `left` is a signed lateral offset: positive is left and negative is right. An optional result object is reused. Closed paths wrap; open paths extrapolate along the end tangent. Returns `false` when there is no usable path. |
| `stroke(context, transform, start, end, left)` | Draws the selected distance interval to a Canvas 2D context, optionally offset by signed `left` (negative offsets draw on the right). |
| `closed` | Indicates whether the path wraps around. |

### `CurveSection`

`new CurveSection(curve, id, curveStart, curveEnd, elements)` places elements
on a portion of an `ArcLine` or `RopeLine`. Elements with a positive numeric
`length` define section zones; their summed lengths define the section's
coordinate system. The curve interval defaults to `0` through `curve.getLength()`
and is scaled to fit the section. Elements without a valid length are point
items, positioned by a numeric `position` or by their order in `elements`.

| Method | Description |
| --- | --- |
| `getLength()` | Returns the sum of valid element lengths. |
| `getZoneCount()` | Returns the number of elements with positive lengths. |
| `getZoneObject(zone)` | Returns a zone's element by numeric index, or `undefined`. |
| `getZoneStart(zone)` / `getZoneEnd(zone)` | Returns a zone's section-coordinate boundary. `zone` may be an index or an element's `child` reference. |
| `getItemCount()` | Returns the number of elements without a positive length. |
| `getItem(item)` | Returns a point item's record by index or by its `child` reference, or `undefined`. |
| `getItemPosition(item)` | Returns a point item's section position by index or `child` reference, or `undefined`. |
| `transform(sectionPosition, offset, point)` | Maps a section position to the underlying curve and returns `{x, y, phi}`. `offset` may be a numeric along-curve offset or `{offset, left}` / `{offset, right}`. The `left` property is signed: negative values shift right; `right` is interpreted as a positive distance to the right. |
| `fromSectionToCurve(position)` | Converts a section distance to the underlying curve distance. |

### `ChainFunction`

`ChainFunction` models a flexible chain as a catenary where possible, and uses
linear fallbacks for degenerate three-point input. In normalized coordinates,
the catenary is represented by

```text
y = cosh(a*x + b) / a + c
```

The solver first shifts and scales the coordinates so the endpoint span is
centered and has a stable working scale. This reduces sensitivity to the units
and absolute location of the input data. The suspended curve is illustrated in
[the chain diagram](./docs/images/mathematics-chain.svg).

`new ChainFunction(maxIterations, distanceTolerance, lengthTolerance)` accepts
optional positive numeric solver settings; otherwise internal defaults are
used. `reset()` clears the current solution.

| Method | Description |
| --- | --- |
| `initForThreePoints(x1, y1, x2, y2, x3, y3)` | Fits a chain through three points. Returns `true` on success, otherwise `false`. |
| `initForLength(x1, y1, x2, y2, length)` | Fits a chain between two endpoints with a specified total length. Returns `false` if the length is too short or the solver cannot converge. |
| `initForMinimumForce(x1, y1, x2, y2, x)` | Fits a chain between two endpoints that minimizes force at horizontal coordinate `x`. |
| `initForForce(x1, y1, x2, y2, x, force, q0)` | Fits a chain between endpoints for a specified force at `x`. Optional positive `q0` is weight per meter; the force must be achievable. |
| `getHeight(x)` | Returns the chain height at horizontal coordinate `x`. |
| `getGradient(x)` | Returns `dy/dx` at `x`. |
| `getAngle(x)` | Returns the tangent angle at `x`, in radians. |
| `getMinimumLocation()` | Returns the horizontal coordinate of the chain's minimum. Use `isValid()` to determine whether a solution has been initialized. |
| `getMinimumHeight()` | Returns the minimum height. Use `isValid()` to determine whether a solution has been initialized. |
| `getLength(x1, x2)` | Returns the chain arc length between two horizontal coordinates. |
| `getLocation(offsetX, distance)` | Finds the horizontal coordinate at the given chain distance from `offsetX`. |
| `getForce(x, weightPerMeter, gravitation)` | Returns force at `x` for the supplied linear mass/weight parameter and gravity. |
| `isValid()` | Indicates whether the last initialization succeeded. |
| `isCosinusHyperbolicus()` | Indicates whether the solution uses the hyperbolic-cosine catenary form rather than a fallback. |
| `getA()` / `getB()` / `getC()` | Returns the current equation coefficients for `y = cosh(A*x + B) / A + C` in the original coordinate system. |

### Chain fitting methods

#### Through three prescribed points

`initForThreePoints(x1, y1, x2, y2, x3, y3)` first orders the points by
horizontal coordinate, allowing for the configured distance tolerance. When
the coordinates are distinct, it solves for the catenary parameters that pass
through all three points. It begins by fitting a parabola through the three
points. Since a second-order Taylor approximation of `cosh` is parabolic, that
fit gives useful initial estimates for `a` and `b`.

The solver then performs a two-dimensional Newton iteration on `a` and `b`.
Its two residual equations enforce the height differences from the middle
point to each endpoint; after convergence, `c` is chosen to match the common
vertical offset. The iteration stops when both residuals are within
`distanceTolerance`, or fails if it reaches `maxIterations` or encounters a
singular/non-finite Jacobian determinant. The iteration count and distance
tolerance are configurable through the constructor.

If two adjacent points have effectively the same `x` coordinate, the method
falls back to the straight line between the two distinct endpoints instead of
trying to fit a catenary. Three coincident points are invalid. If the
two-dimensional iteration for three distinct points does not converge, the
initial three-point parabola remains available. The current public method does
not propagate that inner iteration's failure and still marks this fallback as
valid; `isValid()` therefore does not by itself prove that the result is a
catenary. A successful straight-line or parabolic fallback also has
`isCosinusHyperbolicus() === false`.

#### Between two endpoints with a prescribed chain length

`initForLength(x1, y1, x2, y2, length)` requires two distinct horizontal
endpoints and a requested length strictly greater than their straight-line
distance. It first fits a straight line through the endpoints and uses a
midpoint sag as a one-dimensional search variable:

1. Starting at zero sag, it increases the trial sag geometrically until the
   catenary through the endpoints and trial midpoint is at least as long as
   the requested chain. Each trial catenary is initialized using the
   three-point solver above.
2. Once the requested length is bracketed, it bisects the sag interval. At
   each midpoint it evaluates the catenary's arc length; the interval is
   narrowed until the length is within `lengthTolerance`.
3. It refines the catenary parameters with a two-dimensional Newton iteration.
   The two equations now enforce the endpoint height difference and the
   requested arc length. A singular Jacobian or failure to meet
   `distanceTolerance` within `maxIterations` makes the fit fail.

The length search uses the analytic catenary arc-length expression; the
`lengthTolerance` controls the bisection stage, while `distanceTolerance`
controls the final parameter solve. Impossible/too-short lengths, coincident
endpoints, and non-convergent iterations return `false` and leave no valid
solution.

#### Between two endpoints with a prescribed force

`initForForce(x1, y1, x2, y2, x, force, q0)` fits a catenary with the specified
force at horizontal position `x`. It is a two-stage solve:

1. It calls `initForMinimumForce` at `x` to find the catenary with the least
   possible force there for the given endpoints. This minimum is found by a
   golden-section search over candidate midpoint sag values. The search
   repeatedly fits a catenary through the endpoints and a trial midpoint,
   evaluates the force at `x`, and discards the higher-force portion of the
   bracket. It stops when the sag bracket is within `distanceTolerance` or
   fails at `maxIterations`.
2. If the requested force is below that minimum, the requested state is
   infeasible. Otherwise, a shrinking step search varies the sag to approach
   the requested force. A final two-dimensional Newton iteration refines `a`
   and `b`, simultaneously satisfying the endpoint height difference and the
   force condition at `x`. As in the other catenary fits, a singular Jacobian
   or failure to converge returns `false`.

When `q0` is a positive line weight, the requested physical force is divided by
`q0` before solving; otherwise `force` is used directly as the force scale.
`initForMinimumForce` is also exposed independently and returns the
minimum-force catenary without requiring a target force. For all catenary
methods, `getHeight`, `getGradient`, `getAngle`, `getLength`, `getLocation`,
and `getForce` evaluate the accepted solution; check `isValid()` before
depending on a result.

### `RopeLine`

`new RopeLine(curve)` builds a rope from a configuration object. `curve.points`
must be an array containing support objects (`{type: 'support', x, y}`); each
consecutive pair defines a span. Any number of intermediate supports can be
used, but their `x` coordinates must progress consistently in one direction.
Each span is modeled by its own `ChainFunction`. Intermediate
`{type: 'field'}` entries associate a shape constraint with the span between
the surrounding supports. The class calculates the curve in this order:
determine each span's catenary, solve circular transitions at supports, and
then construct an arc-length coordinate along the resulting rope.

The configuration can include the following optional fields:

| Configuration | Meaning |
| --- | --- |
| `weightPerMeter` | Positive rope mass per meter. It is multiplied by gravitational acceleration to obtain line weight for force calculations. |
| `maxIterations`, `distanceTolerance` | Solver limits passed to the support-transition calculation and used as defaults by field-chain solvers. |
| Transform fields | `x`, `y`, `scale`, `phi` / `angle`, `mirrorX`, `mirrorY`, and `upright`, as supported by `Transform.setToCoordinateTransform`. |
| Support `r` | Positive bend radius at an intermediate support. If absent or invalid, that support is not replaced by a circular transition. |
| Support `counterweight` | Counterweight mass at an end support. The first support's value is preferred; if it is absent, the last support's value can seed the solution. |
| Support `rope` | Steel rope diameter in meters, or an array of diameters, used to derive the line weight when `weightPerMeter` has not supplied one. |
| Field `length` | Positive desired catenary length for the span. |
| Field `x` and `y` | Prescribed point through which the span must pass. If `x` is omitted, the span midpoint is used. The point must lie below the straight chord between supports. |
| Field `x` and `sag` | Positive downward sag below the straight chord at `x`; if `x` is omitted, the midpoint is used. |
| Field `x` and `force` | Positive prescribed force at `x`; if `x` is omitted, the midpoint is used. |

For field constraints, `length` takes precedence, followed by a `y` point, a
positive `sag`, and then a positive `force`. A field `x` must be strictly
inside its support span. A support's `counterweight` is interpreted as mass
and multiplied by gravity when it is used as the endpoint force.

#### Span catenaries and force propagation

For every adjacent pair of supports, `RopeLine` creates a `ChainFunction`.
Explicit field constraints initialize their span as follows:

- A prescribed span length uses `initForLength`.
- A prescribed point `(x, y)` or a sag-derived point uses `initForThreePoints`.
- A prescribed force at `x` uses `initForForce`, with the available line
  weight used to convert force to force per unit line weight.

An endpoint counterweight, when configured, instead seeds the first or last
span with `initForForce` at that endpoint. If no explicit constraint initializes
a span, valid seeded spans propagate their endpoint force into each adjacent,
unconfigured span. The procedure moves outward from each seed: calculate the
force at the shared support from the known catenary, fit the neighboring
span with `initForForce` at that support, then carry the resulting force from
the neighboring span's opposite support to the next span. This preserves the
model's scalar force level at each shared support while allowing each span's
own geometry and length to differ.

If an unconfigured span cannot be reached by force propagation, it receives a
minimum-force catenary at the lower of its two supports. Thus a complete
multi-span profile can be produced without explicit settings for every field,
but only explicitly configured constraints and a counterweight impose
additional boundary conditions. Every initialized span uses the chain solvers'
iteration and tolerance behavior. `RopeLine` treats a span as initialized when
its `ChainFunction` reports either a valid result or a hyperbolic-cosine
solution; in particular, documented linear or parabolic fallbacks may also be
used. The solver does not guarantee that every arbitrary set of constraints
has a physically meaningful solution.

#### Circular transitions at supports

After span curves have been computed, each internal support with a positive
radius is considered for a rounded rope transition. The two neighboring
catenaries generally meet at that support with different tangents. The solver
therefore searches for one contact point on each catenary and a circle center
such that the circle has the requested radius and is tangent to both curves.
It chooses whether the connecting arc passes above or below the support from
the neighboring gradients and the overall `x` direction.

The two unknown contact `x` coordinates are found with a two-dimensional
Newton iteration. Its residuals enforce that the two radius-offset tangent
constructions identify the same circle center; analytic derivatives form the
2×2 Jacobian. Convergence is tested against `distanceTolerance` and bounded
by `maxIterations`. A singular Jacobian or failure to converge prevents the
transition from being installed. On success, the catenary endpoints are
trimmed back to the tangent contact points and a circular arc of the
configured radius joins them. This rounds the rope path rather than leaving
an abrupt kink; the radius should respect the rope's permitted minimum bend
radius to avoid damaging it.

#### Arc-length parameterization and optional vehicle sag

Finally, the class assembles an ordered list of catenary spans and successful
support arcs. Each span contributes its analytic catenary length between its
trimmed contact points; each support arc contributes
`radius × absolute angular sweep`. The public `length` and `getLength()` value
is the resulting total distance. `transform(position, left, point)` converts
a position on that distance axis to `{x, y, phi}` on the appropriate catenary
or support arc. Optional numeric `position` values on support configuration
objects act as calibration anchors: an internal `Adjuster` maps those
configured positions to calculated arc-length stations and linearly
interpolates/extrapolates between them.

The separate `stressX` and `stressSag` settings support a simplified moving
vehicle/sag adjustment after the baseline curve is built. `adjust()` distributes
the specified sag across spans according to relative span-length and
mid-span-sag factors. `setVehiclePosition(position)` locates the vehicle on
the rope's distance coordinate; when transforming a point in that span, a
piecewise-linear sag profile through the vehicle location adjusts both height
and gradient. This affects the reported curve locally but does not rerun the
span-force or support-radius solvers.

| Method / field | Description |
| --- | --- |
| `adjust()` | Reapplies the coordinate transform and updates optional sag caused by a vehicle configured with `stressX` and `stressSag`. |
| `setVehiclePosition(position)` | Places/updates the stress vehicle at a distance along the rope. |
| `getLength()` | Returns the calculated rope length; also exposed as `length`. |
| `isIncreasingX()` | Returns whether spans progress in increasing `x`; may be `undefined` for an invalid/unconfigured rope. |
| `transform(position, left, point)` | Maps distance along the rope, including support wrap geometry, to `{x, y, phi}`. `left` is a signed lateral offset: positive is left and negative is right. An optional result object is reused. Open ends extrapolate along their tangent. |
| `stroke(context, transform, start, end, left)` | Draws the selected rope interval to a Canvas 2D context with optional signed lateral offset. |

## Discretization and maze generation

### `DiscretizationIterator`

`new DiscretizationIterator()` creates an empty iterator.

| Method | Description |
| --- | --- |
| `init(difference, start, end, forceMetricDiff)` | Configures values from `start` toward `end` by absolute `difference`. If `forceMetricDiff === true`, the step is rounded to a convenient 1/2/5×10ⁿ metric interval and endpoints are aligned to that grid. |
| `hasNext()` | Returns whether another value can be read. |
| `getNext()` | Returns the next value and advances the iterator. |

### `Maze`

`new Maze()` creates an empty grid. `width` and `height` are public.

| Method | Description |
| --- | --- |
| `prepare(width, height)` | Replaces the grid and carves a randomized maze from its center. Non-positive dimensions produce an empty grid. |
| `cell(x, y)` | Returns the cell at `(x, y)` or `undefined` when outside the prepared grid. |

Each cell has `{x, y, east, west, south, north, visited}`. Wall properties are
booleans: `true` means a wall remains, while `false` means the adjacent cell
can be reached.

## `WeightedGraph`

`WeightedGraph` finds shortest paths using Dijkstra's algorithm. Nodes are
identified by object identity; edges are undirected. Edge lengths should be
non-negative.

| Method | Description |
| --- | --- |
| `clear()` | Clears graph data and any computed path while retaining internal object pools. |
| `destroy()` | Clears graph data and releases its internal pools. |
| `setPathValidator(callback)` | Sets an optional callback `(fromNode, fromEdge, node, edge, toNode) => boolean` used to allow/deny traversal of each candidate edge. |
| `addEdge(edge, node1, node2, length)` | Adds a user edge between two distinct nodes. Returns `false` for missing endpoints, identical endpoints, or a negative length; otherwise `true`. |
| `addVirtualEdge(node1, node2, length)` | Adds an edge without a user edge object. A duplicate with the same endpoint order is rejected. Returns whether it was added. |
| `computePath(startNode, endNode)` | Calculates the shortest route. With `endNode`, stores that route if reachable; without it, visits all reachable nodes for later selection. |
| `addReachableNodes(array)` | Appends all reachable non-start node objects from the most recent computation to `array`. |
| `selectClosestNode()` / `selectFarestNode()` | Selects the reachable node with minimum / maximum distance from the computed start, then makes its route available through the path getters. Returns whether a node was selected. |
| `selectEndNode(node)` | Selects a reachable node and makes its route available through the path getters. Returns `false` when it is unknown or unreachable. |
| `getStartNode()` / `getEndNode()` | Returns the selected user node object, or `undefined`. |
| `isEndNodeReachable()` | Returns whether the selected end node was reached in the latest search. |
| `getDistance()` | Returns the selected end node's distance from the start, or `-1` if there is no selected end node. |
| `getEdgesCount()` / `getNodesCount()` | Returns the number of edges / nodes in the currently selected route. |
| `getEdge(index)` / `getNode(index)` | Returns the route's edge / node at a zero-based index, ordered from start to end, or `undefined` when out of range. Virtual edges have no user edge object and are omitted from the returned edge route. |

## Example: shortest path

```js
const graph = new Mathematics.WeightedGraph();
graph.addEdge({ id: 'ab' }, 'A', 'B', 2);
graph.addEdge({ id: 'bc' }, 'B', 'C', 3);
graph.addEdge({ id: 'ac' }, 'A', 'C', 8);
graph.computePath('A', 'C');

console.log(graph.getDistance()); // 5
console.log(graph.getNode(0));    // 'A'
console.log(graph.getNode(1));    // 'B'
console.log(graph.getNode(2));    // 'C'
```
