/**
 * Reasoning written the way a small local model writes it: a few words, then a pause of its
 * own length. Paced by the script, not by the provider's even typing, because a thread that
 * moved under a reply's reasoning was seen at a few uneven tokens per second
 * (apartejs/aparte#270).
 *
 * "Reason it through slowly." answers with that reasoning, closed as reasoning arrives, then a
 * line of text: what `e2e/tests/thread-holds-still.spec.ts` streams into a scrolled thread. The
 * sub-agents' "check two files" path (sub-agents.ts) reasons the same way.
 */
import type { Scenario, ScenarioStep } from '@aparte/provider-scenario';

/** What the reasoning prompt is asked with: the browser suite's prompt. */
export const REASONING_PROMPT = 'Reason it through slowly.';

export const SLOW_REASONING: ScenarioStep[] = [
    ['Two files to check. ', 350],
    ['The changelog first, ', 120],
    ['it sits at the root. ', 600],
    ['Then the release notes, ', 200],
    ['which may not exist yet. ', 450],
    ['Reading both ', 90],
    ['says which one is missing.', 300],
].flatMap(([thinking, wait]) => [{ thinking: thinking as string }, { wait: wait as number }]);

/** Before the showcase's when spread into the provider's: its `slow` listens for "slow". */
export const REASONING_SCENARIOS: Record<string, Scenario> = {
    reasoningSlowly: {
        when: /reason it through slowly/i,
        turn: [...SLOW_REASONING, { text: 'Both files are worth a look before the release.' }],
    },
};
