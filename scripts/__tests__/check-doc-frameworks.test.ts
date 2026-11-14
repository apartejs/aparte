/**
 * An example that only the vanilla element can run does not reach a page without a way out.
 *
 * The case this exists for: about sixty examples in the docs listened to an event with
 * `document.querySelector('aparte-chat')?.addEventListener(…)`. Under React, Vue, Svelte or
 * Angular that finds nothing, because the framework renders the element after the script ran
 * (or into a shadow of its own), and the reader who copied it got a handler that never fired.
 * The wrappers had no way to hear most of those events either, so the pages could not have
 * shown one; now they have, and this guard keeps the pages honest.
 *
 * The rule, in the fixtures below: a block that hears an `aparte-*` event on an element, or
 * looks up the chat, the composer or the viewport, is in a `<Tabs syncKey="framework">` group
 * with the five tabs and the right binding in each, or says why it is vanilla-only.
 *
 * Every fixture is a whole page, run through the same function the gate runs, and the
 * spellings come from a table the test writes, so none of it needs a build.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUP_LABELS, LIMITS, checkPage, isGenerated, judgeTotals, readSpellings } from '../check-doc-frameworks.mjs';
import { CHAT_EVENT_FLOOR, CHAT_TAG, readChatTree } from '../chat-surface.mjs';
import { elementsOf } from '../dispatch-sites.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'check-doc-frameworks.mjs');

/** What `readSpellings()` reads from the manifest, written by hand: no build needed. */
const spellings = {
    // The chat's events → the name each binds under (`aparte-send` is `messageSent`).
    chat: new Map([
        ['aparte-link-click', 'linkClick'],
        ['aparte-send', 'messageSent'],
        ['aparte-cancel', 'stop'],
        ['aparte-message-error', 'messageError'],
    ]),
    // A standalone element's event → the name its generated Angular directive and React
    // component give it (`(selectChange)`, `onSelectChange`).
    elements: new Map([['aparte-launcher-toggle', ['launcherToggle']], ['aparte-select-change', ['selectChange']]]),
};

const TICKS = '```';
const fence = (lang: string, code: string) => `${TICKS}${lang}\n${code}\n${TICKS}\n`;
/** The line `needle` first stands on: a problem is reported at the line of its block. */
const lineOf = (text: string, needle: string) => text.slice(0, text.indexOf(needle)).split('\n').length;
const item = (label: string, ...fences: string[]) => `<TabItem label="${label}">\n\n${fences.join('\n')}\n</TabItem>\n`;
const tabs = (items: string[], attrs = 'syncKey="framework"') => `<Tabs ${attrs}>\n${items.join('')}</Tabs>\n`;
const page = (...parts: string[]) =>
    `---\ntitle: A page\n---\n\nimport { Tabs, TabItem } from '../../../components/content/tabs';\n\n${parts.join('\n')}`;
const check = (text: string, format = 'mdx') => checkPage(text, { format, spellings });

const VANILLA = fence('ts', "document.querySelector('aparte-chat')?.addEventListener('aparte-link-click', (event) => {\n  event.preventDefault();\n});");
const REACT = fence('tsx', '<AparteChat onLinkClick={(detail, event) => event.preventDefault()} />');
const VUE = fence('vue', '<AparteChat @link-click="(detail, event) => event.preventDefault()" />');
const SVELTE = fence('svelte', '<AparteChat onlinkClick={(detail, event) => event.preventDefault()} />');
const ANGULAR = fence('html', '<aparte-chat (aparte-link-click)="$event.preventDefault()"></aparte-chat>');
const FIVE = [item('Vanilla', VANILLA), item('React', REACT), item('Vue', VUE), item('Svelte', SVELTE), item('Angular', ANGULAR)];
/** The five tabs of one event, each tab's code replaced where a test needs it. */
const group = (swap: Partial<Record<string, string>> = {}) => tabs(FIVE.map((tab, i) => {
    const label = GROUP_LABELS[i];
    return swap[label] === undefined ? tab : item(label, swap[label]);
}));

