---
'@aparte/core': patch
'@aparte/engine': patch
'@aparte/react': patch
'@aparte/vue': patch
'@aparte/svelte': patch
'@aparte/angular': patch
'@aparte/plugin-ask-user': patch
'@aparte/plugin-marked': patch
'@aparte/plugin-model-selector': patch
'@aparte/plugin-shiki': patch
'@aparte/plugin-streaming-markdown': patch
'@aparte/provider-ai-sdk': patch
'@aparte/provider-openai-compat': patch
'@aparte/provider-transformers': patch
'@aparte/locale-fr': patch
---

Fixed: every package accepted a `@aparte/core` it cannot actually work with.

All fourteen declared `"@aparte/core": ">=0.7.0 <1.0.0"` while sitting at 0.12.1 and
importing symbols core does not export before 0.11.0 (`AparteElementAttributes`,
`AparteTemplateAttrs`, `AparteElementTagName`) or before 0.12.0 (`AparteUiEventName`) —
read from `src/index.ts` at each release tag, not inferred. npm and pnpm both ACCEPT
`@aparte/react@0.12.1` beside `@aparte/core@0.7.0`, say nothing, and hand you a tree
whose types cannot compile.

These packages are published in lockstep and are never tested apart, so the floor is the
release. It now says so, and `pnpm version-packages` moves it with every bump — the floor
went stale because the bump was the one place nothing updated it.
