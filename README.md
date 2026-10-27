# js_utils

## Purpose and application model

`js_utils` is a reusable JavaScript toolkit for building browser-based SCADA/HMI
systems for machines whose automation system can be reached through OPC UA or
Beckhoff ADS. It provides the shared browser client and Node.js server
infrastructure: HMI object lifecycle, layouts and controls, database content,
data access, WebSockets, SQL integration, and OPC UA/ADS support.

The machine-specific HMI—what the operator sees—and server-side user tasks are
not normally implemented as installation-specific source code in this
repository. They are stored as objects in the installation's SQL database and
loaded by the shared `js_utils` software. Consequently, the same library can be
deployed to multiple machines. Keeping its APIs backward-compatible is
important: an installation may update the shared library without rewriting
the HMI and task objects already stored in its database.

A server-side task object can implement machine integrations such as an OPC UA
or ADS client. Tasks can also perform other server-side work, such as file
access. A deployment may host Node.js and MariaDB together on an industrial
PC—for example, a Beckhoff IPC—or on a Linux-based Raspberry Pi when an IPC is
not available. A panel PC is another possible host, depending on the
installation requirements.

`ContentManager` is the central access layer for database objects, and
`ContentEditor` provides browser-based editing and navigation by object key.
The content model includes JsonFX values (including JavaScript functions),
UTF-8 text, multilingual labels and HTML, HMI definitions, and server-side
task definitions. HMI objects are selected through a database mapping from a
URL's `hmi` query parameter to an enabled HMI object. Tasks are configured
separately and can be started/stopped through the task manager.

To open the Content Editor, omit the `hmi` query parameter from the application
URL and sign in with the configured Content Manager administrator credentials.
See [CONTENT_EDITOR.md](./CONTENT_EDITOR.md) for the editor layout and usage.

JsonFX objects can include other database objects as templates. The server
recursively resolves `include` references before returning a requested object;
the including object overrides attributes from the included object. Setting
`source: true` retains overridden attributes under a `source` property.
Database keys also support virtual folders: the editor derives folders from
slash-separated keys, so folders need not exist as database rows. Folder
copying, moving, and deleting is handled as a key-aware refactoring operation.

### Data-driven documents

The central HMI concept is **Data-Driven Documents**: the installation's HMI
is defined as a tree of JavaScript objects stored as database content, rather
than as installation-specific JavaScript source files. The objects describe
the view declaratively, and reusable objects can serve as templates through
`include`; properties on each including object provide its individual
parameters and override the template's matching properties.

An HTML page is commonly laid out with nested elements such as `<div>`s. Those
elements form a tree in the browser's DOM. The configured JavaScript object
tree provides the underlying structure for that layout, but the two trees do
not have to match one-for-one: a single JavaScript object can create several
nested `<div>`s, so the DOM tree can be deeper and contain more nodes than the
configuration tree.

Objects can define lifecycle functions and, in particular, `refresh()` to make
their corresponding HTML interactive and responsive to changing data. The
`ObjectLifecycleManager` mounts objects into the DOM, manages their lifecycle
and event listeners, and removes that runtime wiring during teardown. Objects
can also be loaded into an existing tree or removed again at runtime. Teardown
releases the manager-managed listeners and references so removed objects can
be reclaimed by garbage collection when nothing else references them.

This lets users build substantial HMIs with configuration objects and only
rudimentary JavaScript knowledge, without having to manage HTML structure and
event wiring themselves. When the built-in configuration and callbacks are
not enough, JavaScript functions and custom HTML and CSS are still available
for the full flexibility of the browser.

See [HMI_CONFIGURATION.md](./HMI_CONFIGURATION.md) for the object types,
database content model, object-key rules, include behavior, lifecycle hooks,
configuration fields, and runtime navigation between identified objects.

The [Mathematics module](./MATHEMATICS.md) provides reusable numeric helpers,
coordinate transforms, curve and rope geometry, discretization, maze
generation, and weighted-graph path finding.

The [Executor module](./EXECUTOR.md) provides callback-based helpers for
running asynchronous tasks sequentially or concurrently, queuing tasks,
limiting trigger frequency, and keeping only the latest pending task.

The [Content Manager module](./CONTENT_MANAGER.md) provides a shared
callback-based API for accessing configured SQL content from the server and
through a browser proxy, including recursive object and string includes.

For the end-to-end data access flow—from HMI `watch` and `hmi.access` through
WebSockets to OPC UA/ADS subscriptions, including browser-side database labels
and HTML—see [DATA_ACCESS.md](./DATA_ACCESS.md).

## Tests

Run the automated tests from the repository root with:

```sh
npm test
```

The test suite uses Node.js's built-in test runner and does not require an
additional test framework.

## HTTPS and secure WebSockets

The server uses HTTPS and WSS when both `secureKeyFile` and `secureCertFile`
are configured. The WebSocket server listens on its configured port with the
same TLS certificate as the web server. If these options are omitted, the
existing HTTP and WS behavior is used.

For local testing from the `js_hmi` project directory, create the certificate
directory and a self-signed certificate with OpenSSL:

```powershell
New-Item -ItemType Directory -Force .\cert
openssl req -x509 -newkey rsa:2048 -keyout .\cert\cert.key -out .\cert\cert.cert -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
```

The configured paths are relative to the process working directory. Include
the hostnames or IP addresses used by HMI clients in the certificate's subject
alternative names. A self-signed certificate is suitable only for testing
unless it is explicitly trusted by clients; production deployments should use
a certificate issued by a trusted certificate authority. Keep the private key
(`cert.key`) confidential.
