// @vitest-environment jsdom
/**
 * `registerIcons` adds to the icon set, and a name core does not draw is reachable.
 *
 * `setIconProvider` replaces the whole set, so a plugin's icons and the app's could not both be
 * registered; and the complete provider the components read listed core's names only, so an
 * action keyed on `share` found nothing even when the app's provider drew one — a new icon was
 * reachable only as raw markup.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/bubble/aparte-chat-bubble.js';
import '../../components/composer/aparte-composer-action.js';
import '../../primitives/icon/aparte-icon.js';
import { aparteGlobalConfig } from '../index.js';

const SHARE = '<svg data-icon="share"></svg>';
const COPY = '<svg data-icon="my-copy"></svg>';

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

describe('registerIcons', () => {
    it("adds to the provider's set instead of replacing it", () => {
        aparteGlobalConfig.setIconProvider({ copy: () => COPY });
        aparteGlobalConfig.registerIcons({ share: () => SHARE });
        expect(aparteGlobalConfig.getIcon('copy')).toBe(COPY);
        expect(aparteGlobalConfig.getIcon('share')).toBe(SHARE);
    });

    it("redraws one of core's names and leaves the others to core", () => {
        const coreCopy = aparteGlobalConfig.getIcon('copy');
        aparteGlobalConfig.registerIcons({ send: () => SHARE });
        expect(aparteGlobalConfig.getIcon('send')).toBe(SHARE);
        expect(aparteGlobalConfig.getIcon('copy')).toBe(coreCopy);
    });

    it('notifies, so what is on screen redraws', () => {
        let notified = 0;
        const off = aparteGlobalConfig.subscribe(() => { notified++; });
        aparteGlobalConfig.registerIcons({ share: () => SHARE });
        off();
        expect(notified).toBe(1);
    });

    it('is replaced with the rest by a later setIconProvider', () => {
        aparteGlobalConfig.registerIcons({ share: () => SHARE });
        aparteGlobalConfig.setIconProvider({ copy: () => COPY });
        const share: string | undefined = aparteGlobalConfig.getIcon('share');
        expect(share).toBeUndefined();
    });
});

describe('a name core does not draw', () => {
    it("reaches a bubble action's icon", () => {
        aparteGlobalConfig.registerIcons({ share: () => SHARE });
        aparteGlobalConfig.registerAction({ id: 'share', icon: 'share', label: 'Share', zones: ['bubble'] });
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('message-id', 'm1');
        bubble.setAttribute('data-role', 'assistant');
        document.body.appendChild(bubble);
        expect(bubble.querySelector('.aparte-action-custom')?.innerHTML).toBe(SHARE);
    });

    it("reaches a bubble action from the app's own provider too", () => {
        aparteGlobalConfig.setIconProvider({ share: () => SHARE } as Parameters<typeof aparteGlobalConfig.setIconProvider>[0]);
        aparteGlobalConfig.registerAction({ id: 'share', icon: 'share', label: 'Share', zones: ['bubble'] });
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('message-id', 'm1');
        document.body.appendChild(bubble);
        expect(bubble.querySelector('.aparte-action-custom')?.innerHTML).toBe(SHARE);
    });

    it('reaches <aparte-composer-action icon> and <aparte-icon name>', () => {
        aparteGlobalConfig.registerIcons({ share: () => SHARE });
        document.body.innerHTML = '<aparte-composer-action icon="share" label="Share"></aparte-composer-action><aparte-icon name="share"></aparte-icon>';
        expect(document.querySelector('aparte-composer-action button')?.innerHTML).toContain('data-icon="share"');
        expect(document.querySelector('aparte-icon')?.innerHTML).toContain('data-icon="share"');
    });

    it('stays undefined when nothing draws it', () => {
        expect(aparteGlobalConfig.getIcon('rocket')).toBeUndefined();
    });
});
