/**
 * math.js
 * 
 * Math is a JavaScript implementation of several mathematical mechanisms like
 * transformation, curve handling and several other stuff,
 * 
 * Author: Markus Hardardt <markus.hardardt@gmx.ch>
 */
(function (root) {
  "use strict";

  var PI = Math.PI;
  var TWO_PI = PI + PI;
  var HALF_PI = PI * 0.5;
  var THREE_HALF_PI = PI + HALF_PI;
  var QUARTER_PI = PI * 0.25;
  var THREE_QUARTER_PI = PI * 0.75;
  var THIRD_PI = PI / 3;
  var RAD2DEG = 180.0 / PI;
  var DEG2RAD = PI / 180.0;
  var MINIMUM_FLAT_ANGLE = DEG2RAD;
  var MAXIMUM_SHARP_ANGLE = PI - DEG2RAD;
  var THIRD = 1.0 / 3.0;
  var FOUR_THIRD = 4.0 * THIRD;
  var MIN_LENGTH2 = 0.000001;
  var MIN_DENOMINATOR = 0.000000001;
  var EPSILON = 0.000000001;
  var MIN_STROKE_LENGTH = 0.001;

  // [kg/m^3]
  var SPECIFIC_GRAVITY_OF_STEEL = 7860.0;
  // [m/s^2]
  var EARTH_GRAVITATION = 9.80665;

  // this is the solution of the equation 1/x+1=x
  // [or more classic: a/(a+b) = b/a]
  var GOLDEN_CUT = (1.0 + Math.sqrt(5.0)) * 0.5;
  var GOLDEN_CUT_INVERTED = 1.0 / GOLDEN_CUT;
  var DEFAULT_STRESS_S1 = 0.3;
  var DEFAULT_STRESS_S2 = 0.9;

  var sinh = Math.sinh || function (i_value) {
    var exp = Math.exp(i_value);
    return (exp - 1.0 / exp) * 0.5;
  };

  var cosh = Math.cosh || function (i_value) {
    var exp = Math.exp(i_value);
    return (exp + 1.0 / exp) * 0.5;
  };

  var asinh = Math.asinh || function (i_value) {
    return Math.log(i_value + Math.sqrt(i_value * i_value + 1));
  };

  var acosh = Math.acosh || function (i_value) {
    return Math.log(i_value + Math.sqrt(i_value * i_value - 1));
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
   * /JptApp/src/org/har/jpt/util/math/MathExt.java
   */
  function fn_create_biomial_coefficients(i_maxN) {
    // if too much
    if (i_maxN < 0 || i_maxN >= 68) {
      // notify
      throw new Error("Invalid value: " + i_maxN);
    }
    // create a new matrix for the values
    var bicos = [];

    // for all rows
    for (var i = 0; i <= i_maxN; i++) {
      // create a new array
      bicos[i] = [];
      // long[i + 1];
    }
    // set the first value
    bicos[0][0] = 1;

    // for all rows
    for (var i = 1; i <= i_maxN; i++) {
      // set first and last value
      bicos[i][0] = 1;
      bicos[i][i] = 1;

      // for all row elements
      for (var j = 1; j < i_maxN; j++) {
        // set to the sum
        bicos[i][j] = bicos[i - 1][j - 1] + bicos[i - 1][j];
      }
    }
    // return the coefficients
    return bicos;
  }

  function fn_get_smooth_normalized_transfer(i_s, i_s1, i_s2) {
    // get the parameters first
    var s = typeof i_s === 'number' ? Math.abs(i_s) : 0.0;
    var p1 = typeof i_s1 === 'number' ? i_s1 : 0.0;
    var p2 = typeof i_s2 === 'number' ? i_s2 : 1.0;
    var s1 = Math.max(Math.min(Math.min(p1, p2), 1.0), 0.0);
    var s2 = Math.max(Math.min(Math.max(p1, p2), 1.0), 0.0);
    // then decide what to return
    if (s1 === 0.0) {
      if (s2 === 0.0) {
        // #6
        if (s < 1.0) {
          var ds = (s - 1.0);
          return ds * ds;
        }
        else {
          return 0.0;
        }
      }
      else if (s2 < 1.0) {
        // #3
        var d = 1.0 / ((-s2 - 1.0) * (s2 - 1.0));
        if (s <= s2) {
          return 2.0 * d * (s2 - 1.0) * s + 1.0;
        }
        else if (s < 1.0) {
          var ds = (s - 1.0);
          return d * ds * ds;
        }
        else {
          return 0.0;
        }
      }
      else {
        // #5
        if (s < 1.0) {
          return 1.0 - s;
        }
        else {
          return 0.0;
        }
      }
    }
    else if (s1 < 1.0) {
      if (s1 === s2) {
        // #4
        if (s <= s1) {
          return 1.0 - s * s / s1;
        }
        else if (s < 1.0) {
          var ds = s - 1.0;
          return ds * ds / (1.0 - s1);
        }
        else {
          return 0.0;
        }
      }
      else if (s2 < 1.0) {
        // #1
        var d = 1.0 / ((s1 - s2 - 1.0) * (s2 - 1.0));
        var a = d * (1.0 - s2) / s1;
        if (s < s1) {
          return 1.0 - a * s * s;
        }
        else if (s <= s2) {
          return 2.0 * d * (s2 - 1.0) * s + a * s1 * s1 + 1.0;
        }
        else if (s < 1.0) {
          var ds = (s - 1.0);
          return d * ds * ds;
        }
        else {
          return 0.0;
        }
      }
      else {
        // #2
        if (s <= s1) {
          return 1.0 - s * s / (s1 * (2.0 - s1));
        }
        else if (s < 1.0) {
          var ds = s - 1.0;
          return -2.0 * ds / (2.0 - s1);
        }
        else {
          return 0.0;
        }
      }
    }
    else {
      // #7
      if (s < 1.0) {
        return 1.0 - s * s;
      }
      else {
        return 0.0;
      }
    }
  }

  function normalizeToPlusMinusPI(i_phi) {
    var phi = i_phi;
    while (phi > PI) {
      phi -= TWO_PI;
    }
    while (phi <= -PI) {
      phi += TWO_PI;
    }
    return phi;
  }

  function normalizeToPlusMinus180deg(i_angle) {
    var angle = i_angle;
    while (angle > 180) {
      angle -= 360;
    }
    while (angle <= -180) {
      angle += 360;
    }
    return angle;
  }

  var fn_copy_transform = function (i_target, i_source) {
    i_target.d00 = i_source.d00;
    i_target.d01 = i_source.d01;
    i_target.x = i_source.x;
    i_target.d10 = i_source.d10;
    i_target.d11 = i_source.d11;
    i_target.y = i_source.y;
    i_target.i00 = i_source.i00;
    i_target.i01 = i_source.i01;
    i_target.i02 = i_source.i02;
    i_target.i10 = i_source.i10;
    i_target.i11 = i_source.i11;
    i_target.i12 = i_source.i12;
    i_target.scale = i_source.scale;
    i_target.rotation = i_source.rotation;
    i_target.mirrorX = i_source.mirrorX;
    i_target.mirrorY = i_source.mirrorY;
  };

  var Transform = function () {
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
  };

  Transform.prototype = {
    setToIdentity: function () {
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
    },
    init: function (i_transform) {
      // could use this but to reduce function calls we perform directly ...
      // fn_copy_transform(this, i_transform);
      this.d00 = i_transform.d00;
      this.d01 = i_transform.d01;
      this.x = i_transform.x;
      this.d10 = i_transform.d10;
      this.d11 = i_transform.d11;
      this.y = i_transform.y;
      this.i00 = i_transform.i00;
      this.i01 = i_transform.i01;
      this.i02 = i_transform.i02;
      this.i10 = i_transform.i10;
      this.i11 = i_transform.i11;
      this.i12 = i_transform.i12;
      this.scale = i_transform.scale;
      this.rotation = i_transform.rotation;
      this.mirrorX = i_transform.mirrorX;
      this.mirrorY = i_transform.mirrorY;
      return this;
    },
    setScale: function (i_scale) {
      this.d00 *= i_scale;
      this.d01 *= i_scale;
      this.d10 *= i_scale;
      this.d11 *= i_scale;
      this.scale *= i_scale;
      // compute inverse
      this.i00 /= i_scale;
      this.i01 /= i_scale;
      this.i02 /= i_scale;
      this.i10 /= i_scale;
      this.i11 /= i_scale;
      this.i12 /= i_scale;
      return this;
    },
    translate: function (i_translateX, i_translateY) {
      // add the rotated and scaled translation vector
      this.x += this.d00 * i_translateX + this.d01 * i_translateY;
      this.y += this.d10 * i_translateX + this.d11 * i_translateY;
      // handle inverse
      this.i02 -= i_translateX;
      this.i12 -= i_translateY;
      return this;
    },
    rotate: function (i_phi, i_mirrorX, i_mirrorY) {
      var nmx = i_mirrorX === true;
      var nmy = i_mirrorY === true;
      var mx = this.mirrorX;
      var my = this.mirrorY;
      this.mirrorX = mx !== nmx;
      this.mirrorY = my !== nmy;
      var d00 = this.d00;
      var d01 = this.d01;
      var d10 = this.d10;
      var d11 = this.d11;
      var m00, m01, m10, m11;
      if (i_phi !== 0.0) {
        var sin = Math.sin(i_phi);
        var cos = Math.cos(i_phi);
        this.rotation += mx === my ? i_phi : -i_phi;
        m00 = nmx ? -(cos * d00 + sin * d01) : cos * d00 + sin * d01;
        m01 = nmy ? -(-sin * d00 + cos * d01) : -sin * d00 + cos * d01;
        m10 = nmx ? -(cos * d10 + sin * d11) : cos * d10 + sin * d11;
        m11 = nmy ? -(-sin * d10 + cos * d11) : -sin * d10 + cos * d11;
      }
      else {
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
      var det = m00 * m11 - m01 * m10;
      this.i00 = m11 / det;
      this.i10 = -m10 / det;
      this.i01 = -m01 / det;
      this.i11 = m00 / det;
      var m02 = this.x;
      var m12 = this.y;
      this.i02 = (m01 * m12 - m11 * m02) / det;
      this.i12 = (m10 * m02 - m00 * m12) / det;
      return this;
    },
    concatenate: function (i_transform) {
      // does: [this] = [this] x [Tx]
      var d00 = this.d00;
      var d01 = this.d01;
      var d10 = this.d10;
      var d11 = this.d11;
      var t00 = i_transform.d00;
      var t01 = i_transform.d01;
      var t02 = i_transform.x;
      var t10 = i_transform.d10;
      var t11 = i_transform.d11;
      var t12 = i_transform.y;

      this.d00 = d00 * t00 + d01 * t10;
      this.d01 = d00 * t01 + d01 * t11;
      this.x += d00 * t02 + d01 * t12;

      this.d10 = d10 * t00 + d11 * t10;
      this.d11 = d10 * t01 + d11 * t11;
      this.y += d10 * t02 + d11 * t12;

      this.scale *= i_transform.scale;

      var nmx = i_transform.mirrorX;
      var nmy = i_transform.mirrorY;
      var mx = this.mirrorX;
      var my = this.mirrorY;
      // adjust the rotation depending on our current mirroring situation ...
      this.rotation += mx === my ? i_transform.rotation : -i_transform.rotation;
      // ... and update the mirroring flags afterwards (!!!)
      this.mirrorX = mx !== nmx;
      this.mirrorY = my !== nmy;

      // compute the inverted parameters
      var i00 = this.i00;
      var i01 = this.i01;
      var i02 = this.i02;
      var i10 = this.i10;
      var i11 = this.i11;
      var i12 = this.i12;
      var j00 = i_transform.i00;
      var j01 = i_transform.i01;
      var j02 = i_transform.i02;
      var j10 = i_transform.i10;
      var j11 = i_transform.i11;
      var j12 = i_transform.i12;

      this.i00 = i00 * j00 + i10 * j01;
      this.i01 = i01 * j00 + i11 * j01;
      this.i02 = i02 * j00 + i12 * j01 + j02;

      this.i10 = i00 * j10 + i10 * j11;
      this.i11 = i01 * j10 + i11 * j11;
      this.i12 = i02 * j10 + i12 * j11 + j12;

      return this;
    },
    preConcatenate: function (i_transform) {
      // does: [this] = [Tx] x [this]
      var d00 = this.d00;
      var d01 = this.d01;
      var x = this.x;
      var d10 = this.d10;
      var d11 = this.d11;
      var y = this.y;
      var t00 = i_transform.d00;
      var t01 = i_transform.d01;
      var t02 = i_transform.x;
      var t10 = i_transform.d10;
      var t11 = i_transform.d11;
      var t12 = i_transform.y;

      this.d00 = d00 * t00 + d10 * t01;
      this.d01 = d01 * t00 + d11 * t01;
      this.x = x * t00 + y * t01 + t02;

      this.d10 = d00 * t10 + d10 * t11;
      this.d11 = d01 * t10 + d11 * t11;
      this.y = x * t10 + y * t11 + t12;

      this.scale *= i_transform.scale;
      var nmx = i_transform.mirrorX;
      var nmy = i_transform.mirrorY;
      // adjust the rotation depending on the transforms mirroring situation ...
      this.rotation += nmx === nmy ? i_transform.rotation : -i_transform.rotation;
      // ... and update the mirroring flags afterwards (!!!)
      this.mirrorX = this.mirrorX !== nmx;
      this.mirrorY = this.mirrorY !== nmy;

      // compute the inverted parameters
      var i00 = this.i00;
      var i01 = this.i01;
      var i10 = this.i10;
      var i11 = this.i11;
      var j00 = i_transform.i00;
      var j01 = i_transform.i01;
      var j02 = i_transform.i02;
      var j10 = i_transform.i10;
      var j11 = i_transform.i11;
      var j12 = i_transform.i12;

      this.i00 = i00 * j00 + i01 * j10;
      this.i01 = i00 * j01 + i01 * j11;
      this.i02 += i00 * j02 + i01 * j12;

      this.i10 = i10 * j00 + i11 * j10;
      this.i11 = i10 * j01 + i11 * j11;
      this.i12 += i10 * j02 + i11 * j12;

      return this;
    },
    invert: function () {
      if (true) {
        // we already know the inverted transforms so just swap the parameters
        var swap = this.i00;
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
      }
      else {
        // this is the inversion calculation (taken from AffineTransform.java)
        var d00 = this.d00;
        var d01 = this.d01;
        var x = this.x;
        var d10 = this.d10;
        var d11 = this.d11;
        var y = this.y;
        var det = d00 * d11 - d01 * d10;
        this.d00 = d11 / det;
        this.d10 = -d10 / det;
        this.d01 = -d01 / det;
        this.d11 = d00 / det;
        this.x = (d01 * y - d11 * x) / det;
        this.y = (d10 * x - d00 * y) / det;
        return this;
      }
    },
    initForPoints: function (i_metricX1, i_metricY1, i_metricX2, i_metricY2, i_pixelX1, i_pixelY1, i_pixelX2, i_pixelY2) {
      // store for performance reasons
      var mx = this.mirrorX === true;
      var my = this.mirrorY === true;
      // get the deltas
      var dx = i_metricX2 - i_metricX1;
      var dy = i_metricY2 - i_metricY1;
      var du = i_pixelX2 - i_pixelX1;
      var dv = i_pixelY2 - i_pixelY1;
      // compute the cross products
      var dxdu = dx * du;
      var dxdv = dx * dv;
      var dydu = dy * du;
      var dydv = dy * dv;
      // compute the numerators
      var m1num = (mx ? -dxdu : dxdu) + (my ? -dydv : dydv);
      var m2num = (mx ? -dxdv : dxdv) + (my ? dydu : -dydu);
      // compute image to metric transform
      var du2dv2 = du * du + dv * dv;
      var m1 = m1num / du2dv2;
      var m2 = m2num / du2dv2;
      // initialize transform
      this.i00 = mx ? -m1 : m1;
      this.i10 = my ? m2 : -m2;
      this.i01 = mx ? -m2 : m2;
      this.i11 = my ? -m1 : m1;
      this.i02 = i_metricX1 - this.i00 * i_pixelX1 - this.i01 * i_pixelY1;
      this.i12 = i_metricY1 - this.i10 * i_pixelX1 - this.i11 * i_pixelY1;
      // compute metric to image transform
      var mdiv = (dx * dx + dy * dy);
      m1 = m1num / mdiv;
      m2 = m2num / mdiv;
      // initialize transform
      this.d00 = mx ? -m1 : m1;
      this.d10 = mx ? -m2 : m2;
      this.d01 = my ? m2 : -m2;
      this.d11 = my ? -m1 : m1;
      this.x = i_pixelX1 - this.d00 * i_metricX1 - this.d01 * i_metricY1;
      this.y = i_pixelY1 - this.d10 * i_metricX1 - this.d11 * i_metricY1;
      this.rotation = normalizeToPlusMinusPI(Math.atan2(m2num, m1num));
      this.scale = Math.sqrt(du2dv2 / mdiv);
      return this;
    },
    initForPoint: function (i_metricX, i_metricY, i_pixelX, i_pixelY) {
      // initialize transforms
      this.x = i_pixelX - this.d00 * i_metricX - this.d01 * i_metricY;
      this.y = i_pixelY - this.d10 * i_metricX - this.d11 * i_metricY;
      this.i02 = i_metricX - this.i00 * i_pixelX - this.i01 * i_pixelY;
      this.i12 = i_metricY - this.i10 * i_pixelX - this.i11 * i_pixelY;
      return this;
    },
    initForBounds: function (i_metric, i_pixelWidth, i_pixelHeight, i_mirrorX, i_mirrorY) {
      // get the source rectangle bounds
      var x = i_metric ? i_metric.x : 0.0;
      var y = i_metric ? i_metric.y : 0.0;
      var w = i_metric ? i_metric.width : 1.0;
      var h = i_metric ? i_metric.height : 1.0;
      if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
        var x1 = i_metric.x1;
        var x2 = i_metric.x2;
        var y1 = i_metric.y1;
        var y2 = i_metric.y2;
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
      var mx = i_mirrorX === true;
      var my = i_mirrorY === true;
      // depending on the aspect ratio of source and target rectangle the
      // transformed rectangle must fit vertically and horizontally - so we need
      // the lower scale factor of both
      var pxw = i_pixelWidth / w;
      var pxh = i_pixelHeight / h;
      var ds = Math.min(pxw, pxh);
      var is = 1.0 / ds;
      // this centers the target rectangle
      var tx = mx ? (i_pixelWidth + ds * w) * 0.5 : (i_pixelWidth - ds * w) * 0.5;
      var ty = my ? (i_pixelHeight + ds * h) * 0.5 : (i_pixelHeight - ds * h) * 0.5;

      // the actual scale (y-scale is negative because of the vertical flip of
      // the y-axis: in metric systems the y-axis goes up, in images it goes
      // down! The x.axis always goes from left to right. His involves rotations
      // because positive angles in one system will be negative in the other!)
      var d00 = mx ? -ds : ds;
      var d11 = my ? -ds : ds;
      var i00 = mx ? -is : is;
      var i11 = my ? -is : is;
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
    },
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
    applyCoordinateTransformation: function (i_translateX, i_translateY, i_scale, i_phi, i_mirrorX, i_mirrorY) {
      this.translate(i_translateX, i_translateY).setScale(i_scale).rotate(i_phi, i_mirrorX, i_mirrorY);
    },
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
    setToCoordinateTransform: function (i_params, i_parent) {
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
      var d00, d01, x, d10, d11, y, sca, rot, mx, my;
      if (i_parent) {
        d00 = i_parent.d00;
        d01 = i_parent.d01;
        x = i_parent.x;
        d10 = i_parent.d10;
        d11 = i_parent.d11;
        y = i_parent.y;
        sca = i_parent.scale;
        rot = i_parent.rotation;
        mx = i_parent.mirrorX;
        my = i_parent.mirrorY;
      }
      else if (i_params) {
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
      if (i_params) {
        // now we translate - but only if required [2]
        var tx = i_params.x;
        var ty = i_params.y;
        if (tx !== 0.0 && typeof tx === 'number') {
          if (ty !== 0.0 && typeof ty === 'number') {
            // add the rotated and scaled translation vector
            x += d00 * tx + d01 * ty;
            y += d10 * tx + d11 * ty;
          }
          else {
            // add the rotated and scaled translation vector
            x += d00 * tx;
            y += d10 * tx;
          }
        }
        else if (ty !== 0.0 && typeof ty === 'number') {
          // add the rotated and scaled translation vector
          x += d01 * ty;
          y += d11 * ty;
        }
        // next we scale - but only if required and valid [3]
        var sc = i_params.scale;
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
        var pmx = i_params.mirrorX === true;
        var pmy = i_params.mirrorY === true;
        this.mirrorX = mx !== pmx;
        this.mirrorY = my !== pmy;
        // try to get rotation angle
        var phi = i_params.phi;
        if (typeof phi !== 'number') {
          var a = i_params.angle;
          if (typeof a === 'number') {
            phi = a !== 0.0 ? a * DEG2RAD : undefined;
          }
        }
        // if we must be upright we adjust angle with current rotation
        if (i_params.upright === true) {
          if (phi !== undefined) {
            phi += mx === my ? -rot : rot;
          }
          else {
            phi = mx === my ? -rot : rot;
          }
        }
        var m00, m01, m10, m11;
        if (phi !== undefined && phi !== 0.0) {
          var sin = Math.sin(phi);
          var cos = Math.cos(phi);
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
        }
        else {
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
        var det = m00 * m11 - m01 * m10;
        this.i00 = m11 / det;
        this.i10 = -m10 / det;
        this.i01 = -m01 / det;
        this.i11 = m00 / det;
        this.i02 = (m01 * y - m11 * x) / det;
        this.i12 = (m10 * x - m00 * y) / det;
      }
      // no parameters but at least a parent transform
      else if (i_parent) {
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
        this.i00 = i_parent.i00;
        this.i01 = i_parent.i01;
        this.i02 = i_parent.i02;
        this.i10 = i_parent.i10;
        this.i11 = i_parent.i11;
        this.i12 = i_parent.i12;
      }
    },
    transform: function (i_x, i_y, i_point) {
      var p = i_point || {};
      p.x = this.d00 * i_x + this.d01 * i_y + this.x;
      p.y = this.d10 * i_x + this.d11 * i_y + this.y;
      return p;
    },

    transformInverse: function (i_x, i_y, i_point) {
      var p = i_point || {};
      p.x = this.i00 * i_x + this.i01 * i_y + this.i02;
      p.y = this.i10 * i_x + this.i11 * i_y + this.i12;
      return p;
    },

    save: function () {
      var stack = this._stack;
      if (!stack) {
        stack = [];
        this._stack = stack;
      }
      var tf = {};
      fn_copy_transform(tf, this);
      stack.push(tf);
    },

    restore: function () {
      var stack = this._stack;
      var tf = stack ? stack.pop() : undefined;
      if (tf) {
        fn_copy_transform(this, tf);
      }
      else {
        this.setToIdentity();
      }
    }
  };

  /**
   * This mechanism maps positions given by an absolute value onto a track
   * departed in zones of different length.
   * 
   * @param {Object}
   *          i_curveSection The curve section
   * @param {Object}
   *          i_maxPosition The maximum position
   */
  function Adjuster() {
    this._cfg = [];
    this.reset();
  }
  ;

  Adjuster.prototype = {
    reset: function (i_source, i_target, i_id) {
      var config = this._cfg;
      config.splice(0, config.length);
      this.incrementSource = undefined;
      this.incrementTarget = undefined;
      if (i_id !== undefined) {
        this._id = i_id;
      }
      else {
        delete this._id;
      }
      this._s = typeof i_source === 'number' ? i_source : 0.0;
      this._t = typeof i_target === 'number' ? i_target : 0.0;
      this.valid = false;
    },
    add: function (i_source, i_target, i_id) {
      var s = this._s;
      var ds = i_source - s;
      var cis = ds > 0.0 ? true : (ds < 0.0 ? false : undefined);
      var pis = this.incrementSource;
      if (cis === undefined || (pis !== undefined && pis !== cis)) {
        return false;
      }
      var t = this._t;
      var dt = i_target - t;
      var cit = dt > 0.0 ? true : (dt < 0.0 ? false : undefined);
      var pit = this.incrementTarget;
      if (cit === undefined || (pit !== undefined && pit !== cit)) {
        return false;
      }
      this._cfg.push({
        id: i_id,
        s1: s,
        s2: i_source,
        ds: ds,
        t1: t,
        t2: i_target,
        dt: dt,
      });
      this._s = i_source;
      this.incrementSource = cis;
      this._t = i_target;
      this.incrementTarget = cit;
      this.valid = true;
      return true;
    },
    adjust: function (i_source) {
      var config = this._cfg;
      if (config.length > 0) {
        var is = this.incrementSource;
        var c1 = config[0];
        var c2 = config[config.length - 1];
        var s1 = c1.s1;
        var s2 = c2.s2;
        var ds = s2 - s1;
        var t1 = c1.t1;
        var t2 = c2.t2;
        var dt = t2 - t1;
        if (is ? i_source <= s1 : i_source >= s1) {
          return t1 + (i_source - s1) / ds * dt;
        }
        else if (is ? i_source >= s2 : i_source <= s2) {
          return t2 + (i_source - s2) / ds * dt;
        }
        else {
          for (var i = 0; i < config.length; i++) {
            var c = config[i];
            s2 = c.s2;
            if (is ? i_source <= s2 : i_source >= s2) {
              return c.t1 + (i_source - c.s1) / c.ds * c.dt;
            }
          }
        }
      }
      return false;
    },
    adjustInverse: function (i_target) {
      var config = this._cfg;
      if (config.length > 0) {
        var it = this.incrementTarget;
        var c1 = config[0];
        var c2 = config[config.length - 1];
        var s1 = c1.s1;
        var s2 = c2.s2;
        var ds = s2 - s1;
        var t1 = c1.t1;
        var t2 = c2.t2;
        var dt = t2 - t1;
        if (it ? i_target <= t1 : i_target >= t1) {
          return s1 + (i_target - t1) / dt * ds;
        }
        else if (it ? i_target >= t2 : i_target <= t2) {
          return s2 + (i_target - t2) / dt * ds;
        }
        else {
          for (var i = 0; i < config.length; i++) {
            var c = config[i];
            t2 = c.t2;
            if (it ? i_target <= t2 : i_target >= t2) {
              return c.s1 + (i_target - c.t1) / c.dt * c.ds;
            }
          }
        }
      }
      return false;
    },
    format: function () {
      var config = this._cfg;
      if (config.length > 0) {
        var id1 = this._id;
        var txt = 'adjustment:';
        for (var i = 0; i < config.length; i++) {
          txt += '\n';
          var cfg = config[i];
          txt += '[';
          txt += i;
          txt += '] = ';
          txt += (cfg.dt / cfg.ds).toString();
          var id2 = cfg.id;
          txt += ' (from "';
          txt += id1;
          txt += '" to "';
          txt += id2;
          txt += '")';
          id1 = id2;
        }
        return txt;
        // JSONX.stringify(config, undefined, 2);
      }
      else {
        return false;
      }
    }
  };

  function getHarmonicRGB(i_value, i_min, i_max) {
    var min = typeof i_min === 'number' ? Math.max(i_min, 0) : 0;
    var max = typeof i_max === 'number' ? Math.min(i_max, 256) : 256;
    var diff = (max - min) * 0.5;
    var value = normalizeToPlusMinusPI(i_value * TWO_PI);
    var r = Math.floor(min + (Math.cos(value) + 1) * diff);
    var g = Math.floor(min + (Math.cos(value + TWO_PI / 3) + 1) * diff);
    var b = Math.floor(min + (Math.cos(value - TWO_PI / 3) + 1) * diff);
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
  function getArc(i_x1, i_y1, i_x2, i_y2, i_x3, i_y3, i_radius) {
    // compute the vectors
    var v12x = i_x2 - i_x1;
    var v12y = i_y2 - i_y1;
    var v12len2 = v12x * v12x + v12y * v12y;
    var v23x = i_x3 - i_x2;
    var v23y = i_y3 - i_y2;
    var v23len2 = v23x * v23x + v23y * v23y;
    // if too short
    if (v12len2 < MIN_LENGTH2 || v12len2 < MIN_LENGTH2) {
      return false;
    }
    // compute angle between vectors and normalize
    var v12phi = Math.atan2(v12y, v12x);
    var v23phi = Math.atan2(v23y, v23x);
    var phi123 = normalizeToPlusMinusPI(v23phi - v12phi);
    // we adjust the second angle to prevent angle jumps the other way around
    v23phi = v12phi + phi123;
    // if angle is too flat or too sharp
    if ((phi123 < MINIMUM_FLAT_ANGLE && phi123 > -MINIMUM_FLAT_ANGLE) || (phi123 > MAXIMUM_SHARP_ANGLE && phi123 < -MAXIMUM_SHARP_ANGLE)) {
      return false;
    }
    // check if we turn left or right
    var left = phi123 > 0.0;
    // the center of our arc lies on the cutting position of the two parallel
    // lines
    // with the distance "radius" from our original lines. So in the next block
    // we compute help points on these lines.
    var v12len = Math.sqrt(v12len2);
    var unitVector12x = v12x / v12len;
    var unitVector12y = v12y / v12len;
    var offset12x = left ? -i_radius * unitVector12y : i_radius * unitVector12y;
    var offset12y = left ? i_radius * unitVector12x : -i_radius * unitVector12x;
    var line12x1 = i_x1 + offset12x;
    var line12y1 = i_y1 + offset12y;
    var line12x2 = i_x2 + offset12x;
    var line12y2 = i_y2 + offset12y;
    var v23lenInv = 1.0 / Math.sqrt(v23len2);
    var unitVector23x = v23x * v23lenInv;
    var unitVector23y = v23y * v23lenInv;
    var offset23x = left ? -i_radius * unitVector23y : i_radius * unitVector23y;
    var offset23y = left ? i_radius * unitVector23x : -i_radius * unitVector23x;
    var line23x2 = i_x2 + offset23x;
    var line23y2 = i_y2 + offset23y;
    var line23x3 = i_x3 + offset23x;
    var line23y3 = i_y3 + offset23y;
    // compute the result and return
    var denominator = -line12x1 * line23y2 + line12x2 * line23y2 + line12x1 * line23y3 - line12x2 * line23y3;
    denominator += line23x2 * line12y1 - line23x3 * line12y1 - line23x2 * line12y2 + line23x3 * line12y2;
    // if invalid
    if (denominator < MIN_DENOMINATOR && denominator > -MIN_DENOMINATOR) {
      return false;
    }
    var numerator = -line23x3 * line12x1 * line23y2 + line23x3 * line12x2 * line23y2 + line23x2 * line12x1 * line23y3 - line23x2 * line12x2 * line23y3;
    numerator += line23x2 * line12x2 * line12y1 - line23x3 * line12x2 * line12y1 - line23x2 * line12x1 * line12y2 + line23x3 * line12x1 * line12y2;
    var centerX = numerator / denominator;
    var centerY = undefined;
    if (line23x3 !== line23x2) {
      centerY = (line23y3 - line23y2) / (line23x3 - line23x2) * (centerX - line23x2) + line23y2;
    }
    else if (line12x2 !== line12x1) {
      centerY = (line12y2 - line12y1) / (line12x2 - line12x1) * (centerX - line12x1) + line12y1;
    }
    else {
      return false;
    }
    return {
      left: left,
      right: left === false,
      centerX: centerX,
      centerY: centerY,
      radius: i_radius,
      startX: centerX - offset12x,
      startY: centerY - offset12y,
      startPhi: v12phi,
      endX: centerX - offset23x,
      endY: centerY - offset23y,
      endPhi: v23phi
    };
  }

  function fn_prepare_arc(i_context, i_contextTransform, i_point, i_part, i_start, i_end, i_left, i_curveTransform) {
    var arc = i_part.arc;
    var sphi = arc.startPhi;
    var ephi = arc.endPhi;
    var dphi = ephi - sphi;
    var s1 = i_part.s1;
    var slen = i_part.length;
    var left = arc.left;
    var ophi = left ? -HALF_PI : HALF_PI;
    var phi1 = sphi + (i_start - s1) / slen * dphi + ophi;
    var phi2 = sphi + (i_end - s1) / slen * dphi + ophi;
    // handler mirroring
    var mx = i_contextTransform.mirrorX !== i_curveTransform.mirrorX;
    if (mx) {
      phi1 = PI - phi1;
      phi2 = PI - phi2;
    }
    var my = i_contextTransform.mirrorY !== i_curveTransform.mirrorY;
    if (my) {
      phi1 = -phi1;
      phi2 = -phi2;
    }
    // get center point
    i_curveTransform.transform(arc.centerX, arc.centerY, i_point);
    i_contextTransform.transform(i_point.x, i_point.y, i_point);
    var tfrot = i_contextTransform.rotation - i_curveTransform.rotation;
    var radius = arc.radius;
    if (typeof i_left === 'number') {
      radius += left ? -i_left : i_left;
    }
    radius *= i_contextTransform.scale;
    radius *= i_curveTransform.scale;
    i_context.arc(i_point.x, i_point.y, radius, phi1 + tfrot, phi2 + tfrot, left === (mx !== my));
  }

  var ArcLine = function (i_curve) {
    this._curve = i_curve;
    this.length = 0.0;
    this.closed = false;
    this._p = {};
    this._parts = [];
    this._adjuster = new Adjuster();
    this._tf = new Transform();

    // initialize
    this.adjust();
    this._init();
  };

  ArcLine.prototype = {
    adjust: function () {
      var curve = this._curve;
      this._tf.setToIdentity();
      this._tf.setToCoordinateTransform(curve);
    },
    /**
     * Initialize ArcLine with points
     */
    _init: function () {
      var curve = this._curve;
      var points = curve.points;
      // This method performs the following operations:
      // Collect all valid points in an array [1]
      // Build arcs for all points with radius [2]
      // Collect all line and arc parts in an array and compute length [3]

      // reset
      var pts = [];
      var parts = this._parts;
      parts.splice(0, parts.length);
      var adjuster = this._adjuster;
      adjuster.reset(0.0, 0.0, curve.id);
      var length = 0.0;
      var closed = curve.closed === true;
      if ($.isArray(points) && points.length > 0) {
        var position = points[0];
        // collect [1]
        for (var i = 0; i < points.length; i++) {
          var position = points[i];
          var x = position.x;
          var y = position.y;
          if (typeof x === 'number' && typeof y === 'number') {
            var p = {
              x: x,
              y: y,
              arc: false
            };
            var r = position.r;
            if (typeof r === 'number' && r > 0.0) {
              p.r = r;
            }
            var pos = position.position;
            if (typeof pos === 'number') {
              p.position = pos;
            }
            var id = position.id;
            if (id !== undefined) {
              p.id = id;
            }
            pts.push(p);
          }
        }
        // for all points check if we need an arc [2]
        for (var i = 0; i < pts.length; i++) {
          var point = pts[i];
          var r = point.r;
          if (r !== undefined && (closed || (i > 0 && i < pts.length - 1))) {
            var prev = i > 0 ? pts[i - 1] : pts[pts.length - 1];
            var next = i < pts.length - 1 ? pts[i + 1] : pts[0];
            point.arc = getArc(prev.x, prev.y, point.x, point.y, next.x, next.y, r);
          }
        }
        // collect parts [3]
        for (var i = 1; closed ? i <= pts.length : i < pts.length; i++) {
          var sp = pts[i - 1];
          var ep = i === pts.length ? pts[0] : pts[i];
          var sa = sp.arc;
          var ea = ep.arc;
          var x1 = sa !== false ? sa.endX : sp.x;
          var y1 = sa !== false ? sa.endY : sp.y;
          var x2 = ea !== false ? ea.startX : ep.x;
          var y2 = ea !== false ? ea.startY : ep.y;
          var dx = x2 - x1;
          var dy = y2 - y1;
          var len = Math.sqrt(dx * dx + dy * dy);
          if (len > EPSILON) {
            // we only want lines with an existing length
            parts.push({
              arc: false,
              x1: x1,
              y1: y1,
              s1: length,
              x2: x2,
              y2: y2,
              s2: length + len,
              length: len,
              ex: dx / len,
              ey: dy / len,
              phi: Math.atan2(dy, dx)
            });
          }
          length += len;
          if (ea !== false) {
            var angle = ea.endPhi - ea.startPhi;
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
    },
    getLength: function () {
      return this.length;
    },
    _get_position_on_arc_line: function (i_position, i_left, i_point) {
      var parts = this._parts;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var s1 = part.s1;
        if (i_position >= s1 && i_position <= part.s2) {
          var tf = this._tf;
          var mirrored = tf.mirrorX !== tf.mirrorY;
          var p = i_point || {};
          var arc = part.arc;
          var rel = (i_position - s1) / part.length;
          if (arc === false) {
            var x = part.x1 + (part.x2 - part.x1) * rel - part.ey * i_left;
            var y = part.y1 + (part.y2 - part.y1) * rel + part.ex * i_left;
            tf.transform(x, y, p);
            p.phi = (mirrored ? -part.phi : part.phi) + tf.rotation;
          }
          else {
            var phi = arc.startPhi + (arc.endPhi - arc.startPhi) * rel;
            var cos = Math.cos(phi);
            var sin = Math.sin(phi);
            var x = arc.centerX + (arc.left ? sin * arc.radius : -sin * arc.radius) - sin * i_left;
            var y = arc.centerY + (arc.left ? -cos * arc.radius : cos * arc.radius) + cos * i_left;
            tf.transform(x, y, p);
            p.phi = (mirrored ? -phi : phi) + tf.rotation;
          }
          return p;
        }
      }
    },
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
     *          i_position The position on the ArcLine
     * @param {Object}
     *          i_point Optional object for the result
     * @returns {Object} If i_point is defined i_point will be returned.
     *          Otherwise a new object will be returned
     */
    _transform: function (i_position, i_left, i_point) {
      var parts = this._parts;
      if (typeof i_position !== 'number' || parts.length === 0) {
        return false;
      }
      if (this.closed) {
        var curve_start = parts[0].s1;
        var curve_end = parts[parts.length - 1].s2;
        var length = curve_end - curve_start;
        // normalize position
        var position = i_position;
        var length = this.length;
        while (position >= curve_end) {
          position -= length;
        }
        while (position < curve_start) {
          position += length;
        }
        return this._get_position_on_arc_line(position, i_left, i_point);
      }
      // check if before first segment
      var tf = this._tf;
      var mirrored = tf.mirrorX !== tf.mirrorY;
      var part = parts[0];
      var s1 = part.s1;
      if (i_position < s1) {
        var offset = i_position - s1;
        var arc = part.arc;
        var p = i_point || {};
        if (arc === false) {
          var x = part.x1 + part.ex * offset - part.ey * i_left;
          var y = part.y1 + part.ey * offset + part.ex * i_left;
          tf.transform(x, y, p);
          p.phi = (mirrored ? -part.phi : part.phi) + tf.rotation;
        }
        else {
          var cos = Math.cos(arc.startPhi);
          var sin = Math.sin(arc.startPhi);
          var x = arc.centerX + (arc.left ? sin * arc.radius : -sin * arc.radius) + cos * offset - sin * i_left;
          var y = arc.centerY + (arc.left ? -cos * arc.radius : cos * arc.radius) + sin * offset + cos * i_left;
          tf.transform(x, y, p);
          p.phi = (mirrored ? -arc.startPhi : arc.startPhi) + tf.rotation;
        }
        return p;
      }
      // check if behind last segment
      part = parts[parts.length - 1];
      var s2 = part.s2;
      if (i_position >= s2) {
        var offset = i_position - s2;
        var arc = part.arc;
        var p = i_point || {};
        if (arc === false) {
          var x = part.x2 + part.ex * offset - part.ey * i_left;
          var y = part.y2 + part.ey * offset + part.ex * i_left;
          tf.transform(x, y, p);
          p.phi = (mirrored ? -part.phi : part.phi) + tf.rotation;
        }
        else {
          var cos = Math.cos(arc.endPhi);
          var sin = Math.sin(arc.endPhi);
          var x = arc.centerX + (arc.left ? sin * arc.radius : -sin * arc.radius) + cos * offset - sin * i_left;
          var y = arc.centerY + (arc.left ? -cos * arc.radius : cos * arc.radius) + sin * offset + cos * i_left;
          tf.transform(x, y, p);
          p.phi = (mirrored ? -arc.endPhi : arc.endPhi) + tf.rotation;
        }
        return p;
      }
      // must be in between
      return this._get_position_on_arc_line(i_position, i_left, i_point);
    },
    transform: function (i_position, i_left, i_point) {
      return this._transform(this._adjuster.adjust(i_position), i_left, i_point);
    },
    _stroke_arc_line: function (i_context, i_transform, i_start, i_end, i_left) {
      var parts = this._parts;
      var start_pos = i_start;
      var p = this._p;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var s2 = part.s2;
        if (start_pos < s2) {
          var is_last = i_end <= s2;
          var end_pos = is_last ? i_end : s2;
          if (Math.abs(end_pos - start_pos) > MIN_STROKE_LENGTH) {
            this._get_position_on_arc_line(start_pos, i_left, p);
            var start_phi = p.phi;
            i_transform.transform(p.x, p.y, p);
            var x1 = p.x;
            var y1 = p.y;
            i_context.beginPath();
            this._get_position_on_arc_line(end_pos, i_left, p);
            var end_phi = p.phi;
            i_transform.transform(p.x, p.y, p);
            var arc = part.arc;
            if (arc === false) {
              i_context.moveTo(x1, y1);
              i_context.lineTo(p.x, p.y);
            }
            else {
              fn_prepare_arc(i_context, i_transform, p, part, start_pos, end_pos, i_left, this._tf);
            }
            i_context.stroke();
          }
          start_pos = end_pos;
          if (is_last) {
            break;
          }
        }
      }
    },
    stroke: function (i_context, i_transform, i_start, i_end, i_left) {
      // get the stroke start and end position in curve coordinates
      var adjuster = this._adjuster;
      var stroke_start = adjuster.adjust(Math.min(i_start, i_end));
      var stroke_end = adjuster.adjust(Math.max(i_start, i_end));
      // if too short
      if (stroke_end - stroke_start < MIN_STROKE_LENGTH) {
        // nothing more to do
        return;
      }
      var p = this._p;
      // get the curves start and end position
      var parts = this._parts;
      var curve_start = parts[0].s1;
      var curve_end = parts[parts.length - 1].s2;
      // handle closed curve
      if (this.closed === true) {
        // //////////////////////////////////////////////////////////////////////
        // CLOSED CURVE:
        // - normalize because we want the start in the range [0, length)
        // - stroke until end
        // - if available handle overlapping rest
        // //////////////////////////////////////////////////////////////////////
        var length = curve_end - curve_start;
        while (stroke_start >= curve_end) {
          stroke_start -= length;
          stroke_end -= length;
        }
        while (stroke_start < curve_start) {
          stroke_start += length;
          stroke_end += length;
        }
        var stroke_end_is_behind_curve_end = stroke_end > curve_end;
        var se = stroke_end_is_behind_curve_end ? curve_end : stroke_end;
        if (se - stroke_start > MIN_STROKE_LENGTH) {
          this._stroke_arc_line(i_context, i_transform, stroke_start, se, i_left);
        }
        if (stroke_end_is_behind_curve_end) {
          se = stroke_end - length;
          if (se - curve_start > MIN_STROKE_LENGTH) {
            this._stroke_arc_line(i_context, i_transform, curve_start, se, i_left);
          }
        }
        return;
      }
      // reaching this point our curve is not closed - so we extrapolate points
      // outside the range our curve

      // first handle stroke parts before actual curve
      if (stroke_start < curve_start) {
        var stroke_end_is_before_curve_start = stroke_end <= curve_start;
        var se = stroke_end_is_before_curve_start ? stroke_end : curve_start;
        if (se - stroke_start > MIN_STROKE_LENGTH) {
          i_context.beginPath();
          this._transform(stroke_start, i_left, p);
          i_transform.transform(p.x, p.y, p);
          i_context.moveTo(p.x, p.y);
          this._transform(se, i_left, p);
          i_transform.transform(p.x, p.y, p);
          i_context.lineTo(p.x, p.y);
          i_context.stroke();
        }
        if (stroke_end_is_before_curve_start) {
          // nothing more to do
          return;
        }
        stroke_start = curve_start;
      }
      // next handle parts on actual curve
      if (stroke_start < curve_end) {
        var stroke_end_is_before_curve_end = stroke_end <= curve_end;
        var se = stroke_end_is_before_curve_end ? stroke_end : curve_end;
        if (se - stroke_start > MIN_STROKE_LENGTH) {
          this._stroke_arc_line(i_context, i_transform, stroke_start, se, i_left);
        }
        if (stroke_end_is_before_curve_end) {
          // nothing more to do
          return;
        }
        stroke_start = curve_end;
      }
      // last handle stroke parts behind actual curve
      if (stroke_end - stroke_start > MIN_STROKE_LENGTH) {
        i_context.beginPath();
        this._transform(stroke_start, i_left, p);
        i_transform.transform(p.x, p.y, p);
        i_context.moveTo(p.x, p.y);
        this._transform(stroke_end, i_left, p);
        i_transform.transform(p.x, p.y, p);
        i_context.lineTo(p.x, p.y);
        i_context.stroke();
      }
    }
  };

  function fn_get_from_array(i_array, i_selector) {
    if (typeof i_selector === 'number') {
      return i_array[i_selector];
    }
    else {
      for (var i = 0; i < i_array.length; i++) {
        var obj = i_array[i];
        if (obj.child === i_selector) {
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
  var CurveSection = function (i_curve, i_id, i_curveStart, i_curveEnd, i_elements) {
    var cu_start = typeof i_curveStart === 'number' ? i_curveStart : 0.0;
    var cu_end = typeof i_curveEnd === 'number' ? i_curveEnd : i_curve.getLength();
    // compute the length of all elements
    var sec_len = 0.0;
    if ($.isArray(i_elements)) {
      for (var i = 0; i < i_elements.length; i++) {
        var child = i_elements[i];
        var sec_zone_length = child.length;
        if (typeof sec_zone_length === 'number' && sec_zone_length > 0.0) {
          sec_len += sec_zone_length;
        }
      }
    }
    if (sec_len === 0.0) {
      console.error('Exception! CurveSection �' + i_id + '� has no element with valid length!');
    }
    var elementsWithLength = [];
    var elementsWithoutLength = [];
    var sec_to_cu_factor = 1.0;
    // if valid arc line and valid elements
    var cu_len = cu_end - cu_start;
    if (sec_len > 0.0 && Math.abs(cu_len) > MIN_STROKE_LENGTH) {
      sec_to_cu_factor = cu_len / sec_len;
      var cu_offset = cu_start;
      var sec_offset = 0.0;
      for (var i = 0; i < i_elements.length; i++) {
        var child = i_elements[i];
        var sec_zone_length = child.length;
        if (typeof sec_zone_length === 'number' && sec_zone_length > 0.0) {
          // update the positions
          var cu_zone_start = cu_offset;
          var sec_zone_start = sec_offset;
          cu_offset += sec_zone_length * sec_to_cu_factor;
          sec_offset += sec_zone_length;
          var cu_zone_end = cu_offset;
          var sec_zone_end = sec_offset;
          elementsWithLength.push({
            child: child,
            start: sec_zone_start,
            end: sec_zone_end
          });
        }
        else {
          // If the element has no length it is located somewhere on the curve.
          // First of all it may be located by an explicit position parameter.
          // [1]
          // If no position has been defined we just locate where we
          // are right now. [2]
          // In the end our position may be moved by an explicit offset
          // parameter. [3]
          var object = child;
          var obj = object.object;
          while (obj !== null && typeof obj === 'object') {
            object = obj;
            obj = object.object;
          }
          var sec_pos = undefined;
          if (typeof child.position === 'number') {
            // explicit position parameter [1]
            sec_pos = child.position;
          }
          if (sec_pos === undefined) {
            // locate where we are right now [2]
            sec_pos = sec_offset;
          }
          elementsWithoutLength.push({
            child: child,
            position: sec_pos
          });
        }
      }
    }
    this.length = sec_len;
    this._elementsWithLength = elementsWithLength;
    this._elementsWithoutLength = elementsWithoutLength;
    this._inc_pos = cu_len >= 0;
    this._cu_offset = cu_start;
    this._sec_to_cu_factor = sec_to_cu_factor;
    this._curve = i_curve;
  };

  CurveSection.prototype = {
    getLength: function () {
      return this.length;
    },
    getZoneCount: function () {
      return this._elementsWithLength.length;
    },
    getZoneObject: function (i_zone) {
      var zone = this._elementsWithLength[i_zone];
      return zone ? zone.child : undefined;
    },
    getZoneStart: function (i_zone) {
      var zone = fn_get_from_array(this._elementsWithLength, i_zone);
      return zone ? zone.start : undefined;
    },
    getZoneEnd: function (i_zone) {
      var zone = fn_get_from_array(this._elementsWithLength, i_zone);
      return zone ? zone.end : undefined;
    },
    getItemCount: function () {
      return this._elementsWithoutLength.length;
    },
    getItem: function (i_item) {
      return fn_get_from_array(this._elementsWithoutLength, i_item);
    },
    getItemPosition: function (i_item) {
      var item = fn_get_from_array(this._elementsWithoutLength, i_item);
      return item ? item.position : undefined;
    },
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
     *          i_point Optional object for the result
     * @returns {Object} If i_point is defined i_point will be returned.
     *          Otherwise a new object will be returned
     */
    transform: function (i_section_position, i_offset, i_point) {
      var position = i_section_position;
      if (typeof i_offset === 'number') {
        position += i_offset;
      }
      else if (i_offset !== null && typeof i_offset === 'object' && typeof i_offset.offset === 'number') {
        position += i_offset.offset;
      }
      var left = 0.0;
      if (i_offset !== null && typeof i_offset === 'object') {
        var l = i_offset.left;
        if (typeof l === 'number') {
          left = l;
        }
        else {
          var r = i_offset.right;
          if (typeof r === 'number') {
            left = -r;
          }
        }
      }
      return this._curve.transform(this._cu_offset + position * this._sec_to_cu_factor, left, i_point);
    },
    /**
     * This transforms from curve section coordinates (our real metric system)
     * to curve coordinates (pure mathematical position on curve geometry).
     */
    fromSectionToCurve: function (i_position) {
      return this._cu_offset + i_position * this._sec_to_cu_factor;
    }
  };

  var THIRD_PART = 1.0 / 3.0;
  var GOLDEN_SECTION_INTERVAL_PART = (3.0 - Math.sqrt(5.0)) * 0.5;

  // the default iteration parameters
  var DEFAULT_MAX_ITERATIONS = 1000;
  var DEFAULT_DISTANCE_TOLERANCE = 1.0e-6;
  var DEFAULT_LENGTH_TOLERANCE = 1.0e-3;
  var POINT_SITUATION_VALID = 0;
  var POINT_SITUATION_INVALID_DOUBLE_POINT = 1;
  var POINT_SITUATION_INVALID_DOUBLE_START = 2;
  var POINT_SITUATION_INVALID_DOUBLE_END = 3;
  var POINT_SITUATION_INVALID_TRIPLE_POINT = 4;

  function is_zero_infinit_or_invalid(i_value) {
    return i_value === 0.0 || isNaN(i_value) || isFinite(i_value) !== true;
  }

  function compare_with_tolerance(i_value1, i_value2, i_tolerance) {
    var t = i_tolerance > 0.0 ? i_tolerance : 0.0;
    if (i_value1 > i_value2 + t) {
      return 1;
    }
    else if (i_value1 < i_value2 - t) {
      return -1;
    }
    else {
      return 0;
    }
  }

  function init_tupel(i_tuple, i_x1, i_y1, i_x2, i_y2, i_tolerance) {
    var res = compare_with_tolerance(i_x1, i_x2, i_tolerance);
    if (res > 0) {
      i_tuple.x1 = i_x2;
      i_tuple.y1 = i_y2;
      i_tuple.x2 = i_x1;
      i_tuple.y2 = i_y1;
      i_tuple.state = POINT_SITUATION_VALID;
    }
    else if (res === 0) {
      i_tuple.x1 = i_x1;
      i_tuple.y1 = i_y1;
      i_tuple.x2 = i_x1;
      i_tuple.y2 = i_y1;
      i_tuple.state = POINT_SITUATION_INVALID_DOUBLE_POINT;
    }
    else {
      i_tuple.x1 = i_x1;
      i_tuple.y1 = i_y1;
      i_tuple.x2 = i_x2;
      i_tuple.y2 = i_y2;
      i_tuple.state = POINT_SITUATION_VALID;
    }
  }

  function init_triplet(i_triplet, i_x1, i_y1, i_x2, i_y2, i_x3, i_y3, i_tolerance) {
    var res = compare_with_tolerance(i_x1, i_x2, i_tolerance);
    if (res > 0) {
      // #1-5
      res = compare_with_tolerance(i_x2, i_x3, i_tolerance);
      if (res > 0) {
        // #1
        i_triplet.x1 = i_x3;
        i_triplet.y1 = i_y3;
        i_triplet.x2 = i_x2;
        i_triplet.y2 = i_y2;
        i_triplet.x3 = i_x1;
        i_triplet.y3 = i_y1;
        i_triplet.state = POINT_SITUATION_VALID;
      }
      else if (res === 0) {
        // #2
        i_triplet.x1 = i_x2;
        i_triplet.y1 = i_y2;
        i_triplet.x2 = i_x2;
        i_triplet.y2 = i_y2;
        i_triplet.x3 = i_x1;
        i_triplet.y3 = i_y1;
        i_triplet.state = POINT_SITUATION_INVALID_DOUBLE_START;
      }
      else {
        // #3-5
        res = compare_with_tolerance(i_x1, i_x3, i_tolerance);
        if (res > 0) {
          // #3
          i_triplet.x1 = i_x2;
          i_triplet.y1 = i_y2;
          i_triplet.x2 = i_x3;
          i_triplet.y2 = i_y3;
          i_triplet.x3 = i_x1;
          i_triplet.y3 = i_y1;
          i_triplet.state = POINT_SITUATION_VALID;
        }
        else if (res === 0) {
          // #4
          i_triplet.x1 = i_x2;
          i_triplet.y1 = i_y2;
          i_triplet.x2 = i_x1;
          i_triplet.y2 = i_y1;
          i_triplet.x3 = i_x1;
          i_triplet.y3 = i_y1;
          i_triplet.state = POINT_SITUATION_INVALID_DOUBLE_END;
        }
        else {
          // #5
          i_triplet.x1 = i_x2;
          i_triplet.y1 = i_y2;
          i_triplet.x2 = i_x1;
          i_triplet.y2 = i_y1;
          i_triplet.x3 = i_x3;
          i_triplet.y3 = i_y3;
          i_triplet.state = POINT_SITUATION_VALID;
        }
      }
    }
    else if (res === 0) {
      // #6-8
      res = compare_with_tolerance(i_x2, i_x3, i_tolerance);
      if (res > 0) {
        // #6
        i_triplet.x1 = i_x3;
        i_triplet.y1 = i_y3;
        i_triplet.x2 = i_x1;
        i_triplet.y2 = i_y1;
        i_triplet.x3 = i_x1;
        i_triplet.y3 = i_y1;
        i_triplet.state = POINT_SITUATION_INVALID_DOUBLE_END;
      }
      else if (res === 0) {
        // #7
        i_triplet.x1 = i_x1;
        i_triplet.y1 = i_y1;
        i_triplet.x2 = i_x1;
        i_triplet.y2 = i_y1;
        i_triplet.x3 = i_x1;
        i_triplet.y3 = i_y1;
        i_triplet.state = POINT_SITUATION_INVALID_TRIPLE_POINT;
      }
      else {
        // #8
        i_triplet.x1 = i_x1;
        i_triplet.y1 = i_y1;
        i_triplet.x2 = i_x1;
        i_triplet.y2 = i_y1;
        i_triplet.x3 = i_x3;
        i_triplet.y3 = i_y3;
        i_triplet.state = POINT_SITUATION_INVALID_DOUBLE_START;
      }
    }
    else {
      // #9-13
      res = compare_with_tolerance(i_x2, i_x3, i_tolerance);
      if (res > 0) {
        // #9-11
        res = compare_with_tolerance(i_x1, i_x3, i_tolerance);
        if (res > 0) {
          // #9
          i_triplet.x1 = i_x3;
          i_triplet.y1 = i_y3;
          i_triplet.x2 = i_x1;
          i_triplet.y2 = i_y1;
          i_triplet.x3 = i_x2;
          i_triplet.y3 = i_y2;
          i_triplet.state = POINT_SITUATION_VALID;
        }
        else if (res === 0) {
          // #10
          i_triplet.x1 = i_x1;
          i_triplet.y1 = i_y1;
          i_triplet.x2 = i_x1;
          i_triplet.y2 = i_y1;
          i_triplet.x3 = i_x2;
          i_triplet.y3 = i_y2;
          i_triplet.state = POINT_SITUATION_INVALID_DOUBLE_START;
        }
        else {
          // #11
          i_triplet.x1 = i_x1;
          i_triplet.y1 = i_y1;
          i_triplet.x2 = i_x3;
          i_triplet.y2 = i_y3;
          i_triplet.x3 = i_x2;
          i_triplet.y3 = i_y2;
          i_triplet.state = POINT_SITUATION_VALID;
        }
      }
      else if (res === 0) {
        // #12
        i_triplet.x1 = i_x1;
        i_triplet.y1 = i_y1;
        i_triplet.x2 = i_x2;
        i_triplet.y2 = i_y2;
        i_triplet.x3 = i_x2;
        i_triplet.y3 = i_y2;
        i_triplet.state = POINT_SITUATION_INVALID_DOUBLE_END;
      }
      else {
        // #13
        i_triplet.x1 = i_x1;
        i_triplet.y1 = i_y1;
        i_triplet.x2 = i_x2;
        i_triplet.y2 = i_y2;
        i_triplet.x3 = i_x3;
        i_triplet.y3 = i_y3;
        i_triplet.state = POINT_SITUATION_VALID;
      }
    }
  }

  function init_parabola_for_three_points(i_parabola, i_x1, i_y1, i_x2, i_y2, i_x3, i_y3) {
    // compute some help values
    var dx12 = i_x1 - i_x2;
    var dx23 = i_x2 - i_x3;
    var dx31 = i_x3 - i_x1;
    var dy12 = i_y1 - i_y2;
    var dy23 = i_y2 - i_y3;
    var dy31 = i_y3 - i_y1;
    var x1Sq = i_x1 * i_x1;
    var x2Sq = i_x2 * i_x2;
    var x3Sq = i_x3 * i_x3;
    var r = (dx12 * dx23 * dx31);

    // compute the parameters for the equation
    i_parabola.a = (i_x1 * dy23 + i_x2 * dy31 + i_x3 * dy12) / r;
    i_parabola.b = -(x1Sq * dy23 + x2Sq * dy31 + x3Sq * dy12) / r;
    i_parabola.c = -(x1Sq * (i_x2 * i_y3 - i_x3 * i_y2) + i_x1 * (x3Sq * i_y2 - x2Sq * i_y3) + i_x2 * i_x3 * i_y1 * dx23) / r;
  }

  function init_parabola_for_two_points(i_parabola, i_x1, i_y1, i_x2, i_y2) {
    var r = i_x1 - i_x2;
    i_parabola.a = 0.0;
    i_parabola.b = (i_y1 - i_y2) / r;
    i_parabola.c = (i_x1 * i_y2 - i_x2 * i_y1) / r;
  }

  function get_parabola_value(i_parabola, i_x) {
    return i_x * (i_parabola.a * i_x + i_parabola.b) + i_parabola.c;
  }

  var ChainFunction = function (i_maxIterations, i_distanceTolerance, i_lengthTolerance) {
    // internal parameters
    this._maxIterations = typeof i_maxIterations === 'number' && i_maxIterations > 0 ? i_maxIterations : DEFAULT_MAX_ITERATIONS;
    this._distanceTolerance = typeof i_distanceTolerance === 'number' && i_distanceTolerance > 0 ? i_distanceTolerance : DEFAULT_DISTANCE_TOLERANCE;
    this._lengthTolerance = typeof i_lengthTolerance === 'number' && i_lengthTolerance > 0 ? i_lengthTolerance : DEFAULT_LENGTH_TOLERANCE;
    this._parabola = {
      a: 0.0,
      b: 0.0,
      c: 0.0
    };
    this._tuple = {};
    this._triplet = {};
    this._normA = 1.0;
    this._normB = 0.0;
    this._normC = 0.0;
    this._valid = false;
    this._cosinusHyperbolicus = false;
    this._transScale = 1.0;
    this._transScaleInv = 1.0;
    this._transXOffset = 0.0;
    this._transYOffset = 0.0;
  };

  ChainFunction.prototype = {
    reset: function () {
      var parabola = this._parabola;
      parabola.a = 0.0;
      parabola.b = 0.0;
      parabola.c = 0.0;
      this._normA = 1.0;
      this._normB = 0.0;
      this._normC = 0.0;
      this._valid = false;
      this._cosinusHyperbolicus = false;
      this._transScale = 1.0;
      this._transScaleInv = 1.0;
      this._transXOffset = 0.0;
      this._transYOffset = 0.0;
    },
    _init_transform: function (i_x1, i_y1, i_x2, i_y2) {
      var transScaleInv = (i_x2 - i_x1) * 0.5;
      var transScale = 1.0 / transScaleInv;
      this._transXOffset = -(i_x1 + i_x2) * transScale * 0.5;
      this._transYOffset = -(i_y1 + i_y2) * 0.5;
      this._transScale = transScale;
      this._transScaleInv = transScaleInv;
    },
    _to_normalized: function (i_value) {
      return this._transScale * i_value;
    },
    _from_normalized: function (i_value) {
      return this._transScaleInv * i_value;
    },
    _to_normalized_location: function (i_x) {
      return this._transScale * i_x + this._transXOffset;
    },
    _from_normalized_location: function (i_x) {
      return this._transScaleInv * (i_x - this._transXOffset);
    },
    _to_normalized_height: function (i_y) {
      return this._transScale * (i_y + this._transYOffset);
    },
    _from_normalized_height: function (i_y) {
      return this._transScaleInv * i_y - this._transYOffset;
    },
    _get_normalized_height: function (i_normX) {
      return cosh(this._normA * i_normX + this._normB) / this._normA + this._normC;
    },
    _get_normalized_distance: function (i_normX1, i_normX2) {
      var normB = this._normB;
      return (sinh(this._normA * i_normX2 + normB) - sinh(this._normA * i_normX1 + normB)) / this._normA;
    },
    _get_normalized_force: function (i_normX) {
      return cosh(this._normA * i_normX + this._normB) / this._normA;
    },
    _init_for_three_normalized_points: function (i_nx1, i_ny1, i_nx2, i_ny2, i_nx3, i_ny3) {
      this._normA = 1.0;
      // some help values
      var dy12 = i_ny1 - i_ny2;
      var dy32 = i_ny3 - i_ny2;

      // First we compute a parabola through our three points. If we approximate
      // our cosh function as a Taylor polynomial function of second order we
      // get
      // a parabola as well. We use the polynomial parameters from our computed
      // parabola as start values for the following 2-D-Newton iteration.
      var parabola = this._parabola;
      init_parabola_for_three_points(parabola, i_nx1, i_ny1, i_nx2, i_ny2, i_nx3, i_ny3);
      var normA = 2.0 * parabola.a;
      var normB = parabola.b;
      var maxIter = this._maxIterations;
      var distTol = this._distanceTolerance;
      for (var i = 0; i < maxIter; i++) {
        // the following calculations are done because of performance
        // reasons
        var ax1b = normA * i_nx1 + normB;
        var ax2b = normA * i_nx2 + normB;
        var ax3b = normA * i_nx3 + normB;
        var eax1bp = Math.exp(ax1b);
        var eax2bp = Math.exp(ax2b);
        var eax3bp = Math.exp(ax3b);
        var eax1bm = 1.0 / eax1bp;
        var eax2bm = 1.0 / eax2bp;
        var eax3bm = 1.0 / eax3bp;
        var cax1b = (eax1bp + eax1bm) * 0.5;
        var cax2b = (eax2bp + eax2bm) * 0.5;
        var cax3b = (eax3bp + eax3bm) * 0.5;

        // these are our target functions
        var f1 = normA * dy12 - cax1b + cax2b;
        var f2 = normA * dy32 - cax3b + cax2b;

        // this is our iteration stop criterion
        if (Math.abs(f1) <= distTol && Math.abs(f2) <= distTol) {
          // compute the other parameters
          this._normA = normA;
          this._normB = normB;
          this._normC = (i_ny1 + i_ny2 + i_ny3 - (cax1b + cax2b + cax3b) / normA) * THIRD_PART;
          this._cosinusHyperbolicus = true;
          return true;
        }
        // our stop criterion is not reached so far, so we perform the next
        // adjustment by 2-D-Newton iteration
        var sax1b = (eax1bp - eax1bm) * 0.5;
        var sax2b = (eax2bp - eax2bm) * 0.5;
        var sax3b = (eax3bp - eax3bm) * 0.5;
        var df1da = dy12 - sax1b * i_nx1 + sax2b * i_nx2;
        var df1db = -sax1b + sax2b;
        var df2da = dy32 - sax3b * i_nx3 + sax2b * i_nx2;
        var df2db = -sax3b + sax2b;
        var det = df1da * df2db - df1db * df2da;

        // if our determinant is zero our iteration fails
        if (is_zero_infinit_or_invalid(det)) {
          return false;
        }
        normA -= (df2db * f1 - df1db * f2) / det;
        normB -= (df1da * f2 - df2da * f1) / det;
      }
      // reaching this point our iteration has failed
      return false;
    },

    /**
     * Compute a chain through the three given points
     * 
     * @param i_x1
     *          The first x coordinate
     * @param i_y1
     *          The first y coordinate
     * @param i_x2
     *          The second x coordinate
     * @param i_y2
     *          The second y coordinate
     * @param i_x3
     *          The third x coordinate
     * @param i_y3
     *          The third y coordinate
     */
    initForThreePoints: function (i_x1, i_y1, i_x2, i_y2, i_x3, i_y3) {
      // reset, initialize transformation and compute the normalized values
      this.reset();
      var triplet = this._triplet;
      init_triplet(triplet, i_x1, i_y1, i_x2, i_y2, i_x3, i_y3, this._distanceTolerance);
      var x1 = triplet.x1;
      var y1 = triplet.y1;
      var x2 = triplet.x2;
      var y2 = triplet.y2;
      var x3 = triplet.x3;
      var y3 = triplet.y3;
      this._init_transform(x1, y1, x3, y3);
      x1 = this._to_normalized_location(x1);
      y1 = this._to_normalized_height(y1);
      x2 = this._to_normalized_location(x2);
      y2 = this._to_normalized_height(y2);
      x3 = this._to_normalized_location(x3);
      y3 = this._to_normalized_height(y3);

      // depending on the configuration we decide what to do
      switch (triplet.state) {
        case POINT_SITUATION_VALID:
          this._init_for_three_normalized_points(x1, y1, x2, y2, x3, y3);
          this._valid = true;
          return true;
        case POINT_SITUATION_INVALID_DOUBLE_START:
        case POINT_SITUATION_INVALID_DOUBLE_END:
          init_parabola_for_two_points(this._parabola, x1, y1, x3, y3);
          this._cosinusHyperbolicus = false;
          this._valid = true;
          return true;
        case POINT_SITUATION_INVALID_TRIPLE_POINT:
        default:
          this.reset();
          return false;
      }
    },

    /**
     * Compute a chain through the two given points and a given length. This
     * might not work if the length is to short.
     * 
     * @param i_x1
     *          The first x coordinate
     * @param i_y1
     *          The first y coordinate
     * @param i_x2
     *          The second x coordinate
     * @param i_y2
     *          The second y coordinate
     * @param i_length
     *          The length
     */
    initForLength: function (i_x1, i_y1, i_x2, i_y2, i_length) {
      // reset, initialize transformation and compute the normalized values
      this.reset();
      var distTol = this._distanceTolerance;
      var tuple = this._tuple;
      init_tupel(tuple, i_x1, i_y1, i_x2, i_y2, distTol);
      var x1 = tuple.x1;
      var y1 = tuple.y1;
      var x2 = tuple.x2;
      var y2 = tuple.y2;
      this._init_transform(x1, y1, x2, y2);
      x1 = this._to_normalized_location(x1);
      y1 = this._to_normalized_height(y1);
      x2 = this._to_normalized_location(x2);
      y2 = this._to_normalized_height(y2);

      // depending on the configuration we decide what to do
      switch (tuple.state) {
        case POINT_SITUATION_VALID:
          init_parabola_for_two_points(this._parabola, x1, y1, x2, y2);
          break;
        case POINT_SITUATION_INVALID_DOUBLE_POINT:
        default:
          this.reset();
          return false;
      }
      // next we check if our rope length is long enough for the distance
      // between
      // our two points
      var length = this._to_normalized(i_length);
      var dx = x2 - x1;
      var dy = y2 - y1;
      var distSq = dx * dx + dy * dy;
      var lenSq = length * length;
      if (lenSq <= distSq) {
        this.reset();
        return false;
      }
      // in the following loop we try to find a minimum and maximum sag, always
      // computing the resulting length
      var xm = (x1 + x2) * 0.5;
      var ym = (y1 + y2) * 0.5;
      var sag1 = 0.0;
      var sag2 = Math.abs(dx) + Math.abs(dy);
      var found = false;
      var maxIter = this._maxIterations;
      var lenTol = this._lengthTolerance;
      for (var i = 0; i < maxIter; i++) {
        this._init_for_three_normalized_points(x1, y1, xm, ym - sag2, x2, y2);
        var normLength = this._get_normalized_distance(x1, x2);
        if (normLength < length - lenTol) {
          sag1 = sag2;
          sag2 *= 2.0;
        }
        else {
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
      var csag = (sag1 + sag2) * 0.5;
      var dsag = (sag2 - sag1) * 0.25;
      found = false;
      for (var i = 0; i < maxIter; i++) {
        this._init_for_three_normalized_points(x1, y1, xm, ym - csag, x2, y2);
        var normLength = this._get_normalized_distance(x1, x2);
        if (normLength > length + lenTol) {
          csag -= dsag;
        }
        else if (normLength < length - lenTol) {
          csag += dsag;
        }
        else {
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
      var normA = this._normA;
      var normB = this._normB;
      // finally we do the 2-D-Newton iteration to find the best parameters
      for (var i = 0; i < maxIter; i++) {
        // the following calculations are done because of performance
        // reasons
        var ax1b = normA * x1 + normB;
        var ax2b = normA * x2 + normB;
        var eax1bp = Math.exp(ax1b);
        var eax2bp = Math.exp(ax2b);
        var eax1bm = 1.0 / eax1bp;
        var eax2bm = 1.0 / eax2bp;
        var sax1b = (eax1bp - eax1bm) * 0.5;
        var sax2b = (eax2bp - eax2bm) * 0.5;
        var cax1b = (eax1bp + eax1bm) * 0.5;
        var cax2b = (eax2bp + eax2bm) * 0.5;
        var dsax10b = sax2b - sax1b;
        var dcax01b = cax1b - cax2b;

        // these are our target functions
        var f1 = -normA * dy - cax1b + cax2b;
        var f2 = sax2b - sax1b - normA * length;

        // this is our iteration stop criterion
        if (Math.abs(f1) <= distTol && Math.abs(f2) <= distTol) {
          // compute the other parameters
          this._normA = normA;
          this._normB = normB;
          this._normC = (y1 + y2 - (cosh(normA * x1 + normB) + cosh(normA * x2 + normB)) / normA) * 0.5;
          this._valid = true;
          return true;
        }
        // our stop criterion is not reached so far, so we perform the next
        // adjustment by 2-D-Newton iteration
        var df1da = -dy - sax1b * x1 + sax2b * x2;
        var df1db = -sax1b + sax2b;
        var df2da = cax2b * x2 - cax1b * x1 - length;
        var df2db = cax2b - cax1b;
        var det = df1da * df2db - df1db * df2da;

        // if our determinant is zero our iteration fails
        if (is_zero_infinit_or_invalid(det)) {
          break;
        }
        normA -= (df2db * f1 - df1db * f2) / det;
        normB -= (df1da * f2 - df2da * f1) / det;
      }
      this.reset();
      return false;
    },

    /**
     * Compute a chain through the two given points with the minimum force.
     * 
     * @param i_x1
     *          The first x coordinate
     * @param i_y1
     *          The first y coordinate
     * @param i_x2
     *          The second x coordinate
     * @param i_y2
     *          The second y coordinate
     * @param i_x
     *          The x coordinate where we want the force to be minimal
     */
    initForMinimumForce: function (i_x1, i_y1, i_x2, i_y2, i_x) {
      this.reset();
      var distTol = this._distanceTolerance;
      var tuple = this._tuple;
      init_tupel(tuple, i_x1, i_y1, i_x2, i_y2, distTol);
      var x1 = tuple.x1;
      var y1 = tuple.y1;
      var x2 = tuple.x2;
      var y2 = tuple.y2;
      this._init_transform(x1, y1, x2, y2);
      x1 = this._to_normalized_location(x1);
      y1 = this._to_normalized_height(y1);
      x2 = this._to_normalized_location(x2);
      y2 = this._to_normalized_height(y2);
      var x = this._to_normalized_location(i_x);
      switch (tuple.state) {
        case POINT_SITUATION_VALID:
          init_parabola_for_two_points(this._parabola, x1, y1, x2, y2);
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
      var dx = x2 - x1;
      var dy = y2 - y1;
      var xm = (x1 + x2) * 0.5;
      var ym = (y1 + y2) * 0.5;
      var sag0 = 0.0;
      var sag3 = Math.abs(dx) + Math.abs(dy);
      var dsag = (sag3 - sag0) * GOLDEN_SECTION_INTERVAL_PART;
      var sag1 = sag0 + dsag;
      var sag2 = sag3 - dsag;
      this._init_for_three_normalized_points(x1, y1, xm, ym - sag1, x2, y2);
      var frc1 = this._get_normalized_force(x);
      this._init_for_three_normalized_points(x1, y1, xm, ym - sag2, x2, y2);
      var frc2 = this._get_normalized_force(x);
      var maxIter = this._maxIterations;
      for (var i = 0; i < maxIter && dsag > distTol; i++) {
        if (frc1 > frc2) {
          sag0 = sag1;
          sag1 = sag2;
          frc1 = frc2;
          dsag = (sag3 - sag0) * GOLDEN_SECTION_INTERVAL_PART;
          sag2 = sag3 - dsag;
          this._init_for_three_normalized_points(x1, y1, xm, ym - sag2, x2, y2);
          frc2 = this._get_normalized_force(x);
        }
        else {
          sag3 = sag2;
          sag2 = sag1;
          frc2 = frc1;
          dsag = (sag3 - sag0) * GOLDEN_SECTION_INTERVAL_PART;
          sag1 = sag0 + dsag;
          this._init_for_three_normalized_points(x1, y1, xm, ym - sag1, x2, y2);
          frc1 = this._get_normalized_force(x);
        }
      }
      if (dsag <= distTol) {
        this._valid = true;
        return true;
      }
      else {
        this.reset();
        return false;
      }
    },

    /**
     * Compute a chain through the two given points and a given force at a given
     * location.
     * 
     * @param i_x1
     *          The first x coordinate
     * @param i_y1
     *          The first y coordinate
     * @param i_x2
     *          The second x coordinate
     * @param i_y2
     *          The second y coordinate
     * @param i_x
     *          The location for the given force
     * @param i_force
     *          The force for the given location
     * @param i_q0
     *          The weight per meter
     */
    initForForce: function (i_x1, i_y1, i_x2, i_y2, i_x, i_force, i_q0) {
      // First we initialize our chain for the minimum possible force at the
      // given location. If the given force is less we return unsuccessfully.
      this.initForMinimumForce(i_x1, i_y1, i_x2, i_y2, i_x);
      if (this._cosinusHyperbolicus !== true) {
        this.reset();
        return false;
      }
      var tuple = this._tuple;
      var x1 = this._to_normalized_location(tuple.x1);
      var y1 = this._to_normalized_height(tuple.y1);
      var x2 = this._to_normalized_location(tuple.x2);
      var y2 = this._to_normalized_height(tuple.y2);
      var x = this._to_normalized_location(i_x);
      var force = typeof i_q0 === 'number' && i_q0 > 0.0 ? i_force / i_q0 : i_force;
      var normForce = this._to_normalized(force);
      var minForce = this._get_normalized_force(x);
      if (normForce < minForce) {
        this.reset();
        return false;
      }
      // If we reach this point we know that the required force is reachable, By
      // varying the sag, we try to approximate a chain for the required force.
      var xm = (x1 + x2) * 0.5;
      var ym = (y1 + y2) * 0.5;
      var csag = (ym - this._get_normalized_height(xm)) * 0.5;
      var dsag = csag * 0.5;
      var maxIter = this._maxIterations;
      var distTol = this._distanceTolerance;
      for (var i = 0; i < maxIter && dsag > distTol; i++) {
        this._init_for_three_normalized_points(x1, y1, xm, ym - csag, x2, y2);
        var force = this._get_normalized_force(x);
        if (force < normForce) {
          csag -= dsag;
        }
        else {
          csag += dsag;
        }
        dsag *= 0.5;
      }
      // To get the best results we finally perform a 2 D-Newton iteration with
      // our start values calculated in the loop before.
      var dy = y2 - y1;
      var normA = this._normA;
      var normB = this._normB;
      for (var i = 0; i < maxIter; i++) {
        var ax1b = normA * x1 + normB;
        var ax2b = normA * x2 + normB;
        var axb = normA * x + normB;
        var eax1bp = Math.exp(ax1b);
        var eax1bm = 1.0 / eax1bp;
        var eax2bp = Math.exp(ax2b);
        var eax2bm = 1.0 / eax2bp;
        var eaxbp = Math.exp(axb);
        var eaxbm = 1.0 / eaxbp;
        var cax1b = (eax1bp + eax1bm) * 0.5;
        var cax2b = (eax2bp + eax2bm) * 0.5;
        var caxb = (eaxbp + eaxbm) * 0.5;
        var f1 = -normA * dy - cax1b + cax2b;
        var f2 = caxb - normA * normForce;
        if (Math.abs(f1) <= distTol && Math.abs(f2) <= distTol) {
          var normC = (y1 + y2 - (cosh(normA * x1 + normB) + cosh(normA * x2 + normB)) / normA) * 0.5;
          var parabola = this._parabola;
          parabola.a = normA * 0.5;
          parabola.b = normB;
          parabola.c = (2.0 + normB * normB) * 0.5 / normA + normC;
          this._normA = normA;
          this._normB = normB;
          this._normC = normC;
          this._cosinusHyperbolicus = true;
          this._valid = true;
          return true;
        }
        var sax1b = (eax1bp - eax1bm) * 0.5;
        var sax2b = (eax2bp - eax2bm) * 0.5;
        var saxb = (eaxbp - eaxbm) * 0.5;
        var df1da = -dy - sax1b * x1 + sax2b * x2;
        var df1db = -sax1b + sax2b;
        var df2da = saxb * x - normForce;
        var df2db = saxb;
        var det = df1da * df2db - df1db * df2da;
        if (is_zero_infinit_or_invalid(det)) {
          break;
        }
        normA -= (df2db * f1 - df1db * f2) / det;
        normB -= (df1da * f2 - df2da * f1) / det;
      }
      this.reset();
      return false;
    },

    /**
     * Get the y coordinate for the given x coordinate
     * 
     * @param i_x
     *          The x coordinate
     * @return The y coordinate
     */
    getHeight: function (i_x) {
      if (this._cosinusHyperbolicus) {
        var nx = this._to_normalized_location(i_x);
        var ny = this._get_normalized_height(nx);
        return this._from_normalized_height(ny);
      }
      else if (this._valid) {
        var nx = this._to_normalized_location(i_x);
        var ny = get_parabola_value(this._parabola, nx);
        return this._from_normalized_height(ny);
      }
      else {
        return 0.0;
      }
    },

    /**
     * Get the gradient e.g. the first derivation value for the given x
     * coordinate
     * 
     * @param i_x
     *          The x coordinate
     * @return The gradient value
     */
    getGradient: function (i_x) {
      var nx = this._to_normalized_location(i_x);
      return sinh(this._normA * nx + this._normB);
    },

    /**
     * Get the angle for the given x coordinate
     * 
     * @param i_x
     *          The x coordinate
     * @return The angle
     */
    getAngle: function (i_x) {
      var grad = this.getGradient(i_x);
      return Math.atan2(grad, 1.0);
    },

    /**
     * Get the x coordinate for the minimum y value
     * 
     * @return The x coordinate
     */
    getMinimumLocation: function () {
      var nx = -this._normB / this._normA;
      return this._from_normalized_location(nx);
    },

    /**
     * Get the minimum y coordinate
     * 
     * @return The minimum y coordinate
     */
    getMinimumHeight: function () {
      var ny = 1.0 / this._normA + this._normC;
      return this._from_normalized_height(ny);
    },

    /**
     * Get the length between the given x coordinates
     * 
     * @param i_x1
     *          The first x coordinate
     * @param i_x2
     *          The second x coordinate
     * @return The length
     */
    getLength: function (i_x1, i_x2) {
      var x1 = Math.min(i_x1, i_x2);
      var x2 = Math.max(i_x1, i_x2);
      var nx1 = this._to_normalized_location(x1);
      var nx2 = this._to_normalized_location(x2);
      var nd = this._get_normalized_distance(nx1, nx2);
      return this._from_normalized(nd);
    },

    /**
     * Get the x coordinate for the given offset and distance
     * 
     * @param i_offsetX
     *          The offset x coordinate
     * @param i_distance
     *          The distance (may be negative)
     * @return The x coordinate
     */
    getLocation: function (i_offsetX, i_distance) {
      var nx = this._to_normalized_location(i_offsetX);
      var normA = this._normA;
      var normB = this._normB;
      var sh = sinh(normA * nx + normB);
      var nd = this._to_normalized(i_distance);
      var nl = (asinh(normA * nd + sh) - normB) / normA;
      return this._from_normalized_location(nl);
    },

    /**
     * Get the force for the given x coordinate
     * 
     * @param i_x
     *          The x coordinate
     * @param i_weightPerMeter
     *          The weight per meter
     * @param i_gravitation
     *          The gravitation constant
     * @return The force
     */
    getForce: function (i_x, i_weightPerMeter, i_gravitation) {
      var nx = this._to_normalized_location(i_x);
      var nf = this._get_normalized_force(nx);
      var q0 = typeof i_gravitation === 'number' && i_gravitation > 0.0 ? i_weightPerMeter * i_gravitation : i_weightPerMeter;
      return this._from_normalized(nf) * q0;
    },

    /**
     * Returns the current state.
     * 
     * @return true if a chain has been computed
     */
    isValid: function () {
      return this._valid;
    },

    /**
     * Returns the current state.
     * 
     * @return true if a chain has been computed with a cosinus hyperbolicus
     */
    isCosinusHyperbolicus: function () {
      return this._cosinusHyperbolicus;
    },

    /**
     * Get the parameter "a" of the equation <code>
     *   y = f(x) = cosh(a*x + b)/a + c
     * </code>
     * 
     * @return The parameter "a"
     */
    getA: function () {
      return this._normA * this._transScale;
    },

    /**
     * Get the parameter "b" of the equation <code>
     *   y = f(x) = cosh(a*x + b)/a + c
     * </code>
     * 
     * @return The parameter "b"
     */
    getB: function () {
      return this._normA * this._transXOffset + this._normB;
    },

    /**
     * Get the parameter "c" of the equation <code>
     *   y = f(x) = cosh(a*x + b)/a + c
     * </code>
     * 
     * @return The parameter "c"
     */
    getC: function () {
      return this._normC * this._transScaleInv - this._transYOffset;
    },
  };

  function fn_normalize_rope_angle(i_phi) {
    var phi = i_phi;
    while (phi < -HALF_PI) {
      phi += TWO_PI;
    }
    while (phi >= THREE_HALF_PI) {
      phi -= TWO_PI;
    }
    return phi;
  }

  /**
   * This method computes a support between two chains
   * 
   * @param i_chainFunction1
   *          The first chain function
   * @param i_chainFunction2
   *          The second chain function
   * @param i_x
   *          The x coordinate where our chains are "connected"
   * @param i_radius
   *          The saddle radius
   * @param i_maxIterations
   *          The maximum iteration count
   * @param i_tolerance
   *          The tolerance for our iteration process
   * @return True if the support has been computed successfully
   */
  function fn_compute_support(i_chainFunction1, i_chainFunction2, i_x, i_radius, i_maxIterations, i_tolerance, i_increasingX) {
    if (typeof i_radius !== 'number' || i_radius <= 0.0) {
      // invalid radius
      return false;
    }
    var incX = i_increasingX === true;
    var grad1 = i_chainFunction1.getGradient(i_x);
    var grad2 = i_chainFunction2.getGradient(i_x);
    var up = incX ? grad1 >= grad2 : grad1 <= grad2;
    var x1 = i_x;
    var x2 = i_x;
    var r = i_radius;
    var a1 = i_chainFunction1.getA();
    var b1 = i_chainFunction1.getB();
    var c1 = i_chainFunction1.getC();
    var a2 = i_chainFunction2.getA();
    var b2 = i_chainFunction2.getB();
    var c2 = i_chainFunction2.getC();
    var maxIterations = typeof i_maxIterations === 'number' && i_maxIterations > 0 ? i_maxIterations : DEFAULT_MAX_ITERATIONS;
    var tolerance = typeof i_tolerance === 'number' && i_tolerance > 0 ? i_tolerance : DEFAULT_DISTANCE_TOLERANCE;
    for (var i = 0; i < maxIterations; i++) {
      var a1x1b1 = a1 * x1 + b1;
      var a2x2b2 = a2 * x2 + b2;
      var ea1x1b1p = Math.exp(a1x1b1);
      var ea1x1b1m = 1.0 / ea1x1b1p;
      var ea2x2b2p = Math.exp(a2x2b2);
      var ea2x2b2m = 1.0 / ea2x2b2p;
      var ca1x1b1 = (ea1x1b1p + ea1x1b1m) * 0.5;
      var sa1x1b1 = (ea1x1b1p - ea1x1b1m) * 0.5;
      var ca2x2b2 = (ea2x2b2p + ea2x2b2m) * 0.5;
      var sa2x2b2 = (ea2x2b2p - ea2x2b2m) * 0.5;
      var y1 = ca1x1b1 / a1 + c1;
      var y2 = ca2x2b2 / a2 + c2;
      var f1 = up ? (x1 + r * sa1x1b1 / ca1x1b1 - x2 - r * sa2x2b2 / ca2x2b2) : (x1 - r * sa1x1b1 / ca1x1b1 - x2 + r * sa2x2b2 / ca2x2b2);
      var f2 = up ? (y1 - r / ca1x1b1 - y2 + r / ca2x2b2) : (y1 + r / ca1x1b1 - y2 - r / ca2x2b2);
      if (Math.abs(f1) <= tolerance && Math.abs(f2) <= tolerance) {
        var centerX = up ? ((x1 + r * sa1x1b1 / ca1x1b1 + x2 + r * sa2x2b2 / ca2x2b2) * 0.5) : ((x1 - r * sa1x1b1 / ca1x1b1 + x2 - r * sa2x2b2 / ca2x2b2) * 0.5);
        var centerY = up ? ((y1 - r / ca1x1b1 + y2 - r / ca2x2b2) * 0.5) : ((y1 + r / ca1x1b1 + y2 + r / ca2x2b2) * 0.5);
        var phi1 = Math.atan2(y1 - centerY, x1 - centerX);
        var phi2 = Math.atan2(y2 - centerY, x2 - centerX);
        var left = incX !== up;
        return {
          up: up,
          left: left,
          right: incX === up,
          centerX: centerX,
          centerY: centerY,
          radius: i_radius,
          startX: x1,
          startY: y1,
          startPhi: fn_normalize_rope_angle(left ? phi1 + HALF_PI : phi1 - HALF_PI),
          endX: x2,
          endY: y2,
          endPhi: fn_normalize_rope_angle(left ? phi2 + HALF_PI : phi2 - HALF_PI)
        };
      }
      var ca1x1b1Sq = ca1x1b1 * ca1x1b1;
      var ca2x2b2Sq = ca2x2b2 * ca2x2b2;
      var df1dx1 = up ? (1.0 + r * a1 / ca1x1b1Sq) : (1.0 - r * a1 / ca1x1b1Sq);
      var df1dx2 = up ? (-1.0 - r * a2 / ca2x2b2Sq) : (-1.0 + r * a2 / ca2x2b2Sq);
      var df2dx1 = up ? (sa1x1b1 + a1 * r * sa1x1b1 / ca1x1b1Sq) : (sa1x1b1 - a1 * r * sa1x1b1 / ca1x1b1Sq);
      var df2dx2 = up ? (-sa2x2b2 - a2 * r * sa2x2b2 / ca2x2b2Sq) : (-sa2x2b2 + a2 * r * sa2x2b2 / ca2x2b2Sq);
      var det = df1dx1 * df2dx2 - df1dx2 * df2dx1;

      // if our determinant is zero our iteration fails
      if (is_zero_infinit_or_invalid(det)) {
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
  function fn_get_relative_linear_values(i_x1, i_x2, i_referenceX, i_x, i_values) {
    var val = i_values || {};
    if (i_x2 > i_x1) {
      if (i_x < i_referenceX) {
        var denom = i_referenceX - i_x1;
        val.value = (i_x - i_x1) / denom;
        val.gradient = 1.0 / denom;
      }
      else if (i_x > i_referenceX) {
        var denom = i_x2 - i_referenceX;
        val.value = (i_x2 - i_x) / denom;
        val.gradient = -1.0 / denom;
      }
      else {
        val.value = 1.0;
        val.gradient = 0.5 * (1.0 / (i_referenceX - i_x1) - 1.0 / (i_x2 - i_referenceX));
      }
    }
    else {
      if (i_x < i_referenceX) {
        var denom = i_referenceX - i_x2;
        val.value = (i_x - i_x2) / denom;
        val.gradient = 1.0 / denom;
      }
      else if (i_x > i_referenceX) {
        var denom = i_x1 - i_referenceX;
        val.value = (i_x1 - i_x) / denom;
        val.gradient = -1.0 / denom;
      }
      else {
        val.value = 1.0;
        val.gradient = 0.5 * (1.0 / (i_referenceX - i_x2) - 1.0 / (i_x1 - i_referenceX));
      }
    }
    return val;
  }

  function fn_get_linear_height(i_x1, i_y1, i_x2, i_y2, i_x) {
    return i_y1 + (i_x - i_x1) * (i_y2 - i_y1) / (i_x2 - i_x1);
  }

  function get_steel_rope_q0(i_diameter) {
    // compute the cross section [m^2]
    var cross_section = i_diameter * i_diameter * 0.25 * PI;
    // compute the weight per meter [kg/m] = [kg/m^3] * [m^2]
    var weight_per_meter = SPECIFIC_GRAVITY_OF_STEEL * cross_section;
    // [kg/s^2] = [kg/m] * [m/s^2]
    return weight_per_meter * EARTH_GRAVITATION;
  }

  function fn_get_smooth_rope_sag_factor(i_x1, i_x2, i_x, i_s1, i_s2) {
    var xm = (i_x1 + i_x2) * 0.5;
    var lx = Math.abs(i_x2 - xm);
    var dx = Math.abs(i_x - xm);
    return fn_get_smooth_normalized_transfer(Math.abs(i_x - xm) / Math.abs(i_x2 - xm), i_s1, i_s2);
  }

  var RopeLine = function (i_curve) {
    // ACHTUNG: Wenn ein Seil mit Kraftausgleich �ber mehrere St�tzen geht,
    // verh�lt sich die horizontale L�nge, schr�nge L�nge und Seill�nge in etwa
    // proportional.
    // Der Durchhang jedoch ist bei kleineren Feldern unterproportional kleiner,
    // die vertikale Distanz hingegen minimal gr�sser.

    // public fields
    this.length = 0.0;

    // internal parameters
    this._curve = i_curve;
    this._stress1 = DEFAULT_STRESS_S1;
    this._stress2 = DEFAULT_STRESS_S2;
    this._maxIterations = typeof i_curve.maxIterations === 'number' && i_curve.maxIterations > 0 ? i_curve.maxIterations : DEFAULT_MAX_ITERATIONS;
    this._distanceTolerance = typeof i_curve.distanceTolerance === 'number' && i_curve.distanceTolerance > 0 ? i_curve.distanceTolerance : DEFAULT_DISTANCE_TOLERANCE;
    this._increasingX = undefined;
    this._counterweight0 = undefined;
    this._counterweight1 = undefined;
    this._q0 = undefined;
    this._p = {};
    this._parts = [];
    this._fields = [];
    this._adjuster = new Adjuster();
    this._tf = new Transform();

    // initialize
    this.adjust();
    this._init();
  };

  RopeLine.prototype = {
    adjust: function () {
      var fields = this._fields;
      var curve = this._curve;
      // adjust transform
      this._tf.setToIdentity();
      this._tf.setToCoordinateTransform(curve);
      // handle stressing vehicle
      var stressX = curve.stressX;
      var stressSag = curve.stressSag;
      var stressAvailable = false;
      if (typeof stressX === 'number' && typeof stressSag === 'number') {
        for (var i = 0; i < fields.length; i++) {
          var field = fields[i];
          var saddle1x = field.saddle1x;
          var saddle2x = field.saddle2x;
          if (this._increasingX ? (saddle1x < stressX && stressX < saddle2x) : (saddle2x < stressX && stressX < saddle1x)) {
            stressAvailable = true;
            var rate = fn_get_smooth_rope_sag_factor(saddle1x, saddle2x, stressX, this._stress1, this._stress2) * field.relative_rate;
            var max_sag = stressSag / rate;
            for (var j = 0; j < fields.length; j++) {
              var fld = fields[j];
              fld.middle_stress_sag = max_sag * fld.relative_rate;
            }
            break;
          }
        }
      }
      if (stressAvailable === false) {
        for (var i = 0; i < fields.length; i++) {
          var field = fields[i];
          delete field.middle_stress_sag;
        }
      }
    },
    _reset: function () {
      // clean up
      this._fields.splice(0, this._fields.length);
      this._parts.splice(0, this._parts.length);
      this.length = 0.0;
      this._increasingX = undefined;
      this._counterweight0 = undefined;
      this._counterweight1 = undefined;
      this._adjuster.reset();
    },
    _load_config: function () {
      var curve = this._curve;
      // if invalid configuration we do not perform
      if (curve === null || typeof curve !== 'object') {
        console.error('ERROR! No rope configuration available.');
        return false;
      }
      // ///////////////////////////////////////////////////////////////
      // VALIDITY CHECK
      // ///////////////////////////////////////////////////////////////
      var points = curve.points;
      // if invalid configuration we do not perform
      if ($.isArray(points) !== true || points.length === 0) {
        console.error('ERROR! Rope configuration does not contain valid points.');
        return false;
      }

      // ///////////////////////////////////////////////////////////////
      // WEIGHT PER METER
      // ///////////////////////////////////////////////////////////////
      var weight_per_meter = curve.weightPerMeter;
      if (typeof weight_per_meter === 'number' && weight_per_meter > 0) {
        this._q0 = weight_per_meter * EARTH_GRAVITATION;
      }
      // ///////////////////////////////////////////////////////////////
      // COUNTERWEIGHT
      // ///////////////////////////////////////////////////////////////

      // check for counter weight configuration on first found support
      for (var i = 0; i < points.length; i++) {
        var pos = points[i];
        if (pos !== null && typeof pos === 'object' && pos.type === 'support') {
          if (typeof pos.counterweight === 'number') {
            this._counterweight0 = pos.counterweight;
          }
          break;
        }
      }
      // if not found check for counter weight configuration on last found
      // support
      if (this._counterweight0 === undefined) {
        for (var i = points.length - 1; i >= 0; i--) {
          var pos = points[i];
          if (pos !== null && typeof pos === 'object' && pos.type === 'support') {
            if (typeof pos.counterweight === 'number') {
              this._counterweight1 = pos.counterweight;
            }
            break;
          }
        }
      }
      // ///////////////////////////////////////////////////////////////
      // FIELDS
      // ///////////////////////////////////////////////////////////////

      // next we build an array of fields depending on the available supports
      var prev = undefined;
      var fields = this._fields;
      for (var i = 0; i < points.length; i++) {
        var pos = points[i];
        if (pos !== null && typeof pos === 'object' && pos.type === 'support') {
          if (prev === undefined) {
            prev = pos;
          }
          else {
            var x1 = typeof prev.x === 'number' ? prev.x : 0.0;
            var y1 = typeof prev.y === 'number' ? prev.y : 0.0;
            var x2 = typeof pos.x === 'number' ? pos.x : 0.0;
            var y2 = typeof pos.y === 'number' ? pos.y : 0.0;
            var incx = x1 < x2;
            // if first field we store if our x coordinate is increasing - if
            // following field we check if the x coordinate is increasing as
            // well
            if (this._increasingX === undefined) {
              this._increasingX = incx;
            }
            else if (this._increasingX === true) {
              if (incx !== true) {
                console.error('ERROR! Rope configuration changed from increasing to decreasing x-coordinate (index: ' + i + ', x1: ' + x1 + '. x2: ' + x2 + ')');
                this._reset();
                return false;
              }
            }
            else {
              if (incx === true) {
                console.error('ERROR! Rope configuration changed from decreasing to increasing x-coordinate (index: ' + i + ', x1: ' + x1 + '. x2: ' + x2 + ')');
                this._reset();
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
      var field = undefined;
      for (var i = 0; i < points.length; i++) {
        var pos = points[i];
        if (pos !== null && typeof pos === 'object') {
          for (var j = 0; j < fields.length; j++) {
            var fld = fields[j];
            if (fld.support1config === pos) {
              field = fld;
              break;
            }
          }
          if (field === undefined) {
            continue;
          }
          // try to get rope configuration for every item
          if (this._q0 === undefined && pos.rope !== undefined) {
            if (typeof pos.rope === 'number' && pos.rope > 0) {
              this._q0 = get_steel_rope_q0(pos.rope);
            }
            else if ($.isArray(pos.rope)) {
              var q0 = 0.0;
              for (var j = 0; j < pos.rope.length; j++) {
                var rd = pos.rope[j];
                if (typeof rd === 'number' && rd > 0) {
                  q0 += get_steel_rope_q0(rd);
                }
              }
              if (q0 > 0.0) {
                this._q0 = q0;
              }
            }
          }
          // if a field try to get field parameters
          if (pos.type === 'field') {
            // first check the x location
            var x = pos.x;
            if (typeof x === 'number' && (this._increasingX === true ? (x <= field.support1x || x >= field.support2x) : (x <= field.support2x || x >= field.support1x))) {
              console.error('ERROR! Rope configuration field x-coordinate is outside field bounds (index: ' + i + ')');
              this._reset();
              return false;
            }
            if (typeof pos.length === 'number' && pos.length > 0.0) {
              field.length = pos.length;
            }
            else if (typeof pos.y === 'number') {
              field.x = x !== undefined ? x : (field.support1x + field.support2x) * 0.5;
              var dir_y = fn_get_linear_height(field.support1x, field.support1y, field.support2x, field.support2y, field.x);
              if (pos.y >= dir_y) {
                console.error('ERROR! Rope configuration field y-coordinate is above linear height without any sag (index: ' + i + ')');
                this._reset();
                return false;
              }
              field.y = pos.y;
            }
            else if (typeof pos.sag === 'number' && pos.sag > 0.0) {
              field.x = x !== undefined ? x : (field.support1x + field.support2x) * 0.5;
              var dir_y = fn_get_linear_height(field.support1x, field.support1y, field.support2x, field.support2y, field.x);
              field.y = dir_y - pos.sag;
            }
            else if (typeof pos.force === 'number' && pos.force > 0.0) {
              field.x = x !== undefined ? x : (field.support1x + field.support2x) * 0.5;
              field.force = pos.force;
            }
          }
        }
      }
      // success if we collected any fields
      return fields.length > 0;
    },
    _compute_rope_line: function () {
      var fields = this._fields;
      // if we got a counter weight in our first (or last) station we initialize
      // the first (or last) field
      if (this._counterweight0 !== undefined) {
        var field = fields[0];
        var chain = field.chain;
        chain.initForForce(field.support1x, field.support1y, field.support2x, field.support2y, field.support1x, this._counterweight0 * EARTH_GRAVITATION, this._q0);
        field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
      }
      else if (this._counterweight1 !== undefined) {
        var field = fields[fields.length - 1];
        var chain = field.chain;
        chain.initForForce(field.support1x, field.support1y, field.support2x, field.support2y, field.support2x, this._counterweight1 * EARTH_GRAVITATION, this._q0);
        field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
      }
      // initialize all not already initialized fields with given parameters
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field.valid === undefined) {
          var chain = field.chain;
          if (field.length !== undefined) {
            chain.initForLength(field.support1x, field.support1y, field.support2x, field.support2y, field.length);
            field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
          }
          else if (field.x !== undefined && field.y !== undefined) {
            chain.initForThreePoints(field.support1x, field.support1y, field.support2x, field.support2y, field.x, field.y);
            field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
          }
          else if (field.force !== undefined && field.x !== undefined) {
            chain.initForForce(field.support1x, field.support1y, field.support2x, field.support2y, field.x, field.force, this._q0);
            field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
          }
        }
      }
      // now initialize all other fields
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field.valid === true) {
          var chain = field.chain;
          // if we found a valid field we iterate over all following and not yet
          // initialized fields in both directions and initialize them for
          // equilibrium of forces.
          var idx = i - 1;
          var force = chain.getForce(field.support1x, 1.0);
          while (idx >= 0 && fields[idx].valid === undefined) {
            var fld = fields[idx];
            fld.chain.initForForce(fld.support1x, fld.support1y, fld.support2x, fld.support2y, fld.support2x, force);
            fld.valid = fld.chain.isValid() || fld.chain.isCosinusHyperbolicus();
            force = fld.chain.getForce(fld.support1x, 1.0);
            idx--;
          }
          idx = i + 1;
          force = chain.getForce(field.support2x, 1.0);
          while (idx < fields.length && fields[idx].valid === undefined) {
            var fld = fields[idx];
            fld.chain.initForForce(fld.support1x, fld.support1y, fld.support2x, fld.support2y, fld.support1x, force);
            fld.valid = fld.chain.isValid() || fld.chain.isCosinusHyperbolicus();
            force = fld.chain.getForce(fld.support2x, 1.0);
            idx++;
          }
        }
      }
      // now we initialize all fields not yet initialized with default minimum
      // force on lower support
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (field.valid === undefined) {
          var chain = field.chain;
          var x = field.support1y <= field.support2y ? field.support1x : field.support2x;
          chain.initForMinimumForce(field.support1x, field.support1y, field.support2x, field.support2y, x);
          field.valid = chain.isValid() || chain.isCosinusHyperbolicus();
        }
      }
      // after all fields have been initialized we compute the saddles depending
      // on the radius
      for (var i = 1; i < fields.length; i++) {
        var field1 = fields[i - 1];
        var field2 = fields[i];
        var support = fn_compute_support(field1.chain, field2.chain, field1.support2x, field1.support2config.r, this._maxIterations, this._distanceTolerance, this._increasingX === true);
        if (support !== false) {
          support.config = field1.support2config;
          field1.sup2data = support;
          field1.saddle2x = support.startX;
          field1.saddle2y = support.startY;
          field2.sup1data = support;
          field2.saddle1x = support.endX;
          field2.saddle1y = support.endY;
        }
        else {
          field1.sup2data = false;
          field2.sup1data = false;
        }
      }
      // finally we compute the relative rate for every field for our stress
      // simulation
      var max_delta_x = 0.0;
      var max_sag = 0.0;
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var chain = field.chain;
        var saddle1x = field.saddle1x;
        var saddle2x = field.saddle2x;
        field._saddle_delta_x = Math.abs(saddle2x - saddle1x);
        var xmid = (saddle1x + saddle2x) * 0.5;
        var ylin = fn_get_linear_height(saddle1x, field.saddle1y, saddle2x, field.saddle2y, xmid);
        var yr = chain.getHeight(xmid);
        field._middle_sag = ylin - yr;
        // update to the max
        max_sag = Math.max(max_sag, field._middle_sag);
        max_delta_x = Math.max(max_delta_x, field._saddle_delta_x);
      }
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        field.relative_rate = (field._saddle_delta_x / max_delta_x + field._middle_sag / max_sag) * 0.5;
        delete field._saddle_delta_x;
        delete field._middle_sag;
      }
    },
    _compute_parts: function () {
      var fields = this._fields;
      var le = 0.0;
      if (fields.length > 0) {
        var parts = this._parts;
        var adjuster = this._adjuster;
        var field = fields[0];
        var supcfg = field.support1config;
        var dist = typeof supcfg.position === 'number' ? supcfg.position : 0.0;
        adjuster.reset(dist, 0.0, supcfg.id);
        for (var i = 0; i < fields.length; i++) {
          field = fields[i];
          var chain = field.chain;
          var x1 = field.saddle1x;
          var y1 = chain.getHeight(x1);
          var x2 = field.saddle2x;
          var y2 = chain.getHeight(x2);
          var length = chain.getLength(x1, x2);
          parts.push({
            arc: false,
            x1: x1,
            y1: y1,
            s1: le,
            x2: x2,
            y2: y2,
            s2: le + length,
            length: length,
            field: field
          });
          le += length;
          var support = field.sup2data;
          if (support !== null && typeof support === 'object') {
            var angle = support.endPhi - support.startPhi;
            var len = Math.abs(angle) * support.radius;
            var s1 = le;
            var s = le + len / 2;
            var s2 = le + len;
            var sup = {
              arc: support,
              s1: s1,
              s: s,
              s2: s2,
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
    },
    _format_rope_info: function () {
      var txt = 'ROPE LINE INFO\n\n';
      var parts = this._parts;
      var le = 0.0;
      for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        var arc = part.arc;
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
          var mphi = (arc.endPhi + arc.startPhi) / 2;
          txt += 'middle phi: ' + mphi + ' / ' + (mphi * RAD2DEG) + ' grad\n';
          var dphi = Math.abs(arc.endPhi - arc.startPhi);
          txt += 'delta phi: ' + dphi + ' / ' + (dphi * RAD2DEG) + ' grad\n';
          txt += JSONX.stringify(arc, undefined, 2);
          txt += '\n\n';
        }
        else {
          var field = part.field;
          var chain = field.chain;
          var x1 = field.saddle1x;
          var x2 = field.saddle2x;
          var angle1 = chain.getAngle(x1) * RAD2DEG;
          var force1 = chain.getForce(x1, this._q0);
          txt += 'x1 = ' + x1 + ' y1 = ' + field.saddle1y + ' angle1 = ' + angle1 + ' force1 = ' + force1 + '\n';
          var angle2 = chain.getAngle(x2) * RAD2DEG;
          var force2 = chain.getForce(x2, this._q0);
          txt += 'x2 = ' + x2 + ' y2 = ' + field.saddle2y + ' angle2 = ' + angle2 + ' force2 = ' + force2 + '\n';
          txt += 'mode: ' + (chain.isCosinusHyperbolicus() === true ? 'cosh' : (chain.isValid() === true ? 'parabola' : 'none')) + '\n';
          txt += 'stress rate: ' + field.relative_rate + '\n\n';
        }
      }
      txt += '\n\n' + this._adjuster.format();
      return txt;
    },
    _init: function () {
      this._reset();
      // if invalid data
      if (this._load_config() !== true) {
        return false;
      }
      // compute
      this._compute_rope_line();
      // finally we collect the parts
      this._compute_parts();
      // if verbose mode we got to dump some information
      if (this._curve.verbose === true) {
        console.log(this._format_rope_info());
      }
    },
    setVehiclePosition: function (i_position) {
      var position = this._adjuster.adjust(i_position);
      var fields = this._fields;
      // search the field containing the given stress position
      var start = 0.0;
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var chain = field.chain;
        var saddle1x = field.saddle1x;
        var saddle2x = field.saddle2x;
        var length = chain.getLength(saddle1x, saddle2x);
        var end = start + length;
        if (field.middle_stress_sag !== undefined && position > start && position < end) {
          field.vehicle_position = position;
          var x = chain.getLocation(saddle1x, this._increasingX === true ? position - start : start - position);
          field.vehicle_x = x;
          field.vehicle_stress_rate = fn_get_smooth_rope_sag_factor(saddle1x, saddle2x, x, this._stress1, this._stress2);
        }
        else {
          delete field.vehicle_position;
          delete field.vehicle_x;
          delete field.vehicle_stress_rate;
        }
        start = end;
        var support = field.sup2data;
        if (support !== null && typeof support === 'object') {
          length = Math.abs(support.endPhi - support.startPhi) * support.radius;
          end = start + length;
        }
        start = end;
      }
    },
    getLength: function () {
      return this.length;
    },
    isIncreasingX: function () {
      return this._increasingX;
    },
    _get_position_on_rope_line: function (i_position, i_left, i_point) {
      var start = 0.0;
      var fields = this._fields;
      var tf = this._tf;
      var mirrored = tf.mirrorX !== tf.mirrorY;
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        var chain = field.chain;
        var saddle1x = field.saddle1x;
        var saddle2x = field.saddle2x;
        var length = chain.getLength(saddle1x, saddle2x);
        var end = start + length;
        if (i_position >= start && i_position <= end) {
          // first we compute the original rope point coordinates and the
          // gradient
          var x = chain.getLocation(saddle1x, this._increasingX === true ? i_position - start : start - i_position);
          var y = chain.getHeight(x);
          var gradient = chain.getGradient(x);
          // if we have a vehicle within the field we lower the y coordinate and
          // gradient
          var vehicle_x = field.vehicle_x;
          if (vehicle_x !== undefined) {
            var vehicle_stress_rate = field.vehicle_stress_rate;
            var rel = this._p;
            fn_get_relative_linear_values(saddle1x, saddle2x, vehicle_x, x, rel);
            var stress_sag = vehicle_stress_rate * field.middle_stress_sag;
            y -= rel.value * stress_sag;
            gradient -= rel.gradient * stress_sag;
          }
          var phi = fn_normalize_rope_angle(Math.atan2(gradient, 1.0));
          if (typeof i_left === 'number' && i_left !== 0.0) {
            x -= Math.sin(phi) * i_left;
            y += Math.cos(phi) * i_left;
          }
          var p = i_point || {};
          tf.transform(x, y, p);
          p.phi = (mirrored ? -phi : phi) + tf.rotation;
          return p;
        }
        start = end;
        var support = field.sup2data;
        if (support !== null && typeof support === 'object') {
          var startPhi = support.startPhi;
          var endPhi = support.endPhi;
          var radius = support.radius;
          var deltaPhi = endPhi - startPhi;
          length = Math.abs(deltaPhi) * radius;
          end = start + length;
          if (i_position >= start && i_position < end) {
            var phi = fn_normalize_rope_angle(startPhi + (i_position - start) / length * deltaPhi);
            var cos = Math.cos(phi);
            var sin = Math.sin(phi);
            var r = radius + (support.up === true ? i_left : -i_left);
            var left = support.left === true;
            var x = support.centerX + (left ? sin * r : -sin * r);
            var y = support.centerY + (left ? -cos * r : cos * r);
            var p = i_point || {};
            tf.transform(x, y, p);
            p.phi = (mirrored ? -(this._increasingX ? phi : phi - PI) : (this._increasingX ? phi : phi - PI)) + tf.rotation;
            return p;
          }
        }
        start = end;
      }
    },
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
     *          i_position The position on the RopeLine
     * @param {Object}
     *          i_point Optional object for the result
     * @returns {Object} If i_point is defined i_point will be returned.
     *          Otherwise a new object will be returned
     */
    _transform: function (i_position, i_left, i_point) {
      var parts = this._parts;
      var fields = this._fields;
      if (typeof i_position !== 'number' || parts.length === 0 || fields.length === 0) {
        return false;
      }
      // check if before first segment
      var tf = this._tf;
      var mirrored = tf.mirrorX !== tf.mirrorY;
      var s1 = parts[0].s1;
      if (i_position <= s1) {
        var field = fields[0];
        var chain = field.chain;
        var x = field.saddle1x;
        var y = chain.getHeight(x);
        var phi = fn_normalize_rope_angle(chain.getAngle(x));
        var cos = Math.cos(phi);
        var sin = Math.sin(phi);
        var pos = this._increasingX === true ? i_position - s1 : s1 - i_position;
        x += cos * pos - sin * i_left;
        y += sin * pos + cos * i_left;
        var p = i_point || {};
        tf.transform(x, y, p);
        p.phi = (mirrored ? -phi : phi) + tf.rotation;
        return p;
      }
      // check if behind last segment
      var s2 = parts[parts.length - 1].s2;
      if (i_position >= s2) {
        var field = fields[fields.length - 1];
        var chain = field.chain;
        var x = field.saddle2x;
        var y = chain.getHeight(x);
        var phi = fn_normalize_rope_angle(chain.getAngle(x));
        var cos = Math.cos(phi);
        var sin = Math.sin(phi);
        var pos = this._increasingX === true ? i_position - s2 : s2 - i_position;
        x += cos * pos - sin * i_left;
        y += sin * pos + cos * i_left;
        var p = i_point || {};
        tf.transform(x, y, p);
        p.phi = (mirrored ? -phi : phi) + tf.rotation;
        return p;
      }
      // must be in between
      return this._get_position_on_rope_line(i_position, i_left, i_point);
    },
    transform: function (i_position, i_left, i_point) {
      return this._transform(this._adjuster.adjust(i_position), i_left, i_point);
    },
    stroke: function (i_context, i_transform, i_start, i_end, i_left) {
      // get the stroke start and end position in curve coordinates
      var adjuster = this._adjuster;
      var stroke_start = adjuster.adjust(Math.min(i_start, i_end));
      var stroke_end = adjuster.adjust(Math.max(i_start, i_end));
      // if too short
      if (stroke_end - stroke_start < MIN_STROKE_LENGTH) {
        // nothing more to do
        return;
      }
      var p = this._p;
      // get the curves start and end position
      var parts = this._parts;
      var curve_start = parts[0].s1;
      var curve_end = parts[parts.length - 1].s2;
      // first handle stroke parts before actual curve
      if (stroke_start < curve_start) {
        var stroke_end_is_before_curve_start = stroke_end <= curve_start;
        var se = stroke_end_is_before_curve_start ? stroke_end : curve_start;
        if (se - stroke_start > MIN_STROKE_LENGTH) {
          i_context.beginPath();
          this._transform(stroke_start, i_left, p);
          i_transform.transform(p.x, p.y, p);
          i_context.moveTo(p.x, p.y);
          this._transform(se, i_left, p);
          i_transform.transform(p.x, p.y, p);
          i_context.lineTo(p.x, p.y);
          i_context.stroke();
        }
        if (stroke_end_is_before_curve_start) {
          // nothing more to do
          return;
        }
        stroke_start = curve_start;
      }
      // next handle parts on actual curve
      if (stroke_start < curve_end) {
        var stroke_end_is_before_curve_end = stroke_end <= curve_end;
        var se = stroke_end_is_before_curve_end ? stroke_end : curve_end;
        if (se - stroke_start > MIN_STROKE_LENGTH) {
          var start_pos = stroke_start;
          for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            var s2 = part.s2;
            if (start_pos < s2) {
              var is_last = se <= s2;
              var end_pos = is_last ? se : s2;
              if (end_pos - start_pos > MIN_STROKE_LENGTH) {
                this._get_position_on_rope_line(start_pos, i_left, p);
                var start_phi = p.phi;
                i_transform.transform(p.x, p.y, p);
                var x1 = p.x;
                var y1 = p.y;
                i_context.beginPath();
                this._get_position_on_rope_line(end_pos, i_left, p);
                var end_phi = p.phi;
                i_transform.transform(p.x, p.y, p);
                var arc = part.arc;
                if (arc === false) {
                  var x2 = p.x;
                  var y2 = p.y;
                  i_context.moveTo(x1, y1);
                  var field = part.field;
                  if (field) {
                    var stress_position = field.vehicle_position;
                    if (stress_position !== undefined && stress_position > start_pos && stress_position < end_pos) {
                      this._get_position_on_rope_line(stress_position, i_left, p);
                      var stress_phi = p.phi;
                      i_transform.transform(p.x, p.y, p);
                      var xs = p.x;
                      var ys = p.y;
                      var cnt1 = Math.max(Math.ceil(Math.abs(stress_phi - start_phi) * RAD2DEG), 1);
                      var delta1 = (stress_position - start_pos) / cnt1;
                      for (var j = 1; j < cnt1; j++) {
                        this._get_position_on_rope_line(start_pos + delta1 * j, i_left, p);
                        i_transform.transform(p.x, p.y, p);
                        i_context.lineTo(p.x, p.y);
                      }
                      i_context.lineTo(xs, ys);
                      var cnt2 = Math.max(Math.ceil(Math.abs(end_phi - stress_phi) * RAD2DEG), 1);
                      var delta2 = (end_pos - stress_position) / cnt2;
                      for (var j = 1; j < cnt2; j++) {
                        this._get_position_on_rope_line(stress_position + delta2 * j, i_left, p);
                        i_transform.transform(p.x, p.y, p);
                        i_context.lineTo(p.x, p.y);
                      }
                    }
                    else {
                      var cnt = Math.max(Math.ceil(Math.abs(end_phi - start_phi) * RAD2DEG), 1);
                      var delta = (end_pos - start_pos) / cnt;
                      for (var j = 1; j < cnt; j++) {
                        this._get_position_on_rope_line(start_pos + delta * j, i_left, p);
                        i_transform.transform(p.x, p.y, p);
                        i_context.lineTo(p.x, p.y);
                      }
                    }
                  }
                  i_context.lineTo(x2, y2);
                }
                else {
                  var left = this._increasingX === false && typeof i_left === 'number' ? -i_left : i_left;
                  fn_prepare_arc(i_context, i_transform, p, part, start_pos, end_pos, left, this._tf);
                }
                i_context.stroke();
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
        i_context.beginPath();
        this._transform(stroke_start, 0.0, p);
        i_transform.transform(p.x, p.y, p);
        i_context.moveTo(p.x, p.y);
        this._transform(stroke_end, 0.0, p);
        i_transform.transform(p.x, p.y, p);
        i_context.lineTo(p.x, p.y);
        i_context.stroke();
      }
    }
  };

  function setOffset(i_offset, i_point) {
    var x = 0.0;
    if (typeof i_offset === 'number') {
      x = i_offset;
    }
    else if (i_offset !== null && typeof i_offset === 'object' && typeof i_offset.offset === 'number') {
      x = i_offset.offset;
    }
    var y = 0.0;
    if (i_offset !== null && typeof i_offset === 'object') {
      if (typeof i_offset.left === 'number') {
        y = i_offset.left;
      }
      else if (typeof i_offset.right === 'number') {
        y = -i_offset.right;
      }
    }
    if (i_point) {
      i_point.x = x;
      i_point.y = y;
      return i_point;
    }
    else {
      return {
        x: x,
        y: y
      };
    }
  };

  var TEN_POINT_ZERO = 10.0;
  var FIFE_POINT_ZERO = 5.0;
  var TWO_POINT_ZERO = 2.0;
  var ONE_POINT_ZERO = 1.0;
  var ZERO_POINT_FIFE = 0.5;
  var ZERO_POINT_TWO = 0.2;
  var ZERO_POINT_ONE = 0.1;
  var get_disc_iter_diff = function (i_minDiff) {
    var minDiff = Math.abs(i_minDiff);
    if (minDiff <= 1.0e-300 || minDiff >= 1.0e+300 || isNaN(minDiff)) {
      return 0.0;
    }
    var diff = ONE_POINT_ZERO;
    if (minDiff > diff) {
      for (var i = 0; i < 300; i++) {
        var diff2 = diff * TWO_POINT_ZERO;
        if (minDiff <= diff2) {
          return diff2;
        }
        var diff5 = diff * FIFE_POINT_ZERO;
        if (minDiff <= diff5) {
          return diff5;
        }
        var diff10 = diff * TEN_POINT_ZERO;
        if (minDiff <= diff10) {
          return diff10;
        }
        diff = diff10;
      }
    }
    else {
      for (var i = 0; i < 300; i++) {
        var diff5 = diff * ZERO_POINT_FIFE;
        if (minDiff > diff5) {
          return diff;
        }
        var diff2 = diff * ZERO_POINT_TWO;
        if (minDiff > diff2) {
          return diff5;
        }
        var diff10 = diff * ZERO_POINT_ONE;
        if (minDiff > diff10) {
          return diff2;
        }
        diff = diff10;
      }
    }
    return 0.0;
  };

  var DiscretizationIterator = function () {
    this._diff = 0.0;
    this._start = 0.0;
    this._count = 0;
    this._max = 0;
    this._raising = true;
  };
  DiscretizationIterator.prototype = {
    init: function (i_difference, i_start, i_end, i_forceMetricDiff) {
      var fmd = i_forceMetricDiff === true;
      this._diff = fmd ? get_disc_iter_diff(i_difference) : Math.abs(i_difference);
      if (this._diff <= 0.0 || isNaN(this._diff)) {
        this._diff = 0;
        this._start = 0;
        m_count = 0;
        m_max = 0;
      }
      else {
        this._raising = i_start < i_end;
        this._start = fmd ? ((this._raising ? Math.ceil(i_start / this._diff) : Math.floor(i_start / this._diff)) * this._diff) : i_start;
        var end = fmd ? ((this._raising ? Math.floor(i_end / this._diff) : Math.ceil(i_end / this._diff)) * this._diff) : i_end;
        var range = this._raising ? end - this._start : this._start - end;
        this._count = 0;
        this._max = Math.ceil(range / this._diff);
      }
    },
    hasNext: function () {
      return this._count <= this._max;
    },
    getNext: function () {
      var offset = this._diff * this._count;
      var value = this._raising ? this._start + offset : this._start - offset;
      this._count++;
      return value;
    },
  };

  function debug_dradation() {
    var txt = '';
    var step = 0.01;
    var x = -1.2;
    while (x <= 1.2) {
      txt += x;
      txt += ' ';
      // #1
      txt += fn_get_smooth_normalized_transfer(x, 0.3, 0.7);
      txt += ' ';
      // #2
      txt += fn_get_smooth_normalized_transfer(x, 0.3, 1.0);
      txt += ' ';
      // #3
      txt += fn_get_smooth_normalized_transfer(x, 0.0, 0.7);
      txt += ' ';
      // #4
      txt += fn_get_smooth_normalized_transfer(x, 0.5, 0.5);
      txt += ' ';
      // #5
      txt += fn_get_smooth_normalized_transfer(x, 0.0, 1.0);
      txt += ' ';
      // #6
      txt += fn_get_smooth_normalized_transfer(x, 0.0, 0.0);
      txt += ' ';
      // #7
      txt += fn_get_smooth_normalized_transfer(x, 1.0, 1.0);
      txt += ' ';
      txt += '\n';
      x += step;
    }
    return txt;
  };

  function round_dump(i_value) {
    return Math.round(i_value * 100) / 100;
  };

  function dump_point(i_transform, i_x, i_y) {
    var p = i_transform.transform(i_x, i_y);
    console.log('x: ' + round_dump(i_x) + ' y: ' + round_dump(i_y) + ' ==> x: ' + round_dump(p.x) + ' y: ' + round_dump(p.y));
  };

  function check_point(i_t1, i_t2, i_x, i_y) {
    var p1 = i_t1.transform(i_x, i_y);
    var i1 = i_t1.transformInverse(p1.x, p1.y);
    var p2 = i_t2.transform(i_x, i_y);
    var i2 = i_t2.transformInverse(p2.x, p2.y);
    var ok = true;
    if (Math.abs(i1.x - i_x) > 0.0001 || Math.abs(i1.y - i_y) > 0.0001) {
      ok = false;
    }
    else if (Math.abs(i2.x - i_x) > 0.0001 || Math.abs(i2.y - i_y) > 0.0001) {
      ok = false;
    }
    else if (Math.abs(p1.x - p2.x) > 0.0001 || Math.abs(p1.y - p2.y) > 0.0001) {
      ok = false;
    }
    var stream = ok ? console.debug : console.warn;
    var res = '(' + round_dump(i_x) + ',' + round_dump(i_y) + ')';
    res += ' ==> ';
    res += '(' + round_dump(p1.x) + '/' + round_dump(p2.x) + ',' + round_dump(p1.y) + '/' + round_dump(p2.y) + ')';
    res += ' <== ';
    res += '(' + round_dump(i1.x) + '/' + round_dump(i2.x) + ',' + round_dump(i1.y) + '/' + round_dump(i2.y) + ')';
    stream.call(console, res);
  };

  function set_mirrors(i_select, i_data) {
    switch (i_select % 4) {
      case 0:
        i_data.mx = false;
        i_data.my = false;
        break;
      case 1:
        i_data.mx = true;
        i_data.my = false;
        break;
      case 2:
        i_data.mx = true;
        i_data.my = true;
        break;
      case 3:
      default:
        i_data.mx = false;
        i_data.my = true;
        break;
    }
  };

  /*
   * var psys = { x : 2, y : 1, s : Math.SQRT2, p : PI / 4 };
   */
  function debug_transforms1() {
    // parent
    var psys = {
      x: 12,
      y: 4,
      s: Math.sqrt(3 * 3 + 1 * 1),
      p: Math.atan2(1, 3)
    };
    var pt = new Transform();
    // child
    var csys = {
      x: 2,
      y: 1,
      s: Math.sqrt(3 * 3 + 1 * 1),
      p: Math.atan2(1, 3)
    };
    var ct1 = new Transform();
    var ct2 = new Transform();
    // parent mirror loop
    for (var p = 0; p < 4; p++) {
      set_mirrors(p, psys);
      // parent transform
      pt.setToIdentity();
      pt.applyCoordinateTransformation(psys.x, psys.y, psys.s, psys.p, psys.mx, psys.my);
      console.log('');
      console.log('############ PARENT LOOP ############');
      console.log('parent mirror x/y: ' + psys.mx + '/' + psys.my);
      console.log('parent rotation: ' + Math.floor(pt.rotation * RAD2DEG));
      dump_point(pt, 0, 0);
      dump_point(pt, 1, 0);
      dump_point(pt, 0, 1);
      // child mirror loop
      for (var c = 0; c < 4; c++) {
        set_mirrors(c, csys);
        // child transform 1
        ct1.setToIdentity();
        ct1.applyCoordinateTransformation(csys.x, csys.y, csys.s, csys.p, csys.mx, csys.my);
        ct1.preConcatenate(pt);
        // child transform 2
        // ct2.init(pt);
        // ct2.applyCoordinateTransformation(csys.x, csys.y, csys.s, csys.p,
        // csys.mx, csys.my);
        ct2.setToCoordinateTransform({
          x: csys.x,
          y: csys.y,
          scale: csys.s,
          phi: csys.p,
          mirrorX: csys.mx,
          mirrorY: csys.my
        }, pt);
        // mirror
        console.log('');
        console.log('parent mirror x/y: ' + psys.mx + '/' + psys.my);
        console.log('child  mirror x/y: ' + csys.mx + '/' + csys.my);
        var stream = Math.abs(ct1.rotation - ct2.rotation) > 0.001 ? console.warn : console.debug;
        stream.call(console, 'child 1/2 rotation: ' + Math.floor(ct1.rotation * RAD2DEG) + ' / ' + Math.floor(ct2.rotation * RAD2DEG));
        var s1 = Math.sqrt(Math.abs(ct1.d00 * ct1.d11 - ct1.d10 * ct1.d01));
        var s2 = Math.sqrt(Math.abs(ct2.d00 * ct2.d11 - ct2.d10 * ct2.d01));
        if (Math.abs(s1 - s2) > 0.001) {
          console.error('scales: s1: ' + s1 + ' s2: ' + s2);
        }
        if (true) {
          check_point(ct1, ct2, 0, 0);
          check_point(ct1, ct2, 1, 0);
          check_point(ct1, ct2, 0, 1);
        }
        else {
          dump_point(ct1, 0, 0);
          dump_point(ct2, 0, 0);
          dump_point(ct1, 1, 0);
          dump_point(ct2, 1, 0);
          dump_point(ct1, 0, 1);
          dump_point(ct2, 0, 1);
        }
      }
    }
  };

  var tx = 2;
  var ty = 1;
  var ts = Math.SQRT2;
  var tp = PI / 4;
  function do_test(i_transforms, i_index) {
    var t1 = i_transforms[i_index - 1];
    var t2 = i_transforms[i_index];
    var mx = undefined;
    var my = undefined;
    for (var p = 0; p < 4; p++) {
      switch (p) {
        case 0:
          mx = false;
          my = false;
          break;
        case 1:
          mx = true;
          my = false;
          break;
        case 2:
          mx = true;
          my = true;
          break;
        case 3:
          mx = false;
          my = true;
          break;
      }
      t2.init(t1);
      t2.applyCoordinateTransformation(tx, ty, ts, tp, mx, my);
      console.log('===> ' + i_index + ' mirror x/y: ' + mx + '/' + my);
      dump_point(t2, 0, 0);
      dump_point(t2, 1, 0);
      dump_point(t2, 0, 1);
      if (i_index < i_transforms.length - 1) {
        do_test(i_transforms, i_index + 1);
      }
    }
  };

  function debug_transforms2() {
    // parent

    var cnt = 3;
    // transforms
    var transforms = [];
    for (var i = 0; i < cnt; i++) {
      transforms.push(new Transform());
    }
    do_test(transforms, 1);
    return;

    // parent mirror loop
    for (var p = 0; p < 4; p++) {
      switch (p) {
        case 0:
          pmx = false;
          pmy = false;
          break;
        case 1:
          pmx = true;
          pmy = false;
          break;
        case 2:
          pmx = true;
          pmy = true;
          break;
        case 3:
          pmx = false;
          pmy = true;
          break;
      }
      // parent transform
      pt.setToIdentity();
      pt.applyCoordinateTransformation(px, py, ps, pp, pmx, pmy);
      console.log('');
      console.log('############ PARENT LOOP ############');
      console.log('parent mirror x/y: ' + pmx + '/' + pmy);
      console.log('parent rotation: ' + Math.floor(pt.rotation * RAD2DEG));
      dump_point(pt, 0, 0);
      dump_point(pt, 1, 0);
      dump_point(pt, 0, 1);
      // child mirror loop
      for (var c = 0; c < 4; c++) {
        switch (c) {
          case 0:
            cmx = false;
            cmy = false;
            break;
          case 1:
            cmx = true;
            cmy = false;
            break;
          case 2:
            cmx = true;
            cmy = true;
            break;
          case 3:
            cmx = false;
            cmy = true;
            break;
        }
        if (c !== 0 || p !== 1) {
          // continue;
        }
        // child transform 1
        ct1.setToIdentity();
        ct1.applyCoordinateTransformation(cx, cy, cs, cp, cmx, cmy);
        ct1.preConcatenate(pt);
        // child transform 2
        ct2.setToIdentity();
        ct2.init(pt);
        ct2.applyCoordinateTransformation(cx, cy, cs, cp, cmx, cmy);
        // mirror
        console.log('');
        console.log('child  mirror x/y: ' + cmx + '/' + cmy);
        var stream = Math.abs(ct1.rotation - ct2.rotation) > 0.001 ? console.warn : console.debug;
        stream.call(console, 'child 1/2 rotation: ' + Math.floor(ct1.rotation * RAD2DEG) + ' / ' + Math.floor(ct2.rotation * RAD2DEG));
        var s1 = Math.sqrt(Math.abs(ct1.d00 * ct1.d11 - ct1.d10 * ct1.d01));
        var s2 = Math.sqrt(Math.abs(ct2.d00 * ct2.d11 - ct2.d10 * ct2.d01));
        if (Math.abs(s1 - s2) > 0.001) {
          console.error('scales: s1: ' + s1 + ' s2: ' + s2);
        }
        if (true) {
          check_point(ct1, ct2, 0, 0);
          check_point(ct1, ct2, 1, 0);
          check_point(ct1, ct2, 0, 1);
          check_point(ct1, ct2, 1, 1);
        }
        else {
          dump_point(ct1, 0, 0);
          dump_point(ct2, 0, 0);
          dump_point(ct1, 1, 0);
          dump_point(ct2, 1, 0);
          dump_point(ct1, 0, 1);
          dump_point(ct2, 0, 1);
        }
      }
    }
  };

  function debug_arc() {
    var arc = getArc(0, 0, 1, 0, 1, 1, 1);
    console.log(JSONX.stringify(arc, undefined, 2));
  };

  function debug_adjuster(i_test) {
    var a = new Adjuster();
    switch (i_test) {
      case 1:
        a.reset(-1000, 1000);
        a.add(0, 1500);
        a.add(1000, 3000);
        break;
      case 2:
        a.reset(1000, 1000);
        a.add(0, 1500);
        a.add(-1000, 3000);
        break;
      case 3:
        a.reset(-1000, -1000);
        a.add(0, -1500);
        a.add(1000, -3000);
        break;
      case 4:
        a.reset(1000, -1000);
        a.add(0, -1500);
        a.add(-1000, -3000);
        break;
      case 5:
        a.reset(0, 0);
        a.add(1, 1);
        a.add(2, 3);
        a.add(3, 4);
        a.add(4, 8);
        a.add(5, 9);
        a.add(6, 12);
        a.add(7, 17);
        a.add(10, 20);
        break;
      default:
        break;
    }
    var is = a.incrementSource;
    var s1 = a._cfg[0].s1;
    var s2 = a._cfg[a._cfg.length - 1].s2;
    var ds = s2 - s1;
    var step = ds / 1000;
    var x = s1 - ds;
    var end = s2 + ds;
    var txt = '';
    while (is ? x <= end : x >= end) {
      txt += x;
      txt += ' ';
      var y = a.adjust(x);
      txt += y;
      txt += ' ';
      var z = a.adjustInverse(y);
      txt += z;
      txt += '\n';
      if (Math.abs(x - z) > 0.0000001) {
        console.error('Adjuster ERROR! value: ' + x + ' adjusted: ' + y + ' inverse: ' + z);
        a.adjustInverse(a.adjust(x));
        return;
      }
      x += step;
    }
    console.log('Adjuster tested and OK!');
    Utilities._debug_dump('C:/___TEST_DUMP.txt', txt);
  };

  var NONE = 0x0;
  var NORTH = 0x1;
  var WEST = 0x2;
  var SOUTH = 0x4;
  var EAST = 0x8;

  var Maze = function () {
    this.width = 0;
    this.height = 0;
    this._cells = [];
    this._list = [];
  };

  Maze.prototype = {
    cell: function (i_x, i_y) {
      return this._cells[i_y * this.width + i_x];
    },
    prepare: function (i_width, i_height) {
      // set the dimension
      this.width = i_width;
      this.height = i_height;

      // clear
      var cells = this._cells;
      cells.splice(0, cells.length);
      this._list.splice(0, this._list.length);

      // if invalid
      if (i_width <= 0 || i_height <= 0) {
        // nothing more to do
        return;
      }
      var x, y;
      // Fill the maze with walls
      for (y = 0; y < i_height; y++) {
        for (x = 0; x < i_width; x++) {
          cells[y * i_width + x] = {
            x: x,
            y: y,
            east: true,
            west: true,
            south: true,
            north: true,
            _visited: false
          };
        }
      }
      this._carveMaze(Math.floor(i_width / 2), Math.floor(i_height / 2));
      for (x = 0; x < i_width; x++) {
        for (y = 0; y < i_height; y++) {
          var cell = cells[y * i_width + x];
          if (!cell._visited) {
            console.error('EXCEPTION! Unvisited cell at ' + x + ', ' + y);
          }
        }
      }
    },
    _carveMaze: function (i_x, i_y) {
      var cells = this._cells;
      var list = this._list;
      var width = this.width;
      // add the middle cell to the stack
      list.push(cells[i_y * width + i_x]);

      // here we store the last index
      var x, y, type;
      var last = 0;

      // while the stack is not empty
      while ((last = list.length - 1) >= 0) {
        // get the last cell in the stack
        var cell = list[last];

        // set visited
        cell._visited = true;

        // store the coordinates
        x = cell.x;
        y = cell.y;

        // get the next valid random neighbor cell type
        type = this._getRandomValidCellNeighbour(x, y);

        // depending on the neighbor
        switch (type) {
          case NORTH: {
            cell.north = false;
            y--;
            cell = cells[y * width + x];
            cell.south = false;
            list.push(cell);
            break;
          }
          case SOUTH: {
            cell.south = false;
            y++;
            cell = cells[y * width + x];
            cell.north = false;
            list.push(cell);
            break;
          }
          case WEST: {
            cell.west = false;
            x--;
            cell = cells[y * width + x];
            cell.east = false;
            list.push(cell);
            break;
          }
          case EAST: {
            cell.east = false;
            x++;
            cell = cells[y * width + x];
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
    },
    _getRandomValidCellNeighbour: function (i_x, i_y) {
      // here we store the number
      var cnt = 0;
      var cells = this._cells;
      var width = this.width;
      var height = this.height;
      // Above
      if (i_y > 0 && !cells[(i_y - 1) * width + i_x]._visited) {
        cnt++;
      }
      // Below
      if (i_y < height - 1 && !cells[(i_y + 1) * width + i_x]._visited) {
        cnt++;
      }
      // Right
      if (i_x < width - 1 && !cells[i_y * width + i_x + 1]._visited) {
        cnt++;
      }
      // Left
      if (i_x > 0 && !cells[i_y * width + i_x - 1]._visited) {
        cnt++;
      }
      // if no unvisited available
      if (cnt == 0) {
        return NONE;
      }
      // select index by random
      var idx = cnt > 1 ? Math.floor(Math.random() * cnt) : 0;

      // reset counter
      cnt = 0;

      // Above
      if (i_y > 0 && !cells[(i_y - 1) * width + i_x]._visited) {
        if (cnt == idx) {
          return NORTH;
        }
        cnt++;
      }
      // Below
      if (i_y < height - 1 && !cells[(i_y + 1) * width + i_x]._visited) {
        if (cnt == idx) {
          return SOUTH;
        }
        cnt++;
      }
      // Right
      if (i_x < width - 1 && !cells[i_y * width + i_x + 1]._visited) {
        if (cnt == idx) {
          return EAST;
        }
        cnt++;
      }
      // Left
      if (i_x > 0 && !cells[i_y * width + i_x - 1]._visited) {
        if (cnt == idx) {
          return WEST;
        }
        cnt++;
      }
      return NONE;
    }
  };

  // helper class
  var _WeightedGraphNode = function () {
    this._nodeObject = undefined;
    this._predecessorNode = undefined;
    this._distanceToStartNode = undefined;
    this._edges = [];
    this._visited = false;
  };

  _WeightedGraphNode.prototype = {
    // reset
    _reset: function () {
      // reset the members
      this._nodeObject = undefined;
      this._predecessorNode = undefined;
      this._visited = false;
      this._distanceToStartNode = 0.0;
      this._edges.splice(0, this._edges.length)
    },
    _getEdgeToNode: function (i_node) {
      var i;
      // for all edges
      for (i = 0; i < this._edges.length; i++) {
        // get the edge
        var edge = this._edges[i];

        // get the opposite node
        var node = edge._getOppositeNode(this);

        // if identical
        if (node === i_node) {
          // return the edge
          return edge;
        }
      }
      // not found
      return undefined;
    }
  };

  // helper class
  var _WeightedGraphEdge = function () {
    this._edgeObject = undefined;
    this._node1 = undefined;
    this._node2 = undefined;
    this._length = 0.0;
    this._virtual = false;
  };

  _WeightedGraphEdge.prototype = {
    // initialize
    _init: function (i_virtual, i_userEdge, i_node0, i_node1, i_length) {
      this._virtual = i_virtual;
      this._edgeObject = i_userEdge;
      this._node1 = i_node0;
      this._node2 = i_node1;
      this._length = i_length;
    },
    _reset: function () {
      this._edgeObject = undefined;
      this._node1 = undefined;
      this._node2 = undefined;
      this._length = 0.0;
      this._virtual = false;
    },
    _getOppositeNode: function (i_node) {
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
  };

  var WeightedGraph = function () {
    this._startNode = undefined;
    this._endNode = undefined;
    this._list = [];
    this._edges = [];
    this._nodes = [];
    this._nodePool = new Utilities.DynamicList(function () {
      return new _WeightedGraphNode();
    });
    this._edgePool = new Utilities.DynamicList(function () {
      return new _WeightedGraphEdge();
    });
    this._nodeCount = 0;
    this._edgeCount = 0;
    this._isValidPath = undefined;
  };

  WeightedGraph.prototype = {
    clear: function () {
      // clear the lists
      this._list.splice(0, this._list.length);
      this._edges.splice(0, this._edges.length);
      this._nodes.splice(0, this._nodes.length);
      var i;

      // for all nodes
      for (i = 0; i < this._nodeCount; i++) {
        // reset
        this._nodePool.get(i)._reset();
      }
      // reset
      this._nodeCount = 0;

      // for all edges
      for (i = 0; i < this._edgeCount; i++) {
        // reset
        this._edgePool.get(i)._reset();
      }
      // reset
      this._edgeCount = 0;
      this._startNode = undefined;
      this._endNode = undefined;
    },
    setPathValidator: function (i_isValidPath) {
      this._isValidPath = i_isValidPath;
    },
    destroy: function () {
      // clear all data
      this.clear();

      // clear the lists
      this._edgePool.clear();
      this._nodePool.clear();

      // reset
      this._nodeCount = 0;
      this._edgeCount = 0;
      this._isValidPath = undefined;
      this._startNode = undefined;
      this._endNode = undefined;
    },
    /**
     * Add a path
     * 
     * @param i_edge
     *          The path object (must not be undefined)
     * @param i_node0
     *          The start node (must not be undefined)
     * @param i_node1
     *          The end node (must not be undefined)
     * @param i_lengthThe
     *          path length (must be bigger than zero)
     * @return true is valid and added
     */
    addEdge: function (i_edge, i_node0, i_node1, i_length) {
      // if invalid
      if (i_node0 === undefined || i_node1 === undefined || i_length < 0.0) {
        // cannot add
        return false;
      }
      // if identical objects
      if (i_node0 === i_node1) {
        // cannot add
        return false;
      }
      // add the edge
      this._prepareEdge(false, i_edge, i_node0, i_node1, i_length);

      // success
      return true;
    },
    /**
     * This method can be used
     * 
     * @param i_node0
     * @param i_node1
     * @return
     */
    addVirtualEdge: function (i_node0, i_node1, i_length) {
      // if invalid
      if (i_node0 === undefined || i_node1 === undefined) {
        // cannot add
        return false;
      }
      // depending on the mode
      // if identical nodes
      if (i_node0 === i_node1) {
        // cannot add
        return false;
      }
      var i;
      // for all currently available edges
      for (i = 0; i < this._edgeCount; i++) {
        // get the edge
        var edge = this._edgePool.get(i);

        // if a virtual edge
        if (edge._virtual) {
          // if identical start and end
          if (edge._node1._nodeObject == i_node0 && edge._node2._nodeObject == i_node1) {
            // cannot add
            return false;
          }
          // if inverse identical start and end
          if (edge._node2._nodeObject == i_node1 && edge._node1._nodeObject == i_node0) {
            // cannot add
            return false;
          }
        }
      }
      // add the edge
      this._prepareEdge(true, undefined, i_node0, i_node1, i_length);

      // success
      return true;
    },
    _getNode: function (i_nodeObject) {
      var i;
      // for all stored nodes
      for (i = 0; i < this._nodeCount; i++) {
        // get the node
        var node = this._nodePool.get(i);

        // if identical node object
        if (node._nodeObject === i_nodeObject) {
          // return the node
          return node;
        }
      }
      // get the next node
      var node = this._nodePool.get(this._nodeCount++);

      // set object
      node._nodeObject = i_nodeObject;

      // return the node
      return node;
    },
    _prepareEdge: function (i_virtual, i_userEdge, i_userNode0, i_userNode1, i_length) {
      // get the next edge
      var edge = this._edgePool.get(this._edgeCount++);

      // get the nodes
      var node1 = this._getNode(i_userNode0);
      var node2 = this._getNode(i_userNode1);

      // initialize edge
      edge._init(i_virtual, i_userEdge, node1, node2, i_length);

      // add edge to nodes
      node1._edges.push(edge);
      node2._edges.push(edge);
    },
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
    computePath: function (i_startNode, i_endNode) {
      // clear the lists
      this._list.splice(0, this._list.length);
      this._edges.splice(0, this._edges.length);
      this._nodes.splice(0, this._nodes.length);

      // ////////////////////////////////////////////////////////////////////////////
      // This is an implementation of the Dijkstra algorithm.
      //
      // In the first step we iterate over all nodes, initialize them and try
      // to
      // find the start and the end node.
      // ////////////////////////////////////////////////////////////////////////////

      // here we store the start and the end node
      this._startNode = undefined;
      this._endNode = undefined;
      var i;

      // for all currently stored nodes
      for (i = 0; i < this._nodeCount; i++) {
        // get the node
        var node = this._nodePool.get(i);

        // reset
        node._predecessorNode = undefined;
        node._visited = false;
        node._distanceToStartNode = -1.0;

        // if identical to start node
        if (node._nodeObject === i_startNode) {
          // set start node
          this._startNode = node;
        }
        // if identical to end node
        else if (i_endNode !== undefined && node._nodeObject === i_endNode) {
          // set end node
          this._endNode = node;
        }
      }
      // if start node not available
      if (this._startNode === undefined) {
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
      this._startNode._distanceToStartNode = 0;
      this._startNode._visited = true;

      // for all edges of the start node
      for (i = 0; i < this._startNode._edges.length; i++) {
        // get the edge
        var edge = this._startNode._edges[i];

        // get the opposite node
        var node = edge._getOppositeNode(this._startNode);

        // if valid path
        if (typeof this._isValidPath !== 'function' || this._isValidPath(undefined, undefined, this._startNode._nodeObject, edge._edgeObject, node._nodeObject)) {
          // set the distance
          node._distanceToStartNode = edge._length >= 0.0 ? edge._length : 0.0;

          // set the predecessor node
          node._predecessorNode = this._startNode;

          // add to the list
          this._list.push(node);
        }
      }
      // ////////////////////////////////////////////////////////////////////////////
      // Now we are prepared for the actual Dijkstra algorithm.
      //
      // Our working list contains all neighbors from our start node.
      // ////////////////////////////////////////////////////////////////////////////

      // loop while list is not empty
      while (this._list.length > 0) {
        // ////////////////////////////////////////////////////////////////////////////
        // In the following iteration we search the node not already visited
        // and
        // with the smallest distance to the start node.
        // ////////////////////////////////////////////////////////////////////////////

        // here we store the closest node
        var closestNode = undefined;
        var closestNodeIdx = -1;

        // for all nodes in the working list
        for (i = 0; i < this._list.length; i++) {
          // get the node
          var node = this._list[i];

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
        this._list.splice(closestNodeIdx, 1);

        // ////////////////////////////////////////////////////////////////////////////
        // If the closest node is the one we try to reach we are ready.
        // ////////////////////////////////////////////////////////////////////////////

        // if equal to end node
        if (this._endNode !== undefined && closestNode === this._endNode) {
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
        for (i = 0; i < closestNode._edges.length; i++) {
          // get the edge
          var edge = closestNode._edges[i];

          // get the opposite node
          var node = edge._getOppositeNode(closestNode);

          // if visited before
          if (node._visited) {
            // ignore this node
            continue;
          }
          // if invalid
          if (typeof this._isValidPath === 'function') {
            // get the predecessor node
            var predecessorNode = closestNode._predecessorNode;

            // get the edge
            var predecessorEdge = closestNode._getEdgeToNode(predecessorNode);

            // if not valid
            if (!this._isValidPath(predecessorNode._nodeObject, predecessorEdge._edgeObject, closestNode._nodeObject, edge._edgeObject, node._nodeObject)) {
              // ignore this node
              continue;
            }
          }
          // compute the distance
          var distance = closestNode._distanceToStartNode;

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
          this._list.push(node);
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
      this._list.splice(0, this._list.length);

      // if an end node is available
      if (this._endNode !== undefined) {
        // prepare edges
        this._prepareEdgesToEndNode();
        // prepare nodes
        this._prepareNodesToEndNode();
      }
    },
    addReachableNodes: function (i_collection) {
      // if a start node is available
      if (this._startNode !== undefined) {
        var i;
        // for all currently stored nodes
        for (i = 0; i < this._nodeCount; i++) {
          // get the node
          var node = this._nodePool.get(i);

          // if visited and not the start node
          if (node !== this._startNode && node._visited) {
            // add
            i_collection.push(node._nodeObject);
          }
        }
      }
    },
    selectClosestNode: function () {
      return this._selectNode(true);
    },
    selectFarestNode: function () {
      return this._selectNode(false);
    },
    _selectNode: function (i_closets) {
      // reset
      this._edges.splice(0, this._edges.length);
      this._nodes.splice(0, this._nodes.length);
      this._endNode = undefined;
      var i;
      // for all currently stored nodes
      for (i = 0; i < this._nodeCount; i++) {
        // get the node
        var node = this._nodePool.get(i);

        // visited first or closer
        if (node._visited && (this._endNode === undefined || (i_closets ? node._distanceToStartNode < this._endNode._distanceToStartNode : node._distanceToStartNode > this._endNode._distanceToStartNode))) {
          // update
          this._endNode = node;
        }
      }
      // if found
      if (this._endNode !== undefined) {
        // prepare
        this._prepareEdgesToEndNode();
        this._prepareNodesToEndNode();
      }
      // return true if node available
      return this._endNode !== undefined;
    },
    selectEndNode: function (i_node) {
      // clear list
      this._edges.splice(0, this._edges.length);
      this._nodes.splice(0, this._nodes.length);
      this._endNode = undefined;

      // if not available
      if (i_node === undefined) {
        // not selectable
        return false;
      }
      var i;
      // for all currently stored nodes
      for (i = 0; i < this._nodeCount && this._endNode === undefined; i++) {
        // get the node
        var node = this._nodePool.get(i);

        // if identical to start node
        if (node._nodeObject === i_node) {
          // set end node
          this._endNode = node;
        }
      }
      // if not found
      if (this._endNode === undefined) {
        // not selectable
        return false;
      }
      // if not visited
      if (!this._endNode._visited) {
        // reset
        this._endNode = undefined;

        // not selectable
        return false;
      }
      // prepare the edges
      this._prepareEdgesToEndNode();
      this._prepareNodesToEndNode();

      // success
      return true;
    },
    _prepareEdgesToEndNode: function () {
      // clear
      this._edges.splice(0, this._edges.length);

      // store the node for the following iteration
      var node = this._endNode;

      // while predecessor available
      while (node._predecessorNode !== undefined) {
        // get the edge
        var edge = node._getEdgeToNode(node._predecessorNode);

        // if available
        if (edge !== undefined && edge._edgeObject !== undefined) {
          // add to the list
          this._edges.push(edge._edgeObject);
        }
        // get the predecessor
        node = node._predecessorNode;
      }
    },
    _prepareNodesToEndNode: function () {
      // clear
      this._nodes.splice(0, this._nodes.length);

      // store the node for the following iteration
      var node = this._endNode;

      // while available
      while (node !== undefined) {
        this._nodes.push(node._nodeObject);
        // get the predecessor
        node = node._predecessorNode;
      }
    },
    getStartNode: function () {
      return this._startNode !== undefined ? this._startNode._nodeObject : undefined;
    },
    isEndNodeReachable: function () {
      return this._endNode !== undefined && this._endNode._visited;
    },
    getEndNode: function () {
      return this._endNode !== undefined ? this._endNode._nodeObject : undefined;
    },
    getDistance: function () {
      return this._endNode !== undefined ? this._endNode._distanceToStartNode : -1.0;
    },
    getEdgesCount: function () {
      return this._edges.length;
    },
    getEdge: function (i_index) {
      return this._edges[this._edges.length - 1 - i_index];
    },
    getNodesCount: function () {
      return this._nodes.length;
    },
    getNode: function (i_index) {
      return this._nodes[this._nodes.length - 1 - i_index];
    }
  };

  var exp = {
    THIRD: THIRD,
    TWO_PI: TWO_PI,
    HALF_PI: HALF_PI,
    QUARTER_PI: QUARTER_PI,
    RAD2DEG: RAD2DEG,
    DEG2RAD: DEG2RAD,
    GOLDEN_CUT: GOLDEN_CUT,
    GOLDEN_CUT_INVERTED: GOLDEN_CUT_INVERTED,
    SPECIFIC_GRAVITY_OF_STEEL: SPECIFIC_GRAVITY_OF_STEEL,
    EARTH_GRAVITATION: EARTH_GRAVITATION,
    sinh: sinh,
    cosh: cosh,
    asinh: asinh,
    acosh: acosh,
    createBiomialCoefficients: fn_create_biomial_coefficients,
    getSmoothNormalizedTransfer: fn_get_smooth_normalized_transfer,
    normalizeToPlusMinusPI: normalizeToPlusMinusPI,
    normalizeToPlusMinus180deg: normalizeToPlusMinus180deg,
    getHarmonicRGB: getHarmonicRGB,
    Transform: Transform,
    Adjuster: Adjuster,
    getArc: getArc,
    ArcLine: ArcLine,
    CurveSection: CurveSection,
    ChainFunction: ChainFunction,
    RopeLine: RopeLine,
    setOffset: setOffset,
    DiscretizationIterator: DiscretizationIterator,
    debug_dradation: debug_dradation,
    debug_transforms1: debug_transforms1,
    debug_transforms2: debug_transforms2,
    debug_arc: debug_arc,
    debug_adjuster: debug_adjuster,
    Maze: Maze,
    WeightedGraph: WeightedGraph,
    toBool: function (i_value) {
      // 1 bit
      return i_value === true;
    },
    toS8: function (i_value) {
      // 8 bit signed
      var value = Math.floor(i_value) & 0xff;
      return (value & 0x80) === 0x80 ? value - 0x100 : value;
    },
    toU8: function (i_value) {
      // 8 bit unsigned
      return Math.floor(i_value) & 0xff;
    },
    toS16: function (i_value) {
      // 16 bit signed
      var value = Math.floor(i_value) & 0xffff;
      return (value & 0x8000) === 0x8000 ? value - 0x10000 : value;
    },
    toU16: function (i_value) {
      // 16 bit unsigned
      return Math.floor(i_value) & 0xffff;
    },
    toS32: function (i_value) {
      // 32 bit signed
      var value = Math.floor(i_value) & 0xffffffff;
      return (value & 0x80000000) === 0x80000000 ? value - 0x100000000 : value;
    },
    toU32: function (i_value) {
      // 32 bit unsigned
      var value = Math.floor(i_value) & 0xffffffff;
      return (value & 0x80000000) === -0x80000000 ? value + 0x100000000 : value;
    },
    getS32bit: function (i_value, i_bit) {
      var mask = 1 << (i_bit % 32);
      return (i_value & mask) === mask;
    },
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exp;
  } else {
    root.math = exp;
  }
}(globalThis));
