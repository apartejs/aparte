---
"@aparte/svelte": patch
---

`AparteChat` and `AparteUi` are typed for Svelte 5 as well as Svelte 4: props, events and slots check under either.

The package is now built with Svelte 5's tooling, which emits each component's type in a form both majors read (a Svelte 4 class constructor and a Svelte 5 component function). Verified with the packed tarball installed in two fresh projects, Svelte 4.2 with `svelte-check` 3 and Svelte 5.57 with `svelte-check` 4, both with `skipLibCheck: false`: the documented usage checks clean, and an unknown prop or a wrong prop type is reported in both. Nothing changes in the components themselves.
