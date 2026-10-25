---
"@aparte/react": patch
"@aparte/vue": patch
"@aparte/svelte": patch
"@aparte/angular": patch
---

A server-rendered `<AparteChat>` now hydrates without a mismatch, in Next, Nuxt, SvelteKit and Angular SSR.

The server's HTML carries `defer-hydration` on the chat's root, so core's elements leave it alone until the framework has the page; the wrapper then releases them, before it builds the chat's host. Before, the elements drew themselves as soon as `@aparte/core` loaded and the framework found a DOM it had not rendered — React threw error 418 and discarded the server's HTML. An app with no server render holds nothing, so a slot's component can talk to the elements it renders from its own mount hook: React reads "am I hydrating?" through `useSyncExternalStore`, Svelte draws the attribute on the server only, Angular — where it is on the `<aparte-chat>` host itself — binds it only while hydrating a host the server sent with it, and Vue releases from the root's ref. On a server-rendered page, Vue's ref still releases before any `onMounted`; in React, Svelte and Angular a slot's component mounts before the chat does (its effect, `onMount` or `ngAfterViewInit` runs first), so on that first load it finds the elements live only once the chat has mounted.
