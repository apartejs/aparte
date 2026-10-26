/**
 * cut.ts — where a checkpoint sits, and the one thing a summary must not lose.
 *
 * Two small pure pieces `compact()` leans on, kept out of it so each can be read (and
 * tested) without a model call in sight.
 */

/**
 * The index of the first message that stays verbatim, moved so it is a USER message.
 *
 * A checkpoint is read by the model as "the summary, then this message and everything
 * after it", and every provider wants the first turn after a preamble to be the user's:
 * a history that resumes on an assistant reply is refused by some templates and
 * misread by the rest. So the boundary the selector chose (`boundary`, the count of
 * leading messages it dropped) is moved toward the OLDER end until it lands on a user
 * message, which keeps more verbatim and summarises less than the selector asked for.
 * When that would summarise nothing at all, it moves toward the NEWER end instead, which
 * summarises a little more. A kept message has to exist to carry the checkpoint, so the
 * boundary never goes past the last message.
 *
 * `null` when no user message qualifies — there is nothing a checkpoint could sit on.
 */
export function cutAtUser(messages: ReadonlyArray<{ role: string }>, boundary: number): number | null {
    const last = messages.length - 1;
    if (last < 1) return null;
    const start = Math.min(boundary, last);
    for (let i = start; i > 0; i--) if (messages[i]!.role === 'user') return i;
    for (let i = start + 1; i <= last; i++) if (messages[i]!.role === 'user') return i;
    return null;
}

/**
 * The line that introduces the conversation's first request inside a stored summary.
 * English and fixed, because the summary is addressed to the model and because an
 * update of the summary has to find the block again (see {@link splitFirstRequest}).
 */
export const FIRST_REQUEST_LINE = "The conversation's first request, verbatim:";

/** The most of the first request a summary carries. */
export const FIRST_REQUEST_MAX = 1500;

/**
 * The first request, appended to the model's summary under {@link FIRST_REQUEST_LINE}.
 *
 * It is not written by the model: what the user first asked is the one piece of a
 * conversation every later turn is judged against, and a summariser paraphrases it away
 * as readily as anything else. Clipped, so a pasted document does not become the summary.
 */
export function firstRequestBlock(text: string): string {
    const trimmed = text.trim();
    const clipped = trimmed.length > FIRST_REQUEST_MAX ? `${trimmed.slice(0, FIRST_REQUEST_MAX)}…` : trimmed;
    return `\n\n${FIRST_REQUEST_LINE}\n${clipped}`;
}

/**
 * A stored summary taken apart: what the model wrote, and the first-request block that
 * was appended to it (empty when there is none).
 *
 * An update of a summary hands the model the first part only and puts the second back
 * unchanged afterwards. Handing it the whole thing would have it copy the block into
 * its own answer, and the block would be there twice.
 */
export function splitFirstRequest(summary: string): { base: string; block: string } {
    const at = summary.indexOf(`\n\n${FIRST_REQUEST_LINE}\n`);
    return at < 0 ? { base: summary, block: '' } : { base: summary.slice(0, at), block: summary.slice(at) };
}
