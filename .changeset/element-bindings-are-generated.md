---
'@aparte/core': patch
'@aparte/angular': patch
---

**The element bindings are generated from the manifest, not written by hand.** 675 lines of
hand-maintained declarations out — 435 of Angular directives and 240 of attribute interfaces — for a
335-line generator and a 55-line config file, which three packages now share.

Core's attribute registry and the 17 Angular directives were a parallel structure over facts the custom-elements manifest already carried, with nothing watching them. Add an attribute to an element and the manifest records it, the registry records it, and React, Vue and Svelte type it automatically — they derive from the registry through a mapped type. Angular would silently not, because an `@Input()` is a hand-written member. Nothing would go red, and the Angular wrapper would be quietly behind within days.

`scripts/gen-element-bindings.mjs` now emits both from `dist/custom-elements.json`, into gitignored `src/generated/` directories rewritten on every build — the same pattern the docs' two generated reference pages already use, so there is no committed artifact that can fall behind and no new guard.

The generator was checked differentially against the output it replaced, and reproduced it: the same 15
interfaces carrying the same 48 attribute members, the same 17 directives, the same 24 Outputs. It
differs in exactly one place — 41 Inputs where the hand-written directives had 40, because it picked
up `framework-managed` on `<aparte-chat-viewport>`, an attribute core's registry declared and the
hand-written directive had missed. That is the drift this change exists to make impossible, found in
the artefact being deleted. The 109 directive tests pass unchanged against the generated file.

What cannot be derived lives in `packages/core/element-bindings.config.mjs`, visible rather than buried in a generator branch: `role` on the bubble is omitted as an Input because that name is ARIA's, `data-empty` on the toolbar is omitted because the element reflects it onto itself, and `aparte-abort` / `aparte-message-aborted` get no Output because they are dispatched on `window` where a host listener could never hear them.

No public API changes: the same types and the same directive names are exported, from a generated file instead of a hand-written one.
