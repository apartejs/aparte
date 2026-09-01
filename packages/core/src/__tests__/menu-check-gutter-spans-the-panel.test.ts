/**
 * The menu's check gutter is reserved for the whole panel, not per item (UI audit,
 * visual half — LOT 17).
 *
 * The gutter was an invisible `✓` drawn only on items carrying `aria-checked`, so in a
 * menu that mixes checkable and plain items the plain ones started 16px further left
 * than their checkable neighbours — two label edges in one panel, measured on the menu
 * and the surfaces previews. A panel that has any checkable item reserves the gutter on
 * every item.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const menu = readFileSync(resolve(process.cwd(), 'src/styles/surface/menu.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('the menu check gutter', () => {
    it('is reserved on every item of a panel that holds a checkable one', () => {
        expect(menu).toMatch(/\.aparte-menu:has\(\s*\.aparte-menu__item\[aria-checked\]\s*\)\s+\.aparte-menu__item::before\s*\{[^}]*content:/);
    });

    it('is no longer reserved per checkable item alone', () => {
        expect(menu).not.toMatch(/(?:^|\n)\s*\.aparte-menu__item\[aria-checked\]::before\s*\{/);
    });
});
