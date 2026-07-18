---
"@aparte/core": minor
---

Type the request `_meta` channel. `AparteChatRequest._meta` is now
`AparteRequestMeta` instead of `Record<string, unknown>`: the five well-known
keys (`pipeline`, `prefixSegments`, `artifactHint`, `artifactRaw`, `artifactXml`)
are typed and documented, while an open index signature keeps it a channel for
consumer-specific context. New exported types: `AparteRequestMeta`,
`ApartePipelinePhase`, `AparteArtifactHint`.
