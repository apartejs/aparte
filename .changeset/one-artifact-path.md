---
"@aparte/core": minor
"@aparte/engine": minor
---

`_meta.pipeline`, `_meta.artifactRaw` and `_meta.artifactXml` are removed from `AparteChatRequest`, and with them the `pipeline-waiting` segment and engine's artifact-XML state machine. `_meta.artifactHint` and `_meta.prefixSegments` stay and are documented; an `<artifact>` tag in the reply's text is parsed exactly as before, and the built-in `create_artifact` tool is unchanged. Gone in full: `ApartePipelinePhase`, the `pipeline-waiting` segment type with its renderer, its stylesheet and `ApartePipelineWaitingSegment`, and — in `@aparte/engine` — `ArtifactXmlStateMachine`, its types and the `phase-advance` / `artifact-open` / `artifact-chunk` / `artifact-close` run events.

Decision D2 of the 2026-08-28 audit. The multi-phase pipeline and the raw-artifact turn were one product's orchestration wearing a library type — nothing in this repository emitted either, and a contract nothing exercises is maintained for nobody. The XML mode was a second path to what the stream parser already does natively with `<artifact>` tags, kept alive by a state machine that had to be mirrored between two loops. One path is left, the parser's, and the loop no longer branches on the request's metadata at all.
