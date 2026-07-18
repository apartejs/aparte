import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * AparteChatViewport — unit tests
 *
 * Focus: MessageRepository integration — addBranch(), addSiblingOf(),
 * navigateBranch(), truncateFrom(), appendToken(), appendMessage(),
 * updateLastMessage(), aparte-path-changed.
 *
 * The component uses Light DOM and requires a connected element; we
 * attach a real instance to document.body for each test and clean up after.
 */

// Register the element before importing (setup order matters in JSDOM)
import '../aparte-chat-viewport.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

type ViewportEl = HTMLElement & {
    addMessage(msg: AparteMessage): void;
    appendMessage(msg: AparteMessage): void;
    updateLastMessage(content: string, options?: { append?: boolean }): void;
    getMessage(id: string): AparteMessage | undefined;
    getMessages(): AparteMessage[];
    appendToken(messageId: string, chunk: string): void;
    addBranch(messageId: string): number;
    addSiblingOf(existingId: string, newMsg: AparteMessage): string | null;
    navigateBranch(messageId: string, direction: 'prev' | 'next'): void;
    truncateFrom(messageId: string): void;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
    clearAll(): void;
    setFrameworkManagedDOM(managed: boolean): void;
    configure(config: { scrollThreshold?: number; maxRenderedBubbles?: number; maxMessages?: number; layoutTransitionMs?: number }): void;
};

function createViewport(): ViewportEl {
    const el = document.createElement('aparte-chat-viewport') as ViewportEl;
    document.body.appendChild(el);
    return el;
}

function makeMsg(overrides: Partial<AparteMessage> = {}): AparteMessage {
    return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'original content',
        timestamp: Date.now(),
        status: 'completed',
        ...overrides,
    };
}

