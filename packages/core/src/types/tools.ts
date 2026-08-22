/**
 * Aparte Tool Types
 * Provider-agnostic tool calling interface
 */

import type { AparteToolCallSegment } from './segments.js';

/** Definition of a tool the AI can call */
export interface AparteTool {
    name: string;
    description: string;
    /** JSON Schema object describing the tool's input parameters */
    inputSchema: Record<string, unknown>;
    /** System prompt injected automatically when this tool is registered — tells the AI when and why to use it */
    systemPrompt?: string;
    /**
     * Maximum number of agentic loop turns before aborting.
     * Overrides the global `maxTurns` in AparteClientOptions for this specific tool.
     */
    maxTurns?: number;
    /**
     * When true, the agent loop pauses before running this tool's handler and
     * waits for a human decision (approve / reject) — "human in the loop". The
     * UI surfaces Approve/Reject (default renderer, or a custom tool renderer)
     * and resolves it by dispatching an `aparte-tool-decision` event. On reject,
     * a synthetic "rejected by user" result is injected and the turn stops.
     */
    needsApproval?: boolean;
}

/**
 * Detail for `aparte-tool-decision` — the human's verdict on a tool awaiting
 * approval. Dispatched by the approval UI (built-in or app-provided) and
 * consumed by the agent loop to resume or reject.
 */
export interface AparteToolDecisionDetail {
    toolCallId: string;
    approved: boolean;
    /**
     * Optional payload from a custom approval surface. When it is a plain object
     * and the decision is `approved`, the agent loop merges it onto the tool's
     * input before invoking the handler — so a human can edit the arguments
     * before the tool runs (correct a path, tighten a query, …). The built-in
     * Approve/Reject gate sends no payload, so existing flows are unchanged.
     */
    payload?: unknown;
}

/**
 * Detail for `aparte-tool-approval-request` — emitted by the loop when a tool
 * marked `needsApproval` is about to run. Apps may listen to show a richer
 * approval surface; the built-in renderer already shows Approve/Reject inline.
 */
export interface AparteToolApprovalRequestDetail {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
}

/**
 * Detail for `aparte-tool-action` — a generic callback channel so any rendered
 * tool UI (via {@link AparteToolRenderer.setup}) can post an interactive action
 * back toward the host/loop (e.g. a custom confirm/choose/retry button).
 */
export interface AparteToolActionDetail {
    toolCallId: string;
    action: string;
    payload?: unknown;
}

/** A tool call emitted by the AI during streaming */
export interface AparteToolCall {
    id: string;
    name: string;
    input: Record<string, unknown>;
}

/** Result returned after a tool handler resolves */
export interface AparteToolResult {
    toolCallId: string;
    content: string;
}

/**
 * Handler function for a registered tool.
 * Receives the tool call and an AbortSignal (fires after timeout or on cancellation).
 * Must resolve with a AparteToolResult.
 */
export type AparteToolHandler = (
    call: AparteToolCall,
    signal: AbortSignal,
    context?: AparteToolContext
) => Promise<AparteToolResult>;

/**
 * Which chat a tool handler is running for.
 *
 * Optional and third, so every existing handler keeps compiling and working —
 * nothing has to be rewritten to ignore it.
 *
 * It exists because a handler had NO way to know. `@aparte/plugin-ask-question`
 * calls `requestUserInput({ message, schema, signal })` with no `target`, and
 * `requestUserInput` resolves its presenter with `resolveConfig(request.target ??
 * null)` — so with an instance config carrying the presenter, the call resolved
 * against the GLOBAL config, found nothing, and returned `{ action: 'cancel' }`.
 * The model was told the user refused a question the user was never shown.
 *
 * That failure is described in `AparteConfig.requestUserInput` as "a lie told
 * quietly", and the plugin walked straight into it because the handler signature
 * gave it nothing to walk around with.
 *
 * Both loops supply it — core's inline loop and the injected `runStreamAgent` — so
 * a handler behaves the same whichever one is running.
 */
export interface AparteToolContext {
    /**
     * The chat element this turn belongs to. Pass it as `target` to
     * `requestUserInput` (or to anything else that resolves a config from the DOM)
     * and the right instance answers.
     */
    target?: HTMLElement;
    /**
     * The resolved config for this chat, for a handler that needs it without going
     * through the DOM — a handler running in a worker, or one reading a provider.
     */
    config?: unknown;
}

/**
 * Per-tool segment renderer.
 * Registered via aparteGlobalConfig.registerToolRenderer(toolName, renderer).
 * When the AI calls a tool, this renderer controls what appears in the bubble
 * for that specific tool instead of the generic tool_call renderer.
 *
 * Return an empty string from render() to render nothing (e.g. for UI-only tools like ask_question).
 */
export interface AparteToolRenderer {
    /** HTML to render for the tool call segment. Return empty string to hide. */
    render: (segment: AparteToolCallSegment) => string;
    /** Optional DOM setup (event listeners etc.) called after HTML is injected */
    setup?: (element: HTMLElement, segment: AparteToolCallSegment) => void;
    /** Optional CSS to inject once into document.head */
    getStyles?: () => string;
}
