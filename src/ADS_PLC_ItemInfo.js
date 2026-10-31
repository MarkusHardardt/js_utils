import Core from './Core.js';
import Common from './Common.js';

const ADS_PLC_ItemInfo = {};

function validateAsAdsConnection(instance, validateMethodArguments) {
    return Core.validateAs('AdsConnection', instance, 'getRootDatapointInfos(onResponse, onError, accept)', validateMethodArguments);
}
ADS_PLC_ItemInfo.validateAsAdsConnection = validateAsAdsConnection;

function validateAsVariableInfo(instance, validateMethodArguments) {
    Common.validateAsDatapointInfo(instance, validateMethodArguments);
    return Core.validateAs('VariableInfo', instance, [
        'indexGroup:number',
        'indexOffset:number',
        'size:number'
    ], validateMethodArguments);
}
ADS_PLC_ItemInfo.validateAsVariableInfo = validateAsVariableInfo;

function validateAsAdsPlcDiagnosisInfoProvider(instance, validateMethodArguments) {
    Core.validateAs('AdsPlcDiagnosisInfoProvider', instance, 'diagnoses:object', validateMethodArguments);
    if (!Array.isArray(instance.diagnoses)) {
        throw new Error('AdsPlcDiagnosisInfoProvider property \'diagnoses\' is not an array');
    }
    instance.diagnoses.forEach(diagnosis => validateAsVariableInfo(diagnosis, validateMethodArguments));
    return instance;
}
ADS_PLC_ItemInfo.validateAsAdsPlcDiagnosisInfoProvider = validateAsAdsPlcDiagnosisInfoProvider;

function validateAsAdsPlcProcessInfoProvider(instance, validateMethodArguments) {
    Core.validateAs('AdsPlcProcessInfoProvider', instance, [
        'triggers:object',
        'parameterSets:object'
    ], validateMethodArguments);
    if (!Array.isArray(instance.triggers) || !Array.isArray(instance.parameterSets)) {
        throw new Error('AdsPlcProcessInfoProvider properties \'triggers\' and \'parameterSets\' must be arrays');
    }
    instance.triggers.forEach(trigger => validateAsAdsPlcProcessTrigger(trigger, validateMethodArguments));
    instance.parameterSets.forEach(parameterSet => validateAsVariableInfo(parameterSet, validateMethodArguments));
    return instance;
}
ADS_PLC_ItemInfo.validateAsAdsPlcProcessInfoProvider = validateAsAdsPlcProcessInfoProvider;

function validateAsAdsPlcProcessTrigger(instance, validateMethodArguments) {
    Core.validateAs('AdsPlcProcessTrigger', instance, [
        'root:object',
        'info:object',
        'infinite:boolean',
        'diagnoses:object'
    ], validateMethodArguments);
    validateAsVariableInfo(instance.root, validateMethodArguments);
    validateAsVariableInfo(instance.info, validateMethodArguments);
    if (!Array.isArray(instance.diagnoses)) {
        throw new Error('AdsPlcProcessTrigger property \'diagnoses\' is not an array');
    }
    instance.diagnoses.forEach(diagnosis => validateAsVariableInfo(diagnosis, validateMethodArguments));
    return instance;
}
ADS_PLC_ItemInfo.validateAsAdsPlcProcessTrigger = validateAsAdsPlcProcessTrigger;

const AnyProcessControllerType = /^(?:[a-z0-9_]+\.)?LTAG_HMI_(?:In)?FiniteProcessController$/i;
const FiniteProcessControllerType = /^(?:[a-z0-9_]+\.)?LTAG_HMI_FiniteProcessController$/i;
const InfiniteProcessControllerType = /^(?:[a-z0-9_]+\.)?LTAG_HMI_InfiniteProcessController$/i;
const ProcessParameterSetType = /^(?:[a-z0-9_]+\.)?LTAG_HMI_Parameter_\w+$/i;
const AnyDiagnosisType = /^(?:[a-z0-9_]+\.)?Diagnosis_(?:Message|Warning|ControlError|SafetyError|FatalError)$/i;
const BROWSE_YIELD_INTERVAL = 100;

async function yieldToEventLoopIfNeeded(state) {
    state.workSinceYield++;
    if (state.workSinceYield >= BROWSE_YIELD_INTERVAL) {
        state.workSinceYield = 0;
        await new Promise(resolve => {
            if (typeof setImmediate === 'function') {
                setImmediate(resolve);
            } else {
                setTimeout(resolve, 0);
            }
        });
    }
}

function getChildDatapointInfos(info) {
    return new Promise((resolve, reject) => {
        info.getChildDatapointInfos(children => {
            if (!Array.isArray(children)) {
                reject(new Error('DatapointInfo.getChildDatapointInfos() did not return an array'));
                return;
            }
            resolve(children);
        }, reject);
    });
}

