/**
 * A collapsed sidebar can be opened again, at every width.
 *
 * On the chat site at 1440px: collapse the sidebar with its own toggle and it goes to
 * 0px, `inert`, `aria-hidden` — its toggle with it — while the header's toggle is
 * `display: none` outside the phone media query. Nothing on the page reopened it
 * (Paul, 2026-09-05). The sidebar keeps `aria-expanded` on every
 * `[data-aparte-sidebar-toggle]`, so the recipe can show the header's control exactly
 * when the sidebar is closed: `.aparte-app-header__toggle[aria-expanded="false"]`,
 * outside any media query.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from '../../../__tests__/read-stylesheet.js';

const sheet = readFileSync(resolve(coreRoot(), 'src/styles/shell/app-header.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
/** The sheet with every @media block removed — what applies at any width. */
const anyWidth = sheet.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');

describe('the application header toggle', () => {
    it('shows, at any width, while the sidebar it drives is collapsed', () => {
        const m = /\.aparte-app-header__toggle\[aria-expanded="false"\]\s*\{([^}]*)\}/.exec(anyWidth);
        expect(m, 'a rule on the collapsed state outside any media query').not.toBeNull();
        expect(m![1]).toMatch(/display:\s*inline-flex/);
    });
});
