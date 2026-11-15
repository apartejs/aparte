/**
 * The generator writes one React component per element of the manifest, and refuses what
 * would make one that does not work.
 *
 * `<aparte-conversation-list>` takes its rows as a PROPERTY and answers with events, and React
 * 18 has neither (React 19 has both, and decides per prop which it uses). A component per
 * element is the Stencil "output target" shape — and a hand-written one is a parallel
 * structure over the manifest that nothing watches, which is the defect the Angular directives
 * were generated to end. So the components come from the manifest too:
 *
 *   • one `Aparte<Pascal>` per element, except the ones `reactSkip` names (the chat: React's
 *     `<AparteChat>` is a composite that owns that name);
 *   • its props are the element's attributes by their HTML names, its property-only members
 *     (`conversations`), and one `on<Binding>` callback per event, called with
 *     `(detail, event)` — the convention `<AparteChat>`'s generated props already have;
 *   • a component name the React package already exports, a binding that is a native DOM event
 *     or that two events share, and a type core's barrel does not export are each refused by
 *     name, and nothing is written.
 *
 * The pure functions are tested over a fixture manifest; the script is then run over the real
 * one and over a doctored config, because a refusal the CLI forgets to call is a guard in
 * name only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    bindingName,
    readBarrelExports,
    readElements,
    readNativeEventNames,
    reactElementBindings,
    renderReactElements,
} from '../gen-element-bindings.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'gen-element-bindings.mjs');
const REPO = resolve(dirname(SCRIPT), '..');
const CORE = join(REPO, 'packages/core');
const CONFIG_FILE = join(CORE, 'element-bindings.config.mjs');
const CONFIG = (await import(pathToFileURL(CONFIG_FILE).href)).default;

const NATIVE: Set<string> = readNativeEventNames();
const EXPORTED: Set<string> = readBarrelExports(join(CORE, 'src/index.ts'));

/** What the React package exports by hand: the names a generated component must not take. */
const RESERVED = new Set(['AparteChat', 'AparteChatProps', 'AparteUi', 'AparteUiProps', 'AparteToolUI', 'AparteSegmentUI']);

type Component = {
    tag: string;
    component: string;
    props: string;
    element: string | null;
    description: string;
    attributes: string[];
    initial: string[];
    properties: Array<{ name: string; type: string; description: string }>;
    events: Array<{ type: string; name: string; prop: string; detail: string | null; description: string; cancelable: boolean }>;
};

/* ── a fixture manifest: the shapes the real one has, and nothing else ─────────────────────── */

const field = (name: string, text: string, description = '') => ({ kind: 'field', name, type: { text }, description });
const attr = (name: string, text: string, description = '') => ({ name, type: { text }, description });
const event = (name: string, text: string, description = '') => ({ name, type: { text }, description });

const LIST = {
    customElement: true,
    tagName: 'aparte-conversation-list',
    name: 'AparteConversationList',
    description: 'Conversation-history sidebar.\n\nA second paragraph the one-line summary leaves out.',
    attributes: [
        attr('active-id', 'string', 'The id of the conversation to render as selected.'),
        attr('flat', 'boolean', 'Render the rows flat, in host order.'),
        attr('data-no-match', 'boolean', 'Reflected BY the element. Read-only.'),
    ],
    members: [
        field('conversations', 'AparteConversationListItem[]', 'Set the list of conversations to display.'),
        field('_conversations', 'AparteConversationListItem[]', 'private by convention'),
        field('flat', 'boolean', 'the property behind the `flat` attribute: not a second prop'),
        { kind: 'method', name: 'filter', description: 'a method is not a prop' },
    ],
    events: [
        event('aparte-conversation-select', 'CustomEvent<AparteConversationSelectDetail>', "A row's title was activated; the host loads that conversation."),
        event('aparte-conversation-rename', 'CustomEvent<AparteConversationRenameDetail>', 'A rename was committed. Cancelable: `preventDefault()` takes the gesture back.'),
    ],
};

