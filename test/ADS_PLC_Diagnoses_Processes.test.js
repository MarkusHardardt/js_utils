import assert from 'node:assert/strict';
import test from 'node:test';
import ADS from '../src/ADS.js';
import ADS_PLC_Diagnoses from '../src/ADS_PLC_Diagnoses.js';
import ADS_PLC_Processes from '../src/ADS_PLC_Processes.js';

function createInfo(fullName, type, children = [], symbol = {}) {
    return {
        fullName,
        name: fullName.split('.').pop(),
        type,
        indexGroup: 1,
        indexOffset: children.length,
        size: 1,
        symbol,
        getChildDatapointInfos(onResponse) {
            onResponse(children);
        }
    };
}

function createConnection(values = new Map()) {
    const observers = new Map();
    const writes = [];
    return {
        observers,
        writes,
        async sumRead(infos, onResponse, onError) {
            try {
                onResponse(infos.map(info => values.get(info.fullName)));
            } catch (error) {
                onError(error);
            }
        },
        async sumWrite(datapointValues, onResponse, onError) {
            try {
                writes.push(...datapointValues);
                for (const { datapointInfo, value } of datapointValues) {
                    values.set(datapointInfo.fullName, value);
                }
                onResponse([]);
            } catch (error) {
                onError(error);
            }
        },
        registerDatapointInfoObserver(info, observer) {
            const observersForInfo = observers.get(info.fullName) || new Set();
            observersForInfo.add(observer);
            observers.set(info.fullName, observersForInfo);
        },
        unregisterDatapointInfoObserver(info, observer) {
            const observersForInfo = observers.get(info.fullName);
            observersForInfo.delete(observer);
            if (observersForInfo.size === 0) {
                observers.delete(info.fullName);
            }
        }
    };
}

function createProviderFixture() {
    const generalDiagnosis = createInfo('MAIN_t1._m2._b3._d4', 'Diagnosis_Warning', [
        createInfo('MAIN_t1._m2._b3._d4._p2h_originID', 'LINT'),
        createInfo('MAIN_t1._m2._b3._d4._p2h_diagnosis', 'BOOL'),
        createInfo('MAIN_t1._m2._b3._d4._h2p_acknowledge', 'BOOL'),
        createInfo('MAIN_t1._m2._b3._d4._p2h_reason', 'T_MaxString'),
        createInfo('MAIN_t1._m2._b3._d4._p2h_context', 'T_MaxString')
    ]);
    const processDiagnosis = createInfo('MAIN_t1._m2._b3._p4._d5', 'Diagnosis_Message', [
        createInfo('MAIN_t1._m2._b3._p4._d5._p2h_originID', 'LINT'),
        createInfo('MAIN_t1._m2._b3._p4._d5._p2h_diagnosis', 'BOOL')
    ]);
    const triggerInfo = createInfo('MAIN_t1._m2._b3._p4.Trigger', 'LTAG_HMI_FiniteProcessController', [
        createInfo('MAIN_t1._m2._b3._p4.Trigger._h2p_execute', 'BOOL'),
        createInfo('MAIN_t1._m2._b3._p4.Trigger._h2p_interrupt', 'BOOL'),
        createInfo('MAIN_t1._m2._b3._p4.Trigger._p2h_state', 'BYTE')
    ]);
    const processRoot = createInfo('MAIN_t1._m2._b3._p4', 'ProcessRoot');
    const parameterLeaf = createInfo('MAIN_t1._m2._b3._p4._c6.Config.value', 'DINT');
    const parameterGroup = createInfo('MAIN_t1._m2._b3._p4._c6.Config', 'Config', [parameterLeaf]);
    const parameterSet = createInfo('MAIN_t1._m2._b3._p4._c6', 'LTAG_HMI_Parameter_Main', [parameterGroup]);
    return {
        generalDiagnosis,
        processDiagnosis,
        triggerInfo,
        processRoot,
        parameterLeaf,
        parameterSet,
        itemInfoProvider: {
            diagnoses: [generalDiagnosis],
            triggers: [{
                root: processRoot,
                info: triggerInfo,
                infinite: false,
                diagnoses: [processDiagnosis]
            }],
            parameterSets: [parameterSet]
        }
    };
}

test('diagnosis provider reads and monitors diagnosis values and acknowledges through sumWrite', async () => {
    const fixture = createProviderFixture();
    const values = new Map([
        [`${fixture.generalDiagnosis.fullName}._p2h_originID`, 42],
        [`${fixture.generalDiagnosis.fullName}._p2h_diagnosis`, false],
        [`${fixture.generalDiagnosis.fullName}._p2h_reason`, 'reason'],
        [`${fixture.generalDiagnosis.fullName}._p2h_context`, 'context']
    ]);
    const connection = createConnection(values);
    const provider = await ADS_PLC_Diagnoses.DiagnosisProvider.create(connection, fixture.itemInfoProvider);
    const diagnosis = provider.diagnoses[0];
    const changes = [];
    const onChange = snapshot => changes.push(snapshot);

    assert.equal(diagnosis.id, '1000020000300004');
    assert.equal(diagnosis.identifier, '1.02-03.04');
    await diagnosis.startMonitoring(onChange);
    assert.equal(diagnosis.originId, 42);
    assert.equal(diagnosis.active, false);
    assert.equal(diagnosis.reason, 'reason');
    assert.equal(diagnosis.context, 'context');

    const activeObserver = [...connection.observers.get(`${diagnosis.fullName}._p2h_diagnosis`)][0];
    activeObserver(true);
    assert.equal(diagnosis.active, true);
    assert.equal(changes.at(-1).active, true);

    await diagnosis.acknowledge();
    assert.deepEqual(connection.writes.map(write => [write.datapointInfo.fullName, write.value]), [
        [`${diagnosis.fullName}._h2p_acknowledge`, true]
    ]);
    diagnosis.stopMonitoring(onChange);
    assert.equal(connection.observers.size, 0);
});

