/**
 * An edit shown as a diff in the reply, and a review sent back from it.
 *
 * The scripted model fixes a line of the README through `edit_file`, a tool of the site's whose
 * result is the file before and after. `@aparte/plugin-diff` draws that result under the tool's
 * line, open to comments: a comment on a line goes to the model at once, as the person's next
 * message, and the model answers it. The comment then shows under its line as sent.
 */
import { aparteGlobalConfig } from '@aparte/core';
import { setupDiff, type AparteDiff, type AparteDiffComment } from '@aparte/plugin-diff';
import type { Scenario } from '@aparte/provider-scenario';

/** What the path is asked with: the browser suite's prompt. */
export const DIFF_PROMPT = 'Fix the version in the README.';

/** How a review message starts: the scripted model knows one by it. */
export const REVIEW_HEADING = 'Review:';

const BEFORE = ['# aparté', '', 'Install it with `npm install @aparte/core`.', '', 'Version 0.9 is the current one.', ''].join('\n');
const AFTER = ['# aparté', '', 'Install it with `npm install @aparte/core`.', '', 'Version 1.6 is the current one.', ''].join('\n');

export const DIFF_SCENARIOS: Record<string, Scenario> = {
    editReadme: {
        when: /\bversion in the README\b/i,
        turn: [{ text: 'The README still names 0.9.' }, { tool: 'edit_file', input: { path: 'README.md' } }],
    },
    editedReadme: { after: 'edit_file', turn: 'Done: the README names 1.6 now.' },
    review: {
        when: /^Review:/,
        turn: 'Thanks for the review. I will keep the version in one place, so the README cannot fall behind again.',
    },
};

/** The edit tool, the diff under its line, and comments sent to the model as a review. */
export function setupDiffReview(): void {
    aparteGlobalConfig.registerTool(
        {
            name: 'edit_file',
            description: 'Edit a file of the repository.',
            inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        },
        async (call) => ({ toolCallId: call.id, content: JSON.stringify({ before: BEFORE, after: AFTER }) }),
    );
    setupDiff({
        tool: 'edit_file',
        commentable: true,
        map: (result: { before: string; after: string }, input) => ({ path: String(input['path']), before: result.before, after: result.after }),
    });
    // A comment goes to the model at once, through the chat the diff is in, and shows as sent.
    document.addEventListener('aparte-diff-comment', (event) => {
        const view = event.target as AparteDiff;
        const chat = view.closest('aparte-chat-bubble')?.parentElement?.closest('aparte-chat, [data-aparte-chat]');
        type Composer = HTMLElement & { value: string; streaming: boolean; panelActive: boolean; setValue(value: string): void; submit(): void };
        const composer = chat?.querySelector<Composer>('aparte-composer');
        if (!composer || composer.streaming || composer.panelActive) {
            event.preventDefault();
            return;
        }
        const { path, startLine, endLine, text } = event.detail;
        const lines = startLine === endLine ? `line ${startLine}` : `lines ${startLine}–${endLine}`;
        composer.setValue(`${REVIEW_HEADING} ${path}, ${lines}: ${text}`);
        composer.submit();
        const comment: AparteDiffComment = { ...event.detail, state: 'sent' };
        view.comments = [...view.comments, comment];
    });
}
