---
"@aparte/runner-ag-ui": minor
---

New package: `@aparte/runner-ag-ui` renders an agent served over AG-UI (Agno, LangGraph, Mastra, CrewAI, Pydantic AI) or a TanStack AI chat route in aparté. Pass `createAgUiRunner({ endpoint })` as `AparteClient`'s `streamRunner`.

The agent runs its loop and its tools on its own server. aparté draws what it streams: the text, the reasoning, a row per tool call, and the approval panel when the agent pauses on a call that needs a person (an AG-UI interrupt, such as TanStack AI's `needsApproval`). The answer goes back in one `resume` batch. Tools the page registers go to the agent as frontend tools. When the agent calls one, the page runs it and the result goes back. The pause is saved with the conversation, as with the server loop. The wire (SSE or NDJSON) is parsed in the package, with `@aparte/core` as its only peer: no AG-UI SDK is pulled in.

A TanStack AI route must hand `chat()` the run's `resume`, `threadId`, `runId` and `parentRunId`. With `messages` alone it streams, but never resumes a pause. The package's tests run TanStack AI's own server for every round trip. Guides: Providers → AG-UI agents, and TanStack AI.
