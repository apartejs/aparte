/*
 * Generate the framework bindings for every custom element, from the manifest.
 *
 * ## Why this exists, written down because I argued against it and was wrong
 *
 * The plan for the typed element surface said, in as many words: "no generator from the
 * CEM — a build step, a template language and one more guard, for ~18 thin files; the
 * three-duplications rule does not justify it." That weighed the cost of TYPING the
 * files and ignored the cost of KEEPING them. They are a parallel structure over the
 * same facts, and nothing watched them: add an attribute to a core element and the
 * manifest sees it, the registry sees it, React/Vue/Svelte type it through a mapped
 * type — and Angular silently does not, because an `@Input()` is a hand-written member.
 * Nothing goes red. Two days later the Angular wrapper is quietly behind.
 *
 * That is the same defect the whole lot existed to remove: the orphaned docblocks whose
 * prose was dropped in silence, `APARTE_DEFAULT_UI_EVENTS` carrying 7 of 25 while
 * claiming to be "verified against core". I named it and then chose it.
 *
 * The repo already had two working answers for this shape and I used neither:
 * `check-event-map.mjs` guards a hand-maintained map in BOTH directions, and the docs'
 * two generated reference pages are gitignored and rebuilt, so they cannot drift at all.
 * This follows the second: everything here is generated into a gitignored directory
 * during the package build, so there is no artifact to fall behind and no guard needed.
 *
 * ## What is derived, and what cannot be
 *
 * Derived from the manifest — which is derived from the element's own JSDoc: the tag, its
 * attributes and their types, its events and their detail types, and every description.
 *
 * NOT derivable, and this is why there is a config file rather than a pure function:
 *
 *   - `<aparte-chat-bubble role>` is the message role, and `role` is also ARIA's. An
 *     Angular `@Input() role` would shadow it in every template, so it is renamed.
 *   - `<aparte-composer-toolbar data-empty>` is reflected BY the element onto itself. It
 *     is a real attribute, so it stays in the type; it must not become an Input, or a
 *     template would fight the element for a value the element owns.
 *
 * Both are judgment calls about names and ownership, which no metadata carries. They
 * live in `element-bindings.config.mjs` beside the package, so the exception is visible
 * rather than hidden in a generator branch.
 *
 * ## The chat's event bindings
 *
 * `<aparte-chat>`'s `@fires` are every event a listener on the chat's root hears
 * (`chat-surface.mjs`; `check-event-map` rule 5 holds them true). From them, one explicit
 * file per wrapper: React's callback props, Vue's emits, Svelte's dispatcher details and
 * runes callbacks, and an abstract Angular directive the chat component extends. So an
 * event added to core reaches the five chat components with no edit. Explicit literal
 * types, never a mapped one: Vue's SFC compiler resolves no `keyof` in `defineEmits`.
 *
 * A binding's NAME is the one fact here that can break a framework, so it is checked
 * rather than trusted (`bindingName`, shared with the Angular directives' outputs):
 * a native DOM event (Angular's `(x)` binds the DOM event `x` AND the output `x`, so it
 * fires twice), a name the chat components already give a host callback, and two events
 * on one name are refused, each naming the event and the `bindingRenames` entry to add.
 *
 * ## A React component per element, and the members Vue and Svelte type
 *
 * `--react-elements` writes `element-components.ts`: one component per element but the chat,
 * from the same manifest and the same naming function as the Angular outputs, so a property-only
 * member (`conversations`) is a prop and an event a callback — React 18 binds neither on a raw
 * tag, and React 19 decides per prop (`createAparteElement`, in the React package, says what a
 * component does with a row). `--element-members` writes `element-members.ts`: every element's
 * property-only members and the events it sends, which the Vue and Svelte typings read, since
 * the attribute registry covers attributes only and a property or an event is not one.
 *
 * Usage: node scripts/gen-element-bindings.mjs <packageDir> [--registry <dir>] [--angular <dir>]
 *            [--react-elements <dir> [--react-barrel <file>]] [--element-members <dir>]
 *            [--chat-react <dir>] [--chat-vue <dir>] [--chat-svelte <dir>] [--config <file>]
 *
 * `--angular` also writes the chat's base (`chat-events.ts`) when the manifest declares
 * `<aparte-chat>`: core's does, a plugin's does not. `--react-barrel` is the React package's
 * barrel, which the components' names are checked against (by default the `index.ts` beside the
 * output directory). `--config` reads another bindings config than the package's own, so a test
 * can run the script over a doctored one.
 *
 * This line used to promise a `[--check]` flag that was never implemented — passing it
 * regenerated silently instead of verifying. It is not added, because the need it would
 * serve was measured and does not exist: a hand-edited generated file is wiped both by a
 * fresh `pnpm build` AND by a fully cached one, since nx restores its own output over the
 * edit. These files cannot drift, so there is nothing for a check mode to catch.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHAT_TAG, checkChatSurface, readChatEvents, readChatTree } from './chat-surface.mjs';
import { stripComments } from './dispatch-sites.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const require = createRequire(import.meta.url);

/** A repo-relative path with forward slashes, for a message. */
const repoRel = (abs) => relative(root, abs).split(sep).join('/');

const BANNER =
    '// AUTO-GENERATED by scripts/gen-element-bindings.mjs from this package\'s\n' +
    '// custom-elements.json. Do not edit: it is gitignored and rewritten every build.\n' +
    '// The source of every fact below is the element\'s own JSDoc.\n';

/** `aparte-chat-bubble` → `AparteChatBubble`. */
const pascal = (tag) => tag.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

/** `max-height` → `maxHeight`, for an Angular Input name. */
const camel = (attr) => attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * An element's one-line summary: its first PARAGRAPH, rewrapped onto one line.
 *
 * Taking the first LINE truncated mid-sentence — the model selector came out as
 * "Renders an `<aparte-select>` with providers" — because a docblock wraps its prose at
 * 80 columns, so a sentence is usually two lines.
 */
const summary = (text) => (text ?? '').split(/\n\s*\n/)[0].split('\n').map((l) => l.trim()).join(' ').trim();

/** One `/** … *\/` block, indented, from a description that may be absent or multi-line. */
function doc(text, indent = '    ') {
    const body = (text ?? '').trim();
    if (!body) return '';
    const lines = body.split('\n').map((l) => l.trim());
    if (lines.length === 1) return `${indent}/** ${lines[0]} */\n`;
    return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`).join('\n')}\n${indent} */\n`;
}

/**
 * The custom elements a package's manifest declares, by tag. Throws, rather than exits, so a
 * test can read the real manifest and fail on a missing build with a message.
 */
export function readElements(pkgDir) {
    const p = join(pkgDir, 'dist', 'custom-elements.json');
    if (!existsSync(p)) throw new Error(`no manifest at ${p} — build the package first.`);
    const manifest = JSON.parse(readFileSync(p, 'utf8'));
    const elements = (manifest.modules ?? [])
        .flatMap((m) => m.declarations ?? [])
        .filter((d) => d.customElement && d.tagName)
        .sort((a, b) => a.tagName.localeCompare(b.tagName));
    if (!elements.length) throw new Error('the manifest declares no custom element — that is not a pass.');
    return elements;
}

function readManifest(pkgDir) {
    try {
        return readElements(pkgDir);
    } catch (error) {
        console.error(`[element-bindings] ${error.message}`);
        process.exit(1);
    }
}

async function readConfig(file) {
    const defaults = { angularInputRename: {}, angularInputOmit: {}, bindingRenames: {} };
    if (!existsSync(file)) return defaults;
    const mod = await import(pathToFileURL(file).href);
    return { ...defaults, ...mod.default };
}

