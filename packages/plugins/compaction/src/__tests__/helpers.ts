/**
 * Shared fixtures for the checkpoint and policy suites: a transcript stub with the one write
 * a compaction makes, and a config with a mock provider and a transport that records the
 * summarisation request. `compaction.test.ts` keeps its own copies of the older ones.
 */
import { vi } from 'vitest';
import { AparteConfig, type AparteChatRequest, type AparteMessage } from '@aparte/core';
import type { CompactionController, CompactionTarget } from '../compaction.js';
import { setupCompaction } from '../compaction.js';

export const exchange = (n: number, text = 'x'): AparteMessage[] => [
    { id: `u${n}`, role: 'user', content: `${text} question ${n}`, timestamp: n * 10, status: 'completed' },
    { id: `a${n}`, role: 'assistant', content: `${text} answer ${n}`, timestamp: n * 10 + 1, status: 'completed' },
];

/** `n` exchanges, ids u1 a1 … un an. */
export const transcript = (n: number, text = 'x'): AparteMessage[] =>
    Array.from({ length: n }, (_, i) => exchange(i + 1, text)).flat();

export type Update = { id: string; updates: Partial<AparteMessage> };
export type StubTarget = CompactionTarget & { messages: AparteMessage[]; updated: Update[] };

/** A transcript that behaves like the viewport's: the active path, and an update merged by id. */
export function makeTarget(initial: AparteMessage[]): StubTarget {
    const store: StubTarget = {
        messages: [...initial],
        updated: [],
        getMessages: () => [...store.messages],
        updateMessage: (id, updates) => {
            store.messages = store.messages.map((m) => (m.id === id ? { ...m, ...updates } : m));
            store.updated.push({ id, updates });
        },
    };
    return store;
}

export const checkpointOf = (messages: AparteMessage[]): AparteMessage | undefined => messages.find((m) => m.contextSummary);

/**
 * A config whose provider is a mock: the transport records each summarisation request and
 * answers with `reply`. `contextWindow` is declared on the model when given.
 */
export function makeConfig(reply: string | ((request: AparteChatRequest) => Promise<string> | string) = 'SUMMARY', contextWindow?: number) {
    const cfg = new AparteConfig();
    cfg.registerAIProvider({
        id: 'mock',
        getMetadata: () => ({ id: 'mock', name: 'Mock' }),
        getModels: () => [{ id: 'm', name: 'M', ...(contextWindow ? { contextWindow } : {}) }],
        chat: vi.fn(),
    } as never);
    cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
    cfg.setKeyProvider(() => 'sk-config');
    const calls: Array<{ request: AparteChatRequest }> = [];
    const chat = vi.fn(async (_p: unknown, request: AparteChatRequest) => {
        calls.push({ request });
        return typeof reply === 'string' ? reply : reply(request);
    });
    cfg.setTransport({ chat } as never);
    return { cfg, calls, chat, last: () => calls[calls.length - 1]! };
}

export const once = <T>(type: string): Promise<T> =>
    new Promise((res) => window.addEventListener(type, (e) => res((e as CustomEvent<T>).detail), { once: true }));

/** The controllers a suite made, so `afterEach` can dispose them. */
export const created: CompactionController[] = [];
export const setup = (...args: Parameters<typeof setupCompaction>): CompactionController => {
    const c = setupCompaction(...args);
    created.push(c);
    return c;
};
export const disposeAll = (): void => {
    for (const c of created.splice(0)) c.dispose();
    document.body.innerHTML = '';
};

/** Everything a test dispatched on `window`, by event name. */
export function recordEvents(...names: string[]): { events: Array<{ type: string; detail: any }>; stop: () => void } {
    const events: Array<{ type: string; detail: any }> = [];
    const handlers = names.map((name) => {
        const handler = (e: Event): void => { events.push({ type: name, detail: (e as CustomEvent).detail }); };
        window.addEventListener(name, handler);
        return [name, handler] as const;
    });
    return { events, stop: () => { for (const [name, handler] of handlers) window.removeEventListener(name, handler); } };
}
