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
        async function fetchTextAsync(url, request, onResponse, onError) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: request !== undefined && request !== null ? request : undefined
            });
            if (response.ok) {
                const result = await response.text();
                onResponse(result)
            }
            else {
                onError(`url: '${url}' failed: ${response.status}, ${response.statusText}`);
            }
        }
        Client.fetchTextAsync = fetchTextAsync;
        Client.fetchText = (url, request, onResponse, onError) => { (async () => await fetchTextAsync(url, request, onResponse, onError))(); }

        /*  fetch JSON by 'POST'  */
        async function fetchJsonAsync(url, request, onResponse, onError) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: request !== undefined && request !== null ? JSON.stringify(request) : undefined
            });
            if (response.ok) {
                const result = await response.json();
                onResponse(result)
            }
            else {
                onError(`url: '${url}' failed: ${response.status}, ${response.statusText}`);
            }
        }
        Client.fetchJsonAsync = fetchJsonAsync;
        Client.fetchJson = (url, request, onResponse, onError) => { (async () => await fetchJsonAsync(url, request, onResponse, onError))(); }

        Object.freeze(Client);
        root.Client = Client;
    }
}(globalThis));
