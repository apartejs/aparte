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
// `deriveArtifactKind` lived here (D1) and left with the artifact (D7): it is
// `@aparte/plugin-artifacts`' now, with the tool and the card it serves.

// Conversation compactor (context-window budget + sliding-window assembly).
export * from './conversation/compactor.js';
// The budget-aware `compactionSelector` for AparteClient.compact().
export { createCompactionSelector } from './conversation/selector.js';
export type { CompactionSelectorOptions, CompactableMessage, CompactionSelection, CompactionSelector } from './conversation/selector.js';
