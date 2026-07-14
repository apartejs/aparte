/**
 * @aparte/engine — the framework-agnostic agent loop.
 *
 * Zero runtime dependencies, no DOM: usable from any in-browser or Node AI-chat app.
 * The headline export is `runStreamAgent`, the headless extraction of
 * `AparteClient._streamLoop` — inject it via core's `streamRunner` seam and core
 * renders its events through `createStreamAdapter`. Parity between the two is proven
 * by the stream-parity suite.
 *
 * Deliberately just the loop core drives, plus the agnostic context compactor. Opt-in
 * *tools* (ask-question / RAG / skills / code) belong in `plugins/*`; product behaviour
 * (memory, intent orchestration) and the not-yet-wired text agent loop live elsewhere.
 */

// Structured-stream agent loop: runStreamAgent + its DOM-free events + the artifact-XML parser.
export * from './agent/stream-events';
export * from './agent/stream-run';
export * from './agent/parsers/artifact-xml-state-machine';

// Conversation compactor (context-window budget + sliding-window assembly).
export * from './conversation/compactor';
