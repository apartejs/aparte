/**
 * The generator writes each wrapper's chat event bindings from the manifest, and refuses the
 * names that would break a framework.
 *
 * `<aparte-chat>`'s `@fires` are the chat's surface (`chat-surface.mjs`; rule 5 of
 * `check-event-map` keeps them true). `gen-element-bindings.mjs` turns them into one explicit
 * file per wrapper, so an event added to core reaches every chat component with no edit. What
 * can still go wrong is a NAME, and each way is refused here by name:
 *
 *   • a native DOM event. Angular's `(x)` listens to the DOM event `x` AND subscribes to the
 *     output `x`: the composer directive's `(cancel)` also caught every native `cancel` that
 *     bubbled to it, a file picker closed without a choice among them;
 *   • a name the chat components already give a host callback (`messagesChange`…);
 *   • two events folded onto one name.
 *
 * A detail type core's barrel does not export is refused too: the generated file imports it
 * from `@aparte/core`, and would not compile in a consumer.
 *
 * The script itself is then run over a doctored config, because a refusal the CLI forgets to
 * call is a guard in name only.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    RESERVED_CHAT_BINDINGS,
    bindingName,
    chatBindings,
    readBarrelExports,
    readNativeEventNames,
    renderChatAngular,
    renderChatReact,
    renderChatSvelte,
    renderChatVue,
} from '../gen-element-bindings.mjs';
import { CHAT_EVENT_FLOOR, checkChatSurface, readChatEvents, readChatTree } from '../chat-surface.mjs';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'gen-element-bindings.mjs');
const REPO = resolve(dirname(SCRIPT), '..');
const CONFIG_FILE = join(REPO, 'packages/core/element-bindings.config.mjs');
const CONFIG = (await import(pathToFileURL(CONFIG_FILE).href)).default;

const NATIVE: Set<string> = readNativeEventNames();
const EXPORTED: Set<string> = readBarrelExports(join(REPO, 'packages/core/src/index.ts'));

type ChatEvent = { name: string; type: string; detail: string | null; description: string; cancelable: boolean; from: string[] };
type Binding = { type: string; name: string; detail: string | null; description: string; cancelable: boolean };

/** Three events, handed on the way `readChatEvents` hands them: one renamed, one bare, one cancelable. */
const FIXTURE: ChatEvent[] = [
    {
        name: 'aparte-send',
        type: 'CustomEvent<AparteSendEventDetail>',
        detail: 'AparteSendEventDetail',
        description: 'A message was sent from the composer.',
        cancelable: false,
        from: ['aparte-composer'],
    },
    {
        name: 'aparte-cancel',
        type: 'CustomEvent',
        detail: null,
        description: 'Stop was pressed in the composer. No detail.',
        cancelable: false,
        from: ['aparte-composer'],
    },
    {
        name: 'aparte-link-click',
        type: 'CustomEvent<AparteLinkClickEventDetail>',
        detail: 'AparteLinkClickEventDetail',
        description: 'A link the model wrote is about to be followed. Cancelable: `preventDefault()` keeps the browser from navigating.',
        cancelable: true,
        from: ['aparte-chat-bubble'],
    },
];

/** The renames the fixture needs, and nothing else: the real config's chat entry. */
const RENAMES = { bindingRenames: { 'aparte-chat': { 'aparte-send': 'messageSent', 'aparte-cancel': 'stop' } } };

const bind = (events: ChatEvent[] = FIXTURE, config: object = RENAMES): Binding[] =>
    chatBindings(events, config, { native: NATIVE, exported: EXPORTED });

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

describe('the name of a binding', () => {
    it('is the event without `aparte-`, camelCased — the rule the Angular outputs already followed', () => {
        expect(bindingName('aparte-chat', 'aparte-link-click', {})).toBe('linkClick');
        expect(bindingName('aparte-chat', 'aparte-tool-approval-request', {})).toBe('toolApprovalRequest');
        expect(bindingName('aparte-select', 'aparte-select-change', {})).toBe('selectChange');
    });

    it('takes a rename from `bindingRenames`, per element', () => {
        // The chat keeps the name all four wrappers already publish, and its Stop is `stop`.
        expect(bindingName('aparte-chat', 'aparte-send', CONFIG)).toBe('messageSent');
        expect(bindingName('aparte-chat', 'aparte-cancel', CONFIG)).toBe('stop');
        // The composer directive's `(cancel)` was native; its `(send)` was not, and stays.
        expect(bindingName('aparte-composer', 'aparte-cancel', CONFIG)).toBe('stop');
        expect(bindingName('aparte-composer', 'aparte-send', CONFIG)).toBe('send');
    });
});

