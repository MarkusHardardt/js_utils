(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const JsonFX = isNodeJS ? require('./JsonFX.js') : root.JsonFX;
    const PI = Math.PI;
    const TWO_PI = PI + PI;
    const HALF_PI = PI * 0.5;
    const THREE_HALF_PI = PI + HALF_PI;
    const QUARTER_PI = PI * 0.25;
    const RAD2DEG = 180.0 / PI;
    const DEG2RAD = PI / 180.0;
    const MINIMUM_FLAT_ANGLE = DEG2RAD;
    const MAXIMUM_SHARP_ANGLE = PI - DEG2RAD;
    const THIRD = 1.0 / 3.0;
    const MIN_LENGTH2 = 0.000001;
    const MIN_DENOMINATOR = 0.000000001;
    const EPSILON = 0.000000001;
    const MIN_STROKE_LENGTH = 0.001;

    // [kg/m^3]
    const SPECIFIC_GRAVITY_OF_STEEL = 7860.0;
    // [m/s^2]
    const EARTH_GRAVITATION = 9.80665;

    // this is the solution of the equation 1/x+1=x
    // [or more classic: a/(a+b) = b/a]
    const GOLDEN_CUT = (1.0 + Math.sqrt(5.0)) * 0.5;
    const GOLDEN_CUT_INVERTED = 1.0 / GOLDEN_CUT;
    const DEFAULT_STRESS_S1 = 0.3;
    const DEFAULT_STRESS_S2 = 0.9;

    const sinh = Math.sinh || function (value) {
        const exp = Math.exp(value);
        return (exp - 1.0 / exp) * 0.5;
    };

    const cosh = Math.cosh || function (value) {
        const exp = Math.exp(value);
        return (exp + 1.0 / exp) * 0.5;
    };

    const asinh = Math.asinh || function (value) {
        return Math.log(value + Math.sqrt(value * value + 1));
    };

    const acosh = Math.acosh || function (value) {
        return Math.log(value + Math.sqrt(value * value - 1));
    };

    /*
     * TODO Maybe we want to add the pendulum simulation. Here we got some complex
     * java code: /JptApp/src/stuff/jkw/AerialTramCabin.java
     * /JptApp/src/stuff/mathematics/DifferentialQuotientFirstOrder.java
     * /JptApp/src/stuff/mathematics/DifferentialQuotientSecondOrder.java
     * /JptApp/src/stuff/mathematics/Pendulum.java
     * /JptApp/src/stuff/mathematics/AbstractRecursiveOrdinaryDifferentialEquation.java
     * 
     * This next method is the first start
     * /JptApp/src/org/har/jpt/util/Mathematics/MathExt.java
     */
    function createBiomialCoefficients(maxN) {
        // if too much
        if (maxN < 0 || maxN >= 68) {
            // notify
            throw new Error(`Invalid value: ${maxN}`);
        }
        // create a new matrix for the values
        const bicos = [];

        // for all rows
        for (let i = 0; i <= maxN; i++) {
            // create a new array
            bicos[i] = [];
            // long[i + 1];
        }
        // set the first value
        bicos[0][0] = 1;

        // for all rows
        for (let i = 1; i <= maxN; i++) {
            // set first and last value
            bicos[i][0] = 1;
            bicos[i][i] = 1;

            // for all row elements
            for (let j = 1; j < maxN; j++) {
                // set to the sum
                bicos[i][j] = bicos[i - 1][j - 1] + bicos[i - 1][j];
            }
        }
        // return the coefficients
        return bicos;
    }

    function getSmoothNormalizedTransfer(value, position1, position2) {
        // get the parameters first
        const s = typeof value === 'number' ? Math.abs(value) : 0.0;
        const p1 = typeof position1 === 'number' ? position1 : 0.0;
        const p2 = typeof position2 === 'number' ? position2 : 1.0;
        const s1 = Math.max(Math.min(Math.min(p1, p2), 1.0), 0.0);
        const s2 = Math.max(Math.min(Math.max(p1, p2), 1.0), 0.0);
        // then decide what to return
        if (s1 === 0.0) {
            if (s2 === 0.0) {
                // #6
                if (s < 1.0) {
                    const ds = (s - 1.0);
                    return ds * ds;
                } else {
                    return 0.0;
                }
            } else if (s2 < 1.0) {
                // #3
                const d = 1.0 / ((-s2 - 1.0) * (s2 - 1.0));
                if (s <= s2) {
                    return 2.0 * d * (s2 - 1.0) * s + 1.0;
                } else if (s < 1.0) {
                    const ds = (s - 1.0);
                    return d * ds * ds;
                } else {
                    return 0.0;
                }
            } else {
                // #5
                if (s < 1.0) {
                    return 1.0 - s;
                } else {
                    return 0.0;
                }
            }
        } else if (s1 < 1.0) {
            if (s1 === s2) {
                // #4
                if (s <= s1) {
                    return 1.0 - s * s / s1;
                } else if (s < 1.0) {
                    const ds = s - 1.0;
                    return ds * ds / (1.0 - s1);
                } else {
                    return 0.0;
                }
            } else if (s2 < 1.0) {
                // #1
                const d = 1.0 / ((s1 - s2 - 1.0) * (s2 - 1.0));
                const a = d * (1.0 - s2) / s1;
                if (s < s1) {
                    return 1.0 - a * s * s;
                } else if (s <= s2) {
                    return 2.0 * d * (s2 - 1.0) * s + a * s1 * s1 + 1.0;
                } else if (s < 1.0) {
                    const ds = (s - 1.0);
                    return d * ds * ds;
                } else {
                    return 0.0;
                }
            } else {
                // #2
                if (s <= s1) {
                    return 1.0 - s * s / (s1 * (2.0 - s1));
                } else if (s < 1.0) {
                    const ds = s - 1.0;
                    return -2.0 * ds / (2.0 - s1);
                } else {
                    return 0.0;
                }
            }
        } else {
            // #7
            if (s < 1.0) {
                return 1.0 - s * s;
            } else {
                return 0.0;
            }
        }
    }

    function normalizeToPlusMinusPI(phi) {
        let p = phi;
        while (p > PI) {
            p -= TWO_PI;
        }
        while (p <= -PI) {
            p += TWO_PI;
        }
        return p;
    }

    function normalizeToPlusMinus180deg(angle) {
        let a = angle;
        while (a > 180) {
            a -= 360;
        }
        while (a <= -180) {
            a += 360;
        }
        return a;
    }

    function copyTransform(target, source) {
        target.d00 = source.d00;
        target.d01 = source.d01;
        target.x = source.x;
        target.d10 = source.d10;
        target.d11 = source.d11;
        target.y = source.y;
        target.i00 = source.i00;
        target.i01 = source.i01;
        target.i02 = source.i02;
        target.i10 = source.i10;
        target.i11 = source.i11;
        target.i12 = source.i12;
        target.scale = source.scale;
        target.rotation = source.rotation;
        target.mirrorX = source.mirrorX;
        target.mirrorY = source.mirrorY;
    }

    class Transform {
        constructor() {
            // the transformation params
            // scale x
            this.d00 = 1.0;
            // shear x
            this.d01 = 0.0;
            // translate x
            this.x = 0.0;
            // shear y
            this.d10 = 0.0;
            // scale y
            this.d11 = 1.0;
            // translate y
            this.y = 0.0;
            // inverse transform
            this.i00 = 1.0;
            this.i10 = 0.0;
            this.i01 = 0.0;
            this.i11 = 1.0;
            this.i02 = 0.0;
            this.i12 = 0.0;
            this.scale = 1.0;
            this.rotation = 0.0;
            this.mirrorX = false;
            this.mirrorY = false;
        }
        setToIdentity() {
            this.d00 = 1.0;
            this.d10 = 0.0;
            this.d01 = 0.0;
            this.d11 = 1.0;
            this.x = 0.0;
            this.y = 0.0;
            this.i00 = 1.0;
            this.i10 = 0.0;
            this.i01 = 0.0;
            this.i11 = 1.0;
            this.i02 = 0.0;
            this.i12 = 0.0;
            this.scale = 1.0;
            this.rotation = 0.0;
            this.mirrorX = false;
            this.mirrorY = false;
            return this;
        }
        init(transform) {
            // could use this but to reduce function calls we perform directly ...
            // fn_copy_transform(this, i_transform);
            this.d00 = transform.d00;
            this.d01 = transform.d01;
            this.x = transform.x;
            this.d10 = transform.d10;
            this.d11 = transform.d11;
            this.y = transform.y;
            this.i00 = transform.i00;
            this.i01 = transform.i01;
            this.i02 = transform.i02;
            this.i10 = transform.i10;
            this.i11 = transform.i11;
            this.i12 = transform.i12;
            this.scale = transform.scale;
            this.rotation = transform.rotation;
            this.mirrorX = transform.mirrorX;
            this.mirrorY = transform.mirrorY;
            return this;
        }
        setScale(scale) {
            this.d00 *= scale;
            this.d01 *= scale;
            this.d10 *= scale;
            this.d11 *= scale;
            this.scale *= scale;
            // compute inverse
            this.i00 /= scale;
            this.i01 /= scale;
            this.i02 /= scale;
            this.i10 /= scale;
            this.i11 /= scale;
            this.i12 /= scale;
            return this;
        }
        translate(translateX, translateY) {
            // add the rotated and scaled translation vector
            this.x += this.d00 * translateX + this.d01 * translateY;
            this.y += this.d10 * translateX + this.d11 * translateY;
            // handle inverse
            this.i02 -= translateX;
            this.i12 -= translateY;
            return this;
        }
        rotate(phi, mirrorX, mirrorY) {
            const nmx = mirrorX === true;
            const nmy = mirrorY === true;
            const mx = this.mirrorX;
            const my = this.mirrorY;
            this.mirrorX = mx !== nmx;
            this.mirrorY = my !== nmy;
            const d00 = this.d00;
            const d01 = this.d01;
            const d10 = this.d10;
            const d11 = this.d11;
            let m00, m01, m10, m11;
            if (phi !== 0.0) {
                const sin = Math.sin(phi);
                const cos = Math.cos(phi);
                this.rotation += mx === my ? phi : -phi;
                m00 = nmx ? -(cos * d00 + sin * d01) : cos * d00 + sin * d01;
                m01 = nmy ? -(-sin * d00 + cos * d01) : -sin * d00 + cos * d01;
                m10 = nmx ? -(cos * d10 + sin * d11) : cos * d10 + sin * d11;
                m11 = nmy ? -(-sin * d10 + cos * d11) : -sin * d10 + cos * d11;
            } else {
                m00 = nmx ? -d00 : d00;
                m01 = nmy ? -d01 : d01;
                m10 = nmx ? -d10 : d10;
                m11 = nmy ? -d11 : d11;
            }
            this.d00 = m00;
            this.d01 = m01;
            this.d10 = m10;
            this.d11 = m11;
            // compute the inversion (taken from AffineTransform.java)
            const det = m00 * m11 - m01 * m10;
            this.i00 = m11 / det;
            this.i10 = -m10 / det;
            this.i01 = -m01 / det;
            this.i11 = m00 / det;
            const m02 = this.x;
            const m12 = this.y;
            this.i02 = (m01 * m12 - m11 * m02) / det;
            this.i12 = (m10 * m02 - m00 * m12) / det;
            return this;
        }
        concatenate(transform) {
            // does: [this] = [this] x [Tx]
            const d00 = this.d00;
            const d01 = this.d01;
            const d10 = this.d10;
            const d11 = this.d11;
            const t00 = transform.d00;
            const t01 = transform.d01;
            const t02 = transform.x;
            const t10 = transform.d10;
            const t11 = transform.d11;
            const t12 = transform.y;

            this.d00 = d00 * t00 + d01 * t10;
            this.d01 = d00 * t01 + d01 * t11;
            this.x += d00 * t02 + d01 * t12;

            this.d10 = d10 * t00 + d11 * t10;
            this.d11 = d10 * t01 + d11 * t11;
            this.y += d10 * t02 + d11 * t12;

            this.scale *= transform.scale;

            const nmx = transform.mirrorX;
            const nmy = transform.mirrorY;
            const mx = this.mirrorX;
            const my = this.mirrorY;
            // adjust the rotation depending on our current mirroring situation ...
            this.rotation += mx === my ? transform.rotation : -transform.rotation;
            // ... and update the mirroring flags afterwards (!!!)
            this.mirrorX = mx !== nmx;
            this.mirrorY = my !== nmy;

            // compute the inverted parameters
            const i00 = this.i00;
            const i01 = this.i01;
            const i02 = this.i02;
            const i10 = this.i10;
            const i11 = this.i11;
            const i12 = this.i12;
            const j00 = transform.i00;
            const j01 = transform.i01;
            const j02 = transform.i02;
            const j10 = transform.i10;
            const j11 = transform.i11;
            const j12 = transform.i12;

            this.i00 = i00 * j00 + i10 * j01;
            this.i01 = i01 * j00 + i11 * j01;
            this.i02 = i02 * j00 + i12 * j01 + j02;

            this.i10 = i00 * j10 + i10 * j11;
            this.i11 = i01 * j10 + i11 * j11;
            this.i12 = i02 * j10 + i12 * j11 + j12;

            return this;
        }
        preConcatenate(transform) {
            // does: [this] = [Tx] x [this]
            const d00 = this.d00;
            const d01 = this.d01;
            const x = this.x;
            const d10 = this.d10;
            const d11 = this.d11;
            const y = this.y;
            const t00 = transform.d00;
            const t01 = transform.d01;
            const t02 = transform.x;
            const t10 = transform.d10;
            const t11 = transform.d11;
            const t12 = transform.y;

            this.d00 = d00 * t00 + d10 * t01;
            this.d01 = d01 * t00 + d11 * t01;
            this.x = x * t00 + y * t01 + t02;

            this.d10 = d00 * t10 + d10 * t11;
            this.d11 = d01 * t10 + d11 * t11;
            this.y = x * t10 + y * t11 + t12;

            this.scale *= transform.scale;
            const nmx = transform.mirrorX;
            const nmy = transform.mirrorY;
            // adjust the rotation depending on the transforms mirroring situation ...
            this.rotation += nmx === nmy ? transform.rotation : -transform.rotation;
            // ... and update the mirroring flags afterwards (!!!)
            this.mirrorX = this.mirrorX !== nmx;
            this.mirrorY = this.mirrorY !== nmy;

            // compute the inverted parameters
            const i00 = this.i00;
            const i01 = this.i01;
            const i10 = this.i10;
            const i11 = this.i11;
            const j00 = transform.i00;
            const j01 = transform.i01;
            const j02 = transform.i02;
            const j10 = transform.i10;
            const j11 = transform.i11;
            const j12 = transform.i12;

            this.i00 = i00 * j00 + i01 * j10;
            this.i01 = i00 * j01 + i01 * j11;
            this.i02 += i00 * j02 + i01 * j12;

            this.i10 = i10 * j00 + i11 * j10;
            this.i11 = i10 * j01 + i11 * j11;
            this.i12 += i10 * j02 + i11 * j12;

            return this;
        }
        invert() {
            // we already know the inverted transforms so just swap the parameters
            let swap = this.i00;
            this.i00 = this.d00;
            this.d00 = swap;
            swap = this.i10;
            this.i10 = this.d10;
            this.d10 = swap;
            swap = this.i01;
            this.i01 = this.d01;
            this.d01 = swap;
            swap = this.i11;
            this.i11 = this.d11;
            this.d11 = swap;
            swap = this.i02;
            this.i02 = this.x;
            this.x = swap;
            swap = this.i12;
            this.i12 = this.y;
            this.y = swap;
            this.scale = 1.0 / this.scale;
            this.rotation = -this.rotation;
            /*  this is the inversion calculation (taken from AffineTransform.java)
                const d00 = this.d00;
                const d01 = this.d01;
                const x = this.x;
                const d10 = this.d10;
                const d11 = this.d11;
                const y = this.y;
                const det = d00 * d11 - d01 * d10;
                this.d00 = d11 / det;
                this.d10 = -d10 / det;
                this.d01 = -d01 / det;
                this.d11 = d00 / det;
                this.x = (d01 * y - d11 * x) / det;
                this.y = (d10 * x - d00 * y) / det;
            */
        }
        initForPoints(metricX1, metricY1, metricX2, metricY2, pixelX1, pixelY1, pixelX2, pixelY2) {
            // store for performance reasons
            const mx = this.mirrorX === true;
            const my = this.mirrorY === true;
            // get the deltas
            const dx = metricX2 - metricX1;
            const dy = metricY2 - metricY1;
            const du = pixelX2 - pixelX1;
            const dv = pixelY2 - pixelY1;
            // compute the cross products
            const dxdu = dx * du;
            const dxdv = dx * dv;
            const dydu = dy * du;
            const dydv = dy * dv;
            // compute the numerators
            const m1num = (mx ? -dxdu : dxdu) + (my ? -dydv : dydv);
            const m2num = (mx ? -dxdv : dxdv) + (my ? dydu : -dydu);
            // compute image to metric transform
            const du2dv2 = du * du + dv * dv;
            const m1 = m1num / du2dv2;
            const m2 = m2num / du2dv2;
            // initialize transform
            this.i00 = mx ? -m1 : m1;
            this.i10 = my ? m2 : -m2;
            this.i01 = mx ? -m2 : m2;
            this.i11 = my ? -m1 : m1;
            this.i02 = metricX1 - this.i00 * pixelX1 - this.i01 * pixelY1;
            this.i12 = metricY1 - this.i10 * pixelX1 - this.i11 * pixelY1;
            // compute metric to image transform
            const mdiv = (dx * dx + dy * dy);
            m1 = m1num / mdiv;
            m2 = m2num / mdiv;
            // initialize transform
            this.d00 = mx ? -m1 : m1;
            this.d10 = mx ? -m2 : m2;
            this.d01 = my ? m2 : -m2;
            this.d11 = my ? -m1 : m1;
            this.x = pixelX1 - this.d00 * metricX1 - this.d01 * metricY1;
            this.y = pixelY1 - this.d10 * metricX1 - this.d11 * metricY1;
            this.rotation = normalizeToPlusMinusPI(Math.atan2(m2num, m1num));
            this.scale = Math.sqrt(du2dv2 / mdiv);
            return this;
        }
        initForPoint(metricX, metricY, pixelX, pixelY) {
            // initialize transforms
            this.x = pixelX - this.d00 * metricX - this.d01 * metricY;
            this.y = pixelY - this.d10 * metricX - this.d11 * metricY;
            this.i02 = metricX - this.i00 * pixelX - this.i01 * pixelY;
            this.i12 = metricY - this.i10 * pixelX - this.i11 * pixelY;
            return this;
        }
        initForBounds(metric, pixelWidth, pixelHeight, mirrorX, mirrorY) {
            // get the source rectangle bounds
            let x = metric ? metric.x : 0.0;
            let y = metric ? metric.y : 0.0;
            let w = metric ? metric.width : 1.0;
            let h = metric ? metric.height : 1.0;
            if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
                const x1 = metric.x1;
                const x2 = metric.x2;
                const y1 = metric.y1;
                const y2 = metric.y2;
                if (typeof x1 !== 'number' || typeof y1 !== 'number' || typeof x2 !== 'number' || typeof y2 !== 'number') {
                    // nothing more to do
                    this.setToIdentity();
                    return false;
                }
                x = Math.min(x1, x2);
                y = Math.min(y1, y2);
                w = Math.abs(x2 - x1);
                h = Math.abs(y2 - y1);
            }
            if (w <= 0.0 || h <= 0.0) {
                // nothing more to do
                this.setToIdentity();
                return false;
            }
            // store for performance reasons
            const mx = mirrorX === true;
            const my = mirrorY === true;
            // depending on the aspect ratio of source and target rectangle the
            // transformed rectangle must fit vertically and horizontally - so we need
            // the lower scale factor of both
            const pxw = pixelWidth / w;
            const pxh = pixelHeight / h;
            const ds = Math.min(pxw, pxh);
            const is = 1.0 / ds;
            // this centers the target rectangle
            const tx = mx ? (pixelWidth + ds * w) * 0.5 : (pixelWidth - ds * w) * 0.5;
            const ty = my ? (pixelHeight + ds * h) * 0.5 : (pixelHeight - ds * h) * 0.5;

            // the actual scale (y-scale is negative because of the vertical flip of
            // the y-axis: in metric systems the y-axis goes up, in images it goes
            // down! The x.axis always goes from left to right. His involves rotations
            // because positive angles in one system will be negative in the other!)
            const d00 = mx ? -ds : ds;
            const d11 = my ? -ds : ds;
            const i00 = mx ? -is : is;
            const i11 = my ? -is : is;
            // set the parameters
            this.d00 = d00;
            this.d01 = 0.0;
            this.x = tx - d00 * x;
            this.d10 = 0.0;
            this.d11 = d11;
            this.y = ty - d11 * y;
            this.scale = ds;
            this.rotation = 0.0;
            this.i01 = 0.0;
            this.i10 = 0.0;
            this.i02 = x - i00 * tx;
            this.i12 = y - i11 * ty;
            this.i00 = i00;
            this.i11 = i11;
            this.mirrorX = mx;
            this.mirrorY = my;
            // success
            return true;
        }
        /**
         * Transform coordinate system
         *
         * This function transforms the coordinate system with the following
         * mechanism: 1. The system will be translated (moved) to the new position
         * defined by i_translateX and i_translateY. 2. The moved system will be
         * scaled with the scale factor i_scale. 3. The moved and scaled system will
         * be rotated around the new origin with the angle i_phi. 4. The mirror x
         * and y states will be updated.
         */
        applyCoordinateTransformation(translateX, translateY, scale, phi, mirrorX, mirrorY) {
            this.translate(translateX, translateY).setScale(scale).rotate(phi, mirrorX, mirrorY);
        }
        /**
         * Transform coordinate system (fast version)
         *
         * This function initializes our transform with the given parent transform
         * and then applies the given transform parameters.
         *
         * @param (i_params):
         *          coordinate transformation parameters containing optional
         *          translation x and y, scale, rotation angle phi [deg] or angle
         *          [rad] and mirroring in x / y direction (mirrorX/mirrorY).
         *
         * @param (i_parent):
         *          Optional parent transformation
         */
        setToCoordinateTransform(params, parent) {
            // this method does the exact same operations like the following:
            //
            // this.init(i_parent); [1]
            // this.translate(i_params.x, i_params.y); [2]
            // this.setScale(i_params.scale); [3]
            // this.rotate(i_params.phi, i_params.mirrorX, i_params.mirrorY); [4]
            //
            // but it's much faster than calling all these methods separated
            // first copy the parents transformation attributes if available or our
            // own
            // if not [1]
            let d00, d01, x, d10, d11, y, sca, rot, mx, my;
            if (parent) {
                d00 = parent.d00;
                d01 = parent.d01;
                x = parent.x;
                d10 = parent.d10;
                d11 = parent.d11;
                y = parent.y;
                sca = parent.scale;
                rot = parent.rotation;
                mx = parent.mirrorX;
                my = parent.mirrorY;
            } else if (params) {
                d00 = this.d00;
                d01 = this.d01;
                x = this.x;
                d10 = this.d10;
                d11 = this.d11;
                y = this.y;
                sca = this.scale;
                rot = this.rotation;
                mx = this.mirrorX;
                my = this.mirrorY;
            }
            // if parameters available
            if (params) {
                // now we translate - but only if required [2]
                const tx = params.x;
                const ty = params.y;
                if (tx !== 0.0 && typeof tx === 'number') {
                    if (ty !== 0.0 && typeof ty === 'number') {
                        // add the rotated and scaled translation vector
                        x += d00 * tx + d01 * ty;
                        y += d10 * tx + d11 * ty;
                    } else {
                        // add the rotated and scaled translation vector
                        x += d00 * tx;
                        y += d10 * tx;
                    }
                } else if (ty !== 0.0 && typeof ty === 'number') {
                    // add the rotated and scaled translation vector
                    x += d01 * ty;
                    y += d11 * ty;
                }
                // next we scale - but only if required and valid [3]
                const sc = params.scale;
                if (sc !== 1.0 && typeof sc === 'number' && sc > 0.0) {
                    d00 *= sc;
                    d01 *= sc;
                    d10 *= sc;
                    d11 *= sc;
                    sca *= sc;
                }
                this.scale = sca;
                // finally we apply the new mirroring and rotate - but only if required
                // [4]
                const pmx = params.mirrorX === true;
                const pmy = params.mirrorY === true;
                this.mirrorX = mx !== pmx;
                this.mirrorY = my !== pmy;
                // try to get rotation angle
                let phi = params.phi;
                if (typeof phi !== 'number') {
                    const a = params.angle;
                    if (typeof a === 'number') {
                        phi = a !== 0.0 ? a * DEG2RAD : undefined;
                    }
                }
                // if we must be upright we adjust angle with current rotation
                if (params.upright === true) {
                    if (phi !== undefined) {
                        phi += mx === my ? -rot : rot;
                    } else {
                        phi = mx === my ? -rot : rot;
                    }
                }
                let m00, m01, m10, m11;
                if (phi !== undefined && phi !== 0.0) {
                    const sin = Math.sin(phi);
                    const cos = Math.cos(phi);
                    // adjust the rotation depending on our current mirroring situation
                    // ...
                    rot += mx === my ? phi : -phi;
                    if (rot > PI) {
                        rot -= TWO_PI;
                    }
                    if (rot <= -PI) {
                        rot += TWO_PI;
                    }
                    m00 = pmx ? -(cos * d00 + sin * d01) : cos * d00 + sin * d01;
                    m01 = pmy ? -(-sin * d00 + cos * d01) : -sin * d00 + cos * d01;
                    m10 = pmx ? -(cos * d10 + sin * d11) : cos * d10 + sin * d11;
                    m11 = pmy ? -(-sin * d10 + cos * d11) : -sin * d10 + cos * d11;
                } else {
                    m00 = pmx ? -d00 : d00;
                    m01 = pmy ? -d01 : d01;
                    m10 = pmx ? -d10 : d10;
                    m11 = pmy ? -d11 : d11;
                }
                this.rotation = rot;
                this.d00 = m00;
                this.d01 = m01;
                this.x = x;
                this.d10 = m10;
                this.d11 = m11;
                this.y = y;
                // compute the inversion (taken from AffineTransform.java)
                const det = m00 * m11 - m01 * m10;
                this.i00 = m11 / det;
                this.i10 = -m10 / det;
                this.i01 = -m01 / det;
                this.i11 = m00 / det;
                this.i02 = (m01 * y - m11 * x) / det;
                this.i12 = (m10 * x - m00 * y) / det;
            } else if (parent) { // no parameters but at least a parent transform
                this.mirrorX = mx;
                this.mirrorY = my;
                this.d00 = d00;
                this.d01 = d01;
                this.x = x;
                this.d10 = d10;
                this.d11 = d11;
                this.y = y;
                this.scale = sca;
                this.rotation = rot;
                this.i00 = parent.i00;
                this.i01 = parent.i01;
                this.i02 = parent.i02;
                this.i10 = parent.i10;
                this.i11 = parent.i11;
                this.i12 = parent.i12;
            }
        }
        transform(x, y, point) {
            const p = point || {};
            p.x = this.d00 * x + this.d01 * y + this.x;
            p.y = this.d10 * x + this.d11 * y + this.y;
            return p;
        }
        transformInverse(x, y, point) {
            const p = point || {};
            p.x = this.i00 * x + this.i01 * y + this.i02;
            p.y = this.i10 * x + this.i11 * y + this.i12;
            return p;
        }
        save() {
            let stack = this._stack;
            if (!stack) {
                stack = [];
                this._stack = stack;
            }
            const tf = {};
            copyTransform(tf, this);
            stack.push(tf);
        }
        restore() {
            const stack = this._stack;
            const tf = stack ? stack.pop() : undefined;
            if (tf) {
                copyTransform(this, tf);
            } else {
                this.setToIdentity();
            }
        }
    }

    /**
     * This mechanism maps positions given by an absolute value onto a track
     * departed in zones of different length.
     * 
     * @param {Object}
     *          i_curveSection The curve section
     * @param {Object}
     *          i_maxPosition The maximum position
     */
    class Adjuster {
        #cfg;
        #id;
        #s;
        #t;
        constructor() {
            this.#cfg = [];
            this.reset();
        }
        reset(source, target, id) {
            this.#cfg.splice(0, this.#cfg.length);
            this.incrementSource = undefined;
            this.incrementTarget = undefined;
            this.#id = id;
            this.#s = typeof source === 'number' ? source : 0.0;
            this.#t = typeof target === 'number' ? target : 0.0;
            this.valid = false;
        }
        add(source, target, id) {
            const s = this.#s;
            const ds = source - s;
            const cis = ds > 0.0 ? true : (ds < 0.0 ? false : undefined);
            const pis = this.incrementSource;
            if (cis === undefined || (pis !== undefined && pis !== cis)) {
                return false;
            }
            const t = this.#t;
            const dt = target - t;
            const cit = dt > 0.0 ? true : (dt < 0.0 ? false : undefined);
            const pit = this.incrementTarget;
            if (cit === undefined || (pit !== undefined && pit !== cit)) {
                return false;
            }
            this.#cfg.push({
                id,
                s1: s,
                s2: source,
                ds,
                t1: t,
                t2: target,
                dt,
            });
            this.#s = source;
            this.incrementSource = cis;
            this.#t = target;
            this.incrementTarget = cit;
            this.valid = true;
            return true;
        }
        adjust(source) {
            const config = this.#cfg;
            if (config.length > 0) {
                const is = this.incrementSource;
                const c1 = config[0];
                const c2 = config[config.length - 1];
                const s1 = c1.s1;
                const s2 = c2.s2;
                const ds = s2 - s1;
                const t1 = c1.t1;
                const t2 = c2.t2;
                const dt = t2 - t1;
                if (is ? source <= s1 : source >= s1) {
                    return t1 + (source - s1) / ds * dt;
                } else if (is ? source >= s2 : source <= s2) {
                    return t2 + (source - s2) / ds * dt;
                } else {
                    for (const c of config) {
                        if (is ? source <= c.s2 : source >= c.s2) {
                            return c.t1 + (source - c.s1) / c.ds * c.dt;
                        }
                    }
                }
            }
            return false;
        }
        adjustInverse(target) {
            const config = this.#cfg;
            if (config.length > 0) {
                const it = this.incrementTarget;
                const c1 = config[0];
                const c2 = config[config.length - 1];
                const s1 = c1.s1;
                const s2 = c2.s2;
                const ds = s2 - s1;
                const t1 = c1.t1;
                const t2 = c2.t2;
                const dt = t2 - t1;
                if (it ? target <= t1 : target >= t1) {
                    return s1 + (target - t1) / dt * ds;
                } else if (it ? target >= t2 : target <= t2) {
                    return s2 + (target - t2) / dt * ds;
                } else {
                    for (const c of config) {
                        if (it ? target <= c.t2 : target >= c.t2) {
                            return c.s1 + (target - c.t1) / c.dt * c.ds;
                        }
                    }
                }
            }
            return false;
        }
        format() {
            const config = this.#cfg;
            if (config.length > 0) {
                let id1 = this.#id;
                let txt = 'adjustment:';
                for (let i = 0; i < config.length; i++) {
                    txt += '\n';
                    const cfg = config[i];
                    txt += '[';
                    txt += i;
                    txt += '] = ';
                    txt += (cfg.dt / cfg.ds).toString();
                    const id2 = cfg.id;
                    txt += ' (from "';
                    txt += id1;
                    txt += '" to "';
                    txt += id2;
                    txt += '")';
                    id1 = id2;
                }
                return txt;
            } else {
                return false;
            }
        }
    }

    function getHarmonicRGB(value, min, max) {
        const mi = typeof min === 'number' ? Math.max(min, 0) : 0;
        const ma = typeof max === 'number' ? Math.min(max, 256) : 256;
        const diff = (ma - mi) * 0.5;
        const val = normalizeToPlusMinusPI(value * TWO_PI);
        const r = Math.floor(mi + (Math.cos(val) + 1) * diff);
        const g = Math.floor(mi + (Math.cos(val + TWO_PI / 3) + 1) * diff);
        const b = Math.floor(mi + (Math.cos(val - TWO_PI / 3) + 1) * diff);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    /**
     * This function computes an arc defined with 2 tangents and a radius. -
     * tangent 1: from point {x1,y1} to {x2,y2} - tangent 2: from point {x2,y2} to
     * {x3,y3} The return value will be an object (if the computation was
     * successful - other wise false) with the following attributes: - left:
     * boolean will be true if the arc turns anticlockwise - right: boolean will
     * be true if the arc turns clockwise - centerX: x-coordinate of the center -
     * centerY: y-coordinate of the center - radius: the given radius - startX:
     * x-coordinate where the arc starts - startY: y-coordinate where the arc
     * starts - endX: x-coordinate where the arc ends - endY: y-coordinate where
     * the arc ends - startPhi: angle between first tangent in mathematical
     * orientation (angle between tangent vector and x-axis anticlockwise) -
     * endPhi: angle between second tangent in mathematical orientation (angle
     * between tangent vector and x-axis anticlockwise)
     */
    function getArc(x1, y1, x2, y2, x3, y3, radius) {
        // compute the vectors
        const v12x = x2 - x1;
        const v12y = y2 - y1;
        const v12len2 = v12x * v12x + v12y * v12y;
        const v23x = x3 - x2;
        const v23y = y3 - y2;
        const v23len2 = v23x * v23x + v23y * v23y;
        // if too short
        if (v12len2 < MIN_LENGTH2 || v12len2 < MIN_LENGTH2) {
            return false;
        }
        // compute angle between vectors and normalize
        const v12phi = Math.atan2(v12y, v12x);
        let v23phi = Math.atan2(v23y, v23x);
        const phi123 = normalizeToPlusMinusPI(v23phi - v12phi);
        // we adjust the second angle to prevent angle jumps the other way around
        v23phi = v12phi + phi123;
        // if angle is too flat or too sharp
        if ((phi123 < MINIMUM_FLAT_ANGLE && phi123 > -MINIMUM_FLAT_ANGLE) || (phi123 > MAXIMUM_SHARP_ANGLE && phi123 < -MAXIMUM_SHARP_ANGLE)) {
            return false;
        }
        // check if we turn left or right
        const left = phi123 > 0.0;
        // the center of our arc lies on the cutting position of the two parallel
        // lines
        // with the distance "radius" from our original lines. So in the next block
        // we compute help points on these lines.
        const v12len = Math.sqrt(v12len2);
        const unitVector12x = v12x / v12len;
        const unitVector12y = v12y / v12len;
        const offset12x = left ? -radius * unitVector12y : radius * unitVector12y;
        const offset12y = left ? radius * unitVector12x : -radius * unitVector12x;
        const line12x1 = x1 + offset12x;
        const line12y1 = y1 + offset12y;
        const line12x2 = x2 + offset12x;
        const line12y2 = y2 + offset12y;
        const v23lenInv = 1.0 / Math.sqrt(v23len2);
        const unitVector23x = v23x * v23lenInv;
        const unitVector23y = v23y * v23lenInv;
        const offset23x = left ? -radius * unitVector23y : radius * unitVector23y;
        const offset23y = left ? radius * unitVector23x : -radius * unitVector23x;
        const line23x2 = x2 + offset23x;
        const line23y2 = y2 + offset23y;
        const line23x3 = x3 + offset23x;
        const line23y3 = y3 + offset23y;
        // compute the result and return
        let denominator = -line12x1 * line23y2 + line12x2 * line23y2 + line12x1 * line23y3 - line12x2 * line23y3;
        denominator += line23x2 * line12y1 - line23x3 * line12y1 - line23x2 * line12y2 + line23x3 * line12y2;
        // if invalid
        if (denominator < MIN_DENOMINATOR && denominator > -MIN_DENOMINATOR) {
            return false;
        }
        let numerator = -line23x3 * line12x1 * line23y2 + line23x3 * line12x2 * line23y2 + line23x2 * line12x1 * line23y3 - line23x2 * line12x2 * line23y3;
        numerator += line23x2 * line12x2 * line12y1 - line23x3 * line12x2 * line12y1 - line23x2 * line12x1 * line12y2 + line23x3 * line12x1 * line12y2;
        const centerX = numerator / denominator;
        let centerY = undefined;
        if (line23x3 !== line23x2) {
            centerY = (line23y3 - line23y2) / (line23x3 - line23x2) * (centerX - line23x2) + line23y2;
        } else if (line12x2 !== line12x1) {
            centerY = (line12y2 - line12y1) / (line12x2 - line12x1) * (centerX - line12x1) + line12y1;
        } else {
            return false;
        }
        return {
            left,
            right: left === false,
            centerX,
            centerY,
            radius,
            startX: centerX - offset12x,
            startY: centerY - offset12y,
            startPhi: v12phi,
            endX: centerX - offset23x,
            endY: centerY - offset23y,
            endPhi: v23phi
        };
    }

    function prepareArc(context, contextTransform, point, part, start, end, left, curveTransform) {
        const arc = part.arc;
        const sphi = arc.startPhi;
        const dphi = arc.endPhi - sphi;
        const s1 = part.s1;
        const slen = part.length;
        const ophi = arc.left ? -HALF_PI : HALF_PI;
        let phi1 = sphi + (start - s1) / slen * dphi + ophi;
        let phi2 = sphi + (end - s1) / slen * dphi + ophi;
        // handler mirroring
        const mx = contextTransform.mirrorX !== curveTransform.mirrorX;
        if (mx) {
            phi1 = PI - phi1;
            phi2 = PI - phi2;
        }
        const my = contextTransform.mirrorY !== curveTransform.mirrorY;
        if (my) {
            phi1 = -phi1;
            phi2 = -phi2;
        }
        // get center point
        curveTransform.transform(arc.centerX, arc.centerY, point);
        contextTransform.transform(point.x, point.y, point);
        const tfrot = contextTransform.rotation - curveTransform.rotation;
        let radius = arc.radius;
        if (typeof left === 'number') {
            radius += arc.left ? -left : left;
        }
        radius *= contextTransform.scale;
        radius *= curveTransform.scale;
        context.arc(point.x, point.y, radius, phi1 + tfrot, phi2 + tfrot, arc.left === (mx !== my));
    }

    class ArcLine {
        #curve;
        #p;
        #parts;
        #adjuster;
        #tf;
        constructor(curve) {
            this.#curve = curve;
            this.length = 0.0;
            this.closed = false;
            this.#p = {};
            this.#parts = [];
            this.#adjuster = new Adjuster();
            this.#tf = new Transform();
            // initialize
            this.adjust();
            this.#init();
        }
        adjust() {
            this.#tf.setToIdentity();
            this.#tf.setToCoordinateTransform(this.#curve);
        }
        /**
         * Initialize ArcLine with points
         */
        #init() {
            const curve = this.#curve;
            const points = curve.points;
            // This method performs the following operations:
            // Collect all valid points in an array [1]
            // Build arcs for all points with radius [2]
            // Collect all line and arc parts in an array and compute length [3] reset
            const pts = [];
            const parts = this.#parts;
            parts.splice(0, parts.length);
            const adjuster = this.#adjuster;
            adjuster.reset(0.0, 0.0, curve.id);
            let length = 0.0;
            const closed = curve.closed === true;
            if (Array.isArray(points) && points.length > 0) {
                // collect [1]
                for (const position of points) {
                    const x = position.x;
                    const y = position.y;
                    if (typeof x === 'number' && typeof y === 'number') {
                        const p = { x, y, arc: false };
                        const r = position.r;
                        if (typeof r === 'number' && r > 0.0) {
                            p.r = r;
                        }
                        const pos = position.position;
                        if (typeof pos === 'number') {
                            p.position = pos;
                        }
                        const id = position.id;
                        if (id !== undefined) {
                            p.id = id;
                        }
                        pts.push(p);
                    }
                }
                // for all points check if we need an arc [2]
                for (let i = 0; i < pts.length; i++) {
                    const point = pts[i];
                    const r = point.r;
                    if (r !== undefined && (closed || (i > 0 && i < pts.length - 1))) {
                        const prev = i > 0 ? pts[i - 1] : pts[pts.length - 1];
                        const next = i < pts.length - 1 ? pts[i + 1] : pts[0];
                        point.arc = getArc(prev.x, prev.y, point.x, point.y, next.x, next.y, r);
                    }
                }
                // collect parts [3]
                for (let i = 1; closed ? i <= pts.length : i < pts.length; i++) {
                    const sp = pts[i - 1];
                    const ep = i === pts.length ? pts[0] : pts[i];
                    const sa = sp.arc;
                    const ea = ep.arc;
                    const x1 = sa !== false ? sa.endX : sp.x;
                    const y1 = sa !== false ? sa.endY : sp.y;
                    const x2 = ea !== false ? ea.startX : ep.x;
                    const y2 = ea !== false ? ea.startY : ep.y;
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    let len = Math.sqrt(dx * dx + dy * dy);
                    if (len > EPSILON) {
                        // we only want lines with an existing length
                        parts.push({
                            arc: false,
                            x1,
                            y1,
                            s1: length,
                            x2,
                            y2,
                            s2: length + len,
                            length: len,
                            ex: dx / len,
                            ey: dy / len,
                            phi: Math.atan2(dy, dx)
                        });
                    }
                    length += len;
                    if (ea !== false) {
                        const angle = ea.endPhi - ea.startPhi;
                        len = Math.abs(angle) * ea.radius;
                        if (len > EPSILON) {
                            // we only want arcs with an existing length
                            parts.push({
                                arc: ea,
                                s1: length,
                                s2: length + len,
                                length: len
                            });
                        }
                        length += len;
                    }
                }
            }
            adjuster.add(length, length, curve.id);
            this.length = length;
            this.closed = closed;
        }
        getLength() {
            return this.length;
        }
        #getPositionOnArcLine(position, left, point) {
            const parts = this.#parts;
            for (const part of parts) {
                const s1 = part.s1;
                if (position >= s1 && position <= part.s2) {
                    const tf = this.#tf;
                    const mirrored = tf.mirrorX !== tf.mirrorY;
                    const p = point || {};
                    const arc = part.arc;
                    const rel = (position - s1) / part.length;
                    if (arc === false) {
                        const x = part.x1 + (part.x2 - part.x1) * rel - part.ey * left;
                        const y = part.y1 + (part.y2 - part.y1) * rel + part.ex * left;
                        tf.transform(x, y, p);
                        p.phi = (mirrored ? -part.phi : part.phi) + tf.rotation;
                    }
                    else {
                        const phi = arc.startPhi + (arc.endPhi - arc.startPhi) * rel;
                        const cos = Math.cos(phi);
                        const sin = Math.sin(phi);
                        const x = arc.centerX + (arc.left ? sin * arc.radius : -sin * arc.radius) - sin * left;
                        const y = arc.centerY + (arc.left ? -cos * arc.radius : cos * arc.radius) + cos * left;
                        tf.transform(x, y, p);
                        p.phi = (mirrored ? -phi : phi) + tf.rotation;
                    }
                    return p;
                }
            }
        }
        /**
         * Transforms position on curve to point containing x/y location, rotation
         * angle and unit vector on curve. The curve has a length given through it's
         * actual form. If our position is in between zero and the length the result
         * will be a point on the curve. If we are outside and we are closed we turn
         * around as often as required (something like "module-length"). If outside
         * and not closed the position will be extrapolated linear.
         *
         * @name transform
         * @method
         * @memberof ArcLine.prototype
         * @param {Number}
         *          position The position on the ArcLine
         * @param {Object}
         *          i_point Optional object for the result
         * @returns {Object} If i_point is defined i_point will be returned.
         *          Otherwise a new object will be returned
         */
        #transform(position, i_left, i_point) {
            const parts = this.#parts;
            if (typeof position !== 'number' || parts.length === 0) {
                return false;
            }
            if (this.closed) {
                const curve_start = parts[0].s1;
                const curve_end = parts[parts.length - 1].s2;
                // normalize position
                let pos = position;
                while (pos >= curve_end) {
                    pos -= this.length;
                }
                while (pos < curve_start) {
                    pos += this.length;
                }
                return this.#getPositionOnArcLine(pos, i_left, i_point);
            }
            // check if before first segment
            const tf = this.#tf;
            const mirrored = tf.mirrorX !== tf.mirrorY;
            let part = parts[0];
            const s1 = part.s1;
            if (position < s1) {
                const offset = position - s1;
                const arc = part.arc;
                const p = i_point || {};
                if (arc === false) {
                    const x = part.x1 + part.ex * offset - part.ey * i_left;
                    const y = part.y1 + part.ey * offset + part.ex * i_left;
                    tf.transform(x, y, p);
                    p.phi = (mirrored ? -part.phi : part.phi) + tf.rotation;
                } else {
                    const cos = Math.cos(arc.startPhi);
                    const sin = Math.sin(arc.startPhi);
                    const x = arc.centerX + (arc.left ? sin * arc.radius : -sin * arc.radius) + cos * offset - sin * i_left;
                    const y = arc.centerY + (arc.left ? -cos * arc.radius : cos * arc.radius) + sin * offset + cos * i_left;
                    tf.transform(x, y, p);
                    p.phi = (mirrored ? -arc.startPhi : arc.startPhi) + tf.rotation;
                }
                return p;
            }
            // check if behind last segment
            part = parts[parts.length - 1];
            const s2 = part.s2;
            if (position >= s2) {
                const offset = position - s2;
                const arc = part.arc;
                const p = i_point || {};
                if (arc === false) {
                    const x = part.x2 + part.ex * offset - part.ey * i_left;
                    const y = part.y2 + part.ey * offset + part.ex * i_left;
                    tf.transform(x, y, p);
                    p.phi = (mirrored ? -part.phi : part.phi) + tf.rotation;
                } else {
                    const cos = Math.cos(arc.endPhi);
                    const sin = Math.sin(arc.endPhi);
                    const x = arc.centerX + (arc.left ? sin * arc.radius : -sin * arc.radius) + cos * offset - sin * i_left;
                    const y = arc.centerY + (arc.left ? -cos * arc.radius : cos * arc.radius) + sin * offset + cos * i_left;
                    tf.transform(x, y, p);
                    p.phi = (mirrored ? -arc.endPhi : arc.endPhi) + tf.rotation;
                }
                return p;
            }
            // must be in between
            return this.#getPositionOnArcLine(position, i_left, i_point);
        }
        transform(position, left, point) {
            return this.#transform(this.#adjuster.adjust(position), left, point);
        }
        #strokeArcLine(context, transform, start, end, left) {
            const parts = this.#parts;
            let start_pos = start;
            const p = this.#p;
            for (const part of parts) {
                const s2 = part.s2;
                if (start_pos < s2) {
                    const is_last = end <= s2;
                    const end_pos = is_last ? end : s2;
                    if (Math.abs(end_pos - start_pos) > MIN_STROKE_LENGTH) {
                        this.#getPositionOnArcLine(start_pos, left, p);
                        transform.transform(p.x, p.y, p);
                        const x1 = p.x;
                        const y1 = p.y;
                        context.beginPath();
                        this.#getPositionOnArcLine(end_pos, left, p);
                        transform.transform(p.x, p.y, p);
                        const arc = part.arc;
                        if (arc === false) {
                            context.moveTo(x1, y1);
                            context.lineTo(p.x, p.y);
                        } else {
                            prepareArc(context, transform, p, part, start_pos, end_pos, left, this.#tf);
                        }
                        context.stroke();
                    }
                    start_pos = end_pos;
                    if (is_last) {
                        break;
                    }
                }
            }
        }
        stroke(context, transform, start, end, left) {
            // get the stroke start and end position in curve coordinates
            const adjuster = this.#adjuster;
            let stroke_start = adjuster.adjust(Math.min(start, end));
            let stroke_end = adjuster.adjust(Math.max(start, end));
            // if too short
            if (stroke_end - stroke_start < MIN_STROKE_LENGTH) {
                // nothing more to do
                return;
            }
            const p = this.#p;
            // get the curves start and end position
            const parts = this.#parts;
            const curve_start = parts[0].s1;
            const curve_end = parts[parts.length - 1].s2;
            // handle closed curve
            if (this.closed === true) {
                // //////////////////////////////////////////////////////////////////////
                // CLOSED CURVE:
                // - normalize because we want the start in the range [0, length)
                // - stroke until end
                // - if available handle overlapping rest
                // //////////////////////////////////////////////////////////////////////
                const length = curve_end - curve_start;
                while (stroke_start >= curve_end) {
                    stroke_start -= length;
                    stroke_end -= length;
                }
                while (stroke_start < curve_start) {
                    stroke_start += length;
                    stroke_end += length;
                }
                const stroke_end_is_behind_curve_end = stroke_end > curve_end;
                let se = stroke_end_is_behind_curve_end ? curve_end : stroke_end;
                if (se - stroke_start > MIN_STROKE_LENGTH) {
                    this.#strokeArcLine(context, transform, stroke_start, se, left);
                }
                if (stroke_end_is_behind_curve_end) {
                    se = stroke_end - length;
                    if (se - curve_start > MIN_STROKE_LENGTH) {
                        this.#strokeArcLine(context, transform, curve_start, se, left);
                    }
                }
                return;
            }
            // reaching this point our curve is not closed - so we extrapolate points
            // outside the range our curve
            // first handle stroke parts before actual curve
            if (stroke_start < curve_start) {
                const stroke_end_is_before_curve_start = stroke_end <= curve_start;
                const se = stroke_end_is_before_curve_start ? stroke_end : curve_start;
                if (se - stroke_start > MIN_STROKE_LENGTH) {
                    context.beginPath();
                    this.#transform(stroke_start, left, p);
                    transform.transform(p.x, p.y, p);
                    context.moveTo(p.x, p.y);
                    this.#transform(se, left, p);
                    transform.transform(p.x, p.y, p);
                    context.lineTo(p.x, p.y);
                    context.stroke();
                }
                if (stroke_end_is_before_curve_start) {
                    // nothing more to do
                    return;
                }
                stroke_start = curve_start;
            }
            // next handle parts on actual curve
            if (stroke_start < curve_end) {
                const stroke_end_is_before_curve_end = stroke_end <= curve_end;
                const se = stroke_end_is_before_curve_end ? stroke_end : curve_end;
                if (se - stroke_start > MIN_STROKE_LENGTH) {
                    this.#strokeArcLine(context, transform, stroke_start, se, left);
                }
                if (stroke_end_is_before_curve_end) {
                    // nothing more to do
                    return;
                }
                stroke_start = curve_end;
            }
            // last handle stroke parts behind actual curve
            if (stroke_end - stroke_start > MIN_STROKE_LENGTH) {
                context.beginPath();
                this.#transform(stroke_start, left, p);
                transform.transform(p.x, p.y, p);
                context.moveTo(p.x, p.y);
                this.#transform(stroke_end, left, p);
                transform.transform(p.x, p.y, p);
                context.lineTo(p.x, p.y);
                context.stroke();
            }
        }
    }

    function getFromArray(array, selector) {
        if (typeof selector === 'number') {
            return array[selector];
        } else {
            for (const obj of array) {
                if (obj.child === selector) {
                    return obj;
                }
            }
            return undefined;
        }
    }

    /**
     * CurveSection implements an mechanism to place items and zones on a curve
     * (arc- or rope-line). The actual length of the curve is given through it's
     * geometry. The length of the curve section will be compute as the sum of the
     * lengths of all contained zone-elements.
     * 
     * ATTENTION! If there is no element with a valid length attribute, this
     * mechanism does not work!
     * 
     * All items and zones will be placed on the actual curve relatively to it's
     * position on the section. (If a curve has a length of 80m, but the section
     * has to be 100m long an item at position 50m on the section will be at 40m
     * on the curve)
     */
    class CurveSection {
        #length;
        #elementsWithLength;
        #elementsWithoutLength;
        #cu_offset;
        #sec_to_cu_factor;
        #curve;
        constructor(curve, id, curveStart, curveEnd, elements) {
            const cu_start = typeof curveStart === 'number' ? curveStart : 0.0;
            const cu_end = typeof curveEnd === 'number' ? curveEnd : curve.getLength();
            // compute the length of all elements
            let sec_len = 0.0;
            if (Array.isArray(elements)) {
                for (const child of elements) {
                    const sec_zone_length = child.length;
                    if (typeof sec_zone_length === 'number' && sec_zone_length > 0.0) {
                        sec_len += sec_zone_length;
                    }
                }
            }
            if (sec_len === 0.0) {
                console.error(`CurveSection '${id}' has no element with valid length!`);
            }
            const elementsWithLength = [];
            const elementsWithoutLength = [];
            let sec_to_cu_factor = 1.0;
            // if valid arc line and valid elements
            const cu_len = cu_end - cu_start;
            if (sec_len > 0.0 && Math.abs(cu_len) > MIN_STROKE_LENGTH) {
                sec_to_cu_factor = cu_len / sec_len;
                let cu_offset = cu_start;
                let sec_offset = 0.0;
                for (const child of elements) {
                    const sec_zone_length = child.length;
                    if (typeof sec_zone_length === 'number' && sec_zone_length > 0.0) {
                        // update the positions
                        const sec_zone_start = sec_offset;
                        cu_offset += sec_zone_length * sec_to_cu_factor;
                        sec_offset += sec_zone_length;
                        const sec_zone_end = sec_offset;
                        elementsWithLength.push({ child, start: sec_zone_start, end: sec_zone_end });
                    } else {
                        // If the element has no length it is located somewhere on the curve.
                        // First of all it may be located by an explicit position parameter.
                        // [1]
                        // If no position has been defined we just locate where we
                        // are right now. [2]
                        // In the end our position may be moved by an explicit offset
                        // parameter. [3]
                        let object = child;
                        let obj = object.object;
                        while (obj !== null && typeof obj === 'object') {
                            object = obj;
                            obj = object.object;
                        }
                        let sec_pos = undefined;
                        if (typeof child.position === 'number') {
                            // explicit position parameter [1]
                            sec_pos = child.position;
                        }
                        if (sec_pos === undefined) {
                            // locate where we are right now [2]
                            sec_pos = sec_offset;
                        }
                        elementsWithoutLength.push({ child, position: sec_pos });
                    }
                }
            }
            this.#length = sec_len;
            this.#elementsWithLength = elementsWithLength;
            this.#elementsWithoutLength = elementsWithoutLength;
            //this.#inc_pos = cu_len >= 0;
            this.#cu_offset = cu_start;
            this.#sec_to_cu_factor = sec_to_cu_factor;
            this.#curve = curve;
        }
        getLength() {
            return this.#length;
        }
        getZoneCount() {
            return this.#elementsWithLength.length;
        }
        getZoneObject(zone) {
            const z = this.#elementsWithLength[zone];
            return z ? z.child : undefined;
        }
        getZoneStart(zone) {
            const z = getFromArray(this.#elementsWithLength, zone);
            return z ? z.start : undefined;
        }
        getZoneEnd(zone) {
            const z = getFromArray(this.#elementsWithLength, zone);
            return z ? z.end : undefined;
        }
        getItemCount() {
            return this.#elementsWithoutLength.length;
        }
        getItem(item) {
            return getFromArray(this.#elementsWithoutLength, item);
        }
        getItemPosition(item) {
            const it = getFromArray(this.#elementsWithoutLength, item);
            return it ? it.position : undefined;
        }
        /**
         * Transforms position on curve to point containing x/y location, rotation
         * angle and unit vector on curve. The curve has a length given through it's
         * accumulated length of its children elements. If our position is in
         * between zero and the length the result will be a point on the curve. If
         * we are outside and we are closed we turn around as often as required
         * (something like "module-length"). If outside and not closed the position
         * will be extrapolated linear.
         *
         * @name transform
         * @method
         * @memberof CurveSection.prototype
         * @param {Number}
         *          i_position The position on the CurveSection
         * @param {Number,Object}
         *          i_offset Optional offset: An number or the offset attribute
         *          moves on the curve while an object with left or right will move
         *          beside the curve (bad english).
         * @param {Object}
         *          point Optional object for the result
         * @returns {Object} If i_point is defined i_point will be returned.
         *          Otherwise a new object will be returned
         */
        transform(sectionPosition, offset, point) {
            let position = sectionPosition;
            if (typeof offset === 'number') {
                position += offset;
            } else if (offset !== null && typeof offset === 'object' && typeof offset.offset === 'number') {
                position += offset.offset;
            }
            let left = 0.0;
            if (offset !== null && typeof offset === 'object') {
                const l = offset.left;
                if (typeof l === 'number') {
                    left = l;
                } else {
                    const r = offset.right;
                    if (typeof r === 'number') {
                        left = -r;
                    }
                }
            }
            return this.#curve.transform(this.#cu_offset + position * this.#sec_to_cu_factor, left, point);
        }
        /**
         * This transforms from curve section coordinates (our real metric system)
         * to curve coordinates (pure mathematical position on curve geometry).
         */
        fromSectionToCurve(position) {
            return this.#cu_offset + position * this.#sec_to_cu_factor;
        }
    }

    const THIRD_PART = 1.0 / 3.0;
    const GOLDEN_SECTION_INTERVAL_PART = (3.0 - Math.sqrt(5.0)) * 0.5;

    // the default iteration parameters
    const DEFAULT_MAX_ITERATIONS = 1000;
    const DEFAULT_DISTANCE_TOLERANCE = 1.0e-6;
    const DEFAULT_LENGTH_TOLERANCE = 1.0e-3;
    const POINT_SITUATION_VALID = 0;
    const POINT_SITUATION_INVALID_DOUBLE_POINT = 1;
    const POINT_SITUATION_INVALID_DOUBLE_START = 2;
    const POINT_SITUATION_INVALID_DOUBLE_END = 3;
    const POINT_SITUATION_INVALID_TRIPLE_POINT = 4;

    function isZeroInfinitOrInvalid(value) {
        return value === 0.0 || isNaN(value) || isFinite(value) !== true;
    }

    function compareWithTolerance(value1, value2, tolerance) {
        const t = tolerance > 0.0 ? tolerance : 0.0;
        if (value1 > value2 + t) {
            return 1;
        } else if (value1 < value2 - t) {
            return -1;
        } else {
            return 0;
        }
    }

    function initTupel(tuple, x1, y1, x2, y2, tolerance) {
        const res = compareWithTolerance(x1, x2, tolerance);
        if (res > 0) {
            tuple.x1 = x2;
            tuple.y1 = y2;
            tuple.x2 = x1;
            tuple.y2 = y1;
            tuple.state = POINT_SITUATION_VALID;
        } else if (res === 0) {
            tuple.x1 = x1;
            tuple.y1 = y1;
            tuple.x2 = x1;
            tuple.y2 = y1;
            tuple.state = POINT_SITUATION_INVALID_DOUBLE_POINT;
        } else {
            tuple.x1 = x1;
            tuple.y1 = y1;
            tuple.x2 = x2;
            tuple.y2 = y2;
            tuple.state = POINT_SITUATION_VALID;
        }
    }

    function initTriplet(triplet, x1, y1, x2, y2, x3, y3, tolerance) {
        let res = compareWithTolerance(x1, x2, tolerance);
        if (res > 0) {
            // #1-5
            res = compareWithTolerance(x2, x3, tolerance);
            if (res > 0) {
                // #1
                triplet.x1 = x3;
                triplet.y1 = y3;
                triplet.x2 = x2;
                triplet.y2 = y2;
                triplet.x3 = x1;
                triplet.y3 = y1;
                triplet.state = POINT_SITUATION_VALID;
            } else if (res === 0) {
                // #2
                triplet.x1 = x2;
                triplet.y1 = y2;
                triplet.x2 = x2;
                triplet.y2 = y2;
                triplet.x3 = x1;
                triplet.y3 = y1;
                triplet.state = POINT_SITUATION_INVALID_DOUBLE_START;
            } else {
                // #3-5
                res = compareWithTolerance(x1, x3, tolerance);
                if (res > 0) {
                    // #3
                    triplet.x1 = x2;
                    triplet.y1 = y2;
                    triplet.x2 = x3;
                    triplet.y2 = y3;
                    triplet.x3 = x1;
                    triplet.y3 = y1;
                    triplet.state = POINT_SITUATION_VALID;
                } else if (res === 0) {
                    // #4
                    triplet.x1 = x2;
                    triplet.y1 = y2;
                    triplet.x2 = x1;
                    triplet.y2 = y1;
                    triplet.x3 = x1;
                    triplet.y3 = y1;
                    triplet.state = POINT_SITUATION_INVALID_DOUBLE_END;
                } else {
                    // #5
                    triplet.x1 = x2;
                    triplet.y1 = y2;
                    triplet.x2 = x1;
                    triplet.y2 = y1;
                    triplet.x3 = x3;
                    triplet.y3 = y3;
                    triplet.state = POINT_SITUATION_VALID;
                }
            }
        } else if (res === 0) {
            // #6-8
            res = compareWithTolerance(x2, x3, tolerance);
            if (res > 0) {
                // #6
                triplet.x1 = x3;
                triplet.y1 = y3;
                triplet.x2 = x1;
                triplet.y2 = y1;
                triplet.x3 = x1;
                triplet.y3 = y1;
                triplet.state = POINT_SITUATION_INVALID_DOUBLE_END;
            } else if (res === 0) {
                // #7
                triplet.x1 = x1;
                triplet.y1 = y1;
                triplet.x2 = x1;
                triplet.y2 = y1;
                triplet.x3 = x1;
                triplet.y3 = y1;
                triplet.state = POINT_SITUATION_INVALID_TRIPLE_POINT;
            } else {
                // #8
                triplet.x1 = x1;
                triplet.y1 = y1;
                triplet.x2 = x1;
                triplet.y2 = y1;
                triplet.x3 = x3;
                triplet.y3 = y3;
                triplet.state = POINT_SITUATION_INVALID_DOUBLE_START;
            }
        } else {
            // #9-13
            res = compareWithTolerance(x2, x3, tolerance);
            if (res > 0) {
                // #9-11
                res = compareWithTolerance(x1, x3, tolerance);
                if (res > 0) {
                    // #9
                    triplet.x1 = x3;
                    triplet.y1 = y3;
                    triplet.x2 = x1;
                    triplet.y2 = y1;
                    triplet.x3 = x2;
                    triplet.y3 = y2;
                    triplet.state = POINT_SITUATION_VALID;
                } else if (res === 0) {
                    // #10
                    triplet.x1 = x1;
                    triplet.y1 = y1;
                    triplet.x2 = x1;
                    triplet.y2 = y1;
                    triplet.x3 = x2;
                    triplet.y3 = y2;
                    triplet.state = POINT_SITUATION_INVALID_DOUBLE_START;
                } else {
                    // #11
                    triplet.x1 = x1;
                    triplet.y1 = y1;
                    triplet.x2 = x3;
                    triplet.y2 = y3;
                    triplet.x3 = x2;
                    triplet.y3 = y2;
                    triplet.state = POINT_SITUATION_VALID;
                }
            } else if (res === 0) {
                // #12
                triplet.x1 = x1;
                triplet.y1 = y1;
                triplet.x2 = x2;
                triplet.y2 = y2;
                triplet.x3 = x2;
                triplet.y3 = y2;
                triplet.state = POINT_SITUATION_INVALID_DOUBLE_END;
            } else {
                // #13
                triplet.x1 = x1;
                triplet.y1 = y1;
                triplet.x2 = x2;
                triplet.y2 = y2;
                triplet.x3 = x3;
                triplet.y3 = y3;
                triplet.state = POINT_SITUATION_VALID;
            }
        }
    }

    function initParabolaForThreePoints(parabola, x1, y1, x2, y2, x3, y3) {
        // compute some help values
        const dx12 = x1 - x2;
        const dx23 = x2 - x3;
        const dx31 = x3 - x1;
        const dy12 = y1 - y2;
        const dy23 = y2 - y3;
        const dy31 = y3 - y1;
        const x1Sq = x1 * x1;
        const x2Sq = x2 * x2;
        const x3Sq = x3 * x3;
        const r = (dx12 * dx23 * dx31);
        // compute the parameters for the equation
        parabola.a = (x1 * dy23 + x2 * dy31 + x3 * dy12) / r;
        parabola.b = -(x1Sq * dy23 + x2Sq * dy31 + x3Sq * dy12) / r;
        parabola.c = -(x1Sq * (x2 * y3 - x3 * y2) + x1 * (x3Sq * y2 - x2Sq * y3) + x2 * x3 * y1 * dx23) / r;
    }

    function initParabolaForTwoPoints(parabola, x1, y1, x2, y2) {
        const r = x1 - x2;
        parabola.a = 0.0;
        parabola.b = (y1 - y2) / r;
        parabola.c = (x1 * y2 - x2 * y1) / r;
    }

    function getParabolaValue(parabola, x) {
        return x * (parabola.a * x + parabola.b) + parabola.c;
    }

    class ChainFunction {
        #maxIterations;
        #distanceTolerance;
        #lengthTolerance;
        #parabola;
        #tuple;
        #triplet;
        #normA;
        #normB;
        #normC;
        #valid;
        #cosinusHyperbolicus;
        #transScale;
        #transScaleInv;
        #transXOffset;
        #transYOffset;
        constructor(maxIterations, distanceTolerance, lengthTolerance) {
            // internal parameters
            this.#maxIterations = typeof maxIterations === 'number' && maxIterations > 0 ? maxIterations : DEFAULT_MAX_ITERATIONS;
            this.#distanceTolerance = typeof distanceTolerance === 'number' && distanceTolerance > 0 ? distanceTolerance : DEFAULT_DISTANCE_TOLERANCE;
            this.#lengthTolerance = typeof lengthTolerance === 'number' && lengthTolerance > 0 ? lengthTolerance : DEFAULT_LENGTH_TOLERANCE;
            this.#parabola = { a: 0.0, b: 0.0, c: 0.0 };
            this.#tuple = {};
            this.#triplet = {};
            this.#normA = 1.0;
            this.#normB = 0.0;
            this.#normC = 0.0;
            this.#valid = false;
            this.#cosinusHyperbolicus = false;
            this.#transScale = 1.0;
            this.#transScaleInv = 1.0;
            this.#transXOffset = 0.0;
            this.#transYOffset = 0.0;
        }
        reset() {
            const parabola = this.#parabola;
            parabola.a = 0.0;
            parabola.b = 0.0;
            parabola.c = 0.0;
            this.#normA = 1.0;
            this.#normB = 0.0;
            this.#normC = 0.0;
            this.#valid = false;
            this.#cosinusHyperbolicus = false;
            this.#transScale = 1.0;
            this.#transScaleInv = 1.0;
            this.#transXOffset = 0.0;
            this.#transYOffset = 0.0;
        }
        #initTransform(x1, y1, x2, y2) {
            const transScaleInv = (x2 - x1) * 0.5;
            const transScale = 1.0 / transScaleInv;
            this.#transXOffset = -(x1 + x2) * transScale * 0.5;
            this.#transYOffset = -(y1 + y2) * 0.5;
            this.#transScale = transScale;
            this.#transScaleInv = transScaleInv;
        }
        #toNormalized(value) {
            return this.#transScale * value;
        }
        #fromNormalized(value) {
            return this.#transScaleInv * value;
        }
        #toNormalizedLocation(x) {
            return this.#transScale * x + this.#transXOffset;
        }
        #fromNormalizedLocation(x) {
            return this.#transScaleInv * (x - this.#transXOffset);
        }
        #toNormalizedHeight(y) {
            return this.#transScale * (y + this.#transYOffset);
        }
        #fromNormalizedHeight(y) {
            return this.#transScaleInv * y - this.#transYOffset;
        }
        #getNormalizedHeight(normX) {
            return cosh(this.#normA * normX + this.#normB) / this.#normA + this.#normC;
        }
        #getNormalizedDistance(normX1, normX2) {
            const normB = this.#normB;
            return (sinh(this.#normA * normX2 + normB) - sinh(this.#normA * normX1 + normB)) / this.#normA;
        }
        #getNormalizedForce(normX) {
            return cosh(this.#normA * normX + this.#normB) / this.#normA;
        }
        #initForThreeNormalizedPoints(nx1, ny1, nx2, ny2, nx3, ny3) {
            this.#normA = 1.0;
            // some help values
            const dy12 = ny1 - ny2;
            const dy32 = ny3 - ny2;

            // First we compute a parabola through our three points. If we approximate
            // our cosh function as a Taylor polynomial function of second order we
            // get
            // a parabola as well. We use the polynomial parameters from our computed
            // parabola as start values for the following 2-D-Newton iteration.
            const parabola = this.#parabola;
            initParabolaForThreePoints(parabola, nx1, ny1, nx2, ny2, nx3, ny3);
            let normA = 2.0 * parabola.a;
            let normB = parabola.b;
            const maxIter = this.#maxIterations;
            const distTol = this.#distanceTolerance;
            for (let i = 0; i < maxIter; i++) {
                // the following calculations are done because of performance
                // reasons
                const ax1b = normA * nx1 + normB;
                const ax2b = normA * nx2 + normB;
                const ax3b = normA * nx3 + normB;
                const eax1bp = Math.exp(ax1b);
                const eax2bp = Math.exp(ax2b);
                const eax3bp = Math.exp(ax3b);
                const eax1bm = 1.0 / eax1bp;
                const eax2bm = 1.0 / eax2bp;
                const eax3bm = 1.0 / eax3bp;
                const cax1b = (eax1bp + eax1bm) * 0.5;
                const cax2b = (eax2bp + eax2bm) * 0.5;
                const cax3b = (eax3bp + eax3bm) * 0.5;

                // these are our target functions
                const f1 = normA * dy12 - cax1b + cax2b;
                const f2 = normA * dy32 - cax3b + cax2b;

                // this is our iteration stop criterion
                if (Math.abs(f1) <= distTol && Math.abs(f2) <= distTol) {
                    // compute the other parameters
                    this.#normA = normA;
                    this.#normB = normB;
                    this.#normC = (ny1 + ny2 + ny3 - (cax1b + cax2b + cax3b) / normA) * THIRD_PART;
                    this.#cosinusHyperbolicus = true;
                    return true;
                }
                // our stop criterion is not reached so far, so we perform the next
                // adjustment by 2-D-Newton iteration
                const sax1b = (eax1bp - eax1bm) * 0.5;
                const sax2b = (eax2bp - eax2bm) * 0.5;
                const sax3b = (eax3bp - eax3bm) * 0.5;
                const df1da = dy12 - sax1b * nx1 + sax2b * nx2;
                const df1db = -sax1b + sax2b;
                const df2da = dy32 - sax3b * nx3 + sax2b * nx2;
                const df2db = -sax3b + sax2b;
                const det = df1da * df2db - df1db * df2da;

                // if our determinant is zero our iteration fails
                if (isZeroInfinitOrInvalid(det)) {
                    return false;
                }
                normA -= (df2db * f1 - df1db * f2) / det;
                normB -= (df1da * f2 - df2da * f1) / det;
            }
            // reaching this point our iteration has failed
            return false;
        }
        /**
         * Compute a chain through the three given points
         *
         * @param x1
         *          The first x coordinate
         * @param y1
         *          The first y coordinate
         * @param x2
         *          The second x coordinate
         * @param y2
         *          The second y coordinate
         * @param x3
         *          The third x coordinate
         * @param y3
         *          The third y coordinate
         */
        initForThreePoints(x1, y1, x2, y2, x3, y3) {
            // reset, initialize transformation and compute the normalized values
            this.reset();
            const triplet = this.#triplet;
            initTriplet(triplet, x1, y1, x2, y2, x3, y3, this.#distanceTolerance);
            this.#initTransform(triplet.x1, triplet.y1, triplet.x3, triplet.y3);
            const nx1 = this.#toNormalizedLocation(triplet.x1);
            const ny1 = this.#toNormalizedHeight(triplet.y1);
            const nx2 = this.#toNormalizedLocation(triplet.x2);
            const ny2 = this.#toNormalizedHeight(triplet.y2);
            const nx3 = this.#toNormalizedLocation(triplet.x3);
            const ny3 = this.#toNormalizedHeight(triplet.y3);
            // depending on the configuration we decide what to do
            switch (triplet.state) {
                case POINT_SITUATION_VALID:
                    this.#initForThreeNormalizedPoints(nx1, ny1, nx2, ny2, nx3, ny3);
                    this.#valid = true;
                    return true;
                case POINT_SITUATION_INVALID_DOUBLE_START:
                case POINT_SITUATION_INVALID_DOUBLE_END:
                    initParabolaForTwoPoints(this.#parabola, nx1, ny1, nx3, ny3);
                    this.#cosinusHyperbolicus = false;
                    this.#valid = true;
                    return true;
                case POINT_SITUATION_INVALID_TRIPLE_POINT:
                default:
                    this.reset();
                    return false;
            }
        }
        /**
         * Compute a chain through the two given points and a given length. This
         * might not work if the length is to short.
         *
         * @param x1
         *          The first x coordinate
         * @param y1
         *          The first y coordinate
         * @param x2
         *          The second x coordinate
         * @param y2
         *          The second y coordinate
         * @param length
         *          The length
         */
        initForLength(x1, y1, x2, y2, length) {
            // reset, initialize transformation and compute the normalized values
            this.reset();
            const distTol = this.#distanceTolerance;
            const tuple = this.#tuple;
            initTupel(tuple, x1, y1, x2, y2, distTol);
            this.#initTransform(tuple.x1, tuple.y1, tuple.x2, tuple.y2);
            const nx1 = this.#toNormalizedLocation(tuple.x1);
            const ny1 = this.#toNormalizedHeight(tuple.y1);
            const nx2 = this.#toNormalizedLocation(tuple.x2);
            const ny2 = this.#toNormalizedHeight(tuple.y2);
            // depending on the configuration we decide what to do
            switch (tuple.state) {
                case POINT_SITUATION_VALID:
                    initParabolaForTwoPoints(this.#parabola, nx1, ny1, nx2, ny2);
                    break;
                case POINT_SITUATION_INVALID_DOUBLE_POINT:
                default:
                    this.reset();
                    return false;
            }
            // next we check if our rope length is long enough for the distance
            // between
            // our two points
            const nlen = this.#toNormalized(length);
            const dx = nx2 - nx1;
            const dy = ny2 - ny1;
            const distSq = dx * dx + dy * dy;
            const lenSq = nlen * nlen;
            if (lenSq <= distSq) {
                this.reset();
                return false;
            }
            // in the following loop we try to find a minimum and maximum sag, always
            // computing the resulting length
            const xm = (nx1 + nx2) * 0.5;
            const ym = (ny1 + ny2) * 0.5;
            let sag1 = 0.0;
            let sag2 = Math.abs(dx) + Math.abs(dy);
            let found = false;
            const maxIter = this.#maxIterations;
            const lenTol = this.#lengthTolerance;
            for (let i = 0; i < maxIter; i++) {
                this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - sag2, nx2, ny2);
                const normLength = this.#getNormalizedDistance(nx1, nx2);
                if (normLength < nlen - lenTol) {
                    sag1 = sag2;
                    sag2 *= 2.0;
                } else {
                    found = true;
                    break;
                }
            }
            if (found === false) {
                this.reset();
                return false;
            }
            // now we perform a bisection iteration to find the best sag according to
            // our required length
            let csag = (sag1 + sag2) * 0.5;
            let dsag = (sag2 - sag1) * 0.25;
            found = false;
            for (let i = 0; i < maxIter; i++) {
                this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - csag, nx2, ny2);
                const normLength = this.#getNormalizedDistance(nx1, nx2);
                if (normLength > nlen + lenTol) {
                    csag -= dsag;
                } else if (normLength < nlen - lenTol) {
                    csag += dsag;
                } else {
                    found = true;
                    break;
                }
                dsag *= 0.5;
            }
            if (found === false) {
                this.reset();
                return false;
            }
            found = false;
            let normA = this.#normA;
            let normB = this.#normB;
            // finally we do the 2-D-Newton iteration to find the best parameters
            for (let i = 0; i < maxIter; i++) {
                // the following calculations are done because of performance
                // reasons
                const ax1b = normA * nx1 + normB;
                const ax2b = normA * nx2 + normB;
                const eax1bp = Math.exp(ax1b);
                const eax2bp = Math.exp(ax2b);
                const eax1bm = 1.0 / eax1bp;
                const eax2bm = 1.0 / eax2bp;
                const sax1b = (eax1bp - eax1bm) * 0.5;
                const sax2b = (eax2bp - eax2bm) * 0.5;
                const cax1b = (eax1bp + eax1bm) * 0.5;
                const cax2b = (eax2bp + eax2bm) * 0.5;
                const dsax10b = sax2b - sax1b;
                const dcax01b = cax1b - cax2b;
                // these are our target functions
                const f1 = -normA * dy - cax1b + cax2b;
                const f2 = sax2b - sax1b - normA * nlen;
                // this is our iteration stop criterion
                if (Math.abs(f1) <= distTol && Math.abs(f2) <= distTol) {
                    // compute the other parameters
                    this.#normA = normA;
                    this.#normB = normB;
                    this.#normC = (ny1 + ny2 - (cosh(normA * nx1 + normB) + cosh(normA * nx2 + normB)) / normA) * 0.5;
                    this.#valid = true;
                    return true;
                }
                // our stop criterion is not reached so far, so we perform the next
                // adjustment by 2-D-Newton iteration
                const df1da = -dy - sax1b * nx1 + sax2b * nx2;
                const df1db = -sax1b + sax2b;
                const df2da = cax2b * nx2 - cax1b * nx1 - nlen;
                const df2db = cax2b - cax1b;
                const det = df1da * df2db - df1db * df2da;
                // if our determinant is zero our iteration fails
                if (isZeroInfinitOrInvalid(det)) {
                    break;
                }
                normA -= (df2db * f1 - df1db * f2) / det;
                normB -= (df1da * f2 - df2da * f1) / det;
            }
            this.reset();
            return false;
        }
        /**
         * Compute a chain through the two given points with the minimum force.
         *
         * @param x1
         *          The first x coordinate
         * @param y1
         *          The first y coordinate
         * @param x2
         *          The second x coordinate
         * @param y2
         *          The second y coordinate
         * @param x
         *          The x coordinate where we want the force to be minimal
         */
        initForMinimumForce(x1, y1, x2, y2, x) {
            this.reset();
            const distTol = this.#distanceTolerance;
            const tuple = this.#tuple;
            initTupel(tuple, x1, y1, x2, y2, distTol);
            this.#initTransform(tuple.x1, tuple.y1, tuple.x2, tuple.y2);
            const nx1 = this.#toNormalizedLocation(tuple.x1);
            const ny1 = this.#toNormalizedHeight(tuple.y1);
            const nx2 = this.#toNormalizedLocation(tuple.x2);
            const ny2 = this.#toNormalizedHeight(tuple.y2);
            const nx = this.#toNormalizedLocation(x);
            switch (tuple.state) {
                case POINT_SITUATION_VALID:
                    initParabolaForTwoPoints(this.#parabola, nx1, ny1, nx2, ny2);
                    break;
                case POINT_SITUATION_INVALID_DOUBLE_POINT:
                default:
                    this.reset();
                    return false;
            }
            // In the following section we try to find the minimum force at the given
            // location by varying the sag. Assuming the sag for minimum force is
            // located between the extreme sag of zero, which would mean we have
            // infinite force and on the other hand a sag of the sum of the x and y
            // distances, which means our chain sags very deep, we start our
            // iteration.
            const dx = nx2 - nx1;
            const dy = ny2 - ny1;
            const xm = (nx1 + nx2) * 0.5;
            const ym = (ny1 + ny2) * 0.5;
            let sag0 = 0.0;
            let sag3 = Math.abs(dx) + Math.abs(dy);
            let dsag = (sag3 - sag0) * GOLDEN_SECTION_INTERVAL_PART;
            let sag1 = sag0 + dsag;
            let sag2 = sag3 - dsag;
            this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - sag1, nx2, ny2);
            let frc1 = this.#getNormalizedForce(nx);
            this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - sag2, nx2, ny2);
            let frc2 = this.#getNormalizedForce(nx);
            const maxIter = this.#maxIterations;
            for (let i = 0; i < maxIter && dsag > distTol; i++) {
                if (frc1 > frc2) {
                    sag0 = sag1;
                    sag1 = sag2;
                    frc1 = frc2;
                    dsag = (sag3 - sag0) * GOLDEN_SECTION_INTERVAL_PART;
                    sag2 = sag3 - dsag;
                    this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - sag2, nx2, ny2);
                    frc2 = this.#getNormalizedForce(nx);
                } else {
                    sag3 = sag2;
                    sag2 = sag1;
                    frc2 = frc1;
                    dsag = (sag3 - sag0) * GOLDEN_SECTION_INTERVAL_PART;
                    sag1 = sag0 + dsag;
                    this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - sag1, nx2, ny2);
                    frc1 = this.#getNormalizedForce(nx);
                }
            }
            if (dsag <= distTol) {
                this.#valid = true;
                return true;
            } else {
                this.reset();
                return false;
            }
        }
        /**
         * Compute a chain through the two given points and a given force at a given
         * location.
         *
         * @param x1
         *          The first x coordinate
         * @param y1
         *          The first y coordinate
         * @param x2
         *          The second x coordinate
         * @param y2
         *          The second y coordinate
         * @param x
         *          The location for the given force
         * @param force
         *          The force for the given location
         * @param q0
         *          The weight per meter
         */
        initForForce(x1, y1, x2, y2, x, force, q0) {
            // First we initialize our chain for the minimum possible force at the
            // given location. If the given force is less we return unsuccessfully.
            this.initForMinimumForce(x1, y1, x2, y2, x);
            if (this.#cosinusHyperbolicus !== true) {
                this.reset();
                return false;
            }
            const tuple = this.#tuple;
            const nx1 = this.#toNormalizedLocation(tuple.x1);
            const ny1 = this.#toNormalizedHeight(tuple.y1);
            const nx2 = this.#toNormalizedLocation(tuple.x2);
            const ny2 = this.#toNormalizedHeight(tuple.y2);
            const nx = this.#toNormalizedLocation(x);
            let frc = typeof q0 === 'number' && q0 > 0.0 ? force / q0 : force; // TODO: Go on here
            const normFrc = this.#toNormalized(frc);
            const minForce = this.#getNormalizedForce(nx);
            if (normFrc < minForce) {
                this.reset();
                return false;
            }
            // If we reach this point we know that the required force is reachable, By
            // varying the sag, we try to approximate a chain for the required force.
            const xm = (nx1 + nx2) * 0.5;
            const ym = (ny1 + ny2) * 0.5;
            let csag = (ym - this.#getNormalizedHeight(xm)) * 0.5;
            let dsag = csag * 0.5;
            const maxIter = this.#maxIterations;
            const distTol = this.#distanceTolerance;
            for (let i = 0; i < maxIter && dsag > distTol; i++) {
                this.#initForThreeNormalizedPoints(nx1, ny1, xm, ym - csag, nx2, ny2);
                frc = this.#getNormalizedForce(nx);
                if (frc < normFrc) {
                    csag -= dsag;
                } else {
                    csag += dsag;
                }
                dsag *= 0.5;
            }
            // To get the best results we finally perform a 2 D-Newton iteration with
            // our start values calculated in the loop before.
            const dy = ny2 - ny1;
            let normA = this.#normA;
            let normB = this.#normB;
            for (let i = 0; i < maxIter; i++) {
                const ax1b = normA * nx1 + normB;
                const ax2b = normA * nx2 + normB;
                const axb = normA * nx + normB;
                const eax1bp = Math.exp(ax1b);
                const eax1bm = 1.0 / eax1bp;
                const eax2bp = Math.exp(ax2b);
                const eax2bm = 1.0 / eax2bp;
                const eaxbp = Math.exp(axb);
                const eaxbm = 1.0 / eaxbp;
                const cax1b = (eax1bp + eax1bm) * 0.5;
                const cax2b = (eax2bp + eax2bm) * 0.5;
                const caxb = (eaxbp + eaxbm) * 0.5;
                const f1 = -normA * dy - cax1b + cax2b;
                const f2 = caxb - normA * normFrc;
                if (Math.abs(f1) <= distTol && Math.abs(f2) <= distTol) {
                    const normC = (ny1 + ny2 - (cosh(normA * nx1 + normB) + cosh(normA * nx2 + normB)) / normA) * 0.5;
                    const parabola = this.#parabola;
                    parabola.a = normA * 0.5;
                    parabola.b = normB;
                    parabola.c = (2.0 + normB * normB) * 0.5 / normA + normC;
                    this.#normA = normA;
                    this.#normB = normB;
                    this.#normC = normC;
                    this.#cosinusHyperbolicus = true;
                    this.#valid = true;
                    return true;
                }
                const sax1b = (eax1bp - eax1bm) * 0.5;
                const sax2b = (eax2bp - eax2bm) * 0.5;
                const saxb = (eaxbp - eaxbm) * 0.5;
                const df1da = -dy - sax1b * nx1 + sax2b * nx2;
                const df1db = -sax1b + sax2b;
                const df2da = saxb * nx - normFrc;
                const df2db = saxb;
                const det = df1da * df2db - df1db * df2da;
                if (isZeroInfinitOrInvalid(det)) {
                    break;
                }
                normA -= (df2db * f1 - df1db * f2) / det;
                normB -= (df1da * f2 - df2da * f1) / det;
            }
            this.reset();
            return false;
        }
        /**
         * Get the y coordinate for the given x coordinate
         *
         * @param x
         *          The x coordinate
         * @return The y coordinate
         */
        getHeight(x) {
            if (this.#cosinusHyperbolicus) {
                const nx = this.#toNormalizedLocation(x);
                const ny = this.#getNormalizedHeight(nx);
                return this.#fromNormalizedHeight(ny);
            } else if (this.#valid) {
                const nx = this.#toNormalizedLocation(x);
                const ny = getParabolaValue(this.#parabola, nx);
                return this.#fromNormalizedHeight(ny);
            } else {
                return 0.0;
            }
        }
        /**
         * Get the gradient e.g. the first derivation value for the given x
         * coordinate
         *
         * @param x
         *          The x coordinate
         * @return The gradient value
         */
        getGradient(x) {
            const nx = this.#toNormalizedLocation(x);
            return sinh(this.#normA * nx + this.#normB);
        }
        /**
         * Get the angle for the given x coordinate
         *
         * @param x
         *          The x coordinate
         * @return The angle
         */
        getAngle(x) {
            const grad = this.getGradient(x);
            return Math.atan2(grad, 1.0);
        }
        /**
         * Get the x coordinate for the minimum y value
         *
         * @return The x coordinate
         */
        getMinimumLocation() {
            const nx = -this.#normB / this.#normA;
            return this.#fromNormalizedLocation(nx);
        }
        /**
         * Get the minimum y coordinate
         *
         * @return The minimum y coordinate
         */
        getMinimumHeight() {
            const ny = 1.0 / this.#normA + this.#normC;
            return this.#fromNormalizedHeight(ny);
        }
        /**
         * Get the length between the given x coordinates
         *
         * @param x1
         *          The first x coordinate
         * @param x2
         *          The second x coordinate
         * @return The length
         */
        getLength(x1, x2) {
            const nx1 = this.#toNormalizedLocation(Math.min(x1, x2));
            const nx2 = this.#toNormalizedLocation(Math.max(x1, x2));
            const nd = this.#getNormalizedDistance(nx1, nx2);
            return this.#fromNormalized(nd);
        }
        /**
         * Get the x coordinate for the given offset and distance
         *
         * @param offsetX
         *          The offset x coordinate
         * @param distance
         *          The distance (may be negative)
         * @return The x coordinate
         */
        getLocation(offsetX, distance) {
            const nx = this.#toNormalizedLocation(offsetX);
            const normA = this.#normA;
            const normB = this.#normB;
            const sh = sinh(normA * nx + normB);
            const nd = this.#toNormalized(distance);
            const nl = (asinh(normA * nd + sh) - normB) / normA;
            return this.#fromNormalizedLocation(nl);
        }
        /**
         * Get the force for the given x coordinate
         *
         * @param x
         *          The x coordinate
         * @param weightPerMeter
         *          The weight per meter
         * @param gravitation
         *          The gravitation constant
         * @return The force
         */
        getForce(x, weightPerMeter, gravitation) {
            const nx = this.#toNormalizedLocation(x);
            const nf = this.#getNormalizedForce(nx);
            const q0 = typeof gravitation === 'number' && gravitation > 0.0 ? weightPerMeter * gravitation : weightPerMeter;
            return this.#fromNormalized(nf) * q0;
        }
        /**
         * Returns the current state.
         *
         * @return true if a chain has been computed
         */
        isValid() {
            return this.#valid;
        }
        /**
         * Returns the current state.
         *
         * @return true if a chain has been computed with a cosinus hyperbolicus
         */
        isCosinusHyperbolicus() {
            return this.#cosinusHyperbolicus;
        }
        /**
         * Get the parameter "a" of the equation <code>
         *   y = f(x) = cosh(a*x + b)/a + c
         * </code>
         *
         * @return The parameter "a"
         */
        getA() {
            return this.#normA * this.#transScale;
        }
        /**
         * Get the parameter "b" of the equation <code>
         *   y = f(x) = cosh(a*x + b)/a + c
         * </code>
         *
         * @return The parameter "b"
         */
        getB() {
            return this.#normA * this.#transXOffset + this.#normB;
        }
        /**
         * Get the parameter "c" of the equation <code>
         *   y = f(x) = cosh(a*x + b)/a + c
         * </code>
         *
         * @return The parameter "c"
         */
        getC() {
            return this.#normC * this.#transScaleInv - this.#transYOffset;
        }
    }


    function normalizeRopeAngle(phi) {
        let p = phi;
        while (p < -HALF_PI) {
            p += TWO_PI;
        }
        while (p >= THREE_HALF_PI) {
            p -= TWO_PI;
        }
        return p;
    }

    /**
     * This method computes a support between two chains
     * 
     * @param chainFunction1
     *          The first chain function
     * @param chainFunction2
     *          The second chain function
     * @param x
     *          The x coordinate where our chains are "connected"
     * @param radius
     *          The saddle radius
     * @param maxIterations
     *          The maximum iteration count
     * @param tolerance
     *          The tolerance for our iteration process
     * @return True if the support has been computed successfully
     */
    function computeRopeSupport(chainFunction1, chainFunction2, x, radius, maxIterations, tolerance, increasingX) {
        if (typeof radius !== 'number' || radius <= 0.0) {
            // invalid radius
            return false;
        }
        const incX = increasingX === true;
        const grad1 = chainFunction1.getGradient(x);
        const grad2 = chainFunction2.getGradient(x);
        const up = incX ? grad1 >= grad2 : grad1 <= grad2;
        let x1 = x;
        let x2 = x;
        const r = radius;
        const a1 = chainFunction1.getA();
        const b1 = chainFunction1.getB();
        const c1 = chainFunction1.getC();
        const a2 = chainFunction2.getA();
        const b2 = chainFunction2.getB();
        const c2 = chainFunction2.getC();
        const maxIter = typeof maxIterations === 'number' && maxIterations > 0 ? maxIterations : DEFAULT_MAX_ITERATIONS;
        const tol = typeof tolerance === 'number' && tolerance > 0 ? tolerance : DEFAULT_DISTANCE_TOLERANCE;
        for (let i = 0; i < maxIter; i++) {
            const a1x1b1 = a1 * x1 + b1;
            const a2x2b2 = a2 * x2 + b2;
            const ea1x1b1p = Math.exp(a1x1b1);
            const ea1x1b1m = 1.0 / ea1x1b1p;
            const ea2x2b2p = Math.exp(a2x2b2);
            const ea2x2b2m = 1.0 / ea2x2b2p;
            const ca1x1b1 = (ea1x1b1p + ea1x1b1m) * 0.5;
            const sa1x1b1 = (ea1x1b1p - ea1x1b1m) * 0.5;
            const ca2x2b2 = (ea2x2b2p + ea2x2b2m) * 0.5;
            const sa2x2b2 = (ea2x2b2p - ea2x2b2m) * 0.5;
            const y1 = ca1x1b1 / a1 + c1;
            const y2 = ca2x2b2 / a2 + c2;
            const f1 = up ? (x1 + r * sa1x1b1 / ca1x1b1 - x2 - r * sa2x2b2 / ca2x2b2) : (x1 - r * sa1x1b1 / ca1x1b1 - x2 + r * sa2x2b2 / ca2x2b2);
            const f2 = up ? (y1 - r / ca1x1b1 - y2 + r / ca2x2b2) : (y1 + r / ca1x1b1 - y2 - r / ca2x2b2);
            if (Math.abs(f1) <= tol && Math.abs(f2) <= tol) {
                const centerX = up ? ((x1 + r * sa1x1b1 / ca1x1b1 + x2 + r * sa2x2b2 / ca2x2b2) * 0.5) : ((x1 - r * sa1x1b1 / ca1x1b1 + x2 - r * sa2x2b2 / ca2x2b2) * 0.5);
                const centerY = up ? ((y1 - r / ca1x1b1 + y2 - r / ca2x2b2) * 0.5) : ((y1 + r / ca1x1b1 + y2 + r / ca2x2b2) * 0.5);
                const phi1 = Math.atan2(y1 - centerY, x1 - centerX);
                const phi2 = Math.atan2(y2 - centerY, x2 - centerX);
                const left = incX !== up;
                return {
                    up,
                    left,
                    right: incX === up,
                    centerX,
                    centerY,
                    radius,
                    startX: x1,
                    startY: y1,
                    startPhi: normalizeRopeAngle(left ? phi1 + HALF_PI : phi1 - HALF_PI),
                    endX: x2,
                    endY: y2,
                    endPhi: normalizeRopeAngle(left ? phi2 + HALF_PI : phi2 - HALF_PI)
                };
            }
            const ca1x1b1Sq = ca1x1b1 * ca1x1b1;
            const ca2x2b2Sq = ca2x2b2 * ca2x2b2;
            const df1dx1 = up ? (1.0 + r * a1 / ca1x1b1Sq) : (1.0 - r * a1 / ca1x1b1Sq);
            const df1dx2 = up ? (-1.0 - r * a2 / ca2x2b2Sq) : (-1.0 + r * a2 / ca2x2b2Sq);
            const df2dx1 = up ? (sa1x1b1 + a1 * r * sa1x1b1 / ca1x1b1Sq) : (sa1x1b1 - a1 * r * sa1x1b1 / ca1x1b1Sq);
            const df2dx2 = up ? (-sa2x2b2 - a2 * r * sa2x2b2 / ca2x2b2Sq) : (-sa2x2b2 + a2 * r * sa2x2b2 / ca2x2b2Sq);
            const det = df1dx1 * df2dx2 - df1dx2 * df2dx1;
            // if our determinant is zero our iteration fails
            if (isZeroInfinitOrInvalid(det)) {
                return false;
            }
            x1 -= (df2dx2 * f1 - df1dx2 * f2) / det;
            x2 -= (df1dx1 * f2 - df2dx1 * f1) / det;
        }
        return false;
    }

    /**
     * Assuming i_referenceX lies within the range of i_x1 and i_x2 this method
     * returns zero if i_x is exactly i_x1, i_x2 or outside the range, one if i_x
     * is our i_referenceX and in between a linear interpolated value.
     */
    function getRelativeLinearValues(x1, x2, referenceX, x, values) {
        const val = values || {};
        if (x2 > x1) {
            if (x < referenceX) {
                const denom = referenceX - x1;
                val.value = (x - x1) / denom;
                val.gradient = 1.0 / denom;
            } else if (x > referenceX) {
                const denom = x2 - referenceX;
                val.value = (x2 - x) / denom;
                val.gradient = -1.0 / denom;
            } else {
                val.value = 1.0;
                val.gradient = 0.5 * (1.0 / (referenceX - x1) - 1.0 / (x2 - referenceX));
            }
        } else {
            if (x < referenceX) {
                const denom = referenceX - x2;
                val.value = (x - x2) / denom;
                val.gradient = 1.0 / denom;
            } else if (x > referenceX) {
                const denom = x1 - referenceX;
                val.value = (x1 - x) / denom;
                val.gradient = -1.0 / denom;
            } else {
                val.value = 1.0;
                val.gradient = 0.5 * (1.0 / (referenceX - x2) - 1.0 / (x1 - referenceX));
            }
        }
        return val;
    }

    function getLinearHeight(x1, y1, x2, y2, x) {
        return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
    }

    function getSteelRopeQ0(diameter) {
        // compute the cross section [m^2]
        const cross_section = diameter * diameter * 0.25 * PI;
        // compute the weight per meter [kg/m] = [kg/m^3] * [m^2]
        const weight_per_meter = SPECIFIC_GRAVITY_OF_STEEL * cross_section;
        // [kg/s^2] = [kg/m] * [m/s^2]
        return weight_per_meter * EARTH_GRAVITATION;
    }

    function getSmoothRopeSagFactor(x1, x2, x, s1, s2) {
        const xm = (x1 + x2) * 0.5;
        return getSmoothNormalizedTransfer(Math.abs(x - xm) / Math.abs(x2 - xm), s1, s2);
    }

    class RopeLine {
        #curve;
        #stress1;
        #stress2;
        #maxIterations;
        #distanceTolerance;
        #increasingX;
        #counterweight0;
        #counterweight1;
        #q0;
        #p;
        #parts;
        #fields;
        #adjuster;
        #tf;
        constructor(curve) {
            // ACHTUNG: Wenn ein Seil mit Kraftausgleich �ber mehrere St�tzen geht,
            // verh�lt sich die horizontale L�nge, schr�nge L�nge und Seill�nge in etwa
            // proportional.
            // Der Durchhang jedoch ist bei kleineren Feldern unterproportional kleiner,
            // die vertikale Distanz hingegen minimal gr�sser.
            // public fields
            this.length = 0.0;

            // internal parameters
            this.#curve = curve;
            this.#stress1 = DEFAULT_STRESS_S1;
            this.#stress2 = DEFAULT_STRESS_S2;
            this.#maxIterations = typeof curve.maxIterations === 'number' && curve.maxIterations > 0 ? curve.maxIterations : DEFAULT_MAX_ITERATIONS;
            this.#distanceTolerance = typeof curve.distanceTolerance === 'number' && curve.distanceTolerance > 0 ? curve.distanceTolerance : DEFAULT_DISTANCE_TOLERANCE;
            this.#increasingX = undefined;
            this.#counterweight0 = undefined;
            this.#counterweight1 = undefined;
            this.#q0 = undefined;
            this.#p = {};
            this.#parts = [];
            this.#fields = [];
            this.#adjuster = new Adjuster();
            this.#tf = new Transform();

            // initialize
            this.adjust();
            this.#init();
        }
        adjust() {
            const fields = this.#fields;
            const curve = this.#curve;
            // adjust transform
            this.#tf.setToIdentity();
            this.#tf.setToCoordinateTransform(curve);
            // handle stressing vehicle
            const stressX = curve.stressX;
            const stressSag = curve.stressSag;
            let stressAvailable = false;
            if (typeof stressX === 'number' && typeof stressSag === 'number') {
                for (const field of fields) {
                    const saddle1x = field.saddle1x;
                    const saddle2x = field.saddle2x;
                    if (this.#increasingX ? (saddle1x < stressX && stressX < saddle2x) : (saddle2x < stressX && stressX < saddle1x)) {
                        stressAvailable = true;
                        const rate = getSmoothRopeSagFactor(saddle1x, saddle2x, stressX, this.#stress1, this.#stress2) * field.relative_rate;
                        const max_sag = stressSag / rate;
                        for (const fld of fields) {
                            fld.middle_stress_sag = max_sag * fld.relative_rate;
                        }
                        break;
                    }
                }
            }
            if (stressAvailable === false) {
                for (const field of fields) {
                    delete field.middle_stress_sag;
                }
            }
        }
        #reset() {
            // clean up
            this.#fields.splice(0, this.#fields.length);
            this.#parts.splice(0, this.#parts.length);
            this.length = 0.0;
            this.#increasingX = undefined;
            this.#counterweight0 = undefined;
            this.#counterweight1 = undefined;
            this.#adjuster.reset();
        }
        #loadConfig() {
            const curve = this.#curve;
            // if invalid configuration we do not perform
            if (curve === null || typeof curve !== 'object') {
                console.error('ERROR! No rope configuration available.');
                return false;
            }
            // ///////////////////////////////////////////////////////////////
            // VALIDITY CHECK
            // ///////////////////////////////////////////////////////////////
            const points = curve.points;
            // if invalid configuration we do not perform
            if (Array.isArray(points) !== true || points.length === 0) {
                console.error('ERROR! Rope configuration does not contain valid points.');
                return false;
            }

            // ///////////////////////////////////////////////////////////////
            // WEIGHT PER METER
            // ///////////////////////////////////////////////////////////////
            const weight_per_meter = curve.weightPerMeter;
            if (typeof weight_per_meter === 'number' && weight_per_meter > 0) {
                this.#q0 = weight_per_meter * EARTH_GRAVITATION;
            }
            // ///////////////////////////////////////////////////////////////
            // COUNTERWEIGHT
            // ///////////////////////////////////////////////////////////////
            // check for counter weight configuration on first found support
            for (let i = 0; i < points.length; i++) {
                const pos = points[i];
                if (pos !== null && typeof pos === 'object' && pos.type === 'support') {
                    if (typeof pos.counterweight === 'number') {
                        this.#counterweight0 = pos.counterweight;
                    }
                    break;
                }
            }
            // if not found check for counter weight configuration on last found
            // support
            if (this.#counterweight0 === undefined) {
                for (let i = points.length - 1; i >= 0; i--) {
                    const pos = points[i];
                    if (pos !== null && typeof pos === 'object' && pos.type === 'support') {
                        if (typeof pos.counterweight === 'number') {
                            this.#counterweight1 = pos.counterweight;
                        }
                        break;
                    }
                }
            }
            // ///////////////////////////////////////////////////////////////
            // FIELDS
            // ///////////////////////////////////////////////////////////////
            // next we build an array of fields depending on the available supports
            let prev = undefined;
            const fields = this.#fields;
            for (let i = 0; i < points.length; i++) {
                const pos = points[i];
                if (pos !== null && typeof pos === 'object' && pos.type === 'support') {
                    if (prev === undefined) {
                        prev = pos;
                    } else {
                        const x1 = typeof prev.x === 'number' ? prev.x : 0.0;
                        const y1 = typeof prev.y === 'number' ? prev.y : 0.0;
                        const x2 = typeof pos.x === 'number' ? pos.x : 0.0;
                        const y2 = typeof pos.y === 'number' ? pos.y : 0.0;
                        const incx = x1 < x2;
                        // if first field we store if our x coordinate is increasing - if
                        // following field we check if the x coordinate is increasing as
                        // well
                        if (this.#increasingX === undefined) {
                            this.#increasingX = incx;
                        } else if (this.#increasingX === true) {
                            if (incx !== true) {
                                console.error('ERROR! Rope configuration changed from increasing to decreasing x-coordinate (index: ' + i + ', x1: ' + x1 + '. x2: ' + x2 + ')');
                                this.#reset();
                                return false;
                            }
                        } else {
                            if (incx === true) {
                                console.error('ERROR! Rope configuration changed from decreasing to increasing x-coordinate (index: ' + i + ', x1: ' + x1 + '. x2: ' + x2 + ')');
                                this.#reset();
                                return false;
                            }
                        }
                        fields.push({
                            support1config: prev,
                            support1x: x1,
                            support1y: y1,
                            saddle1x: x1,
                            saddle1y: y1,
                            support2config: pos,
                            support2x: x2,
                            support2y: y2,
                            saddle2x: x2,
                            saddle2y: y2,
                            chain: new ChainFunction(),
                            valid: undefined
                        });
                        prev = pos;
                    }
                }
            }
            // ///////////////////////////////////////////////////////////////
            // FIELD AND ROPE CONFIGURATION
            // ///////////////////////////////////////////////////////////////
            // next we try to find configuration data for the fields
            let field = undefined;
            for (let i = 0; i < points.length; i++) {
                const pos = points[i];
                if (pos !== null && typeof pos === 'object') {
                    for (let j = 0; j < fields.length; j++) {
                        const fld = fields[j];
                        if (fld.support1config === pos) {
                            field = fld;
                            break;
                        }
                    }
                    if (field === undefined) {
                        continue;
                    }
                    // try to get rope configuration for every item
                    if (this.#q0 === undefined && pos.rope !== undefined) {
                        if (typeof pos.rope === 'number' && pos.rope > 0) {
                            this.#q0 = getSteelRopeQ0(pos.rope);
                        } else if (Array.isArray(pos.rope)) {
                            const q0 = 0.0;
                            for (let j = 0; j < pos.rope.length; j++) {
                                const rd = pos.rope[j];
                                if (typeof rd === 'number' && rd > 0) {
                                    q0 += getSteelRopeQ0(rd);
                                }
                            }
                            if (q0 > 0.0) {
                                this.#q0 = q0;
                            }
                        }
                    }
                    // if a field try to get field parameters
                    if (pos.type === 'field') {
                        // first check the x location
                        const x = pos.x;
                        if (typeof x === 'number' && (this.#increasingX === true ? (x <= field.support1x || x >= field.support2x) : (x <= field.support2x || x >= field.support1x))) {
                            console.error('ERROR! Rope configuration field x-coordinate is outside field bounds (index: ' + i + ')');
                            this.#reset();
                            return false;
                        }
                        if (typeof pos.length === 'number' && pos.length > 0.0) {
                            field.length = pos.length;
                        } else if (typeof pos.y === 'number') {
                            field.x = x !== undefined ? x : (field.support1x + field.support2x) * 0.5;
                            const dir_y = getLinearHeight(field.support1x, field.support1y, field.support2x, field.support2y, field.x);
                            if (pos.y >= dir_y) {
                                console.error('ERROR! Rope configuration field y-coordinate is above linear height without any sag (index: ' + i + ')');
                                this.#reset();
                                return false;
                            }
                            field.y = pos.y;
                        } else if (typeof pos.sag === 'number' && pos.sag > 0.0) {
                            field.x = x !== undefined ? x : (field.support1x + field.support2x) * 0.5;
                            const dir_y = getLinearHeight(field.support1x, field.support1y, field.support2x, field.support2y, field.x);
                            field.y = dir_y - pos.sag;
                        } else if (typeof pos.force === 'number' && pos.force > 0.0) {
                            field.x = x !== undefined ? x : (field.support1x + field.support2x) * 0.5;
                            field.force = pos.force;
                        }
                    }
                }
            }
            // success if we collected any fields
            return fields.length > 0;
        }
        #computeRopeLine() {
            const fields = this.#fields;
            // if we got a counter weight in our first (or last) station we initialize
            // the first (or last) field
            if (this.#counterweight0 !== undefined) {
                const field = fields[0];
                const chain = field.chain;
                chain.initForForce(field.support1x, field.support1y, field.support2x, field.support2y, field.support1x, this.#counterweight0 * EARTH_GRAVITATION, this.#q0);
                field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
            } else if (this.#counterweight1 !== undefined) {
                const field = fields[fields.length - 1];
                const chain = field.chain;
                chain.initForForce(field.support1x, field.support1y, field.support2x, field.support2y, field.support2x, this.#counterweight1 * EARTH_GRAVITATION, this.#q0);
                field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
            }
            // initialize all not already initialized fields with given parameters
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                if (field.valid === undefined) {
                    const chain = field.chain;
                    if (field.length !== undefined) {
                        chain.initForLength(field.support1x, field.support1y, field.support2x, field.support2y, field.length);
                        field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
                    } else if (field.x !== undefined && field.y !== undefined) {
                        chain.initForThreePoints(field.support1x, field.support1y, field.support2x, field.support2y, field.x, field.y);
                        field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
                    } else if (field.force !== undefined && field.x !== undefined) {
                        chain.initForForce(field.support1x, field.support1y, field.support2x, field.support2y, field.x, field.force, this.#q0);
                        field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
                    }
                }
            }
            // now initialize all other fields
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                if (field.valid === true) {
                    const chain = field.chain;
                    // if we found a valid field we iterate over all following and not yet
                    // initialized fields in both directions and initialize them for
                    // equilibrium of forces.
                    let idx = i - 1;
                    let force = chain.getForce(field.support1x, 1.0);
                    while (idx >= 0 && fields[idx].valid === undefined) {
                        const fld = fields[idx];
                        fld.chain.initForForce(fld.support1x, fld.support1y, fld.support2x, fld.support2y, fld.support2x, force);
                        fld.valid = fld.chain.isValid() || fld.chain.isCosinusHyperbolicus();
                        force = fld.chain.getForce(fld.support1x, 1.0);
                        idx--;
                    }
                    idx = i + 1;
                    force = chain.getForce(field.support2x, 1.0);
                    while (idx < fields.length && fields[idx].valid === undefined) {
                        const fld = fields[idx];
                        fld.chain.initForForce(fld.support1x, fld.support1y, fld.support2x, fld.support2y, fld.support1x, force);
                        fld.valid = fld.chain.isValid() || fld.chain.isCosinusHyperbolicus();
                        force = fld.chain.getForce(fld.support2x, 1.0);
                        idx++;
                    }
                }
            }
            // now we initialize all fields not yet initialized with default minimum
            // force on lower support
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                if (field.valid === undefined) {
                    const chain = field.chain;
                    const x = field.support1y <= field.support2y ? field.support1x : field.support2x;
                    chain.initForMinimumForce(field.support1x, field.support1y, field.support2x, field.support2y, x);
                    field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
                }
            }
            // after all fields have been initialized we compute the saddles depending
            // on the radius
            for (let i = 1; i < fields.length; i++) {
                const field1 = fields[i - 1];
                const field2 = fields[i];
                const support = computeRopeSupport(field1.chain, field2.chain, field1.support2x, field1.support2config.r, this.#maxIterations, this.#distanceTolerance, this.#increasingX === true);
                if (support !== false) {
                    support.config = field1.support2config;
                    field1.sup2data = support;
                    field1.saddle2x = support.startX;
                    field1.saddle2y = support.startY;
                    field2.sup1data = support;
                    field2.saddle1x = support.endX;
                    field2.saddle1y = support.endY;
                } else {
                    field1.sup2data = false;
                    field2.sup1data = false;
                }
            }
            // finally we compute the relative rate for every field for our stress
            // simulation
            let max_delta_x = 0.0;
            let max_sag = 0.0;
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                const chain = field.chain;
                const saddle1x = field.saddle1x;
                const saddle2x = field.saddle2x;
                field._saddle_delta_x = Math.abs(saddle2x - saddle1x);
                const xmid = (saddle1x + saddle2x) * 0.5;
                const ylin = getLinearHeight(saddle1x, field.saddle1y, saddle2x, field.saddle2y, xmid);
                const yr = chain.getHeight(xmid);
                field._middle_sag = ylin - yr;
                // update to the max
                max_sag = Math.max(max_sag, field._middle_sag);
                max_delta_x = Math.max(max_delta_x, field._saddle_delta_x);
            }
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                field.relative_rate = (field._saddle_delta_x / max_delta_x + field._middle_sag / max_sag) * 0.5;
                delete field._saddle_delta_x;
                delete field._middle_sag;
            }
        }
        #computeParts() {
            const fields = this.#fields;
            let le = 0.0;
            if (fields.length > 0) {
                const parts = this.#parts;
                const adjuster = this.#adjuster;
                let field = fields[0];
                let supcfg = field.support1config;
                let dist = typeof supcfg.position === 'number' ? supcfg.position : 0.0;
                adjuster.reset(dist, 0.0, supcfg.id);
                for (let i = 0; i < fields.length; i++) {
                    field = fields[i];
                    const chain = field.chain;
                    const x1 = field.saddle1x;
                    const y1 = chain.getHeight(x1);
                    const x2 = field.saddle2x;
                    const y2 = chain.getHeight(x2);
                    const length = chain.getLength(x1, x2);
                    parts.push({
                        arc: false,
                        x1,
                        y1,
                        s1: le,
                        x2,
                        y2,
                        s2: le + length,
                        length,
                        field
                    });
                    le += length;
                    const support = field.sup2data;
                    if (support !== null && typeof support === 'object') {
                        const angle = support.endPhi - support.startPhi;
                        const len = Math.abs(angle) * support.radius;
                        const s1 = le;
                        const s = le + len / 2;
                        const s2 = le + len;
                        const sup = {
                            arc: support,
                            s1,
                            s,
                            s2,
                            length: len
                        };
                        parts.push(sup);
                        supcfg = field.support2config;
                        dist = typeof supcfg.position === 'number' ? supcfg.position : s;
                        adjuster.add(dist, s, supcfg.id);
                        le += len;
                    }
                }
                supcfg = field.support2config;
                dist = typeof supcfg.position === 'number' ? supcfg.position : le;
                adjuster.add(dist, le, supcfg.id);
                this.length = dist;
            }
        }
        #formatRopeInfo() {
            let txt = 'ROPE LINE INFO\n\n';
            const parts = this.#parts;
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const arc = part.arc;
                txt += (arc ? 'SUPPORT' : 'FIELD');
                txt += ':\nstart: ';
                txt += part.s1;
                if (arc) {
                    txt += ' middle: ';
                    txt += part.s;
                }
                txt += ' end: ';
                txt += part.s2;
                txt += '\n';
                if (arc) {
                    if (arc.config && arc.config.id) {
                        txt += 'id: "';
                        txt += arc.config.id;
                        txt += '"\n';
                    }
                    const mphi = (arc.endPhi + arc.startPhi) / 2;
                    txt += 'middle phi: ' + mphi + ' / ' + (mphi * RAD2DEG) + ' grad\n';
                    const dphi = Math.abs(arc.endPhi - arc.startPhi);
                    txt += 'delta phi: ' + dphi + ' / ' + (dphi * RAD2DEG) + ' grad\n';
                    txt += JsonFX.stringify(arc, true);
                    txt += '\n\n';
                } else {
                    const field = part.field;
                    const chain = field.chain;
                    const x1 = field.saddle1x;
                    const x2 = field.saddle2x;
                    const angle1 = chain.getAngle(x1) * RAD2DEG;
                    const force1 = chain.getForce(x1, this.#q0);
                    txt += 'x1 = ' + x1 + ' y1 = ' + field.saddle1y + ' angle1 = ' + angle1 + ' force1 = ' + force1 + '\n';
                    const angle2 = chain.getAngle(x2) * RAD2DEG;
                    const force2 = chain.getForce(x2, this.#q0);
                    txt += 'x2 = ' + x2 + ' y2 = ' + field.saddle2y + ' angle2 = ' + angle2 + ' force2 = ' + force2 + '\n';
                    txt += 'mode: ' + (chain.isCosinusHyperbolicus() === true ? 'cosh' : (chain.isValid() === true ? 'parabola' : 'none')) + '\n';
                    txt += 'stress rate: ' + field.relative_rate + '\n\n';
                }
            }
            txt += '\n\n' + this.#adjuster.format();
            return txt;
        }
        #init() {
            this.#reset();
            // if invalid data
            if (this.#loadConfig() !== true) {
                return false;
            }
            // compute
            this.#computeRopeLine();
            // finally we collect the parts
            this.#computeParts();
            // if verbose mode we got to dump some information
            if (this.#curve.verbose === true) {
                console.log(this.#formatRopeInfo());
            }
        }
        setVehiclePosition(position) {
            const vehPos = this.#adjuster.adjust(position);
            const fields = this.#fields;
            // search the field containing the given stress position
            let start = 0.0;
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                const chain = field.chain;
                const saddle1x = field.saddle1x;
                const saddle2x = field.saddle2x;
                let length = chain.getLength(saddle1x, saddle2x);
                let end = start + length;
                if (field.middle_stress_sag !== undefined && vehPos > start && vehPos < end) {
                    field.vehicle_position = vehPos;
                    const x = chain.getLocation(saddle1x, this.#increasingX === true ? vehPos - start : start - vehPos);
                    field.vehicle_x = x;
                    field.vehicle_stress_rate = getSmoothRopeSagFactor(saddle1x, saddle2x, x, this.#stress1, this.#stress2);
                } else {
                    delete field.vehicle_position;
                    delete field.vehicle_x;
                    delete field.vehicle_stress_rate;
                }
                start = end;
                const support = field.sup2data;
                if (support !== null && typeof support === 'object') {
                    length = Math.abs(support.endPhi - support.startPhi) * support.radius;
                    end = start + length;
                }
                start = end;
            }
        }
        getLength() {
            return this.length;
        }
        isIncreasingX() {
            return this.#increasingX;
        }
        #getPositionOnRopeLine(position, left, point) {
            let start = 0.0;
            const fields = this.#fields;
            const tf = this.#tf;
            const mirrored = tf.mirrorX !== tf.mirrorY;
            for (let i = 0; i < fields.length; i++) {
                const field = fields[i];
                const chain = field.chain;
                const saddle1x = field.saddle1x;
                const saddle2x = field.saddle2x;
                let length = chain.getLength(saddle1x, saddle2x);
                let end = start + length;
                if (position >= start && position <= end) {
                    // first we compute the original rope point coordinates and the
                    // gradient
                    let x = chain.getLocation(saddle1x, this.#increasingX === true ? position - start : start - position);
                    let y = chain.getHeight(x);
                    let gradient = chain.getGradient(x);
                    // if we have a vehicle within the field we lower the y coordinate and
                    // gradient
                    const vehicle_x = field.vehicle_x;
                    if (vehicle_x !== undefined) {
                        const vehicle_stress_rate = field.vehicle_stress_rate;
                        const rel = this.#p;
                        getRelativeLinearValues(saddle1x, saddle2x, vehicle_x, x, rel);
                        const stress_sag = vehicle_stress_rate * field.middle_stress_sag;
                        y -= rel.value * stress_sag;
                        gradient -= rel.gradient * stress_sag;
                    }
                    const phi = normalizeRopeAngle(Math.atan2(gradient, 1.0));
                    if (typeof left === 'number' && left !== 0.0) {
                        x -= Math.sin(phi) * left;
                        y += Math.cos(phi) * left;
                    }
                    const p = point || {};
                    tf.transform(x, y, p);
                    p.phi = (mirrored ? -phi : phi) + tf.rotation;
                    return p;
                }
                start = end;
                const support = field.sup2data;
                if (support !== null && typeof support === 'object') {
                    const startPhi = support.startPhi;
                    const endPhi = support.endPhi;
                    const radius = support.radius;
                    const deltaPhi = endPhi - startPhi;
                    length = Math.abs(deltaPhi) * radius;
                    end = start + length;
                    if (position >= start && position < end) {
                        const phi = normalizeRopeAngle(startPhi + (position - start) / length * deltaPhi);
                        const cos = Math.cos(phi);
                        const sin = Math.sin(phi);
                        const r = radius + (support.up === true ? left : -left);
                        const supLeft = support.left === true;
                        const x = support.centerX + (supLeft ? sin * r : -sin * r);
                        const y = support.centerY + (supLeft ? -cos * r : cos * r);
                        const p = point || {};
                        tf.transform(x, y, p);
                        p.phi = (mirrored ? -(this.#increasingX ? phi : phi - PI) : (this.#increasingX ? phi : phi - PI)) + tf.rotation;
                        return p;
                    }
                }
                start = end;
            }
        }
        /**
         * Transforms position on curve to point containing x/y location, rotation
         * angle and unit vector on curve. The curve has a length given through it's
         * actual form. If our position is in between zero and the length the result
         * will be a point on the curve. If we are outside the position will be
         * extrapolated linear.
         *
         * @name transform
         * @method
         * @memberof RopeLine.prototype
         * @param {Number}
         *          position The position on the RopeLine
         * @param {Object}
         *          point Optional object for the result
         * @returns {Object} If i_point is defined i_point will be returned.
         *          Otherwise a new object will be returned
         */
        #transform(position, left, point) {
            const parts = this.#parts;
            const fields = this.#fields;
            if (typeof position !== 'number' || parts.length === 0 || fields.length === 0) {
                return false;
            }
            // check if before first segment
            const tf = this.#tf;
            const mirrored = tf.mirrorX !== tf.mirrorY;
            const s1 = parts[0].s1;
            if (position <= s1) {
                const field = fields[0];
                const chain = field.chain;
                let x = field.saddle1x;
                let y = chain.getHeight(x);
                const phi = normalizeRopeAngle(chain.getAngle(x));
                const cos = Math.cos(phi);
                const sin = Math.sin(phi);
                const pos = this.#increasingX === true ? position - s1 : s1 - position;
                x += cos * pos - sin * left;
                y += sin * pos + cos * left;
                const p = point || {};
                tf.transform(x, y, p);
                p.phi = (mirrored ? -phi : phi) + tf.rotation;
                return p;
            }
            // check if behind last segment
            const s2 = parts[parts.length - 1].s2;
            if (position >= s2) {
                const field = fields[fields.length - 1];
                const chain = field.chain;
                let x = field.saddle2x;
                let y = chain.getHeight(x);
                const phi = normalizeRopeAngle(chain.getAngle(x));
                const cos = Math.cos(phi);
                const sin = Math.sin(phi);
                const pos = this.#increasingX === true ? position - s2 : s2 - position;
                x += cos * pos - sin * left;
                y += sin * pos + cos * left;
                const p = point || {};
                tf.transform(x, y, p);
                p.phi = (mirrored ? -phi : phi) + tf.rotation;
                return p;
            }
            // must be in between
            return this.#getPositionOnRopeLine(position, left, point);
        }
        transform(position, left, point) {
            return this.#transform(this.#adjuster.adjust(position), left, point);
        }
        stroke(context, transform, start, end, left) {
            // get the stroke start and end position in curve coordinates
            const adjuster = this.#adjuster;
            let stroke_start = adjuster.adjust(Math.min(start, end));
            let stroke_end = adjuster.adjust(Math.max(start, end));
            // if too short
            if (stroke_end - stroke_start < MIN_STROKE_LENGTH) {
                // nothing more to do
                return;
            }
            const p = this.#p;
            // get the curves start and end position
            const parts = this.#parts;
            const curve_start = parts[0].s1;
            const curve_end = parts[parts.length - 1].s2;
            // first handle stroke parts before actual curve
            if (stroke_start < curve_start) {
                const stroke_end_is_before_curve_start = stroke_end <= curve_start;
                const se = stroke_end_is_before_curve_start ? stroke_end : curve_start;
                if (se - stroke_start > MIN_STROKE_LENGTH) {
                    context.beginPath();
                    this.#transform(stroke_start, left, p);
                    transform.transform(p.x, p.y, p);
                    context.moveTo(p.x, p.y);
                    this.#transform(se, left, p);
                    transform.transform(p.x, p.y, p);
                    context.lineTo(p.x, p.y);
                    context.stroke();
                }
                if (stroke_end_is_before_curve_start) {
                    // nothing more to do
                    return;
                }
                stroke_start = curve_start;
            }
            // next handle parts on actual curve
            if (stroke_start < curve_end) {
                const stroke_end_is_before_curve_end = stroke_end <= curve_end;
                const se = stroke_end_is_before_curve_end ? stroke_end : curve_end;
                if (se - stroke_start > MIN_STROKE_LENGTH) {
                    let start_pos = stroke_start;
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        const s2 = part.s2;
                        if (start_pos < s2) {
                            const is_last = se <= s2;
                            const end_pos = is_last ? se : s2;
                            if (end_pos - start_pos > MIN_STROKE_LENGTH) {
                                this.#getPositionOnRopeLine(start_pos, left, p);
                                const start_phi = p.phi;
                                transform.transform(p.x, p.y, p);
                                const x1 = p.x;
                                const y1 = p.y;
                                context.beginPath();
                                this.#getPositionOnRopeLine(end_pos, left, p);
                                const end_phi = p.phi;
                                transform.transform(p.x, p.y, p);
                                const arc = part.arc;
                                if (arc === false) {
                                    const x2 = p.x;
                                    const y2 = p.y;
                                    context.moveTo(x1, y1);
                                    const field = part.field;
                                    if (field) {
                                        const stress_position = field.vehicle_position;
                                        if (stress_position !== undefined && stress_position > start_pos && stress_position < end_pos) {
                                            this.#getPositionOnRopeLine(stress_position, left, p);
                                            const stress_phi = p.phi;
                                            transform.transform(p.x, p.y, p);
                                            const xs = p.x;
                                            const ys = p.y;
                                            const cnt1 = Math.max(Math.ceil(Math.abs(stress_phi - start_phi) * RAD2DEG), 1);
                                            const delta1 = (stress_position - start_pos) / cnt1;
                                            for (let j = 1; j < cnt1; j++) {
                                                this.#getPositionOnRopeLine(start_pos + delta1 * j, left, p);
                                                transform.transform(p.x, p.y, p);
                                                context.lineTo(p.x, p.y);
                                            }
                                            context.lineTo(xs, ys);
                                            const cnt2 = Math.max(Math.ceil(Math.abs(end_phi - stress_phi) * RAD2DEG), 1);
                                            const delta2 = (end_pos - stress_position) / cnt2;
                                            for (let j = 1; j < cnt2; j++) {
                                                this.#getPositionOnRopeLine(stress_position + delta2 * j, left, p);
                                                transform.transform(p.x, p.y, p);
                                                context.lineTo(p.x, p.y);
                                            }
                                        } else {
                                            const cnt = Math.max(Math.ceil(Math.abs(end_phi - start_phi) * RAD2DEG), 1);
                                            const delta = (end_pos - start_pos) / cnt;
                                            for (let j = 1; j < cnt; j++) {
                                                this.#getPositionOnRopeLine(start_pos + delta * j, left, p);
                                                transform.transform(p.x, p.y, p);
                                                context.lineTo(p.x, p.y);
                                            }
                                        }
                                    }
                                    context.lineTo(x2, y2);
                                } else {
                                    const l = this.#increasingX === false && typeof left === 'number' ? -left : left;
                                    prepareArc(context, transform, p, part, start_pos, end_pos, l, this.#tf);
                                }
                                context.stroke();
                            }
                            start_pos = end_pos;
                            if (is_last) {
                                break;
                            }
                        }
                    }
                }
                if (stroke_end_is_before_curve_end) {
                    // nothing more to do
                    return;
                }
                stroke_start = curve_end;
            }
            // last handle stroke parts behind actual curve
            if (stroke_end - stroke_start > MIN_STROKE_LENGTH) {
                context.beginPath();
                this.#transform(stroke_start, 0.0, p);
                transform.transform(p.x, p.y, p);
                context.moveTo(p.x, p.y);
                this.#transform(stroke_end, 0.0, p);
                transform.transform(p.x, p.y, p);
                context.lineTo(p.x, p.y);
                context.stroke();
            }
        }
    }

    function setOffset(offset, point) {
        let x = 0.0;
        if (typeof offset === 'number') {
            x = offset;
        } else if (offset !== null && typeof offset === 'object' && typeof offset.offset === 'number') {
            x = offset.offset;
        }
        let y = 0.0;
        if (offset !== null && typeof offset === 'object') {
            if (typeof offset.left === 'number') {
                y = offset.left;
            } else if (typeof offset.right === 'number') {
                y = -offset.right;
            }
        }
        if (point) {
            point.x = x;
            point.y = y;
            return point;
        } else {
            return { x, y };
        }
    };

    const TEN_POINT_ZERO = 10.0;
    const FIFE_POINT_ZERO = 5.0;
    const TWO_POINT_ZERO = 2.0;
    const ONE_POINT_ZERO = 1.0;
    const ZERO_POINT_FIFE = 0.5;
    const ZERO_POINT_TWO = 0.2;
    const ZERO_POINT_ONE = 0.1;
    function getFiscIterDiff(i_minDiff) {
        const minDiff = Math.abs(i_minDiff);
        if (minDiff <= 1.0e-300 || minDiff >= 1.0e+300 || isNaN(minDiff)) {
            return 0.0;
        }
        let diff = ONE_POINT_ZERO;
        if (minDiff > diff) {
            for (let i = 0; i < 300; i++) {
                const diff2 = diff * TWO_POINT_ZERO;
                if (minDiff <= diff2) {
                    return diff2;
                }
                const diff5 = diff * FIFE_POINT_ZERO;
                if (minDiff <= diff5) {
                    return diff5;
                }
                const diff10 = diff * TEN_POINT_ZERO;
                if (minDiff <= diff10) {
                    return diff10;
                }
                diff = diff10;
            }
        } else {
            for (let i = 0; i < 300; i++) {
                const diff5 = diff * ZERO_POINT_FIFE;
                if (minDiff > diff5) {
                    return diff;
                }
                const diff2 = diff * ZERO_POINT_TWO;
                if (minDiff > diff2) {
                    return diff5;
                }
                const diff10 = diff * ZERO_POINT_ONE;
                if (minDiff > diff10) {
                    return diff2;
                }
                diff = diff10;
            }
        }
        return 0.0;
    };

    class DiscretizationIterator {
        #diff;
        #start;
        #count;
        #max;
        #raising;
        constructor() {
            this.#diff = 0.0;
            this.#start = 0.0;
            this.#count = 0;
            this.#max = 0;
            this.#raising = true;
        }
        init(difference, start, end, forceMetricDiff) {
            const fmd = forceMetricDiff === true;
            this.#diff = fmd ? getFiscIterDiff(difference) : Math.abs(difference);
            if (this.#diff <= 0.0 || isNaN(this.#diff)) {
                this.#diff = 0;
                this.#start = 0;
                this.#count = 0;
                this.#max = 0;
            } else {
                this.#raising = start < end;
                this.#start = fmd ? ((this.#raising ? Math.ceil(start / this.#diff) : Math.floor(start / this.#diff)) * this.#diff) : start;
                const e = fmd ? ((this.#raising ? Math.floor(end / this.#diff) : Math.ceil(end / this.#diff)) * this.#diff) : end;
                const range = this.#raising ? e - this.#start : this.#start - e;
                this.#count = 0;
                this.#max = Math.ceil(range / this.#diff);
            }
        }
        hasNext() {
            return this.#count <= this.#max;
        }
        getNext() {
            const offset = this.#diff * this.#count;
            const value = this.#raising ? this.#start + offset : this.#start - offset;
            this.#count++;
            return value;
        }
    }

    const NONE = 0x0;
    const NORTH = 0x1;
    const WEST = 0x2;
    const SOUTH = 0x4;
    const EAST = 0x8;

    class Maze {
        #cells;
        #list;
        constructor() {
            this.width = 0;
            this.height = 0;
            this.#cells = [];
            this.#list = [];
        }
        cell(x, y) {
            return this.#cells[y * this.width + x];
        }
        prepare(i_width, i_height) {
            // set the dimension
            this.width = i_width;
            this.height = i_height;

            // clear
            const cells = this.#cells;
            cells.splice(0, cells.length);
            this.#list.splice(0, this.#list.length);

            // if invalid
            if (i_width <= 0 || i_height <= 0) {
                // nothing more to do
                return;
            }
            // Fill the maze with walls
            for (let y = 0; y < i_height; y++) {
                for (let x = 0; x < i_width; x++) {
                    cells[y * i_width + x] = {
                        x,
                        y,
                        east: true,
                        west: true,
                        south: true,
                        north: true,
                        visited: false
                    };
                }
            }
            this.#carveMaze(Math.floor(i_width / 2), Math.floor(i_height / 2));
            for (let x = 0; x < i_width; x++) {
                for (let y = 0; y < i_height; y++) {
                    const cell = cells[y * i_width + x];
                    if (!cell.visited) {
                        console.error('EXCEPTION! Unvisited cell at ' + x + ', ' + y);
                    }
                }
            }
        }
        #carveMaze(x, y) {
            const cells = this.#cells;
            const list = this.#list;
            const width = this.width;
            // add the middle cell to the stack
            list.push(cells[y * width + x]);

            // here we store the last index
            let xIdx, yIdx, type, last = 0;

            // while the stack is not empty
            while ((last = list.length - 1) >= 0) {
                // get the last cell in the stack
                let cell = list[last];

                // set visited
                cell.visited = true;

                // store the coordinates
                xIdx = cell.x;
                yIdx = cell.y;

                // get the next valid random neighbor cell type
                type = this.#getRandomValidCellNeighbour(xIdx, yIdx);

                // depending on the neighbor
                switch (type) {
                    case NORTH: {
                        cell.north = false;
                        yIdx--;
                        cell = cells[yIdx * width + xIdx];
                        cell.south = false;
                        list.push(cell);
                        break;
                    }
                    case SOUTH: {
                        cell.south = false;
                        yIdx++;
                        cell = cells[yIdx * width + xIdx];
                        cell.north = false;
                        list.push(cell);
                        break;
                    }
                    case WEST: {
                        cell.west = false;
                        xIdx--;
                        cell = cells[yIdx * width + xIdx];
                        cell.east = false;
                        list.push(cell);
                        break;
                    }
                    case EAST: {
                        cell.east = false;
                        xIdx++;
                        cell = cells[yIdx * width + xIdx];
                        cell.west = false;
                        list.push(cell);
                        break;
                    }
                    case NONE:
                    default: {
                        list.splice(last, 1);
                        break;
                    }
                }
            }
        }
        #getRandomValidCellNeighbour(x, y) {
            // here we store the number
            let cnt = 0;
            const cells = this.#cells;
            const width = this.width;
            const height = this.height;
            // Above
            if (y > 0 && !cells[(y - 1) * width + x].visited) {
                cnt++;
            }
            // Below
            if (y < height - 1 && !cells[(y + 1) * width + x].visited) {
                cnt++;
            }
            // Right
            if (x < width - 1 && !cells[y * width + x + 1].visited) {
                cnt++;
            }
            // Left
            if (x > 0 && !cells[y * width + x - 1].visited) {
                cnt++;
            }
            // if no unvisited available
            if (cnt == 0) {
                return NONE;
            }
            // select index by random
            const idx = cnt > 1 ? Math.floor(Math.random() * cnt) : 0;

            // reset counter
            cnt = 0;

            // Above
            if (y > 0 && !cells[(y - 1) * width + x].visited) {
                if (cnt == idx) {
                    return NORTH;
                }
                cnt++;
            }
            // Below
            if (y < height - 1 && !cells[(y + 1) * width + x].visited) {
                if (cnt == idx) {
                    return SOUTH;
                }
                cnt++;
            }
            // Right
            if (x < width - 1 && !cells[y * width + x + 1].visited) {
                if (cnt == idx) {
                    return EAST;
                }
                cnt++;
            }
            // Left
            if (x > 0 && !cells[y * width + x - 1].visited) {
                if (cnt == idx) {
                    return WEST;
                }
                cnt++;
            }
            return NONE;
        }
    }

    // helper class
    class WeightedGraphNode {
        constructor() {
            this._nodeObject = undefined;
            this._predecessorNode = undefined;
            this._distanceToStartNode = undefined;
            this._edges = [];
            this._visited = false;
        }
        // reset
        _reset() {
            // reset the members
            this._nodeObject = undefined;
            this._predecessorNode = undefined;
            this._visited = false;
            this._distanceToStartNode = 0.0;
            this._edges.splice(0, this._edges.length);
        }
        _getEdgeToNode(node) {
            // for all edges
            for (let i = 0; i < this._edges.length; i++) {
                // get the edge
                const edge = this._edges[i];
                // get the opposite node
                const n = edge._getOppositeNode(this);
                // if identical
                if (n === node) {
                    // return the edge
                    return edge;
                }
            }
            // not found
            return undefined;
        }
    }

    // helper class
    class WeightedGraphEdge {
        constructor() {
            this._edgeObject = undefined;
            this._node1 = undefined;
            this._node2 = undefined;
            this._length = 0.0;
            this._virtual = false;
        }
        // initialize
        _init(i_virtual, i_userEdge, i_node0, i_node1, i_length) {
            this._virtual = i_virtual;
            this._edgeObject = i_userEdge;
            this._node1 = i_node0;
            this._node2 = i_node1;
            this._length = i_length;
        }
        _reset() {
            this._edgeObject = undefined;
            this._node1 = undefined;
            this._node2 = undefined;
            this._length = 0.0;
            this._virtual = false;
        }
        _getOppositeNode(i_node) {
            // if given is identical to first
            if (this._node1 === i_node) {
                // return second
                return this._node2;
            }

            // if given is identical to second
            else if (this._node2 === i_node) {
                // return first
                return this._node1;
            }

            // given node is not part of this edge
            else {
                // no opposite node available
                return undefined;
            }
        }
    }

    class WeightedGraph {
        #startNode;
        #endNode;
        #list;
        #edges;
        #nodes;
        #nodePool;
        #edgePool;
        #nodeCount;
        #edgeCount;
        #isValidPath;
        constructor() {
            this.#startNode = undefined;
            this.#endNode = undefined;
            this.#list = [];
            this.#edges = [];
            this.#nodes = [];
            this.#nodePool = new Utilities.DynamicList(() => new WeightedGraphNode());
            this.#edgePool = new Utilities.DynamicList(() => new WeightedGraphEdge());
            this.#nodeCount = 0;
            this.#edgeCount = 0;
            this.#isValidPath = undefined;
        }
        clear() {
            // clear the lists
            this.#list.splice(0, this.#list.length);
            this.#edges.splice(0, this.#edges.length);
            this.#nodes.splice(0, this.#nodes.length);
            // for all nodes
            for (let i = 0; i < this.#nodeCount; i++) {
                // reset
                this.#nodePool.get(i)._reset();
            }
            // reset
            this.#nodeCount = 0;
            // for all edges
            for (let i = 0; i < this.#edgeCount; i++) {
                // reset
                this.#edgePool.get(i)._reset();
            }
            // reset
            this.#edgeCount = 0;
            this.#startNode = undefined;
            this.#endNode = undefined;
        }
        setPathValidator(i_isValidPath) {
            this.#isValidPath = i_isValidPath;
        }
        destroy() {
            // clear all data
            this.clear();
            // clear the lists
            this.#edgePool.clear();
            this.#nodePool.clear();
            // reset
            this.#nodeCount = 0;
            this.#edgeCount = 0;
            this.#isValidPath = undefined;
            this.#startNode = undefined;
            this.#endNode = undefined;
        }
        /**
         * Add a path
         *
         * @param edge
         *          The path object (must not be undefined)
         * @param node1
         *          The start node (must not be undefined)
         * @param node2
         *          The end node (must not be undefined)
         * @param i_lengthThe
         *          path length (must be bigger than zero)
         * @return true is valid and added
         */
        addEdge(edge, node1, node2, length) {
            // if invalid
            if (node1 === undefined || node2 === undefined || length < 0.0) {
                // cannot add
                return false;
            }
            // if identical objects
            if (node1 === node2) {
                // cannot add
                return false;
            }
            // add the edge
            this.#prepareEdge(false, edge, node1, node2, length);

            // success
            return true;
        }
        /**
         * This method can be used
         *
         * @param node1
         * @param node2
         * @return
         */
        addVirtualEdge(node1, node2, length) {
            // if invalid
            if (node1 === undefined || node2 === undefined) {
                // cannot add
                return false;
            }
            // depending on the mode
            // if identical nodes
            if (node1 === node2) {
                // cannot add
                return false;
            }
            // for all currently available edges
            for (let i = 0; i < this.#edgeCount; i++) {
                // get the edge
                const edge = this.#edgePool.get(i);
                // if a virtual edge
                if (edge._virtual) {
                    // if identical start and end
                    if (edge._node1._nodeObject == node1 && edge._node2._nodeObject == node2) {
                        // cannot add
                        return false;
                    }
                    // if inverse identical start and end
                    if (edge._node2._nodeObject == node2 && edge._node1._nodeObject == node1) {
                        // cannot add
                        return false;
                    }
                }
            }
            // add the edge
            this.#prepareEdge(true, undefined, node1, node2, length);
            // success
            return true;
        }
        #getNode(nodeObject) {
            // for all stored nodes
            for (let i = 0; i < this.#nodeCount; i++) {
                // get the node
                const node = this.#nodePool.get(i);
                // if identical node object
                if (node._nodeObject === nodeObject) {
                    // return the node
                    return node;
                }
            }
            // get the next node
            const node = this.#nodePool.get(this.#nodeCount++);
            // set object
            node._nodeObject = nodeObject;
            // return the node
            return node;
        }
        #prepareEdge(virtual, userEdge, userNode1, userNode2, length) {
            // get the next edge
            const edge = this.#edgePool.get(this.#edgeCount++);
            // get the nodes
            const node1 = this.#getNode(userNode1);
            const node2 = this.#getNode(userNode2);
            // initialize edge
            edge._init(virtual, userEdge, node1, node2, length);
            // add edge to nodes
            node1._edges.push(edge);
            node2._edges.push(edge);
        }
        /**
         * This method tries to find the shortest path from the start to the end
         * node. If the end node is undefined, the algorithm walks to all reachable
         * node and stores the distance from the start node.
         *
         * @param i_start
         *          The start node
         * @param i_end
         *          The end node (may be undefined)
         * @return The shortest path if available
         */
        computePath(startNode, endNode) {
            // clear the lists
            this.#list.splice(0, this.#list.length);
            this.#edges.splice(0, this.#edges.length);
            this.#nodes.splice(0, this.#nodes.length);

            // ////////////////////////////////////////////////////////////////////////////
            // This is an implementation of the Dijkstra algorithm.
            //
            // In the first step we iterate over all nodes, initialize them and try
            // to
            // find the start and the end node.
            // ////////////////////////////////////////////////////////////////////////////
            // here we store the start and the end node
            this.#startNode = undefined;
            this.#endNode = undefined;
            // for all currently stored nodes
            for (let i = 0; i < this.#nodeCount; i++) {
                // get the node
                const node = this.#nodePool.get(i);
                // reset
                node._predecessorNode = undefined;
                node._visited = false;
                node._distanceToStartNode = -1.0;
                // if identical to start node
                if (node._nodeObject === startNode) {
                    // set start node
                    this.#startNode = node;
                }
                // if identical to end node
                else if (endNode !== undefined && node._nodeObject === endNode) {
                    // set end node
                    this.#endNode = node;
                }
            }
            // if start node not available
            if (this.#startNode === undefined) {
                // no path available
                return;
            }
            // ////////////////////////////////////////////////////////////////////////////
            // In the following loop we iterate over all nodes reachable from the
            // start
            // node.
            // We set the edge length as distance to the start node, set the start
            // node
            // as previous node and add the node to the working list.
            // ////////////////////////////////////////////////////////////////////////////
            // initialize start node
            this.#startNode._distanceToStartNode = 0;
            this.#startNode._visited = true;
            // for all edges of the start node
            for (let i = 0; i < this.#startNode._edges.length; i++) {
                // get the edge
                const edge = this.#startNode._edges[i];
                // get the opposite node
                const node = edge._getOppositeNode(this.#startNode);
                // if valid path
                if (typeof this.#isValidPath !== 'function' || this.#isValidPath(undefined, undefined, this.#startNode._nodeObject, edge._edgeObject, node._nodeObject)) {
                    // set the distance
                    node._distanceToStartNode = edge._length >= 0.0 ? edge._length : 0.0;
                    // set the predecessor node
                    node._predecessorNode = this.#startNode;
                    // add to the list
                    this.#list.push(node);
                }
            }
            // ////////////////////////////////////////////////////////////////////////////
            // Now we are prepared for the actual Dijkstra algorithm.
            //
            // Our working list contains all neighbors from our start node.
            // ////////////////////////////////////////////////////////////////////////////
            // loop while list is not empty
            while (this.#list.length > 0) {
                // ////////////////////////////////////////////////////////////////////////////
                // In the following iteration we search the node not already visited
                // and
                // with the smallest distance to the start node.
                // ////////////////////////////////////////////////////////////////////////////
                // here we store the closest node
                let closestNode = undefined;
                let closestNodeIdx = -1;
                // for all nodes in the working list
                for (let i = 0; i < this.#list.length; i++) {
                    // get the node
                    const node = this.#list[i];
                    // if the node has not been visited before and its the first or
                    // closer
                    // than the last
                    if (!node._visited && (closestNode === undefined || node._distanceToStartNode < closestNode._distanceToStartNode)) {
                        // set closest node
                        closestNode = node;
                        closestNodeIdx = i;
                    }
                }
                // if not available
                if (closestNode === undefined) {
                    // terminate loop
                    break;
                }
                // set visited
                closestNode._visited = true;
                // remove from the list
                this.#list.splice(closestNodeIdx, 1);
                // ////////////////////////////////////////////////////////////////////////////
                // If the closest node is the one we try to reach we are ready.
                // ////////////////////////////////////////////////////////////////////////////
                // if equal to end node
                if (this.#endNode !== undefined && closestNode === this.#endNode) {
                    // terminate loop
                    break;
                }
                // ////////////////////////////////////////////////////////////////////////////
                // The next iteration realizes what Dijkstra called the "Update".
                //
                // We iterate over all neighbor nodes of the next node.
                // If we already visited a neighbor, we ignore the node.
                // If the neighbor has no previous node we set the current node to the
                // predecessor and set the distance.
                // If the neighbor is already a successor we check if the distance
                // would
                // be
                // less if we walk over the current node. If this is true the neighbor
                // will be updated by setting the predecessor node to the current and
                // resetting the distance.
                // ////////////////////////////////////////////////////////////////////////////
                // for all edges of this node
                for (let i = 0; i < closestNode._edges.length; i++) {
                    // get the edge
                    const edge = closestNode._edges[i];
                    // get the opposite node
                    const node = edge._getOppositeNode(closestNode);
                    // if visited before
                    if (node._visited) {
                        // ignore this node
                        continue;
                    }
                    // if invalid
                    if (typeof this.#isValidPath === 'function') {
                        // get the predecessor node
                        const predecessorNode = closestNode._predecessorNode;
                        // get the edge
                        const predecessorEdge = closestNode._getEdgeToNode(predecessorNode);
                        // if not valid
                        if (!this.#isValidPath(predecessorNode._nodeObject, predecessorEdge._edgeObject, closestNode._nodeObject, edge._edgeObject, node._nodeObject)) {
                            // ignore this node
                            continue;
                        }
                    }
                    // compute the distance
                    let distance = closestNode._distanceToStartNode;
                    // if not a virtual edge
                    if (edge._length > 0.0) {
                        // add the edge length
                        distance += edge._length;
                    }
                    // if the node is not already a successor
                    if (node._predecessorNode === undefined) {
                        // set the distance and the predecessor
                        node._distanceToStartNode = distance;
                        node._predecessorNode = closestNode;
                    }
                    // if less distance
                    else if (distance < node._distanceToStartNode) {
                        // update distance and predecessor
                        node._distanceToStartNode = distance;
                        node._predecessorNode = closestNode;
                    }
                    // add node to list
                    this.#list.push(node);
                }
            }
            // ////////////////////////////////////////////////////////////////////////////
            // The main loop has been terminated because of three reasons:
            // 1. No more nodes available, means that the required end nod is
            // unreachable from the start node.
            // 2. No closest node found (should not occur but we must check this).
            // 3. Closest node is identical to end node (that's the one we are
            // looking
            // for). In that case the end node has a predecessor node!
            // ////////////////////////////////////////////////////////////////////////////
            // clear the list
            this.#list.splice(0, this.#list.length);
            // if an end node is available
            if (this.#endNode !== undefined) {
                // prepare edges
                this.#prepareEdgesToEndNode();
                // prepare nodes
                this.#prepareNodesToEndNode();
            }
        }
        addReachableNodes(array) {
            // if a start node is available
            if (this.#startNode !== undefined) {
                // for all currently stored nodes
                for (let i = 0; i < this.#nodeCount; i++) {
                    // get the node
                    const node = this.#nodePool.get(i);
                    // if visited and not the start node
                    if (node !== this.#startNode && node._visited) {
                        // add
                        array.push(node._nodeObject);
                    }
                }
            }
        }
        selectClosestNode() {
            return this.#selectNode(true);
        }
        selectFarestNode() {
            return this.#selectNode(false);
        }
        #selectNode(closest) {
            // reset
            this.#edges.splice(0, this.#edges.length);
            this.#nodes.splice(0, this.#nodes.length);
            this.#endNode = undefined;
            // for all currently stored nodes
            for (let i = 0; i < this.#nodeCount; i++) {
                // get the node
                const node = this.#nodePool.get(i);
                // visited first or closer
                if (node._visited && (this.#endNode === undefined || (closest ? node._distanceToStartNode < this.#endNode._distanceToStartNode : node._distanceToStartNode > this.#endNode._distanceToStartNode))) {
                    // update
                    this.#endNode = node;
                }
            }
            // if found
            if (this.#endNode !== undefined) {
                // prepare
                this.#prepareEdgesToEndNode();
                this.#prepareNodesToEndNode();
            }
            // return true if node available
            return this.#endNode !== undefined;
        }
        selectEndNode(node) {
            // clear list
            this.#edges.splice(0, this.#edges.length);
            this.#nodes.splice(0, this.#nodes.length);
            this.#endNode = undefined;
            // if not available
            if (node === undefined) {
                // not selectable
                return false;
            }
            // for all currently stored nodes
            for (let i = 0; i < this.#nodeCount && this.#endNode === undefined; i++) {
                // get the node
                const n = this.#nodePool.get(i);
                // if identical to start node
                if (n._nodeObject === node) {
                    // set end node
                    this.#endNode = n;
                }
            }
            // if not found
            if (this.#endNode === undefined) {
                // not selectable
                return false;
            }
            // if not visited
            if (!this.#endNode._visited) {
                // reset
                this.#endNode = undefined;
                // not selectable
                return false;
            }
            // prepare the edges
            this.#prepareEdgesToEndNode();
            this.#prepareNodesToEndNode();
            // success
            return true;
        }
        #prepareEdgesToEndNode() {
            // clear
            this.#edges.splice(0, this.#edges.length);
            // store the node for the following iteration
            let node = this.#endNode;
            // while predecessor available
            while (node._predecessorNode !== undefined) {
                // get the edge
                const edge = node._getEdgeToNode(node._predecessorNode);
                // if available
                if (edge !== undefined && edge._edgeObject !== undefined) {
                    // add to the list
                    this.#edges.push(edge._edgeObject);
                }
                // get the predecessor
                node = node._predecessorNode;
            }
        }
        #prepareNodesToEndNode() {
            // clear
            this.#nodes.splice(0, this.#nodes.length);
            // store the node for the following iteration
            let node = this.#endNode;
            // while available
            while (node !== undefined) {
                this.#nodes.push(node._nodeObject);
                // get the predecessor
                node = node._predecessorNode;
            }
        }
        getStartNode() {
            return this.#startNode !== undefined ? this.#startNode._nodeObject : undefined;
        }
        isEndNodeReachable() {
            return this.#endNode !== undefined && this.#endNode._visited;
        }
        getEndNode() {
            return this.#endNode !== undefined ? this.#endNode._nodeObject : undefined;
        }
        getDistance() {
            return this.#endNode !== undefined ? this.#endNode._distanceToStartNode : -1.0;
        }
        getEdgesCount() {
            return this.#edges.length;
        }
        getEdge(i_index) {
            return this.#edges[this.#edges.length - 1 - i_index];
        }
        getNodesCount() {
            return this.#nodes.length;
        }
        getNode(i_index) {
            return this.#nodes[this.#nodes.length - 1 - i_index];
        }
    }

    const exp = Object.freeze({
        THIRD,
        TWO_PI,
        HALF_PI,
        QUARTER_PI,
        RAD2DEG,
        DEG2RAD,
        GOLDEN_CUT,
        GOLDEN_CUT_INVERTED,
        SPECIFIC_GRAVITY_OF_STEEL,
        EARTH_GRAVITATION,
        sinh,
        cosh,
        asinh,
        acosh,
        createBiomialCoefficients,
        getSmoothNormalizedTransfer,
        normalizeToPlusMinusPI,
        normalizeToPlusMinus180deg,
        getHarmonicRGB,
        Transform,
        Adjuster,
        getArc,
        ArcLine,
        CurveSection,
        ChainFunction,
        RopeLine,
        setOffset,
        DiscretizationIterator,
        Maze,
        WeightedGraph,
        toBool: value => value === true,
        toS8: value => {
            // 8 bit signed
            const val = Math.floor(value) & 0xff;
            return (val & 0x80) === 0x80 ? val - 0x100 : val;
        },
        toU8: value => Math.floor(value) & 0xff,
        toS16: value => {
            // 16 bit signed
            const val = Math.floor(value) & 0xffff;
            return (val & 0x8000) === 0x8000 ? val - 0x10000 : val;
        },
        toU16: value => Math.floor(value) & 0xffff,
        toS32: value => {
            // 32 bit signed
            const val = Math.floor(value) & 0xffffffff;
            return (val & 0x80000000) === 0x80000000 ? val - 0x100000000 : val;
        },
        toU32: value => {
            // 32 bit unsigned
            const val = Math.floor(value) & 0xffffffff;
            return (val & 0x80000000) === -0x80000000 ? val + 0x100000000 : val;
        },
        getS32bit: (value, bit) => {
            const mask = 1 << (bit % 32);
            return (value & mask) === mask;
        },
    });
    if (isNodeJS) {
        module.exports = exp;
    } else {
        root.Mathematics = exp;
    }
}(globalThis));