// ─────────────────────────────────────────────────────────────────────────────
// The attribute registry: one interface per element, plus the tag → interface map.
// ─────────────────────────────────────────────────────────────────────────────
function renderAttributes(elements, config) {
    let out = BANNER + '\n';
    const empties = [];

    for (const el of elements) {
        const name = `${pascal(el.tagName)}Attributes`;
        const attrs = el.attributes ?? [];
        if (!attrs.length) { empties.push(el.tagName); continue; }

        out += doc(`\`<${el.tagName}>\`${el.description ? ` — ${summary(el.description)}` : ''}`, '');
        out += `export interface ${name} {\n`;
        for (const a of attrs) {
            out += doc(a.description, '    ');
            // A three-state boolean is `boolean | 'false'` so the template types can
            // express OFF. `AparteAttrValue` distributes over the union, so it lands on
            // `'' | 'false' | null | undefined` — presence-on, string-off — with no
            // change to the mapping type itself.
            const declared = a.type?.text ?? 'string';
            const widened = isThreeState(config, el.tagName, a.name) ? `${declared} | 'false'` : declared;
            out += `    ${/^[a-z][a-zA-Z0-9]*$/.test(a.name) ? a.name : `'${a.name}'`}?: ${widened};\n`;
        }
        out += '}\n\n';
    }

    // Only when there ARE any: with none, the sentence rendered as `"not looked at": .`
    // and the type was exported for nobody.
    if (empties.length) {
        out += '/**\n';
        out += ' * The elements that observe no attribute at all. An empty surface is the honest\n';
        out += ' * declaration — it says "checked, there are none", where an absent entry would only\n';
        out += ` * say "not looked at": ${empties.map((t) => `\`<${t}>\``).join(', ')}.\n`;
        out += ' */\n';
        out += 'export type AparteNoAttributes = Record<never, never>;\n\n';
    }

    out += '/**\n';
    out += ' * Tag name to its attribute surface — the registry every wrapper maps over.\n';
    out += ' *\n';
    out += ' * Total by construction: it is generated from the manifest, so an element cannot be\n';
    out += ' * missing from it, which is the property a hand-written list could not have.\n';
    out += ' */\n';
    out += 'export interface AparteElementAttributes {\n';
    for (const el of elements) {
        const t = (el.attributes ?? []).length ? `${pascal(el.tagName)}Attributes` : 'AparteNoAttributes';
        out += `    '${el.tagName}': ${t};\n`;
    }
    out += '}\n\n';
    out += '/** Every tag this package defines, derived from the registry so the two cannot diverge. */\n';
    out += 'export type AparteElementTagName = keyof AparteElementAttributes;\n';
    return out;
}


// ─────────────────────────────────────────────────────────────────────────────
// The Angular directives: one per element, selector = the tag.
//
// This is the output that could not be a mapped type. React, Vue and Svelte learn a tag
// through a declaration merge, so `[K in AparteElementTagName]` types all of them with no
// code at all — add an element to the registry and the three are done. Angular needs a
// CLASS: its template compiler must have something claiming the selector, and
// `[placeholder]="x"` on a custom element writes a property, which on an attribute-driven
// element is a silent no-op or a throw. TypeScript cannot emit a class from a type, so
// this is the one binding that has to be generated rather than derived.
// ─────────────────────────────────────────────────────────────────────────────

/** `aparte-select-change` → `selectChange`: the name every binding starts from. */
export const outputName = (event) => camel(event.replace(/^aparte-/, ''));

/**
 * The name `event` binds under on `tag`, in every framework: {@link outputName}, unless the
 * bindings config names it otherwise for that element in `bindingRenames`.
 *
 * One function for the chat's bindings and the Angular directives' outputs, so the two
 * cannot spell one event two ways. Keyed by element because a rename is a fact about one
 * surface: the chat publishes `aparte-send` as `messageSent`, its name in all four wrappers
 * long before this file, while the composer directive's `(send)` stays what it was.
 */
export const bindingName = (tag, event, config) => config.bindingRenames?.[tag]?.[event] ?? outputName(event);

/** The DOM's event maps whose names a binding must not take, with what each extends. */
const NATIVE_MAPS = ['HTMLElementEventMap', 'GlobalEventHandlersEventMap', 'WindowEventMap'];

/**
 * Every native DOM event name, read from TypeScript's own `lib.dom.d.ts`: the keys of
 * {@link NATIVE_MAPS} and of every map they extend (`ElementEventMap`,
 * `WindowEventHandlersEventMap`).
 *
 * Why a binding must stay out of them: an Angular template's `(x)` listens to the DOM event
 * `x` AND subscribes to the output `x`. An output named like a DOM event therefore fires
 * twice when both happen, and runs for every native `x` that bubbles to the element — the
 * composer directive's `(cancel)` did, for a file picker closed with no choice.
 */
export function readNativeEventNames(file = require.resolve('typescript/lib/lib.dom.d.ts')) {
    const src = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const maps = new Map();
    for (const m of src.matchAll(/^interface (\w+EventMap)(?: extends ([\w ,]+))? \{\n([\s\S]*?)^\}/gm)) {
        maps.set(m[1], {
            bases: (m[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
            keys: [...m[3].matchAll(/^\s+"([^"]+)":/gm)].map((k) => k[1]),
        });
    }
    const names = new Set();
    const seen = new Set();
    const visit = (name) => {
        if (seen.has(name)) return;
        seen.add(name);
        const map = maps.get(name);
        if (!map) throw new Error(`[element-bindings] no \`interface ${name}\` in ${file}: the lib.dom.d.ts format changed.`);
        for (const key of map.keys) names.add(key);
        for (const base of map.bases) visit(base);
    };
    for (const name of NATIVE_MAPS) visit(name);
    // A collapsed reading would let every name through, which is the one outcome worse than none.
    if (!names.has('click') || !names.has('cancel') || names.size < 100) {
        throw new Error(`[element-bindings] read only ${names.size} native event names from ${file}: the reader broke.`);
    }
    return names;
}

/**
 * What is wrong with the names one surface binds: `pairs` is `[{ event, name }]`. A native
 * DOM event, a `reserved` name (name → what it already is), and a name two events share.
 */
function bindingProblems(tag, pairs, { native, reserved = new Map(), configPath }) {
    const problems = [];
    const fix = (event) => `Name it in \`bindingRenames['${tag}']['${event}']\` in ${configPath}.`;
    const taken = new Map();
    for (const { event, name } of pairs) {
        if (native.has(name)) {
            problems.push(
                `<${tag}>: "${event}" would bind as \`${name}\`, a native DOM event. Angular's \`(${name})\` listens to\n`
                + `      the DOM event AND to the output, so it would fire twice and catch every native \`${name}\`\n`
                + `      that bubbles to the element. ${fix(event)}`,
            );
        }
        if (reserved.has(name)) {
            problems.push(`<${tag}>: "${event}" would bind as \`${name}\`, already taken: ${reserved.get(name)}.\n      ${fix(event)}`);
        }
        if (taken.has(name)) {
            problems.push(
                `<${tag}>: "${taken.get(name)}" and "${event}" both bind as \`${name}\`.\n`
                + `      Rename one in \`bindingRenames['${tag}']\` in ${configPath}.`,
            );
        } else {
            taken.set(name, event);
        }
    }
    return problems;
}

/** Stop here, with every problem found: nothing is written. */
function refuse(problems) {
    if (!problems.length) return;
    throw Object.assign(new Error(problems.map((p) => `  - ${p}`).join('\n')), { refusal: true });
}

/**
 * Is this attribute a THREE-STATE boolean — default on, off only via the literal
 * `"false"` — rather than a presence attribute?
 *
 * The manifest cannot say: it records `{boolean}` for both shapes. The list lives in
 * `element-bindings.config.mjs`, because getting it wrong inverts a control silently,
 * which is exactly what `[multiple]="false"` did.
 */
const isThreeState = (config, tag, attr) =>
    (config.threeStateBooleans?.[tag] ?? []).includes(attr);

/**
 * A public, writable instance field the element has NO attribute for — the rows of
 * `<aparte-conversation-list>` (`conversations`), say. Attributes are typed from the
 * manifest's `attributes`; a member like this one exists only as a property, so without
 * an input for it Angular refused `[conversations]="…"` unless the component switched
 * template checking off with `CUSTOM_ELEMENTS_SCHEMA` — the switch these directives exist
 * to spare. A field that merely mirrors an attribute is left to the attribute input.
 */
function propertyOnlyMembers(el, config) {
    const omit = new Set(config.angularInputOmit?.[el.tagName] ?? []);
    const mirrored = new Set((el.attributes ?? []).flatMap((a) => [a.name, camel(a.name), a.fieldName].filter(Boolean)));
    return (el.members ?? []).filter((m) =>
        m.kind === 'field'
        && !m.static
        && !m.readonly
        && (m.privacy === undefined || m.privacy === 'public')
        && !m.name.startsWith('_')
        && !mirrored.has(m.name)
        && !omit.has(m.name));
}

/** The named types a member's type text refers to (`AparteConversationListItem[]` → one). */
const namedTypes = (text) => (text.match(/\b[A-Z][A-Za-z0-9_]*\b/g) ?? [])
    .filter((n) => !['Array', 'Record', 'Partial', 'Readonly', 'ReadonlyArray', 'Promise', 'Map', 'Set'].includes(n));

