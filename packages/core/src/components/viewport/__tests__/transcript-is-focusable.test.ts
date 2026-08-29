// @vitest-environment jsdom
/**
 * The transcript is a tab stop, and it has a name.
 *
 * WebKit does not give an unfocusable overflow box a keyboard scroll of its own the
 * way Chromium and Firefox do. So on Safari a plain-text transcript — no links, no
 * code blocks, nothing focusable inside — could not be read past the first screen with
 * a keyboard, and there was nothing on screen to say why.
 *
 * jsdom cannot see any of that: it lays nothing out and has no scrolling engine. What
 * it CAN prove is the half the browser behaviour rests on — that both DOM modes put
 * `tabindex` and an accessible name on the surface that scrolls, and that the name is
 * locale text like every other string core renders. The engine half is
 * `e2e/tests/transcript-keyboard.spec.ts`, on the webkit project, which is the only
 * place the original defect is visible at all.
 *
 * The framework mode is in here for a reason of its own: it LOOKED fine in a browser
 * probe, and only because the scroll-to-bottom button is a child of the host and stays
 * tabbable while it is visually hidden. A tab stop that exists because a hidden button
 * happens to sit inside the scroller is a coincidence, not an affordance — the button
 * is one `hidden` attribute away from taking the transcript's keyboard access with it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-viewport.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { APARTE_DEFAULT_LOCALE } from '../../../config/locale.js';

function mount(frameworkManaged = false): HTMLElement {
    const el = document.createElement('aparte-chat-viewport');
    if (frameworkManaged) el.setAttribute('framework-managed', '');
    document.body.appendChild(el);
    return el;
}

/** The node that actually scrolls, per mode. */
const surface = (el: HTMLElement): HTMLElement =>
    (el.querySelector<HTMLElement>('.aparte-viewport-container') ?? el);

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.resetLocale();
});

describe('the transcript is focusable — the default mode', () => {
    it('puts the tab stop on the scroll container, not on the host', () => {
        const el = mount();
        const container = el.querySelector<HTMLElement>('.aparte-viewport-container')!;
        expect(container.getAttribute('tabindex')).toBe('0');
        expect(container.tabIndex).toBe(0);
        // The host is not the scroller here; a second tab stop would be one too many.
        expect(el.hasAttribute('tabindex')).toBe(false);
    });

    it('names it, since a focusable region with no name is announced as a group', () => {
        const container = surface(mount());
        expect(container.getAttribute('aria-label')).toBe('Transcript');
        // The name sits beside the role that was already there.
        expect(container.getAttribute('role')).toBe('log');
    });
});

describe('the transcript is focusable — framework-managed mode', () => {
    it('puts both on the host, which is the scroll surface there', () => {
        const el = mount(true);
        expect(el.querySelector('.aparte-viewport-container')).toBeNull();
        expect(el.getAttribute('tabindex')).toBe('0');
        expect(el.getAttribute('aria-label')).toBe('Transcript');
    });

    it('declares the role the name needs — a bare custom element has none', () => {
        // `aria-label` on an element whose role resolves to generic/none is
        // `aria-prohibited-attr` (serious, in the axe run the react project gates on):
        // the mirror image of the unnamed-region defect the tab stop was added for.
        const el = mount(true);
        expect(el.getAttribute('role')).toBe('log');
    });

    it('does not depend on the scroll button for its tab stop', () => {
        const el = mount(true);
        const button = el.querySelector<HTMLElement>('.aparte-scroll-btn')!;
        button.remove();
        expect(el.getAttribute('tabindex')).toBe('0');
    });
});

describe('the transcript name is locale text', () => {
    it('takes the name from the locale at build time', () => {
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, transcript: 'Transcription' });
        expect(surface(mount()).getAttribute('aria-label')).toBe('Transcription');
    });

    it('follows a live language switch, in both modes', () => {
        const core = mount();
        const framework = mount(true);
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, transcript: 'Transcription' });
        expect(surface(core).getAttribute('aria-label')).toBe('Transcription');
        expect(framework.getAttribute('aria-label')).toBe('Transcription');
    });
});
