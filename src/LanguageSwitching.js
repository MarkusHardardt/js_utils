(function (root) {
    "use strict";
    const LanguageSwitching = {};
    const isNodeJS = typeof require === 'function';
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;
    const ContentManager = isNodeJS ? require('./ContentManager.js') : root.ContentManager;

    class Handler {
        constructor(cms) {
            this._cms = cms;
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
            this._onError('onLanguageChanged(language) is not subscribed');
        }
        GetType(dataId) {
            return this._isValidHTMLType(dataId) ? Core.DataType.HTML : Core.DataType.String;
        }
        SubscribeData(dataId, onRefresh) {
            if (typeof dataId !== 'string') {
                throw new Error(`Invalid subscription dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`onRefresh(value) subscription callback for dataId '${dataId}' is not a function`);
            }
            // Use existing or create new data point, set callback and call callback passing value.
            // Write errors to output.
            let dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                throw new Error(`Data point '${dataId}' is not available to subscribe`);
            } else if (dataPoint.onRefresh !== null) {
                this._onError(`Data id '${dataId}' is already subscribed`);
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
                throw new Error(`Invalid unsubscription dataId '${dataId}'`);
            } else if (typeof onRefresh !== 'function') {
                throw new Error(`onRefresh(value) unsubscription callback for dataId '${dataId}' is not a function`);
            }
            // If data point available reset the callback.
            // If data id unknown delete data point.
            // Write errors to output.
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                throw new Error(`Data point '${dataId}' is not available to unsubscribe`);
            } else if (dataPoint.onRefresh === null) {
                this._onError(`Data id '${dataId}' is not subscribed`);
            } else if (dataPoint.onRefresh !== onRefresh) {
                this._onError(`Data id '${dataId}' is subscribed with a different callback`);
            } else {
                dataPoint.onRefresh = null;
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
                // Check all data points and if not available as label or html value than delete
                for (const dataId in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(dataId) && values[dataId] === undefined) {
                        delete this._dataPoints[dataId];
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
