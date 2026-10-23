// @vitest-environment jsdom
/**
 * A custom bubble shell's action bar is a toolbar, named, like the default one.
 *
 * The shell contract lists class hooks, so a shell written from it carries no ARIA: the bar
 * got the roving tab stop (arrow keys between its buttons) and nothing telling a screen
 * reader it is a toolbar, or what it is for. The root already gets `article` the same way.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';

const SHELL = `<div class="aparte-message"><div class="aparte-message-content"><div class="aparte-segments"></div><div class="aparte-content"></div></div><div class="aparte-action-bar"></div></div>`;

function mount(): HTMLElement {
    const el = document.createElement('aparte-chat-bubble');
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'm1');
    document.body.appendChild(el);
    return el;
}

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('a custom shell action bar', () => {
    it('is a toolbar named from the locale', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => SHELL);
        const bar = mount().querySelector('.aparte-action-bar')!;
        expect(bar.getAttribute('role')).toBe('toolbar');
        expect(bar.getAttribute('aria-label')).toBe('Message actions');
    });

    it('keeps a role the shell declared itself', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => SHELL.replace('class="aparte-action-bar"', 'class="aparte-action-bar" role="group" aria-label="Tools"'));
        const bar = mount().querySelector('.aparte-action-bar')!;
        expect(bar.getAttribute('role')).toBe('group');
        expect(bar.getAttribute('aria-label')).toBe('Tools');
    });

    it('keeps the labels a shell wrote itself through a language switch', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => SHELL
            .replace('class="aparte-message"', 'class="aparte-message" role="article" aria-label="Note from Bot"')
            .replace('class="aparte-action-bar"', 'class="aparte-action-bar" role="group" aria-label="Tools"'));
        const el = mount();
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), messageActions: 'Actions du message', assistantResponse: 'Réponse' });
        expect(el.querySelector('.aparte-message')!.getAttribute('aria-label')).toBe('Note from Bot');
        expect(el.querySelector('.aparte-action-bar')!.getAttribute('aria-label')).toBe('Tools');
    });

    it('still relabels the names it wrote itself', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => SHELL);
        const el = mount();
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), messageActions: 'Actions du message', assistantResponse: 'Réponse' });
        expect(el.querySelector('.aparte-message')!.getAttribute('aria-label')).toBe('Réponse');
        expect(el.querySelector('.aparte-action-bar')!.getAttribute('aria-label')).toBe('Actions du message');
    });
});


/*
 * The branch arrows too: a shell's `.aparte-branch-prev` / `-next` are icon buttons, and the
 * contract asks no ARIA of their author. They were named at the first config change before
 * the bubble stopped relabelling what it had not written, and then never again.
 */
describe('a custom shell branch picker', () => {
    const PICKER = '<div class="aparte-branch-picker"><button type="button" class="aparte-branch-prev"></button><span class="aparte-branch-label"></span><button type="button" class="aparte-branch-next"></button></div>';
    const withPicker = SHELL.replace('<div class="aparte-action-bar">', `${PICKER}<div class="aparte-action-bar">`);

    it('names unnamed arrows from the locale, and follows a language switch', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => withPicker);
        const el = mount();
        expect(el.querySelector('.aparte-branch-prev')!.getAttribute('aria-label')).toBe('Previous response');
        expect(el.querySelector('.aparte-branch-next')!.getAttribute('aria-label')).toBe('Next response');
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), previousResponse: 'Réponse précédente', nextResponse: 'Réponse suivante' });
        expect(el.querySelector('.aparte-branch-prev')!.getAttribute('aria-label')).toBe('Réponse précédente');
    });

    it('keeps arrows the shell named itself', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => withPicker.replace('class="aparte-branch-prev"', 'class="aparte-branch-prev" aria-label="Back"'));
        const el = mount();
        aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), previousResponse: 'Réponse précédente' });
        expect(el.querySelector('.aparte-branch-prev')!.getAttribute('aria-label')).toBe('Back');
    });

    it('does not stamp a label over arrows named by their own words', () => {
        // An `aria-label` replaces the button's text as its name: a screen reader would say
        // "Previous response" over a visible "Précédent", and a voice command saying the
        // visible word would find nothing (WCAG 2.5.3).
        aparteGlobalConfig.setBubbleShellRenderer(() => withPicker
            .replace('class="aparte-branch-prev"></button>', 'class="aparte-branch-prev">Précédent</button>')
            .replace('class="aparte-branch-next"></button>', 'class="aparte-branch-next">Suivant</button>'));
        const el = mount();
        expect(el.querySelector('.aparte-branch-prev')!.hasAttribute('aria-label')).toBe(false);
        expect(el.querySelector('.aparte-branch-next')!.hasAttribute('aria-label')).toBe(false);
    });

    it('still names arrows whose only content is a glyph', () => {
        aparteGlobalConfig.setBubbleShellRenderer(() => withPicker
            .replace('class="aparte-branch-prev"></button>', 'class="aparte-branch-prev">‹</button>')
            .replace('class="aparte-branch-next"></button>', 'class="aparte-branch-next">›</button>'));
        const el = mount();
        expect(el.querySelector('.aparte-branch-prev')!.getAttribute('aria-label')).toBe('Previous response');
        expect(el.querySelector('.aparte-branch-next')!.getAttribute('aria-label')).toBe('Next response');
    });
});
