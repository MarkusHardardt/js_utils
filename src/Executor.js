(function (root) {
    "use strict";
    const Executor = {};
    const isNodeJS = typeof require === 'function';

    function exec(object, onSuccess, onError, onTimeout, timeoutMillis) {
        if (typeof object === 'function') {
            let done = false, timeoutTimer = null;
            try {
                let thisCall = true, hasSuccess = false, hasError = false, result, exception;
                // call safely ...
                object(response => { // on success:
                    if (!done) {
                        done = true;
                        if (timeoutTimer) {
                            clearTimeout(timeoutTimer);
                        }
                        if (thisCall) {
                            hasSuccess = true;
                            result = response;
                        } else {
                            onSuccess(response);
                        }
                    }
                }, error => { // on error:
                    if (!done) {
                        done = true;
                        if (timeoutTimer) {
                            clearTimeout(timeoutTimer);
                        }
                        if (thisCall) {
                            hasError = true;
                            exception = error;
                        } else {
                            onError(error);
                        }
                    }
                });
                thisCall = false;
                if (hasError) {
                    onError(exception);
                } else if (hasSuccess) {
                    onSuccess(result);
                } else if (timeoutMillis && typeof onTimeout === 'function') { // start watchdog only if required
                    timeoutTimer = setTimeout(() => {
                        if (!done) {
                            done = true;
                            onTimeout(object);
                        }
                    }, Math.ceil(timeoutMillis));
                }
            } catch (error) {
                done = true;
                onError(error);
            }
        } else if (Array.isArray(object)) {
            // There are several ways to configure the serial / parallel behavior of
            // this mechanism. So at first we try to resolve how many tasks may be
            // called together and what is our first task.
            const start = typeof object[0] === 'boolean' || typeof object[0] === 'number' ? 1 : 0, end = object.length;
            let count = 1;
            if (object.parallel === true || object[0] === true) {
                count = end - start;
            } else if (typeof object.parallel === 'number' && object.parallel > 0) {
                count = Math.min(object.parallel, end - start);
            } else if (typeof object[0] === 'number' && object[0] > 0) {
                count = Math.min(object[0], end - start);
            }
            // We store our task states inside an array and by calling 'next()' we
            // either trigger the next task or our success callback.
            let results, done = false
            const states = [], next = () => {
                if (!done) {
                    let t, thisCall, hasSuccess, hasError, exception;
                    // First we loop over all tasks and trigger the next that has not been
                    // already triggered.
                    for (t = start; t < end; t++) {
                        if (states[t] === undefined) {
                            states[t] = false;
                            thisCall = true;
                            hasSuccess = false;
                            hasError = false;
                            exception = undefined;
                            (function () {
                                const task = t;
                                exec(object[task], result => {
                                    states[task] = true;
                                    if (result !== undefined) {
                                        if (results) {
                                            results.push(result);
                                        } else {
                                            results = [result];
                                        }
                                    }
                                    if (thisCall) {
                                        hasSuccess = true;
                                    } else {
                                        next();
                                    }
                                }, error => {
                                    done = true;
                                    if (thisCall) {
                                        error = true;
                                        exception = error;
                                    } else {
                                        onError(error);
                                    }
                                }, onTimeout, timeoutMillis);
                            }());
                            thisCall = false;
                            if (hasError) {
                                onError(exception);
                                return;
                            } else if (!hasSuccess) {
                                return;
                            }
                        }
                    }
                    // Reaching this point means that no more tasks have to be started. So
                    // we check if any task has not succeeded so far.
                    for (t = start; t < end; t++) {
                        if (!states[t]) {
                            return;
                        }
                    }
                    // Reaching this point means that all tasks have succeeded. So we are
                    // done.
                    done = true;
                    onSuccess(results);
                }
            };
            // Now we call our next function as often as allowed. But if no tasks
            // available at all we succeed.
            const e = start + count;
            if (start < e) {
                for (let t = start; t < e; t++) {
                    next();
                }
            } else {
                onSuccess();
            }
        } else {
            onError(`Cannot execute! Object is not a function and no array: ${object}`);
        }
    }

    function run() { // Note: No not change to lambda function, because 'arguments' will not work anymore!
        // init callbacks and helpers
        let ai, al = arguments.length, ar;
        let on_success = al > 1 && typeof arguments[1] === 'function' ? arguments[1] : false;
        let on_error = al > 2 && typeof arguments[2] === 'function' ? arguments[2] : false;
        let on_timeout = on_error, millis = false;
        for (ai = 3; ai < al; ai++) {
            ar = arguments[ai];
            if (on_timeout !== ar && typeof ar === 'function') {
                on_timeout = ar;
            } else if (!millis && typeof ar === 'number' && ar > 0) {
                millis = ar;
            }
        }
        let this_call = true, success, result, error, exception;
        exec(arguments[0], res => {
            if (this_call) {
                success = true;
                result = res;
            } else if (on_success) {
                on_success(res);
            }
        }, err => {
            if (this_call) {
                error = true;
                exception = err;
            } else if (on_error) {
                on_error(err);
            } else {
                throw new Error('EXCEPTION! Cannot execute: ' + err);
            }
        }, on_timeout, millis);
        this_call = false;
        if (error) {
            if (on_error) {
                on_error(exception);
            } else {
                throw new Error('EXCEPTION! Cannot execute: ' + exception);
            }
        }
        else if (success && on_success) {
            on_success(result);
        }
    }
    Executor.run = run;

    function pipe() {// Note: No not change to lambda function, because 'arguments' will not work anymore!
        // init callbacks and helpers
        let ai, al = arguments.length, ar;
        let on_error = al > 0 && typeof arguments[0] === 'function' ? arguments[0] : false;
        let on_timeout = on_error, timeoutTimer = null, millis = false;
        for (ai = 1; ai < al; ai++) {
            ar = arguments[ai];
            if (on_timeout !== ar && typeof ar === 'function') {
                on_timeout = ar;
            } else if (!millis && typeof ar === 'number' && ar > 0) {
                millis = ar;
            }
        }
        let tasks = [], running = false, run = () => {
            if (!running) {
                let task, this_call, success, error, exception;
                while (tasks.length > 0) {
                    try {
                        // get next task, remove from pipe and run task
                        task = tasks[0]
                        tasks.splice(0, 1);
                        running = true;
                        this_call = true;
                        success = false;
                        error = false;
                        exception = undefined;
                        task(() => {
                            // handle success callback only once and if still running
                            if (running) {
                                running = false;
                                if (this_call) {
                                    success = true;
                                } else if (tasks.length > 0) {
                                    run();
                                }
                            }
                        }, err => {
                            // handle error callback only once and if still running
                            if (running) {
                                running = false;
                                tasks.splice(0, tasks.length);
                                if (this_call) {
                                    error = true;
                                    exception = err;
                                } else if (on_error) {
                                    on_error(err);
                                } else {
                                    console.error('ERROR! On performing task: ' + err);
                                }
                            }
                        });
                        this_call = false;
                        if (error) {
                            if (on_error) {
                                on_error(exception);
                            } else {
                                console.error('ERROR! On performing task: ' + exception);
                            }
                            return;
                        }
                        else if (!success) {
                            if (millis && on_timeout) {
                                timeoutTimer = setTimeout(() => {
                                    if (running) {
                                        running = false;
                                        tasks.splice(0, tasks.length);
                                        if (on_timeout) {
                                            on_timeout('timeout: ' + task.toString());
                                        }
                                    }
                                }, Math.ceil(millis));
                            }
                            return;
                        }
                    } catch (exc) {
                        running = false;
                        tasks.splice(0, tasks.length);
                        if (on_error) {
                            on_error(exc);
                        } else {
                            console.error('EXCEPTION! On performing task: ' + exc);
                        }
                        return;
                    }
                }
            }
        };
        return function () { // Note: No not change to lambda function, because 'arguments' will not work anymore!
            if (typeof arguments[0] === 'function') {
                tasks.push(arguments[0]);
                if (!running) {
                    run();
                }
            }
        };
    }
    Executor.pipe = pipe;

    function decouple() { // Note: No not change to lambda function, because 'arguments' will not work anymore!
        // init callbacks and times
        let action = false, delay = false, millis = false, ai, al = arguments.length, ar;
        for (ai = 0; ai < al; ai++) {
            ar = arguments[ai];
            if (!action && typeof ar === 'function') {
                action = ar;
            } else if (!millis && typeof ar === 'number' && ar > 0) {
                millis = ar;
            } else if (!delay && typeof ar === 'number' && ar > 0) {
                if (ar > millis) {
                    delay = millis;
                    millis = ar;
                } else {
                    delay = ar;
                }
            }
        }
        let perform = () => {
            try {
                action();
            } catch (exc) {
                console.error('EXCEPTION! Cannot perform minimum timeout action: ' + exc);
            }
        };
        let timeoutTimer = null, prev = undefined, trigger = () => {
            // we only perform if we are not already waiting in a timeout
            if (!timeoutTimer) {
                let time = new Date().getTime();
                if (prev === undefined || time >= prev + millis) {
                    // if first call or previous is the minimum time in the past we
                    // perform immediately
                    prev = time;
                    perform();
                }
                else {
                    // if previous call is too short in the past we wait until timeout
                    timeoutTimer = setTimeout(() => {
                        prev = new Date().getTime();
                        timeoutTimer = null;
                        perform();
                    }, millis + prev - time);
                }
            }
        };
        let delay_timeout = undefined;
        return delay ? () => {
            if (delay_timeout === undefined) {
                delay_timeout = setTimeout(() => {
                    delay_timeout = undefined;
                    trigger();
                }, delay);
            }
        } : trigger;
    }
    Executor.decouple = decouple;

    function unstress() { // Note: No not change to lambda function, because 'arguments' will not work anymore!
        // init callbacks and helpers
        let ai, al = arguments.length, ar;
        let on_error = al > 0 && typeof arguments[0] === 'function' ? arguments[0] : false;
        let on_timeout = on_error, timeoutTimer = null, millis = false;
        for (ai = 1; ai < al; ai++) {
            ar = arguments[ai];
            if (on_timeout !== ar && typeof ar === 'function') {
                on_timeout = ar;
            } else if (!millis && typeof ar === 'number' && ar > 0) {
                millis = ar;
            }
        }
        // If not busy we change to busy and run the task.
        // On success, error or in case of an exception and if meanwhile
        // another task has been passed we call this function again.
        var latest_requested_task, busy = false;
        var run = task => {
            if (typeof task === 'function') {
                latest_requested_task = task;
                if (!busy) {
                    busy = true;
                    try {
                        task(() => {
                            if (busy) {
                                busy = false;
                                if (timeoutTimer) {
                                    clearTimeout(timeoutTimer);
                                } if (latest_requested_task !== task) {
                                    run(latest_requested_task);
                                }
                            }
                        }, err => {
                            if (busy) {
                                busy = false;
                                if (timeoutTimer) {
                                    clearTimeout(timeoutTimer);
                                }
                                on_error(err);
                                if (latest_requested_task !== task) {
                                    run(latest_requested_task);
                                }
                            }
                        });
                        if (busy && millis && on_timeout) {
                            timeoutTimer = setTimeout(() => {
                                if (busy) {
                                    busy = false;
                                    if (on_timeout) {
                                        on_timeout('timeout: ' + task.toString());
                                    }
                                    if (latest_requested_task !== task) {
                                        run(latest_requested_task);
                                    }
                                }
                            }, Math.ceil(millis));
                        }
                    } catch (exc) {
                        busy = false;
                        if (timeoutTimer) {
                            clearTimeout(timeoutTimer);
                        }
                        if (on_error) {
                            on_error(exc);
                        }
                    }
                }
            }
        };
        return run;
    }
    Executor.unstress = unstress;

    Object.seal(Executor);
    if (isNodeJS) {
        module.exports = Executor;
    } else {
        root.Executor = Executor;
    }
}(globalThis));
