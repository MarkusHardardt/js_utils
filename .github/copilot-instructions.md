# Copilot instructions

## Project overview

`js_utils` is a Node.js ES-module library for browser-based SCADA/HMI systems on machines reachable through OPC UA or Beckhoff ADS. Shared library code runs at every installation; machine-specific HMI and server tasks are stored in the installation's SQL database. Deployments can host Node.js and MariaDB on an industrial PC, a Linux/Raspberry Pi, or a panel PC. This repo has about 70 tracked files (39 first-party JavaScript files), no TypeScript or build framework, and no standalone application.

## Architecture and data model

- `src/` contains reusable modules. Key areas: `ObjectLifecycleManager.js` (HMI object lifecycle), `GridLayout.js`, `SplitLayout.js`, `FloatLayout.js`, `GraphControl.js` (layouts/graphics), `ContentManager.js` and `ContentEditor.js` (database content/access and browser editing), `DataConnector.js`, `Access.js`, `SqlHelper.js`, `WebServer.js`, and `WebSocketConnection.js` (data, persistence, transport).
- `js_utils.js` is the generated package entry point; `js_utils_generator.js` assembles its exports from `src/`, using `env/Helper.js` to scan direct relative imports. Keep public exports synchronized when changing modules.
- `client/main.js` assembles the browser HMI. `server/main.js` exports `main(config)` for a consuming application; this repo has no `start` script or local server configuration.
- `ContentManager` is the principal database-object access layer. Content includes JsonFX values (including JavaScript functions), UTF-8 text, localized labels/HTML, HMI mappings, and server-side task definitions. HMI records map the URL `hmi` query value to an enabled HMI object. Tasks can implement OPC UA/ADS clients or other server-side work.
- Keys start with `$`, use slash-separated path segments, and end with a content-table extension configured in `cfg/db_config.json` (examples: `.j`, `.hmi`, `.task`). Prefer letters, digits, and underscores; the current matcher also accepts `+`, `-`, and `*`. ContentEditor folders are virtual groupings derived from keys, not database rows. Folder copy/move/delete and object-level refactoring rewrite references within the affected key set; moves also update references from other objects. Preserve this behavior when changing keys or content operations.
- `include` references are recursively expanded server-side before delivery. Included values provide base properties; the including object overrides them. With `source: true`, replaced base properties are retained under a `source` object. See [HMI_CONFIGURATION.md](../HMI_CONFIGURATION.md) for data types, key rules, includes, and the complete HMI field/lifecycle reference. [README.md](../README.md) describes the application model and deployment options.
- `cfg/` contains deployment-specific configuration, icons, and SQL setup. Never expose values in `cfg/db_access.json` or `cfg/db_config.json`. `db/` is ignored runtime data; `ext/` contains vendored browser helpers. `package.json` lists peer dependencies (Express, MySQL, `ws`, CodeMirror, jQuery/DataTables, OPC UA, ADS, etc.). The lockfile root version is stale (`2.0.1` vs `2.0.4`); `npm ci` works, so do not regenerate the lockfile unless intentionally changing package metadata/dependencies.
- There are no tracked CI workflows, test files, or lint configuration. Do not assume an automated pipeline exists.

## Setup and validation

Verified with Node.js `v24.14.0` and npm `11.21.0`. From the repository root:

1. Always run `npm ci` before validation or using dependencies. It succeeded in about 9 seconds, installing 300 packages. It emitted a deprecated-`glob` warning and reported one high-severity audit finding; do not run `npm audit fix` or change dependencies unless asked.
2. No build, lint, or real test suite is configured. `npm run` lists only `test`; `npm test` intentionally fails with `Error: no test specified`. Do not report it as a passing test.
3. Syntax-check all first-party JavaScript (verified for 39 files; excludes vendored `ext/`):
   ```sh
   for f in js_utils.js js_utils_generator.js env/*.js src/*.js client/*.js server/*.js; do node --check "$f" || exit 1; done
   ```
4. Smoke-test the package entry point (verified; loads 35 exports):
   ```sh
   node --input-type=module -e "import('./js_utils.js').then(({default: api}) => console.log('Loaded exports:', Object.keys(api).length)).catch(error => { console.error(error); process.exitCode = 1; })"
   ```
5. Run `node js_utils_generator.js` only when changing the `src/` dependency graph or public API. It succeeds, but filesystem enumeration reorders generated imports/exports and creates order-only churn in `js_utils.js`; review the diff and do not keep reorder-only changes.

There is no standalone app to run. `.vscode/launch.json` runs the generator, not the HMI server. A consuming application must provide configuration and runtime resources for `server/main.js`. HTTPS/WSS requires both `secureKeyFile` and `secureCertFile`; paths are relative to the process working directory and certificate SANs must cover client hostnames. Without both, HTTP/WS behavior remains. The README's OpenSSL example is for testing in a consuming `js_hmi` project.

## HMI compatibility and lifecycle

- Installation-specific HMI/task objects may call public `hmi_*` methods even when repository code does not. Never rename or remove these APIs without an explicit compatibility plan. The manager and controls attach `hmi_*` methods and internal `_hmi_*` runtime state during object creation, then remove them at teardown; they are not persisted configuration.
- Hooks are asynchronous: call `onSuccess` only when work is complete and `onError` on failure. Creation order: `build` (parent-first) → manager processes/attaches the tree → `apply` (child-first) → DOM setup → `prepare` (parent-first) → listener setup → `start` (child-first). Use `build` to create `children`. Do not change `children` in `apply`: the manager has already processed them.
- Teardown hooks run `stop` (parent-first) → `destroy` (child-first) → `remove` (parent-first) → `cleanup` (child-first). Child-first passes traverse siblings in reverse order. Pair work with its inverse phase: `start`/`stop`, `prepare`/`destroy`, `apply`/`remove`, `build`/`cleanup`. See the lifecycle section in [HMI_CONFIGURATION.md](../HMI_CONFIGURATION.md) before changing this behavior.
- `refresh(object, date)` traverses parent-first. Browser refresh is configured by the client cycle (typically about 18–20 times/second); server tasks use `cycleIntervalMillis`, with non-positive values disabling periodic refresh.

Prefer focused changes and preserve backward-compatible database objects, callback/error behavior, and browser/server behavior. After edits, run the syntax and package-import checks above and inspect the final diff. Trust these instructions; search only when they are incomplete or contradicted by the code.
