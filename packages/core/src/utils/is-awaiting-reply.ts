import type { AparteMessage } from '../types/index.js';

/**
 * Is this message waiting for a reply — i.e. should the bubble render as
 * in-progress (waiting indicator, `aria-busy`, no action bar) rather than as a
 * finished answer?
 *
 * Two clauses:
 *
 * 1. **Stated**: `status` is `'streaming'` or `'pending'`. This is exactly the
 *    condition every call site used before this helper existed, role included, so
 *    no existing behaviour shifts.
 * 2. **Inferred**: an **assistant** message with **no `status` at all** and nothing
 *    in it — no `content`, no `segments`. That is the empty shell a token stream is
 *    about to fill (`appendMessage({ role: 'assistant', content: '' })` from a
 *    hand-rolled loop). It used to render as a completed reply, action bar and all,
 *    on a message that had never said anything.
 *
 * Only silence is interpreted. An explicit `status` — including `'completed'` on an
 * empty message — is the application talking, and is believed.
 */
export function isAwaitingReply(message: Pick<AparteMessage, 'role' | 'status' | 'content' | 'segments'>): boolean {
    if (message.status === 'streaming' || message.status === 'pending') return true;
    return message.status === undefined
        && message.role === 'assistant'
        && !message.content?.trim()
        && !message.segments?.length;
}
