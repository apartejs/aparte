# Agents SDK × aparté

An [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) agent — the code Agent Builder
exports — served over [AG-UI](https://docs.ag-ui.com) and drawn by aparté. It is the demo for the
article [Agent Builder shuts down on November 30](https://apartejs.dev/articles/agent-builder-shutdown/).

```bash
pnpm install
pnpm --filter @aparte-workspace/example-agents-sdk dev
```

It runs with **no API key**: the model is the Agents SDK's own `ScriptedModel`, so the loop, the
tool call and the stream are the real SDK's and only the model's words are scripted. Ask "Where is
order 1042?" to watch the agent call its tool.

To run it on a real model, set the environment before `dev`:

| Variables | Model |
| --- | --- |
| none | the scripted demo model (`DEMO_DELAY_MS` between words, 30 by default) |
| `OPENAI_API_KEY` (+ `MODEL`) | OpenAI, on `MODEL` or the SDK's default |
| `MODEL_BASE_URL`, `MODEL` (+ `MODEL_API_KEY`) | any Chat Completions server: Mistral (`https://api.mistral.ai/v1`), Groq, OpenRouter, a local Ollama (`http://localhost:11434/v1`) |

## What is where

| File | What it is |
| --- | --- |
| `server/agent.ts` | the agent and its tool — the part an Agent Builder export gives you |
| `server/ag-ui.ts` | the bridge: AG-UI's `RunAgentInput` in, AG-UI events out, as a Web `Request` → `Response` handler |
| `server/model.ts` | which model, from the environment |
| `server/demo-model.ts` | the keyless model, on the SDK's `ScriptedModel` |
| `server/subagents.ts` | a scripted AG-UI run with two sub-agents, replayed as written |
| `server/tanstack.ts` | a TanStack AI 1.0 agent whose router delegates to two sub-agents, on TanStack's scripted model |
| `server/endpoint.ts` | the agent, mounted at `/agent` by `vite.config.ts`, the scripted run at `/subagents`, the TanStack AI agent at `/tanstack` |
| `src/main.ts` | the page: `AparteClient` with `createAgUiRunner({ endpoint: '/agent' })`, and `setupSubagents()` |

`server/__tests__/ag-ui.test.ts` runs the agent with no key and no network, checks every event
against AG-UI's schemas, reads the stream with aparté's AG-UI runner, and runs the same agent over
HTTP against a local Chat Completions server. `e2e/tests/agents-sdk.spec.ts` drives the page.

## Sub-agents

Open the page with `?subagents` to read a scripted run instead of the agent: the support agent
calls `delegate`, which opens an order tracker (`parentToolCallId`), and starts a returns desk on
its own; their events interleave, each tagged with its `subagentRunId`, and the agent answers once
both are back. `@aparte/plugin-subagents` gives each one a line, and their words stay out of the
reply. The Agents SDK streams no sub-agents itself, so this route replays the events rather than
running it. `server/__tests__/subagents.test.ts` reads the run with aparté's AG-UI runner, and
`e2e/tests/agents-sdk-subagents.spec.ts` drives the page.

## A TanStack AI agent's sub-agents

Open the page with `?tanstack` to talk to a real TanStack AI 1.0 agent instead: `chat()` with a
`subagents` router that runs an order tracker, then a returns desk, each a `chat()` of its own that
calls one real tool and answers, then the main model's reply (`strategy: 'handoff'`). Only the
models' words are scripted, on TanStack's `fakeText`; the AG-UI events are TanStack's own. The page
draws a line per sub-agent with an Open button (`setupSubagents({ open: 'event' })`) that shows its
conversation beside the chat, and the router's plan as a plan card
(`setupPlanCard({ activity: 'plan' })`). `server/__tests__/tanstack.test.ts` reads the route with
aparté's AG-UI runner, and `e2e/tests/agents-sdk-tanstack.spec.ts` drives the page.

## What the bridge leaves out

- The history is rebuilt from the messages' text: a tool call from an earlier turn reaches the
  model as the reply that followed it.
- A person's images are dropped.
- Tools that need approval are not mapped to AG-UI interrupts.
