import Regex from './Regex.js';

const Core = {};

/*  Standard datatypes */
const DataType = Object.freeze({
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
Core.DataType = DataType;

/*  Returns a function witch on each call returns a number (radix 36, starting at zero). */
function createIdGenerator(prefix, suffix) {
    let id = 0;
    return () => `${prefix}${(id++).toString(36)}${suffix}`;
}
Core.createIdGenerator = createIdGenerator;

Core.defaultEqual = (v1, v2) => v1 === v2;

/*  Look at this sample to understand what is returned:
    object = { 
        'a': '1',
        'b': '2',
        'c': '3'
    }
    transformed: {
        '1': 'a',
        '2': 'b',
        '3': 'c'
    }  */
function getTransformedObject(object, getKey, getValue) {
    const gk = typeof getKey === 'function';
    const gv = typeof getValue === 'function';
    const transformed = {};
    for (const attr in object) {
        if (object.hasOwnProperty(attr)) {
            const value = object[attr];
            const key = gk ? getKey(attr, value) : value;
            if (transformed[key] !== undefined) {
                throw new Error(`Key '${key}' of attribute '${attr}' already exists`);
            }
            transformed[key] = gv ? getValue(attr, value) : attr;
        }
    }
    return transformed;
}
Core.getTransformedObject = getTransformedObject;

/*  Kahn's algorithm  */
function getTopologicalSorting(dependencies) {
    const graph = new Map();
    const inDegree = new Map();
    const queue = [];
    const result = [];
    for (const node in dependencies) {
        if (dependencies.hasOwnProperty(node)) {
            if (!inDegree.has(node)) {
                inDegree.set(node, 0);
            }
            for (const dep of dependencies[node]) {
                graph.set(dep, (graph.get(dep) || []).concat(node));
                inDegree.set(node, (inDegree.get(node) || 0) + 1);
            }
        }
    }
    for (const [node, degree] of inDegree.entries()) {
        if (degree === 0) {
            queue.push(node);
        }
    }
    while (queue.length > 0) {
        const node = queue.shift();
        result.push(node);
        for (const neighbor of graph.get(node) || []) {
            inDegree.set(neighbor, inDegree.get(neighbor) - 1);
            if (inDegree.get(neighbor) === 0) {
                queue.push(neighbor);
            }
        }
    }
    if (result.length !== inDegree.size) {
        throw new Error('Cyclical dependency detected!');
    }
    return result;
}
Core.getTopologicalSorting = getTopologicalSorting;

/*  Callack for all elements in the sources-array not found in the targets-array */
function handleNotFound(sources, targets, equal, onNotFound, backward) {
    let sidx, slen = sources.length, tidx, tlen = targets.length;
    for (sidx = 0; sidx < slen; sidx++) {
        let source = backward === true ? sources[slen - 1 - sidx] : sources[sidx];
        let found = false;
        for (tidx = 0; tidx < tlen; tidx++) {
            if (typeof equal === 'function' ? equal(source, targets[tidx]) : source === targets[tidx]) {
                found = true;
                break;
            }
        }
        if (!found) {
            try { // TODO: Do we need try/catch here?
                onNotFound(source);
            }
            catch (error) {
                console.error(`Failed calling onNotFound(source): ${error}`);
            }
        }
    }
}
Core.handleNotFound = handleNotFound;

/*  Function and object interface validation */

// This pattern matches on valid javascript identifiers:
// [_$a-zA-Z][_$a-zA-Z0-9]*
// This pattern matches on a comma separated list of valid javascript identifiers:
// [_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*
const attributeMethodRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*$/;
const attributePropertyRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*:\s*([_a-zA-Z0-9]+)\s*$/;
const standardFunctionRegex = /^\s*function\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)/;
const lambdaFunctionRegex = /^\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)\s*=>/;
const lambdaFunctionSingleArgumentRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*=>/;
const classMethodRegex = /^\s*([_$a-zA-Z][_$a-zA-Z0-9]*)\s*\(\s*([_$a-zA-Z][_$a-zA-Z0-9]*(?:\s*,\s*[_$a-zA-Z][_$a-zA-Z0-9]*)*)?\s*\)/;
const argumentRegex = /(?:\s*,\s*)?([_$a-zA-Z][_$a-zA-Z0-9]*)\s*/g;
function getArgumentsArray(argumentsSource) {
    const a = [];
    if (argumentsSource) {
        Regex.each(argumentRegex, argumentsSource, (start, end, match) => a.push(match[1]), true);
    }
    return a;
}
function validateArguments(argumentsSource, expectedArgumentsArray) {
    const actualArgumentsArray = getArgumentsArray(argumentsSource);
    if (expectedArgumentsArray.length !== actualArgumentsArray.length) {
        throw new Error(`invalid number of arguments (expected: ${expectedArgumentsArray.length}, actual: ${actualArgumentsArray.length})`);
    }
    for (let i = 0; i < expectedArgumentsArray.length; i++) {
        if (expectedArgumentsArray[i] !== actualArgumentsArray[i]) {
            throw new Error(`invalid argument (${(i + 1)}) name (expected: '${expectedArgumentsArray[i]}', actual: '${actualArgumentsArray[i]}')`);
        }
    }
}
function validateFunction(functionInstance, expectedArguments, validateMethodArguments) {
    if (functionInstance === undefined) {
        throw new Error('is undefined!');
    } if (functionInstance === null) {
        throw new Error('is null');
    } else if (typeof functionInstance !== 'function') {
        throw new Error('is not a function');
    }
    if (validateMethodArguments !== true) {
        return;
    }
    const functionSource = functionInstance.toString();
    const expectedArgumentsArray = getArgumentsArray(expectedArguments);
    const standardFunctionMatch = standardFunctionRegex.exec(functionSource);
    if (standardFunctionMatch) {
        validateArguments(standardFunctionMatch[1], expectedArgumentsArray);
        return;
    }
    const lambdaFunctionMatch = lambdaFunctionRegex.exec(functionSource);
    if (lambdaFunctionMatch) {
        validateArguments(lambdaFunctionMatch[1], expectedArgumentsArray);
        return;
    }
    const lambdaFunctionSingleArgumentMatch = lambdaFunctionSingleArgumentRegex.exec(functionSource);
    if (lambdaFunctionSingleArgumentMatch) {
        validateArguments(lambdaFunctionSingleArgumentMatch[1], expectedArgumentsArray);
        return;
    }
    const classMethodMatch = classMethodRegex.exec(functionSource);
    if (classMethodMatch) {
        validateArguments(classMethodMatch[2], expectedArgumentsArray);
        return;
    }
    throw new Error(`has no arguments: '${functionSource}'`);
}
Core.validateFunction = validateFunction;

