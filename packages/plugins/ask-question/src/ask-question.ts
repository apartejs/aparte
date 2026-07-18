/**
 * ask_question tool for aparté.
 *
 * Lets the AI ask the user a structured question (title + optional description),
 * as single (radio) or multiple (checkbox) choice. The handler is a thin ADAPTER
 * over the core elicitation primitive: it maps the tool input to an elicitation
 * schema and awaits `requestUserInput`, presented by `<aparte-elicitation>` — no
 * framework coupling, no window events, no per-tool contract to drift.
 *
 * Usage:
 *   AparteConfig.registerTool(askQuestionTool, askQuestionHandler);
 */

import type { AparteTool, AparteToolHandler, AparteToolResult } from '@aparte/core';
import { requestUserInput } from '@aparte/core';
import type { AparteElicitationSchema, AparteElicitationEnumField } from '@aparte/core';

export interface AskQuestionOption {
    title: string;
    description?: string;
    /** Highlights this option as the recommended choice */
    recommended?: boolean;
}

/** A single question within an ask_question call (multi-question form). */
export interface AskQuestionItem {
    question: string;
    options: AskQuestionOption[];
    /** If true, renders checkboxes (multi-select). Default false (radio). */
    multiple?: boolean;
    /** Show the free-text "Other…" fallback option. Defaults to true. */
    allowOther?: boolean;
    /** Pre-select the option whose title matches this value */
    defaultValue?: string;
}

export interface AskQuestionDetail {
    toolCallId: string;
    /**
     * Multi-question form. When present and non-empty, EVERY question is rendered
     * and this takes precedence over the single-question fields below.
     */
    questions?: AskQuestionItem[];
    // ── Single-question fields — honoured for callers that build a request directly. ──
    question?: string;
    options?: AskQuestionOption[];
    multiple?: boolean;
    /** Pre-select the option whose title matches this value */
    defaultValue?: string;
    /** Show the free-text "Other…" fallback option. Defaults to true. */
    allowOther?: boolean;
}

export const askQuestionTool: AparteTool = {
    name: 'ask_question',
    description: 'Ask the user a question with structured options (title + optional description). Use for single or multiple choice input.',
    systemPrompt: `You have access to the ask_question tool.

WHEN TO USE IT: only when the user's request is genuinely ambiguous and requires a choice between distinct options before you can proceed (e.g. "which framework should I use?", "what style do you prefer?").

WHEN NOT TO USE IT — respond directly instead:
- Factual questions: "what is 2+2", "what is the capital of France"
- Greetings or chitchat: "hello", "how are you"
- Coding tasks where you can make a reasonable default choice
- Any question you can answer without needing user input

When you do use it, provide 2–6 options with a short "title" each. Set "multiple: true" only when several options can apply simultaneously.`,
    inputSchema: {
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                minItems: 1,
                maxItems: 5,
                description: 'One or more questions to ask the user (each rendered with its own options).',
                items: {
                    type: 'object',
                    properties: {
                        question: {
                            type: 'string',
                            description: 'The question to display to the user'
                        },
                        options: {
                            type: 'array',
                            maxItems: 6,
                            description: 'List of selectable options (max 6)',
                            items: {
                                type: 'object',
                                properties: {
                                    title: { type: 'string', description: 'Short label shown in bold' },
                                    description: { type: 'string', description: 'Optional detail shown below the title' }
                                },
                                required: ['title']
                            }
                        },
                        multiple: {
                            type: 'boolean',
                            description: 'If true, renders checkboxes (multi-select) for this question. Default: false (radio).'
                        },
                        allow_other: {
                            type: 'boolean',
                            description: 'Show a free-text "Other…" option for this question. Default: true.'
                        }
                    },
                    required: ['question']
                }
            },
            // ── Single-question form — also accepted (agnostic). ──
            question: {
                type: 'string',
                description: 'A single question (prefer `questions`).'
            },
            options: {
                type: 'array',
                maxItems: 6,
                description: 'Options for the single-question form.',
                items: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        description: { type: 'string' }
                    },
                    required: ['title']
                }
            },
            multiple: {
                type: 'boolean',
                description: 'Multi-select for the single-question form.'
            }
        },
        // Accept EITHER the multi-question `questions` array OR a single `question`.
        anyOf: [
            { required: ['questions'] },
            { required: ['question'] }
        ]
    }
};

/**
 * ask_question is a thin ADAPTER over the core elicitation primitive: the handler
 * maps the tool input to an elicitation schema (`enum` for one question, an
 * `object` form for several) and awaits `requestUserInput`, which routes to the
 * `<aparte-elicitation>` presenter. `accept` → the answer, `decline` → a
 * model-usable note, `cancel` → an AbortError the loop surfaces as a failed call.
 */
