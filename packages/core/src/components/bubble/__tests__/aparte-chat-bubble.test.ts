import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * AparteChatBubble — unit tests
 *
 * Focus:
 *  - Role-based action bar (user vs assistant buttons)
 *  - Race condition: role attribute set AFTER connectedCallback
 *  - Content / segment rendering
 *  - Branch picker (setSiblings)
 *  - aparte-retry / aparte-branch-navigate events
 */

import '../aparte-chat-bubble.js';
// The inline editor mounts the composer's contenteditable primitive — register it
// so a bubble entering edit mode gets a real element, not an unupgraded tag.
import '../../composer/aparte-composer-input.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { registerSegmentRenderer, unregisterSegmentRenderer } from '../../../renderers/index.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & {
    setContent(content: string): void;
    appendToken(chunk: string): void;
    getContent(): string;
    setSiblings(count: number, index: number): void;
    setSegments(segments: AparteSegment[]): void;
    updateMessage(updates: Partial<AparteMessage>): void;
    setTranscriptBusy(busy: boolean): void;
};

function createBubble(attrs: Record<string, string> = {}): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el;
}

describe('AparteChatBubble — streaming attribute set BEFORE the inner DOM exists', () => {
    // A framework wrapper (React/Vue/Svelte/Angular) creates the element with its
    // attributes already set, so `streaming` lands before `_render()` builds
    // `.aparte-message`. The state must survive that ordering: it drives
    // `aria-busy` and the CSS that hides the action bar, so losing it shows
    // copy/retry on an EMPTY, still-pending assistant bubble.
    it('reflects the streaming state onto .aparte-message once rendered', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('streaming', '');
        document.body.appendChild(el);
        mountedForStreaming.push(el);

        const message = el.querySelector('.aparte-message')!;
        expect(message.getAttribute('data-streaming')).toBe('true');
        expect(message.getAttribute('aria-busy')).toBe('true');
        expect(message.classList.contains('aparte-message-streaming')).toBe(true);
    });

    it('leaves a non-streaming bubble untouched', () => {
        const el = document.createElement('aparte-chat-bubble') as BubbleEl;
        el.setAttribute('data-role', 'assistant');
        document.body.appendChild(el);
        mountedForStreaming.push(el);

        const message = el.querySelector('.aparte-message')!;
        expect(message.classList.contains('aparte-message-streaming')).toBe(false);
        expect(message.hasAttribute('aria-busy')).toBe(false);
    });
});

const mountedForStreaming: HTMLElement[] = [];
afterEach(() => {
    while (mountedForStreaming.length) mountedForStreaming.pop()!.remove();
});

