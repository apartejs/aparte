---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

**Every aparté element now has a typed surface in all four frameworks.**

Placing an element used to mean one of two things: a stringly-typed proxy, or nothing at all. In Angular it was `<aparte-ui name="aparte-model-selector" [props]="{…}" (elementEvent)="…">` — a tag name as a string, an untyped bag of props mixing DOM attributes with CSS variables, one output for every event, and an element created imperatively so no `@if`, `@for` or content projection could reach it. In React it was nine tags declared `any`.

`@aparte/core` now declares each element's attributes once — `AparteElementAttributes`, keyed by `AparteElementTagName`, with a per-element interface exported for each. Every wrapper derives from that registry rather than listing tags, so an element added to core is typed everywhere the moment it lands.

- **React** — the `aparte-*` JSX intrinsics are typed. A typo, a wrong value type, or an attribute the element does not observe is a compile error.
- **Vue** — declared through `GlobalComponents`, checked by `vue-tsc`.
- **Svelte** — declared through `SvelteHTMLElements`, checked by `svelte-check`, including `on:` handlers derived from the DOM event map.
- **Angular** — a standalone directive per element, exported individually and as `APARTE_ELEMENT_DIRECTIVES`. Real `@Input()`s that write attributes (never properties — eight of `<aparte-composer>`'s accessors are getter-only), one typed `@Output()` per event emitting the event's detail, and the real tag in the template so control flow and projection work. It also means **no `CUSTOM_ELEMENTS_SCHEMA`**, which used to switch template checking off for every unknown tag in the file.

In the three template languages a presence attribute is `'' | null | undefined`, not `boolean`: all three stringify what they set on a custom element, so `searchable={false}` would render `searchable="false"` and an element testing `hasAttribute` reads that as on. Angular's directives take a real `boolean` and write the attribute themselves. `AparteTemplateAttrs` and `AparteAttrValue` are exported if you build your own integration.

`<aparte-ui>` is unchanged and still ships. It is the escape hatch for an element aparté does not define — one of yours, or a third party's — rather than the way to use aparté's own.

Also fixed while typing it, all found by the compiler rather than by reading: six attributes were documented as strings while the element treats them as booleans or numbers; `timestamp` accepts a number as well as a string; `framework-managed` is a real attribute of the contract that all four wrappers set, core reads on two elements, and nothing declared; and `max-messages` is marked deprecated in favour of `max-rendered-bubbles`, which the element has been warning about at runtime.

New docs page: [Placing elements, typed](/frameworks/elements/).
