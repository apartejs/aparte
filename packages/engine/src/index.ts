/**
 * @aparte/engine — Aparte's agnostic core.
 *
 * Re-exports the orchestrator, parsers, memory extractor, and skill registry
 * as a single, framework-free, runtime-free TypeScript surface.
 *
 * Wave 1 (done): json-repair + route types.
 * Wave 2 (done, 2026-05-11): AG-UI compliant agent loop + tool registry + pythonic parser.
 * Wave 3 (planned): classifier + planner + orchestrate (pending Provider injection).
 * Wave 4 (planned): generate-file skill (logic only).
 *
 * Consumed by :
 *   - apps/home          (Angular browser app, via workspace:* dep)
 *   - aparte-training/tests-node  (Node tests, via relative-path imports)
 *   - Future apps/mobile (React Native), apps/cli (Node)
 *
 * See README.md for the migration plan and the public API roadmap.
 */

// Wave 1 — fully agnostic.
export * from './parsers/json-repair';
export * from './orchestrator/routes';

// Wave 2 — agent loop AG-UI compliant.
export * from './agent/events';
export * from './agent/tool';
export * from './agent/agent-loop';
export * from './agent/parsers/pythonic-parser';
export * from './agent/tools/retrieve-skill.tool';
export * from './agent/tools/retrieve-file.tool';
export * from './agent/tools/run-code.tool';
export * from './agent/tools/ask-question.tool';

// Wave 3 — memory extractor (LLM fact extraction with mem0-style prompt).
export * from './memory/extract';

// Wave 4 — orchestrator pure logic (request-mutator paradigm).
//   - classifier : intent → route + artifact kind classification
//   - planner    : silent artifact plan (sections/columns/headers/etc.)
//   - orchestrate: route → mutated AparteChatRequest (prefill / system overlay / sampling)
export * from './orchestrator/classifier';
export * from './orchestrator/planner';
export * from './orchestrator/orchestrate';

// Wave 5 — conversation compactor (history budget + sliding window).
//   - estimateTokens / estimateTokensJson : char-count heuristic (no tokenizer)
//   - computeHistoryBudget                : context window math
//   - splitHistoryBudget                  : summary / ragHist / window ratios
//   - assembleCompacted                   : drop-priority assembly
//   - compactConversation                 : one-shot entry point (used by apps)
// Ported from aparte-training/tests-node/lib/conversation-compactor.mjs to
// guarantee iso behaviour between browser (apps/home) and Node test rig.
export * from './conversation/compactor';

// Wave 6 — structured-stream agent loop (runStreamAgent).
//   The cloud-structured sibling of runAgent: consumes an
//   AsyncIterable<StreamChatEvent> and emits ordered, DOM-free StreamRunEvents
//   that a @aparte/core adapter turns into viewport calls. The headless extraction
//   of AparteClient._streamLoop. All exports are Stream*-prefixed (no collision
//   with the Run*/Agent* text-loop surface above).
export * from './agent/stream-events';
export * from './agent/stream-run';
export * from './agent/parsers/artifact-xml-state-machine';
