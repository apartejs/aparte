# @aparte/runner-ag-ui

## 0.20.0

### Patch Changes

- c431e78: A reply from an AG-UI agent now reports the usage of its last model step, as a run in the page does, so the context gauge no longer overstates a multi-step run.

  The runner added every step's usage together — TanStack AI reports one per model step — and `<aparte-context>` reads a reply's usage as the size of the context, so a three-step run read as three times the context it used.

- b04aeba: A browser tool that a server loop or an AG-UI agent calls now goes through the page's approval gate before it runs: its `needsApproval` asks through the approval panel (or your `approvalResolver`), and the approval policy can allow or refuse it. A refusal goes back as the call's answer, which the model reads.

  Until now the page ran such a tool as soon as the server or the agent called it: the gate it gets in the page's own loop was skipped, so a `needsApproval` browser tool ran unasked and a plan-mode policy did not stop it. A tool with no `needsApproval` under no policy still runs at once.

  While the page asks, the call's row says it is waiting and `aparte-tool-approval-request` fires, as for a call gated in the page's own loop. A payload the approval carries is merged into the tool's input. A refusal ends the pause's later calls, as it ends the turn's in the page: nobody is asked about them, none of them runs, and each is answered "Not run: an earlier call of the same step was refused.", so the server does not pause on them again and an agent's model gets an answer for every call. A call approved at a pause — TanStack AI asks to approve a client tool, then pauses again to run it — is not asked about again at the next pause; that approval is for that call only, not for a later one that reuses its id.

  `@aparte/engine`: a deferred call answered with `{ kind: 'decision', approved: false }` is refused like a gated call — `tool-rejected`, the refusal as its `tool` message, and another turn so the model reads it — whether it is external (it used to be deferred again) or has no gate of its own (it used to run). `@aparte/runner-ag-ui` sends that refusal to the agent as the frontend tool's result, and for a client-tool interrupt (TanStack AI) as the tool's error with the reason — an execution interrupt answered `{ approved: false }` read as a successful output.

## 0.19.3

## 0.19.2

## 0.19.1

## 0.19.0

### Minor Changes

- 16001e5: New package: `@aparte/runner-ag-ui` renders an agent served over AG-UI (Agno, LangGraph, Mastra, CrewAI, Pydantic AI) or a TanStack AI chat route in aparté. Pass `createAgUiRunner({ endpoint })` as `AparteClient`'s `streamRunner`.

  The agent runs its loop and its tools on its own server. aparté draws what it streams: the text, the reasoning, a row per tool call, and the approval panel when the agent pauses on a call that needs a person (an AG-UI interrupt, such as TanStack AI's `needsApproval`). The answer goes back in one `resume` batch. Tools the page registers go to the agent as frontend tools. When the agent calls one, the page runs it and the result goes back. The pause is saved with the conversation, as with the server loop. The wire (SSE or NDJSON) is parsed in the package, with `@aparte/core` as its only peer: no AG-UI SDK is pulled in.

  A TanStack AI route must hand `chat()` the run's `resume`, `threadId`, `runId` and `parentRunId`. With `messages` alone it streams, but never resumes a pause. The package's tests run TanStack AI's own server for every round trip. Guides: Providers → AG-UI agents, and TanStack AI.
