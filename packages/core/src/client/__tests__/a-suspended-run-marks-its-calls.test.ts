// @vitest-environment jsdom
/**
 * A suspended run marks its pending calls, and a reload keeps them.
 *
 * A server loop suspends on a call the page must answer. The adapter stamps each pending
 * call's segment with `deferred` (why it waits, and the server's ticket) so the paused
 * call lives in the conversation the app saves; the message completes, because the RUN
 * is over while the TURN goes on through the one that resumes it. On reload, a call that
 * carries a ticket stays waiting — it can still be answered — where one without stops.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import { adoptSegment, adoptMessageSegments } from '../../utils/segments.js';
import type { AparteSegment, AparteMessage } from '../../types/index.js';

function target() {
    const added: AparteSegment[] = [];
    const updates: [string, Partial<AparteSegment>][] = [];
    const messageUpdates: Partial<AparteMessage>[] = [];
    return {
        added, updates, messageUpdates,
        addSegment: (s: AparteSegment) => { added.push(s); },
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: (_id: string, u: Partial<AparteMessage>) => { messageUpdates.push(u); },
        dispatchEvent: () => true,
    };
}

afterEach(() => aparteGlobalConfig.unregisterToolRenderer('ask_user'));

describe('the adapter on run-suspended', () => {
    it('stamps each pending call with why it waits and the ticket, then completes the message', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } });
        emit({ type: 'tool-awaiting-approval', toolCallId: 'c1', name: 'delete_file', input: { path: 'a' } });
        emit({ type: 'run-suspended', pending: [{ toolCallId: 'c1', name: 'delete_file', input: { path: 'a' }, reason: 'approval' }], ticket: 'T' } as never);

        expect(t.updates.at(-1)).toEqual(['tool-c1', { deferred: { reason: 'approval', ticket: 'T' } }]);
        expect(t.messageUpdates.at(-1)).toEqual({ status: 'completed' });
    });

    it('adds a pending call whose renderer drew nothing, so a reload can find it', () => {
        // A tool renderer that renders '' (ask_user with `receipt: false`) left the call
        // out of the message at `tool-start` — nowhere to write `deferred` on.
        aparteGlobalConfig.registerToolRenderer('ask_user', { render: () => '' });
        const t = target();
        const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'tool-start', toolCallId: 'q1', name: 'ask_user', input: { question: 'Which?' } });
        expect(t.added).toHaveLength(0);
        emit({ type: 'run-suspended', pending: [{ toolCallId: 'q1', name: 'ask_user', input: { question: 'Which?' }, reason: 'external' }], ticket: 'T' } as never);

        expect(t.added).toEqual([{
            id: 'tool-q1', type: 'tool_call', status: 'pending',
            toolCall: { id: 'q1', name: 'ask_user', input: { question: 'Which?' } },
            deferred: { reason: 'external', ticket: 'T' },
        }]);
    });

    it('marks a call a RESUME pauses again — its row is from the run that paused first', () => {
        // A resume replays no `tool-start`, so this run's adapter had neither drawn nor
        // added the call, and the second pause was written nowhere: the row kept no ticket.
        const t = target();
        const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'tool-awaiting-approval', toolCallId: 'c2', name: 'delete_file', input: {} });
        emit({ type: 'run-suspended', pending: [{ toolCallId: 'c2', name: 'delete_file', input: {}, reason: 'approval' }], ticket: 'T2' } as never);
        expect(t.updates).toContainEqual(['tool-c2', { deferred: { reason: 'approval', ticket: 'T2' } }]);
    });
});

describe('adoptSegment on reload', () => {
    const call = (extra: object) => ({
        id: 'tool-c1', type: 'tool_call', toolCall: { id: 'c1', name: 'delete_file', input: {} }, ...extra,
    }) as AparteSegment;

    it('keeps a waiting call that carries a ticket: it can still be answered', () => {
        const adopted = adoptSegment([], call({ status: 'awaiting-approval', deferred: { reason: 'approval', ticket: 'T' } }), 'm1');
        expect(adopted).toMatchObject({ status: 'awaiting-approval', deferred: { ticket: 'T' } });
    });

    it('stops a waiting call without one, as before: nothing can answer it', () => {
        expect(adoptSegment([], call({ status: 'awaiting-approval' }), 'm1')).toMatchObject({ status: 'aborted' });
    });

    it('stops a call saved while it ran, and keeps a queued one that carries a ticket', () => {
        // Nothing runs a loaded call: a row saved mid-run spun for good after a reload.
        expect(adoptSegment([], call({ status: 'pending' }), 'm1')).toMatchObject({ status: 'aborted' });
        expect(adoptSegment([], call({ status: 'pending', deferred: { reason: 'queued', ticket: 'T' } }), 'm1'))
            .toMatchObject({ status: 'pending', deferred: { ticket: 'T' } });
    });

    it('leaves the running calls of a reply handed over WHILE it streams alone', () => {
        // A host driving its own loop records the reply in flight: its call is running.
        const live = adoptMessageSegments({ id: 'm1', status: 'streaming', segments: [call({ status: 'pending' })] });
        expect(live.segments![0]).toMatchObject({ status: 'pending' });
        const saved = adoptMessageSegments({ id: 'm1', status: 'completed', segments: [call({ status: 'pending' })] });
        expect(saved.segments![0]).toMatchObject({ status: 'aborted' });
    });
});
