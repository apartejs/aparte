---
'@aparte/core': minor
'@aparte/locales': minor
---

An approval asked for a sub-agent's call now names the sub-agent: "Allow read_file for Researcher?", from the new locale key `approvalAskBy`.

`approvalAskBy` is `Allow {tool} for {agent}?`, `{agent}` being the name the sub-agent was started with and `{tool}` what `approvalAsk` puts there. `@aparte/locales` carries it in its nine languages; a locale of your own that lacks it falls back to English, and `extendLocale({ approvalAskBy: '…' })` sets it. A sub-agent with no name is asked about with `approvalAsk`, as before. `aparte-tool-approval-request` carries the call's `agentId` when a sub-agent asks.
