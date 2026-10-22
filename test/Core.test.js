import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Core from '../src/Core.js';

const wait = millis => new Promise(resolve => setTimeout(resolve, millis));

describe('Core.DataType', () => {
    it('exposes the standard datatype identifiers as a frozen object', () => {
        assert.deepEqual(Core.DataType, {
            Null: 0,
            Boolean: 1,
            Int8: 2,
            UInt8: 3,
            Int16: 4,
            UInt16: 5,
            Int32: 6,
            UInt32: 7,
            Int64: 8,
            UInt64: 9,
            Float: 10,
            Double: 11,
            String: 12,
            Object: 23,
            HTML: 72,
            Unknown: -1
        });
        assert.equal(Object.isFrozen(Core.DataType), true);
        assert.equal(Object.isFrozen(Core), true);
    });
});

describe('Core.createIdGenerator', () => {
    it('returns sequential base-36 IDs with the requested prefix and suffix', () => {
        const nextId = Core.createIdGenerator('id-', '-end');
        assert.deepEqual(
            Array.from({ length: 38 }, () => nextId()),
            [...Array.from({ length: 10 }, (_, index) => `id-${index}-end`),
                ...Array.from({ length: 26 }, (_, index) => `id-${(index + 10).toString(36)}-end`),
                'id-10-end', 'id-11-end']
        );
    });

    it('uses undefined text for omitted prefix and suffix', () => {
        assert.equal(Core.createIdGenerator()(), 'undefined0undefined');
    });
});

describe('Core.defaultEqual', () => {
    it('uses strict equality', () => {
        assert.equal(Core.defaultEqual(1, 1), true);
        assert.equal(Core.defaultEqual(1, '1'), false);
        assert.equal(Core.defaultEqual({}, {}), false);
        const value = {};
        assert.equal(Core.defaultEqual(value, value), true);
    });
});

describe('Core.getTransformedObject', () => {
    it('uses each source value as a key and its attribute as a value by default', () => {
        assert.deepEqual(Core.getTransformedObject({ first: 'one', second: 'two' }), {
            one: 'first',
            two: 'second'
        });
    });

    it('uses optional key and value callbacks with attribute and value arguments', () => {
        const keys = [];
        const values = [];
        const result = Core.getTransformedObject(
            { first: 2, second: 3 },
            (attribute, value) => {
                keys.push([attribute, value]);
                return value * 2;
            },
            (attribute, value) => {
                values.push([attribute, value]);
                return attribute.toUpperCase();
            }
        );
        assert.deepEqual(result, { 4: 'FIRST', 6: 'SECOND' });
        assert.deepEqual(keys, [['first', 2], ['second', 3]]);
        assert.deepEqual(values, [['first', 2], ['second', 3]]);
    });

    it('ignores inherited source properties and rejects duplicate transformed keys', () => {
        const source = Object.assign(Object.create({ inherited: 'ignored' }), { first: 'same', second: 'same' });
        assert.throws(() => Core.getTransformedObject(source), /Key 'same' of attribute 'second' already exists/);
        assert.deepEqual(Core.getTransformedObject(Object.assign(Object.create({ inherited: 'ignored' }), { own: 'value' })), {
            value: 'own'
        });
    });
});

describe('Core.getTopologicalSorting', () => {
    it('sorts dependencies before their dependants', () => {
        assert.deepEqual(Core.getTopologicalSorting({
            first: [],
            second: ['first'],
            third: ['first'],
            last: ['second', 'third']
        }), ['first', 'second', 'third', 'last']);
    });

    it('returns an empty list when there are no nodes', () => {
        assert.deepEqual(Core.getTopologicalSorting({}), []);
    });

    it('rejects cyclical dependencies', () => {
        assert.throws(() => Core.getTopologicalSorting({
            first: ['second'],
            second: ['first']
        }), /Cyclical dependency detected!/);
    });
});

describe('Core.handleNotFound', () => {
    it('calls back for missing sources in forward order using strict equality by default', () => {
        const missing = [];
        Core.handleNotFound([1, '1', 2], [1], undefined, value => missing.push(value));
        assert.deepEqual(missing, ['1', 2]);
    });

    it('supports a custom equality callback and reverse callback order', () => {
        const missing = [];
        const comparisons = [];
        Core.handleNotFound(
            [{ id: 1 }, { id: 2 }, { id: 3 }],
            [{ id: 2 }],
            (source, target) => {
                comparisons.push([source.id, target.id]);
                return source.id === target.id;
            },
            value => missing.push(value.id),
            true
        );
        assert.deepEqual(missing, [3, 1]);
        assert.deepEqual(comparisons.slice(0, 2), [[3, 2], [2, 2]]);
    });

    it('logs callback exceptions and continues processing later sources', () => {
        const originalError = console.error;
        const errors = [];
        const missing = [];
        console.error = message => errors.push(message);
        try {
            Core.handleNotFound([1, 2], [], undefined, value => {
                if (value === 1) {
                    throw new Error('callback failed');
                }
                missing.push(value);
            });
        } finally {
            console.error = originalError;
        }
        assert.deepEqual(errors, ['Failed calling onNotFound(source): Error: callback failed']);
        assert.deepEqual(missing, [2]);
    });
});

