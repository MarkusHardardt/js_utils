import assert from 'node:assert/strict';
import test from 'node:test';
import ADS_PLC_ItemInfo from '../src/ADS_PLC_ItemInfo.js';

function createDatapointInfo(fullName, type, children = []) {
    return {
        fullName,
        name: fullName.split('.').pop(),
        type,
        indexGroup: 1,
        indexOffset: 2,
        size: 4,
        getChildDatapointInfos(onResponse, onError) {
            try {
                onResponse(children);
            } catch (error) {
                onError(error);
            }
        }
    };
}

function createConnection(rootInfos) {
    return {
        getRootDatapointInfos(onResponse, onError) {
            try {
                onResponse(rootInfos);
            } catch (error) {
                onError(error);
            }
        }
    };
}

test('browse groups process diagnoses and reports general diagnoses, triggers and parameter sets', async () => {
    const processTrigger = createDatapointInfo('MAIN.Process.Trigger', 'LTAG_HMI_InfiniteProcessController');
    const processDiagnosis = createDatapointInfo('MAIN.Process.Alarm', 'Diagnosis_Warning');
    const generalDiagnosis = createDatapointInfo('MAIN.GeneralAlarm', 'Diagnosis_Message');
    const parameterSet = createDatapointInfo('MAIN.Parameters', 'LTAG_HMI_Parameter_Main');
    const connection = createConnection([
        createDatapointInfo('MAIN', 'MainProgram', [
            generalDiagnosis,
            createDatapointInfo('MAIN.Process', 'ProcessData', [processTrigger, processDiagnosis]),
            parameterSet
        ])
    ]);

    const provider = await ADS_PLC_ItemInfo.ItemInfoProvider.create(connection);

    assert.deepEqual(provider.diagnoses, [generalDiagnosis]);
    assert.deepEqual(provider.parameterSets, [parameterSet]);
    assert.equal(provider.triggers.length, 1);
    assert.equal(provider.triggers[0].root.fullName, 'MAIN.Process');
    assert.equal(provider.triggers[0].info, processTrigger);
    assert.equal(provider.triggers[0].infinite, true);
    assert.deepEqual(provider.triggers[0].diagnoses, [processDiagnosis]);
});

test('browse propagates errors from ADS root-symbol enumeration', async () => {
    const connection = {
        getRootDatapointInfos(onResponse, onError) {
            onError(new Error('ADS browse failed'));
        }
    };
    const callback = () => {};

    await assert.rejects(
        ADS_PLC_ItemInfo.browse(connection, callback, callback, callback),
        /ADS browse failed/
    );
});
