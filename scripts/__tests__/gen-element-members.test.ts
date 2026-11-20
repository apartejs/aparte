/**
 * The generator writes, for every element, the two things the attribute registry cannot say:
 * its property-only members and the events it sends — so Vue and Svelte can type a tag's
 * `:conversations="rows"` and `@aparte-conversation-select="…"` from the manifest too.
 *
 * What the registry covers, and what it leaves out. `AparteElementAttributes` is the element's
 * ATTRIBUTES, and that is right for React's raw tags (a property cannot be bound in React 18,
 * so typing `conversations` there would be a promise it breaks). Vue and Svelte do set a
 * property when the element has one, and both listen to the element's events, so for them the
 * rest of the surface is a fact worth typing — and one the manifest holds.
 *
 * Types only, in a file each wrapper imports; nothing here reaches a bundle. Total by
 * construction, like the registry: every tag has an entry, an empty one saying "checked, none".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { elementMembers, readBarrelExports, readElements, renderElementMembers } from '../gen-element-bindings.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'gen-element-bindings.mjs');
const REPO = resolve(dirname(SCRIPT), '..');
const CORE = join(REPO, 'packages/core');
const CONFIG = (await import(pathToFileURL(join(CORE, 'element-bindings.config.mjs')).href)).default;
const EXPORTED: Set<string> = readBarrelExports(join(CORE, 'src/index.ts'));

type Member = {
    tag: string;
    properties: Array<{ name: string; type: string; description: string }>;
    events: Array<{ type: string; detail: string | null; description: string }>;
};

const field = (name: string, text: string, description = '') => ({ kind: 'field', name, type: { text }, description });
const event = (name: string, text: string, description = '') => ({ name, type: { text }, description });

const LIST = {
    customElement: true,
    tagName: 'aparte-conversation-list',
    name: 'AparteConversationList',
    attributes: [{ name: 'active-id', type: { text: 'string' } }, { name: 'data-no-match', type: { text: 'boolean' } }],
    members: [
        field('conversations', 'AparteConversationListItem[]', 'Set the list of conversations to display.'),
        field('_hidden', 'AparteConversationListItem[]'),
        field('activeId', 'string', 'the property behind `active-id`: an attribute has it, so it is not property-only'),
    ],
    events: [
        event('aparte-conversation-select', 'CustomEvent<AparteConversationSelectDetail>', "A row's title was activated."),
        event('aparte-conversation-rename', 'CustomEvent<AparteConversationRenameDetail>', 'A rename was committed.'),
    ],
};
const SELECT = {
    customElement: true,
    tagName: 'aparte-select',
    name: 'AparteSelect',
    attributes: [],
    members: [],
    events: [event('aparte-select-open', 'CustomEvent', 'The menu opened. No detail.')],
};
const COMPOSER = {
    customElement: true,
    tagName: 'aparte-composer',
    name: 'AparteComposer',
    attributes: [],
    members: [],
    events: [
        event('aparte-send', 'CustomEvent<AparteSendEventDetail>', 'A message was sent.'),
        event('aparte-abort', 'CustomEvent<AparteAbortEventDetail>', 'Sent on window only.'),
    ],
};
const ICON = { customElement: true, tagName: 'aparte-icon', name: 'AparteIcon', attributes: [], members: [], events: [] };

const ELEMENTS = [LIST, SELECT, COMPOSER, ICON];
const CFG = {
    angularInputOmit: { 'aparte-conversation-list': ['data-no-match'] },
    windowDispatched: { 'aparte-composer': ['aparte-abort'] },
};

const members = (elements: object[] = ELEMENTS, config: object = CFG): Member[] => elementMembers(elements, config, { exported: EXPORTED });
const of = (list: Member[], tag: string): Member => list.find((m) => m.tag === tag)!;

function refusal(fn: () => unknown): string {
    try {
        fn();
    } catch (e) {
        return (e as Error).message;
    }
    throw new Error('expected a refusal, and the call returned');
}

describe('what an element has beyond its attributes', () => {
    it('lists the property-only members, and only those', () => {
        expect(of(members(), 'aparte-conversation-list').properties).toEqual([
            { name: 'conversations', type: 'AparteConversationListItem[]', description: 'Set the list of conversations to display.' },
        ]);
        expect(of(members(), 'aparte-select').properties).toEqual([]);
    });

    it('lists the events the element sends on itself, with the detail type or none', () => {
        expect(of(members(), 'aparte-conversation-list').events.map((e) => [e.type, e.detail])).toEqual([
            ['aparte-conversation-select', 'AparteConversationSelectDetail'],
            ['aparte-conversation-rename', 'AparteConversationRenameDetail'],
        ]);
        expect(of(members(), 'aparte-select').events.map((e) => [e.type, e.detail])).toEqual([['aparte-select-open', null]]);
    });

    it('leaves out an event sent on `window` only: a listener on the element never hears it', () => {
        expect(of(members(), 'aparte-composer').events.map((e) => e.type)).toEqual(['aparte-send']);
    });

    it('has an entry for every element, an empty one for an element with nothing', () => {
        expect(members().map((m) => m.tag)).toEqual(ELEMENTS.map((e) => e.tagName));
        expect(of(members(), 'aparte-icon')).toMatchObject({ properties: [], events: [] });
    });

    it('refuses a detail or property type core\'s barrel does not export: the import would not compile', () => {
        const hidden = { ...ICON, tagName: 'aparte-hidden', events: [event('aparte-hide', 'CustomEvent<AparteHideInternals>')] };
        const message = refusal(() => members([hidden]));
        expect(message).toContain('<aparte-hidden>');
        expect(message).toContain('AparteHideInternals');
        expect(message).toContain('packages/core/src/index.ts');
        const rows = { ...ICON, tagName: 'aparte-rows', members: [field('rows', 'AparteRowInternals[]')] };
        expect(refusal(() => members([rows]))).toContain('AparteRowInternals');
    });
});

describe('the file', () => {
    const src = renderElementMembers(members());

    it('imports each type it names from @aparte/core, as a type, sorted', () => {
        expect(src).toContain(
            "import type {\n    AparteConversationListItem,\n    AparteConversationRenameDetail,\n    AparteConversationSelectDetail,\n    AparteSendEventDetail,\n} from '@aparte/core';",
        );
        expect(src).not.toMatch(/from 'vue'|from 'svelte/);
    });

    it('declares the properties of every element: `Record<never, never>` where there are none', () => {
        expect(src).toContain('export interface AparteElementProperties {');
        expect(src).toContain("    'aparte-conversation-list': {\n        /** Set the list of conversations to display. */\n        conversations?: AparteConversationListItem[];\n    };");
        expect(src).toContain("    'aparte-select': Record<never, never>;");
        expect(src).toContain("    'aparte-icon': Record<never, never>;");
    });

    it('declares the events of every element as the event a listener receives', () => {
        expect(src).toContain('export interface AparteElementEvents {');
        expect(src).toContain("        /** A row's title was activated. */\n        'aparte-conversation-select': CustomEvent<AparteConversationSelectDetail>;");
        expect(src).toContain("        'aparte-select-open': CustomEvent<null>;");
        expect(src).toContain("    'aparte-icon': Record<never, never>;");
        expect(src).not.toContain('aparte-abort');
    });

    it('is the same tags in both interfaces', () => {
        const tags = (name: string) => {
            const block = src.slice(src.indexOf(`export interface ${name} {`));
            return [...block.slice(0, block.indexOf('\n}\n')).matchAll(/^ {4}'(aparte-[a-z-]+)':/gm)].map((m) => m[1]);
        };
        expect(tags('AparteElementProperties')).toEqual(ELEMENTS.map((e) => e.tagName));
        expect(tags('AparteElementEvents')).toEqual(ELEMENTS.map((e) => e.tagName));
    });
});