describe('a block it looks at', () => {
    it('hears an event on an element: a query result, a variable, a call', () => {
        for (const code of [
            "chat.addEventListener('aparte-send', onSend);",
            "document.querySelector('aparte-chat')?.addEventListener('aparte-send', onSend);",
            "document.getElementById('chat')!.addEventListener(\n  'aparte-send',\n  onSend,\n);",
            'chat?.addEventListener("aparte-send", onSend);',
        ]) {
            expect(check(page(fence('ts', code))).found, code).toBe(1);
        }
    });

    it('leaves a listener on window or document alone: it hears the event under any framework', () => {
        for (const code of [
            "window.addEventListener('aparte-abort', onAbort);",
            "document.addEventListener('aparte-card-action', onAction);",
            "globalThis.addEventListener('aparte-compact-done', onDone);",
        ]) {
            expect(check(page(fence('ts', code))), code).toEqual({ found: 0, inTabs: 0, marked: [], problems: [] });
        }
    });

    it('looks up the chat, the composer or the viewport, and no other element', () => {
        for (const tag of ['aparte-chat', 'aparte-composer', 'aparte-chat-viewport']) {
            expect(check(page(fence('ts', `const el = document.querySelector('${tag}')!;`))).found, tag).toBe(1);
        }
        expect(check(page(fence('ts', "const all = document.querySelectorAll('aparte-chat[streaming]');"))).found).toBe(1);
        // A bubble is a part the chat draws, a list is another element: neither is the chat.
        for (const tag of ['aparte-chat-bubble', 'aparte-composer-input', 'aparte-conversation-list', 'aparte-split']) {
            expect(check(page(fence('ts', `const el = document.querySelector('${tag}')!;`))).found, tag).toBe(0);
        }
    });

    it('reads a block in any language, and counts it once whatever it does', () => {
        const html = fence('html', "<script>\n  const chat = document.querySelector('aparte-chat');\n  chat.addEventListener('aparte-send', send);\n</script>");
        expect(check(page(html)).found).toBe(1);
    });

    it('is not fooled by the name in prose, or in a comment-free tag', () => {
        const text = page("Listen with `chat.addEventListener('aparte-send', fn)` on the element.\n", fence('html', '<aparte-chat></aparte-chat>'));
        expect(check(text).found).toBe(0);
    });
});

describe('a block outside tabs', () => {
    it('fails, at its line, and says both ways out', () => {
        const text = page(fence('ts', "chat.addEventListener('aparte-send', onSend);"));
        const { found, problems } = check(text);
        expect(found).toBe(1);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(new RegExp(`^${lineOf(text, `${TICKS}ts`)}: `));
        expect(problems[0]).toMatch(/<Tabs syncKey="framework">/);
        expect(problems[0]).toMatch(/doc-check: vanilla-only/);
    });

    it('passes with a vanilla-only marker that says why, and counts it with its reason', () => {
        const text = page('{/* doc-check: vanilla-only a custom element of your own, which has no framework */}\n', fence('ts', "this.addEventListener('aparte-send', onSend);"));
        expect(check(text)).toEqual({
            found: 1,
            inTabs: 0,
            marked: [{ line: lineOf(text, `${TICKS}ts`), reason: 'a custom element of your own, which has no framework' }],
            problems: [],
        });
    });

    it('refuses a marker that gives no reason', () => {
        const text = page('{/* doc-check: vanilla-only */}\n', fence('ts', "chat.addEventListener('aparte-send', onSend);"));
        const { marked, problems } = check(text);
        expect(marked).toEqual([]);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(new RegExp(`^${lineOf(text, `${TICKS}ts`)}: `));
        expect(problems[0]).toMatch(/reason/);
    });

    it('refuses a marker that is not right before the block', () => {
        const text = page('{/* doc-check: vanilla-only a custom element of your own */}\n', 'And then some prose.\n', fence('ts', "chat.addEventListener('aparte-send', onSend);"));
        const { marked, problems } = check(text);
        expect(marked).toEqual([]);
        expect(problems.join()).toMatch(/vanilla-only/);
    });

    it('lets the marker sit beside the one that skips the compile of the same block', () => {
        const text = page(
            '{/* doc-check: vanilla-only a custom element of your own */}\n{/* doc-check: skip excerpt — `onSend` is yours */}\n',
            fence('ts', "chat.addEventListener('aparte-send', onSend);"),
        );
        expect(check(text).problems).toEqual([]);
        expect(check(text).marked).toHaveLength(1);
    });

    it('refuses a marker on a block that needs none, so a marker cannot outlive its reason', () => {
        const { problems } = check(page('{/* doc-check: vanilla-only the chat, in a script tag */}\n', fence('html', '<aparte-chat></aparte-chat>')));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/stale/);
    });

    it('refuses a marker that stands before nothing it could excuse', () => {
        const { problems } = check(page('{/* doc-check: vanilla-only a custom element of your own */}\n', 'Prose, then the end of the page.\n'));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/not right before a code block/);
    });
});

