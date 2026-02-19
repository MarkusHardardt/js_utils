(function (root) {
    "use strict";
    const LanguageSwitching = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;

    const DEFAULT_VALUE_FOR_NOT_EXISTS = '???';

    class Handler {
        #logger;
        #cms;
        #isValidLabelType;
        #isValidHTMLType;
        #languages;
        #language;
        #dataPoints;
        #languageObservers;
        constructor(logger, cms) {
            this.#logger = Common.validateAsLogger(logger, true);
            this.#cms = cms;
            this.#isValidLabelType = cms.getIdValidTestFunctionForType(ContentManager.DataType.Label);
            this.#isValidHTMLType = cms.getIdValidTestFunctionForType(ContentManager.DataType.HTML);
            this.#languages = cms.getLanguages();
            this.#language = this.#languages[0];
            this.#dataPoints = {};
            this.#languageObservers = [];
            Common.validateAsDataAccessObject(this, true);
        }

        addLanguageObserver(onLanguageChanged) {
            if (typeof onLanguageChanged !== 'function') {
                throw new Error('onLanguageChanged(language) is not a function');
            }
            for (const observer of this.#languageObservers) {
                if (onLanguageChanged === observer) {
                    this.#logger.warn('Callback onLanguageChanged(language) is already observed');
                    return;
                }
            }
            this.#languageObservers.push(onLanguageChanged);
        }

        removeLanguageObserver(onLanguageChanged) {
            if (typeof onLanguageChanged !== 'function') {
                throw new Error('Callback for onLanguageChanged(language) is not a function');
            }
            for (let i = 0; i < this.#languageObservers.length; i++) {
                if (this.#languageObservers[i] === onLanguageChanged) {
                    this.#languageObservers.splice(i, 1);
                    return;
                }
            }
            this.#logger.warn('Callback onLanguageChanged(language) is not observed');
        }

        getType(dataId) {
            if (this.#isValidLabelType(dataId)) {
                return Core.DataType.String;
            } else if (this.#isValidHTMLType(dataId)) {
                return Core.DataType.HTML;
            } else {
                return Core.DataType.Unknown;
            }
        }

        registerObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`Observer onRefresh(value) for id '${dataId}' is not a function`);
            }
            let dataPoint = this.#dataPoints[dataId];
            if (!dataPoint) {
                // If no data point is available, we create a new one but mark it as non-existent.
                // If the corresponding data point is added to the database later, the already existing callback will be called from then on automatically.
                dataPoint = this.#dataPoints[dataId] = { exists: false, value: DEFAULT_VALUE_FOR_NOT_EXISTS };
            } else if (dataPoint.onRefresh === onRefresh) {
                this.#logger.warn(`Data id '${dataId}' is already observed with this callback`);
            } else if (dataPoint.onRefresh !== null) {
                this.#logger.warn(`Data id '${dataId}' is already observed with another callback`);
            }
            dataPoint.onRefresh = onRefresh;
            try {
                onRefresh(dataPoint.value);
            } catch (error) {
                throw new Error(`Failed calling onRefresh(value) for '${dataId}':\n${error.message}`);
            }
        }

        unregisterObserver(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`Observer onRefresh(value) for id '${dataId}' is not a function`);
            }
            const dataPoint = this.#dataPoints[dataId];
            if (!dataPoint) {
                this.#logger.error(`Language value with id '${dataId}' is not available to unsubscribe`);
                return;
            } else if (dataPoint.onRefresh === null) {
                this.#logger.warn(`Language value with id '${dataId}' is not observed`);
            } else if (dataPoint.onRefresh !== onRefresh) {
                this.#logger.warn(`Language value with id '${dataId}' is observed with a another callback`);
            }
            dataPoint.onRefresh = null;
            if (!dataPoint.exists) {
                delete this.#dataPoints[dataId];
            }
        }

        read(dataId, onResponse, onError) {
            const dataPoint = this.#dataPoints[dataId];
            if (!dataPoint) {
                onError(`Unsupported data id for read: '${dataId}'`);
            } else {
                onResponse(dataPoint.value);
            }
        }

        write(dataId, value) {
            throw new Error(`write to data with id '${dataId}' is not supported`);
        }

        getLanguages() {
            return this.#languages.map(lang => lang);
        }

        getLanguage() {
            return this.#language;
        }

        isAvailable(language) {
            return this.#languages.indexOf(language) >= 0;
        }

        loadLanguage(language, onSuccess, onError) {
            // Load all label and html values
            this.#cms.getAllForLanguage(language, values => {
                this.#language = language;
                // Use existing or create new data point and store value.
                for (const dataId in values) {
                    if (values.hasOwnProperty(dataId)) {
                        let dataPoint = this.#dataPoints[dataId];
                        if (!dataPoint) {
                            dataPoint = this.#dataPoints[dataId] = { onRefresh: null };
                        }
                        dataPoint.value = values[dataId];
                    }
                }
                // Check all data points and if not available as label or html value and also not observed than delete
                for (const dataId in this.#dataPoints) {
                    if (this.#dataPoints.hasOwnProperty(dataId)) {
                        const dataPoint = this.#dataPoints[dataId];
                        dataPoint.exists = values[dataId] !== undefined;
                        if (!dataPoint.exists) {
                            if (!dataPoint.onRefresh) {
                                delete this.#dataPoints[dataId];
                            } else {
                                dataPoint.value = DEFAULT_VALUE_FOR_NOT_EXISTS;
                            }
                        }
                    }
                }
                // After loaded notify subscribers
                for (const dataId in this.#dataPoints) {
                    if (this.#dataPoints.hasOwnProperty(dataId)) {
                        const dataPoint = this.#dataPoints[dataId];
                        if (dataPoint.onRefresh) {
                            try {
                                dataPoint.onRefresh(dataPoint.value);
                            } catch (error) {
                                this.#logger.error(`Failed calling onRefresh(value) for data id '${dataId}'`, error);
                            }
                        }
                    }
                }
                for (const observer of this.#languageObservers) {
                    try {
                        observer(language);
                    } catch (error) {
                        this.#logger.error(`Failed calling onLanguageChanged('${language}')`, error);
                    }
                }
                onSuccess();
            }, onError)
        }
    }
    LanguageSwitching.getInstance = (logger, cms) => new Handler(logger, cms);

    Object.freeze(LanguageSwitching);
    if (isNodeJS) {
        module.exports = LanguageSwitching;
    } else {
        root.LanguageSwitching = LanguageSwitching;
    }
}(globalThis));
