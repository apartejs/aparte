// @vitest-environment jsdom
/**
 * The list is a navigation landmark, and a landmark needs a name as soon as a page has a
 * second one (axe landmark-unique): a sidebar beside the site's own nav was two unnamed
 * navigations. The locale names it; a name the app gave it wins.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-conversation-list.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { APARTE_DEFAULT_LOCALE } from '../../../config/locale.js';

async function mount(attrs: Record<string, string> = {}): Promise<HTMLElement> {
    const el = document.createElement('aparte-conversation-list');
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    await vi.waitFor(() => expect(el.getAttribute('role')).toBe('navigation'));
    return el;
}

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.setLocale(APARTE_DEFAULT_LOCALE);
});

describe('aparte-conversation-list — its name', () => {
    it("takes the locale's name", async () => {
        const el = await mount();
        expect(el.getAttribute('aria-label')).toBe('Conversations');
    });

    it('follows a locale change', async () => {
        const el = await mount();
        aparteGlobalConfig.setLocale({ ...APARTE_DEFAULT_LOCALE, conversationList: 'Historique' });
        await vi.waitFor(() => expect(el.getAttribute('aria-label')).toBe('Historique'));
    });

    it('keeps a name the app gave it', async () => {
        const labelled = await mount({ 'aria-label': 'Past chats' });
        expect(labelled.getAttribute('aria-label')).toBe('Past chats');
        const byRef = await mount({ 'aria-labelledby': 'heading' });
        expect(byRef.hasAttribute('aria-label')).toBe(false);
    });
});
