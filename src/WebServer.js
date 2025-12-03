(function (root) {
  "use strict";

  const isNodeJS = typeof require === 'function';

  var js_rx = /\.js$/i;
  var css_rx = /\.css$/i;
  var path = require('path');
  var express = require('express');
  var bodyParser = require('body-parser');
  var md5 = require('md5');

  var WebServer = function () {
    var that = this;
    this._scripts = [];
    this._styles = [];
    this._paths = {};
    this._title = '';
    this._body = '';
    var server = express();
    this._server = server;
    // TODO remove false-block if problem solved
    if (true) {
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
    }
    else {
      server.use(express.json());
      server.use(express.urlencoded({
        extended: false
      }));
    }
    server.use(function (err, req, res, next) {
      console.log('>>>>>> ERROR: ' + err.message);
      // set locals, only providing error in development
      res.locals.message = err.message;
      res.locals.error = req.server.get('env') === 'development' ? err : {};

      // render the error page
      res.status(err.status || 500);
      // res.render('error');
      res.json({
        error: err
      })
    });
    // this returns our main html document
    server.get('/', function (req, res) {
      res.send(that._generate_html());
    });
    // TODO !!! REMOVE THIS QUICK HACK !!! and remove './skin-lion' as well
    //this._server.use('/', express.static('.'));
  };

  WebServer.prototype = {
    prepareFavicon: function (i_path) {
      // gimp: "./src/app/favicon.xcf"
      // alternative url: "https://www.favicon-generator.org/"
      this._server.use('/favicon.ico', express.static(i_path));
    },
    enableRandomFileId: function (i_state) {
      this._random_id = i_state === true;
    },
    addStaticDir: function (i_dir, i_id) {
      if (typeof i_dir === 'string') {
        if (typeof i_id === 'string') {
          this._server.use('/' + i_id, express.static(i_dir));
        }
        else {
          var paths = this._paths, id = paths[i_dir];
          if (!id) {
            id = this._random_id === true ? md5(i_dir + Math.random()) : md5(i_dir);
            paths[i_dir] = id;
            this._server.use('/' + id, express.static(i_dir));
          }
          return id;
        }
      }
      else {
        throw new Error('Invalid directory string: ' + i_dir);
      }
    },
    _prepare: function (i_dir, i_name, i_buffer) {
      var id = this.addStaticDir(i_dir);
      i_buffer.push('/' + id + '/' + i_name)
    },
    addStaticFile: function () {
      var dir = arguments.length === 1 ? path.dirname(arguments[0]) : arguments[0];
      var name = arguments.length === 1 ? path.basename(arguments[0]) : arguments[1];
      if (typeof dir === 'string' && typeof name === 'string') {
        if (js_rx.test(name)) {
          this._prepare(dir, name, this._scripts);
        }
        else if (css_rx.test(name)) {
          this._prepare(dir, name, this._styles);
        }
      }
    },
    post: function (i_url, i_callback) {
      this._server.post(i_url, i_callback);
    },
    get: function (i_url, i_callback) {
      this._server.get(i_url, i_callback);
    },
    setTitle: function (i_title) {
      this._title = i_title;
    },
    setBody: function (i_body) {
      this._body = i_body;
    },
    clear: function () {
      this._scripts.splice(0, this._scripts.length);
      this._styles.splice(0, this._styles.length);
      this._paths = {};
    },
    _generate_html: function () {
      var i, l, scripts = this._scripts, styles = this._styles, html = '<!DOCTYPE HTML><html><head>';
      html += '<meta charset="UTF-8">';
      html += '<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />';
      html += '<meta http-equiv="Pragma" content="no-cache" />';
      html += '<meta http-equiv="Expires" content="0" />';
      html += '<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">';
      var title = this._title;
      if (typeof title === 'string' && title.length > 0) {
        html += '<title>';
        html += title;
        html += '</title>';
      }
      for (i = 0, l = styles.length; i < l; i++) {
        html += '<link rel="stylesheet" type="text/css" href="';
        html += styles[i];
        html += '" />';
      }
      for (i = 0, l = scripts.length; i < l; i++) {
        html += '<script type="text/javascript" src="';
        html += scripts[i];
        html += '"></script>';
      }
      html += '</head><body>';
      var body = this._body;
      if (typeof body === 'string' && body.length > 0) {
        html += body;
      }
      html += '</body></html>';
      return html;
    },
    listen: function (i_port, i_callback) {
      this._server.listen(i_port, i_callback);
    }
  };
  if (isNodeJS) {
    module.exports = WebServer;
  }
  else {
    root.WebServer = WebServer;
  }
}(globalThis));