describe('the native DOM events, read from TypeScript\'s lib.dom.d.ts', () => {
    it('reads the element, global and window maps, through what they extend', () => {
        // GlobalEventHandlersEventMap, through HTMLElementEventMap's `extends`.
        for (const name of ['click', 'cancel', 'toggle', 'input', 'close']) expect(NATIVE, name).toContain(name);
        // ElementEventMap, the other half of HTMLElementEventMap.
        expect(NATIVE).toContain('fullscreenchange');
        // WindowEventMap's own (WindowEventHandlersEventMap).
        for (const name of ['message', 'storage', 'online']) expect(NATIVE, name).toContain(name);
        expect(NATIVE.size).toBeGreaterThan(100);
    });

    it('does not count what only a media recorder or an animation dispatches', () => {
        // `stop` is MediaRecorder's: it never reaches an element, so it is free for the chat.
        expect(NATIVE).not.toContain('stop');
        expect(NATIVE).not.toContain('send');
    });
});

describe('the refusals', () => {
    it('refuses a native DOM event, naming the event, the clash and the fix', () => {
        const message = refusal(() => bind(FIXTURE, { bindingRenames: { 'aparte-chat': { 'aparte-send': 'messageSent' } } }));
        expect(message).toContain('<aparte-chat>');
        expect(message).toContain('"aparte-cancel"');
        expect(message).toContain('`cancel`');
        expect(message).toContain('native DOM event');
        expect(message).toContain('bindingRenames');
    });

    it('refuses the name of a host callback the chat components already have', () => {
        const event: ChatEvent = { ...FIXTURE[0]!, name: 'aparte-typing-change', type: 'CustomEvent', detail: null };
        const message = refusal(() => bind([event]));
        expect(message).toContain('"aparte-typing-change"');
        expect(message).toContain('`typingChange`');
        expect(message).toContain(RESERVED_CHAT_BINDINGS.get('typingChange'));
    });

    it('refuses every reserved name, Vue\'s `update:messages` included', () => {
        expect([...RESERVED_CHAT_BINDINGS.keys()].sort()).toEqual(
            ['conversationCreated', 'messageAppended', 'messagesChange', 'typingChange', 'update:messages'],
        );
        const config = { bindingRenames: { 'aparte-chat': { ...RENAMES.bindingRenames['aparte-chat'], 'aparte-link-click': 'update:messages' } } };
        expect(refusal(() => bind(FIXTURE, config))).toContain('`update:messages`');
    });

    it('refuses two events folded onto one name, naming both', () => {
        const config = { bindingRenames: { 'aparte-chat': { ...RENAMES.bindingRenames['aparte-chat'], 'aparte-link-click': 'messageSent' } } };
        const message = refusal(() => bind(FIXTURE, config));
        expect(message).toContain('"aparte-send"');
        expect(message).toContain('"aparte-link-click"');
        expect(message).toContain('`messageSent`');
    });

    it('refuses a detail type core\'s barrel does not export: the import would not compile in a consumer', () => {
        const event: ChatEvent = { ...FIXTURE[2]!, type: 'CustomEvent<AparteLinkClickInternals>', detail: 'AparteLinkClickInternals' };
        const message = refusal(() => bind([event]));
        expect(message).toContain('AparteLinkClickInternals');
        expect(message).toContain('packages/core/src/index.ts');
    });

    it('reads the barrel it checks against: every detail the fixture names is exported', () => {
        for (const name of ['AparteSendEventDetail', 'AparteLinkClickEventDetail', 'AparteConversationLoadedDetail']) {
            expect(EXPORTED, name).toContain(name);
        }
        expect(bind().map((b) => b.name)).toEqual(['messageSent', 'stop', 'linkClick']);
    });
});

