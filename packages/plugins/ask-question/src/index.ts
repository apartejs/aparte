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

import { AparteConfig } from '@aparte/core';
import { askQuestionTool, askQuestionHandler } from './ask-question.js';

// Register the <aparte-ask-question> semantic alias (subclass of <aparte-elicitation>).
import './aparte-ask-question.js';

/**
 * Register the `ask_question` tool + its handler, and hide its bubble segment
 * (it is a UI-only tool presented via the elicitation panel, not a tool pill).
 * Explicit setup — rather than a top-level import side-effect — keeps the
 * AparteConfig singleton mutation predictable in SSR/test and tree-shaking
 * friendly. Call once at application startup.
 */
export function setupAskQuestion(): void {
    AparteConfig.registerTool(askQuestionTool, askQuestionHandler);
    AparteConfig.registerToolRenderer('ask_question', { render: () => '' });
}

export { askQuestionTool, askQuestionHandler } from './ask-question.js';
export type { AskQuestionOption, AskQuestionItem, AskQuestionDetail } from './ask-question.js';

export { AparteAskQuestion } from './aparte-ask-question.js';

export { questionReceiptRenderer } from './question-receipt.renderer.js';
export type { QuestionReceiptSegment } from './question-receipt.renderer.js';

export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
