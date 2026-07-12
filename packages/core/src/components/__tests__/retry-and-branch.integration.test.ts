import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Retry & Branch Navigation — integration tests
 *
 * These tests cover the full end-to-end flows that have historically caused
 * regressions in production:
 *
 *   1. Retry on assistant message → user message stays on active path
 *   2. Multiple retries → correct sibling count & navigation
 *   3. New-chat (clearMessages) → repo reset, no leftover topology
 *   4. Retry after new-chat → no duplicate / ghost messages
 *   5. aparte:path-changed payload in framework-managed mode
 *   6. aparte:path-changed includes sibling metadata after retry
 */

import '../viewport/aparte-chat-viewport.js';
import '../bubble/aparte-chat-bubble.js';

import type { AparteMessage } from '../../types/index.js';

type ViewportEl = HTMLElement & {
    appendMessage(msg: AparteMessage): void;
    addSiblingOf(existingId: string, newMsg: AparteMessage): string | null;
    navigateBranch(messageId: string, direction: 'prev' | 'next'): void;
    clearMessages(): void;
    getMessage(id: string): AparteMessage | undefined;
    getMessages(): AparteMessage[];
    setFrameworkManagedDOM(managed: boolean): void;
};

function createViewport(frameworkManaged = false): ViewportEl {
    const el = document.createElement('aparte-chat-viewport') as ViewportEl;
    document.body.appendChild(el);
    if (frameworkManaged) el.setFrameworkManagedDOM(true);
    return el;
}

function msg(overrides: Partial<AparteMessage> = {}): AparteMessage {
    return {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        status: 'completed',
        timestamp: Date.now(),
        ...overrides,
    };
}

