// Two entries: the library (`createDocsMcpServer` and the page tools, for a host that
// embeds the server) and the CLI (`npx @aparte/docs-mcp`, stdio). Node only — no DOM,
// no browser build. `tsc -b --emitDeclarationOnly` in the build script is the one
// producer of declarations (see packages/plugins/marked/vite.config.ts for why no dts
// plugin).
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
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                cli: resolve(__dirname, 'src/cli.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
        },
        target: 'node18',
        minify: false,
        sourcemap: true,
        reportCompressedSize: false,
        rollupOptions: {
            // The SDK, zod and Node's own modules stay external: this is a Node package
            // with real dependencies, not a browser bundle.
            external: [/^@modelcontextprotocol\/sdk/, 'zod', /^node:/],
            output: {
                // The CLI is executable as published: npm links `bin` to dist/cli.js.
                banner: (chunk) => (chunk.name === 'cli' ? '#!/usr/bin/env node' : ''),
            },
        },
    },
});
