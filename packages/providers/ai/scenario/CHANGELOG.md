# @aparte/provider-scenario

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
