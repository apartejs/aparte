# @aparte/provider-scenario

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

## 1.6.0

### Minor Changes

- 570cdcc: A scripted turn can now delegate to scripted sub-agents: add a `{ subagents: [...] }` step, and register the tool that runs them with `scenarioSubagentTool(provider)`.

  ```ts
  import { aparteGlobalConfig } from "@aparte/core";
  import {
    createScenarioProvider,
    scenarioSubagentTool,
  } from "@aparte/provider-scenario";

  const provider = createScenarioProvider({
    turns: [
      [
        {
          subagents: [
            {
              name: "Reader",
              task: "Read the parser",
              turns: ["It splits on commas."],
            },
          ],
        },
      ],
      "The parser splits on commas.",
    ],
  });
  aparteGlobalConfig.registerAIProvider(provider);
  const { tool, handler } = scenarioSubagentTool(provider);
  aparteGlobalConfig.registerTool(tool, handler);
  ```

  The step makes the model call one ordinary tool, `delegate`, with `{ agents: [{ name, task }] }`, as a real model would. Each `ScenarioSubagent` has a `name`, a `task` and the `turns` its own model plays; the handler runs each one through the real agent loop as a sub-agent, so its `{ tool }` steps run your registered handlers, and several in one step run side by side. The model reads back each sub-agent's last text; one that fails is said in a sentence and does not fail the call. `toolName` on the step and `scenarioSubagentTool(provider, { name })` rename the tool; with `scenarios`, route the answer with `after: 'delegate'`. Add `@aparte/plugin-subagents` to see one line per sub-agent.

  A sub-agent's turn can also be a function of the request its loop sends, `(request) => turn`, so a script can answer what its tool returned: a build runner that says so when its command was refused.

- 9c3de09: A tool can now start a sub-agent in the background and let the chat go on: call `startSubAgent(context.run, { name, request })` from its handler and return at once.

  ```ts
  import { startSubAgent, type AparteToolHandler } from "@aparte/core";

  const research: AparteToolHandler = async (call, _signal, context) => {
    startSubAgent(context!.run!, {
      name: "Researcher",
      request: {
        modelId: "gpt-4.1-mini",
        messages: [{ role: "user", content: String(call.input["question"]) }],
      },
    });
    return {
      toolCallId: call.id,
      content: "The researcher is on it; its answer comes back to you.",
    };
  };
  ```

  - **While it works**, the model goes on writing and calling its own tools, and the sub-agent has a line of its own. The reply does not end before it is back: once the model has nothing more to say, the loop waits for the sub-agents still at work, tells the model how each ended in one user message, and asks it again.
  - **It stops with the run**: Stop, the turn limit, the tool time limit counted from its start, or a crash.
  - **Not in a server loop**: a run that can pause would end at the pause without what it answered, so `startSubAgent` throws there (`run.canBackground` is false); use `runSubAgent`.
  - **What the model was told stays in the run**: the next turn's history is drawn from the reply, so it holds the model's answer to the sub-agents, not the message that told it how they ended.
  - **`runSubAgent` is unchanged**: it holds its call until the sub-agent is back.
  - **In the engine**, `StreamToolRun.startAgent` takes `background`, `StreamToolRun` gains `canBackground`, and `StreamAgentHandle` gains `signal`, what its work answers to.
  - **In `@aparte/provider-scenario`**, a `subagents` step takes `background: true`: the next scripted turn plays while they work.

## 1.5.0

## 1.4.0

## 1.3.0

## 1.2.0

## 1.1.2

## 1.1.1

## 1.1.0

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

### Minor Changes

