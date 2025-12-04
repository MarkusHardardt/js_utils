(function (root) {

  const isNodeJS = typeof require === 'function';

  var MAX_UPDATE_STEP_DURATION_MILLIS = 2000;

  /**
   * This handler connects to the control variables for segment and position of
   * all configured vehicles. As these variables will be updated in best case
   * only two times per second but we update our graphic with a much higher
   * frame per second rate, all this mechanism does is interpolating the vehicle
   * position in between the update cycles resulting in a smooth movement of the
   * vehicles on screen.
   * 
   * The only supported method is "hmi_getLocation(i_index, i_location)" where
   * "i_index" is our vehicle index corresponding to the vehicle configuration
   * array and "i_location" is an object provided by the caller for the results
   * {segment,position}.
   * 
   * @param {Object}
   *          i_minimumMeterPerMillisecond
   */
  var ObjectPositionSystem = function (i_simulation) {
    var that = this, m_varGroupUpdateTime = undefined, m_vehicles = {}, m_vehiclesCount = 0;
    if (this.vehicles !== undefined && Array.isArray(this.vehicles)) {
      for (var i = 0; i < this.vehicles.length; i++) {
        var vehicle = this.vehicles[i];
        var id = vehicle.id;
        if (id !== undefined && typeof vehicle.segment === 'string' && typeof vehicle.position === 'string') {
          id = id.toString();
          if (m_vehicles[id] !== undefined) {
            console.warning('WARNING! ObjectPositionSystem: Vehicle "' + id + '" already exists!');
            continue;
          }
          var object = {
            index: i,
            id: id,
            segment: vehicle.segment,
            segmentListener: {
              handleDataUpdate: function (i_id, i_value) {
                this.currSeg = i_value;
              }
            },
            position: vehicle.position,
            positionListener: {
              handleDataUpdate: function (i_id, i_value) {
                this.prevPos = this.currPos;
                this.currPos = i_value;
                this.prevTime = this.currTime;
                this.currTime = m_varGroupUpdateTime;
                this.updated = true;
              }
            }
          };
          m_vehicles[id] = object;
          m_vehiclesCount++;
        }
      }
    }
    // compute length in simulation mode
    var m_sim_offset = 0.0;
    var m_sim_direction1 = true;
    var m_sim_trackLength = 0.0;
    if (i_simulation === true) {
      if (this.segments !== undefined && Array.isArray(this.segments)) {
        for (var i = 0; i < this.segments.length; i++) {
          var segment = this.segments[i];
          if (typeof segment.length === 'number') {
            m_sim_trackLength += segment.length;
          }
        }
      }
    }
    // prepare control variable access
    if (i_simulation !== true && typeof this.vehicleGroupId === 'string') {
      this.handleGroupDataUpdate = function () {
        m_varGroupUpdateTime = new Date().getTime();
      };
      this._hmi_listenerAdds.push(function () {
        S4.env.data.setUpdateGroupListenersFirst(that.vehicleGroupId, true);
        S4.env.data.addGroupListener(that.vehicleGroupId, that);
        for (var id in m_vehicles) {
          if (m_vehicles.hasOwnProperty(id)) {
            var obj = m_vehicles[id];
            S4.env.data.addDataListener(obj.segment, obj.segmentListener);
            S4.env.data.addDataListener(obj.position, obj.positionListener);
          }
        }
      });
      this._hmi_listenerRemoves.push(function () {
        for (var id in m_vehicles) {
          if (m_vehicles.hasOwnProperty(id)) {
            var obj = m_vehicles[id];
            S4.env.data.removeDataListener(obj.segment, obj.segmentListener);
            S4.env.data.removeDataListener(obj.position, obj.positionListener);
          }
        }
        S4.env.data.removeGroupListener(that.vehicleGroupId, that);
      });
    }
    var fn_update = function (i_object, i_time) {
      // get the current values and reset the update flag
      var currSeg = i_object.segmentListener.currSeg;
      var poslis = i_object.positionListener;
      var currPosVal = poslis.currPos;
      var posUpdated = poslis.updated;
      poslis.updated = false;
      var segments = that.segments;
      if (currSeg !== undefined && currPosVal !== undefined) {
        for (var s = 0; s < segments.length; s++) {
          var segment = segments[s];
          if (segment.number === currSeg) {
            // if we reach this point we found the current segment and know
            // the position within this segment
            var factor = segment.factor;
            var currPos = typeof factor === 'number' && factor !== 1.0 ? currPosVal * factor : currPosVal;
            // get the times and values
            var prevPosCtrlVarUpdateTime = poslis.prevTime;
            var currPosCtrlVarUpdateTime = poslis.currTime;
            var prevPosVal = poslis.prevPos;
            var prevSeg = i_object.seg;
            // check conditions
            var validPrevValues = prevSeg !== undefined && prevPosVal !== undefined;
            var validCurrTime = currPosCtrlVarUpdateTime !== undefined;
            var validPrevTime = prevPosCtrlVarUpdateTime !== undefined;
            // if we got valid conditions and the values are not from the
            // same cycle
            if (validPrevValues && validCurrTime && validPrevTime && currPosCtrlVarUpdateTime > prevPosCtrlVarUpdateTime) {
              // if we are in the same segment as on last update
              if (currSeg === prevSeg) {
                var pos = i_object.pos;
                var vel = i_object.vel;
                var increasing = currPosVal >= prevPosVal;
                if (posUpdated) {
                  var velocity = (currPos - pos) / Math.min(currPosCtrlVarUpdateTime - prevPosCtrlVarUpdateTime, MAX_UPDATE_STEP_DURATION_MILLIS);
                  vel = increasing ? Math.max(velocity, 0.0) : Math.min(velocity, 0.0);
                  i_object.vel = vel;
                }
                if (pos !== undefined && vel !== undefined && vel !== 0.0) {
                  var currPosNew = pos + vel * (i_time - i_object.time);
                  currPos = increasing ? Math.min(currPosNew, currPos) : Math.max(currPosNew, currPos);
                }
                i_object.pos = currPos;
                i_object.seg = currSeg;
                i_object.time = i_time;
                return;
              }
              else {
                // if we reach this point we are in a different segment than
                // on previous call
                for (var o = 0; o < segments.length; o++) {
                  var prevSegment = segments[o];
                  if (prevSegment.number === prevSeg) {
                    var pos = i_object.pos;
                    var vel = i_object.vel;
                    var curr_inc = currPos <= segment.length * 0.5;
                    var prev_inc = pos >= prevSegment.length * 0.5;
                    var prevPosInCurrSeg = undefined;
                    if (prev_inc) {
                      if (curr_inc) {
                        prevPosInCurrSeg = pos - prevSegment.length;
                      }
                      else {
                        prevPosInCurrSeg = prevSegment.length - pos + segment.length;
                      }
                    }
                    else {
                      if (curr_inc) {
                        prevPosInCurrSeg = -pos;
                      }
                      else {
                        prevPosInCurrSeg = segment.length + pos;
                      }
                    }
                    if (posUpdated) {
                      var velocity = (currPos - prevPosInCurrSeg) / Math.min(currPosCtrlVarUpdateTime - prevPosCtrlVarUpdateTime, MAX_UPDATE_STEP_DURATION_MILLIS);
                      vel = curr_inc ? Math.max(velocity, 0.0) : Math.min(velocity, 0.0);
                      i_object.vel = vel;
                    }
                    if (vel !== undefined && vel !== 0.0) {
                      var currPosNew = prevPosInCurrSeg + vel * (i_time - i_object.time);
                      currPos = curr_inc ? Math.min(currPosNew, currPos) : Math.max(currPosNew, currPos);
                    }
                    if (curr_inc ? currPos >= 0 : currPos <= segment.length) {
                      i_object.pos = currPos;
                      i_object.seg = currSeg;
                    }
                    else {
                      if (prev_inc) {
                        if (curr_inc) {
                          i_object.pos = currPos + prevSegment.length;
                        }
                        else {
                          i_object.pos = prevSegment.length - currPos + segment.length;
                        }
                      }
                      else {
                        if (curr_inc) {
                          i_object.pos = -currPos;
                        }
                        else {
                          i_object.pos = currPos - segment.length;
                        }
                      }
                      i_object.seg = prevSeg;
                    }
                    i_object.time = i_time;
                    return;
                  }
                }
              }
            }
            // if we reach this point we only know the current segment and
            // position but we do not have any history - so interpolation
            // is not possible.
            i_object.time = i_time;
            i_object.seg = currSeg;
            i_object.pos = currPos;
            return;
          }
        }
      }
      // if we reach this point we do not know where the vehicle is
      delete i_object.vel;
      delete i_object.time;
      delete i_object.seg;
      delete i_object.pos;
    };

    this._hmi_refreshs.push(function (i_time, i_repaint) {
      var segments = that.segments;
      if (Array.isArray(segments)) {
        var simulationVelocity = that.simulationVelocity;
        if (i_simulation === true && m_vehiclesCount > 0 && (m_varGroupUpdateTime === undefined || i_time > m_varGroupUpdateTime + 500) && typeof simulationVelocity === 'number' && m_sim_trackLength > 0.0) {
          if (m_varGroupUpdateTime !== undefined) {
            if (that.reversibleTram === true) {
              var distance = m_sim_trackLength / 2;
              if (m_sim_direction1) {
                m_sim_offset += simulationVelocity * (i_time - m_varGroupUpdateTime) * 0.001;
                if (m_sim_offset > distance) {
                  m_sim_offset = distance;
                  m_sim_direction1 = false;
                }
              }
              else {
                m_sim_offset -= simulationVelocity * (i_time - m_varGroupUpdateTime) * 0.001;
                if (m_sim_offset < 0.0) {
                  m_sim_offset = 0.0;
                  m_sim_direction1 = true;
                }
              }
              if (that.vehicles[0] !== undefined) {
                for (var s = 0; s < segments.length; s++) {
                  var segment = segments[s];
                  if (segment.number === 1) {
                    var vehicle = m_vehicles[that.vehicles[0].id];
                    var fac = typeof segment.factor === 'number' ? segment.factor : 1.0;
                    var vp = m_sim_offset / fac;
                    var poslis = vehicle.positionListener;
                    var currPos = poslis.currPos;
                    if (currPos !== vp) {
                      poslis.prevPos = currPos;
                      poslis.currPos = vp;
                      poslis.updated = true;
                      poslis.prevTime = poslis.currTime;
                      poslis.currTime = i_time;
                    }
                    var seglis = vehicle.segmentListener;
                    if (seglis.currSeg === undefined) {
                      seglis.currSeg = 1;
                    }
                  }
                }
              }
              if (that.vehicles[1] !== undefined) {
                for (var s = 0; s < segments.length; s++) {
                  var segment = segments[s];
                  if (segment.number === 1) {
                    var vehicle = m_vehicles[that.vehicles[1].id];
                    var fac = typeof segment.factor === 'number' ? segment.factor : 1.0;
                    var vp = (distance - m_sim_offset) / fac;
                    var poslis = vehicle.positionListener;
                    var currPos = poslis.currPos;
                    if (currPos !== vp) {
                      poslis.prevPos = currPos;
                      poslis.currPos = vp;
                      poslis.updated = true;
                      poslis.prevTime = poslis.currTime;
                      poslis.currTime = i_time;
                    }
                    var seglis = vehicle.segmentListener;
                    if (seglis.currSeg === undefined) {
                      seglis.currSeg = 2;
                    }
                  }
                }
              }
            }
            else {
              m_sim_offset += simulationVelocity * (i_time - m_varGroupUpdateTime) * 0.001;
              while (m_sim_offset >= m_sim_trackLength) {
                m_sim_offset -= m_sim_trackLength;
              }
              while (m_sim_offset < 0) {
                m_sim_offset += m_sim_trackLength;
              }
              var distance = m_sim_trackLength / m_vehiclesCount;
              for (var id in m_vehicles) {
                if (m_vehicles.hasOwnProperty(id)) {
                  var obj = m_vehicles[id];
                  var pos = m_sim_offset + distance * obj.index;
                  while (pos >= m_sim_trackLength) {
                    pos -= m_sim_trackLength;
                  }
                  var length = 0.0;
                  for (var s = 0; s < segments.length; s++) {
                    var segment = segments[s];
                    if (typeof segment.number === 'number') {
                      var fac = typeof segment.factor === 'number' ? segment.factor : 1.0;
                      if (pos <= length + segment.length) {
                        var vp = (pos - length) / fac;
                        var poslis = obj.positionListener;
                        var currPos = poslis.currPos;
                        if (currPos !== vp) {
                          poslis.prevPos = currPos;
                          poslis.currPos = vp;
                          poslis.updated = true;
                          poslis.prevTime = poslis.currTime;
                          poslis.currTime = i_time;
                        }
                        var seglis = obj.segmentListener;
                        if (seglis.currSeg !== segment.number) {
                          seglis.currSeg = segment.number;
                        }
                        break;
                      }
                      length += segment.length;
                    }
                  }
                }
              }
            }
          }
          m_varGroupUpdateTime = i_time;
        }
        for (var id in m_vehicles) {
          if (m_vehicles.hasOwnProperty(id)) {
            fn_update(m_vehicles[id], i_time);
          }
        }
      }
    });

    this.hmi_getLocation = function (i_id, i_location) {
      var object = m_vehicles[i_id.toString()];
      if (object && object.seg !== undefined && object.pos !== undefined) {
        // if valid update the parameters and return successful
        i_location.segment = object.seg;
        i_location.position = object.pos;
        return true;
      }
      else {
        delete i_location.segment;
        delete i_location.position;
        return false;
      }
    };

    this._hmi_destroys.push(function () {
      delete that.handleGroupDataUpdate;
      delete that.hmi_getSituation;
      m_vehicles = undefined;
      m_vehiclesCount = 0;
      m_varGroupUpdateTime = undefined;
      that = undefined;
    });
  };

  /**
   * This mechanism maps vehicle positions given by an absolute value onto a
   * track departed in zones of different length.
   * 
   * @param {Object}
   *          i_curveSection The curve section
   * @param {Object}
   *          i_maxPosition The maximum position
   */
  var ZonePositionAdjuster = function (i_curveSection, i_maxPosition, i_simulation) {
    var that = this;
    var m_zones = [];
    var m_relativeLengthAddedUp = 0.0;
    var m_length = i_curveSection.getLength();
    var update = function () {
      // if forward this will be positive - if reverse negative
      m_relativeLengthAddedUp = 0.0;
      for (var i = 0; i < m_zones.length; i++) {
        var zoneHolder = m_zones[i];
        if (typeof zoneHolder.relativeLength !== 'number') {
          m_relativeLengthAddedUp = 0.0;
          return;
        }
        m_relativeLengthAddedUp += zoneHolder.relativeLength;
      }
    };

    var m_valid = false;
    for (var i = 0; i < i_curveSection.getZoneCount(); i++) {
      var zone = i_curveSection.getZoneObject(i)._hmi_object;
      var start = i_curveSection.getZoneStart(i);
      var end = i_curveSection.getZoneEnd(i);
      var zoneHolder = {
        zone: zone,
        start: start,
        end: end
      };
      if (i_simulation === true && typeof zone.sim === 'number') {
        zoneHolder.relativeLength = zone.sim;
      }
      else if (typeof zone.relativeLength === 'number') {
        zoneHolder.relativeLength = zone.relativeLength;
      }
      else if (typeof zone.relativeLength === 'string') {
        zoneHolder.handleDataUpdate = function (i_id, i_value) {
          this.relativeLength = i_value;
          update();
        };
      }
      else {
        zoneHolder.relativeLength = 1.0;
      }
      m_zones.push(zoneHolder);
      m_valid = true;
    }
    update();
    this.addListeners = function () {
      if (m_valid) {
        for (var i = 0; i < m_zones.length; i++) {
          var zoneHolder = m_zones[i];
          if (zoneHolder.handleDataUpdate) {
            S4.env.data.addDataListener(zoneHolder.zone.relativeLength, zoneHolder);
          }
        }
      }
    };
    this.removeListeners = function () {
      if (m_valid) {
        for (var i = 0; i < m_zones.length; i++) {
          var zoneHolder = m_zones[i];
          if (zoneHolder.handleDataUpdate) {
            S4.env.data.removeDataListener(zoneHolder.zone.relativeLength, zoneHolder);
          }
        }
      }
    };
    this.adjust = function (i_position) {
      var relPos = i_position / i_maxPosition;
      var absPos = relPos * m_length;
      if (m_valid !== true || m_relativeLengthAddedUp === 0.0 || m_zones.length === 0 || absPos <= m_zones[0].start || absPos >= m_zones[m_zones.length - 1].end) {
        return absPos;
      }
      var relativeLength = relPos * Math.abs(m_relativeLengthAddedUp);
      var start = 0;
      for (var i = 0; i < m_zones.length; i++) {
        var zoneHolder = m_zones[i];
        var objCnt = Math.abs(zoneHolder.relativeLength);
        var end = start + objCnt;
        if (relativeLength <= end) {
          var rel = (relativeLength - start) / objCnt;
          var sta = zoneHolder.start;
          return sta + (zoneHolder.end - sta) * rel;
        }
        start = end;
      }
      return absPos;
    };
    this.destroy = function () {
      for (var i = 0; i < m_zones.length; i++) {
        var zoneHolder = m_zones[i];
        delete zoneHolder.handleDataUpdate;
      }
      m_zones.splice(0, m_zones.length);
      m_zones = undefined;
      m_relativeLengthAddedUp = undefined;
      that = undefined;
    };
  };

  // add the features
  var exp = {
    ObjectPositionSystem: ObjectPositionSystem,
    ZonePositionAdjuster: ZonePositionAdjuster
  };
  // export for node.js or client
  if (isNodeJS) {
    module.exports = exp;
  }
  else {
    window.ObjectPositionSystem = exp;
  }
}(globalThis));
