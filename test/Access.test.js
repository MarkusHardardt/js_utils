import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Access from '../src/Access.js';

function createLogger() {
    const logs = [];
    return {
        logs,
        setLevel(level) {},
        trace(message, error) { logs.push({ level: 'trace', message, error }); },
        debug(message, error) { logs.push({ level: 'debug', message, error }); },
        info(message, error) { logs.push({ level: 'info', message, error }); },
        warn(message, error) { logs.push({ level: 'warn', message, error }); },
        error(message, error) { logs.push({ level: 'error', message, error }); },
        fatal(message, error) { logs.push({ level: 'fatal', message, error }); }
    };
}

function createDataAccessObject() {
    const calls = {
        getType: [],
        registerObserver: [],
        unregisterObserver: [],
        read: [],
        write: [],
        getDataPoints: []
    };
    let readValue = 'read-value';
    let readError = null;
    let errorOnRead = false;
    const dataAccessObject = {
        calls,
        setReadValue(value) { readValue = value; },
        setReadError(error) { readError = error; },
        setErrorOnRead(value) { errorOnRead = value; },
        getType(dataId) {
            calls.getType.push(dataId);
            return `type:${dataId}`;
        },
        registerObserver(dataId, onRefresh) {
            calls.registerObserver.push({ dataId, onRefresh });
        },
        unregisterObserver(dataId, onRefresh) {
            calls.unregisterObserver.push({ dataId, onRefresh });
        },
        read(dataId, onResponse, onError) {
            calls.read.push({ dataId, onResponse, onError });
            if (errorOnRead) {
                onError(readError);
            } else {
                onResponse(readValue);
            }
        },
        write(dataId, value) {
            calls.write.push({ dataId, value });
        },
        getDataPoints() {
            calls.getDataPoints.push(true);
            return [{ id: 'temperature', type: 'number' }];
        }
    };
    return dataAccessObject;
}

