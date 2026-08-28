---
"@aparte/docs-mcp": patch
"@aparte/plugin-approval": patch
"@aparte/plugin-artifacts": patch
"@aparte/react": patch
---

Small fixes from the audit's minor findings. `@aparte/docs-mcp`: an empty or blank `APARTE_DOCS_URL` falls back to the public docs site instead of failing every fetch, and the version the MCP handshake reports is read from the package manifest rather than a literal that went stale at each release. `@aparte/plugin-approval`: the `node` entry exports the `AparteApprovalMode` element type, so an SSR consumer can name it. `@aparte/plugin-artifacts`: an app-built segment with an upper-case `artifactType` (`'HTML'`) gets a working Preview tab. `@aparte/react`: `<AparteUi>` applies its props to a freshly created element when only `name` or `events` changed, so a memoized prop bag is no longer lost — the order Vue, Svelte and Angular already use; `useAparteClient`'s JSDoc says `options` is read once, on mount.
