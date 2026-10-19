var _a;
import Common from './Common.js';
const isNodeJS = typeof process !== 'undefined' && Boolean(process.versions?.node);
class Logger {
    // ─────────────────────────────
    // Log Levels
    // ─────────────────────────────
    static Level = Object.freeze({
        FATAL: 1,
        ERROR: 2,
        WARN: 3,
        INFO: 4,
        DEBUG: 5,
        TRACE: 6,
        OFF: 99
    });
    static getLevel(value, defaultLevel = null) {
        for (const levelName in _a.Level) {
            if (_a.Level.hasOwnProperty(levelName)) {
                const levelNumber = _a.Level[levelName];
                if (value === levelNumber || value === levelName) {
                    return levelNumber;
                }
            }
        }
        return defaultLevel;
    }
    static LevelName = Object.freeze({
        1: 'FATAL',
        2: 'ERROR',
        3: 'WARN',
        4: 'INFO',
        5: 'DEBUG',
        6: 'TRACE'
    });
    static #globalLevel;
    static #transports = [];
    // Default transport → console
    static {
        this.#globalLevel = this.Level.WARN;
        this.addTransport(entry => {
            const { level, formattedArgs } = entry;
            if (level <= this.Level.ERROR) {
                console.error(...formattedArgs);
            }
            else if (level <= this.Level.WARN) {
                console.warn(...formattedArgs);
            }
            else if (level <= this.Level.INFO) {
                console.info(...formattedArgs);
            }
            else {
                console.log(...formattedArgs);
            }
        });
    }
    // ─────────────────────────────
    // Static API
    // ─────────────────────────────
    static setLevel(level) {
        this.#globalLevel = _a.getLevel(level, _a.Level.TRACE);
    }
    static addTransport(fn) {
        this.#transports.push(fn);
    }
    static clearTransports() {
        this.#transports = [];
    }
    static child(context) {
        return new _a(context);
    }
    // ─────────────────────────────
    // Instance
    // ─────────────────────────────
    #context;
    #level;
    constructor(context = 'App', level = null) {
        this.#context = context;
        this.#level = _a.getLevel(level);
        Common.validateAsLogger(this, true);
    }
    setLevel(level) {
        this.#level = _a.getLevel(level);
    }
    // ─────────────────────────────
    // Core Logging Method
    // ─────────────────────────────
    #log(level, args) {
        const effectiveLevel = this.#level ?? _a.#globalLevel;
        if (level <= effectiveLevel) {
            const timestamp = new Date().toISOString();
            const levelName = _a.LevelName[level];
            let symbol;
            if (level <= _a.Level.ERROR) {
                symbol = '❌';
            }
            else if (level <= _a.Level.WARN) {
                symbol = '⚠️';
            }
            else if (level <= _a.Level.INFO) {
                symbol = 'ℹ️';
            }
            else {
                symbol = '★';
            }
            const prefix = `${symbol}[${timestamp}] [${levelName}] [${this.#context}]`;
            const formattedArgs = this.#format(prefix, level, args);
            const entry = {
                timestamp,
                level,
                levelName,
                context: this.#context,
                args,
                formattedArgs,
            };
            for (const transport of _a.#transports) {
                transport(entry);
            }
        }
    }
    // ─────────────────────────────
    // Formatting
    // ─────────────────────────────
    #format(prefix, level, args) {
        if (isNodeJS) {
            // Node.js ANSI colors
            const color = this.#ansiColor(level);
            const reset = '\x1b[0m';
            return [`${color}${prefix}${reset}`, ...args];
        }
        else {
            const color = this.#colorForLevel(level);
            return [`%c${prefix}`, `color: ${color}; font-weight: bold`, ...args];
        }
    }
    #colorForLevel(level) {
        switch (level) {
            case _a.Level.FATAL: return 'darkred';
            case _a.Level.ERROR: return 'red';
            case _a.Level.WARN: return 'orange';
            case _a.Level.INFO: return 'green';
            case _a.Level.DEBUG: return 'blue';
            case _a.Level.TRACE: return 'gray';
            default: return 'black';
        }
    }
    #ansiColor(level) {
        switch (level) {
            case _a.Level.FATAL: return '\x1b[41m';
            case _a.Level.ERROR: return '\x1b[31m';
            case _a.Level.WARN: return '\x1b[33m';
            case _a.Level.INFO: return '\x1b[32m';
            case _a.Level.DEBUG: return '\x1b[34m';
            case _a.Level.TRACE: return '\x1b[90m';
            default: return '';
        }
    }
    // ─────────────────────────────
    // Public Logging Methods
    // ─────────────────────────────
    fatal(...args) {
        this.#log(_a.Level.FATAL, args);
    }
    error(...args) {
        this.#log(_a.Level.ERROR, args);
    }
    warn(...args) {
        this.#log(_a.Level.WARN, args);
    }
    info(...args) {
        this.#log(_a.Level.INFO, args);
    }
    debug(...args) {
        this.#log(_a.Level.DEBUG, args);
    }
    trace(...args) {
        this.#log(_a.Level.TRACE, args);
    }
}
_a = Logger;
export default Logger;
