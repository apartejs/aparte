---
'@aparte/core': patch
---

Every segment interface now carries an `@example`: the literal a developer would write.

The eight interfaces in `types/segments.ts` documented their fields — some to several
paragraphs — and never once showed a whole segment. The field table answers "what is
`collapsed`"; it does not answer "what does one of these look like", which is the question
anyone emitting a segment actually has.

Each example is a valid segment of that type, so the documentation site can print it as
code AND render it: the segment pages now show core's own renderer drawing that exact
literal inside a real viewport. An example that stops being a valid segment becomes a
visibly broken preview rather than prose no one re-reads.

The `thinking` example deliberately omits `collapsed`, because absent means CLOSED and the
example should show what a reader gets rather than the flattering case.
