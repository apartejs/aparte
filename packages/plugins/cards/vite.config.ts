// No `vite-plugin-dts` here: `tsc -b --emitDeclarationOnly` in the build script writes
// the declarations that ship (see plugin-shiki's config for why the two raced).
import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [],
    build: {
        emptyOutDir: true,
        outDir: resolve(__dirname, 'dist'),
        lib: {
            // One entry per card (decision #9b): an app that draws the weather ships the
            // weather card and the kit, and no other card.
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                weather: resolve(__dirname, 'src/weather/index.ts'),
                items: resolve(__dirname, 'src/items/index.ts'),
                product: resolve(__dirname, 'src/product/index.ts'),
                place: resolve(__dirname, 'src/place/index.ts'),
                stats: resolve(__dirname, 'src/stats/index.ts'),
                order: resolve(__dirname, 'src/order/index.ts'),
                stock: resolve(__dirname, 'src/stock/index.ts'),
                plan: resolve(__dirname, 'src/plan/index.ts'),
                score: resolve(__dirname, 'src/score/index.ts'),
                media: resolve(__dirname, 'src/media/index.ts'),
                link: resolve(__dirname, 'src/link/index.ts'),
            },
            name: 'ApartePluginCards',
            fileName: (_format, entryName) => `${entryName}.js`,
            formats: ['es'],
        },
        target: 'es2022',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            external: ['@aparte/core'],
        },
    },
});
