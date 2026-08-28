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
     * waits for a human decision — "human in the loop".
     *
     * The decision is asked AT THE COMPOSER, through the same `requestUserInput`
     * a tool handler calls: every request for the user is answered in one place.
     * The row in the transcript is the anchor, naming which tool is waiting, and
     * holds nothing clickable. An `approvalResolver` on `AparteClientOptions`
     * answers it programmatically instead.
     *
     * On a refusal the rest of the turn is skipped — no later tool call of the
     * same turn runs — and then the model gets a turn to answer it, so it can
     * say what it will do instead. The refusal may carry the user's own words.
     *
     * All three clauses of this comment used to say something else: the default
     * renderer surfaced the buttons, an `aparte-tool-decision` event resolved
     * them, and a refusal ended the turn. None of that is true any more.
     */
    needsApproval?: boolean;
}

/**
 * Detail for `aparte-tool-approval-request` — emitted by the loop when a tool
 * marked `needsApproval` is about to run.
 *
 * Listen for it to present the decision yourself. Core's own gate asks at the COMPOSER
 * (`<aparte-elicitation>` renders the panel there), and the transcript row shows only a
 * state — there is no Approve/Reject control in a bubble.
 *
 * This block used to say "the built-in renderer already shows Approve/Reject inline",
 * which stopped being true when the decision moved to the composer. A consumer trusting
 * it shipped with no presenter and no `approvalResolver`, and every `needsApproval` call
 * aborted with nothing clickable on screen. The sibling docblock on `needsApproval`
 * records the same correction; this one was missed in the same file.
 *
 * @event aparte-tool-approval-request
 */
export interface AparteToolApprovalRequestDetail {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
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
 * It exists because a handler had NO way to know. `@aparte/plugin-ask-user`
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
 * The loop supplies it — `runStreamAgent`, or the runner you injected — so
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
 * Return an empty string from render() to render nothing (e.g. for UI-only tools like ask_user).
 */
export interface AparteToolRenderer {
    /**
     * Render the tool-call segment, as an HTML string or a ready DOM element.
     *
     * **The segment carries model-chosen data.** `segment.toolCall.input` is
     * whatever the model decided to pass, and `segment.result` is whatever the tool
     * returned — on the SEGMENT, because `AparteToolCall` is `{ id, name, input }`
     * and nothing else. This line used to say `segment.toolCall.result`, which does
     * not compile; the first renderer written against it found out.
     * Both values are untrusted.
     *
     * Return an **HTMLElement** and there is no innerHTML surface at all — set
     * `textContent`, attach listeners, insert framework nodes. That is the safe
     * default and the reason this arm exists.
     *
     * Return a **string** and core inserts it with `innerHTML`, so every
     * interpolated value must go through `escapeHtml` (text position) or
     * `escapeAttr` (inside an attribute). The natural first thing to write here is
     * `\`<div>Searching for ${s.toolCall.input.query}</div>\``, and that is a direct
     * model-to-DOM XSS in the host page's origin.
     *
     * Return an empty string to render nothing (e.g. a UI-only tool like
     * `ask_user`).
     */
    render: (segment: AparteToolCallSegment) => string | HTMLElement;
    /** Optional DOM setup (event listeners etc.) called after HTML is injected */
    setup?: (element: HTMLElement, segment: AparteToolCallSegment) => void;
    /** Optional CSS to inject once into document.head */
    getStyles?: () => string;
}
