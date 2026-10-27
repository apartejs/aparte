---
'@aparte/provider-openai-compat': minor
---

A reply from an endpoint that cites its sources now shows them: OpenAI and OpenRouter annotations and Perplexity's source list reach the bubble, and there is a `PERPLEXITY` preset.

Nothing to change in your code. The stream parser reads `url_citation` annotations (on `delta.annotations`, or `message.annotations` for a server that streams the whole message shape) and Perplexity's root-level `citations` / `search_results`, and ends the turn with one `sources` event just before `done`. An endpoint that sends neither leaves the stream as it was.

The offsets of an annotation are into the whole message text, so the event waits for the end of the stream and an offset past the end of the text is brought back into it. Perplexity sends no offsets and writes `[1]`, `[2]` into the text: each marker that names a source becomes a citation that the chip replaces, and a marker that names none stays text. The same URL cited for two passages is one source, two sources on one passage are one citation, and a URL is passed on as the endpoint sent it (core's renderer refuses a `javascript:` link, not the provider).

`presets.PERPLEXITY` points at `https://api.perplexity.ai` and declares the Sonar models; with the new `listsModels: false`, `fetchModels` serves them without asking a `GET /models` Perplexity does not have. A `[1]` inside code is not taken for a marker. A non-streamed answer (`stream: false`) is read too, through the adapter's new `parseSources`.
