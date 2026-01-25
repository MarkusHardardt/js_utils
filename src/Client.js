(function (root) {
    "use strict";
    const Client = {};

    const isNodeJS = typeof require === 'function';

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

        /*  fetch text by 'POST'  */
        async function fetchAsync(url, requestString, onResponse, onError) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: requestString !== undefined && requestString !== null ? requestString : undefined
            });
            if (!response.ok) {
                onError(`url: '${url}' failed: ${response.status}, ${response.statusText}`);
            } else {
                const result = await response.text();
                onResponse(result)
            }
        }
        Client.fetchAsync = fetchAsync;
        Client.fetch = (url, request, onResponse, onError) => { (async () => await fetchAsync(url, request, onResponse, onError))(); }

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

        Object.freeze(Client);
        root.Client = Client;
    }
}(globalThis));
