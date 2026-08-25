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

const events = elements.flatMap((el) => (el.events ?? []).map((e) => ({ ...e, tag: el.tagName })));

/*
 * An event that CARRIES a detail must declare it — `@fires {CustomEvent<X>} name`.
 *
 * This block used to COUNT typed details and print the number. Counting is not a
 * guard: dropping the type argument from a `@fires` left this green, all 109 Angular
 * tests green, and turned the generated Angular `@Output()` into
 * `EventEmitter<void>` with a listener that discards `$event` — so the payload became
 * unreachable from a template. Verified by sabotage, not deduced.
 *
 * The rule is DERIVED rather than a list somebody has to remember: `event-map.ts` is
 * the repo's declaration of which events carry a detail, and it is already guarded in
 * both directions by `check:event-map`. So an event typed there must be typed here.
 * The five genuinely detail-less events (`aparte-cancel`, `aparte-composer-submit`,
 * `aparte-reset-done`, `aparte-select-open`, `aparte-select-close`) are absent from the
 * map by a documented decision, and stay exempt automatically.
 */
const MAP_FILE = resolve(here, '..', 'packages/core/src/types/event-map.ts');
const mapSrc = readFileSync(MAP_FILE, 'utf8');
const carriesDetail = new Set(
    [...mapSrc.matchAll(/^\s*'(aparte-[a-z0-9-]+)':\s*CustomEvent</gm)].map((m) => m[1]),
);
if (carriesDetail.size === 0) {
    console.error(`[element-examples] FAIL: parsed zero entries out of ${MAP_FILE} — the format this guard reads has changed.`);
    process.exit(1);
}

const untyped = events.filter(
    (e) => carriesDetail.has(e.name) && !(e.type?.text ?? '').includes('<'),
);
if (untyped.length) {
    console.error('[element-examples] FAIL: an event that carries a detail does not declare it.\n');
    for (const e of untyped) {
        console.error(`  ${e.tag} — @fires ${e.name}`);
    }
    console.error(
        '\nWrite `@fires {CustomEvent<TheDetailType>} ' + untyped[0].name + ' - …`.\n' +
        '\nWhy this is not cosmetic: a bare `@fires` records `CustomEvent` with no type\n' +
        'argument, and scripts/gen-element-bindings.mjs then emits `EventEmitter<void>` with\n' +
        'a `@HostListener` that drops `$event`. The detail becomes unreachable from an\n' +
        'Angular template, and no test notices, because asserting that an event FIRED still\n' +
        'passes.\n' +
        '\nThe list of events that carry a detail is event-map.ts — not a list here.\n',
    );
    process.exit(1);
}

const typed = events.filter((e) => (e.type?.text ?? '').includes('<')).length;
console.log(
    `[element-examples] OK: all ${elements.length} elements document a usage, every` +
    ` attribute and event carries a description, and every event with a detail declares` +
    ` its type (${events.length} events, ${typed} typed).`,
);
