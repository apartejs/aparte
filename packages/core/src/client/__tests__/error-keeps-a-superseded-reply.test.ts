/**
 * The append-not-replace rule has to hold for a message that has left the ACTIVE PATH.
 *
 * `_handleLifecycleError` implemented it with `getMessages()`, which returns only the
 * currently active path — so it held for the reply being streamed and silently became a
 * full replace for any message that had left it. A retry or an edit on an earlier bubble
 * does precisely that to a reply still in flight: the reply stays in the tree, drops off
 * the path, `getMessages().find(...)` then finds nothing, and `updateMessage` — which
 * resolves ids tree-wide — overwrites every token it had actually streamed with a single
 * error segment.
 *
 * Both halves were individually correct, which is why nothing caught it. Found by a cold
 * audit; deterministic on `AparteBackendTransport`, whose parser turns a cut connection
 * into a thrown error rather than a quiet close.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config.js';
import { AparteClient } from '../aparte-client.js';
import type { AparteMessage, AparteSegment, AparteStreamEvent } from '../../types/index.js';

/** Streams a little, then fails — the shape a provider really has. */
function failsAfterStreaming(id = 'mock') {
    return {
        id,
        getMetadata: () => ({ id, name: id }),
        getModels: () => [{ id: 'm', name: 'M', capabilities: ['streaming'] }],
        chat: async () =>
            new ReadableStream<AparteStreamEvent>({
                start(c) {
                    c.enqueue({ type: 'text', delta: 'the real answer' } as AparteStreamEvent);
                    c.enqueue({ type: 'error', message: 'connection cut' } as AparteStreamEvent);
                    c.close();
                },
            }),
    } as never;
}

/**
 * A target whose two getters DISAGREE, which is the whole point: `getMessages()` is the
 * active path and `getMessage()` is the tree. A real viewport behaves exactly this way
 * once `addSiblingOf` has moved a reply off the path.
 */
function targetWithSupersededReply(): HTMLElement & { updates: Partial<AparteMessage>[] } {
    const el = document.createElement('div') as never as HTMLElement & {
        updates: Partial<AparteMessage>[];
        tree: Map<string, AparteMessage>;
    };
    el.id = 'chat';
    el.updates = [];
    el.tree = new Map();

    Object.assign(el, {
        appendMessage(message: AparteMessage) {
            el.tree.set(message.id, { ...message, segments: message.segments ?? [] });
        },
        updateMessage(id: string, updates: Partial<AparteMessage>) {
            el.updates.push({ id, ...updates } as Partial<AparteMessage>);
            const existing = el.tree.get(id);
            if (existing) Object.assign(existing, updates);
        },
        addSegment(segment: AparteSegment) {
            const last = [...el.tree.values()].at(-1);
            if (last) last.segments = [...(last.segments ?? []), segment];
        },
        updateSegment(segmentId: string, updates: Partial<AparteSegment>) {
            for (const m of el.tree.values()) {
                const seg = (m.segments ?? []).find((s) => s.id === segmentId);
                if (seg) Object.assign(seg, updates);
            }
        },
        // THE ACTIVE PATH — deliberately empty, as it is for a superseded branch.
        getMessages: () => [],
        // THE TREE — where the superseded reply still lives.
        getMessage: (id: string) => el.tree.get(id),
    });

    document.body.appendChild(el);
    return el;
}

describe('an error on a message that left the active path', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    it('appends the error to what already streamed instead of replacing it', async () => {
        const target = targetWithSupersededReply();
        const config = new AparteConfig();
        config.registerAIProvider(failsAfterStreaming());
        config.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        new AparteClient({ config, autoRegister: false }).start();

        target.dispatchEvent(
            new CustomEvent('aparte-send', {
                detail: { content: 'hello', timestamp: Date.now(), targetId: 'chat' },
                bubbles: true,
                composed: true,
            }),
        );

        const errored = await vi.waitFor(() => {
            const update = target.updates.find((u) => u.status === 'error');
            expect(update).toBeDefined();
            return update!;
        });

        const segments = errored.segments ?? [];
        // The error is there…
        expect(segments.some((s) => s.type === 'error')).toBe(true);
        // …and so is what actually streamed. Before the fix this array was length 1.
        expect(segments.length).toBeGreaterThan(1);
        expect(JSON.stringify(segments)).toContain('the real answer');
    });
});
