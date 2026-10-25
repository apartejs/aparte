// @vitest-environment jsdom
/**
 * A compaction removes nothing, so no attachment is released.
 *
 * It used to empty the transcript and put the kept turns back, and `clearAll()` on a real
 * `<aparte-chat-viewport>` revokes every message's object URLs on the way out: the plugin
 * had to pass `revokeAttachments: false` and then revoke the summarised turns' URLs by
 * hand. Now the summarised turns stay on the screen — a checkpoint is one field written on
 * the first message kept — so their images and files must stay alive too, which is what
 * lets "Show the original" and Restore work.
 *
 * The suite in `compaction.test.ts` cannot see it: its `makeTarget()` stub is a plain
 * array. So this file drives the real element, which is what the plugin actually meets.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, type AparteMessage } from '@aparte/core';
import { setupCompaction, type CompactionTarget } from '../compaction.js';

const SUMMARISED = 'blob:aparte-summarised';
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
    for (const m of messages) vp.appendMessage!(m);
    return vp;
}

describe('a compaction and the attachments of the turns it summarises', () => {
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

    it('releases nothing: the summarised turn and the kept one both keep their object URL', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        old[0] = withFile(old[0]!, SUMMARISED);
        recent[0] = withFile(recent[0]!, KEPT);
        const vp = await mountViewport([...old, ...recent]);

        const outcome = await setupCompaction({
            selector: (m) => ({ keep: m.filter((x) => x.id.endsWith('2')), drop: m.filter((x) => x.id.endsWith('1')) }),
            summarize: async () => 'S',
            resolveTarget: () => vp,
            listen: false,
        }, new AparteConfig()).compact();

        expect(outcome).toMatchObject({ ok: true, skipped: false, kept: 2, dropped: 2, messageId: 'u2' });
        expect(revoked, 'the summarised turn is still on screen, so its image still has to resolve').toEqual([]);

        const back = vp.getMessages();
        expect(back.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
        expect(back[0]!.attachments?.[0]?.url).toBe(SUMMARISED);
        expect(back[2]!.attachments?.[0]?.url).toBe(KEPT);
    });

    it('writes the checkpoint through the viewport, onto the first message kept', async () => {
        const old = exchange(1, 'old');
        const recent = exchange(2, 'recent');
        const vp = await mountViewport([...old, ...recent]);

        await setupCompaction({
            selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }),
            summarize: async () => 'S',
            resolveTarget: () => vp,
            listen: false,
        }, new AparteConfig()).compact();

        const back = vp.getMessages();
        expect(back.filter((m) => m.contextSummary).map((m) => m.id)).toEqual(['u2']);
        expect(back[2]!.contextSummary).toMatchObject({ count: 2 });
        expect(back[2]!.contextSummary!.summary).toMatch(/^S/);
        expect(back[2]!.content, 'the message itself is untouched').toBe('recent question 2');
    });

    it('a turn that arrived while the summary was written keeps its attachment and its place', async () => {
        const old = exchange(1, 'old');
        old[0] = withFile(old[0]!, SUMMARISED);
        const vp = await mountViewport([...old, ...exchange(2, 'recent')]);
        let release!: (s: string) => void;
        const summarize = () => new Promise<string>((r) => { release = r; });

        const running = setupCompaction({
            selector: (m) => ({ keep: m.slice(2), drop: m.slice(0, 2) }),
            summarize,
            resolveTarget: () => vp,
            listen: false,
        }, new AparteConfig()).compact();

        await vi.waitFor(() => expect(release).toBeDefined());
        const late = withFile({ id: 'u9', role: 'user', content: 'sent meanwhile', timestamp: 30, status: 'completed' }, KEPT);
        vp.appendMessage!(late);
        release('S');
        await running;

        expect(revoked).toEqual([]);
        expect(vp.getMessages().at(-1)!.attachments?.[0]?.url).toBe(KEPT);
    });
});
