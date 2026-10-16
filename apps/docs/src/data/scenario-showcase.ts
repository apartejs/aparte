/**
 * The showcase `@aparte/provider-scenario` ships, read from the package's own source at build
 * time — the way `openai-presets.ts` reads the presets — so the provider page lists the words it
 * answers and the tools it calls as the package has them, not as someone once typed them.
 */
import { showcase } from '../../../../packages/providers/ai/scenario/src/showcase';
import type { ScenarioTurn } from '../../../../packages/providers/ai/scenario/src/index';

export interface ShowcaseRow {
    /** The scenario's key in `showcase`. */
    key: string;
    /** What starts it: its `when`, as written. */
    when: string;
}

/** The scenarios a person starts by what they type: those with a `when`. */
export const SHOWCASE_ROWS: ShowcaseRow[] = Object.entries(showcase)
    .filter(([, scenario]) => scenario.when !== undefined)
    .map(([key, scenario]) => ({ key, when: String(scenario.when) }));

const toolsOf = (turn: ScenarioTurn): string[] =>
    typeof turn === 'string' ? [] : turn.flatMap((step) => ('tool' in step ? [step.tool] : []));

/** Every tool a showcase scenario calls, once each, in the order they first appear. */
export const SHOWCASE_TOOLS: string[] = [...new Set(Object.values(showcase).flatMap((scenario) => toolsOf(scenario.turn)))];
