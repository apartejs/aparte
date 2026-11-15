/**
 * The chat declares every event its root hears, and a guard keeps it true.
 *
 * `<aparte-chat>`'s `@fires` are the source every wrapper binding is generated from, so they
 * are exactly as good as the mechanism that keeps them equal to what really reaches the
 * root. Two rules of `check-event-map` are that mechanism:
 *
 *   • rule 5 — the chat's `@fires` equal, both ways, what its parts dispatch on an element
 *     (bubbling) plus what its host dispatches on it (`dispatchLifecycleEvent`, the
 *     conversation controller's `binding.host`), minus `CHAT_EXEMPT`;
 *   • rule 6 — `windowDispatched` in `packages/core/element-bindings.config.mjs` equals the
 *     events each element really sends only on `window`, so no generated Angular directive
 *     offers an Output nothing can fire. `<aparte-context>`'s `(compact)` was one.
 *
 * The sabotage is the test, as in `wrapper-surface.test.ts`: the real tree, doctored one
 * way at a time — a `@fires` dropped, a phantom one, an exempt one declared, a dispatch
 * added to a part or to the host, a window dispatch left out of the config — and each must
 * be refused BY NAME. Every doctoring also asserts it bit, or the row proves nothing.
 *
 * The real tree must pass for any of it to mean anything, which is the first test; and the
 * gate's own script is run twice over a doctored input (`--cem`, `--bindings`), because
 * functions that pass while the script forgets to call them are a guard in name only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    CHAT_EXEMPT,
    CHAT_EVENT_FLOOR,
    CHAT_TAG,
    checkChatSurface,
    readChatEvents,
    readChatParts,
    readChatTree,
} from '../chat-surface.mjs';
import { checkWindowDispatched, dispatchesIn } from '../dispatch-sites.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-event-map.mjs');
const REPO = resolve(dirname(SCRIPT), '..');
const CONFIG = join(REPO, 'packages/core/element-bindings.config.mjs');

const COMPOSER = 'packages/core/src/components/composer/aparte-composer.ts';
const ATTACHMENTS = 'packages/core/src/components/composer/aparte-composer-attachments.ts';
const CONTEXT = 'packages/core/src/components/context/aparte-context.ts';
const CLIENT = 'packages/core/src/client/aparte-client.ts';

const TREE = readChatTree();
const WINDOW: Record<string, string[]> = (await import(pathToFileURL(CONFIG).href)).default.windowDispatched;

type Tree = ReturnType<typeof readChatTree>;
type ManifestEvent = { name: string; type?: { text: string }; description?: string };

/** The tree with the chat's declared events edited — the manifest is cloned, never touched. */
function withChatEvents(edit: (events: ManifestEvent[]) => ManifestEvent[]): Tree {
    const cem = structuredClone(TREE.cem);
    const chat = cem.modules
        .flatMap((m: { declarations?: Array<{ tagName?: string; events?: ManifestEvent[] }> }) => m.declarations ?? [])
        .find((d: { tagName?: string }) => d.tagName === CHAT_TAG);
    chat.events = edit(chat.events ?? []);
    return { ...TREE, cem };
}

/** The tree with one source file doctored. The edit has to bite. */
function withSource(path: string, edit: (src: string) => string): Tree {
    const before = TREE.files.get(path);
    expect(before, `${path} is in the tree`).toBeTypeOf('string');
    const after = edit(before as string);
    expect(after, `the doctoring of ${path} landed`).not.toBe(before);
    const files = new Map(TREE.files);
    files.set(path, after);
    return { ...TREE, files };
}

/** `windowDispatched`, edited on a copy. */
function withWindow(edit: (w: Record<string, string[]>) => void): Record<string, string[]> {
    const copy = structuredClone(WINDOW);
    edit(copy);
    return copy;
}

const problemsOf = (tree: Tree) => checkChatSurface(tree).problems as string[];
const onlyAbout = (problems: string[], name: string) => problems.filter((p) => p.includes(`"${name}"`));