const SELECT = {
    customElement: true,
    tagName: 'aparte-select',
    name: 'AparteSelect',
    description: 'A select.',
    attributes: [attr('value', 'string', 'The selected value.'), attr('searchable', 'boolean', 'Adds a search field.')],
    members: [],
    events: [
        event('aparte-select-open', 'CustomEvent', 'The menu opened. No detail.'),
        event('aparte-select-change', 'CustomEvent<AparteSelectChangeDetail>', 'The selection changed.'),
    ],
};

const COMPOSER = {
    customElement: true,
    tagName: 'aparte-composer',
    name: 'AparteComposer',
    description: 'The composer.',
    attributes: [attr('placeholder', 'string', 'Placeholder text.')],
    members: [],
    events: [
        event('aparte-send', 'CustomEvent<AparteSendEventDetail>', 'A message was sent.'),
        event('aparte-cancel', 'CustomEvent', 'Stop was pressed.'),
        event('aparte-abort', 'CustomEvent<AparteAbortEventDetail>', 'Sent on window only.'),
    ],
};

const VIEWPORT = {
    customElement: true,
    tagName: 'aparte-chat-viewport',
    name: 'AparteChatViewport',
    description: 'The transcript.',
    attributes: [attr('loading', 'boolean', 'The conversation is on its way.'), attr('framework-managed', 'boolean', 'Read once at connect.')],
    members: [],
    events: [],
};

const BARE = { customElement: true, tagName: 'aparte-composer-send', name: 'AparteComposerSend', description: 'The send button.', attributes: [], members: [], events: [] };

/** The chat: React has a composite for it, so no generated component may take its name. */
const CHAT = { customElement: true, tagName: 'aparte-chat', name: 'AparteChat', description: 'The shell.', attributes: [attr('placeholder', 'string')], members: [], events: [event('aparte-send', 'CustomEvent<AparteSendEventDetail>', 'A message was sent.')] };

/** An element of a plugin: its class is not in core's barrel, so its ref is a plain `HTMLElement`. */
const PLUGIN = { customElement: true, tagName: 'aparte-model-picker', name: 'AparteModelPicker', description: 'A plugin element.', attributes: [attr('model', 'string')], members: [], events: [] };

const ELEMENTS = [CHAT, LIST, SELECT, COMPOSER, VIEWPORT, BARE];

/** The config the fixture needs, and nothing else: the real config's entries for these tags. */
const CFG = {
    reactSkip: ['aparte-chat'],
    angularInputOmit: { 'aparte-conversation-list': ['data-no-match'] },
    windowDispatched: { 'aparte-composer': ['aparte-abort'] },
    bindingRenames: { 'aparte-composer': { 'aparte-cancel': 'stop' } },
    readAtConnect: { 'aparte-chat-viewport': ['framework-managed'] },
};

const bind = (elements: object[] = ELEMENTS, config: object = CFG, reserved: Set<string> = RESERVED): Component[] =>
    reactElementBindings(elements, config, { native: NATIVE, exported: EXPORTED, reserved });

const byTag = (components: Component[], tag: string): Component => components.find((c) => c.tag === tag)!;

/** What `fn` threw, as text — so a test can read the whole message, not one regex of it. */
function refusal(fn: () => unknown): string {
    try {
        fn();
    } catch (e) {
        return (e as Error).message;
    }
    throw new Error('expected a refusal, and the call returned');
}

/** The JSDoc block right above the line that contains `member`, flattened. */
function docAbove(src: string, member: string): string {
    const at = src.indexOf(member);
    expect(at, `${member} is in the file`).toBeGreaterThan(-1);
    const before = src.slice(0, at);
    const open = before.lastIndexOf('/**');
    const close = before.lastIndexOf('*/');
    expect(close, `a doc block ends right above ${member}`).toBeGreaterThan(open);
    expect(before.slice(close + 2).trim(), `nothing between the doc block and ${member}`).toBe('');
    return before.slice(open, close).replace(/\n\s*\*/g, ' ').replace(/\s+/g, ' ');
}

