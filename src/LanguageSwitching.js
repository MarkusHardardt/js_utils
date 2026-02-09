(function (root) {
    "use strict";
    const LanguageSwitching = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;

    const DEFAULT_VALUE_FOR_NOT_EXISTS = '???';

    class Handler {
        constructor(cms) {
            this._cms = cms;
            this._isValidLabelType = cms.GetIdValidTestFunctionForType(ContentManager.DataType.Label);
            this._isValidHTMLType = cms.GetIdValidTestFunctionForType(ContentManager.DataType.HTML);
            this._languages = cms.GetLanguages();
            this._language = this._languages[0];
            this._onError = Core.defaultOnError;
            this._dataPoints = {};
            this._observers = [];
            Common.validateAsDataAccessObject(this, true);
        }

        set OnError(value) {
            if (typeof value !== 'function') {
                throw new Error('Set value for OnError(error) is not a function');
            }
            this._onError = value;
        }

        SubscribeLanguage(onLanguageChanged) {
            if (typeof onLanguageChanged !== 'function') {
                throw new Error('onLanguageChanged(language) is not a function');
            }
            for (const observer of this._observers) {
                if (onLanguageChanged === observer) {
                    this._onError('Callback onLanguageChanged(language) is already subscribed');
                    return;
                }
            }
            this._observers.push(onLanguageChanged);
        }

        UnsubscribeLanguage(onLanguageChanged) {
            if (typeof onLanguageChanged !== 'function') {
                throw new Error('Callback for onLanguageChanged(language) is not a function');
            }
            for (let i = 0; i < this._observers.length; i++) {
                if (this._observers[i] === onLanguageChanged) {
                    this._observers.splice(i, 1);
                    return;
                }
            }
            this._onError('Callback onLanguageChanged(language) is not subscribed');
        }

        GetType(dataId) {
            if (this._isValidLabelType(dataId)) {
                return Core.DataType.String;
            } else if (this._isValidHTMLType(dataId)) {
                return Core.DataType.HTML;
            } else {
                return Core.DataType.Unknown;
            }
        }

        SubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`Subscription callback onRefresh(value) for id '${dataId}' is not a function`);
            }
            let dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                // If no data point is available, we create a new one but mark it as non-existent.
                // If the corresponding data point is added to the database later, the already existing callback will be called from then on automatically.
                dataPoint = this._dataPoints[dataId] = { exists: false, value: DEFAULT_VALUE_FOR_NOT_EXISTS };
            } else if (dataPoint.onRefresh === onRefresh) {
                this._onError(`Data id '${dataId}' is already subscribed with this callback`);
            } else if (dataPoint.onRefresh !== null) {
                this._onError(`Data id '${dataId}' is already subscribed with another callback`);
            }
            dataPoint.onRefresh = onRefresh;
            try {
                onRefresh(dataPoint.value);
            } catch (error) {
                throw new Error(`Failed calling onRefresh(value) for '${dataId}':\n${error.message}`);
            }
        }

        UnsubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid unsubscription id '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`Unsubscription callback onRefresh(value) for id '${dataId}' is not a function`);
            }
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                this._onError(`Language value with id '${dataId}' is not available to unsubscribe`);
                return;
            } else if (dataPoint.onRefresh === null) {
                this._onError(`Language value with id '${dataId}' is not subscribed`);
            } else if (dataPoint.onRefresh !== onRefresh) {
                this._onError(`Language value with id '${dataId}' is subscribed with a another callback`);
            }
            dataPoint.onRefresh = null;
            if (!dataPoint.exists) {
                delete this._dataPoints[dataId];
            }
        }

        Read(dataId, onResponse, onError) {
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                onError(`Unsupported data id for read: '${dataId}'`);
            } else {
                onResponse(dataPoint.value);
            }
        }

        Write(dataId, value) {
            throw new Error(`Write to data with id '${dataId}' is not supported`);
        }

        GetLanguages() {
            return this._languages.map(lang => lang);
        }

        GetLanguage() {
            return this._language;
        }

        IsAvailable(language) {
            return this._languages.indexOf(language) >= 0;
        }

        LoadLanguage(language, onSuccess, onError) {
            // Load all label and html values
            this._cms.GetAllForLanguage(language, values => {
                this._language = language;
                // Use existing or create new data point and store value.
                for (const dataId in values) {
                    if (values.hasOwnProperty(dataId)) {
                        let dataPoint = this._dataPoints[dataId];
                        if (!dataPoint) {
                            dataPoint = this._dataPoints[dataId] = { onRefresh: null };
                        }
                        dataPoint.value = values[dataId];
                    }
                }
                // Check all data points and if not available as label or html value and also not subscribed than delete
                for (const dataId in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(dataId)) {
                        const dataPoint = this._dataPoints[dataId];
                        dataPoint.exists = values[dataId] !== undefined;
                        if (!dataPoint.exists) {
                            if (!dataPoint.onRefresh) {
                                delete this._dataPoints[dataId];
                            } else {
                                dataPoint.value = DEFAULT_VALUE_FOR_NOT_EXISTS;
                            }
                        }
                    }
                }
                // After loaded notify subscribers
                for (const dataId in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(dataId)) {
                        const dataPoint = this._dataPoints[dataId];
                        if (dataPoint.onRefresh) {
                            try {
                                dataPoint.onRefresh(dataPoint.value);
                            } catch (error) {
                                this._onError(`Failed calling onRefresh(value) for data id '${dataId}':\n${error.message}`);
                            }
                        }
                    }
                }
                for (const observer of this._observers) {
                    try {
                        observer(language);
                    } catch (error) {
                        this._onError(`Failed calling onLanguageChanged('${language}'):\n${error.message}`);
                    }
                }
                onSuccess();
            }, onError)
        }
    }
    LanguageSwitching.getInstance = cms => new Handler(cms);

    Object.freeze(LanguageSwitching);
    if (isNodeJS) {
        module.exports = LanguageSwitching;
    } else {
        root.LanguageSwitching = LanguageSwitching;
    }
}(globalThis));
