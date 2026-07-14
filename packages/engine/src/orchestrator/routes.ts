/**
 * OrchestratorRoute — discriminated union of routing decisions.
 *
 * 'direct'   → LLM answers without tools (toolChoice: 'none')
 * 'clarify'  → orchestrator calls ask_question synthetically (toolChoice: { name, input })
 *              The LLM is bypassed for the tool call; it only generates the final reply.
 * 'rag'      → retrieve relevant chunks from uploaded documents and augment the request
 * 'code'     → orchestrator runs a planner LLM call, then injects a system prompt that
 *              instructs the model to emit a `<artifact>` tag with the generated code.
 *              No tool_call — pure stream parsing on the way back.
 */

export type ArtifactKind =
    | 'react'
    | 'html'
    | 'js'
    | 'css'
    | 'svg'
    | 'text'
    | 'markdown'
    | 'json'
    | 'csv'
    | 'python'
    | 'typescript'
    | 'bash'
    | 'sql'
    // ── Binary file kinds (executed in sandbox, delivered as download) ─────
    | 'pdf'
    | 'xlsx'
    | 'docx';

/** Kinds whose output is a binary file produced by sandbox execution. */
export const BINARY_FILE_KINDS = ['pdf', 'xlsx', 'docx'] as const;
export type BinaryFileKind = typeof BINARY_FILE_KINDS[number];

export function isBinaryFileKind(k: ArtifactKind): k is BinaryFileKind {
    return (BINARY_FILE_KINDS as readonly string[]).includes(k);
}

export type OrchestratorRoute =
    | { type: 'direct' }
    | {
          type: 'clarify';
          question: string;
          options: Array<{ title: string; description?: string }>;
          multiple?: boolean;
      }
    | { type: 'rag'; queryText: string }
    | {
          type: 'code';
          description: string;
          artifactType: ArtifactKind;
      };

/**
 * Model-specific behaviour the orchestrator needs but must not hardcode.
 * The engine is model-agnostic: it reads these from the context instead of
 * sniffing `modelId`. The consuming app supplies the values for its model
 * (e.g. an LFM2.5-Thinking preset). Every field is optional — the agnostic
 * default (all unset) injects no control tokens and no prefill.
 */
export interface ModelCapabilities {
    /**
     * Prefill that closes the model's thinking/reasoning block so it is skipped
     * on latency-sensitive routes (e.g. `'</think>\n\n'`). Omit for models with
     * no skippable thinking phase — no prefill is injected.
     */
    skipThinkingPrefill?: string;
    /**
     * Control directive prepended to the system prompt to disable the model's
     * thinking phase entirely (e.g. `'/no_think'`). Omit for none.
     */
    noThinkDirective?: string;
    /** Context-window size in tokens (used by history compaction). */
    contextWindow?: number;
    /** Tokens to reserve for the thinking block during compaction. */
    reservedThinking?: number;
}

export interface OrchestratorContext {
    /** Raw text of the last user message */
    userMessage: string;
    /** Active model ID */
    modelId: string;
    /** True when the user has attached documents */
    hasDocuments: boolean;
    /**
     * Model-specific behaviour (thinking tokens, context window). Supplied by
     * the consuming app; when omitted the orchestrator stays fully agnostic
     * (no control tokens, no skip-think prefill).
     */
    capabilities?: ModelCapabilities;
    /**
     * Recent conversation turns (most recent last), condensed to plain text.
     * The classifier relies on this to resolve deictic references like
     * "un autre fichier", "même chose", "comme avant"…
     *
     * Convention: at most ~6 last turns, each truncated to ~400 chars.
     */
    recentTurns?: Array<{ role: 'user' | 'assistant' | 'system'; text: string }>;
}
