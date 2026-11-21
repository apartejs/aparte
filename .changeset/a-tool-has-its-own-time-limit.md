---
'@aparte/engine': minor
'@aparte/core': minor
---

A tool can set its own time limit (`timeoutMs` on the tool), which replaces the client's or the server handler's `toolTimeoutMs` for that tool; `Infinity` means no limit.

A tool that runs a whole sub-agent on a slow local model, or a command with a limit of its own, was cut at five minutes like a lookup, and a host that raised the shared bound to spare it lost the bound for every other tool. `Infinity`, or any delay above 2^31-1 ms, used to fire at once (a timer reads such a delay as zero): it is no limit now. A sub-agent a call opens in the background is bounded by that call's limit. The docs now say what happens when a limit fires: the call is abandoned and the run stops, since a handler that ignores its signal may still be running. (apartejs/aparte#290)
