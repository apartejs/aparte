// @vitest-environment jsdom
/**
 * A sub-agent's question is announced, once, and says whose it is.
 *
 * Its call is not on the reply, so the reply never marks a row "awaiting approval" for it —
 * but somebody must still be asked: an app that presents the decision itself listens for
 * `aparte-tool-approval-request`. The adapter's router dispatches it, with the `agentId`, and
 * the reply's own handling never sees the event, so it cannot be announced twice.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { AparteConfig } from '../../config/index.js';
import type { AparteSegment } from '../../types/index.js';
import type { AparteToolApprovalRequestDetail } from '../../types/tools.js';

function chat() {
    const el = document.createElement('div');
    const updates: [string, Partial<AparteSegment>][] = [];
    const asked: AparteToolApprovalRequestDetail[] = [];
    Object.assign(el, {
        addSegment: () => {},
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: () => {},
    });
    el.addEventListener('aparte-tool-approval-request', (e) => asked.push((e as CustomEvent).detail));
    document.body.appendChild(el);
    return { el, updates, asked };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function askFromAChild(config: AparteConfig) {
    const c = chat();
    const emit = createStreamAdapter({ target: c.el as never, config, messageId: 'm1', targetId: 'chat-1' });
    emit({ type: 'run-start' });
    emit({ type: 'tool-start', toolCallId: 'c1', name: 'delegate', input: {} });
    emit({ type: 'agent-start', agentId: 'a1', toolCallId: 'c1' });
    emit({ type: 'tool-start', toolCallId: 'c2', name: 'delete_file', input: { path: 'a' }, agentId: 'a1' });
    emit({ type: 'tool-awaiting-approval', toolCallId: 'c2', name: 'delete_file', input: { path: 'a' }, agentId: 'a1' });
    return c;
}

describe('a sub-agent\'s question', () => {
    it('is announced once, with its agentId and the chat it belongs to', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { asked, updates } = askFromAChild(new AparteConfig());
        expect(asked).toEqual([{ targetId: 'chat-1', toolCallId: 'c2', toolName: 'delete_file', input: { path: 'a' }, agentId: 'a1' }]);
        // No row of the reply is marked for it: the call is not the reply's.
        expect(updates.filter(([id]) => id === 'tool-c2')).toEqual([]);
    });

    it('is announced once when an observer is listening too', () => {
        const config = new AparteConfig();
        const seen: string[] = [];
        config.observeRunEvents((e) => { seen.push(e.type); });
        const { asked } = askFromAChild(config);
        expect(asked).toHaveLength(1);
        expect(asked[0]!.agentId).toBe('a1');
        expect(seen).toContain('tool-awaiting-approval');
    });

    it('the reply\'s own question carries no agentId, as before', () => {
        const c = chat();
        const emit = createStreamAdapter({ target: c.el as never, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'delete_file', input: {} });
        emit({ type: 'tool-awaiting-approval', toolCallId: 'c1', name: 'delete_file', input: {} });
        expect(c.asked).toHaveLength(1);
        expect('agentId' in c.asked[0]!).toBe(false);
        expect(c.updates).toContainEqual(['tool-c1', { status: 'awaiting-approval' }]);
    });
});
