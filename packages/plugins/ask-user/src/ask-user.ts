/**
 * ask_user tool for aparté.
 *
 * Lets the AI ask the user a structured question (title + optional description),
 * as single (radio) or multiple (checkbox) choice. The handler is a thin ADAPTER
 * over the core elicitation primitive: it maps the tool input to an elicitation
 * schema and awaits `requestUserInput`, presented by `<aparte-elicitation>` — no
 * framework coupling, no window events, no per-tool contract to drift.
 *
 * Usage:
 *   aparteGlobalConfig.registerTool(createAskUserTool(), askUserHandler);
 */

import type { AparteTool, AparteToolHandler, AparteToolResult } from '@aparte/core';
import { requestUserInput } from '@aparte/core';
import type {
    AparteElicitationSchema,
    AparteElicitationEnumField,
    AparteElicitationStringField,
} from '@aparte/core';

export interface AskUserOption {
    title: string;
    description?: string;
    /** Highlights this option as the recommended choice */
    recommended?: boolean;
}

/** A single question within an ask_user call (multi-question form). */
export interface AskUserItem {
    question: string;
    /** A short label — the chip a stepped form shows for this question. */
    header?: string;
    options: AskUserOption[];
    /** If true, renders checkboxes (multi-select). Default false (radio). */
    multiple?: boolean;
    /** Pre-select the option whose title matches this value */
    defaultValue?: string;
}

export interface AskUserDetail {
    toolCallId: string;
    /**
     * Multi-question form. When present and non-empty, EVERY question is rendered
     * and this takes precedence over the single-question fields below.
     */
    questions?: AskUserItem[];
    // ── Single-question fields — honoured for callers that build a request directly. ──
    question?: string;
    options?: AskUserOption[];
    multiple?: boolean;
    /** Pre-select the option whose title matches this value */
    defaultValue?: string;
}

/** Bounds the schema puts on what the model may ask for, and the words the model reads. */
export interface AskUserToolOptions {
    /**
     * The tool's name. Default `ask_user`.
     *
     * A backend that already exposes an `ask_user` of its own, or a product that
     * wants the model to see `clarify`, used to have to fork the tool for one
     * string. The receipt follows the name: `setupAskUser` registers its renderer
     * under whatever is chosen here.
     */
    name?: string;
    /** The one-line description the model reads in the tool inventory. */
    description?: string;
    /**
     * The instructions telling the model WHEN to reach for the tool. The default is
     * the policy every serious implementation lands near — ask only when the request
     * is genuinely ambiguous — and it is written in English. A product with another
     * policy, or another language, passes its own text; it replaces the default whole.
     */
    systemPrompt?: string;
    /**
     * Options per question. Default 4.
     *
     * Four because six plus the free-text escape is seven rows in a composer, and it
     * reads as a form that escaped into a chat — and because a model asked for four
     * writes better options than one asked for six: it has to choose. Configurable
     * because a real case may differ, and because a bound the host cannot move is a
     * bound the host has to fork the tool to change.
     */
    maxOptions?: number;
    /** Questions per call. Default 5. */
    maxQuestions?: number;
}

/** What `setupAskUser` takes: the tool's options, plus whether the transcript keeps a receipt. */
export interface AskUserSetupOptions extends AskUserToolOptions {
    /**
     * Whether an answered question stays in the transcript as a receipt card.
     * Default true. `false` renders nothing for the call — for a product whose own
     * UI already records the exchange.
     */
    receipt?: boolean;
}

/**
 * Build the `ask_user` tool.
 *
 * A factory rather than a constant because the schema carries BOUNDS, and bounds are
 * the host's to set: this is the same reasoning that moved the free-text escape out
 * of the model's schema and onto the config. The defaults are what every serious
 * implementation of this pattern lands near (four options, a handful of questions),
 * so `createAskUserTool()` with no argument is the normal call.
 */
