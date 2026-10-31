import ADS_PLC_Diagnoses from './ADS_PLC_Diagnoses.js';
import ADS_PLC_ItemInfo from './ADS_PLC_ItemInfo.js';

const ADS_PLC_Processes = {};

const TriggerVariableSuffixes = Object.freeze({
    execute: '_h2p_execute',
    interrupt: '_h2p_interrupt',
    state: '_p2h_state'
});

const ProcessState = Object.freeze({
    CanExecute: 1,
    Busy: 2,
    Done: 4,
    Failed: 8
});

function getChildren(info) {
    return new Promise((resolve, reject) => {
        info.getChildDatapointInfos(children => {
            if (!Array.isArray(children)) {
                reject(new Error(`ADS_PLC_Processes: Children of '${info.fullName}' are not an array`));
                return;
            }
            resolve(children);
        }, reject);
    });
}

function sumRead(connection, datapointInfos) {
    return new Promise((resolve, reject) => connection.sumRead(datapointInfos, resolve, reject));
}

function sumWrite(connection, datapointValues) {
    return new Promise((resolve, reject) => connection.sumWrite(datapointValues, resolve, reject));
}

function getComponent(fullName, suffix, sum = true) {
    const values = [...fullName.matchAll(new RegExp(`_${suffix}(\\d+)`, 'ig'))]
        .map(match => Number(match[1]));
    const indexedValues = [...fullName.matchAll(new RegExp(`_${suffix}i\\[(\\d+)\\]`, 'ig'))]
        .map(match => Number(match[1]));
    if (values.some(value => !Number.isSafeInteger(value)) ||
        indexedValues.some(value => !Number.isSafeInteger(value)) ||
        values.length === 0 && indexedValues.length === 0) {
        return null;
    }
    const components = [...values, ...indexedValues];
    if (!sum) {
        return components[0];
    }
    const total = components.reduce((result, value) => result + value, 0);
    return Number.isSafeInteger(total) ? total : null;
}

function getProcessId(fullName) {
    const task = getComponent(fullName, 't', false);
    const module = getComponent(fullName, 'm', false);
    const block = getComponent(fullName, 'b');
    const process = getComponent(fullName, 'p');
    if ([task, module, block, process].some(value => value === null)) {
        return null;
    }
    return `t${task}m${module}b${block}p${process}`;
}

function getParameterSetId(fullName) {
    const processId = getProcessId(fullName);
    const config = getComponent(fullName, 'c');
    if (processId === null || config === null) {
        return null;
    }
    return { id: `${processId}c${config}`, processId, number: config };
}

function findChild(children, suffix) {
    return children.find(info => info.fullName.toLowerCase().endsWith(suffix.toLowerCase())) || null;
}

function isProcessDiagnosisActive(state) {
    return (state & (ProcessState.Busy | ProcessState.Done | ProcessState.Failed)) !== 0;
}

class ParameterSet {
    #connection;
    #leaves;

    constructor(connection, info, id, processId, number, leaves) {
        this.#connection = connection;
        this.info = info;
        this.id = id;
        this.processId = processId;
        this.number = number;
        this.#leaves = leaves;
    }

    get fullName() {
        return this.info.fullName;
    }

    async write(values) {
        if (!values || typeof values !== 'object') {
            throw new Error(`ADS_PLC_Processes.ParameterSet.write(): Values for '${this.fullName}' must be an object`);
        }
        const datapointValues = [];
        for (const leaf of this.#leaves) {
            const value = getParameterValue(values, leaf.path);
            if (value !== undefined) {
                datapointValues.push({ datapointInfo: leaf.info, value });
            }
        }
        return sumWrite(this.#connection, datapointValues);
    }
}

function getParameterValue(values, path) {
    let value = values;
    for (let pathIndex = 1; pathIndex < path.length; pathIndex++) {
        const info = path[pathIndex];
        const name = info.name;
        const arrayElement = /^(.*)\[(-?\d+(?:,-?\d+)*)\]$/.exec(name);
        if (arrayElement) {
            const [, arrayName, rawIndices] = arrayElement;
            const parent = path[pathIndex - 1];
            const dimensions = parent.symbol?.arrayInfo || [];
            let arrayValue = Array.isArray(value) ? value : value && value[arrayName];
            for (const [dimensionIndex, rawIndex] of rawIndices.split(',').entries()) {
                if (!Array.isArray(arrayValue)) {
                    arrayValue = undefined;
                    break;
                }
                const startIndex = dimensions[dimensionIndex]?.startIndex || 0;
                arrayValue = arrayValue[Number(rawIndex) - startIndex];
            }
            if (arrayValue !== undefined) {
                value = arrayValue;
            } else {
                value = value[name];
            }
        } else {
            value = value && value[name];
        }
        if (value === undefined || value === null) {
            return undefined;
        }
    }
    return value;
}

async function createParameterSet(connection, info) {
    const identity = getParameterSetId(info.fullName);
    if (!identity) {
        throw new Error(`ADS_PLC_Processes: Invalid parameter-set path '${info.fullName}'`);
    }
    const leaves = [];
    const visit = async (item, path) => {
        const children = await getChildren(item);
        if (children.length === 0) {
            leaves.push({ info: item, path });
            return;
        }
        for (const child of children) {
            await visit(child, [...path, child]);
        }
    };
    for (const child of await getChildren(info)) {
        await visit(child, [info, child]);
    }
    return new ParameterSet(connection, info, identity.id, identity.processId, identity.number, leaves);
}

class Process {
    #connection;
    #executeInfo;
    #interruptInfo;
    #stateInfo;
    #diagnoses;
    #listeners;
    #stateObserver;
    #diagnosisObserver;

