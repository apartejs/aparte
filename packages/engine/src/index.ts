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
 * *tools* (ask-user / RAG / skills / code) belong in `plugins/*`; product behaviour
 * (memory, intent orchestration) and the not-yet-wired text agent loop live elsewhere.
 */

// Structured-stream agent loop: runStreamAgent + its DOM-free events + the artifact-XML parser.
export * from './agent/stream-events.js';
export * from './agent/stream-run.js';
// The XML state machine, but NOT its `deriveArtifactKind`.
//
// That name is already part of `@aparte/core`'s public surface, and this package
// keeps its own byte-identical copy (core is an optional peer here, so it cannot
// import the original at runtime). A blanket `export *` published BOTH under the
// same name, so `import { deriveArtifactKind } from` either package gave you a
// different function object depending on which — a genuine collision for anyone
// importing both, and a name nobody could safely change after 1.0.
//
// The copy stays where it is used and stays locked to core's by
// `derive-artifact-kind-parity.test.ts`; it simply is not a second public export.
export { ArtifactXmlStateMachine } from './agent/parsers/artifact-xml-state-machine.js';
export type { XmlArtifactEvent, XmlArtifactHint, XmlArtifactState } from './agent/parsers/artifact-xml-state-machine.js';

// Conversation compactor (context-window budget + sliding-window assembly).
export * from './conversation/compactor.js';
// The budget-aware `compactionSelector` for AparteClient.compact().
export { createCompactionSelector } from './conversation/selector.js';
export type { CompactionSelectorOptions } from './conversation/selector.js';