describe('Core.validateFunction', () => {
    it('accepts functions and optionally checks their argument names', () => {
        assert.equal(Core.validateFunction(function (first, second) {}, 'first, second', true), undefined);
        assert.equal(Core.validateFunction((first, second) => first + second, 'first, second', true), undefined);
        assert.equal(Core.validateFunction(first => first, 'first', true), undefined);
        assert.equal(Core.validateFunction(function () {}, '', true), undefined);
        assert.equal(Core.validateFunction(() => {}, '', false), undefined);
        assert.equal(Core.validateFunction(() => {}, '', undefined), undefined);
    });

    it('recognizes class-style methods and rejects incorrect argument counts or names', () => {
        const instance = {
            method(first, second) {}
        };
        assert.equal(Core.validateFunction(instance.method, 'first, second', true), undefined);
        assert.throws(
            () => Core.validateFunction((first) => first, 'first, second', true),
            /invalid number of arguments \(expected: 2, actual: 1\)/
        );
        assert.throws(
            () => Core.validateFunction((actual) => actual, 'expected', true),
            /invalid argument \(1\) name \(expected: 'expected', actual: 'actual'\)/
        );
    });

    it('rejects undefined, null, non-functions and unsupported function syntax', () => {
        assert.throws(() => Core.validateFunction(undefined), /is undefined!/);
        assert.throws(() => Core.validateFunction(null), /is null/);
        assert.throws(() => Core.validateFunction('not a function'), /is not a function/);
        assert.throws(() => Core.validateFunction((...args) => args, '', true), /has no arguments:/);
    });
});

describe('Core.validateAs', () => {
    it('validates properties and methods and returns the validated instance', () => {
        const instance = {
            name: 'device',
            enabled: true,
            update(value) { return value; }
        };
        assert.equal(Core.validateAs('Device', instance, ['name: string', 'enabled: boolean', 'update(value)'], true), instance);
        assert.equal(Core.validateAs('Device', instance, 'update(value)', false), instance);
        assert.equal(Core.validateAs('Device', instance, {}), instance);
    });

    it('reports missing properties, invalid types, invalid method signatures and malformed patterns', () => {
        const instance = { count: 1, update(actual) {} };
        assert.throws(() => Core.validateAs('Device', instance, 'missing: string'), /Device has no property 'missing'/);
        assert.throws(
            () => Core.validateAs('Device', instance, 'count: string'),
            /Device property 'count' has invalid type \(expected: 'string', actual: 'number'\)/
        );
        assert.throws(
            () => Core.validateAs('Device', instance, 'update(expected)', true),
            /Device method 'update' invalid argument \(1\) name/
        );
        assert.throws(() => Core.validateAs('Device', instance, 'not a pattern'), /Invalid method\/property check pattern/);
    });

    it('rejects absent, null and primitive instances and reports missing methods', () => {
        assert.throws(() => Core.validateAs('Device', undefined, 'name: string'), /Device is undefined!/);
        assert.throws(() => Core.validateAs('Device', null, 'name: string'), /Device is null/);
        assert.throws(() => Core.validateAs('Device', 1, 'name: string'), /Device is not an object/);
        assert.throws(() => Core.validateAs('Device', {}, 'update()'), /Device method 'update' is undefined!/);
    });
});

describe('Core.validateMethod', () => {
    it('returns the object when the requested method exists', () => {
        const instance = { update() {} };
        assert.equal(Core.validateMethod('Device', instance, 'update'), instance);
    });

    it('rejects absent, null, primitive instances and non-function members', () => {
        assert.throws(() => Core.validateMethod('Device', undefined, 'update'), /Device is undefined!/);
        assert.throws(() => Core.validateMethod('Device', null, 'update'), /Device is null/);
        assert.throws(() => Core.validateMethod('Device', 'not an object', 'update'), /Device is not an object/);
        assert.throws(() => Core.validateMethod('Device', { update: true }, 'update'), /Device method 'update' is not a function/);
    });
});

