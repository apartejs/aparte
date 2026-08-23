# Svelte 5 example

The same app as [`../svelte`](../svelte), built with **Svelte 5** instead of 4.

It exists to prove one claim mechanically: `@aparte/svelte` ships its `.svelte`
sources under the `svelte` export condition, so a consumer's own compiler builds them
and **one source serves both majors**.

Before that, the package published a precompiled bundle that imported
`svelte/internal` — a module Svelte 5 removed. The wrapper simply could not be used on
the current major, and nothing in this repo could tell: the wrapper's unit tests run
on Svelte 4, and so did the only example.

Run it like any other example, or let the browser suite do it:

```bash
pnpm --filter @aparte-workspace/example-svelte5 dev
E2E_ONLY=svelte5 pnpm e2e
```