test('process provider links parameter sets, starts/stops through trigger bits and writes nested values with sumWrite', async () => {
    const fixture = createProviderFixture();
    const values = new Map([[`${fixture.triggerInfo.fullName}._p2h_state`, 1]]);
    const connection = createConnection(values);
    const diagnoses = await ADS_PLC_Diagnoses.DiagnosisProvider.create(connection, fixture.itemInfoProvider);
    const provider = await ADS_PLC_Processes.ProcessProvider.create(connection, fixture.itemInfoProvider, diagnoses);
    const process = provider.processes[0];
    const parameterSet = provider.parameterSets[0];

    assert.equal(process.id, 't1m2b3p4');
    assert.deepEqual(process.parameterSets, [parameterSet]);
    assert.equal(parameterSet.id, 't1m2b3p4c6');
    assert.equal(parameterSet.number, 6);

    await process.start();
    await process.stop();
    await parameterSet.write({ Config: { value: 123 } });
    assert.deepEqual(connection.writes.map(write => [write.datapointInfo.fullName, write.value]), [
        [`${fixture.triggerInfo.fullName}._h2p_execute`, true],
        [`${fixture.triggerInfo.fullName}._h2p_interrupt`, true],
        [fixture.parameterLeaf.fullName, 123]
    ]);
});

test('process monitoring starts process diagnoses only while state is active', async () => {
    const fixture = createProviderFixture();
    const values = new Map([
        [`${fixture.triggerInfo.fullName}._p2h_state`, 1],
        [`${fixture.processDiagnosis.fullName}._p2h_originID`, 7],
        [`${fixture.processDiagnosis.fullName}._p2h_diagnosis`, false]
    ]);
    const connection = createConnection(values);
    const diagnoses = await ADS_PLC_Diagnoses.DiagnosisProvider.create(connection, fixture.itemInfoProvider);
    const provider = await ADS_PLC_Processes.ProcessProvider.create(connection, fixture.itemInfoProvider, diagnoses);
    const process = provider.processes[0];
    const changes = [];
    const onChange = change => changes.push(change);

    await process.startMonitoring(onChange);
    assert.equal(connection.observers.has(`${fixture.processDiagnosis.fullName}._p2h_diagnosis`), false);
    const stateObserver = [...connection.observers.get(`${fixture.triggerInfo.fullName}._p2h_state`)][0];
    await stateObserver(ADS_PLC_Processes.ProcessState.Busy);
    assert.equal(connection.observers.has(`${fixture.processDiagnosis.fullName}._p2h_diagnosis`), true);

    await stateObserver(ADS_PLC_Processes.ProcessState.CanExecute);
    assert.equal(connection.observers.has(`${fixture.processDiagnosis.fullName}._p2h_diagnosis`), false);
    await process.stopMonitoring(onChange);
});

test('parameter-set sum writes map PLC array indices to JavaScript array positions', async () => {
    const fixture = createProviderFixture();
    const array = createInfo('MAIN_t1._m2._b3._p4._c7.Values', 'ARRAY', [
        createInfo('MAIN_t1._m2._b3._p4._c7.Values[3]', 'BYTE'),
        createInfo('MAIN_t1._m2._b3._p4._c7.Values[4]', 'BYTE')
    ], { arrayInfo: [{ startIndex: 3, length: 2 }] });
    const parameterSet = createInfo('MAIN_t1._m2._b3._p4._c7', 'LTAG_HMI_Parameter_Array', [array]);
    const itemInfoProvider = {
        ...fixture.itemInfoProvider,
        parameterSets: [parameterSet]
    };
    const connection = createConnection();
    const diagnoses = await ADS_PLC_Diagnoses.DiagnosisProvider.create(connection, itemInfoProvider);
    const provider = await ADS_PLC_Processes.ProcessProvider.create(connection, itemInfoProvider, diagnoses);

    await provider.parameterSets[0].write({ Values: [17, 18] });
    assert.deepEqual(connection.writes.map(write => [write.datapointInfo.fullName, write.value]), [
        [`${array.fullName}[3]`, 17],
        [`${array.fullName}[4]`, 18]
    ]);
});

test('ADS client shares dynamic datapoint subscriptions without exposing them as configured data points', () => {
    const logger = {
        setLevel() {},
        trace() {},
        debug() {},
        info() {},
        warn() {},
        error() {},
        fatal() {}
    };
    const client = new ADS.Client(logger, {
        targetAmsNetId: '127.0.0.1.1.1',
        targetAdsPort: 851,
        nodesConfig: {}
    });
    const info = createInfo('MAIN.Value', 'BYTE', [], { adsDataTypeStr: 'ADST_UINT8' });
    const firstObserver = () => {};
    const secondObserver = () => {};

    client.registerDatapointInfoObserver(info, firstObserver);
    client.registerDatapointInfoObserver(info, secondObserver);
    assert.deepEqual(client.getDataPoints(), []);

    client.unregisterDatapointInfoObserver(info, firstObserver);
    client.unregisterDatapointInfoObserver(info, secondObserver);
    assert.throws(
        () => client.unregisterDatapointInfoObserver(info, secondObserver),
        /Observer is not registered/
    );
});
