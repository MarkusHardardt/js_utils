# Content Manager

`ContentManager` is the database-object access layer used by the HMI and server
code. It maps configured content keys to SQL tables and provides one
callback-based API for reading, validating, editing, searching, and
refactoring those objects.

The module exports a frozen `ContentManager` factory object. Call
`ContentManager.getInstance(...)` to create a manager:

```js
import ContentManager from './src/ContentManager.js';

// On the server:
const cms = ContentManager.getInstance(logger, evalFunc, getSqlAdapter, iconDirectory, configPath);

// In the browser, initialize asynchronously:
const cms = ContentManager.getInstance(logger, evalFunc, onReady, onError);
```

The server signature is
`getInstance(logger, evalFunc, getSqlAdapter, iconDirectory, configPath?)`;
`configPath` is optional and defaults to the package's database configuration.
The browser signature is
`getInstance(logger, evalFunc, onReady, onError)`.

On the server, `getInstance` returns a manager backed by the configured SQL
adapter. In a browser, it returns a proxy with the same common API; database
requests are sent to the server and JsonFX evaluation is completed in the
browser. The browser factory loads the server-provided database configuration
before calling `onReady()`. All asynchronous database operations use success
and error callbacks rather than promises.

Content types, configured table names, key extensions, language columns, and
icons are configured in the database configuration. A content identifier is a
key beginning with `$`, followed by an optional slash-separated path, and
ending with its configured extension—for example, `$templates/overview.j`.
Folders are virtual prefixes such as `$templates/`; they are not database
records. See [HMI_CONFIGURATION.md](./HMI_CONFIGURATION.md) for the content
model and key rules, and [CONTENT_EDITOR.md](./CONTENT_EDITOR.md) for the
browser editor.

## Content types

The public `ContentManager.DataType` property defines these type strings:

| Type | Stored content |
| --- | --- |
| `JsonFX` | JsonFX object definitions, including HMI objects and JavaScript functions. |
| `Text` | UTF-8 text. |
| `Label` | Language-specific text values. |
| `HTML` | Language-specific HTML values. |
| `HMI` | Mapping from a URL query parameter to an HMI JsonFX object, with enable flags. |
| `Task` | Server task configuration, including task object, flags, and cycle interval. |

Each type is mapped to a configured database table and extension. Extensions
are installation-specific; `.j` is a common JsonFX extension, not a universal
requirement.

## Include mechanisms

Includes let content reuse other database objects. Resolution is recursive
and is performed by the server before the resolved value is returned. The
referenced key must use a configured extension. The two forms serve different
purposes.

### Object composition: `{ include: '$path/to/data.j' }`

Use an object's `include` property to use another JsonFX object as a base:

```js
{
    include: '$templates/overview.j',
    title: 'Machine-specific title'
}
```

The included object's properties are the base; properties defined by the
including object override properties with the same names. The `include`
property is consumed during successful resolution. Arrays and nested object
properties are also traversed, so includes can be used throughout a JsonFX
definition. If the including object sets `source: true`, overridden base
properties are retained in the resolved object's `source` property.

### String substitution: `{ data: 'include:$path/to/data.j' }`

Use the `include:$...` directive inside a string to insert the contents of a
referenced object into that string:

```js
{
    data: 'include:$path/to/data.j'
}
```

This is substitution, not object-property merging. The included value replaces
the directive in the string; if it refers to a JsonFX object, that object is
serialized as JsonFX text for insertion. The directive may also be embedded in
surrounding text, and multiple directives can be resolved in one string.
Quoted and unquoted `include:$...` directives are recognized.

Object includes are resolved for JsonFX objects unless raw mode is requested.
For text, labels, and HTML, includes are expanded when the `include` mode is
requested. Cyclic, invalid, or unsupported references are warned about and
are not recursively expanded.

## Callback conventions

Operations that can fail take `onResponse` (success) and `onError` callbacks.
The success callback receives the operation's result, if any; a successful
write generally calls it with no argument. An error is delivered to
`onError`. Methods documented with a single callback use it for their result
and may also take an `onError` callback.

## Common instance methods

These methods are available on both the server manager and browser proxy.