describe('a markdown page', () => {
    const listener = fence('ts', "chat.addEventListener('aparte-send', onSend);");

    it('takes the HTML comment as its marker', () => {
        const text = `# Title\n\n<!-- doc-check: vanilla-only the page is about the vanilla element -->\n\n${listener}`;
        expect(check(text, 'md')).toEqual({
            found: 1,
            inTabs: 0,
            marked: [{ line: lineOf(text, `${TICKS}ts`), reason: 'the page is about the vanilla element' }],
            problems: [],
        });
    });

    it('cannot hold tabs, so an unmarked block asks for an .mdx page', () => {
        const { problems } = check(`# Title\n\n${listener}`, 'md');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/\.mdx/);
    });

    it('does not read the MDX comment as a marker', () => {
        const { marked, problems } = check(`# Title\n\n{/* doc-check: vanilla-only because */}\n\n${listener}`, 'md');
        expect(marked).toEqual([]);
        expect(problems).toHaveLength(1);
    });
});

describe('a tabs group', () => {
    it('passes with the five tabs and the right name in each, and counts its block as in tabs', () => {
        expect(check(page(group()))).toEqual({ found: 1, inTabs: 1, marked: [], problems: [] });
    });

    it('wants syncKey="framework", or the choice of one framework does not follow the reader', () => {
        const { problems } = check(page(tabs(FIVE, 'syncKey="languages"')));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/syncKey="framework"/);
        expect(check(page(tabs(FIVE, ''))).problems.join()).toMatch(/syncKey="framework"/);
    });

    it("wants the site's own Tabs, the one that remembers the choice, not another library's", () => {
        const text = page(group()).replace('../../../components/content/tabs', '@astrojs/starlight/components');
        const { problems } = check(text);
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/components\/content\/tabs/);
        expect(problems[0]).toMatch(/@astrojs\/starlight\/components/);
    });

    it('wants all five tabs: a missing one is named', () => {
        const four = tabs(FIVE.filter((_, i) => GROUP_LABELS[i] !== 'Angular'));
        const { problems } = check(page(four));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/missing/i);
        expect(problems[0]).toMatch(/Angular/);
        expect(problems[0]).not.toMatch(/Vanilla|React|Vue|Svelte/);
    });

    it('wants no other tab, and none twice', () => {
        const extra = tabs([...FIVE, item('Qwik', fence('tsx', '<Chat />'))]);
        expect(check(page(extra)).problems.join()).toMatch(/Qwik/);
        const twice = tabs([...FIVE, item('React', REACT)]);
        expect(check(page(twice)).problems.join()).toMatch(/React.*twice|twice.*React|more than once/i);
    });

    it('wants code in each tab', () => {
        const empty = tabs(FIVE.map((tab, i) => (GROUP_LABELS[i] === 'Vue' ? '<TabItem label="Vue">\n\nSee the React tab.\n\n</TabItem>\n' : tab)));
        const { problems } = check(page(empty));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/Vue/);
        expect(problems[0]).toMatch(/code/);
    });

    it('is judged once, however many blocks sit in it', () => {
        const second = fence('ts', "document.querySelector('aparte-chat')?.addEventListener('aparte-link-click', onLink);");
        const { found, problems } = check(page(tabs(FIVE.map((tab, i) => (i === 0 ? item('Vanilla', VANILLA, second) : tab)).slice(0, 4))));
        expect(found).toBe(2);
        expect(problems).toHaveLength(1);
    });

    it('does not judge a group with nothing in it to hear, whatever it holds', () => {
        const unrelated = tabs([item('A', fence('ts', 'const x = 1;')), item('B', fence('ts', 'const y = 2;'))], 'syncKey="anything"');
        expect(check(page(unrelated))).toEqual({ found: 0, inTabs: 0, marked: [], problems: [] });
    });

    it('lets a block in the React tab be counted, as long as the group holds', () => {
        const effect = fence('tsx', "useEffect(() => {\n  ref.current?.addEventListener('aparte-link-click', onLink);\n}, []);");
        const result = check(page(group({ React: effect })));
        expect(result.found).toBe(2);
        expect(result.inTabs).toBe(2);
        expect(result.problems).toEqual([]);
    });
});

