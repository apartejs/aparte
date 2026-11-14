/*
 * What the element components' coverage test shares: one reading of the manifest, and a value
 * to try each attribute with.
 *
 * `<AparteConversationList>` and its 23 siblings are generated from the manifest, and a test
 * that took its list from the file they are generated into would agree with any generator bug —
 * an event dropped from a table is an event nobody tests. So the list comes from the MANIFEST,
 * read here the way the generator reads it (`readElements`), with the same facts it takes from
 * the config:
 *
 *   • which elements get a component: all but `reactSkip` (the chat, which `<AparteChat>` owns);
 *   • which attributes are props: the declared ones, less the ones the element reflects onto
 *     itself (`angularInputOmit`), which are the element's to write;
 *   • which events have a callback: the declared ones, less the ones sent on `window` only
 *     (`windowDispatched`), which a listener on the element would never hear;
 *   • the name each event binds under: `bindingName`, the generator's one naming function.
 *
 * The NAME of a component (`Aparte` and the tag in Pascal case) is written out again here, on
 * purpose: it is the contract a consumer imports, and `gen-react-elements.test.ts` pins the
 * generator to it, so a change of the rule fails there and here and not silently in one.
 *
 * Missing manifest: `readElements` throws "build the package first", and the test file fails on
 * it rather than skipping.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../packages/core/element-bindings.config.mjs';
import { bindingName, readElements } from './gen-element-bindings.mjs';

const CORE = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'packages/core');

/** A collapsed reading is a broken reader, not a small library. Measured at 24 components. */
export const COMPONENT_FLOOR = 20;
/** The same, for the callbacks the components bind. Measured at 40. */
export const CALLBACK_FLOOR = 30;

/** `aparte-conversation-list` → `AparteConversationList`. */
const pascal = (tag) => tag.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');

/**
 * Attributes whose string is parsed, so a word would be an error the element reports: what to
 * write instead. Only the value differs; the test still checks it is the one written.
 */
const PARSED = {
    // `<aparte-suggestions suggestions>` is a JSON array of labels.
    suggestions: '["Try this"]',
};

/**
 * What to write onto the attribute `name` of declared type `text`, and the string it is
 * written as.
 *
 * A literal union is tried with its first literal (`'chat'|'page'|'off'` → `chat`), a boolean
 * with `true`, a number with 7, a string with a word. A type this does not know is an error, not
 * a skipped attribute: a new kind of attribute should be decided on, not passed over.
 *
 * What the element does with it afterwards is its own: the split clamps `position` to the
 * space it has, and in a test that is none. The test asks whether the component WROTE it.
 */
export function sampleFor(text, name = '') {
    if (PARSED[name]) return { value: PARSED[name], attribute: PARSED[name] };
    const literal = /'([^']*)'/.exec(text);
    if (literal) return { value: literal[1], attribute: literal[1] };
    if (/\bboolean\b/.test(text)) return { value: true, attribute: '' };
    if (/\bstring\b/.test(text)) return { value: 'sample', attribute: 'sample' };
    if (/\bnumber\b/.test(text)) return { value: 7, attribute: '7' };
    throw new Error(`no sample value for an attribute typed \`${text}\`: teach sampleFor() about it.`);
}

/** A property-only member's value: an array for a list, which is all the manifest has. */
export function sampleProperty(text) {
    if (/\[\]$/.test(text.trim())) return [];
    throw new Error(`no sample value for a property typed \`${text}\`: teach sampleProperty() about it.`);
}

/**
 * The components the manifest calls for: `{ tag, component, initial, attributes, properties,
 * events }`, with each attribute `{ name, type }`, each property `{ name, type }` and each event
 * `{ name, prop, detail, cancelable }` — `prop` being `on` and the binding's name. `initial`
 * names the attributes (among `attributes`) the element reads once, at connect.
 */
export function readCoverageComponents() {
    const skip = new Set(config.reactSkip ?? []);
    const omit = (tag) => new Set(config.angularInputOmit?.[tag] ?? []);
    const windowOnly = (tag) => new Set(config.windowDispatched?.[tag] ?? []);
    const components = readElements(CORE)
        .filter((el) => !skip.has(el.tagName))
        .map((el) => {
            const mirrored = new Set((el.attributes ?? []).flatMap((a) => [a.name, a.fieldName].filter(Boolean)));
            return {
                tag: el.tagName,
                component: pascal(el.tagName),
                // The attributes the element reads once, at connect: the markup carries them.
                initial: (config.readAtConnect?.[el.tagName] ?? []).filter((name) => !omit(el.tagName).has(name)),
                attributes: (el.attributes ?? [])
                    .filter((a) => !omit(el.tagName).has(a.name))
                    .map((a) => ({ name: a.name, type: a.type?.text ?? 'string' })),
                properties: (el.members ?? [])
                    .filter((m) => m.kind === 'field' && !m.static && !m.readonly
                        && (m.privacy === undefined || m.privacy === 'public')
                        && !m.name.startsWith('_') && !mirrored.has(m.name) && !omit(el.tagName).has(m.name))
                    .map((m) => ({ name: m.name, type: m.type?.text ?? 'unknown' })),
                events: (el.events ?? [])
                    .filter((e) => !windowOnly(el.tagName).has(e.name))
                    .map((e) => {
                        const name = bindingName(el.tagName, e.name, config);
                        return {
                            name: e.name,
                            prop: `on${name[0].toUpperCase()}${name.slice(1)}`,
                            detail: /^CustomEvent<(.+)>$/.exec(e.type?.text ?? '')?.[1] ?? null,
                            cancelable: /cancelable/i.test(e.description ?? ''),
                        };
                    }),
            };
        });
    if (components.length < COMPONENT_FLOOR) {
        throw new Error(`only ${components.length} element(s) read from the manifest, floor is ${COMPONENT_FLOOR}.`);
    }
    const callbacks = components.reduce((n, c) => n + c.events.length, 0);
    if (callbacks < CALLBACK_FLOOR) {
        throw new Error(`only ${callbacks} event(s) read from the manifest, floor is ${CALLBACK_FLOOR}.`);
    }
    return components;
}
