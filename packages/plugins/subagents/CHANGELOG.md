# @aparte/plugin-subagents

## 1.17.0

### Minor Changes

- 6db770f: A step can say what it is about: `step-start` carries a `detail`, a new `step-update { name, detail }` changes it while the step stays open, and the step's label function is handed `detail` and the reply's `messageId`.

  A server waiting for a slot of a local engine knows who holds it, and the words belong to the page. A step carried its name alone and its label saw only that: an app kept the last holder in a module of its own, ended and restarted the step to have the words asked again, and two chats waiting showed the last one told. The detail travels with the step to the reply's waiting indicator and to a sub-agent's line, and the label is asked again when it changes. A second `step-start` of the same name still opens a nested step, as AG-UI's rule says: update a step with `step-update`. (apartejs/aparte#288)

- 8783037: A sub-agent whose own run stops before it answers (its turn limit, a call it could not make) now ends `partial`, with a `reason` and what it found as its `result`, and its line reads "Cut short" instead of Done.

  `runSubAgent` reported every such sub-agent as `done` with its last text, often empty after a round of tool calls, so the parent model read a finished answer and the line said Done above a transcript showing the turn limit's error. `StreamAgentStatus` and `AparteSubagentStatus` gain `'partial'`, `agent-end` gains `reason` (a `StreamAgentCutReason`: `turn-limit`, `timeout`, `no-handler`, `no-resolver`, `aborted` for a call that stopped itself, or `context` for a host's own loop), `runSubAgent` returns them, and a background sub-agent cut short is reported to the model as such. `aparte-subagent-end` carries the `reason` too. A host that matched every status exhaustively has one more to handle. (apartejs/aparte#285)

- 1f24530: A sub-agent can name the model it runs on: `agent-start` carries `model`, `runSubAgent` and `startSubAgent` fill it from their request (or take a `model` you give), and `setupSubagents({ model: true })` draws it quietly on the sub-agent's line.

  A host whose sub-agents run on other models than the conversation (a small local one beside the main) had only the name to show it, "Reader · qwen3:8b", which a host matching lines by name then had to strip. The model is kept on the segment, so a thread read back still says it. Off by default: every existing line would change. `aparte-subagent-start` carries it too, as `model`. (apartejs/aparte#286)

### Patch Changes

- 5aafbdc: A sub-agent announced with no call, under the id of one that already finished, now gets its own line instead of writing over the finished one's.

  A backend that mints sub-agent ids per run (the engine's default counter) names a resume's first detached sub-agent like the paused run's. A finished sub-agent never resumes, so its id announced again is a new one; only one left waiting or running goes on.

- 118707f: A sub-agent opened by another sub-agent, saved while it waited for an approval, now goes on on its own line in its parent's transcript when the reply is resumed after a reload.

  Its saved line was looked for in the reply's own segments only, so its resumed work was dropped, or went to a second, top-level line, and its call stayed awaiting approval. The plugin now finds it at any depth and takes up the sub-agents it sits under first. `createSegmentList` gains a `paused` option for that: a saved list taken up as a pause keeps its calls waiting for an approval open, where history aborts them.

- 89fa900: A nested sub-agent's conversation now shows both in the chat and in a view of its parent beside it, instead of moving between the two.

  With `details: 'transcript'`, the nested sub-agent's line is drawn inside its parent's transcript in the chat, and again in the view where the parent is opened. Both rows got the one element kept for that sub-agent, so each update moved it into the row that asked, and one of the two was always empty while it wrote. A view of its own now keeps its own elements.

- e93fd76: Changing the language, the icons or a tool while a sub-agent is open in a view no longer empties the nested sub-agent's conversation in the chat.

  The view relabelled its rows outside its drawing, with no surface: a nested sub-agent's row in the view asked for the chat's element of that conversation, and moved it into the view. The chat's row stayed empty until it was drawn again, which after the run's end may never come. Every pass over a view's rows now runs on that view's surface, a line's detail on the surface it sits in.

- 1e5b147: After a reload, the call that opened a sub-agent reads as working again once the sub-agent's question is answered, instead of staying "awaiting approval".

  While a sub-agent asks, the plugin marks the call that opened it as waiting and gives it back its progress once the question is answered. A lane taken up after a reload did not know the mark was its own, and left it.

- 8963bfe: A sub-agent saved while it waited now goes on, on its own line, when the reply is resumed after a reload, whether the resumed stream announces it again or not.

  After a reload the plugin knew no lane. Events for a sub-agent the resumed stream did not announce again were held until an announcement that never came, then dropped: the transcript kept a call that ran as waiting, then Stopped. Announced again with no call, the sub-agent got a second, empty line. The saved line is now found by the sub-agent's id, on its call or on a segment of its own, while it was waiting or working.

- 6d5eab5: A sub-agent heard before it names the call that opened it (an AG-UI agent whose first event arrives before `SUBAGENT_STARTED`) now moves onto that call: one line with all it said, and nothing marked Stopped.

  It got a line of its own first, as a sub-agent with no call does. Announced again with its call, it was taken for another sub-agent under the same id: the first line read Stopped and what it said was split across two lines. `createSegmentList` gains `removeSegment`, so a sub-agent's own transcript can take a line out as a reply can.

- 28327d1: A view disconnected from its chat, or shown a new conversation, follows the sub-agent it is named again, on whatever call it runs.

  `connectSubagentView` keeps a view on the call of the line pressed, since two sub-agents of one reply can share an id. That filter outlived the connection and the conversation: a sub-agent named on the view afterwards, on another call, was never drawn live.

- a76de60: Open on the second of two sub-agents that share an id and have no call now shows that second one, and only its line reads as shown.

  Since each such sub-agent has a line of its own, the view still told sub-agents apart by the call of the line pressed, and these lines have none: Open showed the first, and both lines were marked current. A line of its own is now told apart by its own segment.

- 74ba274: An Escape that ends an IME composition in a field inside `<aparte-subagent-view closable>` or `<aparte-artifact-panel>` no longer closes the pane.

  A Japanese or Chinese reader cancelling a conversion candidate in a field inside the pane (a diff comment, say) folded it mid-composition: the field now leaves that Escape to the composition, and the pane read it as its own.

- 4a838b8: Open on a sub-agent's line now shows that sub-agent in the view, even when another sub-agent of the reply has the same id.

  A backend that mints sub-agent ids per run names a resume's first one like the paused run's. The view took the first sub-agent under that id, drew the other's writes over it while it ran, and both lines read as the one shown. `connectSubagentView` now hands the view the call of the line pressed, and only that line is marked.

## 1.16.0

### Patch Changes

- 0ad9f5c: A reply, or a sub-agent's conversation, no longer loses its last words when the server sends no `text-flush` before the next call or the run's end.

  Nothing to change in your code. The stream parser holds a delta that ends on a backtick (or on the start of a block tag) until more arrives, and only `text-flush` handed it over. aparté's own runner sends one at the end of every model call; a server loop of one's own may not (apartejs/aparte#275). Then a reply ending on inline code lost it, and was saved that way: "La valeur est `42`" in one delta showed nothing at all. The text is now handed over at every `turn-start` and at the run's end (done, suspended, stopped), and a sub-agent's at its own end and at the run's; after a `text-flush` there is nothing left to hand over, so nothing appears twice. The server-loop guide's wire example closes each call with `text-flush`.

## 1.15.1

## 1.15.0

## 1.14.0

## 1.13.1

## 1.13.0

## 1.12.2

## 1.12.1

## 1.12.0

### Minor Changes

- ff23780: A fold of sub-agents can say where they stand: `setTurnSummary({ label: subagentsTurnLabel })` writes the fold's line as "3 sub-agents · 1 done, 2 running" (#247). `label` takes any function of yours too.

  `setTurnSummary` takes a `label` function, called with the fold's steps, `running` and the chat's config each time they change; a string replaces core's line ("Working", "Worked 9 s · 7 tools") and the running step's name, `null` keeps them. A line of the app's is a polite live region; one that throws leaves core's line. `@aparte/plugin-subagents` exports `subagentsTurnLabel`, which counts the fold's sub-agents by state in the chat's language, with six locale keys (`subagentsCount`, `subagentsDone`, `subagentsRunning`, `subagentsWaiting`, `subagentsFailed`, `subagentsStopped`) in the ten languages, and leaves core's line under two sub-agents.

  The headline goes on the fold core already draws, moves and keeps up to date, not on a second grouping of rows: with `openWhileRunning` the lines show under it while the sub-agents work. A sub-agent that waits for the person or failed stands out of the fold, where it has to be read.

## 1.11.0

## 1.10.1

## 1.10.0

### Minor Changes

- 5f96251: A plugin's element can now be used from React as a typed component: `createAparteElement(approvalModeElement)` from `@aparte/react`. Each plugin exports a spec for its element (`approvalModeElement`, `modelSelectorElement`, `triggersElement`, `diffElement`, `subagentViewElement`, `askUserElement`, and `artifactPanelElement` from `@aparte/plugin-artifacts/panel`), and Vue and Svelte type the tag from it with `AparteVueElement<typeof spec>` and `AparteSvelteElement<typeof spec>`.

  ```tsx
  const ApprovalMode = createAparteElement(approvalModeElement);
  <ApprovalMode
    labels={{ ask: "Ask first" }}
    onApprovalModeChange={(detail) => save(detail.mode)}
  />;
  ```

  The spec is core's new `AparteElementSpec` type — the tag, its attributes, the members it has only as a property, its events with the name each binds under, and what it reads at connect — with phantom generics, so the attribute, property and event types travel with the value (`AparteSpecAttributes`, `AparteSpecProperties`, `AparteSpecEvents` read them back). It is data and defines nothing. A plugin generates its specs from its manifest; a third party writes one literal and every wrapper binds it the same way, since a plugin can depend on core but never on a wrapper. In Angular, a plugin's element takes `CUSTOM_ELEMENTS_SCHEMA`, as any custom element does.

  Deprecated: `@aparte/plugin-model-selector/react`, `/vue`, `/svelte` and `/angular`. They keep working until the next major; use `modelSelectorElement` the same way as any other plugin's spec.

- 73253c3: A tool's display can now set the row's `note` and `activity` (text, or a function of the call), and `registerToolLineProvider()` adds a tool-line provider without replacing the one the app set.

  The app's display wins over a provider, field by field. Providers are asked in order, `setToolLineProvider()` first, and the first one that answers a call wins; `registerToolLineProvider()` returns the function that removes it, and `getToolLineProviders()` lists them. `setToolLineProvider()` is unchanged. `@aparte/plugin-subagents` registers its provider instead of setting it, so it no longer overwrites the app's.

### Patch Changes

- 9696160: `aparte-subagent-open` now names its chat in `targetId` under a framework wrapper too, not only inside `<aparte-chat>`.

  The line looked for the `<aparte-chat>` tag, and the React, Vue and Svelte wrappers render a `[data-aparte-chat]` root instead, so on those three the event came without the chat's id. It now finds its chat the way every chat-scoped event does (`chatIdOf`). A line in a standalone `<aparte-subagent-view>` still names the chat that view reads (`for`, or `chat`), wherever the view is mounted.

## 1.9.0

### Minor Changes

- 378700e: A link in a sub-agent's conversation shown beside the chat (`<aparte-subagent-view>`) now fires the chat's cancelable `aparte-link-click`, so the listener that routes a reply's links routes it too.

  - **Why.** Beside the chat the view is outside every message, so no message heard a click in it, and a same-site link a sub-agent wrote replaced the page.
  - **Where.** On the chat the view reads (`for`, `chat`, or the element an app's handle names with `getElement()`), with the reply's `messageId`; a view that names no chat sends it on itself. A source the sub-agent cited goes to the chat the same way. Under a line, or anywhere else inside the reply (a view an app's own renderer places in a message), the message announces it, once. Where the link opens follows the chat's link target (`setLinkTarget`).

### Patch Changes

- 2e9e776: Show a step in the page's language: `config.registerStepLabel('reread', ({ locale }) => …)` maps the key a server sends in `step-start` to the words the page shows.

  ```ts
  aparteGlobalConfig.registerStepLabel("slot-wait", "Waiting for a free slot…");
  aparteGlobalConfig.registerStepLabel("reread", ({ locale }) =>
    locale.tag?.startsWith("fr")
      ? "Relecture de la conversation…"
      : "Re-reading the conversation…",
  );
  ```

  Do you have to touch your code? No: a step nobody labelled is shown as its name, as before. If you rewrite every `step-start` name in a stream runner to reach the page's language, you can stop: the name then stays the key in the run, for a screen reader's text and for what you store.

  - **Where it shows.** The waiting indicator beside the dots, the words a screen reader hears in place of "Typing", and a sub-agent's line (`@aparte/plugin-subagents` reads the same label).
  - **Live.** A function label is asked again at every change of the locale, and registering a label, or taking it off with the function `registerStepLabel` returns, relabels a step that is already open.
  - **Only what is shown is labelled.** The `step-start` and `step-end` events, `observeRunEvents`, the target's `setStep` and anything an app stores keep the key; a step was never saved with the reply.
  - **Per config.** One label per name, as the tool displays are: a chat with a config of its own reads that config's labels, not the page's. `getStepLabel(name)` answers what is registered for a name, or `undefined`.
  - **Typed.** `AparteStepLabel` and `AparteStepLabelContext` (`{ name, locale }`) are exported. No key is added to `AparteLocale`: the labels are the app's.

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
