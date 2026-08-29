/**
 * @aparte/engine — the framework-agnostic agent loop.
 *
 * Zero runtime dependencies, no DOM: usable from any in-browser or Node AI-chat app.
 * The headline export is `runStreamAgent`, the headless extraction of
 * core's inline loop, which it has since replaced — `AparteClient` runs it by default, and core
 * renders its events through `createStreamAdapter`. Its call sequences are pinned by
 * core's `stream-parity` snapshots, recorded while the inline loop still ran beside it.
 *
 * Deliberately just the loop core drives. Opt-in *tools* (ask-user / RAG / skills / code)
 * belong in `plugins/*`, and so does compaction: the context budget and the selector that
 * lived here until 0.16.0 are `@aparte/plugin-compaction`'s now — the loop reports usage
 * and lets the caller decide, so nothing in it ever read them.
 */

// Structured-stream agent loop: runStreamAgent + its DOM-free events.
export * from './agent/stream-events.js';
export * from './agent/stream-run.js';
// `deriveArtifactKind` lived here (D1) and left with the artifact (D7): it is
// `@aparte/plugin-artifacts`' now, with the tool and the card it serves.