describe('AparteChatBubble', () => {
    let bubble: BubbleEl;

    afterEach(() => {
        bubble?.remove();
    });

    describe('name attribute escaping (XSS)', () => {
        it('escapes a hostile name attribute instead of rendering a live element', () => {
            // `name` is a public author/display attribute an app may bind untrusted
            // text into (persona, multi-user author). It must be inert, like the
            // sibling fields already are.
            bubble = createBubble({ name: '<img src=x onerror="window.__xss=1">', 'data-role': 'assistant' });
            expect(bubble.querySelector('.aparte-name img')).toBeNull(); // no live element
            expect(bubble.querySelector('.aparte-name')?.innerHTML).toContain('&lt;img');
        });
    });

    // ─── Role-based action bar ────────────────────────────────────────────

    describe('action bar — role set before connectedCallback', () => {
        // retry/edit are opt-in (they need a host to honor them), so the suites that
        // test their ROUTING and their events turn them on the way an app does.
        beforeEach(() => aparteGlobalConfig.setBubbleActions({ retry: true, edit: true }));
        afterEach(() => aparteGlobalConfig.reset());

        it('user bubble has "Edit" button, NOT "Retry"', () => {
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'u1' });
            expect(bubble.querySelector('.aparte-action-edit')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-retry')).toBeNull();
        });

        it('assistant bubble has "Retry" button, NOT "Edit"', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'a1' });
            expect(bubble.querySelector('.aparte-action-retry')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-edit')).toBeNull();
        });
    });

    describe('action bar — role set AFTER connectedCallback (Angular timing)', () => {
        // retry/edit are opt-in (they need a host to honor them), so the suites that
        // test their ROUTING and their events turn them on the way an app does.
        beforeEach(() => aparteGlobalConfig.setBubbleActions({ retry: true, edit: true }));
        afterEach(() => aparteGlobalConfig.reset());

        it('user bubble gets Edit after role attribute is set post-connection', () => {
            // Simulate Angular: element connected WITHOUT role, then role is set
            bubble = createBubble({ 'message-id': 'u2' }); // no role → default assistant
            // At this point action bar would have Retry
            bubble.setAttribute('data-role', 'user'); // Angular sets it after CD
            expect(bubble.querySelector('.aparte-action-edit')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-retry')).toBeNull();
        });

        it('assistant bubble retains Retry when role is set to assistant post-connection', () => {
            bubble = createBubble({ 'message-id': 'a2' });
            bubble.setAttribute('data-role', 'assistant');
            expect(bubble.querySelector('.aparte-action-retry')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-edit')).toBeNull();
        });

        it('switching role from assistant to user updates action bar', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'a3' });
            expect(bubble.querySelector('.aparte-action-retry')).not.toBeNull();
            bubble.setAttribute('data-role', 'user');
            expect(bubble.querySelector('.aparte-action-retry')).toBeNull();
            expect(bubble.querySelector('.aparte-action-edit')).not.toBeNull();
        });
    });

    // ─── Content rendering ────────────────────────────────────────────────

    describe('setContent()', () => {
        it('renders text content in the content element', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'c1' });
            bubble.setContent('Hello world');
            expect(bubble.querySelector('.aparte-content')?.textContent).toContain('Hello world');
        });

        it('getContent() returns the stored content', () => {
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'c2' });
            bubble.setContent('My question');
            expect(bubble.getContent()).toBe('My question');
        });

        it('content attribute on creation pre-fills the bubble', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'c3', content: 'Initial' });
            expect(bubble.getContent()).toBe('Initial');
        });
    });

    // ─── Avatar / header ──────────────────────────────────────────────────

    describe('avatar and role display', () => {
        it('renders no avatar by default (empty slot — role shown by layout/colour)', () => {
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'av1' });
            const avatar = bubble.querySelector('.aparte-avatar');
            expect(avatar).not.toBeNull();                // the slot exists (opt-in via AvatarProvider)
            expect(avatar?.textContent?.trim()).toBe(''); // but empty by default — no initial
        });

        it('assistant avatar is also empty by default', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'av2' });
            const avatar = bubble.querySelector('.aparte-avatar');
            expect(avatar?.textContent?.trim()).toBe('');
        });

        it('message element has data-role attribute matching role', () => {
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'av3' });
            expect(bubble.querySelector('.aparte-message')?.getAttribute('data-role')).toBe('user');
        });
    });

    // ─── Branch picker (setSiblings) ──────────────────────────────────────

    describe('setSiblings()', () => {
        it('shows branch picker when count > 1', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bp1' });
            bubble.setSiblings(3, 1);
            const picker = bubble.querySelector('.aparte-branch-picker') as HTMLElement;
            expect(picker?.hidden).toBe(false);
        });

        it('hides branch picker when count <= 1', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bp2' });
            bubble.setSiblings(3, 1);
            bubble.setSiblings(1, 0);
            const picker = bubble.querySelector('.aparte-branch-picker') as HTMLElement;
            expect(picker?.hidden).toBe(true);
        });

        it('displays correct "index / count" label', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bp3' });
            bubble.setSiblings(4, 2); // 0-based index 2 → "3 / 4"
            const label = bubble.querySelector('.aparte-branch-label');
            expect(label?.textContent).toBe('3 / 4');
        });

        it('disables prev button at first sibling (index 0)', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bp4' });
            bubble.setSiblings(3, 0);
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            expect(prevBtn?.disabled).toBe(true);
        });

        it('disables next button at last sibling', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bp5' });
            bubble.setSiblings(3, 2);
            const nextBtn = bubble.querySelector('.aparte-branch-next') as HTMLButtonElement;
            expect(nextBtn?.disabled).toBe(true);
        });

        it('enables both buttons in the middle', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bp6' });
            bubble.setSiblings(3, 1);
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            const nextBtn = bubble.querySelector('.aparte-branch-next') as HTMLButtonElement;
            expect(prevBtn?.disabled).toBe(false);
            expect(nextBtn?.disabled).toBe(false);
        });
    });

    // ─── aparte-retry event ─────────────────────────────────────────────────

    describe('aparte-retry event', () => {
        // retry/edit are opt-in (they need a host to honor them), so the suites that
        // test their ROUTING and their events turn them on the way an app does.
        beforeEach(() => aparteGlobalConfig.setBubbleActions({ retry: true, edit: true }));
        afterEach(() => aparteGlobalConfig.reset());

        it('retry button on assistant bubble fires aparte-retry with correct messageId', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'r1' });
            let retryDetail: any = null;
            document.body.addEventListener('aparte-retry', (e: Event) => {
                retryDetail = (e as CustomEvent).detail;
            });
            const retryBtn = bubble.querySelector('.aparte-action-retry') as HTMLButtonElement;
            retryBtn?.click();
            expect(retryDetail?.messageId).toBe('r1');
        });

        it('user bubble does NOT fire aparte-retry on any click', () => {
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'r2' });
            let fired = false;
            document.body.addEventListener('aparte-retry', () => { fired = true; });
            // No retry button exists on user bubble, so just click the bubble itself
            bubble.click();
            expect(fired).toBe(false);
        });

        it('resolves targetId from a [data-aparte-chat] host (React/Vue/Svelte roots)', () => {
            // Regression: _resolveTargetId only matched the `aparte-chat` tag (Angular's
            // wrapper root). Plain-root wrappers mark their host div `data-aparte-chat`;
            // without matching it, retry/edit targetId was undefined outside Angular and
            // AparteClient's fallback hit the bare viewport (a different message store).
            const host = document.createElement('div');
            host.setAttribute('data-aparte-chat', '');
            host.id = 'host-xyz';
            document.body.appendChild(host);
            const b = document.createElement('aparte-chat-bubble') as HTMLElement;
            b.setAttribute('data-role', 'assistant');
            b.setAttribute('message-id', 'rt1');
            host.appendChild(b);
            let detail: { messageId?: string; targetId?: string } | null = null;
            document.body.addEventListener('aparte-retry', (e: Event) => { detail = (e as CustomEvent).detail; });
            (b.querySelector('.aparte-action-retry') as HTMLButtonElement)?.click();
            expect(detail!.messageId).toBe('rt1');
            expect(detail!.targetId).toBe('host-xyz'); // was undefined before the fix
            host.remove();
        });
    });

    // ─── aparte-branch-navigate event ───────────────────────────────────────

    describe('aparte-branch-navigate event', () => {
        /**
         * The click survives a RE-RENDER, which is the whole reason this is delegated.
         *
         * The arrows used to get a fresh listener each, attached by `_render()` to the
         * buttons `_render()` had just created. A click landing while a re-render swapped
         * those nodes hit an element about to be discarded and did nothing at all — not
         * late, nothing. Invisible on a fast machine; reproducible on WebKit-Linux in CI,
         * where the picker stayed on "2 / 2" while a 20-second assertion watched it.
         *
         * Re-rendering between the setup and the click is what the old binding could not
         * survive: the buttons under the cursor are not the ones the listeners knew.
         */
        it('still fires after the bubble re-renders', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bn-rerender' });
            bubble.setSiblings(3, 1);
            let detail: any = null;
            document.body.addEventListener('aparte-branch-navigate', (e: Event) => {
                detail = (e as CustomEvent).detail;
            });

            // What a re-render does, from a listener's point of view: the node under
            // the cursor is a DIFFERENT node, carrying no listener of its own. Cloning
            // reproduces exactly that, without depending on when `_render()` chooses to
            // rebuild — the first version of this test asserted a replacement that
            // `_render()` did not actually perform, and the precondition caught it.
            const before = bubble.querySelector('.aparte-branch-prev')!;
            before.replaceWith(before.cloneNode(true));
            const after = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            expect(after, 'a different node, with no listener of its own').not.toBe(before);

            after.click();

            expect(detail?.direction, 'a delegated listener does not care').toBe('prev');
            expect(detail?.messageId).toBe('bn-rerender');
        });

        it('prev button fires aparte-branch-navigate with direction prev', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bn1' });
            bubble.setSiblings(3, 1);
            let detail: any = null;
            document.body.addEventListener('aparte-branch-navigate', (e: Event) => {
                detail = (e as CustomEvent).detail;
            });
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            prevBtn?.click();
            expect(detail?.direction).toBe('prev');
            expect(detail?.messageId).toBe('bn1');
        });

        it('next button fires aparte-branch-navigate with direction next', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bn2' });
            bubble.setSiblings(3, 1);
            let detail: any = null;
            document.body.addEventListener('aparte-branch-navigate', (e: Event) => {
                detail = (e as CustomEvent).detail;
            });
            const nextBtn = bubble.querySelector('.aparte-branch-next') as HTMLButtonElement;
            nextBtn?.click();
            expect(detail?.direction).toBe('next');
        });

        it('disabled prev button does NOT fire aparte-branch-navigate', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'bn3' });
            bubble.setSiblings(3, 0); // at first → prev disabled
            let fired = false;
            document.body.addEventListener('aparte-branch-navigate', () => { fired = true; });
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            prevBtn?.click();
            expect(fired).toBe(false);
        });
    });

    // ─── Markdown + highlight composition (provider-agnostic) ─────────────
    describe('code highlight in the simple-content path', () => {
        const flush = () => new Promise((r) => setTimeout(r));

        afterEach(() => {
            aparteGlobalConfig.reset();
        });

        it('runs the registered highlighter over Markdown code blocks (inner-token provider, e.g. Prism)', async () => {
            // Markdown provider emits a plain <pre><code> (like marked).
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-js">const x = 1</code></pre>');
            // Highlight provider returns inner tokens (like Prism / highlight.js).
            aparteGlobalConfig.setHighlightProvider((code) => `<span class="tok">${code}</span>`);

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'hl1', content: 'x' });
            await flush();

            const code = bubble.querySelector('.aparte-content pre code');
            expect(code?.querySelector('.tok')).not.toBeNull();
            expect(code?.textContent).toContain('const x = 1');
        });

        it('replaces the <pre> when the provider returns a full block (Shiki-style)', async () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-js">y</code></pre>');
            aparteGlobalConfig.setHighlightProvider(() => '<pre class="shiki"><code>Y</code></pre>');

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'hl2', content: 'x' });
            await flush();

            expect(bubble.querySelector('.aparte-content pre.shiki')).not.toBeNull();
        });

        it('leaves the plain code block intact when no highlighter is registered', async () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<pre><code class="language-js">z</code></pre>');
            // no highlight provider registered

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'hl3', content: 'x' });
            await flush();

            const code = bubble.querySelector('.aparte-content pre code');
            expect(code?.className).toContain('language-js');
            expect(code?.querySelector('.tok')).toBeNull();
        });
    });

    // ─── Live aparteGlobalConfig changes (e.g. runtime skin switch) ───────────────
    describe('action bar — reacts to live aparteGlobalConfig changes', () => {
        afterEach(() => {
            // reset() does NOT touch _bubbleActionsConfig; clear per-role sets
            // explicitly (setBubbleActions spreads explicit undefined keys).
            aparteGlobalConfig.setBubbleActions({ copy: true, retry: true, edit: true, feedback: false, user: undefined, assistant: undefined });
            aparteGlobalConfig.reset();
        });

        it('rebuilds the action bar when setBubbleActions changes the per-role set', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'cc1', content: 'hi' });
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy'] });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(1);
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy', 'thumbUp', 'thumbDown', 'retry'] });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(4);
        });

        it('re-reads icons when setIconProvider changes', () => {
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy'] });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'cc2', content: 'hi' });
            // A real skin's provider is complete (spreads DefaultIconProvider);
            // start from the full fallback set so every connected bubble stays valid.
            const full = aparteGlobalConfig.getIconProvider();
            aparteGlobalConfig.setIconProvider({ ...full, copy: () => '<svg data-skin-copy></svg>' });
            const btn = bubble.querySelector('.aparte-action-btn[data-action="copy"]');
            expect(btn?.innerHTML).toContain('data-skin-copy');
        });

        it('stops rebuilding after the bubble is disconnected', () => {
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy'] });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'cc3', content: 'hi' });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(1);
            bubble.remove();
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy', 'retry', 'thumbUp', 'thumbDown'] });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(1); // unchanged, no throw
        });
    });

    // ─── Segment renderer output — string | HTMLElement ───────────────────
    /*
     * `setStreamingMarkdownProvider`'s own docblock says "the chat bubble uses it to render
     * the assistant message token-by-token ... instead of re-parsing the whole string on
     * every token", and the plugin's page repeats it. Only the SEGMENT path honoured it —
     * the plain-content path, which is the one getting-started teaches first, re-parsed the
     * whole message per token. A cold audit found the gap; these pin the fix.
     */
    describe('plain-content streaming uses the incremental provider', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('writes only the delta while streaming, and never re-parses the whole string', () => {
            const written: string[] = [];
            let ended = 0;
            aparteGlobalConfig.setStreamingMarkdownProvider(() => ({
                write: (delta: string) => { written.push(delta); },
                end: () => { ended++; },
            }));
            let oneShots = 0;
            aparteGlobalConfig.setMarkdownProvider((md) => { oneShots++; return md; });

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'smd', streaming: '' });
            bubble.appendToken('Hel');
            bubble.appendToken('lo ');
            bubble.appendToken('world');

            expect(written).toEqual(['Hel', 'lo ', 'world']);
            // The one-shot provider is the fallback, not the streaming path.
            expect(oneShots).toBe(0);
            expect(ended).toBe(0);
        });

        it('flushes the parser and re-renders once when the stream settles', () => {
            const written: string[] = [];
            let ended = 0;
            aparteGlobalConfig.setStreamingMarkdownProvider(() => ({
                write: (delta: string) => { written.push(delta); },
                end: () => { ended++; },
            }));

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'smd-end', streaming: '' });
            bubble.appendToken('**hi**');
            bubble.setAttribute('streaming', 'false');
            bubble.appendToken('!');

            expect(ended).toBe(1);
        });

        it('falls back to the one-shot render when no streaming provider is registered', () => {
            let oneShots = 0;
            aparteGlobalConfig.setMarkdownProvider((md) => { oneShots++; return md; });

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'no-smd', streaming: '' });
            bubble.appendToken('a');
            bubble.appendToken('b');

            // Unchanged for a consumer who never installed the plugin.
            expect(oneShots).toBeGreaterThanOrEqual(2);
            expect(bubble.getContent()).toBe('ab');
        });

        /* A retry clears the bubble and re-streams. The parser tracks how many characters
           it has written, so a stale cursor would slice the next delta out of the wrong
           string — the content would come out truncated or doubled. */
        it('drops the parser state when content is REPLACED rather than appended', () => {
            const written: string[] = [];
            aparteGlobalConfig.setStreamingMarkdownProvider(() => ({
                write: (delta: string) => { written.push(delta); },
                end: () => {},
            }));

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'smd-reset', streaming: '' });
            bubble.appendToken('first answer');
            written.length = 0;
            bubble.setContent('');
            bubble.appendToken('second');

            expect(written).toEqual(['second']);
        });
    });

    describe('segment renderer output', () => {
        afterEach(() => {
            unregisterSegmentRenderer('el-seg');
            unregisterSegmentRenderer('str-seg');
        });

        it('inserts an HTMLElement returned by a renderer directly, listeners intact', () => {
            let clicks = 0;
            registerSegmentRenderer({
                type: 'el-seg',
                render: (seg) => {
                    // A ready element with a real listener — the string/innerHTML path
                    // could not carry this across an innerHTML round-trip.
                    const el = document.createElement('div');
                    el.className = 'my-el-seg';
                    el.setAttribute('data-segment-id', seg.id);
                    el.textContent = 'live';
                    el.addEventListener('click', () => { clicks++; });
                    return el;
                },
            });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'seg-el' });
            bubble.setSegments([{ id: 's1', type: 'el-seg' } as never]);

            const rendered = bubble.querySelector('.my-el-seg') as HTMLElement | null;
            expect(rendered).not.toBeNull();
            expect(rendered!.textContent).toBe('live');
            rendered!.click();
            expect(clicks).toBe(1); // same node, not an innerHTML clone
        });

        it('still inserts an HTML string returned by a renderer (built-in path)', () => {
            registerSegmentRenderer({
                type: 'str-seg',
                render: (seg) => `<div class="my-str-seg" data-segment-id="${seg.id}">from string</div>`,
            });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'seg-str' });
            bubble.setSegments([{ id: 's2', type: 'str-seg' } as never]);

            const rendered = bubble.querySelector('.my-str-seg');
            expect(rendered).not.toBeNull();
            expect(rendered!.textContent).toBe('from string');
        });

        /*
         * `AparteCustomSegment.fallback` is published as "Optional fallback text
         * representation" and was read by nothing, so a custom segment arriving where its
         * renderer is not registered — a conversation replayed elsewhere, a client that
         * loads its views lazily — showed a debug string while carrying the sentence
         * written for that exact moment.
         */
        it('draws a segment fallback when no renderer claims its type', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'seg-fb' });
            bubble.setSegments([
                { id: 's3', type: 'custom', subType: 'weather', fallback: 'Lille — 11°C.' } as never,
            ]);

            const rendered = bubble.querySelector('.aparte-segment-fallback');
            expect(rendered).not.toBeNull();
            expect(rendered!.textContent).toBe('Lille — 11°C.');
            expect(bubble.querySelector('.aparte-segment-unknown')).toBeNull();
        });

        it('still names the unknown type when there is no fallback to draw', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'seg-unk' });
            bubble.setSegments([{ id: 's4', type: 'nobody-renders-this' } as never]);

            const rendered = bubble.querySelector('.aparte-segment-unknown');
            expect(rendered).not.toBeNull();
            expect(rendered!.textContent).toBe('[Unknown segment type: nobody-renders-this]');
        });

        /* Markup in a fallback is text: the field is filled by whoever produced the
           segment, which can be a model. */
        it('does not let a fallback carry markup', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'seg-fb-xss' });
            bubble.setSegments([
                { id: 's5', type: 'custom', subType: 'x', fallback: '<img src=x onerror=alert(1)>' } as never,
            ]);

            const rendered = bubble.querySelector('.aparte-segment-fallback');
            expect(rendered!.querySelector('img')).toBeNull();
            expect(rendered!.textContent).toBe('<img src=x onerror=alert(1)>');
        });
    });

    // ─── Custom bubble toolbar actions (registerAction, zones: ['bubble']) ─
    describe('custom bubble actions', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('renders a registered action and emits aparte-action on click', () => {
            aparteGlobalConfig.registerAction({ id: 'share', icon: '<svg class="share-i"></svg>', label: 'Share', zones: ['bubble'] });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'ca1' });

            const btn = bubble.querySelector('.aparte-action-custom[data-action="custom:share"]') as HTMLButtonElement;
            expect(btn).not.toBeNull();
            expect(btn.getAttribute('aria-label')).toBe('Share');
            expect(btn.querySelector('.share-i')).not.toBeNull();

            let detail: any = null;
            document.body.addEventListener('aparte-action', (e: Event) => { detail = (e as CustomEvent).detail; });
            btn.click();
            expect(detail).toEqual({ actionId: 'share', zone: 'bubble', messageId: 'ca1', role: 'assistant', targetId: undefined });
        });

        it('honors role targeting (roles: ["user"] hides it on assistant bubbles)', () => {
            aparteGlobalConfig.registerAction({ id: 'editmeta', icon: '<svg></svg>', label: 'Edit meta', zones: ['bubble'], bubble: { roles: ['user'] } });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'ca2' });
            expect(bubble.querySelector('[data-action="custom:editmeta"]')).toBeNull();

            const userBubble = createBubble({ 'data-role': 'user', 'message-id': 'ca3' });
            expect(userBubble.querySelector('[data-action="custom:editmeta"]')).not.toBeNull();
            userBubble.remove();
        });

        it('live-registers into an already-mounted bubble and unregisters back out', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'ca4' });
            expect(bubble.querySelector('[data-action="custom:regen"]')).toBeNull();

            // registerAction notifies → mounted bubble rebuilds its action bar.
            aparteGlobalConfig.registerAction({ id: 'regen', icon: '<svg></svg>', label: 'Regenerate', zones: ['bubble'] });
            expect(bubble.querySelector('[data-action="custom:regen"]')).not.toBeNull();

            aparteGlobalConfig.unregisterAction('regen');
            expect(bubble.querySelector('[data-action="custom:regen"]')).toBeNull();
        });
    });

    // ─── Error state reflection (data-error) ──────────────────────────────
    describe('error state', () => {
        it('sets data-error on .aparte-message while an error segment is present, clears otherwise', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'err1' });
            const message = bubble.querySelector('.aparte-message') as HTMLElement;

            bubble.setSegments([{ id: 'e1', type: 'error', content: 'boom' } as never]);
            expect(message.hasAttribute('data-error')).toBe(true);

            // Replaced by a non-error segment (e.g. a successful retry re-render) → cleared.
            bubble.setSegments([{ id: 't1', type: 'text', content: 'ok now' } as never]);
            expect(message.hasAttribute('data-error')).toBe(false);
        });
    });

    // ─── Custom attachment chips (setAttachmentRenderer) ──────────────────
    describe('attachment renderer', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('renders custom chips via setAttachmentRenderer in place of the defaults', () => {
            aparteGlobalConfig.setAttachmentRenderer((att) => {
                const el = document.createElement('div');
                el.className = 'my-att';
                el.dataset['type'] = att.type;
                el.textContent = att.name;
                return el;
            });
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'att1' });
            bubble.updateMessage({
                attachments: [{ id: 'a1', name: 'report.pdf', type: 'application/pdf', url: 'blob:x' }],
            });

            const attsEl = bubble.querySelector('.aparte-attachments') as HTMLElement;
            expect(attsEl.hidden).toBe(false);
            const custom = attsEl.querySelectorAll('.my-att');
            expect(custom.length).toBe(1);
            expect(custom[0].textContent).toBe('report.pdf');
            expect((custom[0] as HTMLElement).dataset['type']).toBe('application/pdf');
            // The built-in chip markup is not used.
            expect(attsEl.querySelector('.aparte-thumb')).toBeNull();
        });
    });

    // ─── An empty action bar is not a bar ─────────────────────────────────────
    // With every action off, the toolbar stayed in the DOM: an empty `role=toolbar`
    // announced to screen readers, and 28px of reserved height (the bar's fixed
    // height plus the footer's min-height) under every single bubble.
    describe('empty action bar', () => {
        afterEach(() => aparteGlobalConfig.reset());

        const bar = (el: HTMLElement) => el.querySelector('.aparte-action-bar') as HTMLElement;
        const footer = (el: HTMLElement) => el.querySelector('.aparte-footer') as HTMLElement;

        it('hides the bar and the footer when no action is enabled', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e1', content: 'hi' });
            expect(bar(bubble).children.length).toBe(0);
            expect(bar(bubble).hidden).toBe(true);
            expect(footer(bubble).hidden).toBe(true);
        });

        it('keeps both visible for the default set (copy)', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e2', content: 'hi' });
            expect(bar(bubble).hidden).toBe(false);
            expect(footer(bubble).hidden).toBe(false);
        });

        it('shows them again as soon as an action is turned back on', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e3', content: 'hi' });
            expect(bar(bubble).hidden).toBe(true);
            aparteGlobalConfig.setBubbleActions({ retry: true });
            expect(bar(bubble).hidden).toBe(false);
            expect(footer(bubble).hidden).toBe(false);
        });

        it('keeps the footer when the branch picker is the only thing in it', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e4', content: 'hi' });
            bubble.setSiblings(2, 0);
            expect(bar(bubble).hidden).toBe(true);
            expect(footer(bubble).hidden).toBe(false);
        });

        it('hides the footer again when the last sibling disappears', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e5', content: 'hi' });
            bubble.setSiblings(2, 0);
            bubble.setSiblings(1, 0);
            expect(footer(bubble).hidden).toBe(true);
        });

        // The stylesheet floats an older message's footer out of the flow, except while
        // the branch picker shows: the flag it reads is written beside the picker's state.
        it('setTranscriptBusy disables retry, edit and the branch arrows, and restores them', () => {
            aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e7', content: 'hi' });
            bubble.setSiblings(2, 1);
            const retry = bubble.querySelector('[data-action="retry"]') as HTMLButtonElement;
            const prev = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            expect(retry.disabled).toBe(false);
            expect(prev.disabled).toBe(false);
            bubble.setTranscriptBusy(true);
            expect(retry.disabled).toBe(true);
            expect(prev.disabled).toBe(true);
            expect((bubble.querySelector('[data-action="copy"]') as HTMLButtonElement).disabled, 'copy stays').toBe(false);
            bubble.setTranscriptBusy(false);
            expect(retry.disabled).toBe(false);
            expect(prev.disabled).toBe(false);
        });

        it('stamps data-branches on the message exactly while the picker shows', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e6', content: 'hi' });
            const message = bubble.querySelector('.aparte-message') as HTMLElement;
            expect(message.hasAttribute('data-branches')).toBe(false);
            bubble.setSiblings(2, 0);
            expect(message.hasAttribute('data-branches')).toBe(true);
            bubble.setSiblings(1, 0);
            expect(message.hasAttribute('data-branches')).toBe(false);
        });

        it('a custom registered action alone is enough to keep the bar', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false });
            aparteGlobalConfig.registerAction({
                id: 'star', icon: '<svg></svg>', label: 'Star',
                zones: ['bubble'], bubble: { roles: ['assistant'] },
            });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'e6', content: 'hi' });
            expect(bar(bubble).children.length).toBe(1);
            expect(bar(bubble).hidden).toBe(false);
        });

        it('shows the bar in edit mode even with every action off', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false, edit: true });
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'e7', content: 'hi' });
            (bubble.querySelector('.aparte-action-edit') as HTMLButtonElement).click();
            expect(bar(bubble).hidden).toBe(false);
            expect(bubble.querySelector('.aparte-action-edit-save')).not.toBeNull();
        });
    });

    // ─── The image tile: interactive only when the app says it can preview ────
    // Core owns no lightbox — the tile just asks, via `aparte-attachment-preview`.
    // Until an app declares it handles that, a clickable-looking tile is a lie.
    describe('image tile preview (setHostHandlers)', () => {
        afterEach(() => aparteGlobalConfig.reset());

        const imageBubble = (id: string) => {
            const el = createBubble({ 'data-role': 'user', 'message-id': id });
            el.updateMessage({
                attachments: [{ id: 'i1', name: 'shot.png', type: 'image/png', url: 'blob:x' }],
            });
            return el;
        };

        it('is inert and not signalled as a button by default', () => {
            bubble = imageBubble('t1');
            const tile = bubble.querySelector('.aparte-thumb--image') as HTMLElement;
            expect(tile).not.toBeNull();
            expect(tile.getAttribute('role')).toBeNull();
            expect(tile.hasAttribute('tabindex')).toBe(false);
            let fired = false;
            const onPreview = () => { fired = true; };
            document.body.addEventListener('aparte-attachment-preview', onPreview);
            tile.click();
            document.body.removeEventListener('aparte-attachment-preview', onPreview);
            expect(fired).toBe(false);
        });

        it('becomes a real button once attachmentPreview is declared', () => {
            aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });
            bubble = imageBubble('t2');
            const tile = bubble.querySelector('.aparte-thumb--image') as HTMLElement;
            expect(tile.getAttribute('role')).toBe('button');
            expect(tile.getAttribute('tabindex')).toBe('0');

            let name: string | undefined;
            document.body.addEventListener('aparte-attachment-preview', (e: Event) => {
                name = ((e as CustomEvent).detail as { name?: string }).name;
            }, { once: true });
            tile.click();
            expect(name).toBe('shot.png');
        });

        it('opens on Enter too — a button you cannot reach by keyboard is not one', () => {
            aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });
            bubble = imageBubble('t3');
            const tile = bubble.querySelector('.aparte-thumb--image') as HTMLElement;
            let fired = 0;
            const onPreview = () => { fired++; };
            document.body.addEventListener('aparte-attachment-preview', onPreview);
            tile.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            document.body.removeEventListener('aparte-attachment-preview', onPreview);
            expect(fired).toBe(1);
        });

        it('leaves non-image tiles inert even when declared (nothing to preview)', () => {
            aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });
            bubble = createBubble({ 'data-role': 'user', 'message-id': 't4' });
            bubble.updateMessage({
                attachments: [{ id: 'f1', name: 'report.pdf', type: 'application/pdf', url: 'blob:x' }],
            });
            const tile = bubble.querySelector('.aparte-thumb--file') as HTMLElement;
            expect(tile.getAttribute('role')).toBeNull();
        });
    });

    // ─── Custom sibling-nav indicator (setSiblingNavRenderer) ─────────────
    describe('sibling-nav renderer', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('replaces the position indicator with custom output, arrows preserved', () => {
            aparteGlobalConfig.setSiblingNavRenderer(({ count, index }) =>
                Array.from({ length: count }, (_, i) => `<span class="dot${i === index ? ' active' : ''}"></span>`).join(''));
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'sn1' });
            bubble.setSiblings(3, 1);

            const label = bubble.querySelector('.aparte-branch-label') as HTMLElement;
            const dots = label.querySelectorAll('.dot');
            expect(dots.length).toBe(3);
            expect(dots[1].classList.contains('active')).toBe(true);
            // Default "N / M" text is gone; the arrows remain.
            expect(label.textContent).not.toContain('/');
            expect(bubble.querySelector('.aparte-branch-prev')).not.toBeNull();
            expect(bubble.querySelector('.aparte-branch-next')).not.toBeNull();
        });
    });

    // ─── Custom structural shell (setBubbleShellRenderer) ─────────────────
    // ─── the info (ⓘ) action ───────────────────────────────────────────────────
    // It used to be pushed at the end of the flag branch, outside the action
    // registry: impossible to remove through the flags, and impossible to REQUEST in
    // an explicit per-role list (`'info'` was not even in AparteBubbleActionName).
    // It is a button like the others now — with one precondition kept: no usage, no
    // details to show, no button.
    describe('info action', () => {
        afterEach(() => aparteGlobalConfig.reset());

        const actionsOf = (el: HTMLElement) =>
            [...el.querySelectorAll('.aparte-action-bar .aparte-action-btn')]
                .map((b) => b.getAttribute('data-action'));
        const withUsage = (el: HTMLElement) =>
            (el as unknown as { setUsage(u: unknown): void }).setUsage({ inputTokens: 3, outputTokens: 5 });

        it('is off by default, usage or not — nobody in core opens the popover', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'i0', content: 'hi' });
            withUsage(bubble);
            expect(actionsOf(bubble)).toEqual(['copy']);
        });

        it('is requestable in an explicit per-role set', () => {
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy', 'info'] });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'i1', content: 'hi' });
            withUsage(bubble);
            expect(actionsOf(bubble)).toEqual(['copy', 'info']);
        });

        it('is removable through the flag, even with usage present', () => {
            aparteGlobalConfig.setBubbleActions({ info: false });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'i2', content: 'hi' });
            withUsage(bubble);
            expect(actionsOf(bubble)).not.toContain('info');
        });

        it('needs usage: asking for it without any shows nothing', () => {
            aparteGlobalConfig.setBubbleActions({ assistant: ['copy', 'info'] });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'i3', content: 'hi' });
            expect(actionsOf(bubble)).toEqual(['copy']);
        });
    });

    // ─── the waiting state ───────────────────────────────────────────────────
    // Between "user sends" and the first token there was nothing: a name, an empty
    // body, and (in the display-only path) copy/retry on a reply that doesn't
    // exist. The bubble is where the user is already looking, so the indicator
    // lives here — no app wiring, identical in raw core and every wrapper.
    describe('waiting indicator', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('shows while an assistant bubble is streaming with nothing in it', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w1', streaming: '' });
            const waiting = bubble.querySelector('.aparte-waiting') as HTMLElement;
            expect(waiting).not.toBeNull();
            expect(waiting.hidden).toBe(false);
            // The dots are decorative; the accessible name comes from the locale.
            expect(waiting.querySelector('.aparte-dots')?.getAttribute('aria-hidden')).toBe('true');
            expect(waiting.textContent).toContain(aparteGlobalConfig.getLocale().typing);
        });

        it('takes its label from the active locale, not a hardcoded string', () => {
            // `locale.typing` shipped in APARTE_DEFAULT_LOCALE and was read by nothing. A
            // French app must not be told "Typing".
            aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), typing: 'Réflexion…' });
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w1b', streaming: '' });
            expect(bubble.querySelector('.aparte-waiting')?.textContent).toContain('Réflexion…');
        });

        it('disappears on the first token and stays gone', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w2', streaming: '' });
            const waiting = bubble.querySelector('.aparte-waiting') as HTMLElement;
            expect(waiting.hidden).toBe(false);

            (bubble as unknown as { appendToken(c: string): void }).appendToken('H');
            expect(waiting.hidden).toBe(true);
            (bubble as unknown as { appendToken(c: string): void }).appendToken('i');
            expect(waiting.hidden).toBe(true);
        });

        it('never shows for a user bubble, nor for a finished one', () => {
            bubble = createBubble({ 'data-role': 'user', 'message-id': 'w3', streaming: '' });
            expect((bubble.querySelector('.aparte-waiting') as HTMLElement).hidden).toBe(true);
            bubble.remove();

            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w4', content: 'done' });
            expect((bubble.querySelector('.aparte-waiting') as HTMLElement).hidden).toBe(true);
        });

        it('yields to segments — a thinking block is content, not waiting', () => {
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w5', streaming: '' });
            bubble.setSegments([{ id: 's1', type: 'thinking', content: 'hmm' } as unknown as AparteSegment]);
            expect((bubble.querySelector('.aparte-waiting') as HTMLElement).hidden).toBe(true);
        });

        it('clears when streaming ends even if nothing ever arrived', () => {
            // An empty reply (or an aborted turn) must not leave the dots pulsing.
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w6', streaming: '' });
            expect((bubble.querySelector('.aparte-waiting') as HTMLElement).hidden).toBe(false);
            bubble.updateMessage({ status: 'completed' });
            expect((bubble.querySelector('.aparte-waiting') as HTMLElement).hidden).toBe(true);
        });

        it('is optional: a custom shell without the region simply has no indicator', () => {
            aparteGlobalConfig.setBubbleShellRenderer(({ role }) =>
                `<div class="aparte-message" data-role="${role}"><div class="aparte-content"></div></div>`);
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'w7', streaming: '' });
            expect(bubble.querySelector('.aparte-waiting')).toBeNull();
            expect(bubble.querySelector('.aparte-message')?.getAttribute('aria-busy')).toBe('true');
        });
    });

    describe('bubble shell renderer', () => {
        afterEach(() => aparteGlobalConfig.reset());

        it('uses a custom shell and the native machinery still populates its region hooks', () => {
            aparteGlobalConfig.setBubbleShellRenderer(({ role, name }) =>
                `<div class="aparte-message custom-shell" data-role="${role}">`
                + `<div class="aparte-avatar"></div>`
                + `<div class="my-layout">`
                + `<span class="aparte-name">${name}</span>`
                + `<div class="aparte-segments"></div>`
                + `<div class="aparte-content"></div>`
                + `<div class="aparte-action-bar"></div>`
                + `</div></div>`);
            bubble = createBubble({ 'data-role': 'assistant', 'message-id': 'sh1', content: 'hello' });

            // Custom shell is in place; the default body skeleton is gone.
            expect(bubble.querySelector('.aparte-message.custom-shell')).not.toBeNull();
            expect(bubble.querySelector('.aparte-body')).toBeNull();
            // The bubble populated the region hooks the shell provided.
            expect(bubble.querySelector('.aparte-content')?.textContent).toContain('hello');
            expect(bubble.querySelector('.aparte-action-bar .aparte-action-btn')).not.toBeNull();
        });
    });
});
