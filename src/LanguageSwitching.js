(function (root) {
    "use strict";
    const LanguageSwitching = {};
    const isNodeJS = typeof require === 'function';
    const Executor = isNodeJS ? require('./Executor.js') : root.Executor;
    const Core = isNodeJS ? require('./Core.js') : root.Core;
    const Common = isNodeJS ? require('./Common.js') : root.Common;

    class Handler {
        constructor(cms) {
            this._cms = cms;
            this._languages = cms.GetLanguages();
            this._language = this._languages[0];
            this._dataPoints = {};
            Common.validateAsDataAccessObject(this, true);
        }
        GetType(dataId) {
            return this._dataPoints[dataId] ? Core.DataType.String : Core.DataType.Unknown;
        }
        SubscribeData(dataId, onRefresh) {
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                throw new Error(`Unsupported data id for subscribe: '${dataId}'`);
            } else if (dataPoint.onRefresh !== null) {
                throw new Error(`Data id '${dataId}' is already subscribed`);
            }
            dataPoint.onRefresh = onRefresh;
            onRefresh(dataPoint.value);
        }
        UnsubscribeData(dataId, onRefresh) {
            const dataPoint = this._dataPoints[dataId];
            if (!dataPoint) {
                throw new Error(`Unsupported data id for unsubscribe: '${dataId}'`);
            } else if (dataPoint.onRefresh === null) {
                throw new Error(`Data id '${dataId}' is not subscribed`);
            }
            dataPoint.onRefresh = null;
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
            return this._languages.map(l => l);
        }
        GetLanguage() {
            return this._language;
        }
        IsAvailable(language) {
            return this._languages.indexOf(language) >= 0;
        }
        LoadLanguage(language, onSuccess, onError) {
            const tasks = [];
            let labelValues, htmlValues;
            tasks.push((onSuc, onErr) => this._cms.GetAllLabelValuesForLanguage(language, response => {
                labelValues = response;
                onSuc();
            }, onErr));
            tasks.push((onSuc, onErr) => this._cms.GetAllHtmlValuesForLanguage(language, response => {
                htmlValues = response;
                onSuc();
            }, onErr));
            Executor.run(tasks, () => {
                for (const id in labelValues) {
                    if (labelValues.hasOwnProperty(id)) {
                        let dataPoint = this._dataPoints[id];
                        if (!dataPoint) {
                            dataPoint = this._dataPoints[id] = { onRefresh: null };
                        }
                        dataPoint.value = labelValues[id];
                    }
                }
                for (const id in htmlValues) {
                    if (htmlValues.hasOwnProperty(id)) {
                        let dataPoint = this._dataPoints[id];
                        if (!dataPoint) {
                            dataPoint = this._dataPoints[id] = { onRefresh: null };
                        }
                        dataPoint.value = htmlValues[id];
                    }
                }
                for (const id in this._dataPoints) {
                    if (this._dataPoints.hasOwnProperty(id) && labelValues[id] === undefined && htmlValues[id] === undefined) {
                        delete this._dataPoints[id];
                    }
                }
                this._language = language;
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