describe('what each wrapper gets — explicit types, no mapped type, JSDoc from the @fires', () => {
    const bindings = bind();
    const files = {
        react: renderChatReact(bindings),
        vue: renderChatVue(bindings),
        svelte: renderChatSvelte(bindings),
        angular: renderChatAngular(bindings),
    } as Record<string, string>;

    it('imports each detail type from @aparte/core, as a type', () => {
        for (const [key, src] of Object.entries(files)) {
            expect(src, key).toContain('import type {\n    AparteLinkClickEventDetail,\n    AparteSendEventDetail,\n} from \'@aparte/core\';');
            // Vue's SFC compiler resolves no mapped type in `defineEmits`, so none is written.
            expect(src, key).not.toMatch(/\bkeyof\b|\[\s*\w+\s+in\b/);
        }
    });

    it('React: one callback prop per event, called with the detail and the event', () => {
        const src = files.react!;
        expect(src).toContain('export interface AparteChatEventProps {');
        expect(src).toContain('    onMessageSent?: (detail: AparteSendEventDetail, event: CustomEvent<AparteSendEventDetail>) => void;');
        expect(src).toContain('    onStop?: (detail: null, event: CustomEvent<null>) => void;');
        expect(src).toContain('    onLinkClick?: (detail: AparteLinkClickEventDetail, event: CustomEvent<AparteLinkClickEventDetail>) => void;');
        expect(src).toContain('export const APARTE_CHAT_EVENT_BINDINGS = [');
        expect(src).toContain('    { type: \'aparte-link-click\', name: \'linkClick\', prop: \'onLinkClick\', cancelable: true },');
        expect(src).toContain('    { type: \'aparte-cancel\', name: \'stop\', prop: \'onStop\', cancelable: false },');
        expect(src).toContain('] as const;');
    });

    it('Vue: an emits interface of named tuples, which `defineEmits` reads', () => {
        const src = files.vue!;
        expect(src).toContain('export interface AparteChatEventEmits {');
        expect(src).toContain('    linkClick: [detail: AparteLinkClickEventDetail, event: CustomEvent<AparteLinkClickEventDetail>];');
        expect(src).toContain('    stop: [detail: null, event: CustomEvent<null>];');
        expect(src).toContain('    { type: \'aparte-send\', name: \'messageSent\', emit: \'messageSent\', cancelable: false },');
    });

    it('Svelte: the dispatcher\'s details, the runes callbacks, and the table', () => {
        const src = files.svelte!;
        expect(src).toContain('export interface AparteChatEventDetails {');
        expect(src).toContain('    linkClick: AparteLinkClickEventDetail;');
        expect(src).toContain('    stop: null;');
        expect(src).toContain('export interface AparteChatEventCallbacks {');
        expect(src).toContain('    onlinkClick?: (detail: AparteLinkClickEventDetail, event: CustomEvent<AparteLinkClickEventDetail>) => void;');
        expect(src).toContain('    onmessageSent?: (detail: AparteSendEventDetail, event: CustomEvent<AparteSendEventDetail>) => void;');
        expect(src).toContain('    { type: \'aparte-link-click\', name: \'linkClick\', callback: \'onlinkClick\', cancelable: true },');
    });

    it('Angular: an abstract directive with one EventEmitter output per event', () => {
        const src = files.angular!;
        expect(src).toContain('import { Directive, EventEmitter, Output, type NgZone } from \'@angular/core\';');
        expect(src).toContain('@Directive()\nexport abstract class AparteChatEvents {');
        expect(src).toContain('    @Output() readonly messageSent = new EventEmitter<AparteSendEventDetail>();');
        expect(src).toContain('    @Output() readonly stop = new EventEmitter<null>();');
        expect(src).toContain('    @Output() readonly linkClick = new EventEmitter<AparteLinkClickEventDetail>();');
    });

    it('Angular: listens outside the zone, and enters it only for an output somebody binds', () => {
        const src = files.angular!;
        expect(src).toContain('    protected forwardChatEvents(host: HTMLElement, zone: NgZone): () => void {');
        expect(src).toContain('if (output.observed) zone.run(() => output.emit((event as CustomEvent<T>).detail));');
        expect(src).toContain('zone.runOutsideAngular(() => [');
        // One listener per event, each to its own output.
        for (const b of bindings) expect(src).toContain(`listen('${b.type}', this.${b.name}),`);
    });

    it('carries each @fires description onto its member, and names the DOM event', () => {
        for (const [key, member] of [
            ['react', 'onMessageSent?:'],
            ['vue', 'messageSent: ['],
            ['svelte', 'onmessageSent?:'],
            ['angular', '@Output() readonly messageSent'],
        ] as const) {
            const doc = docAbove(files[key]!, member);
            expect(doc, key).toContain('A message was sent from the composer.');
            expect(doc, key).toContain('DOM event: `aparte-send`.');
        }
        expect(docAbove(files.svelte!, '    messageSent: AparteSendEventDetail;')).toContain('A message was sent from the composer.');
    });

    it('says how to cancel where an event can be cancelled, and only there', () => {
        for (const [key, member] of [['react', 'onLinkClick?:'], ['vue', 'linkClick: ['], ['svelte', 'onlinkClick?:']] as const) {
            expect(docAbove(files[key]!, member), key).toContain('call `event.preventDefault()`');
        }
        expect(docAbove(files.svelte!, '    linkClick: AparteLinkClickEventDetail;')).toContain('`preventDefault()` on the component event');
        const angular = docAbove(files.angular!, '@Output() readonly linkClick');
        expect(angular).toContain('This output emits the detail; to cancel, bind the DOM event `(aparte-link-click)` on `<aparte-chat>`.');
        for (const [key, member] of [['react', 'onStop?:'], ['vue', 'stop: ['], ['svelte', 'onstop?:'], ['angular', '@Output() readonly stop']] as const) {
            expect(docAbove(files[key]!, member), key).not.toContain('preventDefault');
        }
    });
});

describe('on the real manifest', () => {
    const TREE = readChatTree();

    it('reads a surface rule 5 passes on — the only kind the generator trusts', () => {
        expect(checkChatSurface(TREE).problems).toEqual([]);
    });

    it('binds every chat event under a name no framework trips on', () => {
        const bindings = chatBindings(readChatEvents(TREE), CONFIG, { native: NATIVE, exported: EXPORTED });
        expect(bindings.length).toBeGreaterThanOrEqual(CHAT_EVENT_FLOOR);
        const names = bindings.map((b: Binding) => b.name);
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) {
            expect(NATIVE.has(name), name).toBe(false);
            expect(RESERVED_CHAT_BINDINGS.has(name), name).toBe(false);
        }
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'aparte-send', name: 'messageSent', detail: 'AparteSendEventDetail' }));
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'aparte-cancel', name: 'stop', detail: null }));
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'aparte-action', name: 'action' }));
        expect(bindings).toContainEqual(expect.objectContaining({ type: 'aparte-link-click', name: 'linkClick', cancelable: true }));
    });
});

