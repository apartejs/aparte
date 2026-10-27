---
'@aparte/provider-scenario': minor
---

A scenario turn can now carry sources and citations: a new `{ sources, citations? }` step, and a showcase answer that uses it ("why is the sky blue?", or ask for "sources").

`sources` lists the sources a reply draws on and `citations` places each one in the text, so a demo or a test can show the chips and the source card without a model that searches. The step goes after the text it cites: a citation's `start` and `end` are UTF-16 offsets into the text the turn has streamed so far (its `text` steps joined, `end` exclusive). Source ids are unique within the turn.

The showcase gains a `citations` scenario: three paragraphs on Rayleigh scattering citing three sources (en.wikipedia.org, nasa.gov, britannica.com), one passage citing two of them so the chip shows "+1". It is placed before `code`, so "cite an example" reaches it while "show me the source code" still reaches `code`; its offsets are found in the passages rather than counted. The showcase's default message now lists it among the things to ask for.