function renderAngular(elements, config, { native, configPath, sources }) {
    const skip = new Set(config.angularSkip ?? []);
    const kept = elements.filter((el) => !skip.has(el.tagName));

    // Every output's name, checked before a line is written: one refusal lists them all.
    refuse(kept.flatMap((el) => bindingProblems(
        el.tagName,
        (el.events ?? [])
            .filter((e) => !(config.windowDispatched?.[el.tagName] ?? []).includes(e.name))
            .map((e) => ({ event: e.name, name: bindingName(el.tagName, e.name, config) })),
        { native, configPath },
    )));

    /** Every detail or member type actually referenced, so the import list is exact. */
    const details = new Set();
    for (const el of kept) {
        const omit = new Set(config.windowDispatched?.[el.tagName] ?? []);
        for (const ev of el.events ?? []) {
            if (omit.has(ev.name)) continue;
            const m = /^CustomEvent<(.+)>$/.exec(ev.type?.text ?? '');
            if (m) details.add(m[1]);
        }
        for (const p of propertyOnlyMembers(el, config)) for (const n of namedTypes(p.type?.text ?? '')) details.add(n);
    }

    let out = BANNER + `
/**
 * A typed Angular surface for every element this package defines.
 *
 * Generated, and that is the point: a hand-written directive is a parallel structure over
 * the manifest with nothing watching it, so an attribute added to an element would be
 * typed in React, Vue and Svelte — which derive from the registry — and silently missing
 * here. That happened, which is why this file is generated now.
 *
 * Outputs emit the event's DETAIL, not the \`CustomEvent\`, because
 * \`(selectChange)="pick($event.value)"\` is the Angular idiom. Reach the event itself with
 * a plain host listener when you need \`stopPropagation\`.
 */
`;

    // Only what is used. A package with no numeric attribute — this plugin has none —
    // otherwise imports `numberAttribute` for nothing and `noUnusedLocals` fails the
    // build. Generated code has to satisfy the same lint the rest of the source does.
    const anyAttrs = kept.some((el) => (el.attributes ?? []).some((a) => !(config.angularInputOmit?.[el.tagName] ?? []).includes(a.name))
        || propertyOnlyMembers(el, config).length > 0);
    const anyEvents = kept.some((el) => (el.events ?? []).some((e) => !(config.windowDispatched?.[el.tagName] ?? []).includes(e.name)));
    const usedTypes = new Set(kept.flatMap((el) =>
        (el.attributes ?? [])
            .filter((a) => !(config.angularInputOmit?.[el.tagName] ?? []).includes(a.name))
            .map((a) => a.type?.text ?? 'string')));

    const symbols = ['Directive'];
    if (anyAttrs) symbols.push('ElementRef');
    if (anyEvents) symbols.push('EventEmitter', 'HostListener');
    if (anyAttrs) symbols.push('Input');
    if (anyEvents) symbols.push('Output');
    if (usedTypes.has('boolean')) symbols.push('booleanAttribute');
    if (anyAttrs) symbols.push('inject');
    if (usedTypes.has('number')) symbols.push('numberAttribute');

    out += `import {\n${symbols.map((s) => `    ${s},`).join('\n')}\n} from '@angular/core';\n`;
    if (anyAttrs) out += `import { applyElementProps } from '@aparte/core';\n`;
    // Each type from the source that exports it (`typeImports`): a plugin's own from its barrel,
    // core's from `@aparte/core`. Core's directives pass no sources, so everything is core's.
    const imported = typeImports([...details], sources ?? [{ from: '@aparte/core', exported: null }]);
    refuse(imported.missing.map((type) => `a directive carries \`${type}\`, which no source exports: export it from the package's barrel.`));
    out += imported.lines.join('');

    // A default-ON boolean (see `isThreeState`) unset keeps the element's own default: Angular's
    // `booleanAttribute(undefined)` is false, and a binding to a field not always set turned it off.
    const anyThreeState = kept.some((el) => (el.attributes ?? []).some((a) =>
        !(config.angularInputOmit?.[el.tagName] ?? []).includes(a.name)
        && (a.type?.text ?? 'string') === 'boolean' && isThreeState(config, el.tagName, a.name)));
    if (anyThreeState) out += `
/** A default-ON input: unset (\`undefined\`, \`null\`) stays unset, and the element keeps its default. */
// A declaration, not an arrow: Angular's compiler resolves an input transform statically.
function keepUnset(v: unknown): boolean | undefined {
    return v === undefined || v === null ? undefined : booleanAttribute(v);
}
`;

    if (anyAttrs) out += `
/**
 * Writes one declared attribute onto the host element.
 *
 * \`applyElementProps\` is core's own rule, reused rather than reimplemented: a primitive
 * goes through \`setAttribute\`, \`true\` becomes the empty presence attribute,
 * \`false\`/\`null\`/\`undefined\` remove it, and only a value an attribute cannot carry is
 * handed over as a property.
 */
@Directive()
abstract class AparteElementBase {
    protected readonly host = inject(ElementRef<HTMLElement>);

    protected write(name: string, value: unknown): void {
        applyElementProps(this.host.nativeElement, { [name]: value });
    }
}
`;

    const classes = [];
    for (const el of kept) {
        const cls = `${pascal(el.tagName)}Directive`;
        classes.push(cls);
        const inputOmit = new Set(config.angularInputOmit?.[el.tagName] ?? []);
        const rename = config.angularInputRename?.[el.tagName] ?? {};
        // A window-only event gets no Output: a host listener would never hear it.
        const outputOmit = new Set(config.windowDispatched?.[el.tagName] ?? []);
        const attrs = (el.attributes ?? []).filter((a) => !inputOmit.has(a.name));
        const props = propertyOnlyMembers(el, config);
        const events = (el.events ?? []).filter((e) => !outputOmit.has(e.name));

        out += '\n';
        out += doc(`\`<${el.tagName}>\`${el.description ? ` — ${summary(el.description)}` : ''}`, '');
        if (!attrs.length && !props.length && !events.length) {
            out += `/**\n * No member at all: this element observes nothing and dispatches nothing, so the\n`
                + ` * directive exists only to CLAIM THE TAG — which is what spares a consuming component\n`
                + ` * \`CUSTOM_ELEMENTS_SCHEMA\`, a switch that turns checking off for every unknown tag in\n`
                + ` * the file rather than just this one.\n */\n`;
        }
        out += `@Directive({ selector: '${el.tagName}', standalone: true })\n`;
        out += `export class ${cls}${attrs.length || props.length ? ' extends AparteElementBase' : ''} {\n`;

        for (const a of attrs) {
            const prop = rename[a.name] ?? camel(a.name);
            const t = a.type?.text ?? 'string';
            out += doc(a.description, '    ');
            if (t === 'boolean' && isThreeState(config, el.tagName, a.name)) {
                // `true` writes the empty presence value, which the element reads as ON
                // because `'' !== 'false'`; `false` writes the one string it accepts as OFF.
                //
                // Passing the boolean straight through — what the branch below does, and
                // what every boolean used to do — REMOVES the attribute on `false`, and
                // these elements read an absent attribute as ON. So `[multiple]="false"`
                // turned multi-file selection on. That is the inversion this branch stops.
                //
                // Unset (`undefined`, `null`) removes it, so the element keeps its default (ON),
                // as in React, Vue and Svelte: through `booleanAttribute`, an unset binding wrote
                // `'false'` and the header, multi-file picking or Enter-to-send went off.
                out += `    @Input({ transform: keepUnset }) set ${prop}(v: boolean | undefined) { this.write('${a.name}', v === undefined ? null : v ? '' : 'false'); }\n`;
            } else if (t === 'boolean') {
                out += `    @Input({ transform: booleanAttribute }) set ${prop}(v: boolean) { this.write('${a.name}', v); }\n`;
            } else if (t === 'number') {
                out += `    @Input({ transform: numberAttribute }) set ${prop}(v: number) { this.write('${a.name}', v); }\n`;
            } else {
                out += `    @Input() set ${prop}(v: ${t} | undefined) { this.write('${a.name}', v); }\n`;
            }
        }

        // A property-only member: `write()` hands a value no attribute can carry (an array,
        // an object) over as the property, so the same helper serves.
        for (const p of props) {
            out += doc(p.description, '    ');
            out += `    @Input() set ${p.name}(v: ${p.type?.text ?? 'unknown'} | undefined) { this.write('${p.name}', v); }\n`;
        }

        if ((attrs.length || props.length) && events.length) out += '\n';
        for (const ev of events) {
            const m = /^CustomEvent<(.+)>$/.exec(ev.type?.text ?? '');
            // An `@Output()` carries the event's DETAIL, so a description that offers
            // `preventDefault()` offers something this binding cannot hand you. The file
            // header says so once, at the top, which is where nobody reads it — the clause
            // goes on the member that makes the promise. Core's own JSDoc stays as it is:
            // it documents the DOM event, where the sentence is exact.
            const described = /cancelable/i.test(ev.description ?? '')
                ? (ev.description ?? '').trim() + ' Angular: this Output emits the detail, so '
                    + 'preventDefault() is not on it — bind the DOM event for that: ('
                    + ev.name + ')="$event.preventDefault()".'
                : ev.description;
            out += doc(described, '    ');
            out += `    @Output() readonly ${bindingName(el.tagName, ev.name, config)} = new EventEmitter<${m ? m[1] : 'void'}>();\n`;
        }
        for (const ev of events) {
            const m = /^CustomEvent<(.+)>$/.exec(ev.type?.text ?? '');
            const name = bindingName(el.tagName, ev.name, config);
            const fn = `on${name[0].toUpperCase()}${name.slice(1)}`;
            out += m
                ? `\n    @HostListener('${ev.name}', ['$event'])\n    protected ${fn}(e: CustomEvent<${m[1]}>): void { this.${name}.emit(e.detail); }\n`
                : `\n    @HostListener('${ev.name}')\n    protected ${fn}(): void { this.${name}.emit(); }\n`;
        }
        out += '}\n';
    }

    out += `
/**
 * Every element directive, for one import in a standalone component.
 *
 * \`\`\`ts
 * @Component({ imports: [...APARTE_ELEMENT_DIRECTIVES], template: \`…\` })
 * \`\`\`
 */
export const APARTE_ELEMENT_DIRECTIVES = [
${classes.map((c) => `    ${c},`).join('\n')}
] as const;
`;
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The chat's event bindings: one explicit file per wrapper, from `<aparte-chat>`'s @fires.
//
// What each wrapper's chat component needs, and nothing it would have to unpick: an
// interface of literal members (no mapped type — Vue's SFC compiler reads `defineEmits`
// keys only off a literal), and a table of the same events as data, which the component
// walks to listen on its root. The payload is `(detail, event)`: the detail first, so a
// callback written for it alone still fits, and the event second, so `preventDefault()` is
// in reach. Angular emits the detail, as its directives do, and cancels through the DOM
// event on its host, which IS `<aparte-chat>`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names the chat components already give a host callback — what `AparteChatHost` reports
 * back to the framework, which is not an event — so no chat event may bind under one. Each
 * value says what the name is, for the refusal.
 */
export const RESERVED_CHAT_BINDINGS = new Map([
    ['messagesChange', 'the chat components\' host callback that reports the transcript after the host changed it'],
    ['messageAppended', 'the chat components\' host callback that reports a message the host appended'],
    ['typingChange', 'the chat components\' host callback that reports the typing indicator turning on or off'],
    ['conversationCreated', 'the chat components\' host callback that reports the conversation created on the first send'],
    ['update:messages', 'Vue\'s `v-model:messages` event'],
]);

/**
 * Every name a barrel exports, value or type: its `export { … }` and `export type { … }`
 * lists (an inline `type` and an `as` alias read right), its declarations, and an
 * `export * from`, followed into the source it names — unless `skip(file)` says that file is not
 * to be read.
 */
export function readBarrelExports(file, seen = new Set(), skip = () => false) {
    if (seen.has(file) || skip(file)) return new Set();
    seen.add(file);
    const src = stripComments(readFileSync(file, 'utf8'));
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:type\s+)?\*\s+from\s+['"]([^'"]+)['"]/g)) {
        const base = resolve(dirname(file), m[1].replace(/\.js$/, ''));
        const target = [`${base}.ts`, join(base, 'index.ts')].find((p) => existsSync(p));
        if (target) for (const n of readBarrelExports(target, seen, skip)) names.add(n);
    }
    for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:abstract\s+)?(?:const|let|var|function\*?|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    names.delete('default');
    return names;
}

