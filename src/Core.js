(function (root) {
    "use strict";
    const Core = {};

    const isNodeJS = typeof require === 'function';

    /*  Returns a function witch on each call returns a number (radix 36, starting at zero). */
    function createIdGenerator(prefix = '') {
        let id = 0;
        return () => `${prefix}${(id++).toString(36)}`;
    }
    Core.createIdGenerator = createIdGenerator;

    /*  Kahn's algorithm  */
    function getTopologicalSorting(dependencies) {
        const graph = new Map();
        const inDegree = new Map();
        const queue = [];
        const result = [];
        for (const node in dependencies) {
            if (!inDegree.has(node))
                inDegree.set(node, 0);
            for (const dep of dependencies[node]) {
                graph.set(dep, (graph.get(dep) || []).concat(node));
                inDegree.set(node, (inDegree.get(node) || 0) + 1);
            }
        }
        for (const [node, degree] of inDegree.entries()) {
            if (degree === 0) queue.push(node);
        }
        while (queue.length > 0) {
            const node = queue.shift();
            result.push(node);
            for (const neighbor of graph.get(node) || []) {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            }
        }
        if (result.length !== inDegree.size) {
            throw new Error("Cyclical dependency detected!");
        }
        return result;
    }
    Core.getTopologicalSorting = getTopologicalSorting;

    function generateLibraryFileAccess(dependencies, external) {
        const components = getTopologicalSorting(dependencies);
        let txt = '    // access to other components in node js and browser:\n';
        txt += `    const isNodeJS = typeof require === 'function';\s`;
        const path = external === true ? '@markus.hardardt/js_utils/src' : '.';
        for (let comp of components) {
            txt += `    const ${comp} = isNodeJS ? require('${path}/${comp}.js') : root.${comp};\n`;
        }
        txt += '\n';
        txt += '    // js_utils files for browser provided by webserver:\n';
        for (let comp of components) {
            txt += `    webServer.AddStaticFile('./node_modules/@markus.hardardt/js_utils/src/${comp}.js');\n`;
        }
        return txt;
    }
    Core.generateLibraryFileAccess = generateLibraryFileAccess;

    Object.freeze(Core);
    if (isNodeJS) {
        module.exports = Core;
    } else {
        root.Core = Core;
    }
}(globalThis));