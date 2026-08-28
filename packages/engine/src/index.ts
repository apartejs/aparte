/**
 * @aparte/engine — the framework-agnostic agent loop.
 *
 * Zero runtime dependencies, no DOM: usable from any in-browser or Node AI-chat app.
 * The headline export is `runStreamAgent`, the headless extraction of
 * core's inline loop, which it has since replaced — `AparteClient` runs it by default, and core
 * renders its events through `createStreamAdapter`. Its call sequences are pinned by
 * core's `stream-parity` snapshots, recorded while the inline loop still ran beside it.
 *
 * Deliberately just the loop core drives, plus the agnostic context compactor. Opt-in
 * *tools* (ask-user / RAG / skills / code) belong in `plugins/*`; product behaviour
 * (memory, intent orchestration) and the not-yet-wired text agent loop live elsewhere.
 */

// Structured-stream agent loop: runStreamAgent + its DOM-free events + the artifact-XML parser.
export * from './agent/stream-events.js';
export * from './agent/stream-run.js';
// The XML state machine, and its `deriveArtifactKind` — THE implementation.
//
// Core used to keep the canonical copy and this package a byte-identical one,
// locked together by a parity test, because core could not import engine. With
// core depending on engine (audit 2026-08-28, D1) there is one function object:
// core re-exports this one under the same name, so `import { deriveArtifactKind }`
// from either package gives you the same function, and nothing to keep in step.
export { ArtifactXmlStateMachine, deriveArtifactKind } from './agent/parsers/artifact-xml-state-machine.js';
export type { XmlArtifactEvent, XmlArtifactHint, XmlArtifactState } from './agent/parsers/artifact-xml-state-machine.js';

// Conversation compactor (context-window budget + sliding-window assembly).
export * from './conversation/compactor.js';
// The budget-aware `compactionSelector` for AparteClient.compact().
export { createCompactionSelector } from './conversation/selector.js';
export type { CompactionSelectorOptions, CompactableMessage, CompactionSelection, CompactionSelector } from './conversation/selector.js';
