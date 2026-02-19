(function (root) {
    "use strict";
    const WebServer = {};

    const isNodeJS = typeof require === 'function';
    if (!isNodeJS) {
        throw new Error('WebServer is not available on client');
    }

    const Server = isNodeJS ? require('./Server.js') : root.Server;
    const js_rx = /\.js$/i;
    const css_rx = /\.css$/i;
    const fs = require('fs');
    const path = require('path');
    const http = require('http');
    const https = require('https');
    const express = require('express');
    const bodyParser = require('body-parser');

    class WebSrv {
        #scripts;
        #styles;
        #paths;
        #title;
        #body;
        #secure;
        #server;
        #app;
        #random_id;
        constructor(options = {}) {
            this.#scripts = [];
            this.#styles = [];
            this.#paths = {};
            this.#title = '';
            this.#body = '';
            const app = this.#app = express();
            this.#secure = typeof options.secureKeyFile === 'string' && typeof options.secureCertFile === 'string';
            this.#server = this.#secure ? https.createServer({
                key: fs.readFileSync(options.secureKeyFile),
                cert: fs.readFileSync(options.secureCertFile),
            }, app) : http.createServer(app);;
            // support parsing of application/json type post data
            app.use(bodyParser.json({ limit: '32mb' }));
            //support parsing of application/x-www-form-urlencoded post data
            app.use(bodyParser.urlencoded({
                limit: '32mb',
                extended: true,
                parameterLimit: 50000
            }));
            app.use((err, req, res, next) => {
                console.log('>>>>>> ERROR: ' + err.message);
                // set locals, only providing error in development
                res.locals.message = err.message;
                res.locals.error = req.server.get('env') === 'development' ? err : {};
                // render the error page
                res.status(err.status || 500);
                // res.render('error');
                res.json({ error: err });
            });
            // this returns our main html document
            app.get('/', (req, res) => res.send(this.#generate_html()));
        }

        get isSecure() {
            return this.#secure;
        }

        prepareFavicon(path) {
            // gimp: "./src/app/favicon.xcf"
            // alternative url: "https://www.favicon-generator.org/"
            this.#app.use('/favicon.ico', express.static(path));
        }

        set randomFileIdEnabled(value) {
            this.#random_id = value === true;
        }

        addStaticDirectory(directory, id) {
            if (typeof directory === 'string') {
                if (typeof id === 'string') {
                    this.#app.use(`/${id}`, express.static(directory));
                }
                else {
                    let id = this.#paths[directory];
                    if (!id) {
                        const raw = this.#random_id === true ? directory + Math.random() : directory;
                        this.#paths[directory] = id = Server.createSHA256(raw);
                        this.#app.use(`/${id}`, express.static(directory));
                    }
                    return id;
                }
            }
            else {
                throw new Error('Invalid directory string: ' + directory);
            }
        }

        #prepare(directory, name, buffer) {
            const id = this.addStaticDirectory(directory);
            buffer.push(`/${id}/${name}`);
        }

        addStaticFile() { // Note: No not change to lambda function, because 'arguments' will not work anymore!
            const dir = arguments.length === 1 ? path.dirname(arguments[0]) : arguments[0];
            const name = arguments.length === 1 ? path.basename(arguments[0]) : arguments[1];
            if (typeof dir === 'string' && typeof name === 'string') {
                if (js_rx.test(name)) {
                    this.#prepare(dir, name, this.#scripts);
                }
                else if (css_rx.test(name)) {
                    this.#prepare(dir, name, this.#styles);
                }
            }
        }

        post(url, onResponse) {
            this.#app.post(url, onResponse);
        }

        get(url, onResponse) {
            this.#app.get(url, onResponse);
        }

        setTitle(title) {
            this.#title = title;
        }

        setBody(body) {
            this.#body = body;
        }

        clear() {
            this.#scripts.splice(0, this.#scripts.length);
            this.#styles.splice(0, this.#styles.length);
            this.#paths = {};
        }

        #generate_html() {
            let i, l, html = '<!DOCTYPE HTML><html><head>';
            html += '<meta charset="UTF-8">';
            html += '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />';
            html += '<meta http-equiv="Pragma" content="no-cache" />';
            html += '<meta http-equiv="Expires" content="0" />';
            html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">';
            if (typeof this.#title === 'string' && this.#title.length > 0) {
                html += '<title>';
                html += this.#title;
                html += '</title>';
            }
            for (i = 0, l = this.#styles.length; i < l; i++) {
                html += '<link rel="stylesheet" type="text/css" href="';
                html += this.#styles[i];
                html += '" />';
            }
            for (i = 0, l = this.#scripts.length; i < l; i++) {
                html += '<script type="text/javascript" src="';
                html += this.#scripts[i];
                html += '"></script>';
            }
            html += '</head><body>';
            if (typeof this.#body === 'string' && this.#body.length > 0) {
                html += this.#body;
            }
            html += '</body></html>';
            return html;
        }

        listen(port, onResponse) {
            // this._app.listen(port, onResponse);
            this.#server.listen(port, onResponse);
        }
    }
    WebServer.Server = WebSrv;

    Object.freeze(WebServer);
    if (isNodeJS) {
        module.exports = WebServer;
    }
    else {
        root.WebServer = WebServer;
    }
}(globalThis));