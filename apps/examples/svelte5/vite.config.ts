import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The same app as `apps/examples/svelte4`, on Svelte 5 — and its whole reason for
// existing is to be the thing that would have caught the defect.
//
// `@aparte/svelte` used to publish a PRECOMPILED bundle importing `svelte/internal`,
// a module Svelte 5 does not have. The wrapper was therefore unusable on the current
// major, its own tests could not notice (they run on Svelte 4), and neither could the
// Svelte 4 example. "Works on Svelte 4 and 5" needs a Svelte 5 build to say so.
//
// It consumes the wrapper's SOURCE through the `svelte` export condition, so this
// app's own compiler produces the output — which is the mechanism under test.
export default defineConfig({
    base: './',
    plugins: [svelte()],
    resolve: { dedupe: ['svelte4'] },
});
