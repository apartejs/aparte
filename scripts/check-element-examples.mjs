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
 *
 * ## The second check: a declared surface is a DESCRIBED surface
 *
 * The adjacency caveat in the failure message below is not hypothetical, and it was
 * costing more than examples. Four elements carried a full `@element` / `@attr` /
 * `@fires` block at the top of their file, separated from the class by imports and
 * interfaces, with a second `@example`-only block sitting adjacent instead. The
 * examples passed; every authored description was silently dropped. `<aparte-select>`
 * still listed six attributes and three events, because the analyser reads
 * `observedAttributes` and `this.dispatchEvent` structurally — so nothing looked
 * missing, the prose just went blank, and the generated reference page shipped rows
 * like `| aparte-cancel |  |`.
 *
 * That failure mode is SILENCE, so the only way to see it is to require the text. An
 * element, every attribute it declares and every event it fires must carry a
 * description. This is also what a typed framework wrapper reads to build its
 * Inputs and Outputs, which is the second reason a blank one is not acceptable.
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

const described = (text) => Boolean((text ?? '').trim());

/** Every gap on one element, as `attr:name` / `event:name` / `element`. */
const gapsOn = (el) => [
    ...(described(el.description) ? [] : ['element (no free text before @element?)']),
    ...(el.attributes ?? []).filter((a) => !described(a.description)).map((a) => `attr:${a.name}`),
    ...(el.events ?? []).filter((e) => !described(e.description)).map((e) => `event:${e.name}`),
];

const undescribed = elements
    .map((el) => ({ tag: el.tagName ?? el.name, gaps: gapsOn(el) }))
    .filter((row) => row.gaps.length);

if (undescribed.length) {
    const total = undescribed.reduce((n, row) => n + row.gaps.length, 0);
    console.error(`\n[element-examples] ${total} undescribed item(s) across ${undescribed.length} element(s):\n`);
    for (const { tag, gaps } of undescribed) {
        console.error(`  <${tag}>`);
        for (const gap of gaps) console.error(`      ${gap}`);
    }
    console.error(
        '\nTwo causes, and both are silent:\n' +
        '  - the docblock FLOATED. It must be the comment physically adjacent to the class;\n' +
        '    an import or an interface between them and TypeScript associates nothing, while\n' +
        '    the analyser still reports the attribute or event it found in the code.\n' +
        '  - `@element` opened the block, leaving no free text for the description.\n' +
        '    Put one prose line above it.\n' +
        '\nAn attribute the code observes, or an event the code fires, with no sentence saying\n' +
        'what it is for, is an API a consumer has to read our source to use.\n',
    );
    process.exit(1);
}

const events = elements.flatMap((el) => el.events ?? []);
const typed = events.filter((e) => (e.type?.text ?? '').includes('<')).length;
console.log(
    `[element-examples] OK: all ${elements.length} elements document a usage, and every` +
    ` attribute and event carries a description (${events.length} events, ${typed} with a typed detail).`,
);
