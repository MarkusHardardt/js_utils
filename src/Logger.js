(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;

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
            for (const levelName in Logger.Level) {
                if (Logger.Level.hasOwnProperty(levelName)) {
                    const levelNumber = Logger.Level[levelName];
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

        static #globalLevel = Logger.Level.WARN;
        static #transports = [];

        // Default transport → console
        static {
            Logger.addTransport(entry => {
                const { level, formattedArgs } = entry;
                if (level <= Logger.Level.ERROR) {
                    console.error(...formattedArgs);
                } else if (level <= Logger.Level.WARN) {
                    console.warn(...formattedArgs);
                } else if (level <= Logger.Level.INFO) {
                    console.info(...formattedArgs);
                } else {
                    console.log(...formattedArgs);
                }
            });
        }

        // ─────────────────────────────
        // Static API
        // ─────────────────────────────
        static setLevel(level) {
            this.#globalLevel = Logger.getLevel(level, Logger.Level.TRACE);
        }

        static addTransport(fn) {
            this.#transports.push(fn);
        }

        static clearTransports() {
            this.#transports = [];
        }

        static child(context) {
            return new Logger(context);
        }

        // ─────────────────────────────
        // Instance
        // ─────────────────────────────
        #context;
        #level;

        constructor(context = 'App', level = null) {
            this.#context = context;
            this.#level = Logger.getLevel(level);
            Common.validateAsLogger(this, true);
        }

        setLevel(level) {
            this.#level = Logger.getLevel(level);
        }

        // ─────────────────────────────
        // Core Logging Method
        // ─────────────────────────────
        #log(level, args) {
            const effectiveLevel = this.#level ?? Logger.#globalLevel;
            if (level <= effectiveLevel) {
                const timestamp = new Date().toISOString();
                const levelName = Logger.LevelName[level];
                let symbol;
                if (level <= Logger.Level.ERROR) {
                    symbol = '❌';
                } else if (level <= Logger.Level.WARN) {
                    symbol = '⚠️';
                } else if (level <= Logger.Level.INFO) {
                    symbol = 'ℹ️';
                } else {
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
                for (const transport of Logger.#transports) {
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
            } else {
                const color = this.#colorForLevel(level);
                return [`%c${prefix}`, `color: ${color}; font-weight: bold`, ...args];
            }
        }

        #colorForLevel(level) {
            switch (level) {
                case Logger.Level.FATAL: return 'darkred';
                case Logger.Level.ERROR: return 'red';
                case Logger.Level.WARN: return 'orange';
                case Logger.Level.INFO: return 'green';
                case Logger.Level.DEBUG: return 'blue';
                case Logger.Level.TRACE: return 'gray';
                default: return 'black';
            }
        }

        #ansiColor(level) {
            switch (level) {
                case Logger.Level.FATAL: return '\x1b[41m';
                case Logger.Level.ERROR: return '\x1b[31m';
                case Logger.Level.WARN: return '\x1b[33m';
                case Logger.Level.INFO: return '\x1b[32m';
                case Logger.Level.DEBUG: return '\x1b[34m';
                case Logger.Level.TRACE: return '\x1b[90m';
                default: return '';
            }
        }

        // ─────────────────────────────
        // Public Logging Methods
        // ─────────────────────────────
        fatal(...args) {
            this.#log(Logger.Level.FATAL, args);
        }

        error(...args) {
            this.#log(Logger.Level.ERROR, args);
        }

        warn(...args) {
            this.#log(Logger.Level.WARN, args);
        }

        info(...args) {
            this.#log(Logger.Level.INFO, args);
        }

        debug(...args) {
            this.#log(Logger.Level.DEBUG, args);
        }

        trace(...args) {
            this.#log(Logger.Level.TRACE, args);
        }
    }

    if (isNodeJS) {
        module.exports = Logger;
    } else {
        root.Logger = Logger;
    }
}(globalThis));
