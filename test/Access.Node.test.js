import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Access from '../src/Access.js';

const observerDelay = 100;

function createNode({ unregisterDelay = 0, reregisterDelay = 0, unregisterError = null } = {}) {
    const logs = [];
    let registerError = null;
    const source = {
        registerCalls: [],
        unregisterCalls: [],
        onRefresh: null,
        registerObserver(onRefresh) {
            this.registerCalls.push(onRefresh);
            if (registerError) {
                throw registerError;
            }
            this.onRefresh = onRefresh;
        },
        unregisterObserver(onRefresh) {
            this.unregisterCalls.push(onRefresh);
            if (unregisterError) {
                throw unregisterError;
            }
            if (this.onRefresh === onRefresh) {
                this.onRefresh = null;
            }
        }
    };
    const logger = {
        trace(message, error) { logs.push({ level: 'trace', message, error }); },
        warn(message, error) { logs.push({ level: 'warn', message, error }); },
        error(message, error) { logs.push({ level: 'error', message, error }); }
    };
    const lastObserverUnregistered = [];
    const node = new Access.Node(
        logger,
        source,
        unregisterDelay,
        reregisterDelay,
        () => lastObserverUnregistered.push(true)
    );
    return { node, source, logs, lastObserverUnregistered, setRegisterError: error => registerError = error };
}

