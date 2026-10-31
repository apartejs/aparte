# @aparte/runner-ag-ui

## 0.29.1

## 0.29.0

## 0.28.3

## 0.28.2

## 0.28.1

## 0.28.0

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

## 0.27.0

## 0.26.0

## 0.25.0

## 0.24.0

## 0.23.0

### Patch Changes

- 494cd79: A refused AG-UI tool call's row now says who refused and what they wrote; the agent receives the same sentence as before.

  The runner wrote its own copy of the refusal sentence. It takes `toolRefusal` from `@aparte/core` now, so its `tool-rejected` carries `by` and `instruction` like the loop's.

## 0.22.0

### Minor Changes

- 5aa792c: A TanStack AI route now needs `relaxedRunFraming: true`: `createAgUiRunner({ endpoint: '/api/chat', relaxedRunFraming: true })`. Without it the runner rejects TanStack AI's streams, as AG-UI 1.0 asks a client to.

  The runner now follows AG-UI 1.0 and passes the protocol's own conformance corpus — the 68 streams of `spec/1.0/conformance`, vendored with their MIT license and replayed through it on every build. What changes:

  - **It declares `protocolVersion: "1.0"`** on every request, and warns when an agent declares a newer version or one it cannot read.
  - **It rejects the streams 1.0 tells a client to reject** — a run not opened by `RUN_STARTED`, an event after `RUN_FINISHED` (or after `RUN_ERROR`, but a new run), content for a message never opened, a message, tool call, step or sub-agent still open when the run finishes, a chunk stream that loses or changes its identity, a step or a sub-agent finished before it started, a known field missing or of the wrong type. What is open is tracked per owner — the agent, or each sub-agent — as 1.0 requires. The reply ends with an error naming the rule, below what was drawn. TanStack AI, 1.0 included, closes each model step with a `RUN_FINISHED` and answers a resume before its `RUN_STARTED`: `relaxedRunFraming` reads that framing and holds every other rule — what was opened must still be closed, by the end of the stream.
  - **It drops what 1.0 does not describe** — an unknown event type, an undescribed property, an unknown role or outcome — and reports it to the new `onWarning` option (`console.warn` by default).
  - **It keeps the agent's state.** `STATE_SNAPSHOT` and `STATE_DELTA` (a JSON Patch, applied whole or not at all) are kept for the thread and sent back as the next run's `state`; every request used to send `state: {}`.
  - **A `RUN_ERROR` no longer cuts the stream**: it is read to the end, as 1.0 asks, and the error lands below what was drawn. When the agent runs again in the same stream, the new run decides how the reply ends and the failure goes to `onWarning`. The error carries `data: { agUi: 'run-error' }`; a rejected stream carries `data: { agUi: 'malformed' }`.
  - **Images go to the agent** as AG-UI 1.0 content parts: a base64 data URL as a `data` source, anything else as a `url` source. They used to be left out.
  - **An interrupt the page cannot answer** — `input_required`, or one naming no `toolCallId` — ends the reply without an error and is answered `cancelled` when the thread resumes or runs again. It used to fail the reply.
  - **A tool result in content parts** keeps the parts as the row's structured result; the model reads their text.
  - **Older agents**: the new `peerProtocolVersion` option names an agent older than 1.0. Its stream is read by that version's rules (the retired `THINKING_*` events are translated in any case; sub-agent events are dropped for 0.0.57 and older, images flattened to text for 0.0.39 and older), and the request leaves out `protocolVersion`.

## 0.21.0

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
