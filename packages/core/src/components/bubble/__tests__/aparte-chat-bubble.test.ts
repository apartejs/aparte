import { describe, it, expect, afterEach } from 'vitest';

/**
 * AparteChatBubble — unit tests
 *
 * Focus:
 *  - Role-based action bar (user vs assistant buttons)
 *  - Race condition: role attribute set AFTER connectedCallback
 *  - Content / segment rendering
 *  - Branch picker (setSiblings)
 *  - aparte:retry / aparte:branch-navigate events
 */

import '../aparte-chat-bubble.js';
import { AparteConfig } from '../../../config/aparte-config.js';
import { registerSegmentRenderer, unregisterSegmentRenderer } from '../../../renderers/index.js';

type BubbleEl = HTMLElement & {
    setContent(content: string): void;
    getContent(): string;
    setSiblings(count: number, index: number): void;
};

function createBubble(attrs: Record<string, string> = {}): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
    document.body.appendChild(el);
    return el;
}

describe('AparteChatBubble', () => {
    let bubble: BubbleEl;

    afterEach(() => {
        bubble?.remove();
    });

    // ─── Role-based action bar ────────────────────────────────────────────

    describe('action bar — role set before connectedCallback', () => {
        it('user bubble has "Edit" button, NOT "Retry"', () => {
            bubble = createBubble({ role: 'user', 'message-id': 'u1' });
            expect(bubble.querySelector('.aparte-action-edit')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-retry')).toBeNull();
        });

        it('assistant bubble has "Retry" button, NOT "Edit"', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'a1' });
            expect(bubble.querySelector('.aparte-action-retry')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-edit')).toBeNull();
        });
    });

    describe('action bar — role set AFTER connectedCallback (Angular timing)', () => {
        it('user bubble gets Edit after role attribute is set post-connection', () => {
            // Simulate Angular: element connected WITHOUT role, then role is set
            bubble = createBubble({ 'message-id': 'u2' }); // no role → default assistant
            // At this point action bar would have Retry
            bubble.setAttribute('role', 'user'); // Angular sets it after CD
            expect(bubble.querySelector('.aparte-action-edit')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-retry')).toBeNull();
        });

        it('assistant bubble retains Retry when role is set to assistant post-connection', () => {
            bubble = createBubble({ 'message-id': 'a2' });
            bubble.setAttribute('role', 'assistant');
            expect(bubble.querySelector('.aparte-action-retry')).not.toBeNull();
            expect(bubble.querySelector('.aparte-action-edit')).toBeNull();
        });

        it('switching role from assistant to user updates action bar', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'a3' });
            expect(bubble.querySelector('.aparte-action-retry')).not.toBeNull();
            bubble.setAttribute('role', 'user');
            expect(bubble.querySelector('.aparte-action-retry')).toBeNull();
            expect(bubble.querySelector('.aparte-action-edit')).not.toBeNull();
        });
    });

    // ─── Content rendering ────────────────────────────────────────────────

    describe('setContent()', () => {
        it('renders text content in the content element', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'c1' });
            bubble.setContent('Hello world');
            expect(bubble.querySelector('.aparte-content')?.textContent).toContain('Hello world');
        });

        it('getContent() returns the stored content', () => {
            bubble = createBubble({ role: 'user', 'message-id': 'c2' });
            bubble.setContent('My question');
            expect(bubble.getContent()).toBe('My question');
        });

        it('content attribute on creation pre-fills the bubble', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'c3', content: 'Initial' });
            expect(bubble.getContent()).toBe('Initial');
        });
    });

    // ─── Avatar / header ──────────────────────────────────────────────────

    describe('avatar and role display', () => {
        it('renders no avatar by default (empty slot — role shown by layout/colour)', () => {
            bubble = createBubble({ role: 'user', 'message-id': 'av1' });
            const avatar = bubble.querySelector('.aparte-avatar');
            expect(avatar).not.toBeNull();                // the slot exists (opt-in via AvatarProvider)
            expect(avatar?.textContent?.trim()).toBe(''); // but empty by default — no initial
        });

        it('assistant avatar is also empty by default', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'av2' });
            const avatar = bubble.querySelector('.aparte-avatar');
            expect(avatar?.textContent?.trim()).toBe('');
        });

        it('message element has data-role attribute matching role', () => {
            bubble = createBubble({ role: 'user', 'message-id': 'av3' });
            expect(bubble.querySelector('.aparte-message')?.getAttribute('data-role')).toBe('user');
        });
    });

    // ─── Branch picker (setSiblings) ──────────────────────────────────────

    describe('setSiblings()', () => {
        it('shows branch picker when count > 1', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bp1' });
            bubble.setSiblings(3, 1);
            const picker = bubble.querySelector('.aparte-branch-picker') as HTMLElement;
            expect(picker?.hidden).toBe(false);
        });

        it('hides branch picker when count <= 1', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bp2' });
            bubble.setSiblings(3, 1);
            bubble.setSiblings(1, 0);
            const picker = bubble.querySelector('.aparte-branch-picker') as HTMLElement;
            expect(picker?.hidden).toBe(true);
        });

        it('displays correct "index / count" label', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bp3' });
            bubble.setSiblings(4, 2); // 0-based index 2 → "3 / 4"
            const label = bubble.querySelector('.aparte-branch-label');
            expect(label?.textContent).toBe('3 / 4');
        });

        it('disables prev button at first sibling (index 0)', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bp4' });
            bubble.setSiblings(3, 0);
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            expect(prevBtn?.disabled).toBe(true);
        });

        it('disables next button at last sibling', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bp5' });
            bubble.setSiblings(3, 2);
            const nextBtn = bubble.querySelector('.aparte-branch-next') as HTMLButtonElement;
            expect(nextBtn?.disabled).toBe(true);
        });

        it('enables both buttons in the middle', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bp6' });
            bubble.setSiblings(3, 1);
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            const nextBtn = bubble.querySelector('.aparte-branch-next') as HTMLButtonElement;
            expect(prevBtn?.disabled).toBe(false);
            expect(nextBtn?.disabled).toBe(false);
        });
    });

    // ─── aparte:retry event ─────────────────────────────────────────────────

    describe('aparte:retry event', () => {
        it('retry button on assistant bubble fires aparte:retry with correct messageId', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'r1' });
            let retryDetail: any = null;
            document.body.addEventListener('aparte:retry', (e: Event) => {
                retryDetail = (e as CustomEvent).detail;
            });
            const retryBtn = bubble.querySelector('.aparte-action-retry') as HTMLButtonElement;
            retryBtn?.click();
            expect(retryDetail?.messageId).toBe('r1');
        });

        it('user bubble does NOT fire aparte:retry on any click', () => {
            bubble = createBubble({ role: 'user', 'message-id': 'r2' });
            let fired = false;
            document.body.addEventListener('aparte:retry', () => { fired = true; });
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
            document.body.addEventListener('aparte:retry', (e: Event) => { detail = (e as CustomEvent).detail; });
            (b.querySelector('.aparte-action-retry') as HTMLButtonElement)?.click();
            expect(detail!.messageId).toBe('rt1');
            expect(detail!.targetId).toBe('host-xyz'); // was undefined before the fix
            host.remove();
        });
    });

    // ─── aparte:branch-navigate event ───────────────────────────────────────

    describe('aparte:branch-navigate event', () => {
        it('prev button fires aparte:branch-navigate with direction prev', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bn1' });
            bubble.setSiblings(3, 1);
            let detail: any = null;
            document.body.addEventListener('aparte:branch-navigate', (e: Event) => {
                detail = (e as CustomEvent).detail;
            });
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            prevBtn?.click();
            expect(detail?.direction).toBe('prev');
            expect(detail?.messageId).toBe('bn1');
        });

        it('next button fires aparte:branch-navigate with direction next', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bn2' });
            bubble.setSiblings(3, 1);
            let detail: any = null;
            document.body.addEventListener('aparte:branch-navigate', (e: Event) => {
                detail = (e as CustomEvent).detail;
            });
            const nextBtn = bubble.querySelector('.aparte-branch-next') as HTMLButtonElement;
            nextBtn?.click();
            expect(detail?.direction).toBe('next');
        });

        it('disabled prev button does NOT fire aparte:branch-navigate', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'bn3' });
            bubble.setSiblings(3, 0); // at first → prev disabled
            let fired = false;
            document.body.addEventListener('aparte:branch-navigate', () => { fired = true; });
            const prevBtn = bubble.querySelector('.aparte-branch-prev') as HTMLButtonElement;
            prevBtn?.click();
            expect(fired).toBe(false);
        });
    });

    // ─── Markdown + highlight composition (provider-agnostic) ─────────────
    describe('code highlight in the simple-content path', () => {
        const flush = () => new Promise((r) => setTimeout(r));

        afterEach(() => {
            AparteConfig.reset();
        });

        it('runs the registered highlighter over Markdown code blocks (inner-token provider, e.g. Prism)', async () => {
            // Markdown provider emits a plain <pre><code> (like marked).
            AparteConfig.setMarkdownProvider(() => '<pre><code class="language-js">const x = 1</code></pre>');
            // Highlight provider returns inner tokens (like Prism / highlight.js).
            AparteConfig.setHighlightProvider((code) => `<span class="tok">${code}</span>`);

            bubble = createBubble({ role: 'assistant', 'message-id': 'hl1', content: 'x' });
            await flush();

            const code = bubble.querySelector('.aparte-content pre code');
            expect(code?.querySelector('.tok')).not.toBeNull();
            expect(code?.textContent).toContain('const x = 1');
        });

        it('replaces the <pre> when the provider returns a full block (Shiki-style)', async () => {
            AparteConfig.setMarkdownProvider(() => '<pre><code class="language-js">y</code></pre>');
            AparteConfig.setHighlightProvider(() => '<pre class="shiki"><code>Y</code></pre>');

            bubble = createBubble({ role: 'assistant', 'message-id': 'hl2', content: 'x' });
            await flush();

            expect(bubble.querySelector('.aparte-content pre.shiki')).not.toBeNull();
        });

        it('leaves the plain code block intact when no highlighter is registered', async () => {
            AparteConfig.setMarkdownProvider(() => '<pre><code class="language-js">z</code></pre>');
            // no highlight provider registered

            bubble = createBubble({ role: 'assistant', 'message-id': 'hl3', content: 'x' });
            await flush();

            const code = bubble.querySelector('.aparte-content pre code');
            expect(code?.className).toContain('language-js');
            expect(code?.querySelector('.tok')).toBeNull();
        });
    });

    // ─── Live AparteConfig changes (e.g. runtime skin switch) ───────────────
    describe('action bar — reacts to live AparteConfig changes', () => {
        afterEach(() => {
            // reset() does NOT touch _bubbleActionsConfig; clear per-role sets
            // explicitly (setBubbleActions spreads explicit undefined keys).
            AparteConfig.setBubbleActions({ copy: true, retry: true, edit: true, feedback: false, user: undefined, assistant: undefined });
            AparteConfig.reset();
        });

        it('rebuilds the action bar when setBubbleActions changes the per-role set', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'cc1', content: 'hi' });
            AparteConfig.setBubbleActions({ assistant: ['copy'] });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(1);
            AparteConfig.setBubbleActions({ assistant: ['copy', 'thumbUp', 'thumbDown', 'retry'] });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(4);
        });

        it('re-reads icons when setIconProvider changes', () => {
            AparteConfig.setBubbleActions({ assistant: ['copy'] });
            bubble = createBubble({ role: 'assistant', 'message-id': 'cc2', content: 'hi' });
            // A real skin's provider is complete (spreads DefaultIconProvider);
            // start from the full fallback set so every connected bubble stays valid.
            const full = AparteConfig.getIconProvider();
            AparteConfig.setIconProvider({ ...full, copy: () => '<svg data-skin-copy></svg>' });
            const btn = bubble.querySelector('.aparte-action-btn[data-action="copy"]');
            expect(btn?.innerHTML).toContain('data-skin-copy');
        });

        it('stops rebuilding after the bubble is disconnected', () => {
            AparteConfig.setBubbleActions({ assistant: ['copy'] });
            bubble = createBubble({ role: 'assistant', 'message-id': 'cc3', content: 'hi' });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(1);
            bubble.remove();
            AparteConfig.setBubbleActions({ assistant: ['copy', 'retry', 'thumbUp', 'thumbDown'] });
            expect(bubble.querySelectorAll('.aparte-action-btn')).toHaveLength(1); // unchanged, no throw
        });
    });

    // ─── Segment renderer output — string | HTMLElement ───────────────────
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
            bubble = createBubble({ role: 'assistant', 'message-id': 'seg-el' });
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
            bubble = createBubble({ role: 'assistant', 'message-id': 'seg-str' });
            bubble.setSegments([{ id: 's2', type: 'str-seg' } as never]);

            const rendered = bubble.querySelector('.my-str-seg');
            expect(rendered).not.toBeNull();
            expect(rendered!.textContent).toBe('from string');
        });
    });

    // ─── Custom bubble toolbar actions (registerAction, zones: ['bubble']) ─
    describe('custom bubble actions', () => {
        afterEach(() => AparteConfig.reset());

        it('renders a registered action and emits aparte:action on click', () => {
            AparteConfig.registerAction({ id: 'share', icon: '<svg class="share-i"></svg>', label: 'Share', zones: ['bubble'] });
            bubble = createBubble({ role: 'assistant', 'message-id': 'ca1' });

            const btn = bubble.querySelector('.aparte-action-custom[data-action="custom:share"]') as HTMLButtonElement;
            expect(btn).not.toBeNull();
            expect(btn.getAttribute('aria-label')).toBe('Share');
            expect(btn.querySelector('.share-i')).not.toBeNull();

            let detail: any = null;
            document.body.addEventListener('aparte:action', (e: Event) => { detail = (e as CustomEvent).detail; });
            btn.click();
            expect(detail).toEqual({ actionId: 'share', zone: 'bubble', messageId: 'ca1', role: 'assistant', targetId: undefined });
        });

        it('honors role targeting (roles: ["user"] hides it on assistant bubbles)', () => {
            AparteConfig.registerAction({ id: 'editmeta', icon: '<svg></svg>', label: 'Edit meta', zones: ['bubble'], bubble: { roles: ['user'] } });
            bubble = createBubble({ role: 'assistant', 'message-id': 'ca2' });
            expect(bubble.querySelector('[data-action="custom:editmeta"]')).toBeNull();

            const userBubble = createBubble({ role: 'user', 'message-id': 'ca3' });
            expect(userBubble.querySelector('[data-action="custom:editmeta"]')).not.toBeNull();
            userBubble.remove();
        });

        it('live-registers into an already-mounted bubble and unregisters back out', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'ca4' });
            expect(bubble.querySelector('[data-action="custom:regen"]')).toBeNull();

            // registerAction notifies → mounted bubble rebuilds its action bar.
            AparteConfig.registerAction({ id: 'regen', icon: '<svg></svg>', label: 'Regenerate', zones: ['bubble'] });
            expect(bubble.querySelector('[data-action="custom:regen"]')).not.toBeNull();

            AparteConfig.unregisterAction('regen');
            expect(bubble.querySelector('[data-action="custom:regen"]')).toBeNull();
        });
    });

    // ─── Error state reflection (data-error) ──────────────────────────────
    describe('error state', () => {
        it('sets data-error on .aparte-message while an error segment is present, clears otherwise', () => {
            bubble = createBubble({ role: 'assistant', 'message-id': 'err1' });
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
        afterEach(() => AparteConfig.reset());

        it('renders custom chips via setAttachmentRenderer in place of the defaults', () => {
            AparteConfig.setAttachmentRenderer((att) => {
                const el = document.createElement('div');
                el.className = 'my-att';
                el.dataset['type'] = att.type;
                el.textContent = att.name;
                return el;
            });
            bubble = createBubble({ role: 'user', 'message-id': 'att1' });
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

    // ─── Custom sibling-nav indicator (setSiblingNavRenderer) ─────────────
    describe('sibling-nav renderer', () => {
        afterEach(() => AparteConfig.reset());

        it('replaces the position indicator with custom output, arrows preserved', () => {
            AparteConfig.setSiblingNavRenderer(({ count, index }) =>
                Array.from({ length: count }, (_, i) => `<span class="dot${i === index ? ' active' : ''}"></span>`).join(''));
            bubble = createBubble({ role: 'assistant', 'message-id': 'sn1' });
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
    describe('bubble shell renderer', () => {
        afterEach(() => AparteConfig.reset());

        it('uses a custom shell and the native machinery still populates its region hooks', () => {
            AparteConfig.setBubbleShellRenderer(({ role, name }) =>
                `<div class="aparte-message custom-shell" data-role="${role}">`
                + `<div class="aparte-avatar"></div>`
                + `<div class="my-layout">`
                + `<span class="aparte-name">${name}</span>`
                + `<div class="aparte-segments"></div>`
                + `<div class="aparte-content"></div>`
                + `<div class="aparte-action-bar"></div>`
                + `</div></div>`);
            bubble = createBubble({ role: 'assistant', 'message-id': 'sh1', content: 'hello' });

            // Custom shell is in place; the default body skeleton is gone.
            expect(bubble.querySelector('.aparte-message.custom-shell')).not.toBeNull();
            expect(bubble.querySelector('.aparte-body')).toBeNull();
            // The bubble populated the region hooks the shell provided.
            expect(bubble.querySelector('.aparte-content')?.textContent).toContain('hello');
            expect(bubble.querySelector('.aparte-action-bar .aparte-action-btn')).not.toBeNull();
        });
    });
});
