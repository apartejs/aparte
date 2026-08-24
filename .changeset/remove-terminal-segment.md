---
'@aparte/core': minor
'@aparte/react': minor
'@aparte/vue': minor
'@aparte/svelte': minor
'@aparte/angular': minor
---

**Removed: the `terminal` segment type, with its event and its host handler.** Breaking, pre-1.0, no shim.

Gone from core: `{ type: 'terminal' }`, `AparteTerminalSegment`, the renderer, 117
lines of CSS and 11 `--aparte-terminal-*` variables, the `aparte-terminal-run` event
and its `AparteTerminalRunEventDetail`, and the `terminalRun` host handler. The four
wrappers stop re-exporting the two types. Core ships eight segment kinds now.

**No protocol has a "terminal".** When ChatGPT shows one, that is a **tool call**: the
model emits a call whose arguments are code, and the client renders the *result* in a
monospace pane. Same in a console agent — `bash` is a tool, the app runs it, the app
prints the output. The name in the wire format is the tool's (`code_interpreter`,
`bash`, `run_command`); "terminal" is a UI convention, not a kind of content.

The evidence was in the type all along. `exitCode` and `isRunning` are not things any
protocol provides — a tool result is a string. Those two fields are the signature of a
component written for an app that owned the execution, not for a library rendering a
protocol. Consistent with that: nothing in the library ever emitted one — no parser,
no client, no example, no browser test.

**What to do instead.** Register a renderer for your own tool and it draws inside the
`tool_call` segment, where the request and the result already live:

```ts
config.registerToolRenderer('bash', myConsoleRenderer);   // or 'run_command', 'python'
```

That is the seam this belonged in, and it puts the naming where it belongs: core cannot
know what your tool is called, and baking one vendor's tool name into a
framework-agnostic library would be wire-format knowledge in the wrong layer.
`@aparte/plugin-ask-user` is the same shape end to end if you want a worked example.
If you need a standalone console block with no tool behind it,
`registerSegmentRenderer` still takes a type of your own — that path is unchanged.

The `terminal` **icon key** stays in the icon provider: a consumer writing their own
console renderer will want `getIcon('terminal')`, and an icon name costs nothing.

Migration: delete your `terminal` segments, or move them behind
`registerToolRenderer` / `registerSegmentRenderer`. If you declared
`setHostHandlers({ terminalRun: true })`, drop that key — the others are unchanged.
