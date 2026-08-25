---
'@aparte/core': patch
'@aparte/angular': patch
---

**The element bindings are generated from the manifest, not written by hand.** 751 lines out, 117 in.

Core's attribute registry and the 17 Angular directives were a parallel structure over facts the custom-elements manifest already carried, with nothing watching them. Add an attribute to an element and the manifest records it, the registry records it, and React, Vue and Svelte type it automatically — they derive from the registry through a mapped type. Angular would silently not, because an `@Input()` is a hand-written member. Nothing would go red, and the Angular wrapper would be quietly behind within days.

`scripts/gen-element-bindings.mjs` now emits both from `dist/custom-elements.json`, into gitignored `src/generated/` directories rewritten on every build — the same pattern the docs' two generated reference pages already use, so there is no committed artifact that can fall behind and no new guard.

The generator reproduced the hand-written output exactly: all 15 interfaces, all 48 properties, all 17 directives, 41 Inputs and 24 Outputs — and found one attribute the hand-written version had missed (`framework-managed` on `<aparte-chat-viewport>`). The 109 directive tests pass unchanged against the generated file.

What cannot be derived lives in `packages/core/element-bindings.config.mjs`, visible rather than buried in a generator branch: `role` on the bubble is omitted as an Input because that name is ARIA's, `data-empty` on the toolbar is omitted because the element reflects it onto itself, and `aparte-abort` / `aparte-message-aborted` get no Output because they are dispatched on `window` where a host listener could never hear them.

No public API changes: the same types and the same directive names are exported, from a generated file instead of a hand-written one.