describe('on the real manifest', () => {
    const elements = readElements(CORE);
    const real = elementMembers(elements, CONFIG, { exported: EXPORTED }) as Member[];

    it('has every element, the chat among them: a raw `<aparte-chat>` is a tag too', () => {
        expect(real.map((m) => m.tag)).toEqual(elements.map((e: { tagName: string }) => e.tagName));
        expect(real).toHaveLength(25);
    });

    it('finds the properties a template has to bind: the list the issue could not bind, and its row hook', () => {
        const withProperties = real.filter((m) => m.properties.length);
        expect(withProperties.map((m) => [m.tag, m.properties.map((p) => p.name)])).toEqual([['aparte-conversation-list', ['conversations', 'moveTargets', 'renderMeta']]]);
    });
});

describe('the script', () => {
    let dir: string;
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'aparte-gen-members-'));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('writes element-members.ts, and nothing else of the other outputs', () => {
        const out = join(dir, 'members');
        const r = spawnSync(process.execPath, [SCRIPT, 'packages/core', '--element-members', out], { cwd: REPO, encoding: 'utf8', windowsHide: true });
        expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
        const src = readFileSync(join(out, 'element-members.ts'), 'utf8');
        expect(src).toContain("'aparte-conversation-list': {");
        expect(src).toContain('conversations?: AparteConversationListItem[];');
        expect(src).toContain("'aparte-conversation-select': CustomEvent<AparteConversationSelectDetail>;");
        expect(existsSync(join(out, 'element-components.ts'))).toBe(false);
        expect(existsSync(join(out, 'element-attributes.ts'))).toBe(false);
    });
});