describe('the chat surface, on the real tree', () => {
    it('has no problem: every event the root hears is declared, and nothing else is', () => {
        expect(problemsOf(TREE)).toEqual([]);
    });

    it('reads a surface above its floor, from parts and from the host', () => {
        const { surface, parts } = checkChatSurface(TREE);
        expect(surface.length).toBeGreaterThanOrEqual(CHAT_EVENT_FLOOR);
        // The parts the chat renders, the composer's own family, and the host's turn.
        for (const tag of ['aparte-chat-bubble', 'aparte-chat-viewport', 'aparte-composer', 'aparte-composer-action']) {
            expect(parts, tag).toContain(tag);
        }
    });

    it('hands the events on with what a generator needs: type, detail, description, cancelable, who sends them', () => {
        const events = readChatEvents(TREE);
        const byName = new Map(events.map((e: { name: string }) => [e.name, e]));
        expect(byName.get('aparte-link-click')).toMatchObject({
            type: 'CustomEvent<AparteLinkClickEventDetail>',
            detail: 'AparteLinkClickEventDetail',
            cancelable: true,
            from: ['aparte-chat-bubble'],
        });
        expect(byName.get('aparte-cancel')).toMatchObject({ type: 'CustomEvent', detail: null, cancelable: false });
        expect(byName.get('aparte-message-start')).toMatchObject({ from: ['host'], cancelable: false });
        expect(byName.get('aparte-conversation-loaded')).toMatchObject({ from: ['host'] });
        expect(byName.get('aparte-action-click')).toMatchObject({ from: ['aparte-composer-action'] });
        expect(byName.get('aparte-attachment-preview')?.from).toEqual(['aparte-chat-bubble', 'aparte-composer-attachments']);
        for (const e of events) expect(e.description, e.name).not.toBe('');
    });

    it('keeps the exempt ones out of the surface it hands on', () => {
        const names = readChatEvents(TREE).map((e: { name: string }) => e.name);
        for (const name of CHAT_EXEMPT.keys()) expect(names).not.toContain(name);
        // And the window events, which no listener on the chat can hear.
        for (const name of ['aparte-abort', 'aparte-compact', 'aparte-compact-done', 'aparte-config-change']) {
            expect(names).not.toContain(name);
        }
    });

    it('gives every exemption a reason', () => {
        expect(CHAT_EXEMPT.size).toBeGreaterThan(0);
        for (const [name, reason] of CHAT_EXEMPT) expect(String(reason).length, name).toBeGreaterThan(20);
    });
});