describe('the names in the framework tabs', () => {
    it('refuses a React prop that is not the generated one, naming the right one', () => {
        const { problems } = check(page(group({ React: fence('tsx', '<AparteChat onLinkClik={(detail) => route(detail.href)} />') })));
        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/React/);
        expect(problems[0]).toMatch(/aparte-link-click/);
        expect(problems[0]).toMatch(/onLinkClick/);
    });

    it('refuses a wrong name in each framework, and says which', () => {
        const wrong: Record<string, [string, string]> = {
            Vue: [fence('vue', '<AparteChat @link-clik="route" />'), '@link-click'],
            Svelte: [fence('svelte', '<AparteChat onlinkClik={route} />'), 'onlinkClick'],
            Angular: [fence('html', '<aparte-chat (linkClik)="route($event)"></aparte-chat>'), '(linkClick)'],
        };
        for (const [label, [code, expected]] of Object.entries(wrong)) {
            const { problems } = check(page(group({ [label]: code })));
            expect(problems, label).toHaveLength(1);
            expect(problems[0], label).toContain(label);
            expect(problems[0], label).toContain(expected);
        }
    });

    it('takes Svelte 4 syntax as well as Svelte 5, and the DOM binding as well as the output on Angular', () => {
        expect(check(page(group({ Svelte: fence('svelte', '<AparteChat on:linkClick={(e) => route(e.detail.href)} />') }))).problems).toEqual([]);
        expect(check(page(group({ Angular: fence('html', '<aparte-chat (linkClick)="route($event.href)"></aparte-chat>') }))).problems).toEqual([]);
    });

    it('knows the renames: a send is messageSent, a cancel is stop', () => {
        const send = (lang: string, code: string) => fence(lang, code);
        const sendPage = page(tabs([
            item('Vanilla', fence('ts', "chat.addEventListener('aparte-send', (e) => ask(e.detail.content));")),
            item('React', send('tsx', '<AparteChat onMessageSent={(detail) => ask(detail.content)} />')),
            item('Vue', send('vue', '<AparteChat @message-sent="(detail) => ask(detail.content)" />')),
            item('Svelte', send('svelte', '<AparteChat onmessageSent={(detail) => ask(detail.content)} />')),
            item('Angular', send('html', '<aparte-chat (messageSent)="ask($event.content)"></aparte-chat>')),
        ]));
        expect(check(sendPage).problems).toEqual([]);
        // The name a reader would guess from the event is the one that does not exist.
        const guessed = sendPage.replace('onMessageSent', 'onSend');
        expect(check(guessed).problems.join()).toMatch(/onMessageSent/);
        const stopPage = sendPage
            .replace("'aparte-send'", "'aparte-cancel'")
            .replace('onMessageSent', 'onStop')
            .replace('@message-sent', '@stop')
            .replace('onmessageSent', 'onstop')
            .replace('(messageSent)', '(stop)');
        expect(check(stopPage).problems).toEqual([]);
        expect(check(stopPage.replace('onStop', 'onCancel')).problems.join()).toMatch(/onStop/);
    });

    it("takes an element's own React component, with the callback the generator names", () => {
        const selectPage = page(tabs([
            item('Vanilla', fence('ts', "select.addEventListener('aparte-select-change', (e) => pick(e.detail.value));")),
            item('React', fence('tsx', '<AparteSelect onSelectChange={(detail) => pick(detail.value)} />')),
            item('Vue', fence('vue', '<aparte-select @aparte-select-change="(e) => pick(e.detail.value)"></aparte-select>')),
            item('Svelte', fence('svelte', '<aparte-select onaparte-select-change={(e) => pick(e.detail.value)}></aparte-select>')),
            item('Angular', fence('html', '<aparte-select (selectChange)="pick($event.value)"></aparte-select>')),
        ]));
        expect(check(selectPage).problems).toEqual([]);
        // A misspelt callback is not the component's: the guard names the one that exists.
        expect(check(selectPage.replace('onSelectChange', 'onSelectChang')).problems.join()).toMatch(/onSelectChange/);
    });

    it('asks of every event the vanilla tab listens to, not only the first', () => {
        const vanilla = fence('ts', "chat.addEventListener('aparte-link-click', route);\nchat.addEventListener('aparte-message-error', report);");
        const { problems } = check(page(group({ Vanilla: vanilla })));
        expect(problems).toHaveLength(4);
        expect(problems.join()).toMatch(/aparte-message-error/);
        expect(problems.join()).toMatch(/onMessageError/);
    });

    it('takes an event the chat does not name the way every framework hears it: by its DOM name', () => {
        const vanilla = fence('ts', "document.getElementById('chat')!.addEventListener('aparte-subagent-start', (event) => open(event.detail.runId));");
        const ok = page(tabs([
            item('Vanilla', vanilla),
            item('React', fence('tsx', "useAparteEvent(chat.ref, 'aparte-subagent-start', (event) => open(event.detail.runId));")),
            item('Vue', fence('vue', '<AparteChat @aparte-subagent-start="(event) => open(event.detail.runId)" />')),
            item('Svelte', fence('svelte', '<AparteChat onaparte-subagent-start={(event) => open(event.detail.runId)} />')),
            item('Angular', fence('html', '<aparte-chat (aparte-subagent-start)="open($any($event).detail.runId)"></aparte-chat>')),
        ]));
        expect(check(ok)).toMatchObject({ found: 1, inTabs: 1, problems: [] });
    });

    it('refuses a DOM name that is not the event, on the generic path', () => {
        const base = page(tabs([
            item('Vanilla', fence('ts', "box.addEventListener('aparte-subagent-start', onStart);")),
            item('React', fence('tsx', "useAparteEvent(box, 'aparte-subagent-start', onStart);")),
            item('Vue', fence('vue', '<aparte-box @aparte-subagent-start="onStart" />')),
            item('Svelte', fence('svelte', '<aparte-box onaparte-subagent-start={onStart} />')),
            item('Angular', fence('html', '<aparte-box (aparte-subagent-start)="onStart($event)"></aparte-box>')),
        ]));
        expect(check(base).problems).toEqual([]);
        for (const [was, now, label] of [
            ["useAparteEvent(box, 'aparte-subagent-start'", "useAparteEvent(box, 'aparte-subagent-strat'", 'React'],
            ['@aparte-subagent-start', '@aparte-subagent-strat', 'Vue'],
            ['onaparte-subagent-start', 'onaparte-subagent-strat', 'Svelte'],
            ['(aparte-subagent-start)', '(aparte-subagent-strat)', 'Angular'],
        ]) {
            const { problems } = check(base.replace(was, now));
            expect(problems, label).toHaveLength(1);
            expect(problems[0], label).toContain(label);
            expect(problems[0], label).toContain('aparte-subagent-start');
        }
    });

    it("takes a standalone element's own output on Angular, as the generated directive spells it", () => {
        const text = page(tabs([
            item('Vanilla', fence('ts', "launcher?.addEventListener('aparte-launcher-toggle', (event) => track(event.detail.open));")),
            item('React', fence('tsx', "useAparteEvent(launcher, 'aparte-launcher-toggle', (event) => track(event.detail.open));")),
            item('Vue', fence('vue', '<aparte-launcher @aparte-launcher-toggle="(event) => track(event.detail.open)" />')),
            item('Svelte', fence('svelte', '<aparte-launcher onaparte-launcher-toggle={(event) => track(event.detail.open)} />')),
            item('Angular', fence('html', '<aparte-launcher (launcherToggle)="track($event.open)"></aparte-launcher>')),
        ]));
        expect(check(text).problems).toEqual([]);
        expect(check(text.replace('(launcherToggle)', '(launcherToggled)')).problems.join()).toMatch(/\(launcherToggle\)/);
    });
});

