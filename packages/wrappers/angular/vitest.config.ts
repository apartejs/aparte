import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// No `@analogjs/vite-plugin-angular` here on purpose: the specs JIT-compile the
// standalone components via `@angular/compiler` (loaded in the setup), and
// vitest's own esbuild transform handles the decorators from tsconfig
// (`experimentalDecorators`). Adding the Angular vite plugin instead pulls in
// `@angular/build` and breaks on `@angular/core/testing`'s bundle resolution.
export default defineConfig({
    test: {
        globals: true,
        environment: 'jsdom',
        // The wrapper mounts REAL core web components, so resolve `@aparte/core`
        // from source (its custom elements register on import) and reuse core's
        // jsdom polyfills (ResizeObserver, …); the local setup then boots Angular's
        // TestBed environment.
        setupFiles: [
            resolve(__dirname, '../../core/vitest.setup.ts'),
            resolve(__dirname, 'vitest.setup.ts'),
        ],
        include: ['src/**/*.spec.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
