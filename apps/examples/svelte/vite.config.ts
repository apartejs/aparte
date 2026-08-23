import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The wrapper now ships its `.svelte` SOURCES under a `svelte` export condition, so
// THIS app's compiler builds them — which is the whole point of the change: one
// source, whichever Svelte major the consumer is on.
//
// It also makes this example the proof for Svelte 4: the wrapper's own unit tests
// run under Svelte 5, and this app compiles the same sources with Svelte 4. Before,
// it consumed a pre-compiled `dist` built against Svelte 4's `svelte/internal`, which
// does not exist in 5 — so the published package simply could not be used there, and
// nothing in the repo could notice.
//
// `dedupe: ['svelte']` still keeps a single runtime; the plugin adds the `svelte`
// condition to resolution itself.
export default defineConfig({
    base: './',
    plugins: [svelte()],
    resolve: { dedupe: ['svelte'] },
});
