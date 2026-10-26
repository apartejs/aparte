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
| `server/endpoint.ts` | the three together, mounted at `/agent` by `vite.config.ts` |
| `src/main.ts` | the page: `AparteClient` with `createAgUiRunner({ endpoint: '/agent' })` |

`server/__tests__/ag-ui.test.ts` runs the agent with no key and no network, checks every event
against AG-UI's schemas, reads the stream with aparté's AG-UI runner, and runs the same agent over
HTTP against a local Chat Completions server. `e2e/tests/agents-sdk.spec.ts` drives the page.

## What the bridge leaves out

- The history is rebuilt from the messages' text: a tool call from an earlier turn reaches the
  model as the reply that followed it.
- A person's images are dropped.
- Tools that need approval are not mapped to AG-UI interrupts.
