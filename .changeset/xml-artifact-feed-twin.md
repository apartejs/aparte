---
'@aparte/core': minor
'@aparte/engine': minor
---

The `<artifact>` XML streamer is a file, and its twin no longer disagrees with it

`@aparte/core` and `@aparte/engine` each carry a hand-maintained copy of the same
streaming `<artifact>` state machine — core cannot import engine's, because engine
peer-depends on core. Keeping two copies in step is the whole contract, and until
now core's half had no name: it was a private method plus a nested block inside a
2324-line class, so the two files cited each other by **line number**. Four of six
of those citations had rotted onto unrelated code. `:1658-1669`, sold as "the
finalize block", was a tool handler's `AbortController`; `:1034-1042`, sold as
"`_streamLoop`'s leading writes", was `_handleSend` resolving auth. One of the wrong
ones was published in the API reference.

Core's half now lives in `client/xml-artifact-feed.ts`, holding both halves the way
engine's file does — `feedXmlArtifactDelta` and `finalizeXmlArtifact`. It moved
without a semantic change: it dereferences `this` zero times, because the state it
mutates was always owned by its caller. Every citation between the two files is now
a name, and a new gate guard (`check:cross-refs`) refuses a comment that cites code
by line number at all.

**Bug fixed, found by the pairing.** A stream that ended on a held partial tag —
`… <arti`, then nothing — silently dropped those characters. The feeder holds such a
suffix on purpose (without it, a tag split across deltas loses the artifact's whole
lifecycle), and engine's `finalize()` has always handed the held text back as chat
text. Core's finalize only ever handled the `in-artifact` case. Reachable with
nothing unusual: any truncated reply whose last delta happens to end on `<`, `<a`, …
`<artifac`.

No API change: `AparteClient` behaves identically apart from that fix, and the new
module's exports are not re-exported from the package barrel.
