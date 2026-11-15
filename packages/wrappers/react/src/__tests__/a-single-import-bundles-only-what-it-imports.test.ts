// @vitest-environment node
/**
 * An app pays for the exports it imports.
 *
 * The package ships ONE file, so `sideEffects: false` cannot drop a module of it: the app's
 * bundler prunes statement by statement, and can only drop `<AparteChat>` (and the event table
 * behind its props) when defining it touches nothing. A module-level
 * `AparteChat.displayName = …` is a side effect that keeps it. So the package is built with its
 * own config and a bundler reads that output, as an app's does.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// esbuild is Vite's own dependency: reached through it, not declared by this package.
interface Esbuild {
    build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[] }>;
}
interface EsbuildPlugin {
    name: string;
    setup(b: {
        onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void;
        onLoad(options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: string; resolveDir: string }): void;
    }): void;
}
const esbuild = createRequire(createRequire(import.meta.url).resolve('vite'))('esbuild') as Esbuild;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let shipped = '';

beforeAll(async () => {
    const env = process.env['NODE_ENV'];
    try {
        const result = await build({
            root,
            configFile: resolve(root, 'vite.config.ts'),
            logLevel: 'silent',
            mode: 'production',
            build: { write: false, sourcemap: false },
        });
        const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => ('output' in r ? r.output : []));
        shipped = outputs.map((o) => ('code' in o ? o.code : '')).join('\n');
    } finally {
        if (env === undefined) delete process.env['NODE_ENV'];
        else process.env['NODE_ENV'] = env;
    }
}, 120_000);

async function bundle(names: string): Promise<string> {
    const result = await esbuild.build({
        stdin: { contents: `import { ${names} } from 'aparte-react'; console.log(${names});`, resolveDir: root, loader: 'js' },
        bundle: true,
        write: false,
        format: 'esm',
        treeShaking: true,
        external: ['react', 'react-dom', 'react/jsx-runtime', '@aparte/core'],
        logLevel: 'silent',
        plugins: [<EsbuildPlugin>{
            name: 'shipped',
            setup(b) {
                b.onResolve({ filter: /^aparte-react$/ }, () => ({ path: 'aparte-react', namespace: 'shipped' }));
                b.onLoad({ filter: /.*/, namespace: 'shipped' }, () => ({ contents: shipped, loader: 'js', resolveDir: root }));
            },
        }],
    });
    return result.outputFiles[0]!.text;
}

/** What `<AparteChat>` leaves in a bundle: its root marker, and the event table behind its props. */
const holdsChat = (code: string): boolean => code.includes('data-aparte-chat') || code.includes('aparte-feedback-reason');

describe('a bundle of one import from @aparte/react', () => {
    it('holds <AparteChat> when it is the import', async () => {
        expect(holdsChat(await bundle('AparteChat'))).toBe(true);
    });

    it('does not hold <AparteChat> for useAparteEvent alone', async () => {
        expect(holdsChat(await bundle('useAparteEvent'))).toBe(false);
    });

    it('does not hold <AparteChat> for AparteConversationList alone', async () => {
        expect(holdsChat(await bundle('AparteConversationList'))).toBe(false);
    });
});
