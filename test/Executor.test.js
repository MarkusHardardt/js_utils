import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Executor from '../src/Executor.js';

const wait = millis => new Promise(resolve => setTimeout(resolve, millis));

function execute(task, ...options) {
    return new Promise((resolve, reject) => {
        Executor.run(task, resolve, reject, ...options);
    });
}

describe('Executor.run', () => {
    it('executes synchronous and asynchronous functions and forwards their result', async () => {
        assert.equal(await execute((onSuccess) => onSuccess('sync')), 'sync');
        assert.equal(await execute(onSuccess => setTimeout(() => onSuccess('async'), 0)), 'async');
    });

    it('handles synchronous errors, thrown exceptions, and invalid input', async () => {
        const error = new Error('failed');
        await assert.rejects(execute((onSuccess, onError) => onError(error)), candidate => candidate === error);
        await assert.rejects(execute(() => { throw error; }), candidate => candidate === error);
        await assert.rejects(execute('not a task'), /Cannot execute! Object is not a function and no array/);
    });

    it('ignores duplicate completion callbacks', async () => {
        let successes = 0;
        let errors = 0;
        Executor.run((onSuccess, onError) => {
            onSuccess('first');
            onSuccess('second');
            onError(new Error('late error'));
        }, value => {
            successes++;
            assert.equal(value, 'first');
        }, () => errors++);
        assert.equal(successes, 1);
        assert.equal(errors, 0);
    });

    it('supports empty arrays and serial task arrays while collecting defined results', async () => {
        assert.equal(await execute([]), undefined);
        const order = [];
        const result = await execute([
            onSuccess => { order.push('first'); onSuccess(1); },
            onSuccess => { order.push('second'); onSuccess(); },
            onSuccess => { order.push('third'); onSuccess(3); }
        ]);
        assert.deepEqual(order, ['first', 'second', 'third']);
        assert.deepEqual(result, [1, 3]);
    });

    it('supports numeric limits and parallel arrays, collecting results in completion order', async () => {
        const starts = [];
        const completions = [];
        const tasks = [1, 2, 3].map(id => onSuccess => {
            starts.push(id);
            completions[id] = onSuccess;
        });
        tasks.parallel = 2;
        const resultPromise = execute(tasks);
        assert.deepEqual(starts, [1, 2]);
        completions[2](2);
        assert.deepEqual(starts, [1, 2, 3]);
        completions[3](3);
        completions[1](1);
        assert.deepEqual(await resultPromise, [2, 3, 1]);

        const tasksWithBooleanPrefix = [true, ...[1, 2, 3].map(value => onSuccess => onSuccess(value))];
        const tasksWithNumericPrefix = [2, ...[1, 2, 3].map(value => onSuccess => onSuccess(value))];
        const tasksWithParallelProperty = [1, 2, 3].map(value => onSuccess => onSuccess(value));
        tasksWithParallelProperty.parallel = true;
        assert.deepEqual(await execute(tasksWithBooleanPrefix), [1, 2, 3]);
        assert.deepEqual(await execute(tasksWithNumericPrefix), [1, 2, 3]);
        assert.deepEqual(await execute(tasksWithParallelProperty), [1, 2, 3]);
    });

    it('rejects an array when one of its tasks fails', async () => {
        const error = new Error('task failed');
        await assert.rejects(execute([
            onSuccess => onSuccess('first'),
            (onSuccess, onError) => onError(error),
            onSuccess => onSuccess('unreached')
        ]), candidate => candidate === error);
    });

    it('routes a function timeout to the timeout callback', async () => {
        const task = onSuccess => {};
        const timeout = new Promise(resolve => {
            Executor.run(task, () => assert.fail('unexpected success'), assert.fail, timedOutTask => resolve(timedOutTask), 10);
        });
        assert.equal(await timeout, task);
    });
});

