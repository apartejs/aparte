import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// No `@analogjs/vite-plugin-angular`: the Angular spec JIT-compiles its standalone host
// via `@angular/compiler` (loaded in the setup), and vitest's esbuild transform handles
// the decorators from tsconfig. Adding the Angular vite plugin instead pulls in
// `@angular/build` and breaks `@angular/core/testing`'s bundle resolution — measured in
// the wrapper, which carries the same note.
export default defineConfig({
    // The generated Angular directive needs TypeScript-style decorators, and this is the
    // only place that can say so.
    //
    // `ngc` turns `experimentalDecorators` on itself, so the BUILD never needed it in a
    // tsconfig — which is why none is there. vitest transforms with esbuild instead, and
    // esbuild reads the flag from tsconfig: absent, it emits STANDARD decorators and
    // Angular's JIT rejects them outright ("Standard Angular field decorators are not
    // supported in JIT mode").
    //
    // Only this flag, and not the `useDefineForClassFields: false` that
    // `@aparte/angular`'s tsconfig also carries. That package is Angular all the way down;
    // this one also ships a web component, and flipping class-field semantics for
    // `AparteModelSelector` to serve a directive's test would make the tested build differ
    // from the published one. The generator emits `@Input() set x(v)` — prototype
    // accessors, which the flag does not touch — so it is not needed here.
    esbuild: {
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [
            resolve(__dirname, '../../core/vitest.setup.ts'),
            resolve(__dirname, 'vitest.setup.angular.ts'),
        ],
        // `.test.ts` for the element, `.spec.ts` for the Angular directive — the same
        // split the Angular wrapper uses, so the naming says which harness a file needs.
        include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
        alias: {
            '@aparte/core': resolve(__dirname, '../../core/src/index.ts'),
        },
    },
});
