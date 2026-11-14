# @aparte/plugin-subagents

## 1.8.0

### Patch Changes

- b85cd5e: Tool calls run one after another again unless the tool says `parallel: true`; a call waiting for an approval holds the calls after it; `createAparteAgentHandler` and `AparteClient` take `parallelTools`.

  ```ts
  // A coding agent: reads run together, the edit and the command keep their order.
  aparteGlobalConfig.registerTool(
    { name: "read_file", description, inputSchema, parallel: true },
    readFile,
  );
  aparteGlobalConfig.registerTool(
    { name: "edit_file", description, inputSchema, needsApproval: true },
    editFile,
  );
  aparteGlobalConfig.registerTool(
    { name: "run_command", description, inputSchema },
    runCommand,
  );

  // A tool from an MCP server: it may run beside others when it says it only reads.
  const parallel = mcpTool.annotations?.readOnlyHint === true;

  // Every call one after another, `parallel` tools too:
  new AparteClient({ parallelTools: false });
  createAparteAgentHandler({ ...options, parallelTools: false });
  ```

  Do you have to touch your code?

  - If you relied on 1.7.0 running the calls of one reply at the same time: give those tools `parallel: true` (on `AparteTool`, on a server tool's `tool`, or on `StreamToolConfig` for `runStreamAgent`).
  - If you time a call from its `tool-start`: `tool-start` now comes when the model writes the call, before it runs, so a call that waits its turn counts its time in the queue. A queued call (`queued: true`) runs from its `tool-running`.
  - If you `switch` exhaustively on `StreamRunEvent['type']` (or `AparteStreamRunEvent['type']`): the new `tool-running` event needs a case.

  Fixes #202.

  Since 1.7.0 every call of one model step ran at the same time. For a coding agent that broke what the model meant: `edit_file` then `run_command` raced, and with an approval policy the command (allowed) ran while the person was still being asked about the edit, on the file as it was. A server loop could not opt out at all.

  - **A call keeps its place by default.** A call of a tool that says nothing starts once every call made before it in the same reply has settled, and the calls made after it start once it has: the order every tool had until 1.7.0, for anyone who does nothing. Calls of tools that say `parallel: true` run together, between the calls that keep their place. This is the rule coding agents follow — read-only tools together, writes and commands one at a time — and it maps onto MCP's annotation: `parallel: tool.annotations?.readOnlyHint === true`.
  - **A call waiting for an approval holds the calls after it**, `parallel` ones included. While a call waits for a person's answer (or the policy's), the calls the model made after it in the step do not start; the calls made before it keep running. An approval lets them start; a refusal skips them all, each answered "Not run: an earlier call of the same step was refused." (`by: 'earlier-refusal'`). This changes 1.7.0, where the calls that needed no approval ran meanwhile.
  - **A call waiting its turn shows where the model wrote it, queued.** Every call gets its `tool-start` as it is read, so its row stands before the text the model wrote after it. One that cannot run yet carries `queued: true`, and the new run event `tool-running { toolCallId }` says when it goes on (never sent for a call that went on at once). A queued call a refusal reaches is rejected as an earlier refusal; one a Stop reaches ends as `tool-aborted` (`'stopped'`). The server loop's NDJSON carries both, and `createAgentStreamRunner` hands them on.
  - **`AparteToolCallSegment.queued`** (`true`, beside `status: 'pending'` — the `status` union is unchanged): the adapter sets it on a queued `tool-start` and removes it once the call goes on or ends. The row reads **Queued** (new locale key `toolQueued`, in all nine `@aparte/locales` bundles) with no spinner and no shimmer, its name in the muted ink, and the row carries `data-queued`. Live only: a restored conversation never keeps it. The turn summary names the step that runs, not one that waits, and so does a sub-agent's line.
  - **`parallelTools`** keeps its meaning — run together the calls whose tools allow it, `true` by default — and `false` still runs every call one after another. `createAparteAgentHandler` and `AparteClient` now take it and pass it to the run, as they pass `maxTurns`.
  - **`parallel`** is new on `AparteTool` and on `StreamToolConfig`; `AparteClient` and `createAparteAgentHandler` hand a registered tool's `parallel` to the loop, as they hand its `needsApproval`. A sub-agent's run follows the same rule, through its run's tool configs.
  - `@aparte/provider-scenario`'s `scenarioSubagentTool` says `parallel: true`, so two delegations of one reply still run side by side.

  What stays as in 1.7.0: the history is in call order, a person is asked about one call at a time, a Stop or the turn limit stops every call of the step, and with `deferral` a call that pauses does not stop the calls already running (the calls made after it are queued with the pause, and the resume runs them in order).

## 1.7.0

