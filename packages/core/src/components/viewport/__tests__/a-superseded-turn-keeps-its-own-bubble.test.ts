// @vitest-environment jsdom
/**
 * A turn that left the active path does not write into the bubble that replaced it.
 *
 * The 1-argument streaming convention (`addSegment(segment)`) means "the message being
 * streamed", and the viewport resolved that through a scan of `getMessages()` — the
 * ACTIVE PATH. A retry or an edit on an earlier bubble calls `addSiblingOf`, which
 * switches the active branch to the new pending reply: the still-streaming turn leaves
 * the path entirely, the scan finds nothing, and every remaining delta of the old turn
 * lands on the NEW message. Silently wrong content in the transcript.
 *
 * The rule is the one the docblock of `_activeMessageId` already states — refuse rather
 * than route, because losing the tail is visible and writing it onto someone else's
 * message is not. What changes is the corpus it is decided on: the whole tree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-chat-viewport.js';
import '../../bubble/aparte-chat-bubble.js';
import type { AparteMessage, AparteSegment } from '../../../types/index.js';

type ViewportEl = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    updateMessage(id: string, u: Partial<AparteMessage>): void;
    addSegment(s: AparteSegment): void;
    addSegment(id: string, s: AparteSegment): void;
    addSiblingOf(existingId: string, m: AparteMessage): string | null;
    getMessage(id: string): AparteMessage | undefined;
};

const msg = (id: string, role: AparteMessage['role'], content = ''): AparteMessage =>
    ({ id, role, content, timestamp: 1 });
const seg = (id: string, content: string): AparteSegment =>
    ({ id, type: 'text', content } as AparteSegment);

async function mount(): Promise<ViewportEl> {
    const vp = document.createElement('aparte-chat-viewport') as never as ViewportEl;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    return vp;
}

const types = (vp: ViewportEl, id: string): string[] =>
    (vp.getMessage(id)?.segments ?? []).map((s) => s.id);

describe('a turn superseded by a retry', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('does not write its remaining segments into the new bubble', async () => {
        const vp = await mount();
        vp.appendMessage(msg('u1', 'user', 'first'));
        vp.appendMessage(msg('a1', 'assistant', 'one'));
        vp.appendMessage(msg('u2', 'user', 'second'));
        vp.appendMessage(msg('a2', 'assistant'));
        vp.updateMessage('a2', { status: 'streaming' });
        vp.addSegment(seg('s1', 'still writing'));
        expect(types(vp, 'a2')).toEqual(['s1']);

        // A retry on the FIRST reply: the new pending sibling becomes the head and
        // `a2` leaves the active path while it is still streaming.
        vp.addSiblingOf('a1', msg('b1', 'assistant'));
        vp.addSegment(seg('s2', 'the rest of the old turn'));

        expect(types(vp, 'b1'), 'the new turn holds nothing of the old one').toEqual([]);
        expect(types(vp, 'a2'), 'and the refused delta is not routed anywhere else').toEqual(['s1']);
    });

    it('still accepts the 1-argument convention when the head is the one streaming', async () => {
        const vp = await mount();
        vp.appendMessage(msg('u1', 'user', 'first'));
        vp.appendMessage(msg('a1', 'assistant'));
        vp.updateMessage('a1', { status: 'streaming' });
        vp.addSegment(seg('s1', 'hello'));
        expect(types(vp, 'a1')).toEqual(['s1']);
    });
});
