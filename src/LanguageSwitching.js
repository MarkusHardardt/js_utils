(function (root) {
    "use strict";
    const LanguageSwitching = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;

    class Handler { // TODO: Add onLanguageChanged(language) listener support
        constructor(cms) {
            this._cms = cms;
            this._isValidHTMLType = cms.GetIdValidTestFunctionForType(ContentManager.DataType.HTML);
            this._languages = cms.GetLanguages();
            this._language = this._languages[0];
            this._onError = Core.defaultOnError;
            this._values = null;
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
                    throw new Error('Callback onLanguageChanged(language) is already subscribed');
                }
            }
            this._observers.push(onLanguageChanged);
        }
        UnsubscribeLanguage(onLanguageChanged) {
            if (typeof onLanguageChanged !== 'function') {
                throw new Error('Value for onLanguageChanged(language) is not a function');
            }
            for (let i = 0; i < this._observers.length; i++) {
                if (this._observers[i] === onLanguageChanged) {
                    this._observers.splice(i, 1);
                    return;
                }
            }
            this._onError('onLanguageChanged() is not subscribed');
        }
        GetType(dataId) {
            return this._isValidHTMLType(dataId) ? Core.DataType.HTML : Core.DataType.String;
        }
        SubscribeData(dataId, onRefresh) {
            // Use existing or create new data point, set callback and call callback passing value.
            // Write errors to output.
            let dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                dataPoint = this._dataPoints[dataId] = { onRefresh: null, value: null };
            } else if (dataPoint.onRefresh !== null) {
                this._onError(`Data id '${dataId}' is already subscribed`);
            }
            dataPoint.onRefresh = onRefresh;
            try {
                onRefresh(dataPoint.value);
            } catch (error) {
                this._onError(`Failed calling onRefresh(value) for data id '${dataId}': ${error}`);
            }
        }
        UnsubscribeData(dataId, onRefresh) {
            // If data point available reset the callback.
            // If data id unknown delete data point.
            // Write errors to output.
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                this._onError(`Unsupported data id for unsubscribe: '${dataId}'`);
            } else if (dataPoint.onRefresh === null) {
                this._onError(`Data id '${dataId}' is not subscribed`);
            } else if (dataPoint.onRefresh !== onRefresh) {
                this._onError(`Data id '${dataId}' is subscribed with a different callback`);
            } else {
                dataPoint.onRefresh = null;
                if (this._values === null || this._values[dataId] === undefined) {
                    delete this._dataPoints[dataId];
                }
            }
        }
        Read(dataId, onResponse, onError) {
            const dataPoint = this._dataPoints[dataId];
            if (dataPoint) {
                onResponse(dataPoint.value);
            } else {
                onError(`Unsupported data id for read: '${dataId}'`);
            }
        }
        Write(dataId, value) {
            this._onError(`Write to data with id '${dataId}' is not supported`);
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
            const tasks = [];
            // Load label and html values and store.
            // Use existing or create new data point and store value.
            tasks.push((onSuc, onErr) => this._cms.GetAllForLanguage(language, values => {
                this._values = values;
                for (const dataId in values) {
                    if (values.hasOwnProperty(dataId)) {
                        let dataPoint = this._dataPoints[dataId];
                        if (!dataPoint) {
                            dataPoint = this._dataPoints[dataId] = { onRefresh: null };
                        }
                        dataPoint.value = values[dataId];
                    }
                }
                onSuc();
            }, onErr));
            // Check all data points and if not subscribed and not available as label or html value than delete.
            tasks.push((onSuc, onErr) => {
                for (const dataId in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(dataId) && this._dataPoints[dataId].onRefresh === null && this._values[dataId] === undefined) {
                        delete this._dataPoints[dataId];
                    }
                }
                onSuc();
            });
            // After loaded notify subscribers
            Executor.run(tasks, () => {
                this._language = language;
                for (const dataId in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(dataId)) {
                        const dataPoint = this._dataPoints[dataId];
                        if (dataPoint.onRefresh) {
                            try {
                                dataPoint.onRefresh(dataPoint.value);
                            } catch (error) {
                                this._onError(`Failed calling onRefresh(value) for data id '${dataId}': ${error}`);
                            }
                        }
                    }
                }
                for (const observer of this._observers) {
                    try {
                        observer(language);
                    } catch (error) {
                        this._onError(`Failed calling onLanguageChanged('${language}'): ${error}`);
                    }
                }
                onSuccess();
            }, onError);
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
