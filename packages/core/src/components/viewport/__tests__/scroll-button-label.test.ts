// @vitest-environment jsdom
/**
 * The scroll-to-bottom button's accessible name follows the locale.
 *
 * It was the string `'Scroll to bottom'` at both sites that build the button — the
 * one piece of chrome a screen-reader user in another language always met in
 * English, on a viewport whose direction and every other label already switched
 * live. Same class as the undeclared-key trio (`submitButton`, `stopButton`,
 * `actionUpload`): the component looked finished, the locale looked complete, and
 * only a cross-reference of what core READS against what the locale DECLARES sees it.
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

describe('the scroll button label', () => {
    it('reads the locale at render, in both DOM modes', () => {
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, scrollToBottom: 'Tout en bas' });

        const vp = document.createElement('aparte-chat-viewport');
        document.body.appendChild(vp);
        expect(vp.querySelector('.aparte-scroll-btn')?.getAttribute('aria-label')).toBe('Tout en bas');

        const managed = document.createElement('aparte-chat-viewport');
        managed.setAttribute('framework-managed', '');
        document.body.appendChild(managed);
        expect(managed.querySelector('.aparte-scroll-btn')?.getAttribute('aria-label')).toBe('Tout en bas');
    });

    it('follows a language switch on a viewport already on screen', () => {
        const vp = document.createElement('aparte-chat-viewport');
        document.body.appendChild(vp);
        expect(vp.querySelector('.aparte-scroll-btn')?.getAttribute('aria-label')).toBe('Scroll to bottom');

        // `setLocale` notifies, and the viewport listens — the same path that flips `dir`.
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, scrollToBottom: 'Aller en bas' });
        expect(vp.querySelector('.aparte-scroll-btn')?.getAttribute('aria-label')).toBe('Aller en bas');
    });
});
