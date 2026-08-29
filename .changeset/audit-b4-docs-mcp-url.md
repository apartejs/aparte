---
"@aparte/docs-mcp": minor
---

Every documentation page is fetched from your `baseUrl` / `APARTE_DOCS_URL`: only the path of a URL the index prints is used, so pointing the server at a local build reads the local build, and an index entry naming another host cannot redirect the fetch.

`llms.txt` lists one URL per topic set, and those URLs are absolute and point at the production site — even in a docs build served on localhost, because that is what the generator writes. The server fetched them verbatim, so `APARTE_DOCS_URL=http://localhost:4321` read the index locally and then read every page from production: an offline or staging setup silently served the live docs, and a change you were checking never appeared.

The same verbatim fetch made the index a way to choose what the machine running the agent requests. An index entry naming another host — a cloud metadata address, an intranet name, a port on localhost — was fetched from there.

A set URL now contributes its path (and query) only; the origin is always `baseUrl` / `APARTE_DOCS_URL`, and anything that does not resolve to `http`/`https` is refused with an error rather than fetched. `DocsSet.url` still carries the URL the index printed.
