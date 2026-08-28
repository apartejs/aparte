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
import { createAskUserTool, askUserHandler, type AskUserSetupOptions } from './ask-user.js';

/**
 * Register the `ask_user` tool + handler on the server.
 *
 * No receipt renderer here: it builds DOM, and this entry exists precisely so an SSR
 * build can import the package without a document. The browser entry registers it.
 */
export function setupAskUser(options: AskUserSetupOptions = {}, config: AparteConfig = aparteGlobalConfig): void {
    const tool = createAskUserTool(options);
    config.registerTool(tool, askUserHandler);
    config.registerToolRenderer(tool.name, { render: () => '' });
}

export { createAskUserTool, askUserHandler } from './ask-user.js';
export type { AskUserToolOptions, AskUserSetupOptions, AskUserAnswer, AskUserStructuredResult } from './ask-user.js';
export type { AskUserOption, AskUserItem, AskUserDetail } from './ask-user.js';
export type { QuestionReceiptSegment } from './question-receipt.renderer.js';
export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