describe('which elements get a component, and under what name', () => {
    it('names a component Aparte<Pascal> after the tag, and its props type with `Props`', () => {
        const components = bind();
        expect(byTag(components, 'aparte-conversation-list')).toMatchObject({ component: 'AparteConversationList', props: 'AparteConversationListProps' });
        expect(byTag(components, 'aparte-chat-viewport').component).toBe('AparteChatViewport');
        expect(byTag(components, 'aparte-composer-send').component).toBe('AparteComposerSend');
    });

    it('skips what `reactSkip` names: `<AparteChat>` is a composite that owns the chat\'s name', () => {
        const components = bind();
        expect(components.map((c) => c.tag)).not.toContain('aparte-chat');
        expect(components.map((c) => c.component)).not.toContain('AparteChat');
        expect(components).toHaveLength(ELEMENTS.length - 1);
    });

    it('gives an element with no attribute and no event a component all the same: the tag is claimed', () => {
        const bare = byTag(bind(), 'aparte-composer-send');
        expect(bare).toMatchObject({ attributes: [], properties: [], events: [], initial: [] });
    });

    it('refuses a name the React package already exports, naming the element and the name', () => {
        // Without `reactSkip`, the chat would be generated over `<AparteChat>`.
        const message = refusal(() => bind(ELEMENTS, { ...CFG, reactSkip: [] }));
        expect(message).toContain('<aparte-chat>');
        expect(message).toContain('`AparteChat`');
        expect(message).toContain('already exports');
        const ui = { ...BARE, tagName: 'aparte-ui', name: 'AparteUiElement' };
        expect(refusal(() => bind([ui]))).toContain('`AparteUi`');
    });
});

describe('the ref: core\'s element class when its barrel exports it, HTMLElement otherwise', () => {
    it('names the class a core element is exported under', () => {
        expect(EXPORTED).toContain('AparteConversationList');
        expect(byTag(bind(), 'aparte-conversation-list').element).toBe('AparteConversationList');
    });

    it('falls back to HTMLElement for an element whose class the barrel does not export', () => {
        expect(EXPORTED).not.toContain('AparteModelPicker');
        expect(byTag(bind([PLUGIN]), 'aparte-model-picker').element).toBeNull();
    });
});

describe('the props: attributes by their HTML names, property-only members, and callbacks', () => {
    it('lists the attributes the element declares, by the name React users write on the raw tag', () => {
        const list = byTag(bind(), 'aparte-conversation-list');
        expect(list.attributes).toEqual(['active-id', 'flat']);
        expect(byTag(bind(), 'aparte-select').attributes).toEqual(['value', 'searchable']);
    });

    it('leaves out an attribute the element reflects onto itself (the list `angularInputOmit` holds)', () => {
        expect(byTag(bind(), 'aparte-conversation-list').attributes).not.toContain('data-no-match');
    });

    it('makes a property-only member a prop — the one the issue could not reach — and nothing else of the class', () => {
        const list = byTag(bind(), 'aparte-conversation-list');
        expect(list.properties).toEqual([
            { name: 'conversations', type: 'AparteConversationListItem[]', description: 'Set the list of conversations to display.' },
        ]);
    });

    it('turns an attribute read once at connect into an initial one: it has to be in the first markup', () => {
        const viewport = byTag(bind(), 'aparte-chat-viewport');
        expect(viewport.initial).toEqual(['framework-managed']);
        expect(viewport.attributes).toEqual(['loading']);
    });

    it('refuses a `readAtConnect` entry for an attribute the element does not declare', () => {
        const message = refusal(() => bind(ELEMENTS, { ...CFG, readAtConnect: { 'aparte-chat-viewport': ['framework-managd'] } }));
        expect(message).toContain('<aparte-chat-viewport>');
        expect(message).toContain('`framework-managd`');
        expect(message).toContain('readAtConnect');
    });

    it('binds each event as `on` and its binding name, with the detail type or `null`', () => {
        const list = byTag(bind(), 'aparte-conversation-list');
        expect(list.events.map((e) => [e.type, e.prop, e.detail])).toEqual([
            ['aparte-conversation-select', 'onConversationSelect', 'AparteConversationSelectDetail'],
            ['aparte-conversation-rename', 'onConversationRename', 'AparteConversationRenameDetail'],
        ]);
        const select = byTag(bind(), 'aparte-select');
        expect(select.events.map((e) => [e.prop, e.detail])).toEqual([['onSelectOpen', null], ['onSelectChange', 'AparteSelectChangeDetail']]);
    });

    it('takes the name from `bindingRenames`, as the Angular outputs do: Stop is `onStop`, not a native `cancel`', () => {
        const composer = byTag(bind(), 'aparte-composer');
        expect(composer.events.map((e) => e.prop)).toEqual(['onSend', 'onStop']);
        expect(bindingName('aparte-composer', 'aparte-cancel', CFG)).toBe('stop');
    });

    it('gives no callback to an event the element sends on `window` only: a listener on it would never hear it', () => {
        const composer = byTag(bind(), 'aparte-composer');
        expect(composer.events.map((e) => e.type)).not.toContain('aparte-abort');
    });

    it('marks as cancelable the events whose description says so, and only those', () => {
        const list = byTag(bind(), 'aparte-conversation-list');
        expect(list.events.map((e) => e.cancelable)).toEqual([false, true]);
    });
});

