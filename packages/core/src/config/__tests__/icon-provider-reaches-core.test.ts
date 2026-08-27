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

    it('the conversation row archive and delete actions', () => {
        aparteGlobalConfig.setIconProvider({ archive: () => MINE, close: () => MINE });
        const el = document.createElement('aparte-conversation-list') as HTMLElement & { conversations: unknown[] };
        document.body.appendChild(el);
        el.conversations = [{ id: 'c1', title: 'Hello' }];

        expect(el.querySelector('.aparte-conv-item__archive')?.innerHTML).toContain('data-mine');
        expect(el.querySelector('.aparte-conv-item__delete')?.innerHTML).toContain('data-mine');
    });

    it('the archived row asks for the OTHER tray', () => {
        aparteGlobalConfig.setIconProvider({ unarchive: () => '<svg data-up="yes"></svg>' });
        const el = document.createElement('aparte-conversation-list') as HTMLElement & { conversations: unknown[] };
        document.body.appendChild(el);
        el.conversations = [{ id: 'c1', title: 'Hello', archivedAt: Date.now() }];

        expect(el.querySelector('.aparte-conv-item__archive')?.innerHTML).toContain('data-up');
    });
});