- c552926: The showcase answers two more requests: ask it for maths, or for a diagram.

  `math` replies with inline and display formulas and a sentence of prices that must stay text; `diagram` replies with a ` ```mermaid ` flowchart. With `@aparte/plugin-katex` and `@aparte/plugin-mermaid` installed they are drawn; without, they show as TeX and as code. Both come before `code`, whose `when` would otherwise take "a maths example".

- c9120ab: A scenario turn can now carry sources and citations: a new `{ sources, citations? }` step, and a showcase answer that uses it ("why is the sky blue?", or ask for "sources").

  `sources` lists the sources a reply draws on and `citations` places each one in the text, so a demo or a test can show the chips and the source card without a model that searches. The step goes after the text it cites: a citation's `start` and `end` are UTF-16 offsets into the text the turn has streamed so far (its `text` steps joined, `end` exclusive). Source ids are unique within the turn.

  The showcase gains a `citations` scenario: three paragraphs on Rayleigh scattering citing three sources (en.wikipedia.org, nasa.gov, britannica.com), one passage citing two of them so the chip shows "+1". It is placed before `code`, so "cite an example" reaches it while "show me the source code" still reaches `code`; its offsets are found in the passages rather than counted. The showcase's default message now lists it among the things to ask for.

## 0.27.4

## 0.27.3

## 0.27.2

## 0.27.1

## 0.27.0

## 0.26.0

### Minor Changes

- 1f62ccc: A scripted turn can end with `{ finishReason: 'length' }` to set `finishReason` on its `done` event, so a demo can show the "cut off" note.

  A turn that declares none reports none, as before.

## 0.25.0

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

### Patch Changes

- 339a8e3: A scripted `{ usage }` step that overrides `inputTokens` or `outputTokens` now moves `totalTokens` with it; set `totalTokens` too to pin it.

  The total was computed from the estimates before the step's fields were merged over them, so `{ usage: { inputTokens: 900 } }` left the estimated total in place — and the context gauge reads the total first, so overriding the input alone moved nothing on it.

## 0.19.3

## 0.19.2

## 0.19.1

## 0.19.0

## 0.18.0

## 0.17.3

## 0.17.2

## 0.17.1

## 0.17.0

### Minor Changes

- edd2f06: A tool turn is now an `assistant` message carrying `toolCalls` and a `tool` message carrying `toolCallId`; the `'tool_call'` and `'tool_result'` roles are gone.

  **Who has to change something.** Only code that BUILDS an `AparteChatMessage[]` by hand: a `history` function, a `requestInterceptor` that inspects roles, or a host mirroring `onHistoryAppend` into a log of its own. Nothing that uses `AparteClient` normally, and no provider you did not write yourself.

  **The mapping**, as two lines:

  ```diff
  - { role: 'tool_call',   content: '', precedingText: T, toolCalls: C }
  + { role: 'assistant',   content: T,                    toolCalls: C }

  - { role: 'tool_result', content: R, toolCallId: I }
  + { role: 'tool',        content: R, toolCallId: I, toolName: N }
  ```

  `precedingText` is **removed, not deprecated** — no alias, no compatibility shim: before 1.0 a rename is a rename, and the type error is the migration. What it carried is the assistant message's own `content`; an assistant that said nothing before its calls carries `''`.

  `toolName` is new and optional, on a `tool` message. Set it and the AI SDK bridge stops guessing `'unknown'` for a result whose call it cannot find, and `@aparte/provider-scenario` routes on the name without scanning back. Both still fall back to the declaring assistant message when it is absent.

  **Your stored conversations need nothing.** Persistence holds `AparteMessage`, whose role is always `user` or `assistant`; no tool turn was ever written to IndexedDB. The conversation schema version is unchanged.

  **If you hold the envelope by reference** — the rule `onHistoryAppend` already stated for `toolCalls` — note that `content` is now the field that is finalised after you are notified: a provider that streams text after its first call re-reads it at the turn's end. Hold the reference, not a snapshot, or serialise only once the turn's last `tool` message has arrived. A snapshot used to lose a trailing clause; it now loses the whole sentence.

  Why the shape changed: every message API in use — OpenAI-compatible, Anthropic, the AI SDK — expresses a tool round-trip as an assistant turn that declares its calls plus one message per result. Two roles of our own meant every provider translated on the way out, every consumer learned a vocabulary that matched no documentation they had read, and the assistant's own sentence lived in a field (`precedingText`) that only this library had a name for. This is the last known structural breaking change to the message type before the beta.

- 33bf7bd: Import `showcase` from `@aparte/provider-scenario/showcase`; the root export is deprecated and removed in this release. One line changes: `import { createScenarioProvider, showcase } from '@aparte/provider-scenario'` becomes an import of `createScenarioProvider` from the root and one of `showcase` from `@aparte/provider-scenario/showcase`. Nothing else moves — the scenario format, `createScenarioProvider`, `defaultMatch` and `playTurn` are untouched.

  `showcase` is a demo corpus, not a capability: twelve scripted turns with their markdown, their code block, their reasoning and their artifact, about 4 kB of the package. It sat on the root barrel, so a consumer who wrote their own scenarios shipped it anyway — runtime laziness is not distribution weight, and the lever for weight is a separate entry point, not a flag.

  The provider and the corpus now build as two entries, and the scenario page, the README and the docs' live frames all import it from the subpath.

### Patch Changes

- e573758: `createScenarioProvider` now warns about a tool with no `after` route even when you pass a `match` of your own. Nothing to change in your code — when a `match` is present the warning ends with _this line is the one to ignore_, because a `match` that routes the tool result by value (the documented branching shape) does not loop.

  The warning exists because a `when` scenario that calls a tool, with nothing answering the result, loops: the default rule sends the tool result back through the same `when`, round after identical round, until the client's `maxTurns` stops it.

  Passing `match` used to switch that warning off, on the premise that a custom rule replaces the default one. It does not replace it, it precedes it — the pick reads `match(request, scenarios) ?? defaultMatch(request, scenarios)` — so a `match` that returns `undefined` for a tool result, which is exactly what the documented and in-repo examples write, lands right back on the rule the warning protects. The exemption was silencing the shape most likely to need it.

- 7802512: `turns` documents that its cursor belongs to the provider, not to a chat. No behaviour change.

  Two chats registered against one provider take turns from the same script and interleave it — chat A gets `turns[0]`, chat B `turns[1]` — because a request carries no conversation identity to key a cursor on. The JSDoc now says so and names the two ways out: a provider per chat (`createScenarioProvider` is cheap and takes an `id`), or `scenarios`, which answers from the request itself and has no cursor at all.

- 029c44b: The showcase scenario answers "ship it" with a four-step tool chain — search, read, write, run — so a multi-tool turn can be seen. Register `search_docs`, `read_file`, `write_file` and `run_command` if you want the chain to resolve; unregistered tool names abort the call, exactly as `get_weather` and `ask_user` already did.

  Every other scenario calls ONE tool and answers its result, so the turn a real agent produces — several calls in a row, each feeding the next — was the one shape nothing in this repository could show. It is what a transcript has to survive: five rows stacked in one bubble, an approval decision landing in the middle of them, a refusal cutting the rest of the turn.

  Each tool in the chain carries its own `after:` route (`releaseRead`, `releaseWrite`, `releaseRun`, `releaseDone`), because a tool whose result is not routed falls back through the `when` that started the chain and the conversation eats its own tail — the warning `createScenarioProvider` prints at creation.

## 0.16.11

## 0.16.10

## 0.16.9

## 0.16.8

## 0.16.7

### Patch Changes

- 9df0877: Every package names its documentation page (`homepage`) — nothing in the code changes.

  npm shows the link first on each package page; none of the twenty had one. Each now
  points at its own docs page, verified live before it was written.

- 44a3611: The `{ text }` docs no longer say core parses markdown — a markdown plugin renders it.

  Without `@aparte/plugin-marked` or `@aparte/plugin-streaming-markdown`, scripted text
  streams as plain text, `**stars**` included. The docs said "parsed by core", which is
  not what ships: core deliberately has no markdown renderer. Wording only.

- 8f9d56f: A `scenarios`-mode tool call without its `after` route warns at creation.

  `when` plus a turn containing a tool is perfectly plausible to write — and the default
  match then routes the tool result back through the same `when`: identical rounds until
  the client's `maxTurns` error. The hole is visible at creation, so it is said at
  creation, naming each unrouted tool. Ordered `turns` mode and a custom `match` are
  exempt.

## 0.16.6

## 0.16.5

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

### Patch Changes

- 0556897: A `match()` that returns something other than a scenario key — the scenario object, an unknown name — is said in the console, naming what it returned and the keys the provider knows, instead of streaming an empty turn in silence ("Typing…" forever, issue #29). The value-branching pattern — the tool's result carries the answer, `match` reads it back from the last `tool_result` — is documented.

## 0.15.1

## 0.15.0

### Patch Changes

- 47dddaa: The `showcase` preset gains a `survey` turn — "two questions", "a few questions" or "survey" makes the model ask two questions in one `ask_user` call, so the panel's stepper (1 2, a Skip per step) has a scenario that shows it. Nothing in the repository rendered that mode until a consumer reported clipped borders on it; a state no example renders is a state nobody looks at.

## 0.14.0

### Minor Changes

- 1912df6: New package: `@aparte/provider-scenario`, a scripted model. `createScenarioProvider({ turns })` answers the model's calls in order; `createScenarioProvider({ scenarios })` picks a named turn by `when` (the last user message) or `after` (a tool's result). A turn is text streamed at a typing pace, thinking, a tool call the real loop runs, an error, a pause, a usage override. `showcase` is a ready-made set covering the whole surface of a chat. No key, no network, no dependency of its own.

  Three things in this repository had written it by hand: the browser suite's wire mock, the UI audit's screenshot harness, the docs' live frames. It is also the piece nobody ships for consumers — a deterministic model for their own tests, and a demo that streams without a backend. The repository's browser suite keeps its network mock on purpose: it tests the wire path this provider bypasses.