describe('the refusals — each names the element, the event, the clash and the fix', () => {
    const toggle = { ...BARE, tagName: 'aparte-sheet', name: 'AparteSheet', events: [event('aparte-toggle', 'CustomEvent<AparteToggleDetail>', 'Toggled.')] };

    it('refuses a native DOM event name: the callback would be React\'s own `onToggle`', () => {
        const message = refusal(() => bind([toggle]));
        expect(message).toContain('<aparte-sheet>');
        expect(message).toContain('"aparte-toggle"');
        expect(message).toContain('`toggle`');
        expect(message).toContain('native DOM event');
        expect(message).toContain('bindingRenames');
    });

    it('accepts the same event once the config names it', () => {
        const config = { ...CFG, bindingRenames: { ...CFG.bindingRenames, 'aparte-sheet': { 'aparte-toggle': 'sheetToggle' } } };
        const sheet = byTag(bind([{ ...toggle, events: [{ ...toggle.events[0], type: { text: 'CustomEvent<AparteSplitResizeDetail>' } }] }], config), 'aparte-sheet');
        expect(sheet.events.map((e) => e.prop)).toEqual(['onSheetToggle']);
    });

    it('refuses two events folded onto one name, naming both', () => {
        const twice = { ...BARE, tagName: 'aparte-twice', name: 'AparteTwice', events: [event('aparte-pick', 'CustomEvent'), event('aparte-pick-done', 'CustomEvent')] };
        const config = { ...CFG, bindingRenames: { 'aparte-twice': { 'aparte-pick-done': 'pick' } } };
        const message = refusal(() => bind([twice], config));
        expect(message).toContain('"aparte-pick"');
        expect(message).toContain('"aparte-pick-done"');
        expect(message).toContain('`pick`');
    });

    it('refuses a detail type core\'s barrel does not export: the import would not compile in a consumer', () => {
        const hidden = { ...BARE, tagName: 'aparte-hidden', name: 'AparteHidden', events: [event('aparte-hide', 'CustomEvent<AparteHideInternals>')] };
        const message = refusal(() => bind([hidden]));
        expect(message).toContain('<aparte-hidden>');
        expect(message).toContain('AparteHideInternals');
        expect(message).toContain('packages/core/src/index.ts');
    });

    it('refuses a property type the barrel does not export, for the same reason', () => {
        const rows = { ...BARE, tagName: 'aparte-rows', name: 'AparteRows', members: [field('rows', 'AparteRowInternals[]')] };
        const message = refusal(() => bind([rows]));
        expect(message).toContain('<aparte-rows>');
        expect(message).toContain('AparteRowInternals');
    });

    it('reports every problem in one refusal, so one run fixes them all', () => {
        const hidden = { ...BARE, tagName: 'aparte-hidden', name: 'AparteHidden', events: [event('aparte-hide', 'CustomEvent<AparteHideInternals>')] };
        const message = refusal(() => bind([toggle, hidden]));
        expect(message).toContain('<aparte-sheet>');
        expect(message).toContain('<aparte-hidden>');
    });
});

