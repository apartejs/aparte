import type { AparteMessage } from '../types/index.js';
import { isModelReply } from './is-model-reply.js';

/**
 * Is this message waiting for a reply — i.e. should the bubble render as
 * in-progress (waiting indicator, `aria-busy`, no action bar) rather than as a
 * finished answer?
 *
 * Two clauses:
 *
 * 1. **Stated**: `status` is `'streaming'` or `'pending'`, whatever the role.
 * 2. **Inferred**: an **assistant** message with **no `status` at all** and nothing
 *    in it — no `content`, no `segments`. That is the empty shell a token stream is
 *    about to fill (`appendMessage({ role: 'assistant', content: '' })` from a
 *    hand-rolled loop).
 *
 * Only silence is interpreted. An explicit `status` — including `'completed'` on an
 * empty message — is the application talking, and is believed.
 */
export function isAwaitingReply(message: Pick<AparteMessage, 'role' | 'status' | 'content' | 'segments' | 'kind' | 'author'>): boolean {
    if (message.status === 'streaming' || message.status === 'pending') return true;
    // Silence is read as a reply to come only from the model: an advisor's message with no
    // text (a screenshot alone) or an empty notice is finished as it is.
    return message.status === undefined
        && isModelReply(message)
        && !message.content?.trim()
        && !message.segments?.length;
}