describe('Core.OnOffDelay', () => {
    it('behaves as required', () => {
        const changes = [];
        // const sut = new Core.OnOffDelay(0, 0, 0, () => changes.push('on'), () => changes.push('off'), () => changes.push('final'));
        const sut = new Core.OnOffDelay();
        sut.onDelay = 0;
        sut.offDelay = 0;
        sut.finalizeDelay = 0;
        sut.switchedOn = () => changes.push('on');
        sut.switchedOff = () => changes.push('off');
        sut.finalized = () => changes.push('final');
        assert.equal(sut.isOn, false);
        sut.switchOff();
        sut.switchOn();
        assert.equal(sut.isOn, true);
        sut.switchOn();
        sut.switchOff();
        assert.equal(sut.isOn, false);
        sut.switchOn();
        sut.switchOff();

        assert.equal(sut.isOn, false);
        assert.deepEqual(changes, ['on', 'off', 'final']);
    });

    it('changes immediately when all delays are disabled', () => {
        const changes = [];
        const onOffDelay = new Core.OnOffDelay(0, 0, 0, () => changes.push('on'), () => changes.push('off'), () => changes.push('final'));

        assert.equal(onOffDelay.isOn, false);
        onOffDelay.switchOff();
        onOffDelay.switchOn();
        assert.equal(onOffDelay.isOn, true);
        onOffDelay.switchOn();
        onOffDelay.switchOff();
        assert.equal(onOffDelay.isOn, false);
        onOffDelay.switchOn();
        onOffDelay.switchOff();

        assert.equal(onOffDelay.isOn, false);
        assert.deepEqual(changes, ['on', 'off', 'final']);
    });

    it('cancels a delayed off transition when switched on again', async () => {
        const changes = [];
        const onOffDelay = new Core.OnOffDelay(0, 30, 200, () => changes.push('on'), () => changes.push('off'), () => changes.push('final'));

        onOffDelay.switchOn();
        onOffDelay.switchOff();
        assert.equal(onOffDelay.isOn, true);
        onOffDelay.switchOn();
        await wait(45);

        assert.equal(onOffDelay.isOn, true);
        assert.deepEqual(changes, ['on']);

        onOffDelay.switchOff();
        await wait(60);
        assert.equal(onOffDelay.isOn, false);
        assert.deepEqual(changes, ['on', 'off']);
        await wait(100);
        assert.deepEqual(changes, ['on', 'off']);
        await wait(80);
        assert.deepEqual(changes, ['on', 'off', 'final']);
    });

    it('cancels a delayed on transition when switched off and starts the final delay', async () => {
        const changes = [];
        const onOffDelay = new Core.OnOffDelay(30, 0, 100, () => changes.push('on'), () => changes.push('off'), () => changes.push('final'));

        onOffDelay.switchOn();
        onOffDelay.switchOff();
        assert.deepEqual(changes, ['on', 'off']);

        onOffDelay.switchOn();
        assert.equal(onOffDelay.isOn, false);
        onOffDelay.switchOff();
        await wait(50);
        assert.equal(onOffDelay.isOn, false);
        assert.deepEqual(changes, ['on', 'off']);

        await wait(70);
        assert.deepEqual(changes, ['on', 'off', 'final']);
    });

    it('cancels the final delay when switched on and cannot leave the final state', async () => {
        const changes = [];
        const onOffDelay = new Core.OnOffDelay(0, 0, 40, () => changes.push('on'), () => changes.push('off'), () => changes.push('final'));

        onOffDelay.switchOn();
        onOffDelay.switchOff();
        onOffDelay.switchOn();
        await wait(55);
        assert.equal(onOffDelay.isOn, true);
        assert.deepEqual(changes, ['on', 'off', 'on']);

        onOffDelay.switchOff();
        assert.deepEqual(changes, ['on', 'off', 'on', 'off']);
        await wait(80);
        assert.deepEqual(changes, ['on', 'off', 'on', 'off', 'final']);

        onOffDelay.switchOn();
        onOffDelay.switchOff();
        assert.equal(onOffDelay.isOn, false);
        assert.deepEqual(changes, ['on', 'off', 'on', 'off', 'final']);
    });

    it('cancels pending delays when disposed', async () => {
        const changes = [];
        const onOffDelay = new Core.OnOffDelay(0, 30, 30, () => changes.push('on'), () => changes.push('off'), () => changes.push('final'));

        onOffDelay.switchOn();
        onOffDelay.switchOff();
        onOffDelay.dispose();
        await wait(45);

        onOffDelay.switchOn();
        assert.equal(onOffDelay.isOn, false);
        assert.deepEqual(changes, ['on']);
    });

    it('does not start the final delay if the switched-off callback switches it on', () => {
        const changes = [];
        let onOffDelay;
        onOffDelay = new Core.OnOffDelay(
            0,
            0,
            0,
            () => changes.push('on'),
            () => {
                changes.push('off');
                onOffDelay.switchOn();
            },
            () => changes.push('final')
        );

        onOffDelay.switchOn();
        onOffDelay.switchOff();

        assert.equal(onOffDelay.isOn, true);
        assert.deepEqual(changes, ['on', 'off', 'on']);
    });
});