### Minor Changes

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

- b921d2e: A sub-agent's line can open its conversation beside the chat: `setupSubagents({ open: 'event' })` and `connectSubagentView({ chat, view, split })`. Without the option, nothing changes.

  ```ts
  import {
    connectSubagentView,
    setupSubagents,
  } from "@aparte/plugin-subagents";

  setupSubagents({ open: "event" });
  connectSubagentView({
    chat: document.getElementById("chat")!,
    view: document.querySelector("aparte-subagent-view")!,
    split: document.querySelector("aparte-split")!,
  });
  ```

  - `@aparte/plugin-subagents`: `open: 'event'` puts an Open button (core's button recipe, named "Open Researcher" in the chat's ten languages) at the end of each sub-agent's line. Pressing it — click, Enter or Space — dispatches `aparte-subagent-open` (`AparteSubagentOpenEventDetail`: `targetId?`, `messageId`, `agentId`, `name?`, `toolCallId?`), bubbling and composed. A line with nothing behind it also opens on a click anywhere on it; with `details` too, the line keeps toggling its detail and only the button opens elsewhere, so one click never means two things. `connectSubagentView` points an `<aparte-subagent-view>` at the sub-agent, opens the split's second pane (on a phone the split shows the view, then the chat again), marks the open line (`data-current` on the row, `aria-current="true"` on its button) and returns a function that undoes it all. Without a split, `onOpen` and `onClose` hand the layout to the app. A sub-agent's own sub-agents, drawn as lines in the view, open in the same view.
  - `<aparte-subagent-view closable>`: the sub-agent's name and a Close button above its conversation; Close, or Escape inside the view, dispatches `aparte-subagent-view-close` (the view does not hide itself). `connectSubagentView` sets it, folds the pane on it and puts the focus back on the line's button. `focusTitle()` puts the focus on the name. A view opened while its sub-agent works now reads it from the plugin's last write when the chat does not hold it yet (a framework that mirrors the messages a step behind).
  - `@aparte/core`: `AparteToolLine.open` (`AparteToolLineOpen`: `label`, `onOpen(row)`, `current?`) — a tool-line provider can say a call can be shown elsewhere. Core draws the button at the end of the line, calls `onOpen` with the row, and keeps the button's name and the `current` marks in step on update and relabel. On a row with a detail the button stays out of the `<summary>` (a control inside it is no control of its own): the row is then a `div` wrapping its `<details class="aparte-tool-disclosure">`, the button in an `.aparte-tool-open-slot` beside it, at the same place on the line. Without `open`, the row is unchanged.

### Patch Changes

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

## 1.6.0

### Minor Changes

- 570cdcc: New `@aparte/plugin-subagents`: one line per sub-agent in the reply — its name, its task, what it is doing now, and "3 tools · 12s" — with its conversation under the line or in a pane of its own.

  ```bash
  npm install @aparte/plugin-subagents
  ```

  ```ts
  import { setupSubagents } from "@aparte/plugin-subagents";

  setupSubagents(); // the line alone
  setupSubagents({ details: "transcript" }); // the line opens on the sub-agent's conversation
  ```

  - **The line.** A sub-agent opened by a tool call is drawn on that call's row, so `registerToolDisplay` for that tool still applies and wins (`label`, `icon`, `summary`, `quiet`, `hidden`, `open`, `details`). A sub-agent no call opened, or a second one opened by the same call, gets a line of its own, reached by the agent's name. The line reads one of five states: Running, Waiting, Done, Failed, Stopped.
  - **Options** (`SubagentsOptions`): `activity` (a second line from its start to its end: _Starting…_, its latest tool call, then what it did — so the row keeps its height; on by default), `counts` (its tool calls and how long it worked, once it is over; on by default), `details` (`false` by default, `'transcript'`, or a function). `subagentTranscript` is the conversation as a `details` function, for one tool's line.
  - **Anywhere else.** `<aparte-subagent-view for="chat" message-id="…" agent-id="…">` shows a sub-agent's conversation in a pane, a canvas or a dialog, live and after a reload. The chat dispatches `aparte-subagent-start` and `aparte-subagent-end`, which carry those ids.
  - **Saved with the conversation.** The sub-agent's conversation is kept on the segment that stands for it and never sent to the model. `subagentOf(segment)` and `subagentStatus(segment)` read it back, in Node too; `subagentStatus` reads `stopped` for a sub-agent a reload or a Stop left unfinished.
  - The words are translated in the ten languages of `@aparte/locales` (`subagentsTools`, `subagentsUnnamed`, through `extendLocale`). `@aparte/core` is the only peer dependency.

  Guide: [Sub-agents](https://apartejs.dev/guides/sub-agents/).
