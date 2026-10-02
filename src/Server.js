const Server = {};
const isNodeJS = typeof process !== 'undefined' && Boolean(process.versions?.node);
let refreshCycleTimer = null;
function startRefreshCycle(cycleMillis, onRefresh) {
    const start = typeof cycleMillis === 'number' && cycleMillis > 0;
    if (start) {
        if (refreshCycleTimer) {
            clearInterval(refreshCycleTimer);
        }
        refreshCycleTimer = setInterval(onRefresh, cycleMillis);
    }
    return start;
}
Server.startRefreshCycle = startRefreshCycle;
Server.stopRefreshCycle = () => clearInterval(refreshCycleTimer);
const crypto = isNodeJS ? await import('node:crypto') : undefined;
if (isNodeJS) {
    /*   hash generation */
    const createHash = (text, mode) => crypto.createHash(mode).update(text, 'utf8').digest('hex');
    Server.createHash = createHash;
    Server.createSHA256 = text => createHash(text, 'SHA-256');
    Server.createSHA384 = text => createHash(text, 'SHA-384');
    Server.createSHA512 = text => createHash(text, 'SHA-512');

    Object.freeze(Server);
}

export default Server;
