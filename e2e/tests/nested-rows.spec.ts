/**
 * Tool rows INSIDE a tool row, every way a line and the calls under it can be: each call looks as
 * it would on its own, whatever the line around it is doing. A reply being written has one caret.
 *
 * The page is the vanilla example's `?harness=nested-rows&subagent-transcript&caret`
 * (`apps/examples/_shared/nested-rows-harness.ts`): 14 lines (seven states, quiet or not), each
 * with a sub-agent that made a call of every state, quiet or not, under it, so 196 nested calls,
 * drawn straight into the transcript. No model and no timing: the cascade is the subject.
 *
 * Why it exists: a rule keyed on a row's state with a DESCENDANT combinator reaches every row
 * under it. A failed call in a sub-agent's transcript read in the success colour
 * (apartejs/aparte#271), and four more rules of the same file had the same shape. jsdom has no
 * cascade, and no browser test had drawn a row inside a row. The caret rule had the same shape:
 * every last paragraph of a transcript blinked as if it were being written.
 *
 * Each nested call is compared with a copy of itself put beside its line, inside no call. The
 * copy keeps the row's own attributes, so a difference can only come from an ancestor. Only what
 * a row's OWN state decides is read. Core's cascade is the same under every wrapper, so vanilla
 * (Chromium and WebKit) carries it.
 */
import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors } from '../helpers/actions.js';
import { ChatPage } from '../helpers/chat.js';

const HARNESS = '/?harness=nested-rows&subagent-transcript&caret';

interface Difference {
    id: string;
    nested: unknown;
    alone: unknown;
}

/** Every nested call whose look differs from the same call drawn alone, and how many were read. */
function differences(page: Page): Promise<{ read: number; lines: number; quietLines: number; differ: Difference[] }> {
    return page.evaluate(() => {
        const ROW = '.aparte-segment-tool-call';
        const own = (row: Element, part: string): Element | undefined =>
            [...row.querySelectorAll(part)].find((el) => el.closest(ROW) === row);
        const look = (row: Element) => {
            const read = (part: string, properties: string[]) => {
                const el = own(row, part);
                if (!el) return null;
                const style = getComputedStyle(el);
                return Object.fromEntries(properties.map((p) => [p, style.getPropertyValue(p)]));
            };
            return {
                state: read('.aparte-tool-state', ['color', 'position', 'width', 'clip']),
                name: read('.aparte-tool-name', ['color']),
                target: read('.aparte-tool-target', ['font-family', 'color']),
                toggle: read('.aparte-tool-toggle', ['order']),
            };
        };
        const lines = [...document.querySelectorAll(`${ROW}[data-segment-id^="line:"]`)].filter((l) => !l.closest(`${ROW} ${ROW}`));
        const differ: Difference[] = [];
        let read = 0;
        for (const line of lines) {
            for (const row of line.querySelectorAll(ROW)) {
                const alone = row.cloneNode(true) as Element;
                alone.removeAttribute('data-segment-id');
                line.after(alone);
                const nested = look(row);
                const copy = look(alone);
                alone.remove();
                read++;
                if (JSON.stringify(nested) !== JSON.stringify(copy)) {
                    differ.push({ id: row.getAttribute('data-segment-id') ?? '?', nested, alone: copy });
                }
            }
        }
        return { read, lines: lines.length, quietLines: lines.filter((l) => l.hasAttribute('data-quiet')).length, differ };
    });
}

async function openHarness(page: Page): Promise<ChatPage> {
    const chat = new ChatPage(page);
    await page.goto(HARNESS);
    // The last message the harness draws: every row before it is on the page.
    await expect(chat.bubbles('assistant').last().locator('.aparte-segment-text')).not.toHaveCount(0);
    return chat;
}

