/**
 * The tabs recipe's examples carry the ARIA their `role="tablist"` promises.
 *
 * These banner blocks are not documentation, they are the showcase: the kit page
 * renders them verbatim as the live preview of the family (the same reason
 * `examples-are-specimens.test.ts` exists). And what they showed was the defect this
 * repo's own tab code calls out — a `role="tablist"` of plain buttons, every one of
 * them a tab stop, none of them naming a panel. A reader is told "tab, 1 of 2" and
 * then Tab moves to the next tab instead of into the content, with nothing saying
 * what content that would be. Plain buttons with no role at all would announce less
 * and mislead less.
 *
 * Three things make the role true, and all three are markup the recipe can ship:
 * the roving `tabindex` (one stop for the whole list, on the selected tab),
 * `aria-controls` from each tab to a `role="tabpanel"`, and `aria-labelledby` back.
 * The ArrowLeft/ArrowRight/Home/End handler is the app's — the banner says so, and
 * points at the working one in `@aparte/plugin-artifacts`' card.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const css = readFileSync(join(coreRoot(), 'src/styles/surface/tabs.css'), 'utf8');

/** The indented HTML runs inside the banner comments — one block per blank line. */
function htmlBlocks(source: string): string[] {
    const blocks: string[] = [];
    for (const [, body] of source.matchAll(/\/\*([\s\S]*?)\*\//g)) {
        let current: string[] = [];
        for (const raw of body!.split('\n')) {
            const line = raw.replace(/^\s*\*\s?/, '');
            if (/^\s{2,}</.test(line)) {
                current.push(line.trim());
            } else {
                if (current.length) blocks.push(current.join('\n'));
                current = [];
            }
        }
        if (current.length) blocks.push(current.join('\n'));
    }
    return blocks;
}

const tablistBlocks = htmlBlocks(css).filter((b) => b.includes('role="tablist"'));

const mounted: HTMLElement[] = [];
function mount(block: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = block;
    document.body.appendChild(host);
    mounted.push(host);
    return host;
}
afterEach(() => { while (mounted.length) mounted.pop()!.remove(); });

describe('the tabs recipe’s examples', () => {
    // A corpus that silently shrinks is the failure worth catching: the underline
    // and the segmented look are two blocks, and the Surfaces banner opens with a
    // third.
    it('are found at all', () => {
        expect(tablistBlocks.length).toBeGreaterThanOrEqual(2);
    });

    it('put exactly one tab stop in each list, on the selected tab', () => {
        for (const block of tablistBlocks) {
            const host = mount(block);
            const tabs = Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'));
            expect(tabs.length, block).toBeGreaterThan(1);

            const stops = tabs.filter((t) => t.tabIndex === 0);
            expect(stops.length, `one arrow-driven list, one tab stop:\n${block}`).toBe(1);
            expect(stops[0]!.getAttribute('aria-selected'), block).toBe('true');
            for (const tab of tabs) {
                expect(tab.getAttribute('tabindex'), block)
                    .toBe(tab.getAttribute('aria-selected') === 'true' ? '0' : '-1');
            }
        }
    });

    it('name a panel from every tab, and the panel names the tab back', () => {
        for (const block of tablistBlocks) {
            const host = mount(block);
            for (const tab of host.querySelectorAll<HTMLElement>('[role="tab"]')) {
                const controls = tab.getAttribute('aria-controls');
                expect(controls, `a tab that controls nothing:\n${block}`).toBeTruthy();
                const panel = host.querySelector(`#${controls}`);
                expect(panel?.getAttribute('role'), `${controls} is not a tabpanel:\n${block}`).toBe('tabpanel');
                expect(tab.id, `a tab that cannot be referenced back:\n${block}`).toBeTruthy();
                expect(panel?.getAttribute('aria-labelledby'), block).toBe(tab.id);
            }
        }
    });

    it('mint ids that stay unique when the page shows every example at once', () => {
        // The kit page renders the group banner and the family banner together, so
        // two examples sharing `id="tab-preview"` would be one duplicate-id defect.
        const ids = tablistBlocks.flatMap((block) =>
            Array.from(mount(block).querySelectorAll('[id]'), (el) => el.id));
        expect(new Set(ids).size, `duplicate ids across the examples: ${ids.join(', ')}`).toBe(ids.length);
    });
});
