/**
 * Compile the documentation's self-contained code snippets.
 *
 * Why: a cold audit found FOUR broken snippets, including the headline
 * `streamRunner: runStreamAgent` composition printed on five pages and a README
 * — a line the docs call "a drop-in, not an approximation" that did not typecheck
 * at all. Every one of them is the direct consequence of nothing ever compiling
 * them. The repo mechanically enforces that each element documents an example and
 * that no README imports a removed symbol; it never checked whether the examples
 * RUN.
 *
 * Scope, stated rather than implied: only fences that OPEN WITH AN `import` are
 * compiled. That is the mechanical stand-in for "self-contained", and it is
 * exactly the shape a reader copy-pastes to start from — where all four defects
 * lived. A fragment (a lone method call, a config object) cannot be compiled
 * without inventing the surrounding context, and invented context is how you get a
 * checker whose failures nobody believes. The skipped count is printed, so this
 * never reads as "all snippets verified".
 *
 * Opt out of a single fence with `<!-- doc-check: skip <reason> -->` on the line
 * before it — explicit and greppable.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const DOC_ROOTS = ['apps/docs/src/content/docs'];
const EXTRA_FILES = ['README.md'];
const OUT = '.doc-snippets';

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) yield* walk(path);
        else if (path.endsWith('.md')) yield path;
    }
}

function packageReadmes() {
    const out = [];
    for (const base of ['packages']) {
        const stack = [base];
        while (stack.length) {
            const dir = stack.pop();
            for (const name of readdirSync(dir)) {
                if (name === 'node_modules' || name === 'dist' || name === 'src') continue;
                const path = join(dir, name);
                if (statSync(path).isDirectory()) stack.push(path);
                else if (name === 'README.md') out.push(path);
            }
        }
    }
    return out;
}

const files = [
    ...DOC_ROOTS.flatMap(r => [...walk(r)]),
    ...EXTRA_FILES,
    ...packageReadmes(),
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let compiled = 0;
let skippedFragment = 0;
let skippedExplicit = 0;
const index = [];

for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    let i = 0;
    let n = 0;
    while (i < lines.length) {
        const open = /^```(tsx?)\b/.exec(lines[i] ?? '');
        if (!open) { i++; continue; }
        const lang = open[1];
        const start = i + 1;
        let end = start;
        while (end < lines.length && !/^```\s*$/.test(lines[end] ?? '')) end++;
        const body = lines.slice(start, end).join('\n');
        const skipMarker = /<!--\s*doc-check:\s*skip/.test(lines[i - 1] ?? '');
        i = end + 1;
        n++;

        if (skipMarker) { skippedExplicit++; continue; }
        if (!/^\s*import\s/.test(body)) { skippedFragment++; continue; }

        compiled++;
        const rel = relative(process.cwd(), file).split(sep).join('/');
        const name = `${rel.replace(/[^a-zA-Z0-9]/g, '_')}__${n}.${lang}`;
        writeFileSync(join(OUT, name), `${body}\n`, 'utf8');
        index.push({ name, rel, fence: n });
    }
}

/**
 * One program has to resolve three things a scratch folder cannot see on its own:
 * the workspace's own packages, and the frameworks the wrapper snippets import.
 *
 * `@aparte/*` map to their BUILT `.d.ts` — the same types a consumer installs, and
 * the reason the audit's finding was reproducible: a snippet can typecheck against
 * source while failing against what ships. The frameworks map to the copies the
 * playgrounds already have installed, rather than adding dependencies to the root
 * for the benefit of a checker.
 */