for (const motion of ['no-preference', 'reduce'] as const) {
    test(`a call under a line looks as it would on its own, whatever the line's state (motion: ${motion})`, async ({ page }) => {
        const errors = collectPageErrors(page);
        // Under reduced motion a working quiet line shows its state word, which the shimmer
        // says otherwise: a rule of its own, that must stop at its own line too.
        await page.emulateMedia({ reducedMotion: motion });
        await openHarness(page);
        const result = await differences(page);
        // What was read, or the comparison says nothing: every line and every call under it,
        // quiet lines and loud ones.
        expect(result.lines, 'lines with a sub-agent under them').toBe(15);
        expect(result.quietLines, 'quiet lines among them').toBe(8);
        expect(result.read, 'calls read under the lines').toBe(196);
        expect(result.differ, 'calls that look otherwise than on their own').toEqual([]);
        expect(errors, 'no uncaught page errors').toEqual([]);
    });
}

/**
 * The look each state is meant to have, read on the calls drawn on their own. Without this, a
 * rule that stopped matching anything would leave a nested call and its copy alike, and the
 * comparison above would pass.
 */
test('on its own, each state wears its own look', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHarness(page);
    const looks = await page.evaluate(() => {
        const row = (id: string) => document.querySelector(`.aparte-segment-tool-call[data-segment-id="${id}"]`)!;
        const style = (id: string, part: string) => getComputedStyle(row(id).querySelector(part)!);
        // The inks as the theme resolves them, through an element that wears each one.
        const ink = (variable: string) => {
            const probe = document.createElement('span');
            probe.style.color = `var(${variable})`;
            row('ref:resolved-loud').append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        };
        const label = (id: string) => getComputedStyle(row(id).querySelector('.aparte-tool-name')!).fontFamily;
        return {
            success: ink('--aparte-success-ink'),
            muted: ink('--aparte-text-muted'),
            resolvedState: style('ref:resolved-loud', '.aparte-tool-state').color,
            failedState: style('ref:failed-loud', '.aparte-tool-state').color,
            queuedName: style('ref:queued-loud', '.aparte-tool-name').color,
            pendingName: style('ref:pending-loud', '.aparte-tool-name').color,
            quietTarget: style('ref:resolved-quiet', '.aparte-tool-target').fontFamily,
            quietLabel: label('ref:resolved-quiet'),
            loudTarget: style('ref:resolved-loud', '.aparte-tool-target').fontFamily,
            quietToggle: style('ref:resolved-quiet', '.aparte-tool-toggle').order,
            loudToggle: style('ref:resolved-loud', '.aparte-tool-toggle').order,
            quietPendingState: style('ref:pending-quiet', '.aparte-tool-state').position,
        };
    });
    expect(looks.resolvedState, 'a call that is done says so in the success ink').toBe(looks.success);
    expect(looks.failedState, 'a call that failed does not').toBe(looks.muted);
    expect(looks.queuedName, 'a call waiting its turn has its name in the muted ink').toBe(looks.muted);
    expect(looks.pendingName, 'a running call does not').not.toBe(looks.muted);
    expect(looks.quietTarget, 'a quiet line\'s target is in the chat\'s face').toBe(looks.quietLabel);
    expect(looks.loudTarget, 'another line\'s target is not').not.toBe(looks.quietLabel);
    expect(looks.quietToggle, 'a quiet line\'s chevron at its end').toBe('1');
    expect(looks.loudToggle, 'another line\'s where it was').toBe('0');
    expect(looks.quietPendingState, 'under reduced motion, a running quiet line shows its state').toBe('static');
    expect(errors, 'no uncaught page errors').toEqual([]);
});

test('a reply being written has one caret, after its own words, none in a sub-agent\'s', async ({ page }) => {
    const errors = collectPageErrors(page);
    const chat = await openHarness(page);
    const reply = chat.bubbles('assistant').last();
    await expect(reply.locator('.aparte-message')).toHaveAttribute('data-caret', '');
    const carets = await reply.evaluate((bubble) =>
        [...bubble.querySelectorAll('p, li')]
            .filter((el) => getComputedStyle(el, '::after').content !== 'none')
            .map((el) => el.textContent ?? ''));
    expect(carets).toEqual(['Checking the notes now']);
    expect(errors, 'no uncaught page errors').toEqual([]);
});