/**
 * The chat's events as bindings — `{ type, name, detail, description, cancelable }`, in the
 * order `<aparte-chat>` declares them — or a refusal that names every problem.
 *
 * `events` is what `readChatEvents` hands on. Each name goes through {@link bindingName} and
 * is refused if native, reserved or shared. Each detail type must be one `exported` holds:
 * every generated file imports it from `@aparte/core`, and a type the barrel does not export
 * makes a file no consumer can compile.
 */
export function chatBindings(events, config, {
    native,
    exported,
    configPath = 'packages/core/element-bindings.config.mjs',
    barrelPath = 'packages/core/src/index.ts',
}) {
    const bindings = events.map((ev) => ({
        type: ev.name,
        name: bindingName(CHAT_TAG, ev.name, config),
        detail: ev.detail ?? null,
        description: ev.description ?? '',
        cancelable: ev.cancelable === true,
    }));
    const problems = bindingProblems(CHAT_TAG, bindings.map((b) => ({ event: b.type, name: b.name })), {
        native,
        reserved: RESERVED_CHAT_BINDINGS,
        configPath,
    });
    for (const b of bindings) {
        for (const type of namedTypes(b.detail ?? '')) {
            if (exported.has(type)) continue;
            problems.push(
                `<${CHAT_TAG}>: "${b.type}" carries \`${type}\`, which ${barrelPath} does not export (${exported.size} names\n`
                + '      read from it). Every generated binding imports it from there, so no consumer could compile one:\n'
                + '      export it from the barrel.',
            );
        }
    }
    refuse(problems);
    return bindings;
}

const CHAT_BANNER =
    '// AUTO-GENERATED by scripts/gen-element-bindings.mjs from <aparte-chat>\'s @fires, read in\n'
    + '// @aparte/core\'s custom-elements.json. Do not edit: it is gitignored and rewritten every build.\n';

/** `import type { … } from '@aparte/core'`: every detail type the bindings name, once, sorted. */
function chatImports(bindings, from) {
    const names = [...new Set(bindings.flatMap((b) => namedTypes(b.detail ?? '')))].sort();
    return names.length ? `import type {\n${names.map((n) => `    ${n},`).join('\n')}\n} from '${from}';\n` : '';
}

/** What a binding carries: the detail type, or `null` for an event dispatched without one. */
const carried = (b) => b.detail ?? 'null';

/** `linkClick` → `LinkClick`. */
const upper = (name) => name[0].toUpperCase() + name.slice(1);

/**
 * A member's JSDoc: the chat's own description of the event; for one that can be cancelled,
 * how to, in this framework's terms; and the DOM event, which the rest of the docs name.
 */
function memberDoc(b, cancelNote) {
    const paragraphs = [b.description];
    if (b.cancelable) paragraphs.push(cancelNote(b));
    paragraphs.push(`DOM event: \`${b.type}\`.`);
    const lines = paragraphs.filter(Boolean).join('\n\n').split('\n').map((l) => l.trim());
    return `    /**\n${lines.map((l) => (l ? `     * ${l}` : '     *')).join('\n')}\n     */\n`;
}

/** The table a chat component walks: the DOM event, the binding, this framework's own key. */
function chatTable(bindings, key, intro) {
    return `\n${intro}export const APARTE_CHAT_EVENT_BINDINGS = [\n`
        + bindings.map((b) => `    { type: '${b.type}', name: '${b.name}', ${key(b)}, cancelable: ${b.cancelable} },`).join('\n')
        + '\n] as const;\n';
}

/** A callback gets the event second: that is where `preventDefault()` is. */
const CALLBACK_CANCEL = () => '`event` is the DOM event: call `event.preventDefault()` on it to cancel.';

export function renderChatReact(bindings, { from = '@aparte/core' } = {}) {
    let out = `${CHAT_BANNER}\n${chatImports(bindings, from)}
/**
 * Every event \`<aparte-chat>\` declares, as a React callback prop.
 *
 * A callback receives the event's detail, then the event itself: a handler written for the
 * detail alone still fits, and \`preventDefault()\` is in reach where an event can be
 * cancelled. An event that carries no detail passes \`null\`.
 */
export interface AparteChatEventProps {
`;
    for (const b of bindings) {
        out += memberDoc(b, CALLBACK_CANCEL);
        out += `    on${upper(b.name)}?: (detail: ${carried(b)}, event: CustomEvent<${carried(b)}>) => void;\n`;
    }
    out += '}\n';
    out += chatTable(bindings, (b) => `prop: 'on${upper(b.name)}'`, `/**
 * The same events as data, in the order \`<aparte-chat>\` declares them: the DOM event the
 * chat's root hears, the binding's name, the prop that receives it, and whether
 * \`preventDefault()\` reaches the dispatcher.
 */
`);
    return out;
}

