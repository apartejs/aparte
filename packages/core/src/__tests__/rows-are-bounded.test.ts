/**
 * A row's two ends stay within reading distance (UI audit — LOT 25, with T18).
 *
 * A `margin-inline-start: auto` with no ceiling pushed the two ends of one line 554 to
 * 1180px apart at 1280: a tool's name and its state word (63px apart at 375, 596 at
 * 1280), "Reasoning" and its chevron (692px), the context gauge's bar stretched to
 * 1046×4px (a 261:1 ratio, 88 % of the toolbar), and the starter suggestions no longer
 * followed the composer once the host passed the composer's 800px cap.
 *
 * Decided (T18), by what the far element belongs to: the state and the chevron belong to
 * their LABEL, so they sit beside it; a gauge and a starter row belong to a COLUMN, so
 * they take its measure. The accordion recipe itself keeps its chevron at the end — that
 * is what an accordion is; the thinking block, a one-line disclosure, does not.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STYLES = resolve(process.cwd(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));
const rule = (css: string, selector: string) => {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (m[1]!.split(',').map((s) => s.trim()).includes(selector)) return m[2]!;
    }
    return '';
};

describe('rows with two ends', () => {
    it('the tool state sits beside the tool name', () => {
        expect(rule(read('segment/tool-call.css'), '.aparte-tool-state')).not.toMatch(/margin-inline-start:\s*auto/);
    });

    it('the reasoning block’s chevron sits beside its label', () => {
        expect(rule(read('segment/thinking.css'), '.aparte-thinking-header')).toMatch(/justify-content:\s*flex-start/);
    });

    it('the context gauge’s bar has a measure', () => {
        expect(rule(read('components/context.css'), '.aparte-context .aparte-progress')).toMatch(/max-inline-size:/);
    });

    it('the starter suggestions take the composer’s column', () => {
        const row = rule(read('components/suggestions.css'), '.aparte-suggestions');
        expect(row).toMatch(/max-inline-size:\s*var\(--aparte-message-max-width\)/);
        expect(row).toMatch(/margin-inline:\s*auto/);
    });
});