describe('rule 5 — the chat\'s @fires against what reaches its root', () => {
    it('refuses a dropped @fires, naming the event and who sends it', () => {
        const problems = onlyAbout(problemsOf(withChatEvents((evs) => evs.filter((e) => e.name !== 'aparte-retry'))), 'aparte-retry');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('reaches the chat root');
        expect(problems[0]).toContain('<aparte-chat-bubble>');
    });

    it('refuses a dropped host event too — the lifecycle is part of the surface', () => {
        const problems = onlyAbout(problemsOf(withChatEvents((evs) => evs.filter((e) => e.name !== 'aparte-message-paused'))), 'aparte-message-paused');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('the chat\'s host');
    });

    it('refuses a phantom @fires: a binding nothing could ever fire', () => {
        const tree = withChatEvents((evs) => [...evs, { name: 'aparte-phantom', type: { text: 'CustomEvent' }, description: 'Never sent.' }]);
        const problems = onlyAbout(problemsOf(tree), 'aparte-phantom');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('nothing in the chat dispatches it');
    });

    it('refuses an exempt event declared, quoting why it is exempt', () => {
        const tree = withChatEvents((evs) => [...evs, {
            name: 'aparte-branch-navigate',
            type: { text: 'CustomEvent<AparteBranchNavigateEventDetail>' },
            description: 'The picker moved.',
        }]);
        const problems = onlyAbout(problemsOf(tree), 'aparte-branch-navigate');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('CHAT_EXEMPT');
        expect(problems[0]).toContain(CHAT_EXEMPT.get('aparte-branch-navigate'));
    });

    it('refuses a new bubbling dispatch in a part that the chat does not declare', () => {
        const tree = withSource(COMPOSER, (src) => src.replace(
            'cancel(): void {',
            'cancel(): void {\n        this.dispatchEvent(new CustomEvent(\'aparte-composer-wobble\', { bubbles: true, composed: true }));',
        ));
        const problems = onlyAbout(problemsOf(tree), 'aparte-composer-wobble');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('<aparte-composer>');
        expect(problems[0]).toContain('CHAT_EXEMPT');
    });

    it('refuses a new lifecycle event the host dispatches on the chat', () => {
        const tree = withSource(CLIENT, (src) => src.replace(
            "dispatchLifecycleEvent(targetElement, 'aparte-message-start',",
            "dispatchLifecycleEvent(targetElement, 'aparte-message-wobbled', { messageId }, chatId);\n        dispatchLifecycleEvent(targetElement, 'aparte-message-start',",
        ));
        expect(onlyAbout(problemsOf(tree), 'aparte-message-wobbled')).toHaveLength(1);
    });

    it('asks nothing of a dispatch that cannot reach the root: on window, not bubbling, or commented out', () => {
        const tree = withSource(COMPOSER, (src) => src.replace(
            'cancel(): void {',
            'cancel(): void {\n'
                + '        window.dispatchEvent(new CustomEvent(\'aparte-composer-page\', { detail: 1 }));\n'
                + '        this.dispatchEvent(new CustomEvent(\'aparte-composer-private\', { detail: 1 }));\n'
                + '        // this.dispatchEvent(new CustomEvent(\'aparte-composer-ghost\', { bubbles: true }));',
        ));
        expect(problemsOf(tree)).toEqual([]);
    });

    it('refuses a declared type the event map contradicts', () => {
        const tree = withChatEvents((evs) => evs.map((e) => (e.name === 'aparte-send' ? { ...e, type: { text: 'CustomEvent<AparteRetryEventDetail>' } } : e)));
        const problems = onlyAbout(problemsOf(tree), 'aparte-send');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('CustomEvent<AparteSendEventDetail>');
    });

    it('refuses a description that hides a cancelable event, or claims one', () => {
        const hidden = withChatEvents((evs) => evs.map((e) => (e.name === 'aparte-link-click' ? { ...e, description: 'A link is followed.' } : e)));
        expect(onlyAbout(problemsOf(hidden), 'aparte-link-click')).toHaveLength(1);
        const claimed = withChatEvents((evs) => evs.map((e) => (e.name === 'aparte-retry' ? { ...e, description: 'Retry. Cancelable.' } : e)));
        expect(onlyAbout(problemsOf(claimed), 'aparte-retry')).toHaveLength(1);
    });

    it('refuses an event cancelable at one site and not at another — no listener could know', () => {
        const tree = withSource(ATTACHMENTS, (src) => src.replace(
            "new CustomEvent('aparte-attachment-preview', {",
            "new CustomEvent('aparte-attachment-preview', {\n                    cancelable: true,",
        ));
        const problems = onlyAbout(problemsOf(tree), 'aparte-attachment-preview');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('cancelable at one dispatch site and not at another');
    });

    it('refuses an exemption that outlived its event', () => {
        const exempt = new Map([...CHAT_EXEMPT, ['aparte-long-gone', 'Kept off the surface once, for a reason that no longer applies.']]);
        const problems = onlyAbout(checkChatSurface(TREE, { exempt }).problems, 'aparte-long-gone');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('remove the entry');
    });

    it('refuses a collapsed reading instead of passing over it', () => {
        // Every wrapper source and the chat's own composition blanked: the parts collapse to
        // the composer family, the transcript's events vanish from what is "heard".
        const files = new Map(TREE.files);
        for (const path of readChatParts(TREE).sources) files.set(path, '');
        const problems = checkChatSurface({ ...TREE, files }).problems as string[];
        expect(problems.some((p) => p.includes('floor is'))).toBe(true);
    });
});

describe('rule 6 — windowDispatched against what really goes out on window', () => {
    it('has no problem on the real tree', () => {
        expect(checkWindowDispatched(TREE, WINDOW).problems).toEqual([]);
    });

    it('lists <aparte-context>\'s aparte-compact, whose Angular Output was dead', () => {
        expect(WINDOW['aparte-context']).toContain('aparte-compact');
        const problems = checkWindowDispatched(TREE, withWindow((w) => {
            w['aparte-context'] = (w['aparte-context'] ?? []).filter((n) => n !== 'aparte-compact');
        })).problems as string[];
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('<aparte-context>');
        expect(problems[0]).toContain('"aparte-compact"');
        expect(problems[0]).toContain('(compact)');
    });

    it('refuses a window dispatch the config leaves out, read from the element\'s own source', () => {
        const tree = withSource(CONTEXT, (src) => src.replace(
            "this.dispatchEvent(new CustomEvent<AparteContextThresholdEventDetail>('aparte-context-threshold'",
            "window.dispatchEvent(new CustomEvent<AparteContextThresholdEventDetail>('aparte-context-threshold'",
        ));
        const problems = checkWindowDispatched(tree, WINDOW).problems as string[];
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('"aparte-context-threshold"');
    });

    it('reads a declared event dispatched in another file: the bubble\'s aparte-compact-done', () => {
        const problems = checkWindowDispatched(TREE, withWindow((w) => {
            w['aparte-chat-bubble'] = (w['aparte-chat-bubble'] ?? []).filter((n) => n !== 'aparte-compact-done');
        })).problems as string[];
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('packages/core/src/context/restore.ts');
    });

    it('refuses an entry for an event the element sends on itself: that would hide a live Output', () => {
        const problems = checkWindowDispatched(TREE, withWindow((w) => { w['aparte-composer'] = [...(w['aparte-composer'] ?? []), 'aparte-send']; })).problems as string[];
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('dispatches it on an element');
    });

    it('refuses an entry the element does not declare, and a tag the manifest does not have', () => {
        const ghost = checkWindowDispatched(TREE, withWindow((w) => { w['aparte-composer'] = [...(w['aparte-composer'] ?? []), 'aparte-ghost']; })).problems as string[];
        expect(ghost).toHaveLength(1);
        expect(ghost[0]).toContain('does not declare it');
        const tag = checkWindowDispatched(TREE, withWindow((w) => { w['aparte-nowhere'] = ['aparte-compact']; })).problems as string[];
        expect(tag).toHaveLength(1);
        expect(tag[0]).toContain('<aparte-nowhere>');
    });
});

