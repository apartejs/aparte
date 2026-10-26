import type { AparteMessage } from '../types/models.js';

/**
 * The part of a path the model reads, and the summary that stands for the rest.
 *
 * A checkpoint is `contextSummary` on a message: from it on the model reads the summary
 * in place of everything before. The LAST message carrying one wins — a later
 * checkpoint was written over the earlier summary (it asked for an update of it), so
 * the earlier one is already inside it. Everything before the winner is dropped from
 * the result, a legacy `compaction: true` message included: that notice is itself part
 * of what the checkpoint summarised, and sending it beside the summary would say the
 * same thing twice.
 *
 * With no checkpoint the path comes back unchanged and no summary is returned, so a
 * caller can use it unconditionally. Nothing is deleted from the transcript — this
 * reads a path and returns a view of it.
 *
 * Call it on the FULL path, the unanswered user message at its end included: the
 * checkpoint can sit on that very message (a turn retried after an overflow), and the
 * summary still has to go out before it.
 *
 * `AparteClient` applies it to every history it builds. A `history` function handed to
 * the client receives the whole transcript and can call this itself.
 */
export function historyFromCheckpoint(path: AparteMessage[]): { summary?: string; messages: AparteMessage[] } {
    for (let i = path.length - 1; i >= 0; i--) {
        const summary = path[i]!.contextSummary?.summary;
        if (summary !== undefined) return { summary, messages: path.slice(i) };
    }
    return { messages: path };
}
