---
'@aparte/core': minor
'@aparte/engine': minor
'@aparte/locales': minor
---

A reply now shows the sources it cites: a chip at the end of each cited passage, a card it opens, and the list of sources under the reply. Providers send them with a new `sources` stream event; a text segment carries them in two new fields, `sources` and `citations`.

A chip shows the source's domain, and `+2` when two more back the same passage; it sits after the passage's punctuation, never inside bold, a link or code, and takes the place of a `[1]` marker the model wrote. It is a button: its card, mounted beside the transcript, shows the title as a link, the domain and an excerpt, pages through several sources, and closes on Escape back to the chip. The bubble lists the reply's sources under its segments, in a closed `<details>`. Nothing changes for a reply that cites nothing, and the sources are never sent back to the model.

The `sources` event's offsets are into the text the model call streamed; the stream adapter rebases each citation onto the text segment it falls in. A non-streamed answer carries them too: a format adapter's optional `parseSources(json)`, and the backend handler adds `sources` and `citations` to its JSON. A chip is placed by text in the rendered Markdown, so the same under every Markdown provider; `renderCitations(contentEl, segment)` places them for a renderer of one's own. Seven locale keys (`sourcesCount`, `sourcesOne`, `sourcesCard`, `sourcePrevious`, `sourceNext`, `sourcePosition`, `opensInNewTab`), translated in the nine `@aparte/locales` bundles. No favicon is fetched.