describe('Access.Buffer', () => {
    it('validates its logger and source', () => {
        const logger = createLogger();
        const source = createDataAccessObject();
        assert.throws(() => new Access.Buffer(null, source), /Logger is null/);
        assert.throws(() => new Access.Buffer(logger, {}), /DataAccessObject method/);
        assert.doesNotThrow(() => new Access.Buffer(logger, source));
    });

    it('forwards type lookups and validates observer arguments', () => {
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(createLogger(), source);
        const observer = () => {};

        assert.equal(buffer.getType('temperature'), 'type:temperature');
        assert.deepEqual(source.calls.getType, ['temperature']);
        assert.throws(() => buffer.registerObserver(1, observer), /Invalid data id/);
        assert.throws(() => buffer.registerObserver('temperature', null), /onRefresh\(value\) is not a function/);
        assert.throws(() => buffer.unregisterObserver(1, observer), /Invalid data id/);
        assert.throws(() => buffer.unregisterObserver('temperature', null), /onRefresh\(value\) is not a function/);
    });

    it('shares a source subscription between observers and removes it after the last observer', () => {
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(createLogger(), source);
        const first = () => {};
        const second = () => {};
        buffer.registerObserver('temperature', first);
        buffer.registerObserver('temperature', second);

        assert.equal(source.calls.registerObserver.length, 1);
        assert.equal(typeof source.calls.registerObserver[0].onRefresh, 'function');

        buffer.unregisterObserver('temperature', first);
        assert.equal(source.calls.unregisterObserver.length, 0);
        buffer.unregisterObserver('temperature', second);
        assert.equal(source.calls.unregisterObserver.length, 1);
        assert.equal(source.calls.unregisterObserver[0].onRefresh, source.calls.registerObserver[0].onRefresh);
    });

    it('logs attempts to unregister an unknown data id', () => {
        const logger = createLogger();
        const buffer = new Access.Buffer(logger, createDataAccessObject());

        buffer.unregisterObserver('missing', () => {});

        assert.ok(logger.logs.some(log => log.level === 'error' && log.message.includes("Data id 'missing' is not registered")));
    });

    it('applies ID filters when registering and unregistering source observers', () => {
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(createLogger(), source);
        const observer = () => {};
        buffer.registerObserver('first', observer);
        buffer.registerObserver('second', observer);

        buffer.unregisterObserversOnSource(id => id === 'first');
        assert.deepEqual(source.calls.unregisterObserver.map(call => call.dataId), ['first']);

        buffer.unregisterObserversOnSource();
        buffer.registerObserversOnSource(id => id === 'second');
        assert.deepEqual(source.calls.registerObserver.map(call => call.dataId), ['first', 'second', 'second']);
    });

    it('registers and unregisters every active source observer when no filter is provided', () => {
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(createLogger(), source);
        buffer.registerObserver('one', () => {});
        buffer.registerObserver('two', () => {});

        buffer.unregisterObserversOnSource();
        buffer.registerObserversOnSource();

        assert.deepEqual(source.calls.unregisterObserver.map(call => call.dataId), ['one', 'two']);
        assert.deepEqual(source.calls.registerObserver.map(call => call.dataId), ['one', 'two', 'one', 'two']);
    });

    it('forwards reads and updates the cached value for current observers', () => {
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(createLogger(), source);
        const values = [];
        buffer.registerObserver('temperature', value => values.push(value));

        buffer.read('temperature', value => values.push(`read:${value}`), assert.fail);

        assert.deepEqual(values, ['read:read-value', 'read-value']);
        assert.equal(source.calls.read[0].dataId, 'temperature');
    });

    it('forwards read errors and logs errors thrown by read callbacks', () => {
        const logger = createLogger();
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(logger, source);
        const readError = new Error('read failed');
        source.setReadError(readError);
        source.setErrorOnRead(true);
        let forwardedError;
        buffer.read('temperature', assert.fail, error => forwardedError = error);
        assert.equal(forwardedError, readError);

        source.setErrorOnRead(false);
        const callbackError = new Error('response callback failed');
        buffer.read('temperature', () => { throw callbackError; }, assert.fail);

        assert.ok(logger.logs.some(log => log.level === 'error' && log.error === callbackError));
    });

    it('forwards writes and logs source write errors', () => {
        const logger = createLogger();
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(logger, source);
        buffer.write('temperature', 27);
        assert.deepEqual(source.calls.write, [{ dataId: 'temperature', value: 27 }]);

        const writeError = new Error('write failed');
        source.write = () => { throw writeError; };
        assert.doesNotThrow(() => buffer.write('temperature', 28));
        assert.ok(logger.logs.some(log => log.level === 'warn' && log.error === writeError));
    });

    it('rounds positive delay values up and disables non-positive delays', context => {
        context.mock.timers.enable({ apis: ['setTimeout'] });
        const source = createDataAccessObject();
        const buffer = new Access.Buffer(createLogger(), source, 2.1, 3.1);
        const first = () => {};
        buffer.registerObserver('temperature', first);
        buffer.unregisterObserver('temperature', first);
        context.mock.timers.tick(2);
        assert.equal(source.calls.unregisterObserver.length, 0);
        context.mock.timers.tick(1);
        assert.equal(source.calls.unregisterObserver.length, 1);

        const immediateBuffer = new Access.Buffer(createLogger(), source, 0, -1);
        const second = () => {};
        immediateBuffer.registerObserver('pressure', second);
        immediateBuffer.unregisterObserver('pressure', second);
        assert.equal(source.calls.unregisterObserver.length, 2);
    });
});

