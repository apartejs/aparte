// @vitest-environment jsdom
/**
 * A config change reaches the composer's controls.
 *
 * The docs say "a locale switch is live: mounted components re-render immediately",
 * and for the composer that was false: all four controls render once behind an
 * early-return guard (`if (this.querySelector('.aparte-composer-send__button')) return;` and
 * its siblings), so an icon set or a language chosen after the first render never
 * reached them. Twenty-one files read a config-derived value at render time and
 * sixteen never re-read it; these are five of them.
 *
 * Most of what they read is INVISIBLE — accessible names and tooltips — which is
 * why the gap survived: nothing on screen was ever in the wrong language. Only the
 * input's placeholder is visible. So these assertions read attributes on purpose.
 *
 * The refreshes are targeted, never a re-render, and one test per control pins the
 * reason: `_render()` returns early, and its own disabled/hidden/mode computation
 * ignores state that lives on the composer root — so rebuilding would silently
 * re-enable a button mid-turn, un-hide a stop button, or drop out of answer mode.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../aparte-composer-send.js';
import '../aparte-composer-cancel.js';
import '../aparte-composer-action.js';
import '../aparte-composer-add-attachment.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteComposer } from '../aparte-composer.js';

/** A composer with one control inside it, the way the shell composes them. */
function mount(tag: string, attrs: Record<string, string> = {}) {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    document.body.appendChild(composer);
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    composer.appendChild(el);
    return { composer, el };
}

const FR = () => ({
    ...aparteGlobalConfig.getLocale(),
    sendButton: 'Envoyer',
    stopButton: 'Arrêter',
    actionUpload: 'Joindre un fichier',
    inputPlaceholder: 'Écrivez un message…',
});

const MARK = '<svg data-mine="1"></svg>';

/**
 * Put the composer into streaming mode the way the client does.
 *
 * `composer.streaming` is a getter with no setter: the state arrives through the
 * `aparte-message-start` lifecycle event on `window`. Faking the field would have
 * tested a path no chat ever takes.
 */
const startStreaming = () =>
    window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: {} }));

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('a locale change reaches the composer', () => {
    it('the input placeholder — the one string a sighted user can read', () => {
        const { el } = mount('aparte-composer-input');
        const editor = el.querySelector('.aparte-composer-input__editor')!;
        const before = editor.getAttribute('data-placeholder');

        aparteGlobalConfig.setLocale(FR());

        expect(editor.getAttribute('data-placeholder')).toBe('Écrivez un message…');
        expect(editor.getAttribute('data-placeholder')).not.toBe(before);
        // The accessible name tracks it too — they are set together and drifted
        // together before this.
        expect(editor.getAttribute('aria-label')).toBe('Écrivez un message…');
    });

    it('the send button’s accessible name and tooltip', () => {
        const { el } = mount('aparte-composer-send');
        const button = el.querySelector('button')!;

        aparteGlobalConfig.setLocale(FR());

        expect(button.getAttribute('aria-label')).toBe('Envoyer');
        expect(button.getAttribute('title')).toBe('Envoyer');
    });

    it('the attach button’s accessible name and tooltip', () => {
        const { el } = mount('aparte-composer-add-attachment');
        const button = el.querySelector('button')!;

        aparteGlobalConfig.setLocale(FR());

        expect(button.getAttribute('aria-label')).toBe('Joindre un fichier');
        expect(button.getAttribute('title')).toBe('Joindre un fichier');
    });

    it('the stop button — whose key was never even declared until now', () => {
        const { el } = mount('aparte-composer-cancel');
        const button = el.querySelector('button')!;

        aparteGlobalConfig.setLocale(FR());

        expect(button.getAttribute('aria-label')).toBe('Arrêter');
        // And the refresh does NOT un-hide it: `hidden` belongs to the root's
        // streaming state, and a rebuild would have made it appear mid-conversation.
        expect(button.hasAttribute('hidden')).toBe(true);
    });
});

describe('an icon-provider change reaches the composer', () => {
    it('replaces the send glyph', () => {
        const { el } = mount('aparte-composer-send');
        const button = el.querySelector('button')!;
        expect(button.innerHTML).not.toContain('data-mine');

        aparteGlobalConfig.setIconProvider({ send: () => MARK });

        expect(button.innerHTML).toContain('data-mine');
    });

    it('replaces the paperclip', () => {
        const { el } = mount('aparte-composer-add-attachment');
        const button = el.querySelector('button')!;

        aparteGlobalConfig.setIconProvider({ paperclip: () => MARK });

        expect(button.innerHTML).toContain('data-mine');
    });

    it('replaces a named action icon, and leaves the consumer’s label alone', () => {
        // This control's label is the app's `label` ATTRIBUTE, so a locale change is
        // correctly a no-op here — only the icon is core's to change.
        const { el } = mount('aparte-composer-action', { icon: 'copy', label: 'Ma commande' });
        const button = el.querySelector('button')!;

        aparteGlobalConfig.setIconProvider({ copy: () => MARK });

        expect(button.innerHTML).toContain('data-mine');
        expect(button.getAttribute('aria-label')).toBe('Ma commande');
    });

    // Note: this one passes even with the refresh disabled — it asserts an ABSENCE
    // of change. It earns its place next to the test above, not on its own: that one
    // fails without the wiring, so together they say "the provider reaches a named
    // key and does not reach raw markup".
    it('leaves raw markup passed as an icon attribute untouched', () => {
        const { el } = mount('aparte-composer-action', { icon: '<b data-raw="1">!</b>', label: 'x' });
        const button = el.querySelector('button')!;

        aparteGlobalConfig.setIconProvider({ copy: () => MARK });

        expect(button.innerHTML).toContain('data-raw');
        expect(button.innerHTML).not.toContain('data-mine');
    });
});

describe('the send button keeps the meaning it currently has', () => {
    it('stays the stop button through a config change while streaming', () => {
        const { el } = mount('aparte-composer-send');
        const button = el.querySelector('button')!;
        startStreaming();
        expect(button.classList.contains('aparte-is-streaming')).toBe(true);

        aparteGlobalConfig.setIconProvider({ send: () => MARK, stop: () => '<svg data-stop="1"></svg>' });

        // The whole reason this refresh dispatches on the live mode: a rebuild would
        // have put the send glyph back while a reply was still streaming.
        expect(button.innerHTML).toContain('data-stop');
        expect(button.innerHTML).not.toContain('data-mine');
        expect(button.classList.contains('aparte-is-streaming')).toBe(true);
    });

    it('localizes the streaming label, which used to be a bare literal', () => {
        const { el } = mount('aparte-composer-send');
        const button = el.querySelector('button')!;
        startStreaming();

        aparteGlobalConfig.setLocale(FR());

        expect(button.getAttribute('aria-label')).toBe('Arrêter');
    });
});
