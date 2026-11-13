/**
 * The endpoints the page talks to: the agent, on the model the environment picks, over AG-UI,
 * and a scripted run with two sub-agents beside it. `vite.config.ts` mounts them at `/agent` and
 * `/subagents` for `pnpm dev`; in your app, the first is your route.
 */
import { supportAgent } from './agent.js';
import { handleAgUi } from './ag-ui.js';
import { runnerFromEnv } from './model.js';
import { handleSubagentRun } from './subagents.js';

const runner = runnerFromEnv(process.env);

export function handle(request: Request): Promise<Response> {
    return handleAgUi(request, supportAgent, runner);
}

/** The scripted sub-agent run, at the demo model's pace (`DEMO_DELAY_MS`, 30 by default). */
export function handleSubagents(request: Request): Promise<Response> {
    return handleSubagentRun(request, Number(process.env.DEMO_DELAY_MS ?? 30));
}
