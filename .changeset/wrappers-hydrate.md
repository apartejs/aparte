---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

A server-rendered `<AparteChat>` now hydrates without a mismatch, in Next, Nuxt, SvelteKit and Angular SSR.

The chat's root carries `defer-hydration` in the server render and in the render that hydrates it, so core's elements leave the server's HTML alone until the framework has the page; the wrapper then releases them, before it builds the chat's host. Before, the elements drew themselves as soon as `@aparte/core` loaded and the framework found a DOM it had not rendered — React threw error 418 and discarded the server's HTML. React reads "am I hydrating?" through `useSyncExternalStore`, so an app with no server render never holds the elements; Vue, Svelte and Angular hold them until the component is mounted, which in a client-only app is the same tick. In Angular the attribute is on the `<aparte-chat>` host itself.