describe('the file — explicit types, the manifest\'s own prose, one call per element', () => {
    // One element of a plugin too: its class is not in core's barrel.
    const src = renderReactElements(bind([...ELEMENTS, PLUGIN]));

    it('imports what it names from @aparte/core as types, and the factory from the package\'s internals', () => {
        expect(src).toContain('import type {');
        expect(src).toContain('    AparteConversationList as AparteConversationListElement,');
        expect(src).toContain('    AparteConversationListItem,');
        expect(src).toContain('    AparteConversationSelectDetail,');
        expect(src).toContain('    AparteElementAttributes,');
        expect(src).toContain("} from '@aparte/core';");
        expect(src).toContain("import { createAparteElement, type AparteElementProps } from '../internal/element-component.js';");
        // A plugin element with no exported class imports nothing for its ref.
        expect(src).not.toContain('AparteModelPickerElement');
    });

    it('declares a props interface per element, over the attribute registry', () => {
        expect(src).toContain("export interface AparteConversationListProps extends AparteElementProps<AparteElementAttributes['aparte-conversation-list']> {");
        // No own member, so no empty interface: a type alias says the same.
        expect(src).toContain("export type AparteComposerSendProps = AparteElementProps<AparteElementAttributes['aparte-composer-send']>;");
        expect(src).not.toMatch(/AparteComposerSendProps[^;]*\{\s*\}/);
    });

    it('types a property-only member and each callback, with the detail then the event', () => {
        expect(src).toContain('    conversations?: AparteConversationListItem[];');
        expect(src).toContain('    onConversationSelect?: (detail: AparteConversationSelectDetail, event: CustomEvent<AparteConversationSelectDetail>) => void;');
        expect(src).toContain('    onSelectOpen?: (detail: null, event: CustomEvent<null>) => void;');
        expect(src).toContain('    onStop?: (detail: null, event: CustomEvent<null>) => void;');
    });

    it('exports a component per element from one annotated call, so an unused one is dropped by a bundler', () => {
        expect(src).toContain('export const AparteConversationList = /* @__PURE__ */ createAparteElement<AparteConversationListElement, AparteConversationListProps>(');
        expect(src).toContain("    'aparte-conversation-list',\n    'AparteConversationList',");
        expect(src).toContain('export const AparteModelPicker = /* @__PURE__ */ createAparteElement<HTMLElement, AparteModelPickerProps>(');
        const calls = src.match(/export const \w+ = \/\* @__PURE__ \*\/ createAparteElement</g) ?? [];
        expect(calls).toHaveLength(ELEMENTS.length);
    });

    it('lists what each component applies: attributes, initial attributes, properties and events', () => {
        expect(src).toContain("        attributes: ['active-id', 'flat'],");
        expect(src).toContain("        properties: ['conversations'],");
        expect(src).toContain("            ['aparte-conversation-select', 'onConversationSelect'],");
        expect(src).toContain("            ['aparte-conversation-rename', 'onConversationRename'],");
        expect(src).toContain("        initial: ['framework-managed'],");
        // An element with nothing to apply says so with empty lists, not with a missing key.
        expect(src).toMatch(/'aparte-composer-send',\n\s+'AparteComposerSend',\n\s+\{ attributes: \[\], properties: \[\], events: \[\], initial: \[\] \}/);
    });

    it('carries the manifest\'s prose onto each member, and the first paragraph onto the component', () => {
        expect(docAbove(src, '    conversations?:')).toContain('Set the list of conversations to display.');
        expect(docAbove(src, '    onConversationSelect?:')).toContain("A row's title was activated; the host loads that conversation.");
        expect(docAbove(src, 'export const AparteConversationList =')).toContain('`<aparte-conversation-list>` — Conversation-history sidebar.');
        expect(docAbove(src, 'export const AparteConversationList =')).not.toContain('second paragraph');
    });

    it('names the DOM event on each callback, and says how to cancel where the event can be cancelled', () => {
        expect(docAbove(src, '    onConversationSelect?:')).toContain('DOM event: `aparte-conversation-select`.');
        expect(docAbove(src, '    onConversationRename?:')).toContain('call `event.preventDefault()`');
        expect(docAbove(src, '    onConversationSelect?:')).not.toContain('preventDefault');
        expect(docAbove(src, '    onSelectChange?:')).not.toContain('preventDefault');
    });

    it('generates no component for the chat and none for a window-only event', () => {
        expect(src).not.toContain('export const AparteChat ');
        expect(src).not.toContain('AparteChatProps');
        expect(src).not.toContain('onAbort');
        expect(src).not.toContain('aparte-abort');
    });

    it('writes nothing it would have to import from React: the factory owns that', () => {
        expect(src).not.toMatch(/from 'react'/);
    });
});

