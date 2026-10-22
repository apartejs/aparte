// @vitest-environment jsdom
/**
 * A reasoning block streamed on its own channel can arrive, and stay, open.
 *
 * The adapter created the segment with `collapsed: true` and folded it again when the answer
 * began, and a field the producer sets beats `setSegmentDefaults` — so an app that asked for
 * open reasoning (`setSegmentDefaults('thinking', { collapsed: false })`) got it only for a
 * `<think>` block in the text, never for a provider's reasoning channel.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig, AparteConfig } from '../../config/index.js';
import { attachConfig } from '../../config/config-context.js';
import type { AparteSegment } from '../../types/index.js';

function target() {
    const added: AparteSegment[] = [];
    const updates: [string, Partial<AparteSegment>][] = [];
    return {
        added, updates,
        addSegment: (s: AparteSegment) => { added.push(s); },
        updateSegment: (id: string, u: Partial<AparteSegment>) => { updates.push([id, u]); },
        updateMessage: () => {},
        dispatchEvent: () => true,
    };
}

function stream(t: ReturnType<typeof target>): void {
    const emit = createStreamAdapter({ target: t, config: aparteGlobalConfig, messageId: 'm1' });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    emit({ type: 'thinking-delta', delta: 'Let me see.' });
    emit({ type: 'text-delta', delta: 'The answer.' });
}

afterEach(() => aparteGlobalConfig.clearSegmentDefaults('thinking'));

describe('a streamed reasoning block', () => {
    it('carries no collapsed of its own, so the app default reaches it', () => {
        const t = target();
        stream(t);
        expect(t.added[0]).toMatchObject({ type: 'thinking' });
        expect('collapsed' in t.added[0]!).toBe(false);
    });

    it('stays open when the answer begins, if the app keeps reasoning open', () => {
        aparteGlobalConfig.setSegmentDefaults('thinking', { collapsed: false });
        const t = target();
        stream(t);
        const id = t.added[0]!.id;
        expect(t.updates.filter(([sid, u]) => sid === id && 'collapsed' in u)).toEqual([]);
    });

    it('folds when the answer begins, by default', () => {
        const t = target();
        stream(t);
        expect(t.updates).toContainEqual([t.added[0]!.id, { collapsed: true, isStreaming: false }]);
    });

    it('reads the defaults of the chat, not of the client, for a chat with a config of its own', () => {
        // A client on the global config answers a chat with its own; the block was opened by
        // the chat's defaults on insert and must not be folded by the client's.
        const own = new AparteConfig();
        own.setSegmentDefaults('thinking', { collapsed: false });
        const host = document.createElement('div');
        document.body.appendChild(host);
        attachConfig(host, own);
        const t = Object.assign(host, target());
        const emit = createStreamAdapter({ target: t as never, config: aparteGlobalConfig, messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'turn-start' });
        emit({ type: 'thinking-delta', delta: 'Let me see.' });
        emit({ type: 'text-delta', delta: 'The answer.' });
        expect(t.updates.filter(([, u]) => 'collapsed' in u)).toEqual([]);
        document.body.innerHTML = '';
    });
});