describe('Access.Switch', () => {
    it('requires a DAO resolver function', () => {
        assert.throws(() => new Access.Switch(null), /getDataAccessObject\(dataId\) is not a function/);
    });

    it('resolves a DAO for each operation and forwards arguments and results', () => {
        const first = createDataAccessObject();
        const second = createDataAccessObject();
        const resolverCalls = [];
        const accessSwitch = new Access.Switch(dataId => {
            resolverCalls.push(dataId);
            return dataId.startsWith('a:') ? first : second;
        });
        const observer = () => {};
        let readValue;
        accessSwitch.getType('a:temperature');
        accessSwitch.registerObserver('b:pressure', observer);
        accessSwitch.unregisterObserver('a:temperature', observer);
        accessSwitch.read('b:pressure', value => readValue = value, assert.fail);
        accessSwitch.write('a:temperature', 23);

        assert.deepEqual(resolverCalls, ['a:temperature', 'b:pressure', 'a:temperature', 'b:pressure', 'a:temperature']);
        assert.deepEqual(first.calls.getType, ['a:temperature']);
        assert.deepEqual(second.calls.registerObserver, [{ dataId: 'b:pressure', onRefresh: observer }]);
        assert.deepEqual(first.calls.unregisterObserver, [{ dataId: 'a:temperature', onRefresh: observer }]);
        assert.equal(readValue, 'read-value');
        assert.deepEqual(first.calls.write, [{ dataId: 'a:temperature', value: 23 }]);
    });

    it('rejects a resolved object that does not implement the requested operation', () => {
        const accessSwitch = new Access.Switch(() => ({}));
        assert.throws(() => accessSwitch.getType('x'), /DataAccessObject has no property 'getType'/);
    });

    it('passes through errors thrown by the resolved DAO', () => {
        const source = createDataAccessObject();
        const sourceError = new Error('DAO failed');
        source.write = () => { throw sourceError; };
        const accessSwitch = new Access.Switch(() => source);
        assert.throws(() => accessSwitch.write('x', 1), error => error === sourceError);
    });
});

