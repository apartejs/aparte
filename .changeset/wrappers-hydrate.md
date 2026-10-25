---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

A server-rendered `<AparteChat>` now hydrates without a mismatch, in Next, Nuxt, SvelteKit and Angular SSR.

The server's HTML carries `defer-hydration` on the chat's root, so core's elements leave it alone until the framework has the page; the wrapper then releases them, before it builds the chat's host. Before, the elements drew themselves as soon as `@aparte/core` loaded and the framework found a DOM it had not rendered — React threw error 418 and discarded the server's HTML. An app with no server render holds nothing, so a slot's component can talk to the elements it renders from its own mount hook: React reads "am I hydrating?" through `useSyncExternalStore`, Svelte draws the attribute on the server only, Vue releases from the root's ref, which it sets before any `onMounted` — after a hydration too — and in Angular, where the attribute is on the `<aparte-chat>` host itself, a client-only render binds it after the elements have connected, so they are never held.
