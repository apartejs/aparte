/**
 * What the conversation keeps after a question has been asked.
 *
 * The panel lives in the composer, so once it is answered it is gone. Without a
 * record in the thread, scrolling back shows nothing: no question, no answer, no
 * sign the assistant ever asked. Every product that asks a structured question puts
 * the question and the chosen answer in the conversation, and this is that.
 *
 * Built as an **HTMLElement** rather than an HTML string, deliberately: everything
 * here is model-chosen (the questions) or user-typed (a free-text answer), and the
 * element arm of `AparteToolRenderer` has no innerHTML surface at all. The string
 * arm's first natural line is a model-to-DOM XSS in the host page's origin.
 */

import type { AparteToolCall } from '@aparte/core';
import { ASK_USER_DECLINED } from './ask-user.js';

/**
 * One line of the record.
 *
 * Exported because `receiptRows()` returns them and a consumer writing their own
 * renderer has to name the type. It was package-private, so the declaration emit put an
 * un-exported `interface ReceiptRow` in the `.d.ts` — reachable by inference, nameable
 * by nobody.
 */
export interface ReceiptRow {
    question: string;
    answer: string;
    /**
     * The user declined the whole request — so this row is the OUTCOME, not an
     * answer, and it has no question of its own.
     *
     * Without this the decline sentence was split as though it were the answer to the
     * first question, leaving the others blank: "Quelle est ta couleur préférée ? →
     * The user declined to answer." next to an empty row. Reported from a real
     * session, and it is worse than useless — it attributes words to the user.
     */
    declined?: true;
}

/**
 * What the renderer is handed: the model's input, and the result IF the call has
 * settled.
 *
 * `result` lives on the tool-call SEGMENT, not on `AparteToolCall` — which has only
 * `{ id, name, input }`. `AparteToolRenderer`'s own JSDoc said
 * "`segment.toolCall.result` is whatever the tool returned", which does not compile;
 * corrected there too.
 */
export interface ReceiptSource {
    input: AparteToolCall['input'];
    result?: string | undefined;
    /** The handler's structured twin of `result`, read first when it is there. */
    structuredResult?: unknown;
}

/** The structure `askUserHandler` attaches, if `value` is one — a result from elsewhere is not. */
function structuredRows(value: unknown): ReceiptRow[] | null {
    const s = value as { action?: unknown; answers?: unknown } | null;
    if (!s || typeof s !== 'object') return null;
    if (s.action === 'decline') return [{ question: '', answer: ASK_USER_DECLINED, declined: true }];
    if (s.action !== 'accept' || !Array.isArray(s.answers)) return null;
    return s.answers.map((a) => {
        const row = (a ?? {}) as { question?: unknown; value?: unknown };
        const v = row.value;
        return { question: String(row.question ?? ''), answer: Array.isArray(v) ? v.map(String).join(', ') : String(v ?? '') };
    });
}

/** The questions the model asked, in the order it asked them. */
function questionsOf(input: unknown): string[] {
    const obj = (input ?? {}) as Record<string, unknown>;
    const list = obj['questions'];
    if (Array.isArray(list) && list.length > 0) {
        return list.map((q) => String((q as Record<string, unknown>)?.['question'] ?? '').trim());
    }
    const single = obj['question'];
    return typeof single === 'string' && single.trim() ? [single.trim()] : [];
}

/**
 * Pair each question with its answer.
 *
 * The handler formats a multi-question result as `question → answer` per line, and a
 * single answer as itself. The questions come from the tool INPUT rather than from
 * that string, because the input is authoritative — an answer a user typed can
 * contain anything, including an arrow.
 */
export function receiptRows(call: ReceiptSource): ReceiptRow[] {
    // The value, when the handler attached one: nothing to parse, and an arrow typed
    // by the user cannot confuse it. The prose path stays for a result from elsewhere.
    const structured = structuredRows(call.structuredResult);
    if (structured) return structured;

    const questions = questionsOf(call.input);
    const raw = call.result ?? '';
    if (!raw.trim()) return [];

    // Declining is a whole-request outcome: ONE row, no question attached, and
    // certainly not this sentence pinned to the first question as if the user had
    // typed it. `Skip` declines everything by design (MCP's `decline`), including
    // questions already answered — which is exactly what made the old rendering a
    // lie rather than merely wrong.
    if (raw.trim() === ASK_USER_DECLINED) {
        return [{ question: '', answer: raw.trim(), declined: true }];
    }

    if (questions.length <= 1) {
        return [{ question: questions[0] ?? '', answer: raw.trim() }];
    }

    const lines = raw.split('\n').filter((l) => l.trim() !== '');
    return questions.map((question, i) => {
        const line = lines[i] ?? '';
        const sep = line.indexOf(' → ');
        // Split on the FIRST arrow: the question is ours, the answer is the user's,
        // so anything arrow-like later in the line belongs to the answer.
        return { question, answer: sep === -1 ? line.trim() : line.slice(sep + 3).trim() };
    });
}

/**
 * The card the transcript shows: one `question → answer` row per question.
 *
 * Returns an empty element while the call has no result yet — the live UI is the
 * panel in the composer, and a duplicate of it in the bubble would be two places to
 * read the same pending question. Once answered, this is the only record.
 */
export function buildReceipt(call: ReceiptSource): HTMLElement {
    const wrap = document.createElement('div');
    const rows = receiptRows(call);
    if (rows.length === 0) return wrap;

    wrap.className = 'aparte-question-receipt__group';
    for (const row of rows) {
        const card = document.createElement('div');
        // The card wears core's mark (display/mark.css): an answer given is the row the
        // choice landed on — the success tint and the bar on its start edge — and a
        // declined request is the outcome that did not happen, in the mark's quiet
        // voice. Same recipe as a chosen option in a dropdown or a checked field choice.
        card.className = 'aparte-segment aparte-tag aparte-question-receipt aparte-mark'
            + (row.declined ? ' aparte-mark--quiet aparte-question-receipt--declined' : ' aparte-mark--success');

        // A declined request has no question → answer pair to show, so it gets neither
        // a question nor an arrow: one line saying what happened.
        if (!row.declined) {
            const q = document.createElement('span');
            q.className = 'aparte-tag__label aparte-question-receipt__question';
            q.textContent = row.question;

            const sep = document.createElement('span');
            sep.className = 'aparte-question-receipt__sep';
            sep.textContent = '→';

            card.append(q, sep);
        }

        const a = document.createElement('span');
        a.className = 'aparte-tag__label ' + (row.declined ? 'aparte-question-receipt__answer--declined' : 'aparte-question-receipt__answer');
        a.textContent = row.answer;

        card.appendChild(a);
        wrap.appendChild(card);
    }
    return wrap;
}
