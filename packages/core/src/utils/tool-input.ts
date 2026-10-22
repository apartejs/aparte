/**
 * A tool call's arguments, as text — one implementation, two surfaces.
 *
 * The transcript row and the approval panel both show the arguments the model chose,
 * and they must show the SAME text: the row is the anchor that says a call is waiting,
 * the panel is where the person decides. Two renderings of one value drift, and here
 * the drift would be a person approving a call they read differently from the one that
 * runs. So it is a function in `utils/`, not a copy in each renderer.
 *
 * Pretty-printed JSON, because that is what the model actually sent and what every
 * reference implementation shows — a prose summary would be core inventing a reading
 * of arguments it knows nothing about. `JSON.stringify` can throw on a cyclic value,
 * which a tool input should never be but a hand-built segment can be, so a failure
 * degrades to no input rather than to a broken bubble.
 *
 * The return is TEXT and never markup: both call sites put it on screen through
 * `textContent` or an escaped interpolation, because the arguments are model-authored.
 */
export function describeToolInput(input: unknown, format?: (input: Record<string, unknown>) => string): string {
    if (!input || typeof input !== 'object' || Object.keys(input).length === 0) return '';
    // A host's own reading of its tool's arguments (`registerToolInputFormatter`); one that
    // throws, or returns something other than text, falls back to what the model sent.
    if (format) {
        try {
            const text = format(input as Record<string, unknown>);
            if (typeof text === 'string') return text;
        } catch { /* the JSON below */ }
    }
    try {
        return JSON.stringify(input, null, 2);
    } catch {
        return '';
    }
}