function validateDetail(instanceType, objectInstance, aspect, validateMethodArguments) {
    const methodMatch = attributeMethodRegex.exec(aspect);
    if (methodMatch) {
        const methodName = methodMatch[1];
        try {
            validateFunction(objectInstance[methodName], methodMatch[2], validateMethodArguments)
        } catch (error) {
            throw new Error(`${instanceType} method '${methodName}' ${error.message}`);
        }
        return;
    }
    const propertyMatch = attributePropertyRegex.exec(aspect);
    if (propertyMatch) {
        const propertyName = propertyMatch[1];
        const expectedType = propertyMatch[2];
        const actualPropertyValue = objectInstance[propertyName];
        if (actualPropertyValue === undefined) {
            throw new Error(`${instanceType} has no property '${propertyName}'`);
        } else if (typeof actualPropertyValue !== expectedType) {
            throw new Error(`${instanceType} property '${propertyName}' has invalid type (expected: '${expectedType}', actual: '${(typeof actualPropertyValue)}')`);
        }
        return;
    }
    throw new Error(`Invalid method/property check pattern: '${aspect}'`);
}

function validateAs(instanceType, objectInstance, config, validateMethodArguments) {
    if (objectInstance === undefined) {
        throw new Error(`${instanceType} is undefined!`);
    } if (objectInstance === null) {
        throw new Error(`${instanceType} is null`);
    } else if (typeof objectInstance !== 'object') {
        throw new Error(`${instanceType} is not an object`);
    } else if (typeof config === 'string') {
        validateDetail(instanceType, objectInstance, config, validateMethodArguments);
    } else if (Array.isArray(config)) {
        for (const aspect of config) {
            validateDetail(instanceType, objectInstance, aspect, validateMethodArguments);
        }
    }
    return objectInstance;
}
Core.validateAs = validateAs;

function validateMethod(instanceType, objectInstance, methodName) {
    if (objectInstance === undefined) {
        throw new Error(`${instanceType} is undefined!`);
    } if (objectInstance === null) {
        throw new Error(`${instanceType} is null`);
    } else if (typeof objectInstance !== 'object') {
        throw new Error(`${instanceType} is not an object`);
    } else if (typeof objectInstance[methodName] !== 'function') {
        throw new Error(`${instanceType} method '${methodName}' is not a function`);
    } else {
        return objectInstance;
    }
}
Core.validateMethod = validateMethod;

