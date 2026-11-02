// @vitest-environment jsdom
/**
 * `locale.direction` turns the transcript in both DOM modes.
 *
 * It was written on `.aparte-viewport-container`, which a framework-rendered viewport never
 * builds: under a right-to-left locale on a left-to-right page, a React, Vue, Svelte or
 * Angular chat turned its composer and left its messages, their bubbles and the action bar's
 * arrow keys left to right. Found by the RTL audit of 2026-11-02.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { aparteGlobalConfig, APARTE_DEFAULT_LOCALE } from '../../../config/index.js';

beforeEach(async () => {
    await import('../aparte-chat-viewport.js');
    await customElements.whenDefined('aparte-chat-viewport');
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.resetLocale();
});

const surfaceOf = (vp: HTMLElement): Element | null =>
    vp.hasAttribute('framework-managed') ? vp : vp.querySelector('.aparte-viewport-container');

describe('the transcript direction', () => {
    it('follows a right-to-left locale at render, in both DOM modes', () => {
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, direction: 'rtl' });
        const own = document.createElement('aparte-chat-viewport');
        document.body.appendChild(own);
        const managed = document.createElement('aparte-chat-viewport');
        managed.setAttribute('framework-managed', '');
        document.body.appendChild(managed);

        expect(surfaceOf(own)?.getAttribute('dir')).toBe('rtl');
        expect(surfaceOf(managed)?.getAttribute('dir')).toBe('rtl');
    });

    it('follows a switch on a framework-rendered viewport already on screen, and back', () => {
        const managed = document.createElement('aparte-chat-viewport');
        managed.setAttribute('framework-managed', '');
        document.body.appendChild(managed);
        expect(managed.hasAttribute('dir')).toBe(false);

        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, direction: 'rtl' });
        expect(managed.getAttribute('dir')).toBe('rtl');
        aparteGlobalConfig.resetLocale();
        expect(managed.hasAttribute('dir')).toBe(false);
    });
});
