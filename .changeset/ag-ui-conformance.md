---
"@aparte/runner-ag-ui": minor
---

A TanStack AI route now needs `relaxedRunFraming: true`: `createAgUiRunner({ endpoint: '/api/chat', relaxedRunFraming: true })`. Without it the runner rejects TanStack AI's streams, as AG-UI 1.0 asks a client to.

The runner now follows AG-UI 1.0 and passes the protocol's own conformance corpus — the 68 streams of `spec/1.0/conformance`, vendored with their MIT license and replayed through it on every build. What changes:

- **It declares `protocolVersion: "1.0"`** on every request, and warns when an agent declares a newer version or one it cannot read.
- **It rejects the streams 1.0 tells a client to reject** — a run not opened by `RUN_STARTED`, an event after `RUN_FINISHED` (or after `RUN_ERROR`, but a new run), content for a message never opened, a message, tool call, step or sub-agent still open when the run finishes, a chunk stream that loses or changes its identity, a step or a sub-agent finished before it started, a known field missing or of the wrong type. What is open is tracked per owner — the agent, or each sub-agent — as 1.0 requires. The reply ends with an error naming the rule, below what was drawn. TanStack AI, 1.0 included, closes each model step with a `RUN_FINISHED` and answers a resume before its `RUN_STARTED`: `relaxedRunFraming` reads that framing and holds every other rule — what was opened must still be closed, by the end of the stream.
- **It drops what 1.0 does not describe** — an unknown event type, an undescribed property, an unknown role or outcome — and reports it to the new `onWarning` option (`console.warn` by default).
- **It keeps the agent's state.** `STATE_SNAPSHOT` and `STATE_DELTA` (a JSON Patch, applied whole or not at all) are kept for the thread and sent back as the next run's `state`; every request used to send `state: {}`.
- **A `RUN_ERROR` no longer cuts the stream**: it is read to the end, as 1.0 asks, and the error lands below what was drawn. When the agent runs again in the same stream, the new run decides how the reply ends and the failure goes to `onWarning`. The error carries `data: { agUi: 'run-error' }`; a rejected stream carries `data: { agUi: 'malformed' }`.
- **Images go to the agent** as AG-UI 1.0 content parts: a base64 data URL as a `data` source, anything else as a `url` source. They used to be left out.
- **An interrupt the page cannot answer** — `input_required`, or one naming no `toolCallId` — ends the reply without an error and is answered `cancelled` when the thread resumes or runs again. It used to fail the reply.
- **A tool result in content parts** keeps the parts as the row's structured result; the model reads their text.
- **Older agents**: the new `peerProtocolVersion` option names an agent older than 1.0. Its stream is read by that version's rules (the retired `THINKING_*` events are translated in any case; sub-agent events are dropped for 0.0.57 and older, images flattened to text for 0.0.39 and older), and the request leaves out `protocolVersion`.
