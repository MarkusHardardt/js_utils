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
                root.requestAnimationFrame = function (callback, element) {
                    var currTime = new Date().getTime();
                    var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                    var id = root.setTimeout(function () {
                        callback(currTime + timeToCall);
                    }, timeToCall);
                    lastTime = currTime + timeToCall;
                    return id;
                };
            }
            if (!root.cancelAnimationFrame) {
                root.cancelAnimationFrame = function (timeout) {
                    clearTimeout(timeout);
                };
            }
        }());
        // fetch JSON
        async function fetchJsonAsync(url, request, onResponse, onError) {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: request !== undefined ? JSON.stringify(request) : undefined
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
        Client.fetchJson = function (url, request, onResponse, onError) { (async () => await fetchJsonAsync(url, request, onResponse, onError))(); };

        Object.freeze(Client);
        root.Client = Client;
    }
}(globalThis));