export function renderChatVue(bindings, { from = '@aparte/core' } = {}) {
    let out = `${CHAT_BANNER}\n${chatImports(bindings, from)}
/**
 * Every event \`<aparte-chat>\` declares, as a Vue emit, for \`defineEmits<AparteChatEventEmits>()\`.
 *
 * A listener receives the event's detail, then the event itself: a handler written for the
 * detail alone still fits, and \`preventDefault()\` is in reach where an event can be
 * cancelled. An event that carries no detail passes \`null\`. Named tuples in a literal
 * interface: the SFC compiler reads the emits' names off one, and off no mapped type.
 */
export interface AparteChatEventEmits {
`;
    for (const b of bindings) {
        out += memberDoc(b, CALLBACK_CANCEL);
        out += `    ${b.name}: [detail: ${carried(b)}, event: CustomEvent<${carried(b)}>];\n`;
    }
    out += '}\n';
    out += chatTable(bindings, (b) => `emit: '${b.name}'`, `/**
 * The same events as data, in the order \`<aparte-chat>\` declares them: the DOM event the
 * chat's root hears, the binding's name, the emit that carries it (kebab-cased in a
 * template), and whether \`preventDefault()\` reaches the dispatcher.
 */
`);
    return out;
}

/** Svelte 4's component event is cancelable when dispatched so: its own `preventDefault()`. */
const SVELTE4_CANCEL = (b) => `On \`on:${b.name}\`, call \`preventDefault()\` on the component event to cancel it.`;

export function renderChatSvelte(bindings, { from = '@aparte/core' } = {}) {
    let out = `${CHAT_BANNER}\n${chatImports(bindings, from)}
/**
 * Every event \`<aparte-chat>\` declares, as the detail of a Svelte 4 component event, for
 * \`createEventDispatcher<AparteChatEventDetails>()\`. An event that carries no detail
 * dispatches \`null\`.
 */
export interface AparteChatEventDetails {
`;
    for (const b of bindings) {
        out += memberDoc(b, SVELTE4_CANCEL);
        out += `    ${b.name}: ${carried(b)};\n`;
    }
    out += `}

/**
 * Every event \`<aparte-chat>\` declares, as a callback prop of the Svelte 5 component: \`on\`
 * and the binding's name, the spelling Svelte gives an event it turns into a prop. A callback
 * receives the event's detail, then the event itself.
 */
export interface AparteChatEventCallbacks {
`;
    for (const b of bindings) {
        out += memberDoc(b, CALLBACK_CANCEL);
        out += `    on${b.name}?: (detail: ${carried(b)}, event: CustomEvent<${carried(b)}>) => void;\n`;
    }
    out += '}\n';
    out += chatTable(bindings, (b) => `callback: 'on${b.name}'`, `/**
 * The same events as data, in the order \`<aparte-chat>\` declares them: the DOM event the
 * chat's root hears, the binding's name (the Svelte 4 event), the Svelte 5 callback prop,
 * and whether \`preventDefault()\` reaches the dispatcher.
 */
`);
    return out;
}

/** An Angular output carries the detail, so the event is cancelled through the DOM binding. */
const ANGULAR_CANCEL = (b) => `This output emits the detail; to cancel, bind the DOM event \`(${b.type})\` on \`<${CHAT_TAG}>\`.`;

export function renderChatAngular(bindings, { from = '@aparte/core' } = {}) {
    let out = `${CHAT_BANNER}
import { Directive, EventEmitter, Output, type NgZone } from '@angular/core';
${chatImports(bindings, from)}
/**
 * Every event \`<aparte-chat>\` declares, as an Angular output: the base the chat component
 * extends.
 *
 * An output emits the event's detail, as the generated element directives do (\`null\` for
 * an event that carries none). The event itself is one binding away: the component's host
 * IS \`<aparte-chat>\`, so \`(aparte-link-click)="…"\` on it binds the DOM event, and
 * \`$event.preventDefault()\` reaches the dispatcher.
 *
 * An \`EventEmitter\` rather than a signal output: the forwarder asks each one whether
 * anybody listens (\`observed\`), and a signal output does not say.
 */
@Directive()
export abstract class AparteChatEvents {
`;
    for (const b of bindings) {
        out += memberDoc(b, ANGULAR_CANCEL);
        out += `    @Output() readonly ${b.name} = new EventEmitter<${carried(b)}>();\n`;
    }
    out += `
    /**
     * Listens on \`host\` for every chat event and emits it on its output. Call it once the
     * host exists, and call what it returns when the component is destroyed.
     *
     * The listeners are added outside the zone, and an event enters it only for an output
     * somebody binds (\`EventEmitter.observed\`): \`aparte-segment-update\` fires once per
     * streamed token, and an event nobody listens to must not schedule change detection.
     */
    protected forwardChatEvents(host: HTMLElement, zone: NgZone): () => void {
        const listen = <T>(type: string, output: EventEmitter<T>): (() => void) => {
            const listener = (event: Event): void => {
                if (output.observed) zone.run(() => output.emit((event as CustomEvent<T>).detail));
            };
            host.addEventListener(type, listener);
            return () => host.removeEventListener(type, listener);
        };
        const offs = zone.runOutsideAngular(() => [
${bindings.map((b) => `            listen('${b.type}', this.${b.name}),`).join('\n')}
        ]);
        return () => {
            for (const off of offs) off();
        };
    }
}
`;
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// What an element has beyond its attributes: its property-only members and the events it sends.
//
// The attribute registry says what an element takes as an ATTRIBUTE, which is all that React's
// raw tags can honestly type (React 18 cannot bind a property or listen to an event). Vue and
// Svelte do both — they set a property the element has, and they listen to its events — so for
// them the rest of the surface is worth typing, and the manifest holds it. The React components
// below read the same two lists.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The property-only members of one element, and the events it sends on ITSELF: `{ properties,
 * events }`, each property `{ name, type, description }` and each event `{ type, detail,
 * description }` — `detail` being the type the event carries, or `null` for one sent bare. An
 * event sent on `window` only (`windowDispatched`) is left out: a listener on the element would
 * never hear it.
 */
function membersOf(el, config) {
    const windowOnly = new Set(config.windowDispatched?.[el.tagName] ?? []);
    return {
        properties: propertyOnlyMembers(el, config).map((m) => ({
            name: m.name,
            type: m.type?.text ?? 'unknown',
            description: m.description ?? '',
        })),
        events: (el.events ?? []).filter((e) => !windowOnly.has(e.name)).map((e) => ({
            type: e.name,
            detail: /^CustomEvent<(.+)>$/.exec(e.type?.text ?? '')?.[1] ?? null,
            description: e.description ?? '',
        })),
    };
}

/**
 * What is wrong with the types a generated file would name for one element: every detail and
 * property type is imported from the package's barrel, so one it does not export makes a file
 * no consumer can compile.
 */
function unexportedTypes(tag, { properties, events }, exported, barrelPath) {
    const unexported = (what, text) => namedTypes(text).filter((type) => !exported.has(type)).map((type) =>
        `<${tag}>: ${what} carries \`${type}\`, which ${barrelPath} does not export (${exported.size} names\n`
        + '      read from it). The generated file imports it from there, so no consumer could compile it:\n'
        + '      export it from the barrel.');
    return [
        ...events.flatMap((e) => unexported(`"${e.type}"`, e.detail ?? '')),
        ...properties.flatMap((p) => unexported(`\`${p.name}\``, p.type)),
    ];
}

/**
 * Every element's members — `{ tag, properties, events }`, in the manifest's order, one entry
 * per element — or a refusal that names every problem. The chat is among them: a raw
 * `<aparte-chat>` is a tag too.
 */
export function elementMembers(elements, config, {
    exported,
    barrelPath = 'packages/core/src/index.ts',
}) {
    const problems = [];
    const members = elements.map((el) => {
        const found = membersOf(el, config);
        problems.push(...unexportedTypes(el.tagName, found, exported, barrelPath));
        return { tag: el.tagName, ...found };
    });
    refuse(problems);
    return members;
}

/**
 * The file of the members: two interfaces keyed by tag, total like the attribute registry.
 * `AparteElementProperties` holds each element's property-only members, `AparteElementEvents`
 * each event it sends, by DOM name, as the `CustomEvent` a listener receives (`CustomEvent<null>`
 * for one sent bare). An element with none says `Record<never, never>`: "checked, there are none".
 */
