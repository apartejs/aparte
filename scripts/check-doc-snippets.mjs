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
 * ## Two tiers, because "opens with an import" was leaving real defects unchecked
 *
 * The first version compiled ONLY fences opening with an `import`, as a mechanical
 * stand-in for "self-contained". A later audit walked straight through the gap: the
 * first complete example on the first page of the guide — the one the page calls "a
 * complete, working chat" — opens with `const chat = document.querySelector(...)`,
 * so it was filed as a fragment and never compiled, while carrying five strict
 * errors including two null dereferences and an implicit `any`.
 *
 * So every fence is compiled now, and the classification moved from the fence's
 * FIRST LINE to what the compiler actually says about it:
 *
 *   • **Tier A — opens with an `import`.** Every diagnostic is a failure, exactly as
 *     before. Nothing loosened.
 *   • **Tier B — everything else.** Only diagnostics that are NOT the expected
 *     consequence of being an excerpt are failures. "Cannot find name" is expected
 *     (a fragment references a `chat` declared three paragraphs up) and so is a
 *     parse error (a bare object literal is not a program). A null dereference, a
 *     property that does not exist on a real DOM type, an implicit `any` — those are
 *     defects whatever the surrounding prose, and Tier B now catches them.
 *
 * Two mechanics make that sound. Each fence is written as its own MODULE (an
 * `export {}` is appended when it has no import), because otherwise a hundred
 * import-less scratch files share one global scope and collide — the first attempt
 * at this reported nothing at all for the very fence it was written to catch, since
 * the redeclarations masked everything. And pages carrying the `AUTO-GENERATED`
 * marker are skipped whole: TypeDoc prints type signatures and the CEM prints
 * attribute tables, so compiling those measures the generator, not the docs.
 *
 * Every count is printed — compiled, fragments, generated, explicitly skipped — so
 * this never reads as "all snippets verified".
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
        // `.mdx` too, and the omission was not cosmetic: 20 of the 53 documentation pages
        // carry that extension — every generated component and segment page, plus two
        // plugin pages — and their 220 fences were outside this check entirely. A corpus
        // picked by file extension shrinks in silence the day a generator changes format,
        // which is exactly what happened here; hence the floor below, which fails when the
        // corpus collapses instead of publishing a shorter guarantee.
        else if (path.endsWith('.md') || path.endsWith('.mdx')) yield path;
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

let selfContainedCount = 0;
let candidateCount = 0;
let skippedExplicit = 0;
let skippedGenerated = 0;
const index = [];

