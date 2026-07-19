import { describe, it, expect } from 'vitest';
import { cssEscape } from '../css-escape.js';

describe('cssEscape', () => {
    it('stops a hostile id from mis-targeting a decoy via selector-list injection', () => {
        document.body.innerHTML = '';
        const decoy = document.createElement('div');
        decoy.setAttribute('data-id', 'y');
        document.body.appendChild(decoy);
        // Unescaped, `x"] , [data-id="y` closes the attr and forms a selector LIST
        // whose second clause `[data-id="y"]` would hit the decoy. Escaped, it stays
        // a single attribute selector and cannot reach the decoy.
        const found = document.querySelectorAll(`[data-id="${cssEscape('x"] , [data-id="y')}"]`);
        expect(Array.from(found)).not.toContain(decoy);
    });

    it('still matches a normal id through the escape', () => {
        document.body.innerHTML = '';
        const el = document.createElement('div');
        el.setAttribute('data-id', 'seg-123');
        document.body.appendChild(el);
        expect(document.querySelector(`[data-id="${cssEscape('seg-123')}"]`)).toBe(el);
    });

    it('leaves a plain UUID unchanged (the default-flow id shape)', () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000';
        expect(cssEscape(uuid)).toBe(uuid);
    });
});
