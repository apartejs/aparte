import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { AparteConfig, aparteGlobalConfig } from '../../config/aparte-config';
import { attachConfig } from '../../config/config-context';
import { installImageHoldsOnce } from '../image-holds';

/*
 * A held picture in a reply is a link to it; a plain click turns it into the picture, in
 * place, and remembers the choice on the chat's config. The listener is the browser entry's,
 * installed once per document.
 */

const ADDRESS = 'https://photos.example/cat.png?size=2';

beforeAll(() => installImageHoldsOnce());
afterEach(() => {
    document.body.replaceChildren();
    aparteGlobalConfig.reset();
});

/** A chat's config and a reply holding one picture, drawn by the policy itself. */
function reply(config: AparteConfig = aparteGlobalConfig): { host: HTMLElement; link: HTMLAnchorElement } {
    const host = document.createElement('div');
    if (config !== aparteGlobalConfig) attachConfig(host, config);
    const content = document.createElement('div');
    content.className = 'aparte-content';
    content.innerHTML = config.sanitizeHtml(`<p>See <img src="${ADDRESS}" alt="the cat"></p>`);
    host.append(content);
    document.body.append(host);
    return { host, link: content.querySelector<HTMLAnchorElement>('a.aparte-image-held')! };
}

describe('a click on a held picture', () => {
    it('puts the picture in its place, sent without a referrer', () => {
        const { host, link } = reply();
        const allowed = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        expect(allowed).toBe(false);
        const img = host.querySelector('img')!;
        expect(img.getAttribute('src')).toBe(ADDRESS);
        expect(img.getAttribute('alt')).toBe('the cat');
        expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
        expect(host.querySelector('a.aparte-image-held')).toBeNull();
    });

    it('is no link the bubble announces: nothing above the document sees it', () => {
        const { host, link } = reply();
        const announced = vi.fn();
        host.addEventListener('click', announced);
        link.click();
        expect(announced).not.toHaveBeenCalled();
    });

    it('leaves a modified click to the browser: a new tab is the reader’s choice', () => {
        const { host, link } = reply();
        for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
            const allowed = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
            expect(allowed, JSON.stringify(init)).toBe(true);
        }
        expect(host.querySelector('img')).toBeNull();
    });

    it('keeps the keyboard where it was: the focus moves to the picture', () => {
        const { host, link } = reply();
        link.focus();
        link.click();
        const img = host.querySelector('img')!;
        expect(document.activeElement).toBe(img);
        expect(img.tabIndex).toBe(-1);
    });

    it('is remembered on the chat’s config, so a redraw shows the picture', () => {
        const chat = new AparteConfig();
        const { link } = reply(chat);
        link.click();
        expect(chat.decideImage(ADDRESS)).toBe('load');
        expect(aparteGlobalConfig.decideImage(ADDRESS)).toBe('hold');
        expect(chat.sanitizeHtml(`<img src="${ADDRESS}">`)).toContain('referrerpolicy="no-referrer"');
    });
});

describe('a held picture inside a link of the reply', () => {
    /** A linked badge, drawn by the policy: the held picture is the button form, in the link. */
    function badge(): { outer: HTMLAnchorElement; button: HTMLElement } {
        const content = document.createElement('div');
        content.className = 'aparte-content';
        content.innerHTML = aparteGlobalConfig.sanitizeHtml(`<p><a href="https://ci.example/build"><img src="${ADDRESS}" alt="build"></a></p>`);
        document.body.append(content);
        const outer = content.querySelector<HTMLAnchorElement>('a[href="https://ci.example/build"]')!;
        return { outer, button: outer.querySelector<HTMLElement>('span.aparte-image-held')! };
    }

    it('loads on a click, in the link, without following the link', () => {
        const { outer, button } = badge();
        const followed = button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        expect(followed).toBe(false);
        expect(outer.querySelector('img')!.getAttribute('src')).toBe(ADDRESS);
    });

    it('loads on Enter and on Space, as a button does', () => {
        for (const key of ['Enter', ' ']) {
            const { outer, button } = badge();
            button.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            expect(outer.querySelector('img'), JSON.stringify(key)).not.toBeNull();
            document.body.replaceChildren();
            // Shown once, the picture would load at once the next time: start again from held.
            aparteGlobalConfig.reset();
        }
    });
});
