---
"@aparte/core": minor
---

Markup in a model's reply can no longer wear a core class name: the sanitizer now drops any class token starting with `aparte-`.

Breaking only for a markdown or highlight provider that deliberately emitted core's own classes to borrow its recipes — a class token of any other shape is untouched, `language-*` included, which is the one class a highlighter is identified by.

`class` is allowlisted because a highlighter's output is mostly classes, and that let model-authored markup dress itself as core's UI: `<div class="aparte-approval-option aparte-btn">Approve</div>` survived the sanitizer untouched and painted a pixel-perfect approval button inside the transcript, next to the real one. Every core surface can be forged the same way, and prompt injection is enough to write it. Core owns the `aparte-` prefix wherever it emits a class, so nothing arriving from a provider keeps one.
