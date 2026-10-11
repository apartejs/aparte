/**
 * @aparte/runner-ag-ui — render an agent served over AG-UI in aparté.
 *
 * The agent runs on its own server (Agno, LangGraph, Mastra, CrewAI, Pydantic AI,
 * TanStack AI…), with its own tools; `AparteClient` draws its text, its tool rows and its
 * approvals through the `streamRunner` seam, the way it draws a loop it runs itself.
 */
export { createAgUiRunner } from './runner.js';
export type { AgUiRunnerOptions } from './runner.js';
