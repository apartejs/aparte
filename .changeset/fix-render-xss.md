---
"@aparte/core": patch
"@aparte/plugin-model-selector": patch
---

Escape untrusted model output before it reaches `innerHTML` (two DOM-XSS paths):

- **core** — the code-segment `language` (the ` ```lang ` fence tag, LLM-authored and
  prompt-injectable) is now HTML-escaped in both the label text and the
  `class="language-…"` attribute; the file-tree node `status` too.
- **core primitives** — `<aparte-select>` and `<aparte-optgroup>` build their labels via
  `textContent`, not `innerHTML`, matching their own update paths.
- **plugin-model-selector** — remote model names/ids and provider labels are escaped before
  the option list is (re)built.

Reachable from a hostile/aggregating `/models` endpoint or a prompt-injected code fence.
