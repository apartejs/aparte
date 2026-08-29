---
"@aparte/plugin-approval": minor
---

New package: `@aparte/plugin-approval` — approval modes for tool calls. `setupApproval({ classify: { read, write, exec }, mode })` installs a per-call policy from a classification of your tool names; the modes are `plan` (read-only tools run, the rest is refused with a reason the model reads), `ask` (every write or execution asks at the composer), `auto-edit` (writes run, executions ask) and `auto` (never asks). `<aparte-approval-mode>` is the switch, for `<aparte-composer-toolbar>`; `approval.setMode()` / `subscribe()` are the same switch from code. It executes nothing and stores nothing.

The names are yours because they are wire format: no library can know that `run_command` executes and `search_docs` reads. A tool in no list keeps its own `needsApproval` (and runs under `auto`). Built on core's new `setApprovalPolicy()`.
