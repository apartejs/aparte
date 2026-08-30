# @aparte/plugin-approval

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

### Minor Changes

- 4123389: The `node` entry exports the `AparteApprovalMode` element type, so an SSR consumer on `node16`/`nodenext` can name it in a signature.

  `export type` is erased at compile time, so the entry stays DOM-free — `scripts/check-node-import.mjs` asserts it keeps importing without a document. The element itself is deliberately absent from that entry: it needs a `document`, and `import '@aparte/plugin-approval'` on a server registers the policy and nothing else.

- a91ac86: New package: `@aparte/plugin-approval` — approval modes for tool calls. `setupApproval({ classify: { read, write, exec }, mode })` installs a per-call policy from a classification of your tool names; the modes are `plan` (read-only tools run, the rest is refused with a reason the model reads), `ask` (every write or execution asks at the composer), `auto-edit` (writes run, executions ask) and `auto` (never asks). `<aparte-approval-mode>` is the switch, for `<aparte-composer-toolbar>`; `approval.setMode()` / `subscribe()` are the same switch from code. It executes nothing and stores nothing.

  The names are yours because they are wire format: no library can know that `run_command` executes and `search_docs` reads. A tool in no list keeps its own `needsApproval` (and runs under `auto`). Built on core's new `setApprovalPolicy()`.

- b6f4cc9: `setupAskUser` and `setupApproval` now take their options first and the config last, like every other `setup*` — `setupAskUser({ maxOptions: 6 })`, `setupApproval({ classify })`, and `setupAskUser({}, config)` for a scoped chat. `setupAskUser(config, options)` and `setupApproval(config, options)` no longer compile.

  The plugins overview stated the rule ("every `setup*` takes the config instance as its last argument, defaulting to the global") and these two broke it; the leading `undefined` the ask-user page had to write to reach the options was the symptom. Pre-1.0, a rename is a rename.
