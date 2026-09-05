---
"@aparte/plugin-streaming-markdown": patch
---

A streamed code fence now gets `class="language-<name>"`, the same class a one-shot renderer writes — so model text can no longer wear core's own `aparte-*` names while a message streams. Nothing to change in your code.

`streaming-markdown` maps its `LANG` attribute to `class` and passes the fence's info string through verbatim, and the wrapper this package installs filtered only `href` and `src`. So three backticks followed by `aparte-approval-option aparte-btn aparte-btn--solid` painted a pixel-perfect approval button inside the transcript — the exact forgery core's sanitizer drops on the one-shot path — and a fence naming a `position: fixed` recipe (`.aparte-select-dropdown`, `.aparte-sidebar__scrim`) repainted the page around the chat. It stayed until the message settled, and on the simple-content path it did not go away even then.

The class is prefixed rather than filtered, which fixes three things at once: the streamed DOM and the settled DOM now agree (both say `language-…`), `language-*` is the one prefix core's class policy deliberately exempts, and `highlightMarkdownFences` can finally read a streamed fence's language. The token is the first word of the info string, truncated at the first character a language name cannot hold — `c++` and `f#` survive, `py<script>` becomes `py`, and an info string with nothing nameable in it writes no class at all.
