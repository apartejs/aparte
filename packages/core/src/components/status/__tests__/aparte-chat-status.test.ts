// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-status.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

describe('aparte-chat-status — attribute injection', () => {
    it('does not let the public `text` attribute break out into arbitrary attributes', () => {
        const el = document.createElement('aparte-chat-status');
        // A double-quote in the attribute used to break out of aria-label="${text}".
        el.setAttribute('text', '" onmouseover="alert(1)');
        document.body.appendChild(el);

        const container = el.querySelector('.aparte-status-container') as HTMLElement | null;
        expect(container).not.toBeNull();
        // No injected event-handler attribute…
        expect(container!.getAttribute('onmouseover')).toBeNull();
        // …and the label carries the literal text verbatim.
        expect(container!.getAttribute('aria-label')).toBe('" onmouseover="alert(1)');

        el.remove();
    });

    it('renders a plain label safely', () => {
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('text', 'Assistant is thinking…');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-status-container')!.getAttribute('aria-label')).toBe('Assistant is thinking…');
        el.remove();
    });
});

describe('aparte-chat-status — visible custom text', () => {
    it('renders the custom text visually when the attribute is set before mount', () => {
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('text', 'Recherche en cours…');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('Recherche en cours…');
        el.remove();
    });

    it('updates the visible text AND the aria-label when the attribute changes after mount', () => {
        const el = document.createElement('aparte-chat-status');
        document.body.appendChild(el);
        el.setAttribute('text', 'Génération du fichier…');
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('Génération du fichier…');
        expect(el.querySelector('.aparte-status-container')!.getAttribute('aria-label')).toBe('Génération du fichier…');
        el.remove();
    });

    it('stays dots-only by default (no text attribute → empty visible text, aria fallback)', () => {
        const el = document.createElement('aparte-chat-status');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('');
        expect(el.querySelector('.aparte-status-container')!.getAttribute('aria-label')).toBe('Typing');
        el.remove();
    });

    it('removing the attribute restores the dots-only default', () => {
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('text', 'Un instant…');
        document.body.appendChild(el);
        el.removeAttribute('text');
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('');
        expect(el.querySelector('.aparte-status-container')!.getAttribute('aria-label')).toBe('Typing');
        el.remove();
    });
});

/*
 * The container is `role="status" aria-live="polite"`, and a live region announces its
 * CONTENT when that content changes. In the dots-only default the whole subtree was one
 * `aria-hidden` dot and an empty span, so the region's text was the empty string: the
 * state rode on `aria-label`, which a live region does not announce on its own — the
 * label names the region, it is not the news. A sighted reader saw the dots pulse and a
 * screen-reader user was told nothing at all.
 *
 * So exactly one of the two nodes carries the word at any time: the visible span when
 * `text` is set (the label is already the same string — a second copy would be read
 * twice), the screen-reader span when it is not.
 *
 * And the word arrives WITH the element. `aparte-chat-status:not([visible])` is
 * `display: none`, and all four wrappers mount the element once and flip the attribute,
 * so a word written at render time is already sitting in the region when it is revealed
 * — the reveal-from-hidden path, which is the one assistive tech is documented not to
 * announce reliably, and on the second turn there is not even a reveal-time difference
 * to notice. Writing on show and clearing on hide makes every turn a real mutation of an
 * already-exposed region, which is the path that announces.
 */
describe('aparte-chat-status — the live region has something to announce', () => {
    it('puts the fallback word in the region when the line is dots-only', () => {
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('visible', '');
        document.body.appendChild(el);
        const container = el.querySelector('.aparte-status-container') as HTMLElement;
        expect(container.getAttribute('aria-live')).toBe('polite');
        expect(container.textContent!.trim()).not.toBe('');
        expect(el.querySelector('.aparte-status-sr')!.textContent).toBe('Typing');
        // The documented dots-only LOOK is untouched: nothing visible was added.
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('');
        el.remove();
    });

    it('says the line once when `text` is set, not twice', () => {
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('visible', '');
        el.setAttribute('text', 'Searching the docs…');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('Searching the docs…');
        expect(el.querySelector('.aparte-status-sr')!.textContent).toBe('');
        el.remove();
    });

    it('hands the word back and forth as the attribute comes and goes', () => {
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('visible', '');
        document.body.appendChild(el);
        el.setAttribute('text', 'Uploading…');
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('Uploading…');
        expect(el.querySelector('.aparte-status-sr')!.textContent).toBe('');
        el.removeAttribute('text');
        expect(el.querySelector('.aparte-status-text')!.textContent).toBe('');
        expect(el.querySelector('.aparte-status-sr')!.textContent).toBe('Typing');
        el.remove();
    });

    it('holds nothing until the element is shown, and the word again on every show', () => {
        const el = document.createElement('aparte-chat-status');
        document.body.appendChild(el);
        const sr = el.querySelector('.aparte-status-sr')!;
        // Mounted hidden: an unexposed region with the word already in it is a region
        // whose reveal announces nothing.
        expect(sr.textContent).toBe('');
        el.setAttribute('visible', '');
        expect(sr.textContent).toBe('Typing');
        // Cleared on hide, so the NEXT turn is a change and not the same string again.
        el.removeAttribute('visible');
        expect(sr.textContent).toBe('');
        el.setAttribute('visible', '');
        expect(sr.textContent).toBe('Typing');
        el.remove();
    });
});

describe('aparte-chat-status — custom renderStatus (charter §6)', () => {
    afterEach(() => aparteGlobalConfig.reset());

    it('replaces the inner markup with a renderer HTMLElement, element keeps show/hide', () => {
        aparteGlobalConfig.setStatusRenderer((text) => {
            const el = document.createElement('span');
            el.className = 'my-typing';
            el.textContent = text;
            return el;
        });
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('text', 'Réfléchit…');
        el.setAttribute('visible', '');
        document.body.appendChild(el);

        const container = el.querySelector('.aparte-status-container') as HTMLElement;
        expect(container).not.toBeNull();
        expect(container.getAttribute('data-visible')).toBe('true');
        // custom content is in, default dots are gone, accessible name preserved.
        const custom = container.querySelector('.my-typing');
        expect(custom).not.toBeNull();
        expect(custom!.textContent).toBe('Réfléchit…');
        expect(container.querySelector('.aparte-dots')).toBeNull();
        expect(container.getAttribute('aria-label')).toBe('Réfléchit…');

        // show/hide is still owned by the element, not the renderer.
        (el as unknown as { hide(): void }).hide();
        expect(container.getAttribute('data-visible')).toBe('false');
        el.remove();
    });

    it('accepts an HTML string from the renderer', () => {
        aparteGlobalConfig.setStatusRenderer(() => '<div class="str-typing">…</div>');
        const el = document.createElement('aparte-chat-status');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-status-container .str-typing')).not.toBeNull();
        el.remove();
    });

    it('re-renders an already-mounted status when setStatusRenderer is set live', () => {
        // The element self-registers on import, so a persistent <aparte-chat-status>
        // mounts (default dots) before any config runs; setting the renderer later
        // must still apply, via the config-change subscription.
        const el = document.createElement('aparte-chat-status');
        el.setAttribute('visible', '');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-dots')).not.toBeNull();

        aparteGlobalConfig.setStatusRenderer((text) => `<div class="live-status">${text}</div>`);
        expect(el.querySelector('.live-status')).not.toBeNull();
        expect(el.querySelector('.aparte-dots')).toBeNull();
        // Shown state survives the re-render.
        expect(el.querySelector('.aparte-status-container')?.getAttribute('data-visible')).toBe('true');
        el.remove();
    });
});
