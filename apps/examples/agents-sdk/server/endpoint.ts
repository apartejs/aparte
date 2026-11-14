/**
 * The endpoints the page talks to: the agent, on the model the environment picks, over AG-UI,
 * a scripted run with two sub-agents beside it, and a TanStack AI agent whose router delegates
 * to two. `vite.config.ts` mounts them at `/agent`, `/subagents` and `/tanstack` for `pnpm dev`;
 * in your app, the first is your route.
 */
import { supportAgent } from './agent.js';
import { handleAgUi } from './ag-ui.js';
import { runnerFromEnv } from './model.js';
import { handleSubagentRun } from './subagents.js';
import { handleTanstackRun } from './tanstack.js';

const runner = runnerFromEnv(process.env);

/** The demo model's pace (`DEMO_DELAY_MS`, 30 by default). */
const delayMs = (): number => Number(process.env.DEMO_DELAY_MS ?? 30);

export function handle(request: Request): Promise<Response> {
    return handleAgUi(request, supportAgent, runner);
}

/** The scripted sub-agent run, at the demo model's pace. */
export function handleSubagents(request: Request): Promise<Response> {
    return handleSubagentRun(request, delayMs());
}

/** The TanStack AI agent and its two sub-agents, on TanStack's scripted model, at the same pace. */
export function handleTanstack(request: Request): Promise<Response> {
    return handleTanstackRun(request, delayMs());
}
