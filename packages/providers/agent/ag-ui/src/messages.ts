import { contentToText } from '@aparte/core';
import type { AparteChatMessage, AparteContentPart, AparteTool } from '@aparte/core';
import type { AgUiInputContent, AgUiMessage, AgUiRunAgentInput } from './wire.js';

/** An aparté image as AG-UI 1.0 content: a data URL becomes a `data` source, anything else a `url` one. */
function imagePart(part: Extract<AparteContentPart, { type: 'image' }>): AgUiInputContent {
    const data = /^data:([^;,]*)(?:;base64)?,(.*)$/s.exec(part.image);
    if (data) return { type: 'image', source: { type: 'data', value: data[2]!, mimeType: part.mimeType ?? (data[1] || 'application/octet-stream') } };
    return { type: 'image', source: { type: 'url', value: part.image, ...(part.mimeType ? { mimeType: part.mimeType } : {}) } };
}

/**
 * aparté's history as `RunAgentInput.messages`. Every message gets an id (the protocol
 * requires one) that is stable across the runs of one turn — its position — so a resume
 * replays the same history the paused run saw. A call is `{ id, type: 'function',
 * function: { name, arguments } }` with the arguments as a JSON string, and a result is
 * a `tool` message naming its call. A user message with an image goes as AG-UI 1.0
 * content parts; toward a peer that predates them (`flatten`), as its text alone — which
 * drops the image, and says so.
 */
export function toAgUiMessages(
    messages: readonly AparteChatMessage[],
    flatten = false,
    warn: (message: string) => void = () => {},
): AgUiMessage[] {
    const out: AgUiMessage[] = [];
    messages.forEach((m, index) => {
        const id = `aparte-${index}`;
        const content = contentToText(m.content);
        const images = Array.isArray(m.content) && m.content.some((part) => part.type === 'image');
        if (m.role === 'user' && images && !flatten) {
            out.push({
                id,
                role: 'user',
                content: (m.content as AparteContentPart[]).map((part) => (part.type === 'image' ? imagePart(part) : { type: 'text', text: part.text })),
            });
        } else if (m.role === 'system' || m.role === 'user') {
            if (images) warn(`the agent's AG-UI version takes text only, which DROPS non-text parts: the images of message ${index} are not sent.`);
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
