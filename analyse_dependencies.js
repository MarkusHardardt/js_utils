(function () {
    // output files
    const result_dependencies_json = './analyse_dependencies_result.json';
    const source_code_txt = './analyse_dependencies_source.txt';

    const fs = require('fs');
    const Regex = require('./src/Regex.js');
    const Core = require('./src/Core.js');
    const moduleNameRegex = /^([a-zA-Z][_a-zA-Z0-9]*)\.js$/;
    const moduleRegex = /\bconst\s+([a-zA-Z][_a-zA-Z0-9]*)\s*=\s*isNodeJS\s*\?\s*require\s*\(\s*'\.\/\1\.js'\s*\)\s*:\s*root\s*\.\s*\1\s*;/g;
    fs.readdir('./src', (error, files) => {
        if (error) {
            console.error(error);
            return;
        }
        const dependencies = {};
        for (let file of files) {
            const match = moduleNameRegex.exec(file);
            if (!match) {
                continue;
            }
            const moduleName = match[1];
            dependencies[moduleName] = [];
            const text = fs.readFileSync(`./src/${file}`, 'utf8');
            Regex.each(moduleRegex, text, (start, end, match) => dependencies[moduleName].push(match[1]), true);
        }
        fs.writeFileSync(result_dependencies_json, JSON.stringify(dependencies, undefined, 2), 'utf8');
        fs.writeFileSync(source_code_txt, Core.generateLibraryFileAccess(dependencies), 'utf8');
        console.log('done');
    });
}());
