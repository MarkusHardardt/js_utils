/*!
 * jQuery UI Touch Punch 0.2.2
 *
 * Copyright 2011, Dave Furfero
 * Dual licensed under the MIT or GPL Version 2 licenses.
 *
 * Depends:
 *  jquery.ui.widget.js
 *  jquery.ui.mouse.js
 */
(function ($) {

  // Detect touch support
  $.support.touch = 'ontouchend' in document;
  $.support.pointer = typeof window.PointerEvent === 'function';

  // Ignore browsers without touch or pointer support
  if (!$.support.touch && !$.support.pointer) {
    return;
  }

  var mouseProto = $.ui.mouse.prototype,
      _mouseInit = mouseProto._mouseInit,
      _mouseDestroy = mouseProto._mouseDestroy,
      touchHandled;

  function simulatePointerMouseEvent (event, simulatedType, target) {
    var simulatedEvent = document.createEvent('MouseEvents');

    simulatedEvent.initMouseEvent(
      simulatedType,
      true,
      true,
      window,
      1,
      event.screenX,
      event.screenY,
      event.clientX,
      event.clientY,
      false,
      false,
      false,
      false,
      0,
      null
    );

    target.dispatchEvent(simulatedEvent);
  }

  if ($.support.pointer) {
    mouseProto._pointerStart = function (event) {
      var pointerEvent = event.originalEvent || event;

      if (pointerEvent.pointerType === 'mouse' || touchHandled || !this._mouseCapture(pointerEvent)) {
        return;
      }

      touchHandled = true;
      this._pointerId = pointerEvent.pointerId;
      this._pointerMoved = false;
      pointerEvent.preventDefault();
      simulatePointerMouseEvent(pointerEvent, 'mouseover', pointerEvent.target);
      simulatePointerMouseEvent(pointerEvent, 'mousemove', pointerEvent.target);
      simulatePointerMouseEvent(pointerEvent, 'mousedown', pointerEvent.target);
      $(document)
        .on('pointermove', this._pointerMoveHandler)
        .on('pointerup', this._pointerEndHandler)
        .on('pointercancel', this._pointerCancelHandler);
      if (this.element[0].setPointerCapture) {
        this.element[0].setPointerCapture(pointerEvent.pointerId);
      }
    };

    mouseProto._pointerMove = function (event) {
      var pointerEvent = event.originalEvent || event;

      if (pointerEvent.pointerId !== this._pointerId) {
        return;
      }

      this._pointerMoved = true;
      pointerEvent.preventDefault();
      simulatePointerMouseEvent(pointerEvent, 'mousemove', this.element[0]);
    };

    mouseProto._pointerEnd = function (event) {
      var pointerEvent = event.originalEvent || event;

      if (pointerEvent.pointerId !== this._pointerId) {
        return;
      }

      pointerEvent.preventDefault();
      simulatePointerMouseEvent(pointerEvent, 'mouseup', this.element[0]);
      simulatePointerMouseEvent(pointerEvent, 'mouseout', this.element[0]);
      $(document)
        .off('pointermove', this._pointerMoveHandler)
        .off('pointerup', this._pointerEndHandler)
        .off('pointercancel', this._pointerCancelHandler);
      if (this.element[0].hasPointerCapture && this.element[0].hasPointerCapture(pointerEvent.pointerId)) {
        this.element[0].releasePointerCapture(pointerEvent.pointerId);
      }
      this._pointerId = undefined;
      this._pointerMoved = false;
      touchHandled = false;
    };
  }

  /**
   * Simulate a mouse event based on a corresponding touch event
   * @param {Object} event A touch event
   * @param {String} simulatedType The corresponding mouse event
   */
  function simulateMouseEvent (event, simulatedType) {

    // Ignore multi-touch events
    if (event.originalEvent.touches.length > 1) {
      return;
    }

    event.preventDefault();

    var touch = event.originalEvent.changedTouches[0],
        simulatedEvent = document.createEvent('MouseEvents');
    
    // Initialize the simulated mouse event using the touch event's coordinates
    simulatedEvent.initMouseEvent(
      simulatedType,    // type
      true,             // bubbles                    
      true,             // cancelable                 
      window,           // view                       
      1,                // detail                     
      touch.screenX,    // screenX                    
      touch.screenY,    // screenY                    
      touch.clientX,    // clientX                    
      touch.clientY,    // clientY                    
      false,            // ctrlKey                    
      false,            // altKey                     
      false,            // shiftKey                   
      false,            // metaKey                    
      0,                // button                     
      null              // relatedTarget              
    );

    // Dispatch the simulated event to the target element
    event.target.dispatchEvent(simulatedEvent);
  }

  /**
   * Handle the jQuery UI widget's touchstart events
   * @param {Object} event The widget element's touchstart event
   */
  mouseProto._touchStart = function (event) {

    var self = this;

    // Ignore the event if another widget is already being handled
    if (touchHandled || !self._mouseCapture(event.originalEvent.changedTouches[0])) {
      return;
    }

    // Set the flag to prevent other widgets from inheriting the touch event
    touchHandled = true;

    // Track movement to determine if interaction was a click
    self._touchMoved = false;

    // Simulate the mouseover event
    simulateMouseEvent(event, 'mouseover');

    // Simulate the mousemove event
    simulateMouseEvent(event, 'mousemove');

    // Simulate the mousedown event
    simulateMouseEvent(event, 'mousedown');
  };

  /**
   * Handle the jQuery UI widget's touchmove events
   * @param {Object} event The document's touchmove event
   */
  mouseProto._touchMove = function (event) {

    // Ignore event if not handled
    if (!touchHandled) {
      return;
    }

    // Interaction was not a click
    this._touchMoved = true;

    // Simulate the mousemove event
    simulateMouseEvent(event, 'mousemove');
  };

  /**
   * Handle the jQuery UI widget's touchend events
   * @param {Object} event The document's touchend event
   */
  mouseProto._touchEnd = function (event) {

    // Ignore event if not handled
    if (!touchHandled) {
      return;
    }

    // Simulate the mouseup event
    simulateMouseEvent(event, 'mouseup');

    // Simulate the mouseout event
    simulateMouseEvent(event, 'mouseout');

    // If the touch interaction did not move, it should trigger a click
    if (!this._touchMoved) {

      // Simulate the click event
      simulateMouseEvent(event, 'click');
    }

    // Unset the flag to allow other widgets to inherit the touch event
    touchHandled = false;
  };

  mouseProto._touchCancel = function (event) {
    if (!touchHandled) {
      return;
    }

    simulateMouseEvent(event, 'mouseup');
    simulateMouseEvent(event, 'mouseout');
    touchHandled = false;
  };

  /**
   * A duck punch of the $.ui.mouse _mouseInit method to support touch events.
   * This method extends the widget with bound touch event handlers that
   * translate touch events to mouse events and pass them to the widget's
   * original mouse event handling methods.
   */
  mouseProto._mouseInit = function () {
    
    var self = this;

    if ($.support.pointer) {
      self._touchAction = self.element[0].style.touchAction;
      self.element[0].style.touchAction = 'none';
      self._pointerStartHandler = $.proxy(self, '_pointerStart');
      self._pointerMoveHandler = $.proxy(self, '_pointerMove');
      self._pointerEndHandler = $.proxy(self, '_pointerEnd');
      self._pointerCancelHandler = $.proxy(self, '_pointerEnd');
      self.element.on('pointerdown', self._pointerStartHandler);
    } else if ($.support.touch) {
      // Delegate the touch handlers to the widget's element
      self.element
        .bind('touchstart', $.proxy(self, '_touchStart'))
        .bind('touchmove', $.proxy(self, '_touchMove'))
        .bind('touchend', $.proxy(self, '_touchEnd'))
        .bind('touchcancel', $.proxy(self, '_touchCancel'));
    }

    // Call the original $.ui.mouse init method
    _mouseInit.call(self);
  };

  mouseProto._mouseDestroy = function () {
    if ($.support.pointer) {
      this.element.off('pointerdown', this._pointerStartHandler);
      $(document)
        .off('pointermove', this._pointerMoveHandler)
        .off('pointerup', this._pointerEndHandler)
        .off('pointercancel', this._pointerCancelHandler);
      if (this._pointerId !== undefined) {
        if (this.element[0].hasPointerCapture && this.element[0].hasPointerCapture(this._pointerId)) {
          this.element[0].releasePointerCapture(this._pointerId);
        }
        touchHandled = false;
      }
      this.element[0].style.touchAction = this._touchAction;
      this._pointerId = undefined;
      this._pointerStartHandler = undefined;
      this._pointerMoveHandler = undefined;
      this._pointerEndHandler = undefined;
      this._pointerCancelHandler = undefined;
    }

    _mouseDestroy.call(this);
  };

})(jQuery);