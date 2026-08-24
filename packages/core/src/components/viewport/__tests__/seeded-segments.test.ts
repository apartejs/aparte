// @vitest-environment jsdom
/**
 * A message that ARRIVES with its segments, rather than growing them.
 *
 * `appendMessage({ …, segments: [...] })` is a real path — a restored conversation,
 * a prefix the app injects, `setMessages()` — and it went around two fixes.
 *
 * 1. **The doubling.** `appendToSegment` wrote every chunk twice on this path:
 *    "ThatThat  deletesdeletes  aa  filefile". `populateBubbleFromMessage` handed
 *    `message.segments` — the repository's own array — to `setSegments`, which
 *    stored it by reference while `getSegments` had always copied on the way out.
 *    One array, two writers: the viewport replaced the slot with
 *    `{...segment, content: old + chunk}`, then the bubble looked the segment up in
 *    what it thought was its own list, found that replacement and appended again.
 *    This is the same failure 3b026bb fixed for `addSegment`, whose regression
 *    tests all drive `addSegment` — so this path stayed broken for the same reason
 *    the changelog gives for why nothing caught it the first time.
 *
 * 2. **The missing stamps.** `stampSegmentOnInsert` was reachable only through
 *    `addSegment`, so segments arriving this way had no `messageId`, no `index` and
 *    no `startedAt` — the fields shipped in 0.9.0 existed on one path and not the
 *    other, silently.
 *
 * Both are asserted here on the model AND on the bubble, because a fix that lands
 * on one view and not the other is what produced the bug in the first place.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

interface ViewportEl extends HTMLElement {
    appendMessage(m: AparteMessage): void;
    appendToSegment(messageId: string, segmentId: string, chunk: string): void;
    getMessage(id: string): AparteMessage | undefined;
    setMessages(messages: AparteMessage[]): void;
}

interface BubbleEl extends HTMLElement {
    getSegments(): AparteSegment[];
}

const seg = (id: string, extra: Partial<AparteSegment> = {}): AparteSegment =>
    ({ id, type: 'text', content: '', isStreaming: true, ...extra }) as AparteSegment;

/** The chunks of "That deletes a file", split the way a token stream arrives. */
const CHUNKS = ['That', ' ', 'deletes', ' ', 'a', ' ', 'file'];

describe('a message that arrives with its segments', () => {
    let vp: ViewportEl;

    beforeEach(() => {
        vp = document.createElement('aparte-chat-viewport') as ViewportEl;
        document.body.appendChild(vp);
    });
    afterEach(() => {
        vp.remove();
        document.body.innerHTML = '';
    });

    const modelSegments = (id: string) => vp.getMessage(id)?.segments ?? [];
    const bubbleSegments = () =>
        (vp.querySelector('aparte-chat-bubble') as BubbleEl | null)?.getSegments() ?? [];
    const content = (s: AparteSegment | undefined) => (s as { content?: string } | undefined)?.content;

    it('streams into a seeded segment exactly once — in the model and in the bubble', () => {
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1, segments: [seg('s1')] });

        for (const c of CHUNKS) vp.appendToSegment('m1', 's1', c);

        // Asserted as EXACT text, not with `toContain`: a substring assertion is
        // what let the browser suite stay green through the first version of this
        // bug, and "ThatThat deletes…" contains "That deletes…".
        expect(content(modelSegments('m1')[0])).toBe('That deletes a file');
        expect(content(bubbleSegments()[0])).toBe('That deletes a file');
    });

    it('does not put the caller’s array in the repository', () => {
        const mine: AparteSegment[] = [seg('s1')];
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1, segments: mine });

        expect(modelSegments('m1')).not.toBe(mine);
        // The other half of the fix — that the BUBBLE holds an array of its own —
        // cannot be asserted from out here: `getSegments()` returns `[...]`, so an
        // identity check on its result passes whether or not the bubble is sharing.
        // The observable proof is the first test in this file: two writers on one
        // array double the text, and the text is exact.
    });

    it('does not retain the caller’s array — mutating it afterwards changes nothing', () => {
        const mine: AparteSegment[] = [seg('s1')];
        vp.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1, segments: mine });

        mine.push(seg('sneaky'));
        (mine[0] as { content: string }).content = 'rewritten by the caller';

        expect(modelSegments('m1')).toHaveLength(1);
        expect(content(modelSegments('m1')[0])).toBe('');
    });

    it('stamps messageId, index and startedAt — the fields addSegment already set', () => {
        vp.appendMessage({
            id: 'm1', role: 'assistant', content: '', timestamp: 1,
            segments: [seg('s1'), seg('s2'), seg('s3')],
        });

        const segments = modelSegments('m1');
        expect(segments.map((s) => s.messageId)).toEqual(['m1', 'm1', 'm1']);
        // Positions, not merely "defined": a list where two segments both claim 0
        // passes a per-segment `toBeDefined` and is the failure that matters.
        expect(segments.map((s) => s.index)).toEqual([0, 1, 2]);
        expect(segments.every((s) => typeof s.startedAt === 'number')).toBe(true);
    });

    it('never overwrites numbers a stored conversation already carries', () => {
        // What a reload looks like: the segment was stamped when it was first
        // created, persisted with those values, and handed back later.
        vp.appendMessage({
            id: 'm1', role: 'assistant', content: '', timestamp: 1,
            segments: [seg('s1', { index: 7, startedAt: 1_600_000_000_000, messageId: 'from-storage' })],
        });

        const [s] = modelSegments('m1');
        expect(s.index).toBe(7);
        expect(s.startedAt).toBe(1_600_000_000_000);
        expect(s.messageId).toBe('from-storage');
    });

    it('holds through setMessages, which is how a conversation is restored', () => {
        vp.setMessages([
            { id: 'u1', role: 'user', content: 'hi', timestamp: 1 },
            { id: 'a1', role: 'assistant', content: '', timestamp: 2, segments: [seg('s1')] },
        ]);

        for (const c of CHUNKS) vp.appendToSegment('a1', 's1', c);

        expect(content(modelSegments('a1')[0])).toBe('That deletes a file');
        expect(modelSegments('a1')[0]?.index).toBe(0);
        expect(modelSegments('a1')[0]?.messageId).toBe('a1');
    });
});