export function renderElementMembers(members, { from = '@aparte/core' } = {}) {
    const types = [...new Set(members.flatMap((m) => [
        ...m.properties.flatMap((p) => namedTypes(p.type)),
        ...m.events.flatMap((e) => namedTypes(e.detail ?? '')),
    ]))].sort();

    let out = BANNER;
    if (types.length) out += `\nimport type {\n${types.map((t) => `    ${t},`).join('\n')}\n} from '${from}';\n`;

    out += '\n' + doc(
        'What each element has that no attribute carries: its properties, assigned rather than written.\n'
        + 'Total by construction, like the attribute registry — an element with none says so.',
        '',
    );
    out += 'export interface AparteElementProperties {\n';
    for (const m of members) {
        if (!m.properties.length) {
            out += `    '${m.tag}': Record<never, never>;\n`;
            continue;
        }
        out += `    '${m.tag}': {\n`;
        for (const p of m.properties) {
            out += doc(p.description, '        ');
            out += `        ${p.name}?: ${p.type};\n`;
        }
        out += '    };\n';
    }
    out += '}\n\n';

    out += doc(
        'The events each element sends on itself, by DOM name, as the event a listener receives.\n'
        + 'Total by construction, like the attribute registry — an element that sends none says so.',
        '',
    );
    out += 'export interface AparteElementEvents {\n';
    for (const m of members) {
        if (!m.events.length) {
            out += `    '${m.tag}': Record<never, never>;\n`;
            continue;
        }
        out += `    '${m.tag}': {\n`;
        for (const e of m.events) {
            out += doc(e.description, '        ');
            out += `        '${e.type}': CustomEvent<${e.detail ?? 'null'}>;\n`;
        }
        out += '    };\n';
    }
    out += '}\n';
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// The React components: one per element, from the manifest.
//
// `<aparte-conversation-list>` takes its rows as a PROPERTY and answers with events. React 18
// has no prop form for either (it stringifies a property to an attribute and listens to
// nothing), and React 19 has both but decides per prop which of attribute and property it
// writes — so a raw tag behaves one way in each, and an app that wants the list drives it from
// a ref and an effect of its own. The same defect the Angular directives were generated to end,
// and the same answer, the Stencil "output target" shape: a component per element, generated,
// so an element or an event added to core reaches React with no edit.
//
// What a component is: its props are the element's attributes by the HTML names a raw tag
// takes (typed by the registry, so the two cannot drift), its property-only members, and one
// `on<Binding>` callback per event, called with `(detail, event)` like `<AparteChat>`'s. How
// they reach the element is not in this file: `createAparteElement` (`internal/`) applies them
// the same way under both React majors. This file is the TABLE of what each element has.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The components of a manifest — `{ tag, component, props, element, description, attributes,
 * initial, properties, events }` per element, in the manifest's order — or a refusal that
 * names every problem.
 *
 *   - `reactSkip` (config): tags that already have a hand-written component. Mirrors
 *     `angularSkip`; the chat is the one, `<AparteChat>`.
 *   - `reserved`: the names the React package exports by hand. A generated component or props
 *     type must not take one, or the barrel's explicit export would silently shadow it.
 *   - `attributes` are the declared ones less `angularInputOmit` (what the element reflects
 *     onto itself, so a prop would fight it) and less `initial`: the ones `readAtConnect`
 *     says the element reads once, when it connects, which must therefore be in its first
 *     markup rather than applied after.
 *   - `properties` are the property-only members, as the Angular directives take them.
 *   - `events` leave out the ones sent on `window` only (`windowDispatched`): a listener on the
 *     element would never hear them.
 *   - `element` is core's class for the element when the barrel exports it, which types the
 *     ref; otherwise `null`, and the ref is a plain `HTMLElement`.
 */
export function reactElementBindings(elements, config, {
    native,
    exported,
    reserved = new Set(),
    configPath = 'packages/core/element-bindings.config.mjs',
    barrelPath = 'packages/core/src/index.ts',
}) {
    const skip = new Set(config.reactSkip ?? []);
    const problems = [];
    const components = [];

    for (const el of elements) {
        if (skip.has(el.tagName)) continue;
        const tag = el.tagName;
        const component = pascal(tag);
        const props = `${component}Props`;

        for (const name of [component, props]) {
            if (!reserved.has(name)) continue;
            problems.push(
                `<${tag}>: would be exported as \`${name}\`, a name the React package already exports by hand, and the\n`
                + `      barrel's own export would shadow it. Add the tag to \`reactSkip\` in ${configPath}.`,
            );
        }

        const omit = new Set(config.angularInputOmit?.[tag] ?? []);
        const atConnect = config.readAtConnect?.[tag] ?? [];
        for (const name of atConnect) {
            if ((el.attributes ?? []).some((a) => a.name === name)) continue;
            problems.push(`<${tag}>: \`readAtConnect\` names \`${name}\`, an attribute the element does not declare. Fix the entry in ${configPath}.`);
        }
        const declared = (el.attributes ?? []).map((a) => a.name).filter((name) => !omit.has(name));
        const initial = declared.filter((name) => atConnect.includes(name));
        const attributes = declared.filter((name) => !atConnect.includes(name));

        const { properties, events: sent } = membersOf(el, config);
        const events = sent.map((e) => {
            const name = bindingName(tag, e.type, config);
            return {
                ...e,
                name,
                prop: `on${upper(name)}`,
                // The manifest cannot say it: the sentence in the description is the one place
                // the element's author wrote it down, and the Angular outputs read it there too.
                cancelable: /cancelable/i.test(e.description),
            };
        });
        problems.push(...bindingProblems(tag, events.map((e) => ({ event: e.type, name: e.name })), { native, configPath }));
        problems.push(...unexportedTypes(tag, { properties, events }, exported, barrelPath));

        components.push({
            tag,
            component,
            props,
            element: exported.has(el.name) ? el.name : null,
            description: summary(el.description),
            attributes,
            initial,
            properties,
            events,
        });
    }

    refuse(problems);
    return components;
}

/** `['a', 'b']` as a TypeScript array literal of strings. */
const strings = (items) => `[${items.map((s) => `'${s}'`).join(', ')}]`;

/**
 * The file of a manifest's components: for each, a props type (the registry's attributes, its
 * own properties, a callback per event) and one `createAparteElement` call that holds the
 * table of what to apply.
 *
 * The call is `/* @__PURE__ *\/`-annotated and nothing else in a component touches the module,
 * so a bundler drops every component an app does not import: the factory only runs for the
 * ones that are used, and `sideEffects: false` is not what carries it.
 */
