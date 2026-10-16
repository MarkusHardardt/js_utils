# js_utils

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
