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

See [HMI_CONFIGURATION.md](./HMI_CONFIGURATION.md) for the object types,
database content model, object-key rules, include behavior, lifecycle hooks,
and configuration fields.

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
