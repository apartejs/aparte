import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttr } from '../escape.js';

describe('escapeHtml', () => {
    it('escapes all five characters that can break out of text or an attribute', () => {
        expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#039;');
    });

    it('closes the attribute breakout that used to work', () => {
        const payload = 'user" onmouseover="alert(1)';
        const html = `<div data-role="${escapeHtml(payload)}">`;
        expect(html).not.toContain('onmouseover="');
        const el = document.createElement('div');
        el.innerHTML = html;
        expect(el.firstElementChild?.getAttribute('onmouseover')).toBeNull();
    });

    it('closes a single-quoted attribute breakout too — the gap in the weakest old copy', () => {
        // `aparte-chat`'s local copy escaped only & " < , so ' and > went through.
        const payload = "x' onmouseover='alert(1)";
        const el = document.createElement('div');
        el.innerHTML = `<div title='${escapeHtml(payload)}'>`;
        expect(el.firstElementChild?.getAttribute('onmouseover')).toBeNull();
    });

    it('leaves ordinary text alone', () => {
        expect(escapeHtml('Hello, world — 42% ok')).toBe('Hello, world — 42% ok');
    });

    it('escapeAttr is the same function, not a second body', () => {
        expect(escapeAttr).toBe(escapeHtml);
    });
});
