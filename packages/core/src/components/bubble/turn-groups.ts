/**
 * Which rows of a reply fold together behind one line, and how to find a row once some are
 * inside a fold. Pure, and apart from the bubble, which is already the heaviest file here.
 */
import type { AparteSegment } from '../../types/index.js';
import { cssEscape } from '../../utils/css-escape.js';
import { segmentTiming } from '../../utils/segments.js';

/** `fold` joins the run, `skip` neither joins it nor ends it, `stop` ends it. */
export type TurnRole = 'fold' | 'skip' | 'stop';

/** The first and last index of a run, both included. */
export interface TurnRun {
    from: number;
    to: number;
}

/** The runs of two or more folding items: one alone stays as it is, a fold would only hide it. */
export function planTurns<T>(items: readonly T[], roleOf: (item: T) => TurnRole): TurnRun[] {
    const runs: TurnRun[] = [];
    let from = -1;
    let last = -1;
    let members = 0;
    const close = (): void => {
        if (members >= 2) runs.push({ from, to: last });
        from = -1;
        last = -1;
        members = 0;
    };
    items.forEach((item, index) => {
        const role = roleOf(item);
        if (role === 'stop') {
            close();
        } else if (role === 'fold') {
            if (from < 0) from = index;
            last = index;
            members += 1;
        }
    });
    close();
    return runs;
}

/**
 * A row by its segment id, either directly in the container or one fold down. Two fixed levels
 * and nothing deeper: the model's prose is drawn INSIDE a row and keeps its `data-*` attributes,
 * and a tool segment's id is one the model chooses, so a descendant query would let a decoy in
 * earlier prose take an update meant for the real row (see `segment-lookup-scope.test.ts`).
 */
export function rowOf(container: Element, segmentId: string): HTMLElement | null {
    const id = `[data-segment-id="${cssEscape(segmentId)}"]`; // safe-text: a CSS selector, escaped for one; no markup is built here
    return container.querySelector<HTMLElement>(`:scope > ${id}, :scope > .aparte-turn > .aparte-turn__body > ${id}`);
}

/** From the first start to the last end, or nothing when a step was never timed (a stored turn). */
export function turnDuration(members: readonly AparteSegment[]): number | undefined {
    let start = Infinity;
    let end = -Infinity;
    for (const member of members) {
        const { startedAt, endedAt } = segmentTiming(member) ?? {};
        if (startedAt == null || endedAt == null) return undefined;
        start = Math.min(start, startedAt);
        end = Math.max(end, endedAt);
    }
    return members.length > 0 ? end - start : undefined;
}