describe('Retry flow', () => {
    let vp: ViewportEl;

    beforeEach(() => { vp = createViewport(); });
    afterEach(() => { vp.remove(); });

    // ─── Basic retry (assistant message) ─────────────────────────────────

    it('retry on assistant: user message stays on active path', () => {
        const user = msg({ role: 'user', content: 'question' });
        const asst = msg({ role: 'assistant', content: 'v1' });
        vp.appendMessage(user);
        vp.appendMessage(asst);

        const retry = msg({ role: 'assistant', content: 'v2' });
        vp.addSiblingOf(asst.id, retry);

        const path = vp.getMessages();
        expect(path[0].id).toBe(user.id);   // user stays
        expect(path[1].id).toBe(retry.id);  // new response replaces old
        expect(path).toHaveLength(2);
    });

    it('retry on assistant: original assistant response is NOT on active path', () => {
        const user = msg({ role: 'user', content: 'q' });
        const asst = msg({ role: 'assistant', content: 'v1' });
        vp.appendMessage(user);
        vp.appendMessage(asst);

        const retry = msg({ role: 'assistant', content: 'v2' });
        vp.addSiblingOf(asst.id, retry);

        const path = vp.getMessages();
        const ids = path.map(m => m.id);
        expect(ids).not.toContain(asst.id); // replaced, not active
    });

    it('original assistant response is still accessible by ID after retry', () => {
        const user = msg({ role: 'user', content: 'q' });
        const asst = msg({ role: 'assistant', content: 'v1' });
        vp.appendMessage(user);
        vp.appendMessage(asst);

        vp.addSiblingOf(asst.id, msg({ role: 'assistant', content: 'v2' }));

        expect(vp.getMessage(asst.id)).toBeDefined();
        expect(vp.getMessage(asst.id)?.content).toBe('v1');
    });

    // ─── Multiple retries ─────────────────────────────────────────────────

    it('three retries produce 4 siblings, latest is active', () => {
        const user = msg({ role: 'user', content: 'q' });
        const v1 = msg({ role: 'assistant', content: 'v1' });
        const v2 = msg({ role: 'assistant', content: 'v2' });
        const v3 = msg({ role: 'assistant', content: 'v3' });
        const v4 = msg({ role: 'assistant', content: 'v4' });

        vp.appendMessage(user);
        vp.appendMessage(v1);

        // Each retry uses the SAME assistantId (as AparteClient does — retries on the original)
        vp.addSiblingOf(v1.id, v2);
        vp.addSiblingOf(v1.id, v3);
        vp.addSiblingOf(v1.id, v4);

        // Active path is exactly [user, v4]; v1/v2/v3 are inactive siblings.
        expect(vp.getMessages().map(m => m.id)).toEqual([user.id, v4.id]);
    });

    it('can navigate between all siblings after multiple retries', () => {
        const user = msg({ role: 'user', content: 'q' });
        const v1 = msg({ role: 'assistant', content: 'v1' });
        const v2 = msg({ role: 'assistant', content: 'v2' });
        const v3 = msg({ role: 'assistant', content: 'v3' });

        vp.appendMessage(user);
        vp.appendMessage(v1);
        vp.addSiblingOf(v1.id, v2);
        vp.addSiblingOf(v1.id, v3); // active = v3

        // Navigate back through v2 → v1
        vp.navigateBranch(v3.id, 'prev');
        expect(vp.getMessages()[1].id).toBe(v2.id);

        vp.navigateBranch(v2.id, 'prev');
        expect(vp.getMessages()[1].id).toBe(v1.id);

        // Navigate forward back to v2 → v3
        vp.navigateBranch(v1.id, 'next');
        expect(vp.getMessages()[1].id).toBe(v2.id);

        vp.navigateBranch(v2.id, 'next');
        expect(vp.getMessages()[1].id).toBe(v3.id);
    });

    // ─── Retry flow — aparte:path-changed payload ───────────────────────────

    it('aparte:path-changed includes sibling metadata with count > 1 after retry', () => {
        vp.setFrameworkManagedDOM(true);

        const user = msg({ role: 'user', content: 'q' });
        const v1 = msg({ role: 'assistant', content: 'v1' });
        vp.appendMessage(user);
        vp.appendMessage(v1);

        let siblings: Array<{ id: string; count: number; index: number }> | undefined;
        vp.addEventListener('aparte:path-changed', (e: Event) => {
            siblings = (e as CustomEvent).detail.siblings;
        });

        const v2 = msg({ role: 'assistant', content: 'v2' });
        vp.addSiblingOf(v1.id, v2);

        expect(siblings).toBeDefined();
        const v2Meta = siblings?.find(s => s.id === v2.id);
        expect(v2Meta?.count).toBe(2);
        expect(v2Meta?.index).toBe(1);
    });

    it('aparte:path-changed sibling count for user message is 1 (no branch picker)', () => {
        vp.setFrameworkManagedDOM(true);

        const user = msg({ role: 'user', content: 'q' });
        const v1 = msg({ role: 'assistant', content: 'v1' });
        vp.appendMessage(user);
        vp.appendMessage(v1);

        let siblings: Array<{ id: string; count: number; index: number }> | undefined;
        vp.addEventListener('aparte:path-changed', (e: Event) => {
            siblings = (e as CustomEvent).detail.siblings;
        });

        const v2 = msg({ role: 'assistant', content: 'v2' });
        vp.addSiblingOf(v1.id, v2);

        const userMeta = siblings?.find(s => s.id === user.id);
        expect(userMeta?.count).toBe(1); // user has no siblings → no branch picker
    });
});

