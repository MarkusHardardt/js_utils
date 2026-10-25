# Executor

`Executor` is a callback-based utility for coordinating asynchronous actions.
It predates native promises and provides four mechanisms: `run`, `pipe`,
`decouple`, and `unstress`. Tasks passed to it use the Node-style convention
of receiving success and error callbacks:

```js
const task = (onSuccess, onError) => {
    performAsyncWork(result => onSuccess(result), error => onError(error));
};
```

Import the default export from `src/Executor.js`:

```js
import Executor from './src/Executor.js';
```

The exported object is sealed and exposes these four methods.

## `Executor.run(taskOrTasks, onSuccess?, onError?, onTimeout?, timeoutMillis?)`

Runs one asynchronous task or a task array. For a single task, `onSuccess`
receives the value passed to the task's success callback, and `onError`
receives its error. Either callback may be omitted when it is not needed. If
an error occurs and no error callback is supplied, `run` throws an exception.

```js
Executor.run(loadConfiguration, config => {
    console.log(config);
}, error => {
    console.error(error);
});
```

An array runs its tasks in sequence by default. Concurrency can be configured
either with the array's `parallel` property or with a leading option:

```js
const tasks = [loadA, loadB, loadC];
tasks.parallel = true; // Run all tasks concurrently.
Executor.run(tasks, onSuccess, onError);

Executor.run([2, loadA, loadB, loadC], onSuccess, onError); // At most two at once.
Executor.run([true, loadA, loadB, loadC], onSuccess, onError); // All at once.
Executor.run([false, loadA, loadB], onSuccess, onError); // In sequence.
```

Set `parallel` to a positive number to limit concurrent tasks; `true` runs all
tasks concurrently. A leading boolean or number has the same meaning and is
removed from the task list. A `parallel` property set to `true` or a positive
number takes precedence over the leading option. When a task array succeeds,
non-`undefined` results are collected in completion order and passed as an
array to `onSuccess`; if every result is `undefined`, the callback receives
`undefined`. An empty task array succeeds immediately without a result
argument. The first task error ends the run and calls `onError`.

The optional timeout applies to each asynchronous task. If `onTimeout` is
omitted, it defaults to `onError`. When a task times out, the timeout callback
receives that task function. For an array, the timeout callback is invoked for
the task that timed out.

```js
Executor.run(loadConfiguration, onSuccess, onError, onTimeout, 5000);
```

## `Executor.pipe(onError?, onTimeout?, timeoutMillis?)`

Creates a queue that executes asynchronous tasks one at a time, in the order
they are added. The returned function accepts a task and starts it immediately
if the queue is idle; otherwise, it waits for the active task to succeed.
Tasks receive success and error callbacks, as with `run`.

```js
const enqueue = Executor.pipe(error => console.error(error));
enqueue(saveFirst);
enqueue(saveSecond); // Starts after saveFirst succeeds.
```

An error or timeout clears the remaining queue. The error callback receives the
task error. If no error callback is supplied, errors are reported with
`console.error`. A positive timeout is applied to each running task; the
timeout handler defaults to `onError` and receives a string identifying the
timed-out task. A timeout handler can be provided separately:

```js
const enqueue = Executor.pipe(onError, onTimeout, 5000);
```

## `Executor.decouple(action, intervalMillis?, delayMillis?)`

Returns a trigger function that limits how often a synchronous action runs.
The first trigger runs the action immediately. Later triggers are limited to
one execution per interval; if triggered before the interval has elapsed, one
execution is scheduled for when the interval expires. Additional triggers
while that execution is waiting are ignored.

An optional delay postpones the first trigger's processing. When both positive
numbers are provided, the smaller is the delay and the larger is the minimum
interval; they may be passed in either order. With only one number, it is the
minimum interval.

```js
const refresh = Executor.decouple(refreshView, 1000);
refresh();
refresh(); // Runs no more than once per second.

const delayedRefresh = Executor.decouple(refreshView, 250, 1000);
delayedRefresh(); // Processing starts after the initial 250 ms delay.
```

Exceptions thrown by `action` are reported with `console.error`.

## `Executor.unstress(onError?, onTimeout?, timeoutMillis?)`

Creates a function for running asynchronous tasks without overlapping them.
The returned function accepts a task with success and error callbacks. While a
task is running, further calls replace the pending request: once the active
task completes, fails, or times out, only the most recently requested
different task is run.

```js
const runLatest = Executor.unstress(
    error => console.error(error),
    onTimeout,
    5000
);

runLatest(updateView);
runLatest(updateViewWithLatestData); // Runs after updateView finishes.
```

The error handler receives task errors. A positive timeout is applied to a
running task; the timeout handler defaults to `onError` and receives a string
identifying the timed-out task.
