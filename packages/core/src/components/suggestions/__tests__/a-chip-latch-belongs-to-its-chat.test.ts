// @vitest-environment jsdom
/**
 * A chip that has sent holds every chip of ITS chat until its turn has started.
 *
 * The turn's `aparte-message-start` crosses the window, so on a page with two chats the one from
 * the OTHER chat used to release the latch: a second click in the first chat then sent a second
 * message while the first was still being built, and the client abandoned the first turn for it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-suggestions.js';

function mountTwoChats(): { chipA: HTMLButtonElement; sentA: string[] } {
    document.body.innerHTML = ['a', 'b'].map((id) =>
        `<div data-aparte-chat id="${id}"><aparte-composer><aparte-suggestions suggestions='["Go"]'></aparte-suggestions></aparte-composer></div>`).join('');
    const composerA = document.querySelector('#a aparte-composer')!;
    const sentA: string[] = [];
    composerA.addEventListener('aparte-send', (e) => sentA.push((e as CustomEvent).detail.content));
    return { chipA: document.querySelector<HTMLButtonElement>('#a aparte-suggestions button')!, sentA };
}

const start = (targetId?: string): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-start', { detail: targetId ? { targetId, messageId: 'm' } : { messageId: 'm' } }));
};
const done = (targetId: string): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { targetId, messageId: 'm' } }));
};

afterEach(() => { document.body.innerHTML = ''; });

describe('the double-send latch of a chip', () => {
    it('is not released by another chat\'s turn starting', () => {
        const { chipA, sentA } = mountTwoChats();
        chipA.click();
        expect(sentA).toEqual(['Go']);
        start('b');
        chipA.click();
        expect(sentA).toEqual(['Go']);
    });

    it('is released by its own chat\'s turn starting', () => {
        const { chipA, sentA } = mountTwoChats();
        chipA.click();
        start('a');
        done('a');
        chipA.click();
        expect(sentA).toEqual(['Go', 'Go']);
    });

    it('is released by a start that names no chat, as the composer reads one', () => {
        const { chipA, sentA } = mountTwoChats();
        chipA.click();
        start();
        done('a');
        chipA.click();
        expect(sentA).toEqual(['Go', 'Go']);
    });
});