describe('the script', () => {
    let dir: string;
    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'aparte-gen-chat-'));
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

    it('writes one file per wrapper, and the chat base beside the Angular directives', () => {
        const out = (w: string) => join(dir, 'real', w);
        const r = run('packages/core', '--chat-react', out('react'), '--chat-vue', out('vue'), '--chat-svelte', out('svelte'), '--angular', out('angular'));
        expect(r.out).toContain('chat:');
        expect(r.code).toBe(0);
        expect(readFileSync(join(out('react'), 'chat-events.ts'), 'utf8')).toContain('export interface AparteChatEventProps {');
        expect(readFileSync(join(out('vue'), 'chat-events.ts'), 'utf8')).toContain('export interface AparteChatEventEmits {');
        expect(readFileSync(join(out('svelte'), 'chat-events.ts'), 'utf8')).toContain('export interface AparteChatEventCallbacks {');
        expect(readFileSync(join(out('angular'), 'chat-events.ts'), 'utf8')).toContain('export abstract class AparteChatEvents {');
        expect(existsSync(join(out('angular'), 'element.directives.ts'))).toBe(true);
    });

    it('names the composer directive\'s Stop `(stop)`: `(cancel)` was a native event too', () => {
        const src = readFileSync(join(dir, 'real', 'angular', 'element.directives.ts'), 'utf8');
        expect(src).toContain('    @Output() readonly stop = new EventEmitter<void>();');
        expect(src).toContain('    @HostListener(\'aparte-cancel\')\n    protected onStop(): void { this.stop.emit(); }');
        expect(src).not.toContain('readonly cancel ');
        // And no other directive output is a DOM event's name.
        const outputs = [...src.matchAll(/@Output\(\) readonly (\w+) =/g)].map((m) => m[1]!);
        expect(outputs.length).toBeGreaterThan(30);
        expect(outputs.filter((o) => NATIVE.has(o))).toEqual([]);
    });

    it('refuses a config that leaves the composer directive a native output', () => {
        const config = doctoredConfig('no-composer-rename', (c) => {
            delete c.bindingRenames['aparte-composer'];
        });
        const r = run('packages/core', '--angular', join(dir, 'refused-angular'), '--config', config);
        expect(r.code).toBe(1);
        expect(r.out).toContain('<aparte-composer>');
        expect(r.out).toContain('"aparte-cancel"');
        expect(r.out).toContain('`cancel`');
        expect(existsSync(join(dir, 'refused-angular', 'element.directives.ts'))).toBe(false);
    });

    it('refuses a config that leaves the chat a native binding', () => {
        const config = doctoredConfig('no-chat-rename', (c) => {
            delete c.bindingRenames['aparte-chat']['aparte-cancel'];
        });
        const r = run('packages/core', '--chat-react', join(dir, 'refused-react'), '--config', config);
        expect(r.code).toBe(1);
        expect(r.out).toContain('<aparte-chat>');
        expect(r.out).toContain('"aparte-cancel"');
        expect(existsSync(join(dir, 'refused-react', 'chat-events.ts'))).toBe(false);
    });

    it('writes no chat base for a manifest that has no chat — a plugin\'s directives stay alone', () => {
        const out = join(dir, 'plugin-angular');
        const r = run('packages/plugins/model-selector', '--angular', out);
        expect(r.code).toBe(0);
        expect(existsSync(join(out, 'element.directives.ts'))).toBe(true);
        expect(existsSync(join(out, 'chat-events.ts'))).toBe(false);
    });
});
