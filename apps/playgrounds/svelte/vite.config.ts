import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The @aparte/svelte wrapper is Svelte 4 (needs Vite 5 + vite-plugin-svelte 3),
// so this app pins those and consumes the wrapper from its pre-compiled `dist`.
// `dedupe: ['svelte']` keeps a single Svelte runtime (the wrapper externalizes it).
export default defineConfig({
    base: './',
    plugins: [svelte()],
    resolve: { dedupe: ['svelte'] },
});
