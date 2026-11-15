---
'@aparte/core': minor
'@aparte/plugin-subagents': minor
---

A tool's display can now set the row's `note` and `activity` (text, or a function of the call), and `registerToolLineProvider()` adds a tool-line provider without replacing the one the app set.

The app's display wins over a provider, field by field. Providers are asked in order, `setToolLineProvider()` first, and the first one that answers a call wins; `registerToolLineProvider()` returns the function that removes it, and `getToolLineProviders()` lists them. `setToolLineProvider()` is unchanged. `@aparte/plugin-subagents` registers its provider instead of setting it, so it no longer overwrites the app's.
