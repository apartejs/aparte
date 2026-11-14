# @aparte/runner-ag-ui

## 1.7.0

### Minor Changes

- 88d71f3: An agent's activity can now be drawn: register a renderer with `config.registerActivityRenderer(type, renderer)`. AG-UI `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` are no longer dropped.

  ```ts
  const off = aparteGlobalConfig.registerActivityRenderer("search-progress", {
    render: (segment) => {
      const line = document.createElement("p");
      line.textContent = `${(segment.content as { read: number }).read} of 5 sources read`;
      return line;
    },
    update: (line, segment) => {
      line.textContent = `${(segment.content as { read: number }).read} of 5 sources read`;
    },
  });
  ```

  - `@aparte/engine`: a run event `activity` (`{ id, activityType, content, agentId? }`) in `StreamRunEvent`, and the same in a model call's stream (`StreamChatEvent`), which the loop passes on; a sub-agent's handle passes it on with its `agentId`. `content` is always the activity's WHOLE current value: a consumer never applies a patch.
  - `@aparte/core`: a built-in segment type, `AparteActivitySegment` (`{ type: 'activity', activityId, activityType, content }`), placed in the reply where the activity first arrived and updated in place by every later event with the same id — never a second segment, a reply resumed after a pause included: its new run's adapter finds the segment on the reply through the target's `getMessage` (which the viewport and a wrapper's host have) or, for a segment list, its `segments` — two new optional members of `StreamAdapterTarget`. The text it interrupts ends there and what follows is written after it, as around a tool call. It is drawn by the renderer registered for its type (`registerActivityRenderer` returns the function that takes it off; `getActivityRenderer` reads it); the renderer's `update` patches the same element, and without `update` it is drawn again from `render`. With no renderer for its type it is kept on the message and draws nothing — an empty hidden element, no room, no orphan header — and a renderer registered later, or after a reload, draws it. It is saved with the message, never copied with the reply's text, and never sent to the model: the wire history skips it by name. `activity` joins `AparteStreamEventMap`, so a provider can stream it. New types: `AparteActivitySegment`, `AparteActivityRenderer`.
  - `@aparte/runner-ag-ui`: `ACTIVITY_SNAPSHOT` becomes an `activity` with its content; `ACTIVITY_DELTA` is applied (RFC 6902, as `STATE_DELTA` is) to the content the runner holds for that message id, and the whole result is passed on. Per AG-UI 1.0, a snapshot with `replace: false` leaves an existing activity as it stands (content and type), and a delta for an activity no snapshot created is skipped with a warning, never failing the run; a patch that cannot apply leaves the activity as it was, with a warning. A sub-agent's activity is attributed by its `subagentRunId`, and its delta stays its own. The conformance lane now asserts the two activity fixtures' messages.
  - `@aparte/provider-scenario`: a script step `{ activity: { type, content, id? } }`; the same `id` later updates it, in the same turn or a later one; in a scripted sub-agent it is the sub-agent's.

  A sub-agent's activity lands in its own conversation with no change to `@aparte/plugin-subagents`: drawn under its line (`details: 'transcript'`) and in `<aparte-subagent-view>` by the same registered renderers.

- 43db964: A step the agent announces now shows while it runs: the waiting indicator says it beside its dots, and a sub-agent's line says its own. AG-UI `STEP_STARTED` / `STEP_FINISHED` are no longer dropped.

  ```ts
  // A sub-agent of your own loop announces one through its handle:
  agent.emit({ type: "step-start", name: "Reading the files" });
  agent.emit({ type: "step-end", name: "Reading the files" });
  // A scripted model:
  createScenarioProvider({
    turns: [
      [{ step: "Reading the parser" }, { tool: "read_file" }],
      [{ endStep: "Reading the parser" }, { text: "Done." }],
    ],
  });
  ```

  - `@aparte/engine`: two run events, `step-start` and `step-end` (`{ name, agentId? }`), in `StreamRunEvent`, and the same two in a model call's stream (`StreamChatEvent`), which the loop passes on. A sub-agent's handle passes them on with its `agentId`. Steps may nest and overlap; `step-end` ends the latest open step of its name.
  - `@aparte/core`: the stream adapter keeps the reply's open steps and tells the chat through a new optional target method, `setStep(messageId, name | null)`, only when the step to show changes, and with `null` when the run ends. The bubble's `setStep(name)` writes it in a `.aparte-waiting-step` span beside the dots while the reply waits (nothing written yet, or a call done and the next not begun), and makes it the screen reader's label in place of "Typing", announced politely as it changes. The viewport and a wrapper's host forward it; the host keeps it for a bubble the framework has not painted yet, so the wrappers need nothing. It is live only: never a segment, never saved, never sent to the model, and gone once the reply has text or ends. `step-start` / `step-end` join `AparteStreamEventMap`, so a provider can stream them.
  - `@aparte/runner-ag-ui`: `STEP_STARTED` / `STEP_FINISHED` become `step-start` / `step-end`, a sub-agent's attributed by its `subagentRunId`. A step still open when its sub-agent ends, or when the run ends (finished, failed, refused or stopped), is closed then, so nothing is left lit.
  - `@aparte/plugin-subagents`: a sub-agent's step is its line's second line while none of its calls runs; a running call wins, and when the step ends the line says what it said before. Kept apart from the sub-agent's saved conversation.
  - `@aparte/provider-scenario`: two script steps, `{ step }` and `{ endStep }`, in the same turn or across turns (a step can last across a tool call); in a scripted sub-agent the step is the sub-agent's.

- 504b70b: The plan card can be drawn from an agent's activity: `setupPlanCard({ activity: 'plan' })`. A TanStack AI router's plan now reaches the reply as a `plan` activity.

  ```ts
  import { setupPlanCard } from "@aparte/plugin-cards/plan";

  setupPlanCard({ activity: "plan" }); // AG-UI ACTIVITY_*, a sub-agent, a scenario
  setupPlanCard({ activity: ["plan", "todos"], tool: "update_plan" }); // both paths at once
  ```

  - **`@aparte/plugin-cards`**: every card's setup takes `activity` (a type or a list of types), so any
    card can be driven by an activity. The activity's content is read as the card's data (for the plan
    card, every shape `readPlan` reads: Claude Code's `todos`, Codex's `plan`, a Markdown checklist…).
    Each new content patches the same card in place; content that holds nothing to draw yet draws
    nothing, and an update the card cannot read leaves the card it drew.
  - **`@aparte/runner-ag-ui`**: TanStack AI 1.0 puts its router's plan on each direct child's
    `SUBAGENT_STARTED` (`metadata.tanstack.subagentPlan`, `{ steps: [{ names, order? }] }`), once. The
    runner now emits it as one `plan` activity of the reply (it is the parent's plan of its
    sub-agents, not a sub-agent's own): a step per agent in the router's order, in progress when the
    agent starts, done, failed or blocked when it ends. Steps the router moved past read as done.
  - **`@aparte/plugin-subagents`**: a sub-agent's conversation (under its line, in
    `<aparte-subagent-view>`) now follows activity and tool renderers registered after it was drawn,
    as a bubble does. Before, only a change of segment renderer redrew a row.
  - **`@aparte/core`**: `onRenderersChange(listener)` is exported, for a row loop written outside
    the bubble: it hears every segment, tool or activity renderer registered or taken off, once per
    config per microtask.

### Patch Changes

- acdac24: A TanStack AI sub-agent that paused for an approval now resumes: the runner sends the sub-agents' own messages back with the answer. Nothing to change in your code.

  - **The resume carries the sub-agents' messages.** TanStack AI continues a paused sub-agent only from
    its own messages, found after the last user message, each tagged with its `subagentRunId`, with
    its card in `metadata.tanstack.subagent` (name, status, the interrupts it waits on, the router's
    plan). The page's history never holds a sub-agent's words, so the resume carried none, and
    TanStack refused it: `Resume entry references unknown interrupt`. The runner now keeps what each
    sub-agent wrote and ran, hands it to the page in the pause's ticket, and sends it after the
    history on the resume. A sibling that had finished is sent as finished, so TanStack does not run
    it again; the answer to a browser tool a sub-agent called goes with that sub-agent's messages,
    after the one that declares the call. Only to TanStack AI (a run whose events carry
    `metadata.tanstack`): any other AG-UI agent keeps its sub-agents' work itself, and its resume is
    unchanged. Verified against TanStack AI 1.0's real `chat()`, with a router and with agent tools.
  - **One plan card across a pause.** The router's plan used the run's id, and a resumed run has a
    new one, so the resume drew a second card. The card's id now comes with the ticket, and so does
    what it had ticked; the page's resumed run updates the card in place (with `@aparte/core` of the
    same release, whose stream adapter finds an activity a paused run placed on the reply).
  - **A run's usage is its own when its sub-agents ran.** TanStack AI puts the sub-agents' model calls
    on the run's `RUN_FINISHED` too, after the run's own report, so the runner reported the last
    sub-agent call's usage as the reply's. It now reads the run's own (the first entry), and none
    when the run's own model never spoke (a router that only delegates).