export const askQuestionHandler: AparteToolHandler = async (call, signal): Promise<AparteToolResult> => {
    const { message, schema } = buildRequest(call.input);
    const result = await requestUserInput({ message, schema, signal });
    if (result.action === 'accept') {
        return { toolCallId: call.id, content: formatAnswer(result.content) };
    }
    if (result.action === 'decline') {
        return { toolCallId: call.id, content: 'The user declined to answer.' };
    }
    throw new DOMException('ask_question aborted', 'AbortError');
};

/** Build an elicitation enum field from one normalised question item. */
function enumField(item: AskQuestionItem): AparteElicitationEnumField {
    return {
        type: 'enum',
        options: (item.options ?? []).map((o) => ({
            value: o.title,
            label: o.title,
            description: o.description,
            recommended: o.recommended,
        })),
        multiple: item.multiple,
        allowOther: item.allowOther ?? true,
        default: item.defaultValue,
    };
}

/**
 * Map the raw tool input to a `{ message, schema }` request. Supports the
 * multi-question shape `{ questions: [...] }` (→ an `object` form when there are
 * several, an `enum` when there is one) AND the single-question shape. The model
 * emits snake_case `allow_other` → mapped to `allowOther`.
 */
function buildRequest(input: Record<string, unknown>): { message: string; schema: AparteElicitationSchema } {
    const raw = input['questions'];
    const toItem = (o: Record<string, unknown>): AskQuestionItem => ({
        question: (o['question'] as string) ?? '',
        options: normalizeOptions(o['options']),
        multiple: (o['multiple'] as boolean) ?? false,
        allowOther: (o['allow_other'] as boolean) ?? (o['allowOther'] as boolean) ?? true,
        defaultValue: (o['default_value'] as string) ?? (o['defaultValue'] as string) ?? undefined,
    });

    if (Array.isArray(raw) && raw.length > 0) {
        const items = raw.map((q) => toItem((q ?? {}) as Record<string, unknown>));
        const [firstItem] = items;
        if (items.length === 1 && firstItem) {
            return { message: firstItem.question, schema: enumField(firstItem) };
        }
        const properties: Record<string, AparteElicitationEnumField> = {};
        items.forEach((it, i) => { properties[it.question || `q${i + 1}`] = enumField(it); });
        return { message: 'Please answer:', schema: { type: 'object', properties } };
    }

    // Single-question shape.
    const item = toItem(input);
    return { message: item.question, schema: enumField(item) };
}

/** Flatten the elicitation content into the tool-result string fed back to the model. */
function formatAnswer(content: unknown): string {
    if (Array.isArray(content)) return content.join(', ');
    if (content && typeof content === 'object') {
        return Object.entries(content as Record<string, unknown>)
            .map(([k, v]) => `${k} → ${Array.isArray(v) ? v.join(', ') : String(v)}`)
            .join('\n');
    }
    return String(content ?? '');
}

const _OPT_DESC_KEYS = new Set(['description', 'desc', 'detail']);

/**
 * Normalise a raw options array into AskQuestionOption[]. The schema asks the
 * model for `{title, description}`, but a small model may improvise the option
 * shape at inference: a plain string, or the label under `label`/`value`/`text`/
 * `name`/`option`, or some other key entirely. Accept all of these — and as a last
 * resort take the first non-description string field — so the panel renders real
 * options instead of collapsing to a lone "Other…". Entries with no usable label
 * are dropped.
 */
function normalizeOptions(raw: unknown): AskQuestionOption[] {
    if (!Array.isArray(raw)) return [];
    const out: AskQuestionOption[] = [];
    for (const item of raw) {
        if (item == null) continue;
        if (typeof item === 'string') {
            if (item.trim()) out.push({ title: item });
            continue;
        }
        const o = item as Record<string, unknown>;
        let label: unknown = o['title'] ?? o['label'] ?? o['value'] ?? o['text'] ?? o['name'] ?? o['option'];
        if (label == null || String(label).trim() === '') {
            // Unknown improvised key → first non-description string field wins.
            const entry = Object.entries(o).find(([k, v]) => typeof v === 'string' && v.trim() !== '' && !_OPT_DESC_KEYS.has(k));
            if (entry) label = entry[1];
        }
        if (label == null || String(label).trim() === '') continue;
        const description = o['description'] ?? o['desc'] ?? o['detail'];
        out.push({
            title: String(label),
            description: description != null ? String(description) : undefined,
            recommended: (o['recommended'] ?? o['recommend']) as boolean | undefined,
        });
    }
    return out;
}