describe('Access.Node', () => {
    it('starts with a null value and validates observer callbacks', () => {
        const { node } = createNode();
        assert.equal(node.value, null);
        assert.throws(() => node.registerObserver(null), /onRefresh\(value\) is not a function/);
        assert.throws(() => node.unregisterObserver(null), /onRefresh\(value\) is not a function/);
    });

    it('registers the first observer on the source and refreshes newly added observers', () => {
        const { node, source } = createNode();
        const firstValues = [];
        const secondValues = [];
        const firstObserver = value => firstValues.push(value);
        const secondObserver = value => secondValues.push(value);

        node.registerObserver(firstObserver);
        assert.equal(source.registerCalls.length, 1);
        assert.equal(firstValues.length, 0);

        source.onRefresh('latest');
        node.registerObserver(secondObserver);
        assert.deepEqual(firstValues, ['latest']);
        assert.deepEqual(secondValues, ['latest']);
        assert.equal(source.registerCalls.length, 1);
    });

    it('does not register a duplicate observer and refreshes it with the current value', () => {
        const { node, source, logs } = createNode();
        const values = [];
        const observer = value => values.push(value);
        node.registerObserver(observer);
        source.onRefresh(42);

        node.registerObserver(observer);

        assert.equal(source.registerCalls.length, 1);
        assert.deepEqual(values, [42, 42]);
        assert.ok(logs.some(log => log.level === 'warn' && log.message.includes('already been registered')));
    });

    it('does not refresh observers with null or undefined values', () => {
        const { node } = createNode();
        const values = [];
        node.value = undefined;
        node.registerObserver(value => values.push(value));
        node.value = null;
        assert.deepEqual(values, []);
    });

    it('refreshes all observers when the value changes and logs observer errors', () => {
        const { node, logs } = createNode();
        const callbackError = new Error('observer failed');
        const received = [];
        node.registerObserver(() => { throw callbackError; });
        node.registerObserver(value => received.push(value));

        node.value = 'updated';

        assert.deepEqual(received, ['updated']);
        assert.ok(logs.some(log => log.level === 'error' && log.error === callbackError));
    });

    it('warns when an unregistered observer is registered or unregistered twice', () => {
        const { node, logs } = createNode();
        const observer = () => {};
        node.unregisterObserver(observer);
        node.registerObserver(observer);
        node.registerObserver(observer);

        assert.equal(logs.filter(log => log.level === 'warn').length, 2);
    });

    it('warns on source registration failure and can retry registration', () => {
        const fixture = createNode();
        fixture.setRegisterError(new Error('source unavailable'));
        const first = () => {};
        const second = () => {};

        fixture.node.registerObserver(first);
        fixture.setRegisterError(null);
        fixture.node.registerObserver(second);

        assert.equal(fixture.source.registerCalls.length, 2);
        assert.equal(fixture.logs.filter(log => log.level === 'warn').length, 1);
        assert.equal(typeof fixture.source.onRefresh, 'function');
    });

    it('unregisters the source only after the last observer is removed', () => {
        const { node, source, lastObserverUnregistered } = createNode();
        const first = () => {};
        const second = () => {};
        node.registerObserver(first);
        node.registerObserver(second);

        node.unregisterObserver(first);
        assert.equal(source.unregisterCalls.length, 0);
        assert.deepEqual(lastObserverUnregistered, []);

        node.unregisterObserver(second);
        assert.equal(source.unregisterCalls.length, 1);
        assert.deepEqual(lastObserverUnregistered, [true]);
    });

    it('logs source unregistration failures but still completes cleanup', () => {
        const unregisterError = new Error('source unavailable');
        const { node, logs, lastObserverUnregistered } = createNode({ unregisterError });
        const observer = () => {};
        node.registerObserver(observer);

        node.unregisterObserver(observer);

        assert.equal(logs.filter(log => log.level === 'warn').length, 1);
        assert.deepEqual(lastObserverUnregistered, [true]);
    });

    it('delays unregistration and cancels it if an observer returns in time', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source } = createNode({ unregisterDelay: observerDelay });
        const first = () => {};
        const second = () => {};
        node.registerObserver(first);
        node.unregisterObserver(first);

        context.mock.timers.tick(observerDelay - 1);
        assert.equal(source.unregisterCalls.length, 0);

        node.registerObserver(second);
        context.mock.timers.tick(observerDelay);
        assert.equal(source.unregisterCalls.length, 0);
    });

    it('unregisters after the configured delay and then completes cleanup', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source, lastObserverUnregistered } = createNode({ unregisterDelay: observerDelay });
        const observer = () => {};
        node.registerObserver(observer);
        node.unregisterObserver(observer);

        context.mock.timers.tick(observerDelay - 1);
        assert.equal(source.unregisterCalls.length, 0);
        context.mock.timers.tick(1);
        assert.equal(source.unregisterCalls.length, 1);
        assert.deepEqual(lastObserverUnregistered, [true]);
    });

    it('delays re-registration after an actual source unregistration', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source } = createNode({ reregisterDelay: observerDelay });
        const first = () => {};
        const second = () => {};
        node.registerObserver(first);
        node.unregisterObserver(first);
        node.registerObserver(second);

        context.mock.timers.tick(observerDelay - 1);
        assert.equal(source.registerCalls.length, 1);
        context.mock.timers.tick(1);
        assert.equal(source.registerCalls.length, 2);
    });

    it('logs a failed delayed source registration and permits a later retry', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const fixture = createNode({ reregisterDelay: observerDelay });
        const first = () => {};
        const second = () => {};
        fixture.node.registerObserver(first);
        fixture.node.unregisterObserverOnSource();
        fixture.setRegisterError(new Error('source unavailable'));
        fixture.node.registerObserver(second);
        context.mock.timers.tick(observerDelay);
        assert.ok(fixture.logs.some(log => log.level === 'warn' && log.message.includes('after delay')));

        fixture.setRegisterError(null);
        fixture.node.registerObserver(() => {});
        context.mock.timers.tick(observerDelay);

        assert.equal(fixture.source.registerCalls.length, 3);
        assert.equal(typeof fixture.source.onRefresh, 'function');
    });

    it('cancels delayed re-registration when its observer is removed before the timer expires', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source, lastObserverUnregistered } = createNode({ reregisterDelay: observerDelay });
        const first = () => {};
        const second = () => {};
        node.registerObserver(first);
        node.unregisterObserver(first);
        node.registerObserver(second);
        context.mock.timers.tick(observerDelay / 2);
        node.unregisterObserver(second);
        context.mock.timers.tick(observerDelay);

        assert.equal(source.registerCalls.length, 1);
        assert.deepEqual(lastObserverUnregistered, [true]);
    });

    it('delays cleanup after unregistration when a re-registration delay is configured', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source, lastObserverUnregistered } = createNode({ reregisterDelay: observerDelay });
        const observer = () => {};
        node.registerObserver(observer);
        node.unregisterObserver(observer);

        context.mock.timers.tick(observerDelay - 1);
        assert.deepEqual(lastObserverUnregistered, []);
        context.mock.timers.tick(1);
        assert.equal(source.unregisterCalls.length, 1);
        assert.deepEqual(lastObserverUnregistered, [true]);
    });

    it('registers immediately on source when requested and cancels a pending re-registration delay', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source } = createNode({ reregisterDelay: observerDelay });
        const first = () => {};
        const second = () => {};
        node.registerObserver(first);
        node.unregisterObserver(first);
        node.registerObserver(second);

        node.registerObserverOnSource();
        context.mock.timers.tick(observerDelay);

        assert.equal(source.registerCalls.length, 2);
    });

    it('registers an observer immediately when no re-registration delay is configured', () => {
        const { node, source } = createNode();
        const first = () => {};
        const second = () => {};
        node.registerObserver(first);
        node.unregisterObserverOnSource();
        node.registerObserver(second);

        assert.equal(source.registerCalls.length, 2);
    });

    it('unregisters the source immediately when requested', () => {
        const { node, source } = createNode();
        node.registerObserver(() => {});

        node.unregisterObserverOnSource();

        assert.equal(source.unregisterCalls.length, 1);
    });

    it('interrupts a pending unregistration timer when the source is explicitly stopped', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source } = createNode({ unregisterDelay: observerDelay });
        const observer = () => {};
        node.registerObserver(observer);
        node.unregisterObserver(observer);

        node.unregisterObserverOnSource();
        context.mock.timers.tick(observerDelay);

        assert.equal(source.unregisterCalls.length, 1);
    });

    it('stops the source while observers remain, then delays their next registration', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source } = createNode({ reregisterDelay: observerDelay });
        const observer = () => {};
        node.registerObserver(observer);

        node.unregisterObserverOnSource();
        node.registerObserver(() => {});
        context.mock.timers.tick(observerDelay);

        assert.equal(source.unregisterCalls.length, 1);
        assert.equal(source.registerCalls.length, 2);
    });

    it('cancels a pending re-registration when the source is explicitly stopped', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const { node, source } = createNode({ reregisterDelay: observerDelay });
        const first = () => {};
        node.registerObserver(first);
        node.unregisterObserverOnSource();
        node.registerObserver(() => {});

        node.unregisterObserverOnSource();
        context.mock.timers.tick(observerDelay);

        assert.equal(source.registerCalls.length, 1);
    });

    it('logs source registration and unregistration failures from explicit source controls', () => {
        const registrationError = new Error('source unavailable');
        const unregistrationError = new Error('source unavailable');
        const fixture = createNode();
        const observer = () => {};
        fixture.node.registerObserver(observer);
        fixture.source.unregisterObserver = () => { throw unregistrationError; };
        fixture.node.unregisterObserverOnSource();
        fixture.source.registerObserver = () => { throw registrationError; };
        fixture.node.registerObserverOnSource();

        assert.ok(fixture.logs.some(log => log.level === 'warn' && log.error === unregistrationError));
        assert.ok(fixture.logs.some(log => log.level === 'warn' && log.error === registrationError));
    });
});
