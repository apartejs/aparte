import { defineConfig } from 'vite';

// No source condition: this app resolves @aparte/core through its published
// `exports` map (dist) exactly like an external consumer — that is the whole
// point (it proves the package is self-contained and framework-independent).
export default defineConfig({
    base: './',
});
