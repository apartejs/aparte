/**
 * ask-question.tool.ts — Tool factory : agent asks the user a structured question.
 *
 * Interactive tool that pauses the flow and waits for user input via the
 * resolver injected by the consumer.
 *
 *   apps/home     → resolver dispatches @aparte/plugin-ask-question events
 *                   (renders option chips, waits for click)
 *   tests-node    → resolver is a mock function returning a scripted answer
 *
 * Schema aligned with @aparte/plugin-ask-question (apps/home native plugin) :
 *   - options: array of {title, description?, recommended?}, 2-6 items
 *   - multiple: boolean (checkbox vs radio)
 *   - allow_other: boolean (offer "Autre..." fallback)
 *   - default_value: string (pre-selected option title)
 */

import type { Tool, ToolContext } from '../tool';

/**
 * Question payload — passed to the resolver.
 */
export interface AskQuestionPayload {
    /** Tool call ID (for tracing). */
    toolCallId?: string;
    /** The question shown to user. */
    question: string;
    /** Selectable options. */
    options: Array<{ title: string; description?: string; recommended?: boolean }>;
    /** Checkbox (multi-select) vs radio (single). Default false (radio). */
    multiple: boolean;
    /** Allow free-text "Autre..." input. Default true. */
    allow_other: boolean;
    /** Pre-selected option title. */
    default_value?: string;
}

/**
 * Resolver function — consumer implements this.
 * Returns the user's answer as a string. Throws if the user aborts/closes the
 * dialog. Receives the tool's `AbortSignal` so the UI can tear the prompt down
 * on a client-side timeout or turn abort.
 */
export type AskQuestionResolver = (payload: AskQuestionPayload, signal?: AbortSignal) => Promise<string>;

/**
 * Build the ask_question Tool.
 */
export function buildAskQuestionTool(resolver: AskQuestionResolver): Tool {
    return {
        marker: { mode: 'mandatory_always' },
        descriptor: {
            name: 'ask_question',
            description: `Ask the user a structured question with options (radio or checkbox). Use this ONLY when the user's request is genuinely ambiguous AND requires a choice between distinct options before you can continue (e.g., "which framework?", "what output format?", "which language?").

DO NOT use this for :
  - Factual questions (capitals, calculations, weather)
  - Greetings / chitchat
  - Tasks where you can pick a reasonable default
  - Questions about file content (use retrieve_file instead)

When you DO use it :
  - Provide 2 to 6 options with a short "title" each (max 6)
  - Add "description" if an option needs nuance
  - Mark ONE option with recommended:true ONLY if it's clearly the best default
  - Set multiple:true ONLY if several options can apply simultaneously
  - allow_other:false ONLY for a closed enum (yes/no, fr/en/de). Otherwise default true offers "Autre..." fallback
  - default_value : pre-selects the option whose title matches this string (single mode)`,
            parameters: {
                type: 'object',
                properties: {
                    question: {
                        type: 'string',
                        description: 'The question to display to the user.',
                    },
                    options: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 6,
                        description: 'List of selectable options (2 to 6).',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string', description: 'Short label shown in bold.' },
                                description: { type: 'string', description: 'Optional detail under the title.' },
                                recommended: { type: 'boolean', description: 'If true, option is highlighted. Max one per question.' },
                            },
                            required: ['title'],
                        },
                    },
                    multiple: {
                        type: 'boolean',
                        description: 'If true : checkboxes (multi-select). If false (default) : radios auto-submit.',
                    },
                    allow_other: {
                        type: 'boolean',
                        description: 'If true (default), offer an "Autre..." free-text fallback. Set false for closed enums.',
                    },
                    default_value: {
                        type: 'string',
                        description: 'Pre-select the option whose title matches this string (single mode only).',
                    },
                },
                required: ['question', 'options'],
            },
        },

        handler: async (args, ctx: ToolContext) => {
            const question = String(args['question'] ?? '').trim();
            if (!question) return 'FAILED: question manquante';

            const optionsRaw = Array.isArray(args['options']) ? (args['options'] as unknown[]) : [];
            if (optionsRaw.length < 2) return 'FAILED: au moins 2 options requises';
            if (optionsRaw.length > 6) return 'FAILED: max 6 options';

            const options = optionsRaw
                .filter(o => o && typeof (o as { title?: unknown }).title === 'string')
                .map(o => {
                    const oo = o as Record<string, unknown>;
                    return {
                        title: String(oo['title']),
                        description: typeof oo['description'] === 'string' ? oo['description'] : undefined,
                        recommended: oo['recommended'] === true,
                    };
                });

            const payload: AskQuestionPayload = {
                toolCallId: `aq-${Date.now()}`,
                question,
                options,
                multiple: args['multiple'] === true,
                allow_other: args['allow_other'] !== false,
                default_value: typeof args['default_value'] === 'string' ? args['default_value'] : undefined,
            };

            try {
                const answer = await resolver(payload, ctx.signal);
                return `User answered : ${answer}`;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `FAILED: ask_question aborted : ${msg}`;
            }
        },
    };
}
