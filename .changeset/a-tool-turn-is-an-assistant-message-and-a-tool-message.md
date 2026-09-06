---
"@aparte/core": minor
"@aparte/engine": minor
"@aparte/provider-openai-compat": minor
"@aparte/provider-ai-sdk": minor
"@aparte/provider-scenario": minor
"@aparte/provider-transformers": minor
---

A tool turn is now an `assistant` message carrying `toolCalls` and a `tool` message carrying `toolCallId`; the `'tool_call'` and `'tool_result'` roles are gone.

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
