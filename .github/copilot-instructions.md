# Copilot instructions

## Project overview

`js_utils` is a Node.js ES-module library for browser-based SCADA/HMI systems on machines reachable through OPC UA or Beckhoff ADS. Shared library code runs at every installation; machine-specific HMI and server tasks are stored in the installation's SQL database. Deployments can host Node.js and MariaDB on an industrial PC, a Linux/Raspberry Pi, or a panel PC. TypeScript files are the first-party source of truth; their compiled JavaScript counterparts are kept beside them for runtime compatibility. The repo has no standalone application.

## Architecture and data model

- `src/` contains reusable modules. Key areas: `ObjectLifecycleManager.ts` (HMI object lifecycle), `GridLayout.ts`, `SplitLayout.ts`, `FloatLayout.ts`, `GraphControl.ts` (layouts/graphics), `ContentManager.ts` and `ContentEditor.ts` (database content/access and browser editing), `DataConnector.ts`, `Access.ts`, `SqlHelper.ts`, `WebServer.ts`, and `WebSocketConnection.ts` (data, persistence, transport).
- `js_utils.ts` is the generated package entry point; `js_utils_generator.ts` assembles its exports from `src/`, using `env/Helper.ts` to scan direct relative imports. Run `npm run generate` after changing module dependencies or public exports; inspect its diff for order-only changes.
- `client/main.ts` assembles the browser HMI. `server/main.ts` exports `main(config)` for a consuming application; `js_hmi` provides the runnable entry point and retains JSON runtime configuration.
- `ContentManager` is the principal database-object access layer. Content includes JsonFX values (including JavaScript functions), UTF-8 text, localized labels/HTML, HMI mappings, and server-side task definitions. HMI records map the URL `hmi` query value to an enabled HMI object. Tasks can implement OPC UA/ADS clients or other server-side work.
- Keys start with `$`, use slash-separated path segments, and end with a content-table extension configured in `cfg/db_config.json` (examples: `.j`, `.hmi`, `.task`). Prefer letters, digits, and underscores; the current matcher also accepts `+`, `-`, and `*`. ContentEditor folders are virtual groupings derived from keys, not database rows. Folder copy/move/delete and object-level refactoring rewrite references within the affected key set; moves also update references from other objects. Preserve this behavior when changing keys or content operations.
- `include` references are recursively expanded server-side before delivery. Included values provide base properties; the including object overrides them. With `source: true`, replaced base properties are retained under a `source` object. See [HMI_CONFIGURATION.md](../HMI_CONFIGURATION.md) for data types, key rules, includes, and the complete HMI field/lifecycle reference. [README.md](../README.md) describes the application model and deployment options.
- `cfg/` contains deployment-specific configuration, icons, and SQL setup. Never expose values in `cfg/db_access.json` or `cfg/db_config.json`. `db/` is ignored runtime data; `ext/` contains vendored browser helpers. `package.json` lists peer dependencies (Express, MySQL, `ws`, CodeMirror, jQuery/DataTables, OPC UA, ADS, etc.). The lockfile root version is stale (`2.0.1` vs `2.0.4`); `npm ci` works, so do not regenerate the lockfile unless intentionally changing package metadata/dependencies.
- There are no tracked CI workflows, test files, or lint configuration. Do not assume an automated pipeline exists.

## Setup and validation

Verified with Node.js `v24.14.0` and npm `11.21.0`. From the repository root:

1. Run `npm ci` before validation or using dependencies. The package includes TypeScript compiler development dependencies. Do not run `npm audit fix` or change unrelated dependencies unless asked.
2. `npm run build` compiles TypeScript sources to their adjacent JavaScript runtime files. `npm run generate` also regenerates the library entry point. The library build currently transpiles without type checking because its existing API relies extensively on dynamically extended objects; database-loaded JavaScript remains runtime-only.
3. No real test suite or lint configuration is present. `npm test` intentionally fails with `Error: no test specified`; do not report it as a passing test.
4. Syntax-check all first-party JavaScript output (excludes vendored `ext/`):
   ```sh
   for f in js_utils.js js_utils_generator.js env/*.js src/*.js client/*.js server/*.js; do node --check "$f" || exit 1; done
   ```
5. Smoke-test the package entry point and dynamic evaluation scope:
   ```sh
   node --input-type=module -e "import('./js_utils.js').then(({default: api, Evaluate}) => { const value = Evaluate.evalFunc('({ run() { return typeof JsonFX.stringify; } })'); if (value.run() !== 'function') throw new Error('Database evaluation scope changed'); console.log('Loaded exports:', Object.keys(api).length); }).catch(error => { console.error(error); process.exitCode = 1; })"
   ```
6. The HMI project is at `../js_hmi`; it uses `file:../js_utils` and `npm start` builds its entry point before starting the server. Its JSON configuration remains unchanged.

There is no standalone app to run. `.vscode/launch.json` runs the generator, not the HMI server. A consuming application must provide configuration and runtime resources for `server/main.js`. HTTPS/WSS requires both `secureKeyFile` and `secureCertFile`; paths are relative to the process working directory and certificate SANs must cover client hostnames. Without both, HTTP/WS behavior remains. The README's OpenSSL example is for testing in a consuming `js_hmi` project.

## HMI compatibility and lifecycle

- Installation-specific HMI/task objects may call public `hmi_*` methods even when repository code does not. Never rename or remove these APIs without an explicit compatibility plan. The manager and controls attach `hmi_*` methods and internal `_hmi_*` runtime state during object creation, then remove them at teardown; they are not persisted configuration.
- Hooks are asynchronous: call `onSuccess` only when work is complete and `onError` on failure. Creation order: `build` (parent-first) → manager processes/attaches the tree → `apply` (child-first) → DOM setup → `prepare` (parent-first) → listener setup → `start` (child-first). Use `build` to create `children`. Do not change `children` in `apply`: the manager has already processed them.
- Teardown hooks run `stop` (parent-first) → `destroy` (child-first) → `remove` (parent-first) → `cleanup` (child-first). Child-first passes traverse siblings in reverse order. Pair work with its inverse phase: `start`/`stop`, `prepare`/`destroy`, `apply`/`remove`, `build`/`cleanup`. See the lifecycle section in [HMI_CONFIGURATION.md](../HMI_CONFIGURATION.md) before changing this behavior.
- `refresh(object, date)` traverses parent-first. Browser refresh is configured by the client cycle (typically about 18–20 times/second); server tasks use `cycleIntervalMillis`, with non-positive values disabling periodic refresh.

Prefer focused changes and preserve backward-compatible database objects, callback/error behavior, and browser/server behavior. After edits, run the syntax and package-import checks above and inspect the final diff. Trust these instructions; search only when they are incomplete or contradicted by the code.