describe('the spellings it reads from the manifest', () => {
    it("are the generators': the chat's renames, and a standalone element's own output", () => {
        const real = readSpellings();
        expect(real.chat.size).toBeGreaterThanOrEqual(CHAT_EVENT_FLOOR);
        expect(real.chat.get('aparte-link-click')).toBe('linkClick');
        expect(real.chat.get('aparte-send')).toBe('messageSent');
        expect(real.chat.get('aparte-cancel')).toBe('stop');
        expect(real.elements.get('aparte-launcher-toggle')).toEqual(['launcherToggle']);
        // The chat's own events are the chat component's, and no directive is generated for it.
        expect(real.elements.has('aparte-message-start')).toBe(false);
    });

    it('refuse a reading that collapsed: a table with no chat event would let every name through', () => {
        const tree = readChatTree();
        tree.cem = structuredClone(tree.cem);
        elementsOf(tree.cem).get(CHAT_TAG).decl.events = [];
        expect(() => readSpellings({ tree })).toThrow(/chat events/);
    });
});

describe('the pages it does not read', () => {
    it('skips a page a generator wrote, by its marker', () => {
        expect(isGenerated('<!-- AUTO-GENERATED from the manifest by gen-x.mjs — do not edit by hand. -->\n\nBody.\n')).toBe(true);
        expect(isGenerated('---\ntitle: Hand written\n---\n\nBody.\n')).toBe(false);
    });
});

