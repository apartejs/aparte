/**
 * Two browser APIs exist only in a secure context — so each may be called in exactly
 * one place, behind a fallback.
 *
 * `crypto.randomUUID` is confined to `uuid()`. Why a gate. A cold audit found 27 call
 * sites across ten files and exactly TWO guarded. The first thing that broke was the
 * stream parser: `_generateId()` runs from `_createTextSegment`, so `parse('hello')`
 * threw on the first token of the first reply. Served over `http://192.168.1.x` — a
 * local model on the LAN box, which is this library's own archetypal deployment — the
 * chat simply did not work.
 *
 * The two guarded sites are why this is a gate and not a one-off fix: someone
 * already knew, guarded the two files they were touching, and the other twenty-five
 * kept accumulating. A sweep with no gate is a sweep that comes undone.
 *
 * `navigator.clipboard` is confined to `copyText()`, found the same way while writing
 * the support matrix: three copy buttons, three `.catch()` for a rejected write, and on
 * plain http the property is not a rejecting promise but `undefined` — a TypeError in
 * the click handler, before any `.catch()`, so the button did nothing and said nothing.
 *
 * A note on how to test the first, because it cost real time: deleting `randomUUID`
 * from the crypto INSTANCE does nothing — it lives on `Crypto.prototype`, so `delete`
 * returns true and the function is still there. A probe that does not delete from
 * the prototype will happily report that everything is fine.
 *
 * Run by `pnpm gate`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOTS = ['packages'];

/** Each API, the one file allowed to call it, and what everyone else calls instead. */
const CONFINED = [
    {
        api: 'crypto.randomUUID',
        home: join('packages', 'core', 'src', 'utils', 'uuid.ts'),
        use: 'uuid()',
    },
    {
        api: 'navigator.clipboard',
        home: join('packages', 'core', 'src', 'utils', 'copy-text.ts'),
        use: 'copyText()',
    },
];

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            if (['node_modules', 'dist', '.svelte-kit', '__tests__'].includes(name)) continue;
            yield* walk(path);
        } else if (/\.(ts|tsx|svelte|vue)$/.test(path) && !/\.test\.ts$/.test(path)) {
            yield path;
        }
    }
}

const offenders = [];
let scanned = 0;

for (const root of ROOTS) {
    for (const file of walk(root)) {
        scanned++;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
            // Skip comments: prose may legitimately name the API (this file's own
            // reasoning, a JSDoc explaining the fallback).
            const t = line.trim();
            if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
            for (const { api, home, use } of CONFINED) {
                if (file === home || !line.includes(api)) continue;
                offenders.push({ api, home, use, where: `${relative(process.cwd(), file).split(sep).join('/')}:${i + 1}  ${t.slice(0, 88)}` });
            }
        });
    }
}

if (offenders.length) {
    console.error(`\n[secure-context] ${offenders.length} direct call(s) to a secure-context-only API:\n`);
    for (const o of offenders) console.error(`  ${o.api}  ${o.where}`);
    console.error(
        '\nNeither exists outside a secure context, so this throws on plain http://'
        + '\n— including an IP on the LAN, which is where a local-model consumer runs.',
    );
    for (const { api, home, use } of CONFINED) {
        if (offenders.some((o) => o.api === api)) {
            console.error(`Use \`${use}\` (${home.split(sep).join('/')}), exported from @aparte/core, instead of ${api}.`);
        }
    }
    console.error('');
    process.exit(1);
}

console.log(`[secure-context] OK: ${scanned} files, ${CONFINED.map((c) => `${c.api} confined to ${c.use}`).join(', ')}.`);
