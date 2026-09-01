/**
 * The segmented tab track is as wide as its chips, and the panel lines up with the tab
 * that opened it (UI audit, visual half — LOT 19).
 *
 * `.aparte-tabs` is a block-level flex row, so `--segmented` inherited its container's
 * width: 1207px of track for 160px of chips at 1280 (87 % empty), 695 at 768, 337 at
 * 375. A segmented control is a control, not a bar; it hugs its segments. The panel
 * declared a block padding and no inline one while the tab has `padding-inline:
 * --aparte-space-5`, so the panel's text hung 11px left of the tab above it. And the
 * selected chip was an absolute surface level — raised in light, sunken in dark, the
 * same rule inverting its elevation with the theme; a 1px ring in the border colour
 * reads as raised on both grounds.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles/surface/tabs.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const rule = (selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('the tabs recipe', () => {
    it('the segmented track hugs its chips', () => {
        const segmented = rule('.aparte-tabs--segmented');
        expect(segmented).toMatch(/display:\s*inline-flex|width:\s*max-content/);
    });

    it('the panel shares the tab’s inline inset', () => {
        expect(rule('.aparte-tabs__panel')).toMatch(/padding-inline:\s*var\(--aparte-space-5\)/);
    });

    it('the selected chip is raised relative to its track, on both grounds', () => {
        expect(rule(".aparte-tabs--segmented .aparte-tabs__tab[aria-selected='true']")).toMatch(/box-shadow:/);
    });
});
