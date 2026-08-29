---
"@aparte/docs-mcp": patch
---

`APARTE_DOCS_URL=""` — exported but empty — falls back to the public docs site, and the version the MCP handshake reports is read from the package's own manifest.

The base URL is read with `||`, not `??`: an env var exported but empty is unset, and so is a pasted value that is only whitespace.

The handshake version is read from `package.json` at startup rather than written as a literal in the source: changesets bumps the manifest and nothing else, so a literal would report a version npm never served.
