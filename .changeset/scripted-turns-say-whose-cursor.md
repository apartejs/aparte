---
"@aparte/provider-scenario": patch
---

`turns` documents that its cursor belongs to the provider, not to a chat. No behaviour change.

Two chats registered against one provider take turns from the same script and interleave it — chat A gets `turns[0]`, chat B `turns[1]` — because a request carries no conversation identity to key a cursor on. The JSDoc now says so and names the two ways out: a provider per chat (`createScenarioProvider` is cheap and takes an `id`), or `scenarios`, which answers from the request itself and has no cursor at all.