describe('on the real manifest', () => {
    const elements = readElements(CORE);

    it('binds every element but the chat, under names no framework trips on', () => {
        const components = reactElementBindings(elements, CONFIG, { native: NATIVE, exported: EXPORTED, reserved: RESERVED });
        expect(components).toHaveLength(elements.length - 1);
        expect(components.map((c: Component) => c.tag)).not.toContain('aparte-chat');
        const names = components.map((c: Component) => c.component);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) expect(RESERVED.has(name), name).toBe(false);
        for (const c of components as Component[]) {
            const props = c.events.map((e) => e.prop);
            expect(new Set(props).size, `${c.tag} binds each event once`).toBe(props.length);
        }
    });

    it('gives the issue\'s element the surface the issue asked for', () => {
        const list = byTag(reactElementBindings(elements, CONFIG, { native: NATIVE, exported: EXPORTED, reserved: RESERVED }), 'aparte-conversation-list');
        expect(list.component).toBe('AparteConversationList');
        expect(list.element).toBe('AparteConversationList');
        expect(list.attributes).toEqual(expect.arrayContaining(['active-id', 'flat', 'loading', 'manage', 'target']));
        expect(list.properties.map((p) => p.name)).toEqual(['conversations', 'renderMeta']);
        expect(list.events.map((e) => e.prop)).toEqual([
            'onConversationSelect', 'onConversationRename', 'onConversationPin', 'onConversationUnpin',
            'onConversationArchive', 'onConversationUnarchive', 'onConversationDelete',
        ]);
        expect(list.events.filter((e) => e.cancelable).map((e) => e.prop)).toEqual([
            'onConversationRename', 'onConversationPin', 'onConversationUnpin',
            'onConversationArchive', 'onConversationUnarchive', 'onConversationDelete',
        ]);
    });

    it('holds the viewport\'s `framework-managed` in its first markup — core reads it once, at connect', () => {
        const viewport = byTag(reactElementBindings(elements, CONFIG, { native: NATIVE, exported: EXPORTED, reserved: RESERVED }), 'aparte-chat-viewport');
        expect(viewport.initial).toEqual(['framework-managed']);
        expect(viewport.attributes).not.toContain('framework-managed');
    });

    it('types every ref with the element\'s own class: core exports all 25', () => {
        const components = reactElementBindings(elements, CONFIG, { native: NATIVE, exported: EXPORTED, reserved: RESERVED }) as Component[];
        expect(components.filter((c) => c.element === null).map((c) => c.tag)).toEqual([]);
    });
});

