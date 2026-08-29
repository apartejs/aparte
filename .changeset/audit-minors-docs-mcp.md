---
"@aparte/docs-mcp": patch
---

`APARTE_DOCS_URL=""` — exported but empty — falls back to the public docs site instead of failing every fetch, and the version the MCP handshake reports is read from the package's own manifest.

The base URL was read with `??`, so an empty string counted as a value and every request was made against `""`. It is `||` now: an env var set to nothing is unset.

The handshake version was a literal in the source, which went stale at each release — the server told a client it was a version it was not. It is read from `package.json` at startup, which is the version npm actually served.