describe('the totals', () => {
    const fine = { pages: LIMITS.minPages, found: LIMITS.minBlocks, marked: LIMITS.maxMarkers };

    it('pass at the limits', () => {
        expect(judgeTotals(fine)).toEqual([]);
    });

    it('refuse a corpus that found almost nothing, which is what a reader gone blind looks like', () => {
        expect(judgeTotals({ ...fine, found: LIMITS.minBlocks - 1 }).join()).toMatch(/blocks/);
        expect(judgeTotals({ ...fine, pages: LIMITS.minPages - 1 }).join()).toMatch(/pages/);
        expect(judgeTotals({ pages: 0, found: 0, marked: 0 })).toHaveLength(2);
    });

    it('refuse more vanilla-only markers than the ceiling, so the way out stays a way out', () => {
        expect(judgeTotals({ ...fine, marked: LIMITS.maxMarkers + 1 }).join()).toMatch(/vanilla-only/);
    });
});

describe('the script', () => {
    const run = (docs: string) => spawnSync(process.execPath, [SCRIPT, '--docs', docs], { encoding: 'utf8', windowsHide: true });

    it('fails on an empty docs folder, because a guard that read nothing proved nothing', () => {
        const root = mkdtempSync(join(tmpdir(), 'aparte-docfw-'));
        try {
            const result = run(root);
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(/blocks/);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('names the file and the line of a block with no way out', () => {
        const root = mkdtempSync(join(tmpdir(), 'aparte-docfw-'));
        try {
            mkdirSync(join(root, 'guides'));
            const text = page(fence('ts', "chat.addEventListener('aparte-send', onSend);"));
            writeFileSync(join(root, 'guides', 'listen.mdx'), text);
            const result = run(root);
            expect(result.status).toBe(1);
            expect(result.stderr).toMatch(new RegExp(`guides[\\\\/]listen\\.mdx:${lineOf(text, `${TICKS}ts`)}: `));
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
