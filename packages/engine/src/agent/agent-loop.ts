/**
 * agent-loop.ts — pure-logic while(tool_use) agent loop.
 *
 * Aligns with SOTA 2026 pattern (Claude Code, Cursor, Replit Agent) :
 *   1. LLM call
 *   2. Parse response for tool calls
 *   3. If tool calls : execute each → feed result back as role:"tool" message
 *   4. Loop until no tool call OR max iterations reached
 *   5. Emit AG-UI events throughout
 *
 * Framework-free. Importable from Angular (apps/home), Node (tests-node), CLI, mobile.
 *
 * The agent loop is the ENVELOPE :
 *   - Artifacts (apps/home current) become an output type of a tool (generate_file)
 *   - Memory injection becomes a tool (retrieve_memory) the LLM can call
 *   - File RAG becomes a tool (retrieve_file)
 *   - Skills become a tool (retrieve_skill)
 *
 * Skeleton — V1.x will fill in the LLM provider integration + tool dispatch.
 */

import type { AGUIEmitter, MessageRole } from './events';
import { EventType } from './events';
import type { ToolRegistry } from './tool';
import { parseToolCalls } from './parsers/pythonic-parser';

/**
 * Conversation message shape (subset of OpenAI / Anthropic chat).
 */
export interface AgentMessage {
    role: MessageRole;
    content: string;
    name?: string;  // tool name, when role === 'tool'
}

/**
 * Provider interface — adapter the agent uses to call the LLM.
 * Apps/home wraps Transformers.js (via @aparte/provider-transformers).
 * Tests-node wraps Transformers.js Node.
 *
 * Returns the assistant text. Streaming events emitted via the emitter
 * (provider can call emitter for TEXT_MESSAGE_* if it supports streaming).
 */
export interface AgentProvider {
    /**
     * Call the LLM. Returns the assistant message text.
     * @param messages    Conversation history (system + user + previous turns)
     * @param tools       Tool descriptors to expose
     * @param opts        Generation params + emitter for streaming
     */
    chat(opts: {
        messages: AgentMessage[];
        tools: ReturnType<ToolRegistry['descriptors']>;
        emitter?: AGUIEmitter;
        messageId: string;
        signal?: AbortSignal;
        /**
         * 0-indexed iteration of the agent loop. Useful for providers that
         * apply different prefills / generation params per iteration
         * (e.g. force tool call amorce on iter 0, free-form on iter 1+).
         */
        iter?: number;
        // Generation params (LFM2.5-Thinking defaults)
        temperature?: number;
        topK?: number;
        repetitionPenalty?: number;
        maxNewTokens?: number;
    }): Promise<string>;
}

/**
 * Agent loop run options.
 */
export interface RunOptions {
    userMessage: string;
    provider: AgentProvider;
    registry: ToolRegistry;
    /** AG-UI event emitter (browser UI / Node test recorder / etc.). */
    emitter?: AGUIEmitter;
    /** Optional conversation history (will be appended to). */
    history?: AgentMessage[];
    /** System prompt (already composed with persona + memory + files). */
    systemPrompt?: string;
    /** Max iterations before stopping (cf. Karpathy: "30 lines + safety guards"). */
    maxIterations?: number;
    /** Stop loop after N consecutive tool failures. */
    errorHaltThreshold?: number;
    /** Cancellation. */
    signal?: AbortSignal;
    /** IDs for tracing. */
    threadId?: string;
    runId?: string;
    /**
     * Conversation ID — passed to tool context for storage scoping.
     */
    conversationId?: string;
    /**
     * User preferences — passed to ToolRegistry.getActiveDescriptors() and ToolContext.
     * Determines which user_optional tools are exposed.
     */
    preferences?: {
        enabledTools?: Set<string>;
        activeSkills?: Set<string>;
    };
}

export interface RunResult {
    finalMessage: string;
    iterations: number;
    toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>;
    finalMessages: AgentMessage[];
}

/**
 * Run the agent loop. Emits AG-UI events. Returns final result.
 *
 * Skeleton — TODO V1.x :
 *   - Wire actual LLM provider (apps/home : via aparte-bridge, tests-node : via Transformers.js Node)
 *   - Compose system prompt with memory/files/skills (call apps/home pure-logic helpers)
 *   - Handle streaming emit (TEXT_MESSAGE_CONTENT events while LLM streams tokens)
 *   - Handle tool call streaming (TOOL_CALL_ARGS events while LLM generates args)
 *   - Error recovery, retries
 */
