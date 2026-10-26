/**
 * The endpoint the page talks to: the agent, on the model the environment picks, over AG-UI.
 * `vite.config.ts` mounts it at `/agent` for `pnpm dev`; in your app, it is your route.
 */
import { supportAgent } from './agent.js';
import { handleAgUi } from './ag-ui.js';
import { runnerFromEnv } from './model.js';

const runner = runnerFromEnv(process.env);

export function handle(request: Request): Promise<Response> {
    return handleAgUi(request, supportAgent, runner);
}