describe('AparteChatViewport', () => {
    let viewport: ViewportEl;

    beforeEach(() => {
        viewport = createViewport();
    });

    afterEach(() => {
        viewport.remove();
        vi.restoreAllMocks();
    });

    // ─── addBranch (tree-based) ───────────────────────────────────────────

    describe('addBranch()', () => {
        it('returns index 1 (new branch is second sibling)', () => {
            const msg = makeMsg();
            viewport.addMessage(msg);
            const idx = viewport.addBranch(msg.id);
            expect(idx).toBe(1);
        });

        it('new sibling is the active message after addBranch', () => {
            const msg = makeMsg({ content: 'original' });
            viewport.addMessage(msg);
            viewport.addBranch(msg.id);
            // getMessages() returns the active path; new sibling replaces original
            const msgs = viewport.getMessages();
            expect(msgs).toHaveLength(1);
            expect(msgs[0].content).toBe(''); // new empty sibling
            expect(msgs[0].id).not.toBe(msg.id);
        });

        it('original message is still accessible by ID', () => {
            const msg = makeMsg({ content: 'first response' });
            viewport.addMessage(msg);
            viewport.addBranch(msg.id);
            // Original message is still in the tree, just not on the active path
            expect(viewport.getMessage(msg.id)).toBeDefined();
            expect(viewport.getMessage(msg.id)?.content).toBe('first response');
        });

        it('second addBranch adds a third sibling at index 2', () => {
            const msg = makeMsg();
            viewport.addMessage(msg);
            const idx1 = viewport.addBranch(msg.id);
            expect(idx1).toBe(1);
            // addBranch on the original id again → third sibling
            const idx2 = viewport.addBranch(msg.id);
            expect(idx2).toBe(2);
        });

        it('is a no-op (returns 0) for an unknown messageId', () => {
            expect(() => viewport.addBranch('unknown-id')).not.toThrow();
            expect(viewport.addBranch('unknown-id')).toBe(0);
        });
    });

    // ─── addSiblingOf ─────────────────────────────────────────────────────

    describe('addSiblingOf()', () => {
        it('returns the new message ID', () => {
            const msg = makeMsg();
            viewport.addMessage(msg);
            const sibling = makeMsg({ content: 'retry' });
            const returned = viewport.addSiblingOf(msg.id, sibling);
            expect(returned).toBe(sibling.id);
        });

        it('new sibling becomes the active path', () => {
            const msg = makeMsg({ content: 'original' });
            viewport.addMessage(msg);
            const sibling = makeMsg({ content: 'retry' });
            viewport.addSiblingOf(msg.id, sibling);
            expect(viewport.getMessages()[0].id).toBe(sibling.id);
        });

        it('returns null for unknown existingId', () => {
            const result = viewport.addSiblingOf('ghost', makeMsg());
            expect(result).toBeNull();
        });

        it('user message: new message is a child (user stays on active path)', () => {
            const userMsg = makeMsg({ role: 'user', content: 'question' });
            viewport.addMessage(userMsg);
            const assistantMsg = makeMsg({ role: 'assistant', content: 'response' });
            viewport.addSiblingOf(userMsg.id, assistantMsg);
            const path = viewport.getMessages();
            expect(path).toHaveLength(2);
            expect(path[0].id).toBe(userMsg.id);
            expect(path[1].id).toBe(assistantMsg.id);
        });

        it('user message: multiple retries create siblings (navigation between them)', () => {
            const userMsg = makeMsg({ role: 'user', content: 'question' });
            viewport.addMessage(userMsg);
            const resp1 = makeMsg({ role: 'assistant', content: 'v1' });
            const resp2 = makeMsg({ role: 'assistant', content: 'v2' });
            viewport.addSiblingOf(userMsg.id, resp1);
            viewport.addSiblingOf(userMsg.id, resp2);
            // Active path is exactly [user, resp2] in that order — nothing extra.
            expect(viewport.getMessages().map(m => m.id)).toEqual([userMsg.id, resp2.id]);
            // Navigate to resp1 → active path becomes [user, resp1].
            viewport.navigateBranch(resp2.id, 'prev');
            expect(viewport.getMessages().map(m => m.id)).toEqual([userMsg.id, resp1.id]);
        });
    });

    // ─── navigateBranch ───────────────────────────────────────────────────

    describe('navigateBranch()', () => {
        it('switches to previous sibling', () => {
            const original = makeMsg({ content: 'first' });
            viewport.addMessage(original);
            const sibling = makeMsg({ content: 'second' });
            viewport.addSiblingOf(original.id, sibling);
            // Currently on sibling (second). Navigate prev → original (first)
            viewport.navigateBranch(sibling.id, 'prev');
            expect(viewport.getMessages()[0].id).toBe(original.id);
        });

        it('switches to next sibling', () => {
            const original = makeMsg({ content: 'first' });
            viewport.addMessage(original);
            const sibling = makeMsg({ content: 'second' });
            viewport.addSiblingOf(original.id, sibling);
            // Navigate back to original first
            viewport.navigateBranch(sibling.id, 'prev');
            // Now navigate next → sibling
            viewport.navigateBranch(original.id, 'next');
            expect(viewport.getMessages()[0].id).toBe(sibling.id);
        });

        it('is a no-op at boundaries (no underflow/overflow)', () => {
            const msg = makeMsg();
            viewport.addMessage(msg);
            expect(() => viewport.navigateBranch(msg.id, 'prev')).not.toThrow();
            expect(() => viewport.navigateBranch(msg.id, 'next')).not.toThrow();
            expect(viewport.getMessages()[0].id).toBe(msg.id);
        });
    });

    // ─── truncateFrom ─────────────────────────────────────────────────────

    describe('truncateFrom()', () => {
        it('removes the target message and all subsequent messages', () => {
            const a = makeMsg({ role: 'user', content: 'q' });
            const b = makeMsg({ role: 'assistant', content: 'a' });
            const c = makeMsg({ role: 'assistant', content: 'b' });
            viewport.addMessage(a);
            viewport.addMessage(b);
            viewport.addMessage(c);

            viewport.truncateFrom(b.id);

            expect(viewport.getMessage(a.id)).toBeDefined();
            expect(viewport.getMessage(b.id)).toBeUndefined();
            expect(viewport.getMessage(c.id)).toBeUndefined();
        });

        it('keeps the message before the truncation point', () => {
            const a = makeMsg({ role: 'user', content: 'q' });
            const b = makeMsg({ role: 'assistant', content: 'a' });
            viewport.addMessage(a);
            viewport.addMessage(b);

            viewport.truncateFrom(b.id);

            expect(viewport.getMessages()).toHaveLength(1);
            expect(viewport.getMessages()[0].id).toBe(a.id);
        });

        it('is a no-op for an unknown messageId', () => {
            const msg = makeMsg();
            viewport.addMessage(msg);
            expect(() => viewport.truncateFrom('ghost-id')).not.toThrow();
            expect(viewport.getMessages()).toHaveLength(1);
        });

        it('truncating from the first message clears all', () => {
            const a = makeMsg();
            const b = makeMsg();
            viewport.addMessage(a);
            viewport.addMessage(b);
            viewport.truncateFrom(a.id);
            expect(viewport.getMessages()).toHaveLength(0);
        });
    });

    // ─── appendMessage ────────────────────────────────────────────────────

    describe('appendMessage()', () => {
        it('registers the message in internal state', () => {
            const msg = makeMsg({ role: 'user', content: 'hello' });
            viewport.appendMessage(msg);
            expect(viewport.getMessage(msg.id)).toBeDefined();
            expect(viewport.getMessage(msg.id)?.content).toBe('hello');
        });

        it('creates an aparte-chat-bubble element in the DOM', () => {
            const msg = makeMsg({ role: 'assistant', content: 'hi' });
            viewport.appendMessage(msg);
            const bubble = viewport.querySelector(`aparte-chat-bubble[message-id="${msg.id}"]`);
            expect(bubble).not.toBeNull();
        });

        it('sets the role attribute on the created bubble', () => {
            const msg = makeMsg({ role: 'user', content: '' });
            viewport.appendMessage(msg);
            const bubble = viewport.querySelector(`aparte-chat-bubble[message-id="${msg.id}"]`);
            expect(bubble?.getAttribute('role')).toBe('user');
        });

        it('multiple calls create multiple messages', () => {
            viewport.appendMessage(makeMsg({ role: 'user', content: 'q' }));
            viewport.appendMessage(makeMsg({ role: 'assistant', content: 'a' }));
            expect(viewport.getMessages()).toHaveLength(2);
        });
    });

    // ─── updateLastMessage ────────────────────────────────────────────────

    describe('updateLastMessage()', () => {
        it('appends content when append:true', () => {
            const msg = makeMsg({ content: '' });
            viewport.addMessage(msg);
            viewport.updateLastMessage('hello ', { append: true });
            viewport.updateLastMessage('world', { append: true });
            const stored = viewport.getMessage(msg.id);
            expect(stored?.content).toBe('hello world');
        });

        it('replaces content when append is not set', () => {
            const msg = makeMsg({ content: 'old' });
            viewport.addMessage(msg);
            viewport.updateLastMessage('new');
            const stored = viewport.getMessage(msg.id);
            expect(stored?.content).toBe('new');
        });

        it('is a no-op when no messages exist', () => {
            expect(() => viewport.updateLastMessage('x')).not.toThrow();
        });

        it('only affects the last message', () => {
            const a = makeMsg({ content: 'first' });
            const b = makeMsg({ content: '' });
            viewport.addMessage(a);
            viewport.addMessage(b);
            viewport.updateLastMessage('appended', { append: true });
            expect(viewport.getMessage(a.id)?.content).toBe('first');
            expect(viewport.getMessage(b.id)?.content).toBe('appended');
        });
    });

    // ─── aparte-path-changed dispatch ───────────────────────────────────────

    describe('aparte-path-changed event', () => {
        it('dispatches path-changed in framework-managed mode on addBranch', () => {
            viewport.setFrameworkManagedDOM(true);
            const msg = makeMsg();
            viewport.addMessage(msg);

            let receivedMessages: AparteMessage[] | null = null;
            viewport.addEventListener('aparte-path-changed', (e: Event) => {
                receivedMessages = (e as CustomEvent).detail.messages;
            });

            viewport.addBranch(msg.id);
            expect(receivedMessages).not.toBeNull();
            expect((receivedMessages as AparteMessage[])[0].id).not.toBe(msg.id);
        });

        it('dispatches path-changed on navigateBranch', () => {
            const msg = makeMsg({ content: 'first' });
            viewport.addMessage(msg);
            const sibling = makeMsg({ content: 'second' });
            viewport.addSiblingOf(msg.id, sibling);

            let pathChangedCount = 0;
            viewport.addEventListener('aparte-path-changed', () => pathChangedCount++);

            viewport.navigateBranch(sibling.id, 'prev');
            expect(pathChangedCount).toBe(1);
        });
    });

    // ─── framework-managed DOM safety ─────────────────────────────────────
    //
    // Regression: when a framework owns the bubble DOM (Angular @for, React,
    // etc.), the viewport must NOT remove or clear bubble elements directly.
    // Doing so desynchronises the framework's view tree from the live DOM and
    // causes `NotFoundError: Failed to execute 'insertBefore'` on the next
    // change-detection cycle.

    describe('framework-managed DOM safety', () => {
        beforeEach(() => {
            viewport.setFrameworkManagedDOM(true);
        });

        function appendBubbleElement(messageId: string): HTMLElement {
            // Simulate a framework-mounted bubble inside the viewport's wrapper.
            // The viewport's _render() creates `.aparte-messages-wrapper` lazily
            // — we trigger it by appending a bubble via the public API once
            // (in default mode it would create+attach; here we only seed the
            // internal _repo and manually create a child to mimic a framework).
            // Connect the viewport's container by reading it.
            let wrapper = viewport.querySelector('.aparte-messages-wrapper');
            if (!wrapper) {
                // The container is built in _render() (connectedCallback).
                // It's already present since beforeEach attaches the element.
                wrapper = viewport.querySelector('.aparte-messages-wrapper');
            }
            if (!wrapper) throw new Error('viewport messages wrapper not found');
            const bubble = document.createElement('aparte-chat-bubble');
            bubble.setAttribute('message-id', messageId);
            wrapper.appendChild(bubble);
            return bubble;
        }

        it('truncateResponsesAfter does NOT remove bubble elements from the DOM', () => {
            const u = makeMsg({ role: 'user', content: 'q' });
            const a = makeMsg({ role: 'assistant', content: 'r' });
            viewport.appendMessage(u);
            viewport.appendMessage(a);
            // Framework would mount these — simulate by creating bubble elements.
            const uBubble = appendBubbleElement(u.id);
            const aBubble = appendBubbleElement(a.id);

            (viewport as unknown as { truncateResponsesAfter(id: string): void }).truncateResponsesAfter(u.id);

            // Repo state was updated...
            expect(viewport.getMessage(a.id)).toBeUndefined();
            // ...but the DOM bubble for `a` MUST still be present, so Angular
            // can remove it itself on the next change-detection pass.
            expect(uBubble.isConnected).toBe(true);
            expect(aBubble.isConnected).toBe(true);
        });

        it('truncateFrom does NOT remove bubble elements from the DOM', () => {
            const u = makeMsg({ role: 'user', content: 'q' });
            const a = makeMsg({ role: 'assistant', content: 'r' });
            viewport.appendMessage(u);
            viewport.appendMessage(a);
            const uBubble = appendBubbleElement(u.id);
            const aBubble = appendBubbleElement(a.id);

            viewport.truncateFrom(a.id);

            // Repo state truncated, DOM untouched.
            expect(viewport.getMessage(a.id)).toBeUndefined();
            expect(uBubble.isConnected).toBe(true);
            expect(aBubble.isConnected).toBe(true);
        });

        it('clearAll does NOT clear the messages wrapper innerHTML', () => {
            const m = makeMsg({ content: 'kept by framework' });
            viewport.appendMessage(m);
            const bubble = appendBubbleElement(m.id);

            viewport.clearAll();

            expect(viewport.getMessages()).toEqual([]);
            // Framework owns the DOM — bubble remains in place until the
            // framework re-renders from its own (now empty) message array.
            expect(bubble.isConnected).toBe(true);
        });
    });

    // ─── framework-managed via attribute (no child relocation) ─────────────
    describe('framework-managed attribute — host is the scroll surface', () => {
        function mountFrameworkViewport(): ViewportEl {
            // The framework wrappers set `framework-managed` DECLARATIVELY so the
            // flag is known at connect — before _render() would relocate children.
            const el = document.createElement('aparte-chat-viewport') as ViewportEl;
            el.setAttribute('framework-managed', '');
            const bubble = document.createElement('aparte-chat-bubble');
            bubble.setAttribute('message-id', 'm1');
            el.appendChild(bubble); // a framework-rendered bubble, present before connect
            document.body.appendChild(el);
            return el;
        }

        it('does NOT build the internal container/wrapper and keeps children in place', () => {
            const el = mountFrameworkViewport();
            try {
                expect(el.classList.contains('aparte-viewport--framework')).toBe(true);
                // No relocation structure — the framework owns the children.
                expect(el.querySelector('.aparte-viewport-container')).toBeNull();
                expect(el.querySelector('.aparte-messages-wrapper')).toBeNull();
                expect(el.querySelector('.aparte-bottom-spacer')).toBeNull();
                // The bubble stays a DIRECT child of the host (never relocated —
                // that relocation is what broke React/Vue/Svelte reconciliation).
                const bubble = el.querySelector('aparte-chat-bubble')!;
                expect(bubble.parentElement).toBe(el);
            } finally {
                el.remove();
            }
        });

        it('appends the scroll button as the LAST child (sticky, leading-safe)', () => {
            const el = mountFrameworkViewport();
            try {
                const btn = el.querySelector('.aparte-scroll-btn');
                expect(btn).not.toBeNull();
                expect(el.lastElementChild).toBe(btn);
            } finally {
                el.remove();
            }
        });
    });

    // ─── segment methods: AparteClient's 1-arg convention on a bare viewport ─
    describe('segment methods — 1-arg client convention (bare viewport target)', () => {
        // Regression: AparteClient streams via addSegment(segment)/updateSegment(
        // segmentId, updates) — the wrapper-host 1-arg convention. Against a bare
        // <aparte-chat-viewport> (2-arg signatures) the arguments bound one position
        // short, so a segment OBJECT became the `messageId`, a phantom message was
        // created keyed by that object, and ALL assistant text was dropped. No
        // test exercised the real viewport with the client convention — hence it
        // went unnoticed. The methods are now polymorphic (string = messageId,
        // object = segment → operate on the head message).
        const seg = (id: string, content: string): AparteSegment =>
            ({ id, type: 'text', content } as AparteSegment);
        type SegAPI = {
            addSegment(s: AparteSegment): void;
            updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
            removeSegment(segmentId: string): void;
        };

        it('addSegment(segment) lands on the head message, not a phantom', () => {
            viewport.appendMessage(makeMsg({ id: 'm1', role: 'assistant', content: '', status: 'streaming' }));
            const before = viewport.getMessages().length;
            (viewport as unknown as SegAPI).addSegment(seg('s1', 'hello'));
            expect(viewport.getMessages().length).toBe(before); // no phantom
            expect(viewport.getMessage('m1')?.segments?.[0]?.content).toBe('hello');
        });

        it('still supports the explicit addSegment(messageId, segment) form', () => {
            viewport.appendMessage(makeMsg({ id: 'm2', role: 'assistant', content: '' }));
            (viewport as unknown as { addSegment(id: string, s: AparteSegment): void }).addSegment('m2', seg('s2', 'world'));
            expect(viewport.getMessage('m2')?.segments?.[0]?.content).toBe('world');
        });

        it('updateSegment(segmentId, updates) updates the head message segment', () => {
            viewport.appendMessage(makeMsg({ id: 'm3', role: 'assistant', content: '' }));
            (viewport as unknown as SegAPI).addSegment(seg('s3', 'a'));
            (viewport as unknown as SegAPI).updateSegment('s3', { content: 'ab' } as Partial<AparteSegment>);
            expect(viewport.getMessage('m3')?.segments?.[0]?.content).toBe('ab');
        });

        it('removeSegment(segmentId) removes from the head message', () => {
            viewport.appendMessage(makeMsg({ id: 'm4', role: 'assistant', content: '' }));
            (viewport as unknown as SegAPI).addSegment(seg('s4', 'x'));
            (viewport as unknown as SegAPI).removeSegment('s4');
            expect(viewport.getMessage('m4')?.segments?.length ?? 0).toBe(0);
        });
    });

    // ─── Scroll button ────────────────────────────────────────────────────

    describe('scroll-to-bottom button', () => {
        it('renders a button with class aparte-scroll-btn', () => {
            const btn = viewport.querySelector('.aparte-scroll-btn');
            expect(btn).not.toBeNull();
            expect(btn?.tagName).toBe('BUTTON');
        });

        it('button is hidden by default (aparte-scroll-btn--hidden)', () => {
            const btn = viewport.querySelector('.aparte-scroll-btn');
            expect(btn?.classList.contains('aparte-scroll-btn--hidden')).toBe(true);
        });

        it('button has type=button and aria-label', () => {
            const btn = viewport.querySelector<HTMLButtonElement>('.aparte-scroll-btn');
            expect(btn?.getAttribute('type')).toBe('button');
            expect(btn?.getAttribute('aria-label')).toBeTruthy();
        });

        it('clearAll keeps button hidden and re-enables auto-scroll', () => {
            viewport.appendMessage(makeMsg({ role: 'user' }));
            viewport.clearAll();
            const btn = viewport.querySelector('.aparte-scroll-btn');
            expect(btn?.classList.contains('aparte-scroll-btn--hidden')).toBe(true);
        });
    });

    // ─── Bottom spacer ────────────────────────────────────────────────────

    describe('bottom spacer (.aparte-bottom-spacer)', () => {
        it('renders a spacer div inside .aparte-messages-wrapper', () => {
            const spacer = viewport.querySelector('.aparte-messages-wrapper .aparte-bottom-spacer');
            expect(spacer).not.toBeNull();
        });

        it('spacer has aria-hidden=true', () => {
            const spacer = viewport.querySelector('.aparte-bottom-spacer');
            expect(spacer?.getAttribute('aria-hidden')).toBe('true');
        });

        it('spacer starts at height 0px', () => {
            const spacer = viewport.querySelector<HTMLElement>('.aparte-bottom-spacer');
            // Initial inline style is empty string (CSS transition handles initial state)
            expect(spacer?.style.height === '' || spacer?.style.height === '0px').toBe(true);
        });

        it('spacer is last child inside .aparte-messages-wrapper', () => {
            viewport.appendMessage(makeMsg({ role: 'user' }));
            const wrapper = viewport.querySelector('.aparte-messages-wrapper');
            const lastChild = wrapper?.lastElementChild;
            expect(lastChild?.classList.contains('aparte-bottom-spacer')).toBe(true);
        });

        it('clearAll resets spacer height to 0px', () => {
            viewport.appendMessage(makeMsg({ role: 'user' }));
            viewport.clearAll();
            const spacer = viewport.querySelector<HTMLElement>('.aparte-bottom-spacer');
            expect(spacer?.style.height).toBe('0px');
        });

        it('new bubble is inserted before the spacer', () => {
            const msg = makeMsg({ role: 'user' });
            viewport.appendMessage(msg);
            const wrapper = viewport.querySelector('.aparte-messages-wrapper');
            const children = Array.from(wrapper?.children ?? []);
            const bubbleIdx = children.findIndex(c => c.getAttribute('message-id') === msg.id);
            const spacerIdx = children.findIndex(c => c.classList.contains('aparte-bottom-spacer'));
            expect(bubbleIdx).toBeGreaterThanOrEqual(0);
            expect(bubbleIdx).toBeLessThan(spacerIdx);
        });
    });

    // ─── native _reRenderActivePath ↔ framework-managed parity (audit reco #10) ─
    //
    // The two reconciliation paths must stay in lockstep. `_reRenderActivePath`
    // computes the active-path messages + sibling metadata ONCE and dispatches
    // the same `aparte-path-changed`, rendering the DOM itself only in native mode
    // (framework-managed mode leaves that to the wrapper's `syncBubbles`, which
    // consumes the very same payload). This guards them from silently diverging.
    describe('native ↔ framework-managed parity', () => {
        const u1: AparteMessage = { id: 'u1', role: 'user', content: 'q', timestamp: 1, status: 'completed' };
        const a1: AparteMessage = { id: 'a1', role: 'assistant', content: 'answer A', timestamp: 2, status: 'completed' };
        const a2: AparteMessage = { id: 'a2', role: 'assistant', content: 'answer B', timestamp: 3, status: 'completed' };

        /** Same branch scenario in either DOM mode; captures only the branch-op events. */
        function run(managed: boolean) {
            const vp = createViewport();
            if (managed) vp.setFrameworkManagedDOM(true);
            vp.appendMessage({ ...u1 });
            vp.appendMessage({ ...a1 });

            // Attach AFTER the appends so we compare only the reconciliation events
            // (addSiblingOf + navigateBranch), which both go through _reRenderActivePath.
            const events: Array<{ ids: string[]; siblings: string }> = [];
            vp.addEventListener('aparte-path-changed', (e) => {
                const d = (e as CustomEvent).detail as { messages: AparteMessage[]; siblings: unknown };
                events.push({ ids: d.messages.map((m) => m.id), siblings: JSON.stringify(d.siblings) });
            });
            vp.addSiblingOf(a1.id, { ...a2 }); // branch the assistant turn → active path [u1, a2]
            vp.navigateBranch(a2.id, 'prev');  // back to the first sibling      → active path [u1, a1]
            return { vp, events };
        }

        it('emits an identical aparte-path-changed sequence regardless of DOM mode', () => {
            const nat = run(false);
            const man = run(true);
            // The mode gates DOM rendering only — never the payload computation.
            expect(nat.events.length).toBe(2);
            expect(man.events).toEqual(nat.events);
            nat.vp.remove();
            man.vp.remove();
        });

        it('native mode renders DOM bubbles that match the dispatched active path', () => {
            const nat = run(false);
            const activePath = nat.events.at(-1)!.ids; // [u1, a1] after navigating back
            const bubbleIds = Array.from(nat.vp.querySelectorAll('aparte-chat-bubble'))
                .map((b) => b.getAttribute('message-id'));
            expect(bubbleIds).toEqual(activePath);
            nat.vp.remove();
        });

        it('framework-managed mode leaves DOM bubble rendering to the wrapper', () => {
            const man = run(true);
            // The branch re-render must not build bubbles itself in managed mode.
            const bubbleIds = Array.from(man.vp.querySelectorAll('aparte-chat-bubble'))
                .map((b) => b.getAttribute('message-id'));
            // Only the two optimistic appendMessage bubbles could exist; the branch
            // re-render adds none. In managed mode appendMessage also skips the DOM,
            // so there are zero viewport-owned bubbles.
            expect(bubbleIds).toEqual([]);
            man.vp.remove();
        });
    });

    // ─── DOM render cap ≠ model eviction (retention no longer lives in the view) ─
    //
    // `maxRenderedBubbles` is a perf ceiling on rendered DOM only — it must NEVER
    // evict messages from the repository. Regression guard for the silent
    // data-loss bug where _pruneMessages() called repo.resetHead() (which deletes
    // a node AND all its descendants → wiped the whole active path).
    describe('maxRenderedBubbles (render cap, not model eviction)', () => {
        it('caps rendered bubbles WITHOUT dropping messages from the model', () => {
            viewport.configure({ maxRenderedBubbles: 3 });
            for (let i = 0; i < 5; i++) {
                viewport.appendMessage(makeMsg({ id: `m${i}`, content: `msg ${i}` }));
            }
            // Model keeps every message…
            expect(viewport.getMessages().map((m) => m.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
            // …while the DOM only renders the last 3 bubbles.
            const bubbleIds = Array.from(viewport.querySelectorAll('aparte-chat-bubble'))
                .map((b) => b.getAttribute('message-id'));
            expect(bubbleIds).toEqual(['m2', 'm3', 'm4']);
        });

        it('keeps the full tree exportable after exceeding the cap (persistence intact)', () => {
            viewport.configure({ maxRenderedBubbles: 2 });
            for (let i = 0; i < 4; i++) viewport.appendMessage(makeMsg({ id: `k${i}` }));
            // getMessage() resolves every id, including the ones dropped from the DOM.
            for (let i = 0; i < 4; i++) expect(viewport.getMessage(`k${i}`)).toBeDefined();
        });

        it('the deprecated maxMessages alias caps rendering but does not evict', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            viewport.configure({ maxMessages: 2 });
            for (let i = 0; i < 4; i++) viewport.appendMessage(makeMsg({ id: `d${i}` }));
            expect(viewport.getMessages()).toHaveLength(4); // model intact, no eviction
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('deprecated'));
        });
    });
});

describe('aparte-chat-viewport — reduced motion', () => {
    let viewport: any;

    beforeEach(() => {
        viewport = document.createElement('aparte-chat-viewport');
        document.body.appendChild(viewport);
    });

    afterEach(() => {
        viewport.remove();
        vi.restoreAllMocks();
    });

    function fakeContainer() {
        return { scrollTo: vi.fn(), scrollTop: 0, scrollHeight: 400, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    }

    it('smooth-scrolls when the user has no reduced-motion preference', () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
        const container = fakeContainer();
        viewport._container = container;
        viewport._smoothScrollToBottom();
        expect(container.scrollTo).toHaveBeenCalledWith({ top: 400, behavior: 'smooth' });
    });

    it('falls back to instant scroll under prefers-reduced-motion (JS path the CSS block cannot reach)', () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        const container = fakeContainer();
        viewport._container = container;
        viewport._smoothScrollToBottom();
        expect(container.scrollTo).not.toHaveBeenCalled();
        expect(container.scrollTop).toBe(400);
    });
});
