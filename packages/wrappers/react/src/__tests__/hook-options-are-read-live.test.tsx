/**
 * React builds the client once, but a render's function options are the ones a turn calls.
 *
 * A resolver passed to `useAparteClient` usually reads the component's state (the mode a
 * conversation is in, a store of pending approvals). The client was built from the first
 * render's options and kept them, so a resolver over state saw the state of the first render.
 * The other wrappers close over live values (refs, stores, signals) and never had this.
 *
 * Also here: a second `init()` of `useConversationManager` left the first manager's
 * subscription running, its notifications still writing the hook's state.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, cleanup, act } from '@testing-library/react';
import { AparteConfig, registerAllComponents, type AparteConversation, type AparteStorageAdapter } from '@aparte/core';
import { AparteChat } from '../components/AparteChat';
import { useAparteClient } from '../hooks/useAparteClient';
import { useConversationManager } from '../hooks/useConversationManager';

registerAllComponents();
afterEach(() => cleanup());

function memoryAdapter(): AparteStorageAdapter {
    const store = new Map<string, AparteConversation>();
    return {
        async loadAll() { return [...store.values()]; },
        async save(c) { store.set(c.id, c); },
        async delete(id) { store.delete(id); },
    };
}

describe('useAparteClient', () => {
    it('calls the function options of the latest render', async () => {
        const config = new AparteConfig();
        const ran: string[] = [];
        function Page({ label }: { label: string }) {
            useAparteClient({
                config,
                autoRegister: false,
                scopeToTargetId: 'chat-live',
                requestInterceptor: (request) => {
                    ran.push(label);
                    return request;
                },
                streamRunner: async (opts) => {
                    opts.emitter({ type: 'run-start' });
                    opts.emitter({ type: 'run-done' });
                    return undefined;
                },
            });
            return <AparteChat id="chat-live" config={config} />;
        }
        const { container, rerender } = render(<Page label="first render" />);
        rerender(<Page label="second render" />);

        await act(async () => {
            container.querySelector('aparte-composer')!.dispatchEvent(new CustomEvent('aparte-send', {
                detail: { content: 'hi', targetId: 'chat-live', timestamp: Date.now() }, bubbles: true, composed: true,
            }));
            await vi.waitFor(() => expect(ran).toHaveLength(1));
        });
        expect(ran).toEqual(['second render']);
    });

    it('hands the client the streamRunner it was given, itself', () => {
        // The client tells the engine's own loop (`streamRunner: runStreamAgent`) from a runner
        // that calls the model elsewhere by identity; a forwarder in its place lost that.
        const streamRunner = async () => undefined;
        const { result } = renderHook(() => useAparteClient({ autoRegister: false, streamRunner }));
        const options = (result.current.client as unknown as { options: { streamRunner?: unknown } }).options;
        expect(options.streamRunner).toBe(streamRunner);
    });
});

describe('useConversationManager().init, called twice', () => {
    it('leaves no subscription on the manager it replaced', async () => {
        const { result } = renderHook(() => useConversationManager());
        const config = new AparteConfig();
        await act(async () => { await result.current.init(memoryAdapter(), config); });
        const firstManager = result.current.manager!;
        await act(async () => { await result.current.init(memoryAdapter(), config); });
        await act(async () => { await firstManager.createNew('stale'); });
        expect(result.current.conversations).toHaveLength(0);
    });
});
