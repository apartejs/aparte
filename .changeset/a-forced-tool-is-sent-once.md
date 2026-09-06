---
"@aparte/engine": patch
---

A forced `toolChoice` is now sent on the first turn only; the turns after it go out as `'auto'`, so the run ends with an answer instead of the turn limit. Nothing to change on your side.

The request is rebuilt from `baseRequest` every turn, and only the synthetic `{ name, input }` shape stripped itself. A plain `{ name }` — the shape a consumer sets to force a tool — therefore travelled again after the tool had already answered: the model was made to call it once per turn until `maxTurns`, so a forced tool ran ten times and the run reported `turn-limit-exceeded` rather than replying.

Forcing a tool is a turn-1 instruction and the loop is the only thing that can lift it, so the loop lifts it: any object `toolChoice` is dropped from the base request after the first transport call.