describe('Access.Router', () => {
    it('validates the logger and observer lifecycle callback setters', () => {
        assert.throws(() => new Access.Router(null), /Logger is null/);
        const router = new Access.Router(createLogger());
        assert.throws(() => { router.onRegisterObserversOnSource = null; }, /Set value is not a function/);
        assert.throws(() => { router.onUnregisterObserversOnSource = null; }, /Set value is not a function/);
    });

    it('routes data operations to the selected target and strips the target prefix', () => {
        const router = new Access.Router(createLogger());
        const source = createDataAccessObject();
        router.registerDataAccessObject('plc_1', source);
        const dataAccess = router.getDataAccessObject;
        const observer = () => {};
        let readValue;

        assert.equal(dataAccess('plc_1:temperature').getType('plc_1:temperature'), 'type:temperature');
        dataAccess('plc_1:temperature').registerObserver('plc_1:temperature', observer);
        dataAccess('plc_1:temperature').unregisterObserver('plc_1:temperature', observer);
        dataAccess('plc_1:temperature').read('plc_1:temperature', value => readValue = value, assert.fail);
        dataAccess('plc_1:temperature').write('plc_1:temperature', 31);

        assert.deepEqual(source.calls.getType, ['temperature']);
        assert.deepEqual(source.calls.registerObserver, [{ dataId: 'temperature', onRefresh: observer }]);
        assert.deepEqual(source.calls.unregisterObserver, [{ dataId: 'temperature', onRefresh: observer }]);
        assert.equal(source.calls.read[0].dataId, 'temperature');
        assert.equal(readValue, 'read-value');
        assert.deepEqual(source.calls.write, [{ dataId: 'temperature', value: 31 }]);
    });

    it('rejects malformed IDs and IDs whose target is not registered', () => {
        const router = new Access.Router(createLogger());
        assert.throws(() => router.getDataAccessObject('invalid'), /Invalid id/);
        assert.throws(() => router.getDataAccessObject('missing:item'), /No data access object registered/);
    });

    it('validates target IDs, access objects, duplicates, and unregister ownership', () => {
        const router = new Access.Router(createLogger());
        const source = createDataAccessObject();
        assert.throws(() => router.registerDataAccessObject(1, source), /Invalid target id/);
        assert.throws(() => router.registerDataAccessObject('bad-id', source), /Invalid target id format/);
        assert.throws(() => router.registerDataAccessObject('valid', {}), /DataAccessObject method/);
        router.registerDataAccessObject('valid', source);
        assert.throws(() => router.registerDataAccessObject('valid', source), /already registered/);
        assert.throws(() => router.unregisterDataAccessObject('valid', createDataAccessObject()), /registered for another data access object/);
        assert.throws(() => router.unregisterDataAccessObject('missing', source), /is not registered/);
    });

    it('updates new connectors with current data points and tracks connector removal', () => {
        const logger = createLogger();
        const router = new Access.Router(logger);
        const source = createDataAccessObject();
        router.registerDataAccessObject('target', source);
        const updates = [];
        const connector = { setDataPoints(dataPoints) { updates.push(dataPoints); } };
        router.registerDataConnector(connector);

        assert.deepEqual(updates, [[{ id: 'target:temperature', type: 'number' }]]);
        router.unregisterDataConnector(connector);
        router.unregisterDataConnector(connector);
        assert.ok(logger.logs.some(log => log.level === 'warn' && log.message.includes('not registered')));
    });

    it('does not register the same connector more than once', () => {
        const logger = createLogger();
        const router = new Access.Router(logger);
        const updates = [];
        const connector = { setDataPoints(dataPoints) { updates.push(dataPoints); } };

        router.registerDataConnector(connector);
        router.registerDataConnector(connector);

        assert.deepEqual(updates, [[]]);
        assert.ok(logger.logs.some(log => log.level === 'warn' && log.message.includes('already registered')));
    });

    it('refreshes registered connectors and removes a target from later data point lists', () => {
        const router = new Access.Router(createLogger());
        const updates = [];
        router.registerDataConnector({ setDataPoints(dataPoints) { updates.push(dataPoints); } });
        const source = createDataAccessObject();

        router.registerDataAccessObject('target', source);
        router.unregisterDataAccessObject('target', source);

        assert.deepEqual(updates, [
            [],
            [{ id: 'target:temperature', type: 'number' }],
            []
        ]);
    });

    it('notifies source observer lifecycle handlers with target-specific filters', () => {
        const router = new Access.Router(createLogger());
        const registeredFilters = [];
        const unregisteredFilters = [];
        router.onRegisterObserversOnSource = filter => registeredFilters.push(filter);
        router.onUnregisterObserversOnSource = filter => unregisteredFilters.push(filter);
        const source = createDataAccessObject();
        router.registerDataAccessObject('one', source);
        router.unregisterDataAccessObject('one', source);

        assert.equal(registeredFilters.length, 1);
        assert.equal(registeredFilters[0]('one:item'), true);
        assert.equal(registeredFilters[0]('one_more:item'), false);
        assert.equal(unregisteredFilters.length, 1);
        assert.equal(unregisteredFilters[0]('one:item'), true);
        assert.equal(unregisteredFilters[0]('other:item'), false);
    });

    it('logs connector update errors without aborting registration or unregistration', () => {
        const logger = createLogger();
        const router = new Access.Router(logger);
        const updateError = new Error('connector unavailable');
        let failUpdates = false;
        router.registerDataConnector({
            setDataPoints() {
                if (failUpdates) {
                    throw updateError;
                }
            }
        });
        const source = createDataAccessObject();

        failUpdates = true;
        assert.doesNotThrow(() => router.registerDataAccessObject('target', source));
        assert.doesNotThrow(() => router.unregisterDataAccessObject('target', source));

        assert.equal(logger.logs.filter(log => log.level === 'error' && log.error === updateError).length, 2);
    });

    it('warns when unregistering a data connector that is not registered', () => {
        const logger = createLogger();
        const router = new Access.Router(logger);

        router.unregisterDataConnector({ setDataPoints(dataPoints) {} });

        assert.ok(logger.logs.some(log => log.level === 'warn' && log.message.includes('not registered')));
    });
});
