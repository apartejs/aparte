/*
 * Every custom element must carry a worked example.
 *
 * This is the mechanical form of the rule ratified decision #4 now states: a capability
 * cited in passing, with no example, is functionally invisible. The first external
 * consumer read the page that named the composer's footer slots and built a workaround
 * anyway, because a name in an enumeration is not a usage.
 *
 * Note what this does NOT check: presence of the NAME. A "does every export appear in the
 * docs?" gate would have gone green on that friction -- the names were there. Only the
 * example is missing when this fails, which is the thing that was missing.
 *
 * Reads the built manifest, so it runs after `pnpm build` in the gate (like
 * check-published-readmes). `@example` blocks reach it via the analyzer plugin in
 * packages/core/custom-elements-manifest.config.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CEM = resolve(here, '../packages/core/dist/custom-elements.json');

if (!existsSync(CEM)) {
    console.error(`[element-examples] no manifest at ${CEM} — build @aparte/core first.`);
    process.exit(1);
}

const manifest = JSON.parse(readFileSync(CEM, 'utf8'));
const elements = (manifest.modules ?? [])
    .flatMap((m) => m.declarations ?? [])
    .filter((d) => d.customElement);

if (!elements.length) {
    console.error('[element-examples] the manifest declares no custom element at all — that is not a pass.');
    process.exit(1);
}

const hasExample = (el) =>
    Boolean(el.examples?.length) || (el.members ?? []).some((m) => m.examples?.length);

const missing = elements.filter((el) => !hasExample(el)).map((el) => el.tagName ?? el.name);

if (missing.length) {
    console.error(`\n[element-examples] ${missing.length} element(s) with no @example:\n`);
    for (const tag of missing) console.error(`  <${tag}>`);
    console.error(
        '\nAdd an `@example` to the class JSDoc. One caveat worth knowing: the comment must be\n' +
        'ATTACHED to the class — a docblock separated from it by imports or interfaces floats,\n' +
        'TypeScript does not associate it, and the example silently goes nowhere.\n',
    );
    process.exit(1);
}

console.log(`[element-examples] OK: all ${elements.length} elements document a usage.`);