export function renderReactElements(components, { from = '@aparte/core', helper = '../internal/element-component.js' } = {}) {
    // `Name` or `Name as Alias`: an element class shares its name with its component, so the
    // class is imported under another one.
    const imports = new Map([['AparteElementAttributes', 'AparteElementAttributes']]);
    for (const c of components) {
        if (c.element) imports.set(c.element, `${c.component}Element`);
        for (const p of c.properties) for (const type of namedTypes(p.type)) imports.set(type, type);
        for (const e of c.events) for (const type of namedTypes(e.detail ?? '')) imports.set(type, type);
    }
    const names = [...imports].sort(([a], [b]) => a.localeCompare(b))
        .map(([name, alias]) => (name === alias ? `    ${name},` : `    ${name} as ${alias},`));

    let out = BANNER + `
/**
 * A React component for every element this package defines, but the chat.
 *
 * Generated, and that is the point: a hand-written component is a parallel structure over the
 * manifest with nothing watching it. Each takes the element's attributes by their HTML names,
 * its properties, and a callback per event — \`on\` and the binding's name — called with the
 * event's detail, then the event itself, so \`preventDefault()\` is in reach where an event can
 * be cancelled. An event that carries no detail passes \`null\`. The ref is the element.
 *
 * How a prop reaches the element is the same under React 18 and 19: see
 * \`createAparteElement\`.
 */
import type {
${names.join('\n')}
} from '${from}';
import { createAparteElement, type AparteElementProps } from '${helper}';
`;

    for (const c of components) {
        const base = `AparteElementProps<AparteElementAttributes['${c.tag}']>`;
        out += '\n';
        out += doc(
            `The props of {@link ${c.component}}: the attributes of \`<${c.tag}>\` by their HTML names`
            + `${c.properties.length ? ', its properties' : ''}${c.events.length ? ', and a callback for each of its events' : ''}.`,
            '',
        );
        if (c.properties.length || c.events.length) {
            out += `export interface ${c.props} extends ${base} {\n`;
            for (const p of c.properties) {
                out += doc(p.description, '    ');
                out += `    ${p.name}?: ${p.type};\n`;
            }
            for (const e of c.events) {
                out += memberDoc(e, CALLBACK_CANCEL);
                out += `    ${e.prop}?: (detail: ${carried(e)}, event: CustomEvent<${carried(e)}>) => void;\n`;
            }
            out += '}\n';
        } else {
            // No member of its own: an interface with an empty body says what a type alias does.
            out += `export type ${c.props} = ${base};\n`;
        }

        out += '\n';
        out += doc(`\`<${c.tag}>\`${c.description ? ` — ${c.description}` : ''}`, '');
        out += `export const ${c.component} = /* @__PURE__ */ createAparteElement<${c.element ? `${c.component}Element` : 'HTMLElement'}, ${c.props}>(\n`;
        out += `    '${c.tag}',\n    '${c.component}',\n`;
        if (!c.attributes.length && !c.properties.length && !c.events.length && !c.initial.length) {
            out += '    { attributes: [], properties: [], events: [], initial: [] },\n';
        } else {
            out += '    {\n';
            out += `        attributes: ${strings(c.attributes)},\n`;
            out += `        properties: ${strings(c.properties.map((p) => p.name))},\n`;
            out += c.events.length
                ? `        events: [\n${c.events.map((e) => `            ['${e.type}', '${e.prop}'],`).join('\n')}\n        ],\n`
                : '        events: [],\n';
            out += `        initial: ${strings(c.initial)},\n`;
            out += '    },\n';
        }
        out += ');\n';
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Where a generated file imports each type from.
//
// A plugin's element names three kinds of type: its own (`ApprovalMode`, `AparteTrigger`), core's
// (`AparteApprovalModeChangeEventDetail`, which core's event map types), and its attribute
// interfaces, in the registry generated beside it. One `from` for all of them — the React renderer
// takes the package's name, the Angular one wrote `@aparte/core` — is right for core and wrong for
// every plugin. So each type is looked up in an ordered list of sources and imported from the first
// that exports it; a type none of them exports is a refusal, since no consumer could compile the file.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The `import type` lines for `types`: each from the first of `sources` (`{ from, exported }`,
 * `exported` a Set of names, or `null` for "everything") that has it. Returns `{ lines, missing }`.
 */
export function typeImports(types, sources) {
    const by = new Map();
    const missing = [];
    for (const type of [...new Set(types)].sort()) {
        const source = sources.find((s) => s.exported === null || s.exported.has(type));
        if (!source) {
            missing.push(type);
            continue;
        }
        if (!by.has(source.from)) by.set(source.from, []);
        by.get(source.from).push(type);
    }
    const lines = sources.filter((s) => by.has(s.from))
        .map((s) => `import type {\n${by.get(s.from).map((t) => `    ${t},`).join('\n')}\n} from '${s.from}';\n`);
    return { lines, missing };
}

/** A module specifier from one generated directory to a file of the package, extension `.js`. */
const relativeSpecifier = (fromDir, toFile) => {
    const rel = relative(fromDir, toFile).split(sep).join('/').replace(/\.ts$/, '.js');
    return rel.startsWith('.') ? rel : `./${rel}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// The element specs: one `AparteElementSpec` per element of a plugin, from its manifest.
//
// Core's elements have components and directives in each wrapper; a plugin's cannot (a wrapper
// depends on no plugin, and a third party could never add a line to one). So the plugin exports a
// description of each of its elements — tag, attributes, properties, events with the name each
// binds under, what is read at connect — and every wrapper turns it into what its framework needs.
// The value is what React's `createAparteElement(spec)` reads; its phantom generics are what
// Vue's `AparteVueElement` and Svelte's `AparteSvelteElement` read.
// ─────────────────────────────────────────────────────────────────────────────

/** `aparte-approval-mode` → `approvalModeElement`: the name a plugin exports its element's spec under. */
export const specName = (tag) => `${camel(tag.replace(/^aparte-/, ''))}Element`;

/**
 * The specs of a manifest — `{ tag, name, attributes, initial, properties, events }` per element,
 * each event `{ type, name, detail }` — or a refusal that names every problem: a binding name that
 * is a native DOM event or shared by two events, a type no source exports (`sources`, as
 * {@link typeImports} takes them), a spec name the package already exports by hand (`reserved`).
 */
export function elementSpecs(elements, config, { native, sources, reserved = new Set(), configPath = 'element-bindings.config.mjs' }) {
    const problems = [];
    const specs = elements.map((el) => {
        const tag = el.tagName;
        const name = specName(tag);
        if (reserved.has(name)) {
            problems.push(`<${tag}>: its spec would be exported as \`${name}\`, a name the package already exports. Rename the export.`);
        }
        const omit = new Set(config.angularInputOmit?.[tag] ?? []);
        const atConnect = config.readAtConnect?.[tag] ?? [];
        const declared = (el.attributes ?? []).map((a) => a.name).filter((n) => !omit.has(n));
        const { properties, events: sent } = membersOf(el, config);
        const events = sent.map((e) => ({ ...e, name: bindingName(tag, e.type, config) }));
        problems.push(...bindingProblems(tag, events.map((e) => ({ event: e.type, name: e.name })), { native, configPath }));
        const types = [...properties.flatMap((p) => namedTypes(p.type)), ...events.flatMap((e) => namedTypes(e.detail ?? ''))];
        for (const type of typeImports(types, sources).missing) {
            problems.push(`<${tag}>: carries \`${type}\`, which neither the package's barrel nor @aparte/core exports. The spec imports it, so no consumer could compile it: export it.`);
        }
        return {
            tag,
            name,
            description: summary(el.description),
            attributes: declared.filter((n) => !atConnect.includes(n)),
            initial: declared.filter((n) => atConnect.includes(n)),
            properties,
            events,
        };
    });
    refuse(problems);
    return specs;
}

