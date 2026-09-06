---
"@aparte/provider-openai-compat": patch
---

A tool call a server addresses by `index` in one chunk and by `id` in the next is one call again, and a minted id can no longer collide with the server's own. Nothing to change on your side.

The parser picked ONE key per delta — `index` when it was there, `id` otherwise — so a vendor that used both, one at a time, produced two calls: the first with the name and no arguments, the second with the arguments and an empty name. The turn ran the tool on `{}` and then held a call it could not answer, so the reply came back blank. Both are addresses, not identities: a delta's keys are now aliases that resolve to the same accumulated call, and whichever key is already known names it. When a delta carries only addresses the parser has not seen yet, its function name decides — a name appears only on a call's first delta, so a nameless delta continues the call before it and a named one opens its own. That covers the vendor whose chunks never carry both addresses at once, in either order.

The id minted for a call a vendor sends without one reads `aparte-call-1` rather than `call_1`, which is what an OpenAI-shaped server calls its own first call: a turn mixing an id-less call with a real `call_1` used to mint a duplicate of it.
