(function (root) {
    "use strict";
    const Client = {};
    const isNodeJS = typeof require === 'function';
    Client.GET_CLIENT_CONFIG = '/get_client_config';
    Client.HANDLE_REQUEST = '/handle_request';

    if (!isNodeJS) {
        // polyfill for requestAnimationFrame (by Opera engineer Erik Möller)
        (function () {
            var lastTime = 0;
            var vendors = ['webkit', 'moz'];
            for (var x = 0; x < vendors.length && !root.requestAnimationFrame; ++x) {
                root.requestAnimationFrame = root[vendors[x] + 'RequestAnimationFrame'];
                root.cancelAnimationFrame = root[vendors[x] + 'CancelAnimationFrame'] || root[vendors[x] + 'CancelRequestAnimationFrame'];
            }
            if (!root.requestAnimationFrame) {
                root.requestAnimationFrame = (callback, element) => {
                    var currTime = new Date().getTime();
                    var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                    var id = root.setTimeout(() => {
                        callback(currTime + timeToCall);
                    }, timeToCall);
                    lastTime = currTime + timeToCall;
                    return id;
                };
            }
            if (!root.cancelAnimationFrame) {
                root.cancelAnimationFrame = timeout => {
                    clearTimeout(timeout);
                };
            }
        }());

        Client.breakpoint = () => {
            console.log('breakpoint');
        }

        /*  refresh cycle  */
        let refreshCycleEnabled = false;
        function startRefreshCycle(requestAnimationFrameCycle, onRefresh) {
            refreshCycleEnabled = typeof requestAnimationFrameCycle === 'number' && requestAnimationFrameCycle > 0;
            if (refreshCycleEnabled) {
                let raf_idx = 0;
                const loop = () => {
                    if (!refreshCycleEnabled) {
                        return;
                    }
                    raf_idx++;
                    if (raf_idx >= requestAnimationFrameCycle) {
                        raf_idx = 0;
                        onRefresh();
                    }
                    root.requestAnimationFrame(loop, document.body);
                };
                // start the loop
                root.requestAnimationFrame(loop, document.body);
            }
            return refreshCycleEnabled;
        }
        Client.startRefreshCycle = startRefreshCycle;
        Client.stopRefreshCycle = () => refreshCycleEnabled = false;

        /** Fetch text by 'POST'
         * This function sends the passed request string unchanged and returns the resulting response string anchanged via callback.
         * @param {string} url - The url string
         * @param {string} requestString - The request formatted as string (will be send unchanged)
         * @param {Function} onResponse - Callback for response - resulting unchanged string will be passed as argument
         * @param {Function} onError - Callback for error event - occurred error will be passed as argument
         */
        async function fetchAsync(url, requestString, onResponse, onError) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestString !== undefined && requestString !== null ? requestString : undefined
            });
            if (!response.ok) {
                onError(`Fetch for url '${url}' failed: ${response.status}, ${response.statusText}`);
            } else {
                const result = await response.text();
                onResponse(result)
            }
        }
        Client.fetchAsync = fetchAsync;
        Client.fetch = (url, requestString, onResponse, onError) => { (async () => await fetchAsync(url, requestString, onResponse, onError))(); }

        /** Fetch object by 'POST'
         * This function transformes the passed request object by using JsonFX.stringify(request, false) and 
         * returns the resulting response as object using JsonFX.parse(response, false, false) via callback.
         * If the response object contains the attribute 'error' the 'onError' callback will be called.
         * Therwise the attribute 'result' will be passed via 'onResponse' callback argument.
         * @param {string} url - The url string
         * @param {object} request - Request object - will be transformed to string by JsonFX.stringify(request, false)
         * @param {Function} onResponse - Callback for response for success
         * @param {Function} onError - Callback for error event - occurred error will be passed as argument - 
         * the reason can be connection errors during fetch or application errors passed as error property.
         */
        function fetchJsonFX(url, request, onResponse, onError) {
            Client.fetch(url, JsonFX.stringify(request, false), response => {
                if (response.length > 0) {
                    try {
                        const resp = JsonFX.parse(response, false, false);
                        if (resp.error !== undefined) {
                            onError(resp.error);
                        } else {
                            onResponse(resp.result);
                        }
                    } catch (error) {
                        onError(error);
                    }
                } else {
                    onResponse();
                }
            }, onError);
        }
        Client.fetchJsonFX = fetchJsonFX;

        /*  fetch text by 'POST'  */
        async function fetchGetAsync(url, requestData, onResponse, onError, useMethodGet) {
            let getUrl;
            if (requestData !== undefined && requestData !== null) {
                const params = new URLSearchParams(requestData);
                getUrl = `${url}?${params.toString()}`
            } else {
                getUrl = url;
            }
            const response = await fetch(getUrl, { method: 'GET' });
            if (!response.ok) {
                onError(`url: '${getUrl}' failed: ${response.status}, ${response.statusText}`);
            }
            else {
                const result = await response.text();
                onResponse(result)
            }
        }
        Client.fetchGetAsync = fetchGetAsync;
        Client.fetchGet = (url, request, onResponse, onError) => { (async () => await fetchGetAsync(url, request, onResponse, onError))(); }
    }

    Object.freeze(Client);
    if (isNodeJS) {
        module.exports = Client;
    } else {
        root.Client = Client;
    }
}(globalThis));