export function createAskUserTool(options: AskUserToolOptions = {}): AparteTool {
    const maxOptions = options.maxOptions ?? 4;
    const maxQuestions = options.maxQuestions ?? 5;
    const name = options.name ?? 'ask_user';
    return {
    name,
    description: options.description ?? 'Ask the user a question with structured options (title + optional description). Use for single or multiple choice input.',
    systemPrompt: options.systemPrompt ?? `You have access to the ${name} tool.

WHEN TO USE IT: only when the user's request is genuinely ambiguous and requires a choice between distinct options before you can proceed (e.g. "which framework should I use?", "what style do you prefer?").

WHEN NOT TO USE IT — respond directly instead:
- Factual questions: "what is 2+2", "what is the capital of France"
- Greetings or chitchat: "hello", "how are you"
- Coding tasks where you can make a reasonable default choice
- Any question you can answer without needing user input

When you do use it, every question needs a short "header" (one or two words — it is the
tab a user clicks to come back to that question) and 2 to ${maxOptions} options, each
with a short "title". Both are enforced by the schema, not preferences. Set
"multiple: true" only when several options can apply simultaneously.`,
    inputSchema: {
        type: 'object',
        properties: {
            questions: {
                type: 'array',
                minItems: 1,
                maxItems: maxQuestions,
                description: 'One or more questions to ask the user (each rendered with its own options).',
                items: {
                    type: 'object',
                    properties: {
                        question: {
                            type: 'string',
                            description: 'The question to display to the user'
                        },
                        header: {
                            type: 'string',
                            maxLength: 16,
                            description: 'A SHORT label for this question — one or two words, no sentence (e.g. "Colour", "Framework"). It is the tab a user clicks to come back to this question, so it has to read as a name.'
                        },
                        options: {
                            type: 'array',
                            // minItems, and REQUIRED below.
                            //
                            // Both were missing, so `{question, allow_other: true}`
                            // with no options at all was a schema-VALID call — and a
                            // local model made exactly that call. The panel then had
                            // nothing to offer and rendered a radio list whose only
                            // entry was "Other…": a text box wearing the costume of a
                            // choice. The 2–6 range was stated in the system prompt,
                            // in prose. A small model reads the schema.
                            minItems: 2,
                            // FOUR, not six.
                            //
                            // Six options plus the free-text escape is seven rows in a
                            // composer, and it looked like what it was: a form that had
                            // escaped into a chat. Every serious implementation of this
                            // pattern caps around four, and a model asked for four
                            // writes better options than one asked for six — it has to
                            // choose. Reversible if a real case needs more.
                            maxItems: maxOptions,
                            description: `The selectable options (2 to ${maxOptions}). A question with no options is not a choice — answer the user directly instead.`,
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
                        }
                        // No `allow_other`. Whether a choice offers a free-text escape
                        // is the HOST's decision — `setElicitationOptions({ allowOther })`
                        // — not a field for the model to fill. It used to be here, and a
                        // small model sent `allow_other: true` with no options at all,
                        // which is how the panel came to render a radio list whose only
                        // entry was "Other…". An `allow_other` still sent is ignored, so
                        // no existing call breaks.
                    },
                    // `header` is REQUIRED, and that is the difference between tabs
                    // reading "Forme" and "Couleur" or reading "1" and "2". Left
                    // optional, a model simply omits it — observed on the first real
                    // run against a local model. The adapter still falls back to the
                    // position, so a model that ignores this produces a usable panel
                    // rather than an error; requiring it makes the good case normal.
                    required: ['question', 'header', 'options']
                }
            },
            // ── Single-question form — also accepted (agnostic). ──
            question: {
                type: 'string',
                description: 'A single question (prefer `questions`).'
            },
            options: {
                type: 'array',
                minItems: 2,
                maxItems: maxOptions,
                description: `Options for the single-question form (2 to ${maxOptions}).`,
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
        // EITHER the multi-question array OR a single question — and in the single
        // case its options too. `anyOf` is honoured unevenly by local runtimes, which
        // is why the per-item `required` above carries the weight instead.
        anyOf: [
            { required: ['questions'] },
            { required: ['question', 'options'] }
        ]
    }
    };
}

/**
 * ask_user is a thin ADAPTER over the core elicitation primitive: the handler
 * maps the tool input to an elicitation schema (`enum` for one question, an
 * `object` form for several) and awaits `requestUserInput`, which routes to the
 * `<aparte-elicitation>` presenter. `accept` → the answer, `decline` → a
 * model-usable note, `cancel` → an AbortError the loop surfaces as a failed call.
 */
/**
 * What the model is told when the user declines.
 *
 * A constant rather than a literal because the RECEIPT has to recognise it: the
 * transcript must show "declined" instead of pairing this sentence with the first
 * question as though the user had said it. Matching English at a distance would have
 * been the alternative, and it breaks the moment this string is localised.
 */
export const ASK_USER_DECLINED = 'The user declined to answer.';

export const askUserHandler: AparteToolHandler = async (call, signal, context): Promise<AparteToolResult> => {
    const { message, schema, labels } = buildRequest(call.input);
    // `target` is what makes the RIGHT chat answer. Without it `requestUserInput`
    // resolves its presenter from the global config, so a chat given its own
    // `config` — with its own `<aparte-elicitation>` — got `{ action: 'cancel' }`
    // and the model was told the user had refused a question never shown to them.
    // The handler had no way to know which chat it was running for until
    // `AparteToolContext` existed.
    // No try/catch and no third branch: a request that ends without an answer REJECTS
    // with an AbortError now, which is what this handler used to build by hand from
    // `{ action: 'cancel' }`. Letting it propagate is the same outcome with one fewer
    // place to get it wrong — and the conversion existing here is what showed the
    // rejection was the right shape for the primitive.
    const result = await requestUserInput({ message, schema, signal, target: context?.target });
    if (result.action === 'accept') {
        return { toolCallId: call.id, content: formatAnswer(result.content, labels) };
    }
    return { toolCallId: call.id, content: ASK_USER_DECLINED };
};

/**
 * Build the elicitation field for one normalised question.
 *
 * A question with no usable options degrades to a free-text field rather than to an
 * enum with nothing in it. The schema now forbids that shape, but a model that
 * ignores the schema is the normal case, not the exception — and the old code built
 * `{ type: 'enum', options: [] }`, which the panel rendered as a radio list whose
 * only entry was "Other…". Selecting a radio to reveal the text box you actually
 * needed is a worse text box.
 *
 * The question text becomes the field's `title` in both shapes. It used to be
 * carried by the object PROPERTY KEY instead, and the panel labelled the field only
 * because it falls back to printing the key when a field has no title — a label that
 * worked by accident.
 */
function questionField(item: AskUserItem): AparteElicitationEnumField | AparteElicitationStringField {
    const options = item.options ?? [];
    if (options.length === 0) {
        return { type: 'string', title: item.question, header: item.header, default: item.defaultValue };
    }
    return {
        type: 'enum',
        title: item.question,
        header: item.header,
        options: options.map((o) => ({
            value: o.title,
            label: o.title,
            description: o.description,
            recommended: o.recommended,
        })),
        multiple: item.multiple,
        // Deliberately unset: the panel falls back to the host's policy
        // (`setElicitationOptions`). See the schema comment above.
        default: item.defaultValue,
    };
}

/**
 * Map the raw tool input to a `{ message, schema }` request. Supports the
 * multi-question shape `{ questions: [...] }` (→ an `object` form when there are
 * several, an `enum` when there is one) AND the single-question shape. The model
 * emits snake_case `allow_other` → mapped to `allowOther`.
 */
function buildRequest(input: Record<string, unknown>): {
    message: string;
    schema: AparteElicitationSchema;
    /** Form key → the question text, so the answer sent back names the question. */
    labels: Record<string, string>;
} {
    const raw = input['questions'];
    const toItem = (o: Record<string, unknown>): AskUserItem => ({
        question: (o['question'] as string) ?? '',
        header: (o['header'] as string) ?? undefined,
        options: normalizeOptions(o['options']),
        multiple: (o['multiple'] as boolean) ?? false,
        // `allow_other` is read from nowhere on purpose — it is the host's call.
        defaultValue: (o['default_value'] as string) ?? (o['defaultValue'] as string) ?? undefined,
    });

    if (Array.isArray(raw) && raw.length > 0) {
        const items = raw.map((q) => toItem((q ?? {}) as Record<string, unknown>));
        const [firstItem] = items;
        if (items.length === 1 && firstItem) {
            return { message: firstItem.question, schema: questionField(firstItem), labels: {} };
        }
        // STABLE keys, not the question text.
        //
        // The text used to be the property key, which had three costs: two
        // identically-worded questions silently collapsed into one field; the key is
        // what `formatAnswer` sends back, so a long question became a long key; and
        // the field's label depended on the panel's fallback of printing the key.
        // The text now travels as the field's `title` — and `labels` carries it to
        // the answer, so the model still reads "question → answer" and not "q2 →".
        const properties: Record<string, AparteElicitationEnumField | AparteElicitationStringField> = {};
        const labels: Record<string, string> = {};
        items.forEach((it, i) => {
            const key = `q${i + 1}`;
            properties[key] = questionField(it);
            labels[key] = it.question;
        });
        // No generic header: every field is labelled with its own question, so
        // "Please answer:" was one more line of untranslated English above questions
        // in the user's language.
        return { message: '', schema: { type: 'object', properties }, labels };
    }

    // Single-question shape.
    const item = toItem(input);
    return { message: item.question, schema: questionField(item), labels: {} };
}

/**
 * Flatten the elicitation content into the tool-result string fed back to the model.
 *
 * `labels` maps the form's stable keys back to the question text, so the model reads
 * "Quelle couleur ? → bleu" rather than "q1 → bleu". Without it, stable keys would
 * have made the answer unintelligible to the very reader it is for.
 */
function formatAnswer(content: unknown, labels: Record<string, string> = {}): string {
    if (Array.isArray(content)) return content.join(', ');
    if (content && typeof content === 'object') {
        return Object.entries(content as Record<string, unknown>)
            .map(([k, v]) => `${labels[k] ?? k} → ${Array.isArray(v) ? v.join(', ') : String(v)}`)
            .join('\n');
    }
    return String(content ?? '');
}

const _OPT_DESC_KEYS = new Set(['description', 'desc', 'detail']);

/**
 * Normalise a raw options array into AskUserOption[]. The schema asks the
 * model for `{title, description}`, but a small model may improvise the option
 * shape at inference: a plain string, or the label under `label`/`value`/`text`/
 * `name`/`option`, or some other key entirely. Accept all of these — and as a last
 * resort take the first non-description string field — so the panel renders real
 * options instead of collapsing to a lone "Other…". Entries with no usable label
 * are dropped.
 */
function normalizeOptions(raw: unknown): AskUserOption[] {
    if (!Array.isArray(raw)) return [];
    const out: AskUserOption[] = [];
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
