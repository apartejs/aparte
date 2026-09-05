---
"@aparte/plugin-approval": patch
"@aparte/plugin-artifacts": patch
"@aparte/plugin-ask-user": patch
"@aparte/plugin-model-selector": patch
---

The four plugins that ship a custom element now carry the `web-components` npm keyword; nothing changes in the code you import.

Each already pointed `customElements` at its manifest, which is what the webcomponents.org catalogue reads, but only core carried the keyword the catalogue and npm search filter on. The five plugins that expose no element (compaction, marked, shiki, streaming-markdown, titler) are untouched: they have nothing to list there.
