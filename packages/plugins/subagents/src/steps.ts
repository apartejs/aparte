/**
 * The steps a sub-agent has open ("Reading the parser"), live: what its line says while none
 * of its calls runs.
 *
 * Kept here, by reply and by agent, and never on a segment: a step lasts only as long as it is
 * open, and the conversation a page saves must not keep one. The lanes write it as the
 * sub-agent's `step-start` / `step-end` arrive and forget it with the sub-agent's end; the line
 * reads it at each draw. Steps nest and overlap: the latest one open is the one said, and when
 * it ends the one before it is said again.
 */

const open = new Map<string, string[]>();

const keyOf = (messageId: string, agentId: string): string => `${messageId}\u0000${agentId}`;

/** A step of the sub-agent `agentId` of the reply `messageId` begins. */
export function stepStarted(messageId: string, agentId: string, name: string): void {
    const key = keyOf(messageId, agentId);
    open.set(key, [...(open.get(key) ?? []), name]);
}

/** The latest open step of that name ends. */
export function stepEnded(messageId: string, agentId: string, name: string): void {
    const key = keyOf(messageId, agentId);
    const steps = open.get(key);
    if (!steps) return;
    const at = steps.lastIndexOf(name);
    if (at < 0) return;
    const rest = steps.filter((_, i) => i !== at);
    if (rest.length > 0) open.set(key, rest);
    else open.delete(key);
}

/** Every step of the sub-agent ends: it ended, or its reply did. */
export function stepsEnded(messageId: string, agentId: string): void {
    open.delete(keyOf(messageId, agentId));
}

/**
 * The step the sub-agent is on, if any. Without the reply's id (a segment that does not carry
 * one), the first sub-agent of that id with a step open.
 */
export function currentStep(messageId: string | undefined, agentId: string): string | undefined {
    if (messageId !== undefined) return open.get(keyOf(messageId, agentId))?.at(-1);
    const suffix = `\u0000${agentId}`;
    for (const [key, steps] of open) if (key.endsWith(suffix)) return steps.at(-1);
    return undefined;
}