const OnOffDelayState = Object.freeze({
    Idle: 0,
    On: 1,
    OnTOF: 2,
    Off: 3,
    OffTOF: 4,
    OffFinalTOF: 5,
    Final: 6,
    Disposed: 7
});

class OnOffDelay {
    #timer;
    #onDelay;
    #offDelay;
    #finalDelay;
    #switchedOn;
    #switchedOff;
    #finalized;
    #state;
    constructor() {
        this.#timer = null;
        this.#onDelay = 0;
        this.#offDelay = 0;
        this.#finalDelay = 0;
        this.#switchedOn = null;
        this.#switchedOff = null;
        this.#finalized = null;
        this.#state = OnOffDelayState.Idle;
    }
    set onDelay(value) {
        this.#onDelay = value;
    }
    set offDelay(value) {
        this.#offDelay = value;
    }
    set finalDelay(value) {
        this.#finalDelay = value;
    }
    set switchedOn(value) {
        this.#switchedOn = value;
    }
    set switchedOff(value) {
        this.#switchedOff = value;
    }
    set finalized(value) {
        this.#finalized = value;
    }
    get isOn() {
        switch (this.#state) {
            case OnOffDelayState.On:
            case OnOffDelayState.OnTOF:
                return true;
            default:
                return false;
        }
    }
    switchOn() {
        switch (this.#state) {
            case OnOffDelayState.Idle:
                this.#state = OnOffDelayState.On;
                if (typeof this.#switchedOn === 'function') {
                    this.#switchedOn();
                }
                break;
            case OnOffDelayState.OnTOF:
                clearTimeout(this.#timer);
                this.#timer = null;
                this.#state = OnOffDelayState.On;
                break;
            case OnOffDelayState.Off:
            case OnOffDelayState.OffFinalTOF:
                if (this.#state === OnOffDelayState.OffFinalTOF) {
                    clearTimeout(this.#timer);
                    this.#timer = null;
                }
                if (typeof this.#onDelay === 'number' && this.#onDelay > 0) {
                    this.#state = OnOffDelayState.OffTOF;
                    this.#timer = setTimeout(() => {
                        this.#timer = null;
                        this.#state = OnOffDelayState.On;
                        if (typeof this.#switchedOn === 'function') {
                            this.#switchedOn();
                        }
                    }, this.#onDelay);
                } else {
                    this.#state = OnOffDelayState.On;
                    if (typeof this.#switchedOn === 'function') {
                        this.#switchedOn();
                    }
                }
                break;
            case OnOffDelayState.Disposed:
                throw new Error('On-Off-Delay is disposed');
        }
    }
    switchOff() {
        switch (this.#state) {
            case OnOffDelayState.On:
                if (typeof this.#offDelay === 'number' && this.#offDelay > 0) {
                    this.#state = OnOffDelayState.OnTOF;
                    this.#timer = setTimeout(() => {
                        this.#timer = null;
                        this.#enterOff();
                    }, this.#offDelay);
                } else {
                    this.#enterOff();
                }
                break;
            case OnOffDelayState.OffTOF:
                clearTimeout(this.#timer);
                this.#timer = null;
                this.#state = OnOffDelayState.Off;
                this.#startFinalTimer();
                break;
            case OnOffDelayState.Disposed:
                throw new Error('On-Off-Delay is disposed');
        }
    }
    #enterOff() {
        this.#state = OnOffDelayState.Off;
        if (typeof this.#switchedOff === 'function') {
            this.#switchedOff();
        }
        if (this.#state !== OnOffDelayState.Off) {
            return;
        }
        this.#startFinalTimer();
    }
    #startFinalTimer() {
        if (typeof this.#finalDelay === 'number' && this.#finalDelay > 0) {
            this.#state = OnOffDelayState.OffFinalTOF;
            this.#timer = setTimeout(() => {
                this.#timer = null;
                this.#state = OnOffDelayState.Final;
                if (typeof this.#finalized === 'function') {
                    this.#finalized();
                }
            }, this.#finalDelay);
        } else {
            this.#state = OnOffDelayState.Final;
            if (typeof this.#finalized === 'function') {
                this.#finalized();
            }
        }
    }
    dispose() {
        if (this.#timer !== null) {
            clearTimeout(this.#timer);
            this.#timer = null;
        }
        this.#switchedOn = null;
        this.#switchedOff = null;
        this.#finalized = null;
        this.#state = OnOffDelayState.Disposed;
    }
}

Core.OnOffDelay = OnOffDelay;

Object.freeze(Core);

export default Core;
