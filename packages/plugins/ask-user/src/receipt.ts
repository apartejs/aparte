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

/** One line of the record. */
interface ReceiptRow {
    question: string;
    answer: string;
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
    const questions = questionsOf(call.input);
    const raw = call.result ?? '';
    if (!raw.trim()) return [];

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

    wrap.className = 'seg-qreceipt-group';
    for (const row of rows) {
        const card = document.createElement('div');
        card.className = 'segment seg-qreceipt';

        const q = document.createElement('span');
        q.className = 'qr-question';
        q.textContent = row.question;

        const sep = document.createElement('span');
        sep.className = 'qr-sep';
        sep.textContent = '→';

        const a = document.createElement('span');
        a.className = 'qr-answer';
        a.textContent = row.answer;

        card.append(q, sep, a);
        wrap.appendChild(card);
    }
    return wrap;
}
