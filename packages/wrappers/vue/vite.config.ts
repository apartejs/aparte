import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(async ({ mode }) => {
    // A production build is compiled for production whatever NODE_ENV it inherits. On Windows nx
    // resolves every Vite config in development mode, in its own process, to build its graph —
    // Vite then sets NODE_ENV=development there, and every task nx starts inherits it. This
    // build then shipped the development compile of every template (plugin-vue reads only
    // Vite's NODE_ENV-based isProduction). Vite reads NODE_ENV after loading this file; nx's own
    // resolution passes mode 'development', so it is left alone. The plugin is imported after,
    // because the template compiler picks its own development or production build when loaded.
    if (mode === 'production') process.env.NODE_ENV = 'production';
    const { default: vue } = await import('@vitejs/plugin-vue');
    return {
        plugins: [
            vue({
                // `aparte-*` are custom elements, not Vue components — don't warn/resolve them.
                template: {
                    compilerOptions: {
                        isCustomElement: (tag) => tag.startsWith('aparte-'),
                    },
                },
            }),
        ],
        build: {
            emptyOutDir: true,
            outDir: resolve(__dirname, 'dist'),
            lib: {
                entry: resolve(__dirname, 'src/index.ts'),
                formats: ['es'],
                fileName: 'index',
            },
            target: 'es2022',
            minify: false,
            sourcemap: true,
            reportCompressedSize: false,
            rollupOptions: {
                // Peers — never bundle.
                external: ['vue', '@aparte/core'],
            },
        },
    };
});
