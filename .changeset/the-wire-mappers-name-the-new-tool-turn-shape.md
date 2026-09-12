---
"@aparte/provider-openai-compat": patch
"@aparte/provider-ai-sdk": patch
---

A message still carrying the old `'tool_call'` or `'tool_result'` role is skipped with one console warning that names the new shape; the warning goes away in 0.18. Only code that builds an `AparteChatMessage[]` by hand — a `history:` function, a `requestInterceptor`, a mirror of `onHistoryAppend` — can be affected, and the warning tells it exactly what to write.

`AparteChatMessage.role` no longer allows either value, so this is code compiled against an older aparté reaching a newer provider — the one case a type cannot catch. The two mappers used to fail differently and both badly: the OpenAI-compatible adapter put the unknown role on the wire, where it is a 400 for the whole request, and the AI SDK bridge let it fall through to a `user` turn, so the model read a tool result as something the person had typed. Each mapper now warns once per role and skips the message. A warning is not an alias: it does not make the old shape work, it names the new one.
