import { contentToText } from '@aparte/core';
import type { AparteChatMessage, AparteTool } from '@aparte/core';
import type { AgUiMessage, AgUiRunAgentInput } from './wire.js';

/**
 * aparté's history as `RunAgentInput.messages`. Every message gets an id (the protocol
 * requires one) that is stable across the runs of one turn — its position — so a resume
 * replays the same history the paused run saw. A call is `{ id, type: 'function',
 * function: { name, arguments } }` with the arguments as a JSON string, and a result is
 * a `tool` message naming its call. Content goes as text: an image part has no AG-UI
 * shape every agent reads, so it is left out rather than guessed.
 */
export function toAgUiMessages(messages: readonly AparteChatMessage[]): AgUiMessage[] {
    const out: AgUiMessage[] = [];
    messages.forEach((m, index) => {
        const id = `aparte-${index}`;
        const content = contentToText(m.content);
        if (m.role === 'system' || m.role === 'user') {
            out.push({ id, role: m.role, content });
        } else if (m.role === 'assistant') {
            out.push({
                id,
                role: 'assistant',
                ...(content ? { content } : {}),
                ...(m.toolCalls?.length
                    ? {
                        toolCalls: m.toolCalls.map((call) => ({
                            id: call.id,
                            type: 'function' as const,
                            function: { name: call.name, arguments: JSON.stringify(call.input ?? {}) },
                        })),
                    }
                    : {}),
            });
        } else if (m.role === 'tool' && m.toolCallId) {
            out.push({ id, role: 'tool', content, toolCallId: m.toolCallId });
        }
    });
    return out;
}

/** The page's tools as `RunAgentInput.tools`: the ones the agent may ask the browser to run. */
export function toAgUiTools(tools: readonly AparteTool[] | undefined): AgUiRunAgentInput['tools'] {
    return (tools ?? []).map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema }));
}
