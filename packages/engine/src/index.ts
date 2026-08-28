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

// Structured-stream agent loop: runStreamAgent + its DOM-free events.
export * from './agent/stream-events.js';
export * from './agent/stream-run.js';
// `deriveArtifactKind` — THE implementation; core re-exports it under the same name
// (audit 2026-08-28, D1: one function object, nothing to keep in step). The XML
// artifact state machine that used to live beside it is gone (D2): the core parser
// reads `<artifact>` tags natively, so the mode that switched to the machine was a
// second path to the same result.
export { deriveArtifactKind } from './agent/parsers/artifact-kind.js';

// Conversation compactor (context-window budget + sliding-window assembly).
export * from './conversation/compactor.js';
// The budget-aware `compactionSelector` for AparteClient.compact().
export { createCompactionSelector } from './conversation/selector.js';
export type { CompactionSelectorOptions, CompactableMessage, CompactionSelection, CompactionSelector } from './conversation/selector.js';
