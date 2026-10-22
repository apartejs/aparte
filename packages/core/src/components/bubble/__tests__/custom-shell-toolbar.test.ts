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
});
