// @vitest-environment jsdom
/**
 * The icon provider reaches the glyphs core draws — all of them.
 *
 * `setIconProvider` is sold as THE lever for swapping the icon set, and six components
 * imported their glyph straight from `icons/glyphs.js` instead of asking for it. A
 * consumer who registered a provider got most of the library restyled and these left
 * behind: the conversation row's archive tray, its delete cross, the select's chevron,
 * the attachment thumbnail's remove button and the artifact card's download arrow.
 * `prevBranch`, `archive`, `unarchive` and `download` had no `getIcon` reader anywhere.
 *
 * These assert the lever, not the glyph: a provider is registered and the element must
 * draw what it returns. The declaration-level invariant that makes it stay true is that
 * `icons/glyphs.js` is now imported by exactly one file, `config/icon-provider.ts`.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import '../../primitives/select/aparte-select.js';
import '../../components/conversation-list/aparte-conversation-list.js';
import { aparteGlobalConfig } from '../index.js';

const MINE = '<svg data-mine="yes"></svg>';

beforeAll(async () => {
    await Promise.all([
        customElements.whenDefined('aparte-select'),
        customElements.whenDefined('aparte-conversation-list'),
    ]);
});

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('setIconProvider reaches every glyph core draws', () => {
    it('the select chevron', () => {
        aparteGlobalConfig.setIconProvider({ expand: () => MINE });
        const el = document.createElement('aparte-select');
        document.body.appendChild(el);
        expect(el.querySelector('.aparte-select-chevron')?.innerHTML).toContain('data-mine');
    });

    it('the conversation row\'s ⋯ button and the four glyphs of its menu', () => {
        const mine = (name: string) => () => `<svg data-mine="${name}"></svg>`;
        aparteGlobalConfig.setIconProvider({
            more: mine('more'), edit: mine('edit'), pin: mine('pin'), archive: mine('archive'), trash: mine('trash'),
        });
        const el = document.createElement('aparte-conversation-list') as HTMLElement & { conversations: unknown[] };
        document.body.appendChild(el);
        el.conversations = [{ id: 'c1', title: 'Hello' }];

        const more = el.querySelector<HTMLElement>('.aparte-conv-item__more')!;
        expect(more.innerHTML).toContain('data-mine="more"');
        more.click();
        const menu = el.querySelector('[role="menu"]')!;
        for (const name of ['edit', 'pin', 'archive', 'trash']) {
            expect(menu.innerHTML, name).toContain(`data-mine="${name}"`);
        }
    });

    it('the archived row asks for the OTHER tray', () => {
        aparteGlobalConfig.setIconProvider({ unarchive: () => '<svg data-up="yes"></svg>' });
        const el = document.createElement('aparte-conversation-list') as HTMLElement & { conversations: unknown[] };
        document.body.appendChild(el);
        el.conversations = [{ id: 'c1', title: 'Hello', archivedAt: Date.now() }];

        el.querySelector<HTMLElement>('.aparte-conv-item__more')!.click();
        expect(el.querySelector('[data-menu-action="archive"]')?.innerHTML).toContain('data-up');
    });
});