describe('New conversation (clearMessages) flow', () => {
    let vp: ViewportEl;

    beforeEach(() => { vp = createViewport(); });
    afterEach(() => { vp.remove(); });

    it('clearMessages() empties the active path', () => {
        vp.appendMessage(msg({ role: 'user', content: 'q' }));
        vp.appendMessage(msg({ role: 'assistant', content: 'a' }));
        expect(vp.getMessages()).toHaveLength(2);

        vp.clearMessages();
        expect(vp.getMessages()).toHaveLength(0);
    });

    it('messages appended after clearMessages() start a fresh linear chain', () => {
        // First conversation
        const u1 = msg({ role: 'user', content: 'q1' });
        const a1 = msg({ role: 'assistant', content: 'a1' });
        vp.appendMessage(u1);
        vp.appendMessage(a1);

        vp.clearMessages();

        // Second conversation — new IDs
        const u2 = msg({ role: 'user', content: 'q2' });
        const a2 = msg({ role: 'assistant', content: 'a2' });
        vp.appendMessage(u2);
        vp.appendMessage(a2);

        const path = vp.getMessages();
        expect(path).toHaveLength(2);
        expect(path[0].id).toBe(u2.id);
        expect(path[1].id).toBe(a2.id);
    });

    it('old messages from previous conversation are not accessible after clearMessages()', () => {
        const old = msg({ role: 'assistant', content: 'old' });
        vp.appendMessage(old);
        vp.clearMessages();
        expect(vp.getMessage(old.id)).toBeUndefined();
    });

    it('retry after new conversation uses only new messages (no duplicate/ghost)', () => {
        // First conversation
        const u1 = msg({ role: 'user', content: 'q1' });
        const a1 = msg({ role: 'assistant', content: 'a1' });
        vp.appendMessage(u1);
        vp.appendMessage(a1);
        vp.clearMessages();

        // Second conversation
        const u2 = msg({ role: 'user', content: 'q2' });
        const a2 = msg({ role: 'assistant', content: 'a2' });
        vp.appendMessage(u2);
        vp.appendMessage(a2);

        // Retry the second assistant message
        const a2retry = msg({ role: 'assistant', content: 'a2-retry' });
        vp.addSiblingOf(a2.id, a2retry);

        const path = vp.getMessages();
        // Must be exactly 2: u2 + a2retry
        expect(path).toHaveLength(2);
        expect(path[0].id).toBe(u2.id);
        expect(path[1].id).toBe(a2retry.id);
        // Old messages from first conversation must NOT appear
        const ids = path.map(m => m.id);
        expect(ids).not.toContain(u1.id);
        expect(ids).not.toContain(a1.id);
    });

    it('sibling count after new-conversation retry is exactly 2, not accumulated from old session', () => {
        vp.setFrameworkManagedDOM(true);

        // First conversation with retries (creates siblings in old tree)
        const u1 = msg({ role: 'user', content: 'q1' });
        const a1 = msg({ role: 'assistant', content: 'a1' });
        vp.appendMessage(u1);
        vp.appendMessage(a1);
        vp.addSiblingOf(a1.id, msg({ role: 'assistant', content: 'a1-retry' }));
        vp.clearMessages();

        // Second conversation
        const u2 = msg({ role: 'user', content: 'q2' });
        const a2 = msg({ role: 'assistant', content: 'a2' });
        vp.appendMessage(u2);
        vp.appendMessage(a2);

        let siblings: Array<{ id: string; count: number; index: number }> | undefined;
        vp.addEventListener('aparte:path-changed', (e: Event) => {
            siblings = (e as CustomEvent).detail.siblings;
        });

        const a2retry = msg({ role: 'assistant', content: 'a2-retry' });
        vp.addSiblingOf(a2.id, a2retry);

        const meta = siblings?.find(s => s.id === a2retry.id);
        expect(meta?.count).toBe(2); // only 2, not 3+ from old session
    });
});

describe('Navigation boundary conditions', () => {
    let vp: ViewportEl;

    beforeEach(() => { vp = createViewport(); });
    afterEach(() => { vp.remove(); });

    it('navigating prev at index 0 is a no-op', () => {
        const a = msg({ content: 'only' });
        vp.appendMessage(a);
        vp.navigateBranch(a.id, 'prev');
        expect(vp.getMessages()[0].id).toBe(a.id);
    });

    it('navigating next at last sibling is a no-op', () => {
        const v1 = msg({ content: 'v1' });
        const v2 = msg({ content: 'v2' });
        vp.appendMessage(v1);
        vp.addSiblingOf(v1.id, v2); // active = v2 (last)
        vp.navigateBranch(v2.id, 'next');
        expect(vp.getMessages()[0].id).toBe(v2.id);
    });

    it('navigating on unknown messageId does not throw', () => {
        expect(() => vp.navigateBranch('ghost', 'prev')).not.toThrow();
    });

    it('multi-turn conversation: navigation preserves full path depth', () => {
        // q → a → q2 → a2  (depth 4)
        const q  = msg({ role: 'user', content: 'q' });
        const a  = msg({ role: 'assistant', content: 'a' });
        const q2 = msg({ role: 'user', content: 'q2' });
        const a2 = msg({ role: 'assistant', content: 'a2' });
        const a2b = msg({ role: 'assistant', content: 'a2-retry' });

        vp.appendMessage(q);
        vp.appendMessage(a);
        vp.appendMessage(q2);
        vp.appendMessage(a2);
        vp.addSiblingOf(a2.id, a2b);

        // Active path: q, a, q2, a2b
        let path = vp.getMessages();
        expect(path).toHaveLength(4);
        expect(path[3].id).toBe(a2b.id);

        // Navigate back to a2
        vp.navigateBranch(a2b.id, 'prev');
        path = vp.getMessages();
        expect(path).toHaveLength(4);
        expect(path[3].id).toBe(a2.id);
        // Earlier messages untouched
        expect(path[0].id).toBe(q.id);
        expect(path[1].id).toBe(a.id);
        expect(path[2].id).toBe(q2.id);
    });
});
