/**
 * The four floating surfaces have a radius knob of their own (UI audit LOT 9).
 *
 * Every other family names its corner — `--aparte-radius-bubble`, `-input`, `-select`,
 * `-avatar`, `-code`… — and a theme rounds or squares it from `:root`. The menu, the
 * popover, the dialog and the tooltip read a step of the scale directly
 * (`--aparte-radius-lg`, `-xl`, `-sm`), so a theme that wanted square menus and
 * round bubbles had to override the SCALE step, which moved every other reader of
 * that step with it. Same shape as the field-radius bug in LOT 1: the knob has to
 * exist, and it has to live in theme.css.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from './read-stylesheet.js';

const STYLES = resolve(coreRoot(), 'src/styles');
const read = (rel: string) => readFileSync(resolve(STYLES, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
const theme = read('theme.css');

const SURFACES: Array<[knob: string, sheet: string, step: string]> = [
    ['--aparte-radius-menu', 'surface/menu.css', '--aparte-radius-lg'],
    ['--aparte-radius-popover', 'surface/popover.css', '--aparte-radius-lg'],
    ['--aparte-radius-dialog', 'surface/dialog.css', '--aparte-radius-xl'],
    ['--aparte-radius-tooltip', 'surface/tooltip.css', '--aparte-radius-sm'],
];

describe('menu, popover, dialog and tooltip each have a radius knob', () => {
    it.each(SURFACES)('%s is declared in theme.css from the scale step it replaces', (knob, _sheet, step) => {
        expect(theme).toMatch(new RegExp(`^\\s*${knob}\\s*:\\s*var\\(${step}\\)\\s*;`, 'm'));
    });

    it.each(SURFACES)('%s is what %s reads for its corner', (knob, sheet) => {
        expect(read(sheet)).toMatch(new RegExp(`border-radius:\\s*var\\(${knob}\\)`));
    });
});