### Configuration and key helpers

- **`getLanguages(array?)`** — returns a copy of the configured language list.
  An optional destination array can be supplied.
- **`isValidIdForType(id, type)`** — returns whether `id` is a valid configured
  content key of `type`.
- **`getIdValidTestFunctionForType(type)`** — returns a predicate that tests
  content keys of the requested type.
- **`getIdValidTestFunctionForLanguageValue()`** — returns a predicate that
  tests keys for language-valued content (`Label` or `HTML`).
- **`analyzeId(id)`** — classifies an identifier. A file result contains
  `{ id, path, file, extension, type }`; a virtual folder contains
  `{ id, path, folder }`; an unrecognized identifier contains `{ id }`.
- **`getExtensionForType(type)`** — returns the configured extension for a
  content type, or `undefined` if no extension is configured.
- **`getIcon(id)`** — returns the configured icon URL for a file or folder, or
  `false` if the identifier is not recognized.
- **`compareIds(id1, id2)`** — sorts folders before files and compares names
  using the library's text-and-number ordering.
- **`getExchangeHandler()`** — creates an exchange handler with the public
  `handleImport(hmi, text, onProgressChanged, onError)` and
  `handleExport(id, onProgressChanged, onError)` methods. Import parses an
  exchange document and asks for confirmation before replacing content;
  export serializes a file or folder to a downloadable exchange document.

### Read and write content

- **`exists(id, onResponse, onError)`** — reports whether a content key exists.
  A non-content identifier such as a folder returns `false`.
- **`getChecksum(id, onResponse, onError)`** — returns a checksum for the
  current stored object, for detecting changes before an edit is committed.
- **`getObject(id, language, mode, onResponse, onError)`** — reads content.
  `language` selects one value for `Label` or `HTML`; if omitted, those types
  return an object keyed by language. JsonFX in `RAW` or `INCLUDE` mode is
  returned as a serialized JsonFX string; `Text`, `Label`, and `HTML` return
  strings (or language-keyed objects when no language is selected). The `mode`
  values are:
  - `ContentManager.RAW`: return stored content without resolving includes.
  - `ContentManager.INCLUDE`: recursively resolve includes. This is the
    default behavior for JsonFX; use it explicitly for text, labels, and HTML.
  - `ContentManager.PARSE`: resolve JsonFX includes and evaluate the resulting
    JsonFX as a JavaScript value. In the browser, evaluation occurs in the
    proxy. For non-JsonFX content, use the appropriate raw/include mode.
  - HMI and Task records are returned as serialized JsonFX objects.
- **`getModificationParams(id, language, value, onResponse, onError)`** —
  compares a proposed value with the stored value and returns a preparation
  object. It includes `action` (`INSERT`, `UPDATE`, `DELETE`, or `NONE`),
  `checksum`, `source`, and per-field `values`; each field reports whether it
  is empty or changed. For Label/HTML, `value` is a string when changing one
  `language`, or an object keyed by language when changing multiple values.
  For JsonFX/Text, `value` is a string; HMI/Task values are objects keyed by
  their configured fields. Deletion may also include `externalUsers`, keys
  that reference the object.
- **`setObject(id, language, value, checksum, onResponse, onError)`** — applies
  an insert, update, or delete. Supply the checksum from a fresh
  `getModificationParams` result. If the database content changed after the
  preparation call, the write fails rather than overwriting that change.
  Writes use a transaction.

Typical edit flow:

```js
cms.getModificationParams(id, language, value, params => {
    cms.setObject(id, language, value, params.checksum, onSaved, onError);
}, onError);
```

### Refactoring, search, and listing

- **`getRefactoringParams(source, target, action, onResponse, onError)`** —
  validates and prepares a `COPY`, `MOVE`, or `DELETE` operation on a file or
  virtual folder. The returned parameters contain an `action`, a `checksum`,
  and the affected `objects`; conflicts may be listed in `existingTargets`.
  Validation failures are returned in the preparation object's `error`
  property.
- **`performRefactoring(source, target, action, checksum, onResponse, onError)`**
  — executes a prepared operation using its checksum. Copy and move rewrite
  references within the affected key set; move also updates references from
  other objects. Folder operations apply to contained keys.
