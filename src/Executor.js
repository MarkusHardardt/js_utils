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
        const al = arguments.length;
        const onSuccess = al > 1 && typeof arguments[1] === 'function' ? arguments[1] : false;
        const onError = al > 2 && typeof arguments[2] === 'function' ? arguments[2] : false;
        let onTimeout = onError, millis = false;
        for (let ai = 3; ai < al; ai++) {
            const ar = arguments[ai];
            if (onTimeout !== ar && typeof ar === 'function') {
                onTimeout = ar;
            } else if (!millis && typeof ar === 'number' && ar > 0) {
                millis = ar;
            }
        }
        let thisCall = true, hasSuccess, hasError, result, exception;
        exec(arguments[0], res => {
            if (thisCall) {
                hasSuccess = true;
                result = res;
            } else if (onSuccess) {
                onSuccess(res);
            }
        }, error => {
            if (thisCall) {
                hasError = true;
                exception = error;
            } else if (onError) {
                onError(error);
            } else {
                throw new Error(`EXCEPTION! Cannot execute: ${error}`);
            }
        }, onTimeout, millis);
        thisCall = false;
        if (hasError) {
            if (onError) {
                onError(exception);
            } else {
                throw new Error(`EXCEPTION! Cannot execute: ${exception}`);
            }
        } else if (hasSuccess && onSuccess) {
            onSuccess(result);
        }
    }
    Executor.run = run;

    function pipe() {// Note: No not change to lambda function, because 'arguments' will not work anymore!
        // init callbacks and helpers
        const al = arguments.length;
        const onError = al > 0 && typeof arguments[0] === 'function' ? arguments[0] : false;
        let onTimeout = onError, timeoutTimer = null, timeoutMillis = false;
        for (let ai = 1; ai < al; ai++) {
            const ar = arguments[ai];
            if (onTimeout !== ar && typeof ar === 'function') {
                onTimeout = ar;
            } else if (!timeoutMillis && typeof ar === 'number' && ar > 0) {
                timeoutMillis = ar;
            }
        }
        let running = false;
        const tasks = [], run = () => {
            if (!running) {
                let task, thisCall, hasSuccess, hasError, exception;
                while (tasks.length > 0) {
                    try {
                        // get next task, remove from pipe and run task
                        task = tasks[0]
                        tasks.splice(0, 1);
                        running = true;
                        thisCall = true;
                        hasSuccess = false;
                        hasError = false;
                        exception = undefined;
                        task(() => {
                            // handle success callback only once and if still running
                            if (running) {
                                running = false;
                                if (thisCall) {
                                    hasSuccess = true;
                                } else if (tasks.length > 0) {
                                    run();
                                }
                            }
                        }, error => {
                            // handle error callback only once and if still running
                            if (running) {
                                running = false;
                                tasks.splice(0, tasks.length);
                                if (thisCall) {
                                    hasError = true;
                                    exception = error;
                                } else if (onError) {
                                    onError(error);
                                } else {
                                    console.error(`ERROR! On performing task: ${error}`);
                                }
                            }
                        });
                        thisCall = false;
                        if (hasError) {
                            if (onError) {
                                onError(exception);
                            } else {
                                console.error(`ERROR! On performing task: ${exception}`);
                            }
                            return;
                        } else if (!hasSuccess) {
                            if (timeoutMillis && onTimeout) {
                                timeoutTimer = setTimeout(() => {
                                    if (running) {
                                        running = false;
                                        tasks.splice(0, tasks.length);
                                        if (onTimeout) {
                                            onTimeout('timeout: ' + task.toString());
                                        }
                                    }
                                }, Math.ceil(timeoutMillis));
                            }
                            return;
                        }
                    } catch (exc) {
                        running = false;
                        tasks.splice(0, tasks.length);
                        if (onError) {
                            onError(exc);
                        } else {
                            console.error(`EXCEPTION! On performing task: ${exc}`);
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
        const al = arguments.length;
        let action = false, delay = false, millis = false;
        for (let ai = 0; ai < al; ai++) {
            const ar = arguments[ai];
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
        const perform = () => {
            try {
                action();
            } catch (exc) {
                console.error('EXCEPTION! Cannot perform minimum timeout action: ' + exc);
            }
        };
        let timeoutTimer = null, prev = undefined;
        const trigger = () => {
            // we only perform if we are not already waiting in a timeout
            if (!timeoutTimer) {
                const time = new Date().getTime();
                if (prev === undefined || time >= prev + millis) {
                    // if first call or previous is the minimum time in the past we
                    // perform immediately
                    prev = time;
                    perform();
                } else {
                    // if previous call is too short in the past we wait until timeout
                    timeoutTimer = setTimeout(() => {
                        prev = new Date().getTime();
                        timeoutTimer = null;
                        perform();
                    }, millis + prev - time);
                }
            }
        };
        let delayTimeout = undefined;
        return delay ? () => {
            if (delayTimeout === undefined) {
                delayTimeout = setTimeout(() => {
                    delayTimeout = undefined;
                    trigger();
                }, delay);
            }
        } : trigger;
    }
    Executor.decouple = decouple;

    function unstress() { // Note: No not change to lambda function, because 'arguments' will not work anymore!
        // init callbacks and helpers
        const al = arguments.length;
        const onError = al > 0 && typeof arguments[0] === 'function' ? arguments[0] : false;
        let onTimeout = onError, timeoutTimer = null, timeoutMillis = false;
        for (let ai = 1; ai < al; ai++) {
            const ar = arguments[ai];
            if (onTimeout !== ar && typeof ar === 'function') {
                onTimeout = ar;
            } else if (!timeoutMillis && typeof ar === 'number' && ar > 0) {
                timeoutMillis = ar;
            }
        }
        // If not busy we change to busy and run the task.
        // On success, error or in case of an exception and if meanwhile
        // another task has been passed we call this function again.
        let latestRequestedTask, busy = false;
        const run = task => {
            if (typeof task === 'function') {
                latestRequestedTask = task;
                if (!busy) {
                    busy = true;
                    try {
                        task(() => {
                            if (busy) {
                                busy = false;
                                if (timeoutTimer) {
                                    clearTimeout(timeoutTimer);
                                } if (latestRequestedTask !== task) {
                                    run(latestRequestedTask);
                                }
                            }
                        }, err => {
                            if (busy) {
                                busy = false;
                                if (timeoutTimer) {
                                    clearTimeout(timeoutTimer);
                                }
                                onError(err);
                                if (latestRequestedTask !== task) {
                                    run(latestRequestedTask);
                                }
                            }
                        });
                        if (busy && timeoutMillis && onTimeout) {
                            timeoutTimer = setTimeout(() => {
                                if (busy) {
                                    busy = false;
                                    if (onTimeout) {
                                        onTimeout('timeout: ' + task.toString());
                                    }
                                    if (latestRequestedTask !== task) {
                                        run(latestRequestedTask);
                                    }
                                }
                            }, Math.ceil(timeoutMillis));
                        }
                    } catch (exc) {
                        busy = false;
                        if (timeoutTimer) {
                            clearTimeout(timeoutTimer);
                        }
                        if (onError) {
                            onError(exc);
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
