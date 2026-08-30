# @aparte/docs-mcp

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

### Minor Changes

- 3dbf25b: Every documentation page is fetched from your `baseUrl` / `APARTE_DOCS_URL`: only the path of a URL the index prints is used, so pointing the server at a local build reads the local build, and an index entry naming another host cannot redirect the fetch.

  `llms.txt` lists one URL per topic set, and those URLs are absolute and point at the production site — even in a docs build served on localhost, because that is what the generator writes. The server fetched them verbatim, so `APARTE_DOCS_URL=http://localhost:4321` read the index locally and then read every page from production: an offline or staging setup silently served the live docs, and a change you were checking never appeared.

  The same verbatim fetch made the index a way to choose what the machine running the agent requests. An index entry naming another host — a cloud metadata address, an intranet name, a port on localhost — was fetched from there.

  A set URL now contributes its path (and query) only; the origin is always `baseUrl` / `APARTE_DOCS_URL`, and anything that does not resolve to `http`/`https` is refused with an error rather than fetched. `DocsSet.url` still carries the URL the index printed.

- 6015096: New package: `@aparte/docs-mcp`, the aparté documentation as an MCP server. `npx @aparte/docs-mcp` gives a coding agent four tools — `list_sets`, `search_docs`, `get_page`, `get_set` — over the text the docs site publishes for models (`apartejs.dev/llms.txt` and its per-topic files), so the answer is always the docs of the version that ships. `createDocsMcpServer({ baseUrl })` embeds it; `APARTE_DOCS_URL` points the CLI at a local docs build.

  Two consumers' assistants could not find what the docs already had — the approval elicitation, the UI kit of classes, `systemPrompt: false` — and one rebuilt a modal it already had. A model that reads a site cold misses; a model that can ask finds.

### Patch Changes

- 4123389: `APARTE_DOCS_URL=""` — exported but empty — falls back to the public docs site, and the version the MCP handshake reports is read from the package's own manifest.

  The base URL is read with `||`, not `??`: an env var exported but empty is unset, and so is a pasted value that is only whitespace.

  The handshake version is read from `package.json` at startup rather than written as a literal in the source: changesets bumps the manifest and nothing else, so a literal would report a version npm never served.