- **`getSearchResults(key, value, onResponse, onError)`** — returns content
  identifiers matching a key substring, a stored-value substring, or both.
  Provide at least one non-empty search term.
- **`getIdKeyValues(id, onResponse, onError)`** — returns content identifiers
  whose keys are under the selected file path or virtual-folder prefix.
- **`getAllIdsForType(type, onResponse, onError)`** — returns all identifiers
  for a configured content type.
- **`getAllForLanguage(language, onResponse, onError)`** — returns a map of
  localized Label and HTML content for the language, with includes resolved.

## Server-only instance methods

- **`getTaskObjects(onResponse, onError)`** — returns the configured task
  records, ordered by key. Each record includes its task object identifier,
  flags, cycle interval, and `id`/`file` content-key fields.
- **`registerAffectedTypesListener(type, onChanged)`** — registers a callback
  invoked after a successful write or refactoring changes content of `type`.
  A listener can only be registered once for a given type and manager.
- **`registerOnWebServer(webServer)`** — registers the HTTP handlers used by
  the browser proxy and the Content Editor, including content data and lazy
  content-tree requests.

## Browser proxy-only instance methods

- **`isHMIObject(id, onResponse, onError)`** — reports whether the JsonFX
  object is referenced by an HMI mapping.
- **`addDefaultHMIObject(id, onResponse, onError)`** — adds a default HMI
  mapping for a JsonFX object.
- **`getHMIObject(queryParameterValue, language, onResponse, onError)`** —
  resolves an enabled HMI mapping by its URL query-parameter value and returns
  the parsed HMI object.
- **`getHMIObjects(onResponse, onError)`** — returns the configured HMI
  mappings, including query parameter, referenced view object, and flags.
- **`isTaskObject(id, onResponse, onError)`** — reports whether the JsonFX
  object is referenced by a task configuration.
- **`addDefaultTaskObject(id, onResponse, onError)`** — adds a default task
  configuration for a JsonFX object.

These HMI/task methods are exposed by the browser proxy; they are not part of
the server manager's public instance interface. The server uses the task
listing and affected-type listener APIs to integrate tasks with its task
manager.

## Public static properties

The factory object is frozen after initialization; these properties are
read-only constants.

### `DataType`

`ContentManager.DataType` is a frozen map with `JsonFX`, `Text`, `Label`,
`HTML`, `HMI`, and `Task` entries.

### Action constants

Use these values rather than string literals when calling preparation or
refactoring APIs:

| Property | Value | Meaning |
| --- | --- | --- |
| `INSERT` | `'insert'` | Create a content record. |
| `UPDATE` | `'update'` | Update a content record. |
| `DELETE` | `'delete'` | Delete a record or refactor a selected file/folder. |
| `COPY` | `'copy'` | Copy a file or folder. |
| `MOVE` | `'move'` | Move a file or folder. |
| `NONE` | `'none'` | No write is required. |

### Read modes

| Property | Value | Meaning |
| --- | --- | --- |
| `RAW` | `'raw'` | Read without include expansion. |
| `INCLUDE` | `'include'` | Resolve include directives. |
| `PARSE` | `'parse'` | Resolve and evaluate JsonFX. |

### Web and HMI/task constants

- `GET_CONTENT_DATA_URL` — `'/get_content_data'`, the browser proxy endpoint.
- `GET_CONTENT_TREE_NODES_URL` — `'/get_content_tree_nodes'`, the lazy tree
  endpoint used by the Content Editor.
- `COMMAND_GET_CHILD_TREE_NODES` — `'get_child_tree_nodes'`.
- `COMMAND_GET_REFERENCES_TO_TREE_NODES` — `'get_references_to_tree_nodes'`.
- `COMMAND_GET_REFERENCES_FROM_TREE_NODES` — `'get_references_from_tree_nodes'`.
- `HMI_FLAG_ENABLE` — `0x01`, the bit indicating an enabled HMI mapping.
- `TASK_FLAG_AUTORUN` — `0x01`, the bit indicating an autorun task.
