# Security Policy

## Reporting a vulnerability

If you believe you've found a security vulnerability in `@watchnoc/node`, please report it privately rather than opening a public issue. Email the maintainers with:

- A description of the vulnerability and its impact.
- Steps to reproduce (a minimal repro is ideal).
- The version of `@watchnoc/node` affected.

We'll acknowledge the report, investigate, and coordinate a fix and disclosure timeline with you before any public disclosure.

## Data handling notes for reporters

This SDK forwards application log/error data (and, via database/HTTP instrumentation, query and request metadata) to a Watchnoc collector. Relevant security properties, in case they narrow your report:

- Redaction (value-pattern and key-name based) is applied client-side before data leaves the process — see the README's [Data captured & redaction](./README.md#-data-captured--redaction) section for exactly what is and isn't covered.
- The HTTP transport refuses plaintext `http://` to non-loopback hosts by default; the gRPC transport requires TLS for non-loopback addresses.
- The API key is transmitted as a request header/gRPC metadata value on every call — it is never logged or embedded in emitted events.

If your report concerns data that should be redacted but isn't, or a transport that permits sending data insecurely, that's in scope — please report it.

## Supported versions

Only the latest published `0.x` release is actively supported. Security fixes are released as new patch versions rather than backported.
