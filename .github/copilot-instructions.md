# Copilot instructions

## Project at a glance

`js_utils` is a Node.js ES-module library of shared JavaScript utilities and UI/HMI components. It supports a browser client and a Node.js server, with HMI layouts/controls, object lifecycle management, data access, WebSockets, SQL, OPC UA, and ADS integrations. The repo has about 70 tracked files (39 first-party JavaScript files), no TypeScript or build framework, and depends on Node.js plus browser libraries and optional/consumer-provided integrations.

## Layout and architecture

- `src/` contains the reusable modules. `ObjectLifecycleManager.js` coordinates HMI object creation/teardown; `GridLayout.js`, `SplitLayout.js`, `FloatLayout.js`, and `GraphControl.js` implement layouts/graphics; `ContentManager.js`, `DataConnector.js`, `Access.js`, `SqlHelper.js`, `WebServer.js`, and `WebSocketConnection.js` cover content, data, persistence, and transport.
- `js_utils.js` is the package entry point and checked-in generated public API. `js_utils_generator.js` assembles it from imports in `src/`; `env/Helper.js` scans direct relative imports and sorts module dependencies.
- `client/main.js` assembles the browser HMI; `server/main.js` exports `main(config)` to assemble and start a consuming application's server. This repository has no standalone app configuration or `start` script.
- `HMI_CONFIGURATION.md` documents built-in HMI object types, fields, callbacks, and lifecycle phases. `README.md` documents optional HTTPS/WSS setup. `cfg/` contains configuration, icons, and SQL setup; treat `cfg/db_access.json` and `cfg/db_config.json` as deployment-specific and do not expose their values. `db/` is ignored runtime data. `ext/` contains vendored browser helpers.
- `package.json` lists peer dependencies (including Express, MySQL, `ws`, CodeMirror, jQuery/DataTables, OPC UA, and ADS); the committed `package-lock.json` resolves the installable tree. Its root version is stale (`2.0.1` versus `2.0.4` in `package.json`), but `npm ci` succeeds; do not regenerate it unless intentionally updating package metadata/dependencies. Keep public exports in `js_utils.js` in sync with module changes.
- There are no tracked GitHub Actions/workflow files, test files, or lint configuration. Do not assume CI runs checks that are not defined here.

## Setup and validation

Verified with Node.js `v24.14.0` and npm `11.21.0`:

1. From the repository root, always run `npm ci` before validation or using dependencies. A clean install from the committed lockfile succeeded in about 9 seconds and installed 300 packages. It emitted a deprecated-`glob` warning and reported one high-severity audit finding; do not run `npm audit fix` or change dependencies unless the task calls for it.
2. There is no configured build, lint, or real test suite. `npm test` is a placeholder (`echo "Error: no test specified" && exit 1`) and fails intentionally; do not report it as a passing test. `npm run` lists only this placeholder.
3. For a syntax check of all first-party JavaScript, run:
   ```sh
   for f in js_utils.js js_utils_generator.js env/*.js src/*.js client/*.js server/*.js; do node --check "$f" || exit 1; done
   ```
   The equivalent check passed for all 39 first-party JavaScript files; vendored files under `ext/` were excluded.
4. Smoke-test that the package entry point and its imports load:
   ```sh
   node --input-type=module -e "import('./js_utils.js').then(({default: api}) => console.log('Loaded exports:', Object.keys(api).length)).catch(error => { console.error(error); process.exitCode = 1; })"
   ```
   This passed after a clean install and loaded 35 exports.
5. Only when changing the `src/` module dependency graph or public API, run `node js_utils_generator.js` and review the `js_utils.js` diff. It completed successfully, but filesystem enumeration reordered generated imports/exports versus the checked-in file, producing a diff without a behavioral change. Do not run it for unrelated changes or accept order-only churn without review.

There is no `npm start`/run command or local application to launch. The VS Code launch profile runs `js_utils_generator.js`, not the HMI server. A consuming app must supply `server/main.js` with its configuration and runtime resources. To enable secure transport, configure both `secureKeyFile` and `secureCertFile`; paths are relative to the process working directory, and the certificate SAN must cover client hostnames. With both configured the web and WebSocket servers use HTTPS/WSS; otherwise they retain HTTP/WS. The README's OpenSSL example is for local testing in a consuming `js_hmi` project, not a command to run here.

Prefer focused changes and preserve existing callback/error-handling and browser/server behavior. After edits, run the syntax check and package-import smoke test; inspect the final diff for unintended generated-file, configuration, or dependency changes. Trust these instructions and search the repository only when a detail here is incomplete or contradicted by the current files.