function workspacePaths() {
    const paths = {};
    const roots = ['packages/core', 'packages/engine', 'packages/locales/fr'];
    for (const dir of ['packages/plugins', 'packages/providers/ai', 'packages/wrappers']) {
        for (const name of readdirSync(dir)) {
            if (statSync(join(dir, name)).isDirectory()) roots.push(join(dir, name).split(sep).join('/'));
        }
    }
    for (const root of roots) {
        let pkg;
        try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { continue; }
        const types = join('..', root, 'dist/index.d.ts').split(sep).join('/');
        paths[pkg.name] = [types];
        // Subpath entries a page may import (e.g. @aparte/plugin-shiki/core).
        for (const sub of Object.keys(pkg.exports ?? {})) {
            if (sub === '.' || !sub.startsWith('./') || sub.endsWith('.css')) continue;
            const file = join('..', root, `dist/${sub.slice(2)}.d.ts`).split(sep).join('/');
            paths[`${pkg.name}/${sub.slice(2)}`] = [file];
        }
    }
    const RP = '../apps/playgrounds/react/node_modules';
    const AP = '../apps/playgrounds/angular/node_modules';
    // Optional peers a plugin/provider page legitimately imports. Resolved from the
    // package that declares the peer, so the snippet is checked against the same
    // version a consumer following that page would install.
    Object.assign(paths, {
        marked: ['../packages/plugins/marked/node_modules/marked'],
        shiki: ['../packages/plugins/shiki/node_modules/shiki'],
        // Subpath exports need the concrete declaration file: a `paths` mapping does
        // not consult the target package's own `exports` map.
        'shiki/core': ['../packages/plugins/shiki/node_modules/shiki/dist/core.d.mts'],
        'shiki/engine/javascript': ['../packages/plugins/shiki/node_modules/shiki/dist/engine-javascript.d.mts'],
        '@shikijs/langs/*': ['../packages/plugins/shiki/node_modules/@shikijs/langs/dist/*.d.mts'],
        '@shikijs/themes/*': ['../packages/plugins/shiki/node_modules/@shikijs/themes/dist/*.d.mts'],
        ai: ['../packages/providers/ai/ai-sdk/node_modules/ai'],
        '@ai-sdk/*': ['../packages/providers/ai/ai-sdk/node_modules/@ai-sdk/*'],
    });
    Object.assign(paths, {
        react: [`${RP}/@types/react`],
        'react/jsx-runtime': [`${RP}/@types/react/jsx-runtime`],
        'react-dom': [`${RP}/@types/react-dom`],
        'react-dom/*': [`${RP}/@types/react-dom/*`],
        '@angular/core': [`${AP}/@angular/core`],
        '@angular/common': [`${AP}/@angular/common`],
        rxjs: [`${AP}/rxjs`],
    });
    return paths;
}

writeFileSync(join(OUT, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
        strict: true,
        module: 'esnext',
        target: 'es2022',
        moduleResolution: 'bundler',
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        jsx: 'react-jsx',
        noEmit: true,
        skipLibCheck: true,
        // A doc snippet is an excerpt: an unused import or variable is normal and
        // says nothing about whether the API call is right.
        noUnusedLocals: false,
        noUnusedParameters: false,
        // Node types: several pages document SERVER code (a route handler reading
        // process.env), and a snippet that legitimately uses `process` should not be
        // reported as broken.
        types: ['node'],
        baseUrl: '.',
        paths: workspacePaths(),
    },
    include: ['*.ts', '*.tsx'],
}, null, 2), 'utf8');

let output = '';
let failed = false;
try {
    // The tsc BINARY through node, not `npx`: on Windows `npx` is a .cmd shim that
    // execFileSync cannot spawn directly, which silently produced an empty error
    // report — a checker that fails without saying why.
    const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
    execFileSync(process.execPath, [tsc, '-p', join(OUT, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' });
} catch (err) {
    failed = true;
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
}

if (failed) {
    // Map each scratch filename back to the page and fence it came from.
    const byName = new Map(index.map(e => [e.name, e]));
    const seen = new Set();
    console.error(`\n[doc-snippets] ${compiled} self-contained snippet(s) compiled, some do not typecheck:\n`);
    for (const line of output.split('\n')) {
        const m = /^(?:.*[\\/])?([^\\/(]+\.tsx?)\((\d+),(\d+)\): (error .*)$/.exec(line.trim());
        if (!m) continue;
        const entry = byName.get(m[1]);
        const where = entry ? `${entry.rel} (fence #${entry.fence})` : m[1];
        const key = `${where}:${m[2]}:${m[4]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        console.error(`  ${where}\n    line ${m[2]}: ${m[4]}\n`);
    }
    console.error(
        'A snippet that does not compile is an adopter-blocking defect, not a typo.\n'
        + 'Fix the snippet, or mark the fence with `<!-- doc-check: skip <reason> -->`\n'
        + `if it genuinely cannot stand alone. Scratch files kept in ${OUT}/ for inspection.\n`,
    );
    process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
console.log(
    `[doc-snippets] OK: ${compiled} self-contained snippets compile `
    + `(${skippedFragment} fragments and ${skippedExplicit} explicitly skipped are NOT checked).`,
);
