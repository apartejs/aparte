---
"@aparte/provider-scenario": patch
---

The showcase scenario answers "ship it" with a four-step tool chain — search, read, write, run — so a multi-tool turn can be seen. Register `search_docs`, `read_file`, `write_file` and `run_command` if you want the chain to resolve; unregistered tool names abort the call, exactly as `get_weather` and `ask_user` already did.

Every other scenario calls ONE tool and answers its result, so the turn a real agent produces — several calls in a row, each feeding the next — was the one shape nothing in this repository could show. It is what a transcript has to survive: five rows stacked in one bubble, an approval decision landing in the middle of them, a refusal cutting the rest of the turn.

Each tool in the chain carries its own `after:` route (`releaseRead`, `releaseWrite`, `releaseRun`, `releaseDone`), because a tool whose result is not routed falls back through the `when` that started the chain and the conversation eats its own tail — the warning `createScenarioProvider` prints at creation.
