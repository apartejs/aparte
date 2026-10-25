---
"@aparte/core": minor
---

Server-rendered pages now hydrate cleanly: an aparté element waits while it, or an ancestor, carries `defer-hydration`, and draws itself when `releaseDeferredHydration(root)` removes the attribute.

Core's elements draw themselves when they connect (light DOM: their children, their attributes, a style on the chat's root). On a server-rendered page that happened as soon as `@aparte/core` loaded in the browser — defining the elements upgrades the ones the server sent — so the framework then hydrated a DOM it had not rendered: React threw error 418 and discarded the server's HTML, measured in a Next production build. A held element does nothing until it is released; its upgrade is then replayed as the browser would have run it (the observed attributes it has, then `connectedCallback`). An element removed while held is never torn down, and replays its attributes when it connects later. Removing the attribute any other way releases a microtask later.

The wrappers render the attribute on their root and release it themselves. For server-rendered elements of your own, put `defer-hydration` around them and call `releaseDeferredHydration` once your framework has the page; an element class of yours that draws itself on connect honours it after `deferHydrationOf(MyElement)`, called before `customElements.define`. Without the attribute nothing changes. It is the Web Components Community Group's `defer-hydration`, the one Lit's server rendering follows, widened from an element to the elements under it.
