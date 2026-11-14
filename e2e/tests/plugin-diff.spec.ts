/**
 * An edit shown as a diff in the reply, and a comment on one of its lines sent as a review:
 * `@aparte/plugin-diff` on the scripted model (`apps/examples/_shared/diff-review.ts`).
 *
 * What a person sees: under the edit tool's line, the file's path and its counts, then the lines
 * with their old and new numbers, the changed one removed then added. A click on a line number
 * opens a field under the line; the comment goes to the model as the person's next message, the
 * model answers, and the comment stays under its line, marked sent. On vanilla and on React: the
 * reply the diff lives in is drawn by core in one and mirrored by the framework in the other.
 */
import { test, expect } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const PROMPT = 'Fix the version in the README.';

test('an edit shows as a diff with line numbers, and a comment on a line is sent and answered', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = new ChatPage(page);
    await page.goto('/?scenario');
    await chat.send(PROMPT);
    await expect(chat.lastReply).toContainText('Done: the README names 1.6 now.');

    const diff = page.locator('aparte-diff').last();
    await expect(diff.locator('.aparte-diff-file__path')).toHaveText('README.md');
    await expect(diff.locator('.aparte-diff-file__added')).toHaveText('+1');
    await expect(diff.locator('.aparte-diff-file__removed')).toHaveText('−1');
    const rows = diff.locator('.aparte-diff-line');
    const read = () => rows.evaluateAll((all) => all.map((row) => [
        row.getAttribute('data-kind'),
        row.querySelector('[data-side="old"]')?.textContent ?? '',
        row.querySelector('[data-side="new"]')?.textContent ?? '',
        row.querySelector('code')?.textContent ?? '',
    ].join(' ')));
    await expect.poll(read).toEqual([
        'context 2 2 ',
        'context 3 3 Install it with `npm install @aparte/core`.',
        'context 4 4 ',
        'del 5  Version 0.9 is the current one.',
        'add  5 Version 1.6 is the current one.',
    ]);
    // The first line is folded, and shown on a click.
    await diff.getByRole('button', { name: 'Show 1 unchanged line' }).click();
    await expect(rows.first()).toContainText('# aparté');

    // A comment on the added line.
    await diff.getByRole('button', { name: 'Added line 5' }).click();
    const field = diff.getByRole('textbox', { name: 'Comment on line 5' });
    await expect(field).toBeFocused();
    await field.fill('Say where the version comes from.');
    await diff.getByRole('button', { name: 'Comment', exact: true }).click();

    await expect(chat.bubbles('user').last()).toContainText('Review: README.md, line 5: Say where the version comes from.');
    await expect(chat.lastReply).toContainText('Thanks for the review.');
    const comment = page.locator('aparte-diff .aparte-diff-comment').last();
    await expect(comment).toContainText('Say where the version comes from.');
    await expect(comment.locator('.aparte-diff-comment__state')).toHaveText('Sent');
    expect(errors).toEqual([]);
});
