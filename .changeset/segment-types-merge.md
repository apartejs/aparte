---
'@aparte/core': minor
'@aparte/plugin-artifacts': patch
---

A segment type of your own now joins `AparteSegment` by declaration merging, so `addSegment`, `appendMessage` and `AparteMessage.segments` take it without `as unknown as AparteSegment`: add it to the new `AparteSegmentTypes` interface, one key per `type`.

```ts
declare module '@aparte/core' {
  interface AparteSegmentTypes { chart: ChartSegment }
}
```

`AparteSegment` was the closed union of core's built-ins, and the segments guide showed the cast. `@aparte/plugin-artifacts` registers its `artifact` segment the same way, so `artifactSegment(…)` is an `AparteSegment` wherever the plugin is imported.
