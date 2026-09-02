/**
 * At a phone's width, the kit folds (UI audit — LOT 32).
 *
 * The kit had no story for 375px and its defaults were larger than a phone: the app
 * shell kept 259 of its 303px for the sidebar and left the chat a 43px band with a send
 * button cut in half; `--aparte-split-min: 20rem` (320px) was wider than the viewport, so
 * the primary pane took everything and the end pane was annihilated to 0; the modal
 * dialog became a 375×720 sheet holding a label, an input and two buttons — 586px of
 * empty surface — glued to the physical edges with no safe-area inset.
 *
 * Decided: the shell folds by default under its own breakpoint (the same 48rem the
 * sidebar element uses to become a drawer), so the class recipe teaches the same screen
 * the element renders; the split's minimum is `min(20rem, 100%)`; a phone's modal sheet
 * is as tall as its content, capped at the viewport, and clears the safe areas.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const read = (rel: string) => strip(readFileSync(resolve(STYLES, rel), 'utf8'));

describe('the app shell', () => {
    it('folds to one column under 48rem, the sidebar element leaving the grid as a drawer', () => {
        const shell = read('shell/app-shell.css');
        const fold = shell.match(/@media \(max-width: 48rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
        expect(fold, 'the class recipe carries the same media query as the sidebar element').not.toBe('');
        expect(fold).toMatch(/\.aparte-app-shell\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
        expect(fold).toMatch(/grid-column:\s*1/);
    });
});

describe('the split', () => {
    it('cannot ask for more than the viewport has', () => {
        expect(read('theme.css')).toMatch(/--aparte-split-min:\s*min\(20rem,\s*100%\)/);
    });
});

describe('the modal dialog on a phone', () => {
    const dialog = read('surface/dialog.css');
    const phone = dialog.match(/@media \(max-width: 30rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    it('is as tall as its content, capped at the viewport', () => {
        expect(phone).not.toMatch(/(?:^|[^-])height:\s*(?:100dvh|auto)/);
        // `height: auto` is not "as tall as its content" here: a positioned box with both
        // block insets set and an auto height FILLS them (CSS 2 §10.6.4, the auto margins
        // go to 0) — the sheet measured 720 tall with a label, a field and two buttons in
        // it. `fit-content` is what the UA gives a dialog, and what keeps the sheet its own
        // size while `margin-block-start: auto` pushes it onto the bottom edge.
        expect(phone).toMatch(/(?:^|[^-])height:\s*fit-content/);
        expect(phone).toMatch(/max-height:\s*100dvh/);
    });

    it('clears the safe areas', () => {
        expect(phone).toMatch(/env\(safe-area-inset-(?:top|bottom)/);
    });
});