async function browseInfos(infos, diagnosisCallback, processTriggerCallback, parameterSetCallback, process = null, path = [], ignorable = new Set(), state = { workSinceYield: 0 }) {
    if (!Array.isArray(infos)) {
        throw new Error('ADS_PLC_ItemInfo.browse(): datapoint infos must be an array');
    }
    let containsProcessController = false;
    for (const info of infos) {
        validateAsVariableInfo(info);
        containsProcessController = containsProcessController || AnyProcessControllerType.test(info.type);
        await yieldToEventLoopIfNeeded(state);
    }
    if (process === null && containsProcessController) {
        process = path[path.length - 1] || null;
    }

    let found = false;
    for (const info of infos) {
        await yieldToEventLoopIfNeeded(state);
        const key = info.type;
        if (ignorable.has(key)) {
            continue;
        }

        path.push(info);
        try {
            if (InfiniteProcessControllerType.test(key) || FiniteProcessControllerType.test(key)) {
                processTriggerCallback(path.slice(), process, InfiniteProcessControllerType.test(key));
                found = true;
            } else if (ProcessParameterSetType.test(key)) {
                parameterSetCallback(path.slice());
                found = true;
            } else if (AnyDiagnosisType.test(key)) {
                diagnosisCallback(path.slice(), process);
                found = true;
            } else if (await browseInfos(await getChildDatapointInfos(info), diagnosisCallback, processTriggerCallback, parameterSetCallback, process, path, ignorable, state)) {
                found = true;
            } else {
                ignorable.add(key);
            }
        } finally {
            path.pop();
        }
    }
    return found;
}

function getRootDatapointInfos(connection, acceptRoot) {
    return new Promise((resolve, reject) => connection.getRootDatapointInfos(resolve, reject, acceptRoot));
}

async function browse(connection, diagnosisCallback, processTriggerCallback, parameterSetCallback, acceptRoot) {
    validateAsAdsConnection(connection);
    if (typeof diagnosisCallback !== 'function') {
        throw new Error('ADS_PLC_ItemInfo.browse(): diagnosisCallback is not a function');
    } else if (typeof processTriggerCallback !== 'function') {
        throw new Error('ADS_PLC_ItemInfo.browse(): processTriggerCallback is not a function');
    } else if (typeof parameterSetCallback !== 'function') {
        throw new Error('ADS_PLC_ItemInfo.browse(): parameterSetCallback is not a function');
    }

    const rootInfos = await getRootDatapointInfos(connection, acceptRoot);
    if (!Array.isArray(rootInfos)) {
        throw new Error('ADS_PLC_ItemInfo.browse(): root datapoint infos must be an array');
    }
    rootInfos.forEach(info => validateAsVariableInfo(info));
    await browseInfos(rootInfos, diagnosisCallback, processTriggerCallback, parameterSetCallback);
}
ADS_PLC_ItemInfo.browse = browse;

class ItemInfoProvider {
    constructor(diagnoses, triggers, parameterSets) {
        if (!Array.isArray(diagnoses) || !Array.isArray(triggers) || !Array.isArray(parameterSets)) {
            throw new Error('ItemInfoProvider: diagnoses, triggers and parameterSets must be arrays');
        }
        diagnoses.forEach(diagnosis => validateAsVariableInfo(diagnosis));
        triggers.forEach(trigger => validateAsAdsPlcProcessTrigger(trigger));
        parameterSets.forEach(parameterSet => validateAsVariableInfo(parameterSet));

        this.diagnoses = diagnoses;
        this.triggers = triggers;
        this.parameterSets = parameterSets;
        validateAsAdsPlcDiagnosisInfoProvider(this);
        validateAsAdsPlcProcessInfoProvider(this);
    }

    static async create(connection, acceptRoot) {
        const diagnoses = [];
        const processDiagnoses = new Map();
        const processTriggerItems = [];
        const parameterSets = [];

        await browse(connection, (path, process) => {
            const diagnosis = path[path.length - 1];
            if (process === null) {
                diagnoses.push(diagnosis);
                return;
            }
            let processDiagnosisList = processDiagnoses.get(process.fullName);
            if (!processDiagnosisList) {
                processDiagnosisList = [];
                processDiagnoses.set(process.fullName, processDiagnosisList);
            }
            processDiagnosisList.push(diagnosis);
        }, (path, process, infinite) => {
            processTriggerItems.push({
                root: process,
                info: path[path.length - 1],
                infinite,
                diagnoses: []
            });
        }, path => {
            parameterSets.push(path[path.length - 1]);
        }, acceptRoot);

        const triggers = processTriggerItems.map(trigger => {
            if (!trigger.root) {
                throw new Error(`ItemInfoProvider: No process root found for trigger '${trigger.info.fullName}'`);
            }
            trigger.diagnoses = processDiagnoses.get(trigger.root.fullName) || [];
            return trigger;
        });
        return new ItemInfoProvider(diagnoses, triggers, parameterSets);
    }
}
ADS_PLC_ItemInfo.ItemInfoProvider = ItemInfoProvider;

Object.freeze(ADS_PLC_ItemInfo);

export default ADS_PLC_ItemInfo;