describe('Executor.pipe', () => {
    it('runs queued tasks sequentially', async () => {
        const order = [];
        const pipe = Executor.pipe();
        pipe(onSuccess => {
            order.push('first started');
            setTimeout(() => {
                order.push('first finished');
                onSuccess();
            }, 0);
        });
        pipe(onSuccess => {
            order.push('second');
            onSuccess();
        });
        await wait(10);
        assert.deepEqual(order, ['first started', 'first finished', 'second']);
    });

    it('clears queued tasks and reports a task error', async () => {
        const error = new Error('pipe failed');
        const order = [];
        const observedError = new Promise(resolve => {
            const pipe = Executor.pipe(resolve);
            let fail;
            pipe((onSuccess, onError) => { fail = onError; });
            pipe(onSuccess => order.push('must not run'));
            fail(error);
        });
        assert.equal(await observedError, error);
        assert.deepEqual(order, []);
    });

    it('reports thrown task exceptions', async () => {
        const error = new Error('pipe exception');
        const observedError = new Promise(resolve => {
            Executor.pipe(resolve)(() => { throw error; });
        });
        assert.equal(await observedError, error);
    });

    it('times out a task and discards tasks behind it', async () => {
        const order = [];
        const timeout = new Promise(resolve => {
            const pipe = Executor.pipe(() => assert.fail('unexpected error'), resolve, 10);
            pipe(() => {});
            pipe(() => order.push('must not run'));
        });
        assert.match(await timeout, /^timeout: /);
        assert.deepEqual(order, []);
    });
});

describe('Executor.decouple', () => {
    it('performs the first call immediately and coalesces calls during the minimum interval', async () => {
        let calls = 0;
        const trigger = Executor.decouple(() => calls++, 25);
        trigger();
        assert.equal(calls, 1);
        trigger();
        trigger();
        assert.equal(calls, 1);
        await wait(35);
        assert.equal(calls, 2);
    });

    it('delays and coalesces calls when a delay is configured', async () => {
        let calls = 0;
        const trigger = Executor.decouple(() => calls++, 30, 5);
        trigger();
        trigger();
        assert.equal(calls, 0);
        await wait(15);
        assert.equal(calls, 1);
    });

    it('logs exceptions raised by the action', () => {
        const error = new Error('action failed');
        const originalError = console.error;
        const messages = [];
        console.error = message => messages.push(message);
        try {
            Executor.decouple(() => { throw error; })();
        } finally {
            console.error = originalError;
        }
        assert.equal(messages.length, 1);
        assert.match(messages[0], /Cannot perform minimum timeout action/);
        assert.match(messages[0], /action failed/);
    });
});

describe('Executor.unstress', () => {
    it('runs only the latest task requested while another task is busy', () => {
        const order = [];
        let finishFirst;
        const unstress = Executor.unstress(() => assert.fail('unexpected error'));
        unstress(onSuccess => {
            order.push('first');
            finishFirst = onSuccess;
        });
        unstress(onSuccess => {
            order.push('superseded');
            onSuccess();
        });
        unstress(onSuccess => {
            order.push('latest');
            onSuccess();
        });
        assert.deepEqual(order, ['first']);
        finishFirst();
        assert.deepEqual(order, ['first', 'latest']);
    });

    it('reports task errors and runs the latest queued task afterward', () => {
        const error = new Error('unstress failed');
        const order = [];
        let failFirst;
        const reported = [];
        const unstress = Executor.unstress(err => reported.push(err));
        unstress((onSuccess, onError) => { failFirst = onError; });
        unstress(onSuccess => { order.push('latest'); onSuccess(); });
        failFirst(error);
        assert.deepEqual(reported, [error]);
        assert.deepEqual(order, ['latest']);
    });

    it('reports thrown exceptions', () => {
        const error = new Error('unstress exception');
        const reported = [];
        Executor.unstress(err => reported.push(err))(() => { throw error; });
        assert.deepEqual(reported, [error]);
    });

    it('times out a task and runs the latest queued task', async () => {
        const order = [];
        const timeout = new Promise(resolve => {
            const unstress = Executor.unstress(() => assert.fail('unexpected error'), resolve, 10);
            unstress(() => {});
            unstress(onSuccess => { order.push('latest'); onSuccess(); });
        });
        assert.match(await timeout, /^timeout: /);
        assert.deepEqual(order, ['latest']);
    });
});

describe('Executor exports', () => {
    it('exposes its four operations and is sealed against new operations', () => {
        assert.deepEqual(Object.keys(Executor), ['run', 'pipe', 'decouple', 'unstress']);
        assert.equal(Object.isSealed(Executor), true);
    });
});
