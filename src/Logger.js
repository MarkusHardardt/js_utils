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
            Trace: 1,
            Debug: 2,
            Info: 3,
            Warn: 4,
            Error: 5,
            Fatal: 6
        });

        static LevelName = Object.freeze({
            1: 'Trace',
            2: 'Debug',
            3: 'Info',
            4: 'Warn',
            5: 'Error',
            6: 'Fatal'
        });

        static #globalLevel = Logger.Level.Info;
        static #transports = [];

        // Default transport → console
        static {
            Logger.AddTransport(entry => {
                const { level, formattedArgs } = entry;
                if (level >= Logger.Level.Error) {
                    console.error(...formattedArgs);
                } else if (level >= Logger.Level.Warn) {
                    console.warn(...formattedArgs);
                } else {
                    console.log(...formattedArgs);
                }
            });
        }

        // ─────────────────────────────
        // Static API
        // ─────────────────────────────

        static SetLevel(level) {
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

        SetLevel(level) {
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
                case Logger.Level.Trace: return 'gray';
                case Logger.Level.Debug: return 'blue';
                case Logger.Level.Info: return 'green';
                case Logger.Level.Warn: return 'orange';
                case Logger.Level.Error: return 'red';
                case Logger.Level.Fatal: return 'darkred';
                default: return 'black';
            }
        }

        #ansiColor(level) {
            switch (level) {
                case Logger.Level.Trace: return '\x1b[90m';
                case Logger.Level.Debug: return '\x1b[34m';
                case Logger.Level.Info: return '\x1b[32m';
                case Logger.Level.Warn: return '\x1b[33m';
                case Logger.Level.Error: return '\x1b[31m';
                case Logger.Level.Fatal: return '\x1b[41m';
                default: return '';
            }
        }

        // ─────────────────────────────
        // Public Logging Methods
        // ─────────────────────────────
        Trace(...args) {
            this.#log(Logger.Level.Trace, args);
        }

        Debug(...args) {
            this.#log(Logger.Level.Debug, args);
        }

        Info(...args) {
            this.#log(Logger.Level.Info, args);
        }

        Warn(...args) {
            this.#log(Logger.Level.Warn, args);
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
