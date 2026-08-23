/**
 * `@aparte/plugin-ask-user` — the DOM-free entry, for Node and SSR.
 *
 * Why this file exists: the browser barrel imports `./aparte-ask-user.js`,
 * which subclasses `AparteElicitation` — a browser-only export of `@aparte/core`.
 * Resolved through core's `node` condition that export does not exist, so
 * `import '@aparte/plugin-ask-user'` threw
 *
 *     SyntaxError: The requested module '@aparte/core' does not provide an
 *     export named 'AparteElicitation'
 *
 * in plain Node — and therefore in any Next / Nuxt / SvelteKit / Analog build that
 * evaluates the import on the server. Worse, the error names `@aparte/core`, so it
 * sent the reader to the wrong package.
 *
 * `@aparte/core` builds exactly this kind of entry and has a gate asserting it
 * stays DOM-free (`scripts/check-node-import.mjs`). The plugins were outside that
 * guard; they are inside it now.
 *
 * What is here: everything a server can legitimately use — the tool definition,
 * its handler, the setup call, and the types. What is NOT here: the custom
 * element and the segment renderer, both of which need a DOM. Calling
 * `setupAskUser()` on the server registers the tool without a presenter,
 * which is the correct outcome: nothing is being rendered there.
 */

import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { askUserTool, askUserHandler } from './ask-user.js';

/** Register the `ask_user` tool + handler, and hide its bubble segment. */
export function setupAskUser(config: AparteConfig = aparteGlobalConfig): void {
    config.registerTool(askUserTool, askUserHandler);
    config.registerToolRenderer('ask_user', { render: () => '' });
}

export { askUserTool, askUserHandler } from './ask-user.js';
export type { AskUserOption, AskUserItem, AskUserDetail } from './ask-user.js';
export type { QuestionReceiptSegment } from './question-receipt.renderer.js';
export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