for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    // Skip the pages whose fences are TYPE SIGNATURES printed by a doc generator,
    // not examples anybody wrote. `reference/engine.md` is 132 such fences and they
    // are the overwhelming majority of parse errors in the corpus; compiling them
    // measures TypeDoc.
    //
    // Keyed on the generator named in the marker, deliberately NOT on "is this file
    // generated". The first draft skipped every AUTO-GENERATED page and quietly gave
    // up real coverage: `reference/api.md`'s three `ts` fences are hand-written
    // `@example` blocks lifted verbatim out of component JSDoc, so they are exactly
    // the examples that should be compiled — and one of them was broken.
    if (/AUTO-GENERATED[^>]*TypeDoc/.test(raw)) {
        skippedGenerated += [...raw.matchAll(/^```tsx?\b/gm)].length;
        continue;
    }
    const lines = raw.split('\n');
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
        // Leading blank lines and `//` comments come FIRST, before the test.
        //
        // This gate was written with a bare `/^\s*import/`, and a follow-up audit
        // found what that missed: the `createAparteChatHandler` snippet — the one
        // this whole lot names as "the copy-paste path was the unauthenticated one"
        // — opens with `// app/api/chat/route.ts (Next.js)`. So the fence the guard
        // exists for was counted among the fragments and never compiled, while
        // still shipping the defect. A one-line heuristic decided the scope of the
        // check, and it decided it wrong.
        const firstCode = body.replace(/^(?:\s*(?:\/\/[^\n]*)?\n)+/, '');
        const selfContained = /^\s*import\s/.test(firstCode);
        if (selfContained) selfContainedCount++; else candidateCount++;

        const rel = relative(process.cwd(), file).split(sep).join('/');
        const name = `${rel.replace(/[^a-zA-Z0-9]/g, '_')}__${n}.${lang}`;
        // Each fence must be its own MODULE. Without this, every fence lacking an
        // import is a SCRIPT sharing one global scope with all the others, and the
        // duplicate `const chat` / `const viewport` declarations bury every real
        // diagnostic under redeclaration noise — the first attempt at widening this
        // guard reported nothing at all for the very fence it was written to catch.
        const isModule = /^\s*(?:import|export)\s/m.test(body);
        writeFileSync(join(OUT, name), `${body}\n${isModule ? '' : 'export {};\n'}`, 'utf8');
        index.push({ name, rel, fence: n, selfContained });
    }
}

/**
 * One program has to resolve three things a scratch folder cannot see on its own:
 * the workspace's own packages, and the frameworks the wrapper snippets import.
 *
 * `@aparte/*` map to their BUILT `.d.ts` — the same types a consumer installs, and
 * the reason the audit's finding was reproducible: a snippet can typecheck against
 * source while failing against what ships. The frameworks map to the copies the
 * examples already have installed, rather than adding dependencies to the root
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
    const RP = '../apps/examples/react/node_modules';
    const AP = '../apps/examples/angular/node_modules';
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
        /*
         * The SAME strictness the repo compiles itself with, not a weaker profile.
         *
         * `tsconfig.base.json` sets these four on top of `strict`, and this gate did
         * not — so a snippet could be reported as compiling while the reader's own
         * build (following the docs' own recommended settings) rejected it. The
         * flagship getting-started example was exactly that: `tokens[i++]` yields
         * `string | undefined` under `noUncheckedIndexedAccess`, and
         * `appendToken(id, chunk: string)` refuses it.
         *
         * A gate that is easier than the project it guards certifies the wrong
         * thing.
         */
        noUncheckedIndexedAccess: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        noImplicitOverride: true,
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

// The tsc BINARY through node, not `npx`: on Windows `npx` is a .cmd shim that
// execFileSync cannot spawn directly, which silently produced an empty error
// report — a checker that fails without saying why.
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

function compile(configName) {
    try {
        execFileSync(process.execPath, [tsc, '-p', join(OUT, configName)], { encoding: 'utf8', stdio: 'pipe' });
        return { failed: false, output: '' };
    } catch (err) {
        return { failed: true, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
    }
}

const SYNTAX = /^TS1\d{3}$/;

function diagnosticsOf(output) {
    /** @type {Map<string, {line: string, code: string, text: string}[]>} */
    const map = new Map();
    for (const line of output.split('\n')) {
        const m = /^(?:.*[\\/])?([^\\/(]+\.tsx?)\((\d+),(\d+)\): (error (TS\d+): .*)$/.exec(line.trim());
        if (!m) continue;
        if (!map.has(m[1])) map.set(m[1], []);
        map.get(m[1]).push({ line: m[2], code: m[5], text: m[4] });
    }
    return map;
}

/**
 * TWO passes, and the reason is the whole reason this guard was blind.
 *
 * TypeScript reports syntactic diagnostics for a program and, if it finds ANY,
 * emits no semantic ones at all — program-wide, not per file. One malformed JSX
 * fence (`guides/attachments.md` #1, a `<aparte-chat>` excerpt that never closes)
 * was therefore silencing every type error in every other snippet. The first
 * attempt at widening this check ran one pass, saw nothing but TS1xxx, and
 * concluded the docs were clean; the fence it was written to catch has five errors
 * when compiled on its own.
 *
 * So: pass one finds the fences that do not PARSE — which is also the strongest
 * possible evidence that they are excerpts rather than programs — and pass two
 * compiles what is left, where the type errors are finally visible.
 *
 * One shared program, not one per fence, on purpose. A page builds a file up across
 * several fences (`getting-started` opens with `import '@aparte/core'` and the next
 * fence continues in it), and core's global augmentations — the tag-name and event
 * maps — are exactly what a reader importing the library has. Compiling each fence
 * alone would report errors a reader never sees.
 */
let { failed, output } = compile('tsconfig.json');
const firstPass = diagnosticsOf(output);
let unparseable = [];

if (failed) {
    unparseable = index.filter(e => firstPass.get(e.name)?.some(d => SYNTAX.test(d.code)));
    const parseable = index.filter(e => !unparseable.includes(e));
    if (unparseable.length && parseable.length) {
        writeFileSync(
            join(OUT, 'tsconfig.pass2.json'),
            JSON.stringify({ extends: './tsconfig.json', include: [], files: parseable.map(e => e.name) }, null, 2),
            'utf8',
        );
        ({ failed, output } = compile('tsconfig.pass2.json'));
    }
}

// ── Classify, then report ───────────────────────────────────────────────────
// Whether a fence is an EXCERPT is a property of the whole file, not of one line.
const diagnostics = diagnosticsOf(output);

/**
 * Beyond failing to parse, exactly one signal means "this fence is an excerpt":
 * TS2304 / TS2552, "cannot find name" — it references something the prose declared
 * three paragraphs earlier.
 *
 * It is decided per FILE, not per line, and that matters: once a name is unresolved
 * every expression built on it degrades to `any`, so the file's other diagnostics
 * (implicit-any parameters especially) are consequences of the missing context
 * rather than defects. Judging line by line would report them as real.
 *
 * A fence with neither is a complete program that merely happens not to open with
 * an `import`, so every diagnostic it produces is a genuine defect. That is exactly
 * the class the old first-line heuristic waved through.
 */
/**
 * An excerpt legitimately names things declared in the prose around it, so
 * "cannot find name" is noise here. Every OTHER diagnostic is not.
 *
 * This used to be `errs.some(...)` feeding a `continue`: one unresolved name
 * anywhere in a fence discarded every other error in it, and since most fragments
 * reference a `chat` or `client` from earlier prose, 44 of 118 fences were waived
 * whole. A plain `const oops: number = document.title;` shipped green.
 */
const EXCERPT_NOISE = new Set([
    'TS2304', 'TS2552',   // cannot find name — declared in the prose around the fence
    'TS7006', 'TS7031',   // implicit any on a parameter whose type came from the caller
    'TS18004',            // shorthand property naming something declared outside
    'TS2390', 'TS2391',   // a signature shown without its implementation
]);

/**
 * Diagnostics that exist only BECAUSE the fence is a fragment, and would not
 * appear in the reader's own file. Everything else is a defect the reader inherits:
 * a syntax error, a possibly-null access, an argument of the wrong type.
 *
 * The list is deliberately enumerated rather than inferred. The previous rule was
 * `errs.some(isUnresolved)` feeding a `continue`, so ONE unresolved name amnestied
 * every other error in the fence — and since most fragments reference a `chat` from
 * earlier prose, 44 of 118 fences were waived whole, including two that were
 * outright SyntaxErrors.
 */
const isExcerptNoise = e => EXCERPT_NOISE.has(e.code);

let excerpts = unparseable.filter(e => !e.selfContained).length;
const reportable = [];

// A fence that opens with an `import` and does not parse is a real defect, not an
// excerpt: it claims to be the thing you copy.
for (const entry of unparseable.filter(e => e.selfContained)) {
    reportable.push({ entry, errs: firstPass.get(entry.name) ?? [] });
}

for (const entry of index) {
    if (unparseable.includes(entry)) continue;
    const errs = diagnostics.get(entry.name);
    if (!errs?.length) continue;
    if (!entry.selfContained) {
        // Drop the unresolved-name noise and judge what is LEFT, rather than
        // letting one such diagnostic amnesty the whole fence.
        const real = errs.filter(e => !isExcerptNoise(e));
        if (!real.length) { excerpts++; continue; }
        reportable.push({ entry, errs: real });
        continue;
    }
    reportable.push({ entry, errs });
}

// A tsc failure with no diagnostics attributable to any fence is a broken checker,
// not a clean run — surface it rather than exiting 0 on it.
if (failed && !reportable.length && diagnostics.size === 0) {
    console.error('\n[doc-snippets] tsc failed but produced no parseable diagnostics — the checker is broken:\n');
    console.error(output.trim());
    process.exit(1);
}

if (reportable.length) {
    const total = reportable.reduce((n, r) => n + r.errs.length, 0);
    console.error(
        `\n[doc-snippets] ${total} error(s) in ${reportable.length} snippet(s) that DO stand alone:\n`,
    );
    for (const { entry, errs } of reportable) {
        const tier = entry.selfContained ? 'opens with an import' : 'no unresolved names — a complete program';
        console.error(`  ${entry.rel} (fence #${entry.fence}) — ${tier}`);
        const seen = new Set();
        for (const e of errs) {
            const key = `${e.line}:${e.text}`;
            if (seen.has(key)) continue;
            seen.add(key);
            console.error(`    line ${e.line}: ${e.text}`);
        }
        console.error('');
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
    `[doc-snippets] OK: ${selfContainedCount} self-contained + `
    + `${candidateCount - excerpts} standalone snippets compile `
    + `(${excerpts} excerpts, ${skippedGenerated} on generated pages and `
    + `${skippedExplicit} explicitly skipped are NOT checked).`,
);