/** The file of a manifest's specs: `<name>Element` per element, typed by its phantom generics. */
export function renderElementSpecs(specs, { sources, registry = './element-attributes.js' }) {
    const types = specs.flatMap((s) => [...s.properties.flatMap((p) => namedTypes(p.type)), ...s.events.flatMap((e) => namedTypes(e.detail ?? ''))]);
    const { lines } = typeImports(types, sources);
    let out = BANNER + `
/**
 * Each element of this package described for a framework wrapper: an \`AparteElementSpec\`.
 *
 * React makes a component of one — \`createAparteElement(spec)\` from \`@aparte/react\` — and Vue and
 * Svelte type the tag from its type — \`AparteVueElement<typeof spec>\`, \`AparteSvelteElement<typeof
 * spec>\`. Generated from the package's manifest, so an attribute, a property or an event added to
 * an element reaches every framework with no edit.
 */
import type { AparteElementSpec } from '@aparte/core';
import type { AparteElementAttributes } from '${registry}';
${lines.join('')}`;
    for (const s of specs) {
        const props = s.properties.length
            ? `{\n${s.properties.map((p) => `${doc(p.description, '        ')}        ${p.name}?: ${p.type};\n`).join('')}    }`
            : 'Record<never, never>';
        const events = s.events.length
            ? `{\n${s.events.map((e) => `${doc(e.description, '        ')}        '${e.type}': { name: '${e.name}'; detail: ${e.detail ?? 'null'} };\n`).join('')}    }`
            : 'Record<never, never>';
        out += '\n';
        out += doc(`The spec of \`<${s.tag}>\`, for a framework wrapper (see \`AparteElementSpec\`)${s.description ? `: ${s.description}` : '.'}`, '');
        out += `export const ${s.name}: AparteElementSpec<\n    AparteElementAttributes['${s.tag}'],\n    ${props},\n    ${events}\n> = {\n`;
        out += `    tag: '${s.tag}',\n`;
        out += `    attributes: ${strings(s.attributes)},\n`;
        out += `    properties: ${strings(s.properties.map((p) => p.name))},\n`;
        out += s.events.length
            ? `    events: [\n${s.events.map((e) => `        ['${e.type}', '${e.name}'],`).join('\n')}\n    ],\n`
            : '    events: [],\n';
        out += `    initial: ${strings(s.initial)},\n};\n`;
    }
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────

/** The package's own name: what a generated file imports the detail types from. */
const packageName = (pkgDir) => JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name;

/**
 * The chat's bindings, read from the package's manifest and checked. The chat's surface must
 * hold first (rule 5 of `check-event-map`): `readChatEvents` is true only on a tree that rule
 * passes on, and a binding generated from a false one would ship.
 */
function readChatBindings(pkgDir, config, { native, configPath }) {
    const tree = readChatTree({ cemFile: join(pkgDir, 'dist', 'custom-elements.json') });
    const { problems } = checkChatSurface(tree);
    if (problems.length) {
        refuse([
            'the chat\'s surface does not hold (check-event-map, rule 5), and the bindings are generated from it:\n'
            + problems.map((p) => `      ${p}`).join('\n'),
        ]);
    }
    const barrel = join(pkgDir, 'src', 'index.ts');
    return chatBindings(readChatEvents(tree), config, {
        native,
        exported: readBarrelExports(barrel),
        configPath,
        barrelPath: repoRel(barrel),
    });
}

/** The file the React components are written to, in `--react-elements`. */
const REACT_FILE = 'element-components.ts';

/**
 * A file this script wrote: it begins with the banner. Its names are the ones this run is about
 * to write again, never a hand-written export a component could clash with — and the barrel
 * re-exports it, so reading it would call every generated name a clash on the second run.
 */
const isGenerated = (file) => readFileSync(file, 'utf8').startsWith(BANNER.split('\n')[0]);

/**
 * The React components of the package's manifest, checked. The names React already exports by
 * hand are read from its barrel — `--react-barrel`, by default the `index.ts` beside the output
 * directory — without the files this script wrote ({@link isGenerated}): the barrel re-exports
 * them, and the names of the last run's output are not a clash. A missing barrel is a refusal:
 * a clash check that finds nothing to check against would pass for the wrong reason.
 *
 * Exported for the docs, which list the components without writing them.
 */
export function readReactComponents(pkgDir, elements, config, { native, configPath, reactOut, barrelArg }) {
    const barrel = resolve(root, barrelArg ?? join(reactOut, '..', 'index.ts'));
    if (!existsSync(barrel)) {
        refuse([
            `--react-elements reads the names the React package already exports by hand from its barrel, and there is none at ${repoRel(barrel)}.\n`
            + '      Pass --react-barrel <file>: a clash check with nothing to check against would pass for the wrong reason.',
        ]);
    }
    const coreBarrel = join(pkgDir, 'src', 'index.ts');
    return reactElementBindings(elements, config, {
        native,
        exported: readBarrelExports(coreBarrel),
        reserved: readBarrelExports(barrel, new Set(), isGenerated),
        configPath,
        barrelPath: repoRel(coreBarrel),
    });
}

async function main() {
    const [pkgArg] = process.argv.slice(2);
    if (!pkgArg || pkgArg.startsWith('--')) {
        console.error(
            'usage: node scripts/gen-element-bindings.mjs <packageDir> [--registry <dir>] [--angular <dir>]'
            + ' [--react-elements <dir> [--react-barrel <file>]] [--element-members <dir>]'
            + ' [--chat-react <dir>] [--chat-vue <dir>] [--chat-svelte <dir>] [--specs <dir>] [--config <file>]',
        );
        process.exit(1);
    }
    const pkgDir = resolve(root, pkgArg);
    const elements = readManifest(pkgDir);

    // Each package generates into ITSELF, so nothing writes across a package boundary:
    // `--registry` is the element owner's own typing, `--angular` and `--chat-*` are a
    // wrapper's, and the wrapper passes the owner's directory as the manifest to read.
    const flag = (name) => {
        const i = process.argv.indexOf(name);
        return i === -1 ? null : process.argv[i + 1];
    };
    const configFile = flag('--config') ? resolve(root, flag('--config')) : join(pkgDir, 'element-bindings.config.mjs');
    const config = await readConfig(configFile);
    const configPath = repoRel(configFile);

    const registryOut = flag('--registry');
    const angularOut = flag('--angular');
    const reactOut = flag('--react-elements');
    const membersOut = flag('--element-members');
    const specsOut = flag('--specs');
    const chatOut = { react: flag('--chat-react'), vue: flag('--chat-vue'), svelte: flag('--chat-svelte') };
    // The chat's base goes beside the Angular directives when this manifest has the chat:
    // core's does, a plugin's does not.
    const angularChat = Boolean(angularOut) && elements.some((el) => el.tagName === CHAT_TAG);
    const wantsChat = angularChat || Object.values(chatOut).some(Boolean);
    const native = angularOut || reactOut || wantsChat || specsOut ? readNativeEventNames() : null;

    /*
     * Where a generated file of a PLUGIN imports each type from (`typeImports`): the plugin's own
     * barrel, by a relative path from the file; then core; then the registry generated beside it.
     * Core's own files take everything from `@aparte/core`, as they always did.
     */
    const isCore = pkgDir === resolve(root, 'packages/core');
    const registryContent = registryOut ? renderAttributes(elements, config) : null;
    const sourcesFor = (outDir) => {
        if (isCore) return undefined;
        const dir = resolve(root, outDir);
        // The entries that export the element's types: one of its own first, when the element lives
        // there (`--barrel`: the artifact panel's is `src/panel.ts`), then the main barrel.
        const barrels = [flag('--barrel') && resolve(root, flag('--barrel')), join(pkgDir, 'src', 'index.ts')].filter(Boolean);
        const sources = [
            ...barrels.map((barrel) => ({ from: relativeSpecifier(dir, barrel), exported: readBarrelExports(barrel, new Set(), isGenerated) })),
            { from: '@aparte/core', exported: readBarrelExports(resolve(root, 'packages/core/src/index.ts')) },
        ];
        if (registryContent) {
            const names = new Set([...registryContent.matchAll(/export (?:interface|type) (\w+)/g)].map((m) => m[1]));
            sources.push({ from: relativeSpecifier(dir, join(resolve(root, registryOut), 'element-attributes.ts')), exported: names });
        }
        return sources;
    };

    // Everything is rendered, and so checked, before anything is written: a refusal leaves
    // the files of the last good run in place, never half a new set.
    const writes = [];
    if (registryOut) writes.push([registryOut, 'element-attributes.ts', registryContent]);
    // A directive takes core's types from core first: its file is compiled by `ngc` on its own
    // (`tsconfig.angular.json`), and an import of the plugin's barrel would pull every source of
    // the plugin into that program. Only what core does not export comes from the plugin.
    const angularSources = angularOut && sourcesFor(angularOut)?.sort((a, b) => Number(b.from === '@aparte/core') - Number(a.from === '@aparte/core'));
    if (angularOut) writes.push([angularOut, 'element.directives.ts', renderAngular(elements, config, { native, configPath, sources: angularSources })]);
    if (specsOut) {
        if (!registryOut) refuse(['--specs types each spec\'s attributes from the registry: pass --registry too.']);
        const sources = sourcesFor(specsOut) ?? [{ from: '@aparte/core', exported: null }];
        const specs = elementSpecs(elements, config, { native, sources, configPath });
        const registry = relativeSpecifier(resolve(root, specsOut), join(resolve(root, registryOut), 'element-attributes.ts'));
        writes.push([specsOut, 'element-specs.ts', renderElementSpecs(specs, { sources, registry })]);
    }
    const bindings = wantsChat ? readChatBindings(pkgDir, config, { native, configPath }) : [];
    if (wantsChat) {
        const from = packageName(pkgDir);
        if (chatOut.react) writes.push([chatOut.react, 'chat-events.ts', renderChatReact(bindings, { from })]);
        if (chatOut.vue) writes.push([chatOut.vue, 'chat-events.ts', renderChatVue(bindings, { from })]);
        if (chatOut.svelte) writes.push([chatOut.svelte, 'chat-events.ts', renderChatSvelte(bindings, { from })]);
        if (angularChat) writes.push([angularOut, 'chat-events.ts', renderChatAngular(bindings, { from })]);
    }
    const components = reactOut ? readReactComponents(pkgDir, elements, config, { native, configPath, reactOut, barrelArg: flag('--react-barrel') }) : [];
    if (reactOut) writes.push([reactOut, REACT_FILE, renderReactElements(components, { from: packageName(pkgDir) })]);
    if (membersOut) {
        const coreBarrel = join(pkgDir, 'src', 'index.ts');
        const members = elementMembers(elements, config, { exported: readBarrelExports(coreBarrel), barrelPath: repoRel(coreBarrel) });
        writes.push([membersOut, 'element-members.ts', renderElementMembers(members, { from: packageName(pkgDir) })]);
    }

    if (!writes.length) {
        console.error('[element-bindings] nothing to write — pass --registry, --angular, --react-elements, --element-members, --specs or a --chat-* flag, each with a directory.');
        process.exit(1);
    }
    for (const [out, file, content] of writes) {
        const dir = resolve(root, out);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, file), content, 'utf8');
    }

    const attrs = elements.reduce((n, e) => n + (e.attributes ?? []).length, 0);
    const events = elements.reduce((n, e) => n + (e.events ?? []).length, 0);
    const dirs = [...new Set(writes.map(([out]) => repoRel(resolve(root, out))))].join(', ');
    console.log(
        `[element-bindings] ${pkgArg}: ${elements.length} elements, ${attrs} attributes, ${events} events`
        + `${wantsChat ? `; chat: ${bindings.length} bindings` : ''}`
        + `${reactOut ? `; react elements: ${components.length} components` : ''} → ${dirs}`,
    );
}

// Run as a script, not when a test imports the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await main();
    } catch (error) {
        if (!error?.refusal) throw error;
        console.error(`[element-bindings] refused, nothing was written:\n${error.message}`);
        process.exit(1);
    }
}