## 1.6.0

### Minor Changes

- 570cdcc: A sub-agent's text and tool rows no longer show inside the reply; add `@aparte/plugin-subagents` to show one line per sub-agent.

  ```ts
  import { setupSubagents } from "@aparte/plugin-subagents";

  setupSubagents();
  ```

  - **What you see without the plugin.** The reply holds the agent's own text and tool rows only. The call that opened a sub-agent stays as an ordinary tool row, and the console says once that nothing draws sub-agents. Before, an AG-UI agent's sub-agents streamed into the reply as if the agent had written it, and their tool calls were rows of the reply.
  - **What the model reads.** A sub-agent's work is no longer part of the reply's history, so it is not sent back to the model on the next turn.
  - **AG-UI.** `@aparte/runner-ag-ui` translates `SUBAGENT_STARTED`, `SUBAGENT_FINISHED`, `SUBAGENT_ERROR` and the `subagentRunId` on a sub-agent's events: several sub-agents can stream at once, each keeps its own messages and calls, and an interrupt raised inside a sub-agent is asked about as that sub-agent's. Most agent frameworks announce sub-agents only when asked to (LangGraph's and Strands' `subagent_visibility="attributed"`, Mastra's `subagentVisibility: "attributed"`, ADK-JS's `subagents: "attributed"`); the [Sub-agents guide](https://apartejs.dev/guides/sub-agents/) lists them.
  - **Your own events.** An event that carries an `agentId`, and `agent-start` / `agent-end`, never reach the reply, whatever drew them: a backend that writes the engine's events as NDJSON for `createAgentStreamRunner` opens a sub-agent with `agent-start`, tags its events with its `agentId`, and closes it with `agent-end`. A `run-start`, `run-done`, `run-aborted` or `run-suspended` line that carries an `agentId` is dropped with a warning: a sub-agent never ends the run.

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

### Minor Changes

- 650610b: The AG-UI runner now asks for an approval on the interrupt reason `approval_required`, and sends the words of a refusal to the agent.

  `approval_required` is what the Laravel AI SDK sends. A refusal goes back as `{ approved: false, instruction }` when the person wrote what to do instead; the agent reads `approved` as before.

## 1.0.2

## 1.0.1

## 1.0.0

### Patch Changes

- Updated dependencies [26ddd6c]
- Updated dependencies [e97d464]
- Updated dependencies [0a6dd91]
- Updated dependencies [635f69b]
- Updated dependencies [224afde]
- Updated dependencies [2e5c5ab]
- Updated dependencies [67efebe]
- Updated dependencies [99fcc42]
- Updated dependencies [e97d464]
- Updated dependencies [048864d]
- Updated dependencies [99784ad]
  - @aparte/core@1.0.0

## 0.32.1

## 0.32.0

## 0.31.0

## 0.30.1

## 0.30.0

## 0.29.4

## 0.29.3

## 0.29.2

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
