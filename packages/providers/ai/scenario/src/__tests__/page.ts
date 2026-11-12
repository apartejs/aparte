/**
 * A real page for the sub-agent tests: a config with the scripted provider and real
 * registered tools, a real `AparteClient` answering a real `<aparte-chat-viewport>`, and
 * every run event the page saw. The loop is core's own — nothing of it is replaced.
 */
import { expect, vi } from 'vitest';
import {
    AparteClient,
    AparteConfig,
    attachConfig,
    registerDefaultRenderers,
    type AparteAIProvider,
    type AparteMessage,
    type AparteStreamRunEvent,
    type AparteTool,
    type AparteToolHandler,
} from '@aparte/core';

export type Viewport = HTMLElement & {
    getMessages(): AparteMessage[];
};

export interface Page {
    config: AparteConfig;
    client: AparteClient;
    viewport: Viewport;
    /** Every run event, in order, as the page's observers saw it. */
    events: AparteStreamRunEvent[];
    /** Send a message and wait for its run to end. */
    send(content: string): Promise<void>;
    /** Send a message without waiting. */
    start(content: string): void;
    /** The last assistant message. */
    reply(): AparteMessage | undefined;
}

export function page(
    provider: AparteAIProvider,
    tools: { tool: AparteTool; handler: AparteToolHandler }[] = [],
    setup?: (config: AparteConfig) => void,
): Page {
    const config = new AparteConfig();
    config.registerAIProvider(provider);
    config.setModelConfig({ defaultProvider: provider.id, defaultModel: 'scripted' });
    for (const { tool, handler } of tools) config.registerTool(tool, handler);
    registerDefaultRenderers(config);
    setup?.(config);
    const events: AparteStreamRunEvent[] = [];
    config.observeRunEvents((event) => { events.push(event); });

    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    viewport.id = `chat-${Math.random().toString(36).slice(2)}`;
    document.body.append(viewport);
    attachConfig(viewport, config);
    const client = new AparteClient({ config, autoRegister: false, targetResolver: () => viewport });
    client.start();

    const ends = (): number => events.filter((e) => e.type === 'run-done').length;
    const start = (content: string): void => {
        viewport.dispatchEvent(new CustomEvent('aparte-send', {
            detail: { content, timestamp: 1, targetId: viewport.id },
            bubbles: true,
            composed: true,
        }));
    };
    return {
        config,
        client,
        viewport,
        events,
        start,
        async send(content) {
            const before = ends();
            start(content);
            await vi.waitFor(() => expect(ends()).toBeGreaterThan(before), { timeout: 4000 });
        },
        reply: () => [...viewport.getMessages()].reverse().find((m) => m.role === 'assistant'),
    };
}

/** The events of one sub-agent (`agentId`), or the parent's own (`undefined`). */
export const of = (events: AparteStreamRunEvent[], agentId: string | undefined): AparteStreamRunEvent[] =>
    events.filter((e) => (e as { agentId?: string }).agentId === agentId && e.type !== 'agent-start' && e.type !== 'agent-end');

/** The text one owner streamed. */
export const textOf = (events: AparteStreamRunEvent[], agentId: string | undefined): string =>
    of(events, agentId).filter((e) => e.type === 'text-delta').map((e) => (e as { delta: string }).delta).join('');

export type AgentStart = Extract<AparteStreamRunEvent, { type: 'agent-start' }>;
export type AgentEnd = Extract<AparteStreamRunEvent, { type: 'agent-end' }>;

export const starts = (events: AparteStreamRunEvent[]): AgentStart[] => events.filter((e): e is AgentStart => e.type === 'agent-start');
export const endsOf = (events: AparteStreamRunEvent[]): AgentEnd[] => events.filter((e): e is AgentEnd => e.type === 'agent-end');
