---
'@aparte/provider-scenario': patch
---

A scenario whose reply delegates twice under the same `id`, in two turns, now runs the second sub-agent too.

The loop names a call once per reply, so the second turn's call is `id#2`. The scenario filed its scripts per turn, the second one under `id`, and its handler, asked for `id#2`, answered "No script exists for this call". The scripts are now named by the same rule as the loop's, seeded with the calls already in the reply.
