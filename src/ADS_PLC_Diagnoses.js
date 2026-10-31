import ADS_PLC_ItemInfo from './ADS_PLC_ItemInfo.js';

const ADS_PLC_Diagnoses = {};

const DiagnosisVariableSuffixes = Object.freeze({
    originId: '_p2h_originID',
    active: '_p2h_diagnosis',
    acknowledge: '_h2p_acknowledge',
    reason: '_p2h_reason',
    context: '_p2h_context'
});

function getChildren(info) {
    return new Promise((resolve, reject) => {
        info.getChildDatapointInfos(children => {
            if (!Array.isArray(children)) {
                reject(new Error(`ADS_PLC_Diagnoses: Children of '${info.fullName}' are not an array`));
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

function findDiagnosisIds(fullName) {
    const components = { task: null, module: null, block: 0, diagnosis: 0 };
    for (const [component, pattern] of [
        ['task', /_t(\d+)/ig],
        ['module', /_m(\d+)/ig],
        ['block', /_b(\d+)/ig],
        ['diagnosis', /_d(\d+)/ig]
    ]) {
        for (const match of fullName.matchAll(pattern)) {
            const value = Number(match[1]);
            if (!Number.isSafeInteger(value)) {
                return null;
            }
            if (component === 'task' || component === 'module') {
                if (components[component] === null) {
                    components[component] = value;
                }
            } else {
                components[component] += value;
            }
        }
    }

    for (const [component, pattern] of [
        ['block', /_bi\[(\d+)\]/ig],
        ['diagnosis', /_di\[(\d+)\]/ig]
    ]) {
        for (const match of fullName.matchAll(pattern)) {
            const value = Number(match[1]);
            if (!Number.isSafeInteger(value)) {
                return null;
            }
            components[component] += value;
        }
    }
    if (components.task === null || components.module === null ||
        components.block === 0 && !/_b\d+|_bi\[\d+\]/i.test(fullName) ||
        components.diagnosis === 0 && !/_d\d+|_di\[\d+\]/i.test(fullName)) {
        return null;
    }
    if (![components.task, components.module, components.block, components.diagnosis].every(Number.isSafeInteger)) {
        return null;
    }
    return components;
}

function getDiagnosisIdentity(fullName) {
    const components = findDiagnosisIds(fullName);
    if (!components) {
        return { id: '-1', identifier: '?.??-??.??' };
    }
    const { task, module, block, diagnosis } = components;
    const id = (
        BigInt(task) * 1000000000000000n +
        BigInt(module) * 10000000000n +
        BigInt(block) * 100000n +
        BigInt(diagnosis)
    ).toString();
    return {
        id,
        identifier: `${task}.${String(module).padStart(2, '0')}-${String(block).padStart(2, '0')}.${String(diagnosis).padStart(2, '0')}`
    };
}

function findChild(children, suffix, required) {
    const child = children.find(info => info.fullName.toLowerCase().endsWith(suffix.toLowerCase()));
    if (!child && required) {
        throw new Error(`ADS_PLC_Diagnoses: Missing '${suffix}' in diagnosis`);
    }
    return child || null;
}

class Diagnosis {
    #connection;
    #fields;
    #listeners;
    #registeredObservers;

    constructor(connection, info, fields, processFullName = null) {
        this.#connection = connection;
        this.info = info;
        this.#fields = fields;
        this.#listeners = new Set();
        this.#registeredObservers = [];
        this.processFullName = processFullName;
        const identity = getDiagnosisIdentity(info.fullName);
        this.id = identity.id;
        this.instanceId = identity.id;
        this.identifier = identity.identifier;
        this.originId = null;
        this.active = false;
        this.reason = null;
        this.context = null;
    }

    get fullName() {
        return this.info.fullName;
    }

    get type() {
        return this.info.type;
    }

    get isMonitoring() {
        return this.#listeners.size > 0;
    }

    async read() {
        const fields = Object.entries(this.#fields).filter(([, info]) =>
            info && info !== this.#fields.acknowledge
        );
        const infos = fields.map(([, info]) => info);
        if (infos.length === 0) {
            return this.getSnapshot();
        }
        const values = await sumRead(this.#connection, infos);
        fields.forEach(([name], index) => {
            this.#setValue(name, values[index]);
        });
        return this.getSnapshot();
    }

    async acknowledge() {
        const info = this.#fields.acknowledge;
        if (!info) {
            throw new Error(`ADS_PLC_Diagnoses: Diagnosis '${this.fullName}' cannot be acknowledged`);
        }
        return sumWrite(this.#connection, [{ datapointInfo: info, value: true }]);
    }

    async startMonitoring(onChange) {
        if (typeof onChange !== 'function') {
            throw new Error('ADS_PLC_Diagnoses.Diagnosis.startMonitoring(): onChange is not a function');
        }
        if (this.#listeners.has(onChange)) {
            return;
        }
        this.#listeners.add(onChange);
        if (this.#registeredObservers.length > 0) {
            return;
        }
        try {
            for (const [name, info] of Object.entries(this.#fields)) {
                if (!info || name === 'acknowledge') {
                    continue;
                }
                const observer = value => {
                    this.#setValue(name, value);
                    this.#notifyListeners();
                };
                this.#connection.registerDatapointInfoObserver(info, observer);
                this.#registeredObservers.push({ info, observer });
            }
            await this.read();
            this.#notifyListeners();
        } catch (error) {
            this.#listeners.delete(onChange);
            this.#unregisterObservers();
            throw error;
        }
    }

    stopMonitoring(onChange) {
        if (onChange === undefined) {
            this.#listeners.clear();
        } else if (typeof onChange !== 'function') {
            throw new Error('ADS_PLC_Diagnoses.Diagnosis.stopMonitoring(): onChange is not a function');
        } else {
            this.#listeners.delete(onChange);
        }
        if (this.#listeners.size === 0) {
            this.#unregisterObservers();
        }
    }

    getSnapshot() {
        return {
            id: this.id,
            instanceId: this.instanceId,
            identifier: this.identifier,
            fullName: this.fullName,
            type: this.type,
            processFullName: this.processFullName,
            originId: this.originId,
            active: this.active,
            reason: this.reason,
            context: this.context
        };
    }

    #setValue(name, value) {
        this[name] = value;
    }

    #notifyListeners() {
        const snapshot = this.getSnapshot();
        for (const listener of this.#listeners) {
            listener(snapshot);
        }
    }

    #unregisterObservers() {
        for (const { info, observer } of this.#registeredObservers) {
            this.#connection.unregisterDatapointInfoObserver(info, observer);
        }
        this.#registeredObservers = [];
    }
}

class DiagnosisProvider {
    constructor(connection, diagnoses, processDiagnoses) {
        this.connection = connection;
        this.diagnoses = diagnoses;
        this.processDiagnoses = processDiagnoses;
    }

    static async create(connection, itemInfoProvider) {
        const provider = itemInfoProvider || await ADS_PLC_ItemInfo.ItemInfoProvider.create(connection);
        if (!provider || !Array.isArray(provider.diagnoses) || !Array.isArray(provider.triggers)) {
            throw new Error('ADS_PLC_Diagnoses.DiagnosisProvider.create(): Invalid item info provider');
        }
        if (typeof connection.sumRead !== 'function' ||
            typeof connection.sumWrite !== 'function' ||
            typeof connection.registerDatapointInfoObserver !== 'function' ||
            typeof connection.unregisterDatapointInfoObserver !== 'function') {
            throw new Error('ADS_PLC_Diagnoses.DiagnosisProvider.create(): Connection does not support ADS reads, writes and subscriptions');
        }

        const diagnoses = [];
        const processDiagnoses = new Map();
        const allInfos = [
            ...provider.diagnoses.map(info => ({ info, processFullName: null })),
            ...provider.triggers.flatMap(trigger =>
                trigger.diagnoses.map(info => ({ info, processFullName: trigger.root.fullName }))
            )
        ];
        for (const { info, processFullName } of allInfos) {
            const children = await getChildren(info);
            const fields = {
                originId: findChild(children, DiagnosisVariableSuffixes.originId, true),
                active: findChild(children, DiagnosisVariableSuffixes.active, true),
                acknowledge: findChild(children, DiagnosisVariableSuffixes.acknowledge, false),
                reason: findChild(children, DiagnosisVariableSuffixes.reason, false),
                context: findChild(children, DiagnosisVariableSuffixes.context, false)
            };
            const diagnosis = new Diagnosis(connection, info, fields, processFullName);
            if (processFullName === null) {
                diagnoses.push(diagnosis);
            } else {
                const entries = processDiagnoses.get(processFullName) || [];
                entries.push(diagnosis);
                processDiagnoses.set(processFullName, entries);
            }
        }
        return new DiagnosisProvider(connection, diagnoses, processDiagnoses);
    }

    async startMonitoring(onChange) {
        try {
            for (const diagnosis of this.diagnoses) {
                await diagnosis.startMonitoring(onChange);
            }
        } catch (error) {
            this.stopMonitoring(onChange);
            throw error;
        }
    }

    stopMonitoring(onChange) {
        for (const diagnosis of this.diagnoses) {
            diagnosis.stopMonitoring(onChange);
        }
    }
}

ADS_PLC_Diagnoses.Diagnosis = Diagnosis;
ADS_PLC_Diagnoses.DiagnosisProvider = DiagnosisProvider;

Object.freeze(ADS_PLC_Diagnoses);

export default ADS_PLC_Diagnoses;
