/**
 * @aparte/plugin-ask-question
 *
 * The built-in `ask_question` tool — a thin adapter over the core elicitation
 * primitive. The AI asks the user a structured choice; the handler forwards it to
 * `requestUserInput`, presented by `<aparte-elicitation>` (or the semantic
 * `<aparte-ask-question>` alias registered by importing this package).
 *
 * Usage:
 *   import { setupAskQuestion } from '@aparte/plugin-ask-question';
 *   setupAskQuestion();   // registers the tool + hides its bubble segment
 *   // mount <aparte-elicitation> (or <aparte-ask-question>) in your chat
 */

import { aparteGlobalConfig, registerSegmentRenderer, type AparteConfig } from '@aparte/core';
import { askQuestionTool, askQuestionHandler } from './ask-question.js';
import { questionReceiptRenderer } from './question-receipt.renderer.js';
import { buildReceipt } from './receipt.js';

// Register the <aparte-ask-question> semantic alias (subclass of <aparte-elicitation>).
import './aparte-ask-question.js';

/**
 * Register the `ask_question` tool + its handler, and hide its bubble segment
 * (it is a UI-only tool presented via the elicitation panel, not a tool pill).
 * Explicit setup — rather than a top-level import side-effect — keeps the
 * aparteGlobalConfig singleton mutation predictable in SSR/test and tree-shaking
 * friendly. Call once at application startup.
 */
export function setupAskQuestion(config: AparteConfig = aparteGlobalConfig): void {
    config.registerTool(askQuestionTool, askQuestionHandler);

    /*
     * The conversation keeps the record.
     *
     * This used to be `render: () => ''` — render nothing, "it is a UI-only tool" —
     * and the panel lives in the composer, so once it was answered the transcript
     * held no trace that the assistant had asked anything or that the user had
     * answered. Scroll back and the exchange is simply missing, which is not what a
     * conversation is for; every product that asks a structured question puts the
     * question and the chosen answer in the thread.
     *
     * The pieces were all here and wired to nothing: `questionReceiptRenderer` has
     * existed with its own markup, styles and eleven tests, exported and registered
     * by nobody, while the renderer that WOULD have shown something returned the
     * empty string. Another consequence of a surface no example ever ran.
     *
     * Registered too, so its `getStyles()` reaches the document and an app that
     * builds `question-receipt` segments of its own gets the same card.
     */
    registerSegmentRenderer(questionReceiptRenderer, config);
    config.registerToolRenderer('ask_question', {
        render: (segment) => buildReceipt({ input: segment.toolCall.input, result: segment.result }),
    });
}

export { askQuestionTool, askQuestionHandler } from './ask-question.js';
export type { AskQuestionOption, AskQuestionItem, AskQuestionDetail } from './ask-question.js';

export { AparteAskQuestion } from './aparte-ask-question.js';

export { questionReceiptRenderer } from './question-receipt.renderer.js';
export { buildReceipt, receiptRows } from './receipt.js';
export type { QuestionReceiptSegment } from './question-receipt.renderer.js';

export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
