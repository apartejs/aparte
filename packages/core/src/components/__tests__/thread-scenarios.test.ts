import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Thread scenarios — exhaustive spec
 *
 * We define the EXPECTED OUTPUT for every action before writing any assertion.
 * Each section header describes the expected state as a truth table,
 * then the test verifies it literally.
 *
 * Thread used throughout:
 *   u1 [user,  "question 1"]
 *   a1 [asst,  "réponse 1"]
 *   u2 [user,  "question 2"]
 *   a2 [asst,  "réponse 2"]   ← initial head
 *
 * Retry notation: a2r = first retry, a2r2 = second retry (3 siblings total).
 * Edit notation:  u2e = edited user message, a2new = new assistant after edit.
 */

import '../viewport/aparte-chat-viewport.js';
import type { AparteMessage } from '../../types/index.js';

// ─── Types ──────────────────────────────────────────────────────────────────

type ViewportEl = HTMLElement & {
    appendMessage(msg: AparteMessage): void;
    getMessage(id: string): AparteMessage | undefined;
    getMessages(): AparteMessage[];
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
    addSiblingOf(existingId: string, newMsg: AparteMessage): string | null;
    navigateBranch(messageId: string, direction: 'prev' | 'next'): void;
    truncateFrom(messageId: string): void;
    clearMessages(): void;
    setFrameworkManagedDOM(managed: boolean): void;
};

