/**
 * A hovered conversation row paints its own fill.
 *
 * The row wears `aparte-menu__item`, and the recipe's hover rule
 * (`.aparte-menu__item:hover:not(:disabled):not([aria-disabled='true'])`, 0-4-0) beat the
 * row's (`.aparte-conv-item:hover`, 0-2-0): the row took the menu recipe's fill, which is
 * the sidebar's own ground, so hovering showed nothing (cold audit, 2026-09-05). The row's
 * rule now carries the same weight and comes later in the cascade.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { coreRoot } from '../../../__tests__/read-stylesheet.js';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');
const conversation = strip(readFileSync(resolve(coreRoot(), 'src/styles/components/conversation.css'), 'utf8'));
const index = readFileSync(resolve(coreRoot(), 'src/index.ts'), 'utf8');

describe('the conversation row’s hover', () => {
    it('carries the menu recipe’s weight and comes after it in the cascade', () => {
        expect(conversation).toMatch(/\.aparte-conv-item:hover:not\(:disabled\):not\(\[aria-disabled='true'\]\)\s*\{[^}]*--aparte-conv-item-bg-hover/);
        const menuAt = index.indexOf("import './styles/surface/menu.css'");
        const rowsAt = index.indexOf("import './styles/components/conversation.css'");
        expect(menuAt).toBeGreaterThan(-1);
        expect(rowsAt).toBeGreaterThan(menuAt);
    });
});