export async function runAgent(opts: RunOptions): Promise<RunResult> {
    const {
        userMessage,
        provider,
        registry,
        emitter = () => { /* no-op */ },
        history = [],
        systemPrompt = '',
        maxIterations = 5,
        errorHaltThreshold = 3,
        signal,
        threadId = `thread-${Date.now()}`,
        runId = `run-${Date.now()}`,
        conversationId,
        preferences,
    } = opts;

    // Build the tool context once — passed both to getActiveDescriptors() and to each tool handler
    const toolCtx = { signal, userMessage, conversationId, preferences };

    // ─── 1. Build initial messages ─────────────────────────────────
    const messages: AgentMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push(...history);
    messages.push({ role: 'user', content: userMessage });

    // ─── 2. Emit RUN_STARTED ───────────────────────────────────────
    emitter({
        type: EventType.RUN_STARTED,
        timestamp: Date.now(),
        threadId,
        runId,
        input: { userMessage },
    });

    const toolCallsLog: RunResult['toolCalls'] = [];
    let consecutiveErrors = 0;
    let iteration = 0;
    let finalText = '';

    try {
        // ─── 3. Main while(tool_use) loop ─────────────────────────
        while (iteration < maxIterations) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            const messageId = `msg-${Date.now()}-${iteration}`;

            // ── 3a. Call LLM
            emitter({ type: EventType.STEP_STARTED, timestamp: Date.now(), stepName: `iter-${iteration}` });
            emitter({ type: EventType.TEXT_MESSAGE_START, timestamp: Date.now(), messageId, role: 'assistant' });

            // Active tools filtered by markers + runtime availability
            const activeTools = await registry.getActiveDescriptors(toolCtx);

            const assistantText = await provider.chat({
                messages,
                tools: activeTools,
                emitter,
                messageId,
                signal,
                iter: iteration,
            });

            emitter({ type: EventType.TEXT_MESSAGE_END, timestamp: Date.now(), messageId });
            emitter({ type: EventType.STEP_FINISHED, timestamp: Date.now(), stepName: `iter-${iteration}` });

            messages.push({ role: 'assistant', content: assistantText });

            // ── 3b. Parse tool calls
            const toolCalls = parseToolCalls(assistantText);

            if (toolCalls.length === 0) {
                // No tool call → final response
                finalText = assistantText;
                break;
            }

            // ── 3c. Execute each tool call
            let iterErrors = 0;
            for (const call of toolCalls) {
                const toolCallId = `tc-${Date.now()}-${call.name}`;
                emitter({
                    type: EventType.TOOL_CALL_START,
                    timestamp: Date.now(),
                    toolCallId,
                    toolCallName: call.name,
                    parentMessageId: messageId,
                });
                emitter({
                    type: EventType.TOOL_CALL_ARGS,
                    timestamp: Date.now(),
                    toolCallId,
                    delta: JSON.stringify(call.args),
                });
                emitter({ type: EventType.TOOL_CALL_END, timestamp: Date.now(), toolCallId });

                let result: string;
                const tool = registry.get(call.name);
                if (!tool) {
                    result = `FAILED: tool "${call.name}" not registered`;
                    iterErrors++;
                } else {
                    try {
                        result = await tool.handler(call.args, toolCtx);
                        if (/^FAILED:/i.test(result)) iterErrors++;
                    } catch (err) {
                        const errMsg = err instanceof Error ? err.message : String(err);
                        result = `FAILED: ${errMsg}`;
                        iterErrors++;
                    }
                }

                emitter({
                    type: EventType.TOOL_CALL_RESULT,
                    timestamp: Date.now(),
                    messageId: `tr-${Date.now()}`,
                    toolCallId,
                    content: result,
                    role: 'tool',
                });

                messages.push({ role: 'tool', name: call.name, content: result });
                toolCallsLog.push({ name: call.name, args: call.args, result });
            }

            consecutiveErrors = iterErrors > 0 ? consecutiveErrors + iterErrors : 0;
            if (consecutiveErrors >= errorHaltThreshold) {
                // Halt — emit error and final synthesis
                emitter({
                    type: EventType.RUN_ERROR,
                    timestamp: Date.now(),
                    message: `Halted after ${consecutiveErrors} consecutive tool errors`,
                    code: 'TOOL_ERROR_THRESHOLD',
                });
                break;
            }

            iteration++;
        }

        // ─── 4. Max iterations reached without final answer
        if (iteration >= maxIterations && !finalText) {
            // Force final synthesis without tools
            messages.push({
                role: 'user',
                content: '[System: max iterations reached. Synthesize your final answer from the information gathered so far.]',
            });
            const messageId = `msg-final-${Date.now()}`;
            emitter({ type: EventType.TEXT_MESSAGE_START, timestamp: Date.now(), messageId, role: 'assistant' });
            finalText = await provider.chat({
                messages,
                tools: [],
                emitter,
                messageId,
                signal,
            });
            emitter({ type: EventType.TEXT_MESSAGE_END, timestamp: Date.now(), messageId });
            messages.push({ role: 'assistant', content: finalText });
        }

        // ─── 5. Emit RUN_FINISHED
        emitter({
            type: EventType.RUN_FINISHED,
            timestamp: Date.now(),
            outcome: { type: 'success' },
            result: { finalMessage: finalText, iterations: iteration + 1 },
        });

        return {
            finalMessage: finalText,
            iterations: iteration + 1,
            toolCalls: toolCallsLog,
            finalMessages: messages,
        };
    } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        emitter({
            type: EventType.RUN_ERROR,
            timestamp: Date.now(),
            message: errMsg,
            code: (err as { name?: string })?.name === 'AbortError' ? 'ABORTED' : 'UNKNOWN',
        });
        throw err;
    }
}
