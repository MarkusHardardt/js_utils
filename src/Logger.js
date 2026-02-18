(function (root) {
    "use strict";
    const isNodeJS = typeof require === 'function';
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Logger {
        // ─────────────────────────────
        // Log Levels
        // ─────────────────────────────

        static Level = Object.freeze({
            Off: 0,
            trace: 1,
            debug: 2,
            info: 3,
            warn: 4,
            Error: 5,
            Fatal: 6
        });

        static LevelName = Object.freeze({
            1: 'trace',
            2: 'debug',
            3: 'info',
            4: 'warn',
            5: 'Error',
            6: 'Fatal'
        });

        static #globalLevel = Logger.Level.trace; // TODO: Reuse Logger.Level.warn;
        static #transports = [];

        // Default transport → console
        static {
            Logger.AddTransport(entry => {
                const { level, formattedArgs } = entry;
                if (level >= Logger.Level.Error) {
                    console.error(...formattedArgs);
                } else if (level >= Logger.Level.warn) {
                    console.warn(...formattedArgs);
                } else {
                    console.log(...formattedArgs);
                }
            });
        }

        // ─────────────────────────────
        // Static API
        // ─────────────────────────────

        static setLevel(level) {
            this.#globalLevel = level;
        }

        static AddTransport(fn) {
            this.#transports.push(fn);
        }

        static ClearTransports() {
            this.#transports = [];
        }

        static Child(context) {
            return new Logger(context);
        }

        // ─────────────────────────────
        // Instance
        // ─────────────────────────────

        #context;
        #level;

        constructor(context = 'App', level = null) {
            this.#context = context;
            this.#level = level;
            Common.validateAsLogger(this, true);
        }

        setLevel(level) {
            this.#level = level;
        }

        // ─────────────────────────────
        // Core Logging Method
        // ─────────────────────────────

        #log(level, args) {
            const effectiveLevel = this.#level ?? Logger.#globalLevel;
            if (level < effectiveLevel) return;

            const timestamp = new Date().toISOString();
            const levelName = Logger.LevelName[level];
            const prefix = `[${timestamp}] [${levelName}] [${this.#context}]`;

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
                case Logger.Level.trace: return 'gray';
                case Logger.Level.debug: return 'blue';
                case Logger.Level.info: return 'green';
                case Logger.Level.warn: return 'orange';
                case Logger.Level.Error: return 'red';
                case Logger.Level.Fatal: return 'darkred';
                default: return 'black';
            }
        }

        #ansiColor(level) {
            switch (level) {
                case Logger.Level.trace: return '\x1b[90m';
                case Logger.Level.debug: return '\x1b[34m';
                case Logger.Level.info: return '\x1b[32m';
                case Logger.Level.warn: return '\x1b[33m';
                case Logger.Level.Error: return '\x1b[31m';
                case Logger.Level.Fatal: return '\x1b[41m';
                default: return '';
            }
        }

        // ─────────────────────────────
        // Public Logging Methods
        // ─────────────────────────────
        trace(...args) {
            this.#log(Logger.Level.trace, args);
        }

        debug(...args) {
            this.#log(Logger.Level.debug, args);
        }

        info(...args) {
            this.#log(Logger.Level.info, args);
        }

        warn(...args) {
            this.#log(Logger.Level.warn, args);
        }

        Error(...args) {
            this.#log(Logger.Level.Error, args);
        }

        Fatal(...args) {
            this.#log(Logger.Level.Fatal, args);
        }
    }

    if (isNodeJS) {
        module.exports = Logger;
    } else {
        root.Logger = Logger;
    }
}(globalThis));