describe('dispatchesIn — the one reader of a dispatch site', () => {
    it('reads where an event goes, whether it bubbles, and whether it can be cancelled', () => {
        const [onWindow] = dispatchesIn("window.dispatchEvent(new CustomEvent('aparte-x', { detail: { a: 1 } }));");
        expect(onWindow).toMatchObject({ name: 'aparte-x', onWindow: true, bubbles: false, cancelable: false, hasDetail: true, receiver: 'window' });
        const [own] = dispatchesIn("const go = this.dispatchEvent(new CustomEvent<D>('aparte-y', { detail, bubbles: true, cancelable: true }));");
        expect(own).toMatchObject({ name: 'aparte-y', onWindow: false, bubbles: true, cancelable: true, hasDetail: true, receiver: 'this' });
        const [bare] = dispatchesIn("this.dispatchEvent(new CustomEvent('aparte-z'));");
        expect(bare).toMatchObject({ name: 'aparte-z', bubbles: false, hasDetail: false });
        const [host] = dispatchesIn("this._binding.host.dispatchEvent(new CustomEvent('aparte-w', { bubbles: true, detail: { a: { b: 1 } } }));");
        expect(host).toMatchObject({ receiver: 'this._binding.host', bubbles: true });
        const [helper] = dispatchesIn("dispatchLifecycleEvent(target, 'aparte-v', { messageId }, id);");
        expect(helper).toMatchObject({ name: 'aparte-v', viaHelper: true, bubbles: true, cancelable: false, hasDetail: true, receiver: 'target' });
    });

    it('cannot tell from an init it does not see, and says so rather than guessing "no"', () => {
        const [shared] = dispatchesIn("this.dispatchEvent(new CustomEvent('aparte-u', INIT));");
        expect(shared?.bubbles).toBeNull();
    });
});

describe('the gate runs both rules', () => {
    let dir: string;
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'aparte-chat-surface-'));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    const run = (...args: string[]) => {
        const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: REPO, encoding: 'utf8', windowsHide: true });
        return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
    };

    it('passes on the real tree and prints what it read', () => {
        const r = run();
        expect(r.out).toContain('<aparte-chat> declares');
        expect(r.out).toContain('windowDispatched');
        expect(r.code).toBe(0);
    });

    it('fails on a manifest whose chat lost a @fires', () => {
        const cem = withChatEvents((evs) => evs.filter((e) => e.name !== 'aparte-retry')).cem;
        const file = join(dir, 'custom-elements.json');
        writeFileSync(file, JSON.stringify(cem), 'utf8');
        const r = run('--cem', file);
        expect(r.code).toBe(1);
        expect(r.out).toContain('"aparte-retry" reaches the chat root');
    });

    it('fails on a bindings config that lost a window event', () => {
        const config = { windowDispatched: withWindow((w) => { w['aparte-context'] = []; }) };
        const file = join(dir, 'element-bindings.config.mjs');
        writeFileSync(file, `export default ${JSON.stringify(config)};\n`, 'utf8');
        const r = run('--bindings', file);
        expect(r.code).toBe(1);
        expect(r.out).toContain('<aparte-context>');
        expect(r.out).toContain('"aparte-compact"');
    });
});
