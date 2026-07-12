// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-status.js';
import { AparteConfig } from '../../../config/aparte-config.js';

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

describe('aparte-chat-status — custom renderStatus (charter §6)', () => {
    afterEach(() => AparteConfig.reset());

    it('replaces the inner markup with a renderer HTMLElement, element keeps show/hide', () => {
        AparteConfig.setStatusRenderer((text) => {
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
        AparteConfig.setStatusRenderer(() => '<div class="str-typing">…</div>');
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

        AparteConfig.setStatusRenderer((text) => `<div class="live-status">${text}</div>`);
        expect(el.querySelector('.live-status')).not.toBeNull();
        expect(el.querySelector('.aparte-dots')).toBeNull();
        // Shown state survives the re-render.
        expect(el.querySelector('.aparte-status-container')?.getAttribute('data-visible')).toBe('true');
        el.remove();
    });
});