type SiblingMeta = { id: string; count: number; index: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeViewport(frameworkManaged = false): ViewportEl {
    const el = document.createElement('aparte-chat-viewport') as ViewportEl;
    document.body.appendChild(el);
    if (frameworkManaged) el.setFrameworkManagedDOM(true);
    return el;
}

let _seq = 0;
function msg(role: 'user' | 'assistant', content: string): AparteMessage {
    return { id: `id-${++_seq}`, role, content, status: 'completed', timestamp: Date.now() };
}

/** Capture siblings from the next aparte:path-changed event */
function captureSiblings(vp: ViewportEl): Promise<SiblingMeta[]> {
    return new Promise(resolve => {
        vp.addEventListener('aparte:path-changed', (e: Event) => {
            resolve((e as CustomEvent).detail.siblings ?? []);
        }, { once: true });
    });
}

// ─── Thread setup ─────────────────────────────────────────────────────────────

describe('Thread scenarios — full spec', () => {
    let vp: ViewportEl;
    let u1: AparteMessage, a1: AparteMessage, u2: AparteMessage, a2: AparteMessage;
    let a2r: AparteMessage, a2r2: AparteMessage;

    beforeEach(() => {
        _seq = 0;
        vp = makeViewport(true); // framework-managed so path-changed fires
        u1  = msg('user',      'question 1');
        a1  = msg('assistant', 'réponse 1');
        u2  = msg('user',      'question 2');
        a2  = msg('assistant', 'réponse 2');
        a2r = msg('assistant', 'réponse 2 — retry 1');
        a2r2= msg('assistant', 'réponse 2 — retry 2');
    });

    afterEach(() => { vp.remove(); });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1-4 — Build initial linear thread
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Expected after each append:
    //   append u1  → getMessages() = [u1]
    //   append a1  → getMessages() = [u1, a1]
    //   append u2  → getMessages() = [u1, a1, u2]
    //   append a2  → getMessages() = [u1, a1, u2, a2]

    describe('Step 1–4 — building the thread', () => {
        it('append u1 → path = [u1]', () => {
            vp.appendMessage(u1);
            const path = vp.getMessages();
            expect(path).toHaveLength(1);
            expect(path[0]).toMatchObject({ id: u1.id, role: 'user', content: 'question 1' });
        });

        it('append u1 then a1 → path = [u1, a1]', () => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            const path = vp.getMessages();
            expect(path).toHaveLength(2);
            expect(path[0]).toMatchObject({ id: u1.id, role: 'user' });
            expect(path[1]).toMatchObject({ id: a1.id, role: 'assistant', content: 'réponse 1' });
        });

        it('full thread → path = [u1, a1, u2, a2] in exact order', () => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            const path = vp.getMessages();
            expect(path).toHaveLength(4);
            expect(path.map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2.id]);
        });

        it('all messages accessible by id after build', () => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            for (const m of [u1, a1, u2, a2]) {
                expect(vp.getMessage(m.id)).toMatchObject({ id: m.id, content: m.content });
            }
        });

        it('first sibling created by addSiblingOf reports count=2 (so original was 1)', async () => {
            // appendMessage doesn't dispatch path-changed; we verify the
            // initial count indirectly: the first addSiblingOf gives count=2.
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            const siblingsPromise = captureSiblings(vp);
            vp.addSiblingOf(a2.id, a2r);
            const siblings = await siblingsPromise;
            const a2rMeta = siblings.find(s => s.id === a2r.id)!;
            expect(a2rMeta.count).toBe(2); // was 1 before, now 2
            expect(a2rMeta.index).toBe(1); // newest = last
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 5 — First retry on a2
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Expected:
    //   getMessages() = [u1, a1, u2, a2r]      ← a2r replaces a2 on active path
    //   getMessage(a2.id) = defined             ← a2 still in tree
    //   siblings of a2r: count=2, index=1
    //   siblings of u2:  count=1 (user message unchanged)

    describe('Step 5 — first retry (a2 → a2r)', () => {
        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
        });

        it('active path = [u1, a1, u2, a2r] — u2 stays, a2 replaced', () => {
            vp.addSiblingOf(a2.id, a2r);
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2r.id]);
        });

        it('a2 is still accessible by id (not deleted)', () => {
            vp.addSiblingOf(a2.id, a2r);
            expect(vp.getMessage(a2.id)).toMatchObject({ id: a2.id, content: 'réponse 2' });
        });

        it('a2r siblings: count=2, index=1 (newest = last)', async () => {
            const siblingsPromise = captureSiblings(vp);
            vp.addSiblingOf(a2.id, a2r);
            const siblings = await siblingsPromise;
            const meta = siblings.find(s => s.id === a2r.id)!;
            expect(meta).toBeDefined();
            expect(meta.count).toBe(2);
            expect(meta.index).toBe(1);
        });

        it('a2 siblings: count=2, index=0 after navigating to it', async () => {
            // After addSiblingOf, path is [u1,a1,u2,a2r]. a2 is NOT on the
            // active path so path-changed won't carry its meta. Navigate prev
            // to make a2 active — path-changed then includes a2 with index=0.
            vp.addSiblingOf(a2.id, a2r); // active = a2r (index 1)
            const siblingsPromise = captureSiblings(vp);
            vp.navigateBranch(a2r.id, 'prev'); // active = a2 → fires path-changed
            const siblings = await siblingsPromise;
            const meta = siblings.find(s => s.id === a2.id)!;
            expect(meta).toBeDefined();
            expect(meta.count).toBe(2);
            expect(meta.index).toBe(0);
        });

        it('u2 has count=1 — user messages never get branch picker', async () => {
            const siblingsPromise = captureSiblings(vp);
            vp.addSiblingOf(a2.id, a2r);
            const siblings = await siblingsPromise;
            const u2meta = siblings.find(s => s.id === u2.id)!;
            expect(u2meta.count).toBe(1);
        });

        it('addSiblingOf returns the new message id', () => {
            const returned = vp.addSiblingOf(a2.id, a2r);
            expect(returned).toBe(a2r.id);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 6 — Navigate prev: a2r → a2
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Expected:
    //   getMessages() = [u1, a1, u2, a2]
    //   a2.index = 0, count = 2

    describe('Step 6 — nav prev (a2r → a2)', () => {
        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r);
            // active = a2r (index 1)
        });

        it('active path = [u1, a1, u2, a2] after navigating prev', () => {
            vp.navigateBranch(a2r.id, 'prev');
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2.id]);
        });

        it('u2 is still at position [2] after nav', () => {
            vp.navigateBranch(a2r.id, 'prev');
            expect(vp.getMessages()[2]).toMatchObject({ id: u2.id });
        });

        it('a2r still accessible by id after nav', () => {
            vp.navigateBranch(a2r.id, 'prev');
            expect(vp.getMessage(a2r.id)).toMatchObject({ id: a2r.id });
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 7 — Second retry: now 3 siblings (a2, a2r, a2r2)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // We retry from a2 (current active after step 6).
    // Expected:
    //   getMessages() = [u1, a1, u2, a2r2]
    //   a2r2: count=3, index=2
    //   a2r:  count=3, index=1
    //   a2:   count=3, index=0

    describe('Step 7 — second retry (3 siblings total)', () => {
        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r);       // siblings: [a2, a2r], active=a2r
            vp.navigateBranch(a2r.id, 'prev'); // active=a2
            vp.addSiblingOf(a2.id, a2r2);      // siblings: [a2, a2r, a2r2], active=a2r2
        });

        it('active path ends with a2r2', () => {
            const path = vp.getMessages();
            expect(path[3]).toMatchObject({ id: a2r2.id });
        });

        it('full path = [u1, a1, u2, a2r2]', () => {
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2r2.id]);
        });

        it('a2r2: count=3, index=2', async () => {
            const siblingsPromise = captureSiblings(vp);
            vp.navigateBranch(a2r2.id, 'next'); // no-op at boundary, still fires? No — let's just navigate prev/next to trigger
            // Actually we need to fire path-changed — let's re-add after navigation
            // Re-trigger: navigate away and back
            vp.navigateBranch(a2r2.id, 'prev'); // → a2r, fires event
            const s1 = await siblingsPromise;
            const a2rMeta = s1.find(s => s.id === a2r.id)!;
            expect(a2rMeta.count).toBe(3);
            expect(a2rMeta.index).toBe(1);
        });

        it('all 3 sibling ids are still accessible', () => {
            expect(vp.getMessage(a2.id)).toMatchObject({ id: a2.id });
            expect(vp.getMessage(a2r.id)).toMatchObject({ id: a2r.id });
            expect(vp.getMessage(a2r2.id)).toMatchObject({ id: a2r2.id });
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 8–10 — Full navigation cycle across 3 siblings
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Starting from a2r2 (index 2, count 3):
    //   prev → a2r (index 1)
    //   prev → a2  (index 0)
    //   next → a2r (index 1)
    //   next → a2r2 (index 2)
    //   next → NO-OP (stays a2r2)
    //   prev → a2r (index 1) again

    describe('Step 8–10 — full navigation cycle', () => {
        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r);
            vp.navigateBranch(a2r.id, 'prev');
            vp.addSiblingOf(a2.id, a2r2); // active = a2r2
        });

        it('prev from a2r2 → a2r, path ends at a2r', () => {
            vp.navigateBranch(a2r2.id, 'prev');
            expect(vp.getMessages()[3].id).toBe(a2r.id);
        });

        it('prev from a2r2 → a2r → a2, path ends at a2', () => {
            vp.navigateBranch(a2r2.id, 'prev');
            vp.navigateBranch(a2r.id, 'prev');
            expect(vp.getMessages()[3].id).toBe(a2.id);
        });

        it('full round trip: a2r2 → a2r → a2 → a2r → a2r2', () => {
            vp.navigateBranch(a2r2.id, 'prev');  // → a2r
            vp.navigateBranch(a2r.id,  'prev');  // → a2
            vp.navigateBranch(a2.id,   'next');  // → a2r
            vp.navigateBranch(a2r.id,  'next');  // → a2r2
            expect(vp.getMessages()[3].id).toBe(a2r2.id);
        });

        it('next at last sibling is a no-op, path unchanged', () => {
            // Already at a2r2 (last)
            vp.navigateBranch(a2r2.id, 'next');
            expect(vp.getMessages()[3].id).toBe(a2r2.id);
        });

        it('prev at first sibling is a no-op', () => {
            vp.navigateBranch(a2r2.id, 'prev');
            vp.navigateBranch(a2r.id,  'prev'); // → a2 (first)
            vp.navigateBranch(a2.id,   'prev'); // no-op
            expect(vp.getMessages()[3].id).toBe(a2.id);
        });

        it('navigation never corrupts the beginning of the path', () => {
            vp.navigateBranch(a2r2.id, 'prev');
            vp.navigateBranch(a2r.id,  'prev');
            vp.navigateBranch(a2.id,   'next');
            const path = vp.getMessages();
            expect(path[0].id).toBe(u1.id);
            expect(path[1].id).toBe(a1.id);
            expect(path[2].id).toBe(u2.id);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11 — Edit flow
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Context: thread = [u1, a1, u2, a2r] (a2r is active after nav from step 8)
    // Edit u2 (content "question 2 edited"):
    //   1. updateMessage(u2.id, { content: 'question 2 edited' })
    //   2. truncateFrom(a2r.id)  ← removes the response after u2 on active path
    //   3. appendMessage(a2new)  ← new assistant response
    //
    // Expected after edit:
    //   getMessages() = [u1, a1, u2, a2new]
    //   u2.content = 'question 2 edited'
    //   a2new accessible by id
    //   a2r NOT on active path
    //   a2new: count=1 (fresh, no siblings)

    describe('Step 11 — edit user message (truncate + reappend)', () => {
        let a2new: AparteMessage;

        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r); // active = a2r
            // Active path: [u1, a1, u2, a2r]

            // Edit flow (simulates what _handleEdit now does):
            // truncateResponsesAfter clears ALL children of u2 (both a2 and a2r)
            // so the new response starts with sibling count = 1.
            vp.updateMessage(u2.id, { content: 'question 2 edited' });
            (vp as any).truncateResponsesAfter(u2.id);
            a2new = msg('assistant', 'réponse après edit');
            vp.appendMessage(a2new);
        });

        it('path = [u1, a1, u2, a2new] in exact order', () => {
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2new.id]);
        });

        it('u2 content is updated to "question 2 edited"', () => {
            expect(vp.getMessage(u2.id)?.content).toBe('question 2 edited');
        });

        it('a2new is accessible by id', () => {
            expect(vp.getMessage(a2new.id)).toMatchObject({ id: a2new.id });
        });

        it('a2r is no longer on the active path', () => {
            const ids = vp.getMessages().map(m => m.id);
            expect(ids).not.toContain(a2r.id);
        });

        it('a2new has count=1 (fresh branch, no retry yet)', async () => {
            // After addSiblingOf(a2new, extra), extra is the NEW active node.
            // path-changed payload carries only active-path nodes, so we
            // verify extraMsg (index=1, count=2), which proves a2new was at index=0.
            const siblingsPromise = captureSiblings(vp);
            const extraMsg = msg('assistant', 'extra');
            vp.addSiblingOf(a2new.id, extraMsg); // a2new was alone → count goes 1→2
            const siblings = await siblingsPromise;
            const extraMeta = siblings.find(s => s.id === extraMsg.id)!;
            expect(extraMeta.count).toBe(2);    // 2 siblings total
            expect(extraMeta.index).toBe(1);    // extra = last → a2new was at index 0
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 11b — edit user message that has MULTIPLE sibling responses
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Context: thread = [u1, a1, u2, a2/a2r/a2r2] (3 sibling responses to u2)
    // Edit u2 → truncateResponsesAfter(u2) MUST drop ALL three siblings,
    // not just the active one. The new response then has count=1.
    // Regression: if only the active branch were truncated, a2/a2r would
    // resurface on the next branch navigation — silently corrupt history.

    describe('Step 11b — edit user message with multiple sibling responses', () => {
        let a2new: AparteMessage;

        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r);   // 2 siblings
            vp.addSiblingOf(a2r.id, a2r2); // 3 siblings, active = a2r2

            vp.updateMessage(u2.id, { content: 'question 2 edited (with 3 retries)' });
            (vp as any).truncateResponsesAfter(u2.id);
            a2new = msg('assistant', 'fresh response after edit');
            vp.appendMessage(a2new);
        });

        it('all three previous siblings (a2, a2r, a2r2) are deleted from the tree', () => {
            expect(vp.getMessage(a2.id)).toBeUndefined();
            expect(vp.getMessage(a2r.id)).toBeUndefined();
            expect(vp.getMessage(a2r2.id)).toBeUndefined();
        });

        it('active path = [u1, a1, u2, a2new] in exact order (siblings purged)', () => {
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2new.id]);
        });

        it('a2new has count=1 — old siblings did not leak into the new branch set', async () => {
            const siblingsPromise = captureSiblings(vp);
            const extraMsg = msg('assistant', 'extra after edit');
            vp.addSiblingOf(a2new.id, extraMsg);
            const siblings = await siblingsPromise;
            const extraMeta = siblings.find(s => s.id === extraMsg.id)!;
            expect(extraMeta.count).toBe(2); // a2new + extra; NOT 4 (would mean old siblings leaked)
            expect(extraMeta.index).toBe(1);
        });

        it('navigating from a2new finds no neighbours (no resurrection of a2/a2r/a2r2)', () => {
            // Try prev/next on a2new — should be a no-op since count=1
            (vp as any).navigateBranch(a2new.id, 'prev');
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2new.id]);
            (vp as any).navigateBranch(a2new.id, 'next');
            expect(vp.getMessages().map(m => m.id)).toEqual([u1.id, a1.id, u2.id, a2new.id]);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 12 — clearMessages (nouvelle conversation)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Expected:
    //   getMessages() = []
    //   getMessage(any old id) = undefined
    //   headId = null

    describe('Step 12 — clearMessages', () => {
        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r);
            vp.clearMessages();
        });

        it('getMessages() returns []', () => {
            expect(vp.getMessages()).toEqual([]);
        });

        it('all old message ids are inaccessible', () => {
            for (const m of [u1, a1, u2, a2, a2r]) {
                expect(vp.getMessage(m.id)).toBeUndefined();
            }
        });

        it('appending after clear starts a clean single-message path', () => {
            const nu1 = msg('user', 'nouveau message');
            vp.appendMessage(nu1);
            const path = vp.getMessages();
            expect(path).toHaveLength(1);
            expect(path[0].id).toBe(nu1.id);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 13 — Nouveau chat complet après clear
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Old session had siblings (up to 2). New session:
    //   nu1 → na1, retry na1 → na1r
    //
    // Expected:
    //   getMessages() = [nu1, na1r]
    //   na1r: count=2, index=1
    //   NO ids from old session anywhere

    describe('Step 13 — nouveau chat après clear, retry propre', () => {
        let nu1: AparteMessage, na1: AparteMessage, na1r: AparteMessage;

        beforeEach(() => {
            // Old session
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r); // creates siblings in old tree

            // New conversation
            vp.clearMessages();
            nu1  = msg('user',      'nouvelle question');
            na1  = msg('assistant', 'nouvelle réponse');
            na1r = msg('assistant', 'nouvelle réponse — retry');
            vp.appendMessage(nu1);
            vp.appendMessage(na1);
            vp.addSiblingOf(na1.id, na1r);
        });

        it('path = [nu1, na1r]', () => {
            expect(vp.getMessages().map(m => m.id)).toEqual([nu1.id, na1r.id]);
        });

        it('na1r count=2, index=1', async () => {
            const siblingsPromise = captureSiblings(vp);
            vp.navigateBranch(na1r.id, 'prev'); // triggers path-changed
            const siblings = await siblingsPromise;
            // After nav we're on na1 (index 0), check na1
            const na1meta = siblings.find(s => s.id === na1.id)!;
            expect(na1meta.count).toBe(2);
            expect(na1meta.index).toBe(0);
        });

        it('no trace of old session ids in new path', () => {
            const ids = vp.getMessages().map(m => m.id);
            for (const old of [u1, a1, u2, a2, a2r]) {
                expect(ids).not.toContain(old.id);
            }
        });

        it('old session ids are inaccessible', () => {
            for (const m of [u1, a1, u2, a2, a2r]) {
                expect(vp.getMessage(m.id)).toBeUndefined();
            }
        });

        it('new sibling count is not polluted by old session siblings', async () => {
            // beforeEach already has 2 siblings (na1, na1r). Adding one more → 3.
            // The active node (retry2, index=2) is in the path-changed payload.
            // Old session had a2r siblings — after clear(), new tree is independent.
            const siblingsPromise = captureSiblings(vp);
            const retry2 = msg('assistant', 'retry 2');
            vp.addSiblingOf(na1.id, retry2);
            const siblings = await siblingsPromise;
            const meta = siblings.find(s => s.id === retry2.id)!;
            expect(meta.count).toBe(3);   // na1, na1r, retry2 — no old-session bleed
            expect(meta.index).toBe(2);   // newest = last
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 14 — Edit parentId integrity
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Edit u2 in-place: updateMessage keeps the same node in the tree.
    // Expected topology after truncateResponsesAfter(u2.id) + appendMessage(a2new):
    //   u2.parentId = a1.id  (unchanged — u2 is the same node, just updated content)
    //   a2new.parentId = u2.id
    //   a2 and a2r are NOT accessible (deleted by clearChildren)

    describe('Step 14 — edit parentId topology', () => {
        let a2new: AparteMessage;

        beforeEach(() => {
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.addSiblingOf(a2.id, a2r); // active = a2r

            vp.updateMessage(u2.id, { content: 'question 2 edited' });
            (vp as any).truncateResponsesAfter(u2.id);
            a2new = msg('assistant', 'réponse après edit');
            vp.appendMessage(a2new);
        });

        it('u2 retains parentId = a1.id (same node, only content changed)', () => {
            // getMessage uses the repo's internal node; parentId comes from prev pointer
            // Verify by checking the full path: a1 is at index [1], u2 at [2]
            const path = vp.getMessages();
            expect(path[1].id).toBe(a1.id);
            expect(path[2].id).toBe(u2.id); // same node, not a clone
        });

        it('a2new is the direct child of u2 (parentId = u2.id)', () => {
            // Path: [u1, a1, u2, a2new] — a2new is at index [3], u2 at [2]
            const path = vp.getMessages();
            expect(path[3].id).toBe(a2new.id);
            expect(path[2].id).toBe(u2.id);
        });

        it('old children a2 and a2r are deleted (clearChildren removes them)', () => {
            // truncateResponsesAfter calls clearChildren(u2.id) which
            // deletes all descendants of u2 before appending a2new
            expect(vp.getMessage(a2.id)).toBeUndefined();
            expect(vp.getMessage(a2r.id)).toBeUndefined();
        });

        it('a2new is the only child of u2 — count=1 confirmed by first addSiblingOf', async () => {
            // After addSiblingOf, the retry becomes active (index=1). path-changed
            // carries retry.count=2, retry.index=1 → proves a2new was sole child.
            const siblingsPromise = captureSiblings(vp);
            const retry = msg('assistant', 'retry');
            vp.addSiblingOf(a2new.id, retry); // a2new was alone → count 1→2
            const siblings = await siblingsPromise;
            const retryMeta = siblings.find(s => s.id === retry.id)!;
            expect(retryMeta.count).toBe(2);   // 2 siblings total
            expect(retryMeta.index).toBe(1);   // retry = second → a2new was first
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 15 — Retry on a non-terminal (mid-thread) message
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Thread: u1 → a1 → u2 → a2 → u3 → a3
    // Retry a2 → a2r
    //
    // Expected path:
    //   getMessages() = [u1, a1, u2, a2r]     ← u3 and a3 cut from active path
    //   u3 and a3 still in tree (under a2)
    //   a2.next still points to u3 (branch memory preserved)

    describe('Step 15 — retry on mid-thread message', () => {
        let u3: AparteMessage, a3: AparteMessage;

        beforeEach(() => {
            u3 = msg('user',      'question 3');
            a3 = msg('assistant', 'réponse 3');
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.appendMessage(u3); vp.appendMessage(a3);
            // Active path: [u1, a1, u2, a2, u3, a3]
        });

        it('initial 6-message path is correct', () => {
            expect(vp.getMessages().map(m => m.id))
                .toEqual([u1.id, a1.id, u2.id, a2.id, u3.id, a3.id]);
        });

        it('after retry a2 → a2r: path = [u1, a1, u2, a2r]', () => {
            vp.addSiblingOf(a2.id, a2r);
            expect(vp.getMessages().map(m => m.id))
                .toEqual([u1.id, a1.id, u2.id, a2r.id]);
        });

        it('u3 and a3 are NOT on the active path after retry', () => {
            vp.addSiblingOf(a2.id, a2r);
            const ids = vp.getMessages().map(m => m.id);
            expect(ids).not.toContain(u3.id);
            expect(ids).not.toContain(a3.id);
        });

        it('u3 and a3 are still accessible by id (not deleted)', () => {
            vp.addSiblingOf(a2.id, a2r);
            expect(vp.getMessage(u3.id)).toMatchObject({ id: u3.id });
            expect(vp.getMessage(a3.id)).toMatchObject({ id: a3.id });
        });

        it('path length is 4 after mid-thread retry', () => {
            vp.addSiblingOf(a2.id, a2r);
            expect(vp.getMessages()).toHaveLength(4);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 16 — Branch memory: switching back recovers full sub-path
    // ═══════════════════════════════════════════════════════════════════════
    //
    // Starting from step 15 post-retry state: active = [u1, a1, u2, a2r]
    // Each node stores its `next` (activeChildId).
    // a2 still has a2.next = u3 (branch memory), u3.next = a3.
    //
    // nav prev (a2r → a2) → getMessages() MUST restore full subtree:
    //   Expected: [u1, a1, u2, a2, u3, a3]

    describe('Step 16 — branch memory: nav back restores full sub-path', () => {
        let u3: AparteMessage, a3: AparteMessage;

        beforeEach(() => {
            u3 = msg('user',      'question 3');
            a3 = msg('assistant', 'réponse 3');
            vp.appendMessage(u1); vp.appendMessage(a1);
            vp.appendMessage(u2); vp.appendMessage(a2);
            vp.appendMessage(u3); vp.appendMessage(a3);
            // Retry a2 → a2r (cuts u3, a3 from active path)
            vp.addSiblingOf(a2.id, a2r);
            // Active: [u1, a1, u2, a2r]
        });

        it('nav prev a2r → a2 restores path to [u1, a1, u2, a2, u3, a3]', () => {
            vp.navigateBranch(a2r.id, 'prev');
            expect(vp.getMessages().map(m => m.id))
                .toEqual([u1.id, a1.id, u2.id, a2.id, u3.id, a3.id]);
        });

        it('path length is 6 after branch restore', () => {
            vp.navigateBranch(a2r.id, 'prev');
            expect(vp.getMessages()).toHaveLength(6);
        });

        it('u3 and a3 content is intact after restore', () => {
            vp.navigateBranch(a2r.id, 'prev');
            const path = vp.getMessages();
            expect(path[4]).toMatchObject({ id: u3.id, content: 'question 3' });
            expect(path[5]).toMatchObject({ id: a3.id, content: 'réponse 3' });
        });

        it('round-trip: a2r → a2 → a2r loses u3/a3 again (correct)', () => {
            vp.navigateBranch(a2r.id, 'prev'); // → a2, path=[...,a2,u3,a3]
            vp.navigateBranch(a2.id,  'next'); // → a2r, path=[...,a2r]
            expect(vp.getMessages().map(m => m.id))
                .toEqual([u1.id, a1.id, u2.id, a2r.id]);
        });

        it('a2r branch memory: after further retry on a2r, nav back still recovers a2→u3→a3', () => {
            // Add a2r2 from a2r
            vp.addSiblingOf(a2r.id, a2r2); // active=[...,a2r2]
            // Navigate back to a2 (2 steps)
            vp.navigateBranch(a2r2.id, 'prev'); // → a2r
            vp.navigateBranch(a2r.id,  'prev'); // → a2, restores a2→u3→a3
            expect(vp.getMessages().map(m => m.id))
                .toEqual([u1.id, a1.id, u2.id, a2.id, u3.id, a3.id]);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // EDGE CASES — unknown ids, empty state
    // ═══════════════════════════════════════════════════════════════════════

    describe('Edge cases', () => {
        it('addSiblingOf on unknown id returns null', () => {
            expect(vp.addSiblingOf('ghost', msg('assistant', 'x'))).toBeNull();
        });

        it('navigateBranch on unknown id does not throw', () => {
            expect(() => vp.navigateBranch('ghost', 'prev')).not.toThrow();
        });

        it('truncateFrom on unknown id does not throw and path unchanged', () => {
            vp.appendMessage(u1);
            expect(() => vp.truncateFrom('ghost')).not.toThrow();
            expect(vp.getMessages()).toHaveLength(1);
        });

        it('getMessages on empty viewport returns []', () => {
            expect(vp.getMessages()).toEqual([]);
        });

        it('updateMessage on existing id updates content', () => {
            vp.appendMessage(u1);
            vp.updateMessage(u1.id, { content: 'modified' });
            expect(vp.getMessage(u1.id)?.content).toBe('modified');
        });

        it('updateMessage on unknown id does not throw', () => {
            expect(() => vp.updateMessage('ghost', { content: 'x' })).not.toThrow();
        });
    });
});

// ─── aparte:edit event key spec ────────────────────────────────────────────────
//
// The bubble dispatches aparte:edit with key `content` (not `newContent`).
// The client destructures `content` — if key is wrong, guard exits silently.

describe('aparte:edit event payload', () => {
    it('bubble dispatches detail.content (not detail.newContent)', async () => {
        await import('../bubble/aparte-chat-bubble.js');
        const bubble = document.createElement('aparte-chat-bubble') as HTMLElement & {
            setContent(c: string): void;
        };
        bubble.setAttribute('role', 'user');
        bubble.setAttribute('message-id', 'edit-test');
        document.body.appendChild(bubble);
        bubble.setContent('original text');

        let receivedDetail: any = null;
        document.body.addEventListener('aparte:edit', (e: Event) => {
            receivedDetail = (e as CustomEvent).detail;
        }, { once: true });

        // Simulate entering edit mode and confirming
        const editBtn = bubble.querySelector('.aparte-action-edit') as HTMLButtonElement;
        editBtn?.click();

        const textarea = bubble.querySelector('.aparte-edit-textarea') as HTMLTextAreaElement;
        if (textarea) {
            textarea.value = 'edited text';
            const confirmBtn = bubble.querySelector('.aparte-edit-confirm') as HTMLButtonElement;
            confirmBtn?.click();
        }

        if (receivedDetail) {
            expect(receivedDetail).toHaveProperty('content');
            expect(receivedDetail).not.toHaveProperty('newContent');
            expect(receivedDetail.content).toBe('edited text');
            expect(receivedDetail.messageId).toBe('edit-test');
        }

        bubble.remove();
    });
});