describe('the script', () => {
    let dir: string;
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'aparte-gen-react-'));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    const run = (...args: string[]) => {
        const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', windowsHide: true });
        return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
    };

    /** The real config with one edit, written where `--config` can read it. */
    function doctoredConfig(name: string, edit: (c: typeof CONFIG) => void): string {
        const copy = structuredClone(CONFIG);
        edit(copy);
        const file = join(dir, `${name}.config.mjs`);
        writeFileSync(file, `export default ${JSON.stringify(copy)};\n`, 'utf8');
        return file;
    }

    /** The React package's real barrel: the names it exports by hand are the ones a component must not take. */
    const REACT_BARREL = 'packages/wrappers/react/src/index.ts';
    const runReact = (out: string, ...more: string[]) => run('packages/core', '--react-elements', out, '--react-barrel', REACT_BARREL, ...more);

    it('writes one file with a component per element but the chat', () => {
        const out = join(dir, 'real');
        const r = runReact(out);
        expect(r.code).toBe(0);
        expect(r.out).toContain('react elements: 24 components');
        const src = readFileSync(join(out, 'element-components.ts'), 'utf8');
        const exported = [...src.matchAll(/^export const (\w+) = \/\* @__PURE__ \*\/ createAparteElement</gm)].map((m) => m[1]);
        expect(exported).toHaveLength(24);
        expect(exported).toContain('AparteConversationList');
        expect(exported).toContain('AparteLauncher');
        expect(exported).toContain('AparteSplit');
        expect(exported).not.toContain('AparteChat');
    });

    it('is the only thing `--react-elements` writes: no registry, no chat file', () => {
        expect(existsSync(join(dir, 'real', 'chat-events.ts'))).toBe(false);
        expect(existsSync(join(dir, 'real', 'element-attributes.ts'))).toBe(false);
    });

    it('refuses a config that leaves a component a native binding, and writes nothing', () => {
        const config = doctoredConfig('no-composer-rename', (c) => {
            delete c.bindingRenames['aparte-composer'];
        });
        const out = join(dir, 'refused-native');
        const r = runReact(out, '--config', config);
        expect(r.code).toBe(1);
        expect(r.out).toContain('<aparte-composer>');
        expect(r.out).toContain('"aparte-cancel"');
        expect(r.out).toContain('`cancel`');
        expect(existsSync(join(out, 'element-components.ts'))).toBe(false);
    });

    it('refuses to generate over `<AparteChat>` when the chat is no longer skipped', () => {
        const config = doctoredConfig('chat-not-skipped', (c) => {
            c.reactSkip = [];
        });
        const out = join(dir, 'refused-chat');
        const r = runReact(out, '--config', config);
        expect(r.code).toBe(1);
        expect(r.out).toContain('<aparte-chat>');
        expect(r.out).toContain('`AparteChat`');
        expect(existsSync(join(out, 'element-components.ts'))).toBe(false);
    });

    it('refuses when the barrel it reads for reserved names is missing: a check that silently passes is no check', () => {
        const r = run('packages/core', '--react-elements', join(dir, 'no-barrel', 'generated'));
        expect(r.code).toBe(1);
        expect(r.out).toContain('--react-barrel');
        expect(existsSync(join(dir, 'no-barrel', 'generated', 'element-components.ts'))).toBe(false);
    });

    describe('in a package of its own, where the barrel re-exports the generated file', () => {
        const pkg = () => join(dir, 'pkg', 'src');
        const barrel = (extra = '') => {
            mkdirSync(pkg(), { recursive: true });
            writeFileSync(join(pkg(), 'index.ts'), `export * from './generated/element-components.js';\nexport { AparteChat } from './components/AparteChat.js';\n${extra}`, 'utf8');
        };

        it('reads the barrel by default — the one beside the output directory — and does not take its own last output for a clash', () => {
            barrel();
            const out = join(pkg(), 'generated');
            const first = run('packages/core', '--react-elements', out);
            expect(first.code, first.out).toBe(0);
            // The second run finds `element-components.ts` already in place, and the barrel exports every name in it.
            const second = run('packages/core', '--react-elements', out);
            expect(second.code, second.out).toBe(0);
        });

        it('refuses a component whose name the barrel already exports by hand', () => {
            barrel("export const AparteSplit = null;\n");
            const r = run('packages/core', '--react-elements', join(pkg(), 'generated'));
            expect(r.code).toBe(1);
            expect(r.out).toContain('<aparte-split>');
            expect(r.out).toContain('`AparteSplit`');
        });
    });
});
