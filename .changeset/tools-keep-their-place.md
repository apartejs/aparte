---
'@aparte/engine': minor
'@aparte/core': minor
'@aparte/provider-scenario': patch
'@aparte/locales': minor
'@aparte/plugin-subagents': patch
---

Tool calls run one after another again unless the tool says `parallel: true`; a call waiting for an approval holds the calls after it; `createAparteAgentHandler` and `AparteClient` take `parallelTools`.

```ts
// A coding agent: reads run together, the edit and the command keep their order.
aparteGlobalConfig.registerTool({ name: 'read_file', description, inputSchema, parallel: true }, readFile);
aparteGlobalConfig.registerTool({ name: 'edit_file', description, inputSchema, needsApproval: true }, editFile);
aparteGlobalConfig.registerTool({ name: 'run_command', description, inputSchema }, runCommand);

// A tool from an MCP server: it may run beside others when it says it only reads.
const parallel = mcpTool.annotations?.readOnlyHint === true;

// Every call one after another, `parallel` tools too:
new AparteClient({ parallelTools: false });
createAparteAgentHandler({ ...options, parallelTools: false });
```

Do you have to touch your code? Only if you relied on 1.7.0 running the calls of one reply at the same time: give those tools `parallel: true` (on `AparteTool`, on a server tool's `tool`, or on `StreamToolConfig` for `runStreamAgent`). Fixes #202.

Since 1.7.0 every call of one model step ran at the same time. For a coding agent that broke what the model meant: `edit_file` then `run_command` raced, and with an approval policy the command (allowed) ran while the person was still being asked about the edit, on the file as it was. A server loop could not opt out at all.

- **A call keeps its place by default.** A call of a tool that says nothing starts once every call made before it in the same reply has settled, and the calls made after it start once it has: the order every tool had until 1.7.0, for anyone who does nothing. Calls of tools that say `parallel: true` run together, between the calls that keep their place. This is the rule coding agents follow — read-only tools together, writes and commands one at a time — and it maps onto MCP's annotation: `parallel: tool.annotations?.readOnlyHint === true`.
- **A call waiting for an approval holds the calls after it**, `parallel` ones included. While a call waits for a person's answer (or the policy's), the calls the model made after it in the step do not start; the calls made before it keep running. An approval lets them start; a refusal skips them all, each answered "Not run: an earlier call of the same step was refused." (`by: 'earlier-refusal'`). This changes 1.7.0, where the calls that needed no approval ran meanwhile.
- **A call waiting its turn shows where the model wrote it, queued.** Every call gets its `tool-start` as it is read, so its row stands before the text the model wrote after it. One that cannot run yet carries `queued: true`, and the new run event `tool-running { toolCallId }` says when it goes on (never sent for a call that went on at once). A queued call a refusal reaches is rejected as an earlier refusal; one a Stop reaches ends as `tool-aborted` (`'stopped'`). The server loop's NDJSON carries both, and `createAgentStreamRunner` hands them on.
- **`AparteToolCallSegment.queued`** (`true`, beside `status: 'pending'` — the `status` union is unchanged): the adapter sets it on a queued `tool-start` and removes it once the call goes on or ends. The row reads **Queued** (new locale key `toolQueued`, in all nine `@aparte/locales` bundles) with no spinner and no shimmer, its name in the muted ink, and the row carries `data-queued`. Live only: a restored conversation never keeps it. The turn summary names the step that runs, not one that waits, and so does a sub-agent's line.
- **`parallelTools`** keeps its meaning — run together the calls whose tools allow it, `true` by default — and `false` still runs every call one after another. `createAparteAgentHandler` and `AparteClient` now take it and pass it to the run, as they pass `maxTurns`.
- **`parallel`** is new on `AparteTool` and on `StreamToolConfig`; `AparteClient` and `createAparteAgentHandler` hand a registered tool's `parallel` to the loop, as they hand its `needsApproval`. A sub-agent's run follows the same rule, through its run's tool configs.
- `@aparte/provider-scenario`'s `scenarioSubagentTool` says `parallel: true`, so two delegations of one reply still run side by side.

What stays as in 1.7.0: the history is in call order, a person is asked about one call at a time, a Stop or the turn limit stops every call of the step, and with `deferral` a call that pauses does not stop the calls already running (the calls made after it are queued with the pause, and the resume runs them in order).