    constructor(connection, trigger, id, parameterSets, diagnoses) {
        this.#connection = connection;
        this.#diagnoses = diagnoses;
        this.#listeners = new Set();
        this.info = trigger.info;
        this.root = trigger.root;
        this.id = id;
        this.infinite = trigger.infinite;
        this.parameterSets = parameterSets;
        this.diagnoses = diagnoses;
        this.state = null;
        this.#executeInfo = null;
        this.#interruptInfo = null;
        this.#stateInfo = null;
        this.#stateObserver = state => this.#setState(state);
        this.#diagnosisObserver = diagnosis => this.#notifyListeners({ type: 'diagnosis', diagnosis });
    }

    get fullName() {
        return this.root.fullName;
    }

    get canExecute() {
        return this.state !== null && (this.state & ProcessState.CanExecute) !== 0;
    }

    get busy() {
        return this.state !== null && (this.state & ProcessState.Busy) !== 0;
    }

    get done() {
        return this.state !== null && (this.state & ProcessState.Done) !== 0;
    }

    get failed() {
        return this.state !== null && (this.state & ProcessState.Failed) !== 0;
    }

    async initialize() {
        const children = await getChildren(this.info);
        this.#executeInfo = findChild(children, TriggerVariableSuffixes.execute);
        this.#interruptInfo = findChild(children, TriggerVariableSuffixes.interrupt);
        this.#stateInfo = findChild(children, TriggerVariableSuffixes.state);
        for (const [name, info] of [
            ['execute', this.#executeInfo],
            ['interrupt', this.#interruptInfo],
            ['state', this.#stateInfo]
        ]) {
            if (!info) {
                throw new Error(`ADS_PLC_Processes: Missing '${name}' variable in process trigger '${this.info.fullName}'`);
            }
        }
    }

    async readState() {
        const [state] = await sumRead(this.#connection, [this.#stateInfo]);
        await this.#setState(state);
        return this.state;
    }

    async start() {
        if (this.state === null) {
            await this.readState();
        }
        if (!this.canExecute || this.busy) {
            throw new Error(`ADS_PLC_Processes.Process.start(): Process '${this.fullName}' cannot execute in state ${this.state}`);
        }
        return sumWrite(this.#connection, [{ datapointInfo: this.#executeInfo, value: true }]);
    }

    async stop() {
        return sumWrite(this.#connection, [{ datapointInfo: this.#interruptInfo, value: true }]);
    }

    async startMonitoring(onChange) {
        if (typeof onChange !== 'function') {
            throw new Error('ADS_PLC_Processes.Process.startMonitoring(): onChange is not a function');
        }
        if (this.#listeners.has(onChange)) {
            return;
        }
        this.#listeners.add(onChange);
        if (this.#listeners.size === 1) {
            let observerRegistered = false;
            try {
                this.#connection.registerDatapointInfoObserver(this.#stateInfo, this.#stateObserver);
                observerRegistered = true;
                await this.readState();
            } catch (error) {
                this.#listeners.delete(onChange);
                if (observerRegistered) {
                    this.#connection.unregisterDatapointInfoObserver(this.#stateInfo, this.#stateObserver);
                }
                for (const diagnosis of this.#diagnoses) {
                    diagnosis.stopMonitoring(this.#diagnosisObserver);
                }
                throw error;
            }
        }
    }

    async stopMonitoring(onChange) {
        const wasMonitoring = this.#listeners.size > 0;
        if (onChange === undefined) {
            this.#listeners.clear();
        } else if (typeof onChange !== 'function') {
            throw new Error('ADS_PLC_Processes.Process.stopMonitoring(): onChange is not a function');
        } else {
            this.#listeners.delete(onChange);
        }
        if (wasMonitoring && this.#listeners.size === 0) {
            this.#connection.unregisterDatapointInfoObserver(this.#stateInfo, this.#stateObserver);
            for (const diagnosis of this.#diagnoses) {
                diagnosis.stopMonitoring(this.#diagnosisObserver);
            }
        }
    }

    async #setState(state) {
        const numericState = Number(state);
        if (!Number.isInteger(numericState) || numericState < 0) {
            throw new Error(`ADS_PLC_Processes.Process: Invalid state '${state}' for '${this.fullName}'`);
        }
        this.state = numericState;
        this.#notifyListeners({ type: 'state', state: this.state });
        await this.#updateDiagnosisMonitoring();
    }

    async #updateDiagnosisMonitoring() {
        if (this.#listeners.size === 0) {
            return;
        }
        for (const diagnosis of this.#diagnoses) {
            if (isProcessDiagnosisActive(this.state)) {
                await diagnosis.startMonitoring(this.#diagnosisObserver);
            } else {
                diagnosis.stopMonitoring(this.#diagnosisObserver);
            }
        }
    }

    #notifyListeners(change) {
        for (const listener of this.#listeners) {
            listener({ process: this, ...change });
        }
    }
}

class ProcessProvider {
    constructor(connection, processes, parameterSets, diagnosisProvider) {
        this.connection = connection;
        this.processes = processes;
        this.parameterSets = parameterSets;
        this.diagnosisProvider = diagnosisProvider;
    }

    static async create(connection, itemInfoProvider, diagnosisProvider) {
        const provider = itemInfoProvider || await ADS_PLC_ItemInfo.ItemInfoProvider.create(connection);
        if (!provider || !Array.isArray(provider.triggers) || !Array.isArray(provider.parameterSets)) {
            throw new Error('ADS_PLC_Processes.ProcessProvider.create(): Invalid item info provider');
        }
        if (typeof connection.sumRead !== 'function' ||
            typeof connection.sumWrite !== 'function' ||
            typeof connection.registerDatapointInfoObserver !== 'function' ||
            typeof connection.unregisterDatapointInfoObserver !== 'function') {
            throw new Error('ADS_PLC_Processes.ProcessProvider.create(): Connection does not support ADS reads, writes and subscriptions');
        }
        const diagnoses = diagnosisProvider ||
            await ADS_PLC_Diagnoses.DiagnosisProvider.create(connection, provider);
        const parameterSets = [];
        const parameterSetIds = new Set();
        for (const info of provider.parameterSets) {
            const parameterSet = await createParameterSet(connection, info);
            if (parameterSetIds.has(parameterSet.id)) {
                throw new Error(`ADS_PLC_Processes: Duplicate parameter-set id '${parameterSet.id}'`);
            }
            parameterSetIds.add(parameterSet.id);
            parameterSets.push(parameterSet);
        }

        const processes = [];
        const processIds = new Set();
        for (const trigger of provider.triggers) {
            const id = getProcessId(trigger.root.fullName);
            if (id === null) {
                throw new Error(`ADS_PLC_Processes: Invalid process path '${trigger.root.fullName}'`);
            }
            if (processIds.has(id)) {
                throw new Error(`ADS_PLC_Processes: Duplicate process id '${id}'`);
            }
            const process = new Process(
                connection,
                trigger,
                id,
                parameterSets.filter(parameterSet => parameterSet.processId === id),
                diagnoses.processDiagnoses.get(trigger.root.fullName) || []
            );
            await process.initialize();
            processIds.add(id);
            processes.push(process);
        }

        for (const parameterSet of parameterSets) {
            if (!processIds.has(parameterSet.processId)) {
                throw new Error(`ADS_PLC_Processes: No process '${parameterSet.processId}' for parameter set '${parameterSet.fullName}'`);
            }
        }
        return new ProcessProvider(connection, processes, parameterSets, diagnoses);
    }

    async startMonitoring(onChange) {
        try {
            await this.diagnosisProvider.startMonitoring(onChange);
            for (const process of this.processes) {
                await process.startMonitoring(onChange);
            }
        } catch (error) {
            await this.stopMonitoring(onChange);
            throw error;
        }
    }

    async stopMonitoring(onChange) {
        this.diagnosisProvider.stopMonitoring(onChange);
        for (const process of this.processes) {
            await process.stopMonitoring(onChange);
        }
    }
}

ADS_PLC_Processes.ProcessState = ProcessState;
ADS_PLC_Processes.ParameterSet = ParameterSet;
ADS_PLC_Processes.Process = Process;
ADS_PLC_Processes.ProcessProvider = ProcessProvider;

Object.freeze(ADS_PLC_Processes);

export default ADS_PLC_Processes;
