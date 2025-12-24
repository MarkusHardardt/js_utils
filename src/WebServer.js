(function (root) {
    "use strict";

    const isNodeJS = typeof require === 'function';

    const js_rx = /\.js$/i;
    const css_rx = /\.css$/i;
    const path = require('path');
    const express = require('express');
    const https = require('https');
    const fs = require('fs');
    const bodyParser = require('body-parser');
    const crypto = isNodeJS ? require('crypto') : undefined;

    class WebServer {
        constructor(options = {}) {
            this._scripts = [];
            this._styles = [];
            this._paths = {};
            this._title = '';
            this._body = '';
            this._secure = typeof options.secureKeyFile === 'string' && typeof options.secureCertFile === 'string';
            const server = this._createServer(options);
            this._server = server;
            // support parsing of application/json type post data
            server.use(bodyParser.json({
                limit: '32mb'
            }));
            //support parsing of application/x-www-form-urlencoded post data
            server.use(bodyParser.urlencoded({
                limit: '32mb',
                extended: true,
                parameterLimit: 50000
            }));
            server.use((err, req, res, next) => {
                console.log('>>>>>> ERROR: ' + err.message);
                // set locals, only providing error in development
                res.locals.message = err.message;
                res.locals.error = req.server.get('env') === 'development' ? err : {};

                // render the error page
                res.status(err.status || 500);
                // res.render('error');
                res.json({
                    error: err
                });
            });
            // this returns our main html document
            server.get('/', (req, res) => {
                res.send(this._generate_html());
            });
        }
        get IsSecure() {
            return this._secure;
        }
        _createServer(options) {
            const server = express();
            if (this._secure) {
                https.createServer({
                    key: fs.readFileSync(options.secureKeyFile),
                    cert: fs.readFileSync(options.secureCertFile),
                }, server);
            }
            return server;
        }
        PrepareFavicon(path) {
            // gimp: "./src/app/favicon.xcf"
            // alternative url: "https://www.favicon-generator.org/"
            this._server.use('/favicon.ico', express.static(path));
        }
        set RandomFileIdenabled(value) {
            this._random_id = value === true;
        }
        AddStaticDir(directory, id) {
            if (typeof directory === 'string') {
                if (typeof id === 'string') {
                    this._server.use('/' + id, express.static(directory));
                }
                else {
                    let id = this._paths[directory];
                    if (!id) {
                        const raw = this._random_id === true ? directory + Math.random() : directory;
                        this._paths[directory] = id = crypto.createHash('SHA-256').update(raw, 'utf8').digest('hex');
                        this._server.use('/' + id, express.static(directory));
                    }
                    return id;
                }
            }
            else {
                throw new Error('Invalid directory string: ' + directory);
            }
        }
        _prepare(directory, name, buffer) {
            const id = this.AddStaticDir(directory);
            buffer.push('/' + id + '/' + name);
        }
        AddStaticFile() {
            const dir = arguments.length === 1 ? path.dirname(arguments[0]) : arguments[0];
            const name = arguments.length === 1 ? path.basename(arguments[0]) : arguments[1];
            if (typeof dir === 'string' && typeof name === 'string') {
                if (js_rx.test(name)) {
                    this._prepare(dir, name, this._scripts);
                }
                else if (css_rx.test(name)) {
                    this._prepare(dir, name, this._styles);
                }
            }
        }
        Post(url, onResponse) {
            this._server.post(url, onResponse);
        }
        Get(url, onResponse) {
            this._server.get(url, onResponse);
        }
        SetTitle(title) {
            this._title = title;
        }
        SetBody(body) {
            this._body = body;
        }
        Clear() {
            this._scripts.splice(0, this._scripts.length);
            this._styles.splice(0, this._styles.length);
            this._paths = {};
        }
        _generate_html() {
            let i, l, html = '<!DOCTYPE HTML><html><head>';
            html += '<meta charset="UTF-8">';
            html += '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />';
            html += '<meta http-equiv="Pragma" content="no-cache" />';
            html += '<meta http-equiv="Expires" content="0" />';
            html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">';
            if (typeof this._title === 'string' && this._title.length > 0) {
                html += '<title>';
                html += this._title;
                html += '</title>';
            }
            for (i = 0, l = this._styles.length; i < l; i++) {
                html += '<link rel="stylesheet" type="text/css" href="';
                html += this._styles[i];
                html += '" />';
            }
            for (i = 0, l = this._scripts.length; i < l; i++) {
                html += '<script type="text/javascript" src="';
                html += this._scripts[i];
                html += '"></script>';
            }
            html += '</head><body>';
            if (typeof this._body === 'string' && this._body.length > 0) {
                html += this._body;
            }
            html += '</body></html>';
            return html;
        }
        Listen(port, onResponse) {
            this._server.listen(port, onResponse);
        }
    }

    if (isNodeJS) {
        module.exports = WebServer;
    }
    else {
        root.WebServer = WebServer;
    }
}(globalThis));