// @vitest-environment jsdom
/**
 * A paused reply resumes in a NEW run, and the client builds a new stream adapter for it. An
 * agent that carries an activity's id across the pause (a TanStack AI router's plan, through
 * the AG-UI runner's ticket) sends it again on the resumed run: that is the activity the paused
 * run placed, going on — its segment is updated in place, never placed a second time.
 *
 * The adapter remembers what it placed only for its own run, so it reads the reply it writes
 * into: two adapters on one message, through each target core ships.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStreamAdapter, type StreamAdapterTarget } from '../stream-adapter.js';
import { AparteConfig } from '../../config/aparte-config.js';
import { AparteChatHost } from '../../host/aparte-chat-host.js';
import { createSegmentList } from '../../utils/segment-list.js';
import type { AparteMessage, AparteSegment } from '../../types/index.js';
import '../../components/viewport/aparte-chat-viewport.js';

const plan = (status: string) => ({ steps: [{ title: 'lister', status: 'done' }, { title: 'cleaner', status }] });

/** The paused run, then the resumed one: each its own adapter, on the same reply. */
function pauseThenResume(target: StreamAdapterTarget, messageId: string) {
    const config = new AparteConfig();
    const paused = createStreamAdapter({ target, config, messageId, observe: false });
    paused({ type: 'run-start' });
    paused({ type: 'turn-start' });
    paused({ type: 'activity', id: 'router-plan:r1', activityType: 'plan', content: plan('blocked') });
    paused({ type: 'run-suspended', pending: [] });
    const resumed = createStreamAdapter({ target, config, messageId, observe: false });
    resumed({ type: 'run-start' });
    resumed({ type: 'turn-start' });
    resumed({ type: 'activity', id: 'router-plan:r1', activityType: 'plan', content: plan('in-progress') });
    resumed({ type: 'activity', id: 'router-plan:r1', activityType: 'plan', content: plan('done') });
    resumed({ type: 'run-done' });
}

const activities = (segments: readonly AparteSegment[] | undefined) => (segments ?? []).filter((s) => s.type === 'activity');

afterEach(() => { document.body.innerHTML = ''; });

describe('a resumed run updates the activity the paused run placed', () => {
    it('in a segment list (a sub-agent’s conversation)', () => {
        const list = createSegmentList({ messageId: 'm1' });
        pauseThenResume(list, 'm1');
        expect(activities(list.segments)).toEqual([
            expect.objectContaining({ id: 'activity-router-plan:r1', content: plan('done') }),
        ]);
    });

    it('in a chat’s viewport', () => {
        const viewport = document.createElement('aparte-chat-viewport') as unknown as HTMLElement & StreamAdapterTarget & {
            appendMessage(m: object): void;
            getMessage(id: string): { segments?: AparteSegment[] } | undefined;
        };
        document.body.appendChild(viewport);
        viewport.appendMessage({ id: 'm1', role: 'assistant', content: '', status: 'streaming' });
        pauseThenResume(viewport, 'm1');
        expect(activities(viewport.getMessage('m1')?.segments)).toEqual([
            expect.objectContaining({ id: 'activity-router-plan:r1', content: plan('done') }),
        ]);
    });

    it('in a wrapper’s host (the root a framework’s chat hands the client)', async () => {
        const root = document.createElement('div');
        root.setAttribute('data-aparte-chat', '');
        root.id = 'h1';
        const viewport = document.createElement('aparte-chat-viewport');
        viewport.setAttribute('framework-managed', '');
        root.appendChild(viewport);
        document.body.appendChild(root);
        await vi.waitFor(() => expect(typeof (viewport as unknown as { exportTree?: unknown }).exportTree).toBe('function'));
        let messages: AparteMessage[] = [];
        const host = new AparteChatHost({
            hostId: 'h1', host: root, viewport,
            getMessages: () => messages,
            setMessages: (m) => { messages = m; },
            afterRender: (cb) => cb(),
        }, { config: new AparteConfig() });
        const teardown = host.bind();
        host.appendMessage({ id: 'm1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
        pauseThenResume(root as unknown as StreamAdapterTarget, 'm1');
        expect(activities(messages.find((m) => m.id === 'm1')?.segments)).toEqual([
            expect.objectContaining({ id: 'activity-router-plan:r1', content: plan('done') }),
        ]);
        teardown();
    });

    it('leaves another reply’s activity of the same id alone: only the reply written into counts', () => {
        const other = createSegmentList({ messageId: 'm0' });
        const config = new AparteConfig();
        createStreamAdapter({ target: other, config, messageId: 'm0', observe: false })({ type: 'activity', id: 'p', activityType: 'plan', content: 1 });
        const list = createSegmentList({ messageId: 'm1' });
        createStreamAdapter({ target: list, config, messageId: 'm1', observe: false })({ type: 'activity', id: 'p', activityType: 'plan', content: 2 });
        expect(activities(list.segments)).toHaveLength(1);
        expect(activities(other.segments)).toEqual([expect.objectContaining({ content: 1 })]);
    });
});
