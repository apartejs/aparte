// @vitest-environment jsdom
/**
 * A compaction keeps turns; it must keep their attachments too.
 *
 * `clearAll()` on a real `<aparte-chat-viewport>` revokes every message's object
 * URLs before dropping them — correct for a reset, wrong here, because a compaction
 * empties the transcript only to put the kept turns straight back. Every image and
 * file chip on a surviving turn came back dead.
 *
 * The suite in `compaction.test.ts` could not see it: its `makeTarget()` stub is a
 * plain array with a `clearAll` that only empties it. So this file drives the real
 * element, which is what the plugin actually meets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, type AparteMessage } from '@aparte/core';
import { setupCompaction, type CompactionTarget } from '../compaction.js';

const DROPPED = 'blob:aparte-dropped';
const KEPT = 'blob:aparte-kept';

type Viewport = HTMLElement & CompactionTarget;

const withFile = (m: AparteMessage, url: string): AparteMessage => ({
    ...m,
    attachments: [{ id: `att-${m.id}`, name: 'shot.png', type: 'image/png', size: 10, url }],
});

const exchange = (n: number, text: string): AparteMessage[] => [
    { id: `u${n}`, role: 'user', content: `${text} question ${n}`, timestamp: n * 2, status: 'completed' },
    { id: `a${n}`, role: 'assistant', content: `${text} answer ${n}`, timestamp: n * 2 + 1, status: 'completed' },
];

async function mountViewport(messages: AparteMessage[]): Promise<Viewport> {
    const vp = document.createElement('aparte-chat-viewport') as Viewport;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    for (const m of messages) vp.appendMessage(m);
    return vp;
}

describe('a compaction and the attachments of the turns it keeps', () => {
    let revoked: string[];
    let original: typeof URL.revokeObjectURL;

    beforeEach(() => {
        revoked = [];
        original = URL.revokeObjectURL;
        URL.revokeObjectURL = (url: string) => { revoked.push(url); };
        document.body.innerHTML = '';
    });

    afterEach(() => {
        URL.revokeObjectURL = original;
        document.body.innerHTML = '';
    });

    it('keeps the object URL of a kept turn, and releases the one it summarised away', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        old[0] = withFile(old[0]!, DROPPED);
        recent[0] = withFile(recent[0]!, KEPT);
        const vp = await mountViewport([...old, ...recent]);

        const outcome = await setupCompaction({
            selector: (m) => ({ keep: m.filter((x) => x.id.endsWith('2')), drop: m.filter((x) => x.id.endsWith('1')) }),
            summarize: async () => 'S',
            resolveTarget: () => vp,
            listen: false,
        }, new AparteConfig()).compact();

        expect(outcome).toMatchObject({ ok: true, skipped: false, kept: 2, dropped: 2 });
        expect(revoked, 'the summarised turn is really gone').toContain(DROPPED);
        expect(revoked, 'the kept turn is still on screen').not.toContain(KEPT);

        const back = vp.getMessages();
        expect(back.map((m) => m.id).slice(1)).toEqual(['u2', 'a2']);
        expect(back[1]!.attachments?.[0]?.url, 'and its image still resolves').toBe(KEPT);
    });

    it('a turn that arrived while the summary was written keeps its attachment too', async () => {
        const old = exchange(1, 'old');
        old[0] = withFile(old[0]!, DROPPED);
        const vp = await mountViewport(old);
        let release!: (s: string) => void;
        const summarize = () => new Promise<string>((r) => { release = r; });

        const running = setupCompaction({
            selector: (m) => ({ keep: [], drop: m }),
            summarize,
            resolveTarget: () => vp,
            listen: false,
        }, new AparteConfig()).compact();

        await vi.waitFor(() => expect(release).toBeDefined());
        const late = withFile({ id: 'u9', role: 'user', content: 'sent meanwhile', timestamp: 30, status: 'completed' }, KEPT);
        vp.appendMessage(late);
        release('S');
        await running;

        expect(revoked).toContain(DROPPED);
        expect(revoked, 'what arrived is on screen, not dropped').not.toContain(KEPT);
        expect(vp.getMessages().at(-1)!.attachments?.[0]?.url).toBe(KEPT);
    });
});
