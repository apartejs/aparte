/**
 * `subagentsTurnLabel`: a fold's line that counts its sub-agents by state.
 */
import type { AparteSegment, AparteTurnLabelContext } from '@aparte/core';
import { subagentOf, subagentStatus } from './status.js';
import type { AparteSubagentStatus } from './types.js';
import { counted, type WordKey } from './words.js';

/** The states, in the order the line says them, with the word that counts each. */
const STATES: ReadonlyArray<[AparteSubagentStatus, WordKey]> = [
    ['done', 'subagentsDone'],
    ['running', 'subagentsRunning'],
    ['waiting', 'subagentsWaiting'],
    ['failed', 'subagentsFailed'],
    ['stopped', 'subagentsStopped'],
];

/**
 * The line of a folded run of steps that holds two sub-agents or more: their number, then how
 * many are in each state — "3 sub-agents · 1 done, 2 running" — in the chat's language. A fold
 * with fewer keeps core's line ("Working", "Worked 9 s · 7 tools"). Hand it to core's turn
 * summary, which calls it each time the fold's steps change:
 *
 * ```ts
 * aparteGlobalConfig.setTurnSummary({ openWhileRunning: true, label: subagentsTurnLabel });
 * ```
 *
 * Only the sub-agents drawn on the line of the call that opened them are in a fold. One that
 * waits for the person, or that failed, stands out of it, on its own line, where it has to be
 * read; one with a segment of its own never folds.
 */
export function subagentsTurnLabel(steps: readonly AparteSegment[], { config }: AparteTurnLabelContext): string | undefined {
    const statuses = steps.filter((step) => subagentOf(step) !== undefined).map(subagentStatus);
    if (statuses.length < 2) return undefined;
    const parts = STATES
        .map(([status, key]) => [key, statuses.filter((s) => s === status).length] as const)
        .filter(([, n]) => n > 0)
        .map(([key, n]) => counted(config, key, n));
    return `${counted(config, 'subagentsCount', statuses.length)} · ${parts.join(', ')}`;
}
