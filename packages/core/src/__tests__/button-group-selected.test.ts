// @vitest-environment jsdom
/**
 * #53 — a selected segment of a button group reads as selected AT REST.
 *
 * Measured on a `Chat | Aperçu` group (outline fill, dark theme): the toggled rule
 * painted `--aparte-btn-bg-toggled` (surface-2), which on dark is a hair away from
 * surface-1 — so a pressed outline segment showed as an outline with nothing in it,
 * and the HOVER (a 22 % wash of the intent) was stronger than the selected state.
 * Selection read only under the pointer. The rules below say what "selected" is: at
 * least as strong as hover on every fill, and in a group, solid in the group's intent.
 */
import { describe, it, expect } from 'vitest';
import { readAparteStylesheet } from './read-stylesheet.js';

const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector: RegExp): string => css.match(new RegExp(selector.source + String.raw`\s*\{([^}]*)\}`, selector.flags))?.[1] ?? '';

describe('#53 — the selected segment of a button group', () => {
    it('is solid in the group\'s intent — pressed, selected (a tab) or current', () => {
        const body = rule(/\.aparte-btn-group > \.aparte-btn\[aria-pressed='true'\],\s*\.aparte-btn-group > \.aparte-btn\[aria-selected='true'\],\s*\.aparte-btn-group > \.aparte-btn\[aria-current\]/);
        expect(body, 'the group has a selected state of its own').not.toBe('');
        expect(body).toMatch(/background:\s*var\(--aparte-btn-intent\)/);
        expect(body).toMatch(/border-color:\s*var\(--aparte-btn-intent\)/);
        expect(body).toMatch(/color:\s*var\(--aparte-btn-on-intent\)/);
    });

    it('stays solid under the pointer — hover must not be the state that reveals it', () => {
        const body = rule(/\.aparte-btn-group > \.aparte-btn\[aria-pressed='true'\]:hover:not\(:disabled\),\s*\.aparte-btn-group > \.aparte-btn\[aria-selected='true'\]:hover:not\(:disabled\),\s*\.aparte-btn-group > \.aparte-btn\[aria-current\]:hover:not\(:disabled\)/);
        expect(body).toMatch(/background:\s*var\(--aparte-btn-intent\)/);
    });

    it('outside a group, a toggled outline or soft button is washed deeper than its hover (30 % against 22 %)', () => {
        const body = rule(/\.aparte-btn--outline\[aria-pressed='true'\],\s*\.aparte-btn--soft\[aria-pressed='true'\],\s*\.aparte-btn--outline\[aria-selected='true'\],\s*\.aparte-btn--soft\[aria-selected='true'\]/);
        expect(body).toMatch(/color-mix\(in srgb, var\(--aparte-btn-intent\) 30%, transparent\)/);
    });

    it('the generic toggled rule also answers aria-selected, so a tablist needs no extra class', () => {
        const body = rule(/\.aparte-btn\[aria-expanded='true'\],\s*\.aparte-btn\[aria-pressed='true'\],\s*\.aparte-btn\[aria-selected='true'\]/);
        expect(body).toMatch(/background:\s*var\(--aparte-btn-bg-toggled\)/);
    });
});
