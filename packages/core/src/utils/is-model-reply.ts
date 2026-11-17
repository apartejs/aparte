import type { AparteMessage } from '../types/index.js';

/**
 * Who wrote a message, as core acts on it: what the author states, else the side it is
 * on — the person's side is human, the assistant's side is the AI.
 */
export function authorTypeOf(message: Pick<AparteMessage, 'role' | 'author'>): 'ai' | 'human' {
    return message.author?.type ?? (message.role === 'user' ? 'human' : 'ai');
}

/**
 * Is this message a reply the model wrote? An assistant-side message that is neither a
 * notice nor a human's. Everything that looks for "the AI's reply" — to regenerate it,
 * resume it, close its paused calls, read its answers — asks this, never the role alone:
 * an advisor who took over and a "Marie joined" line both sit on the assistant's side.
 */
export function isModelReply(message: Pick<AparteMessage, 'role' | 'kind' | 'author'>): boolean {
    return message.role === 'assistant' && message.kind === undefined && authorTypeOf(message) === 'ai';
}
