/**
 * `chatIdOf` and `dispatchChatEvent`: which chat an element belongs to, and an event that says so.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { chatIdOf, dispatchChatEvent } from '../chat-events.js';

afterEach(() => {
    document.body.replaceChildren();
});

function html(markup: string): HTMLElement {
    const box = document.createElement('div');
    box.innerHTML = markup;
    document.body.append(box);
    return box;
}

describe('chatIdOf', () => {
    it('is the id of the chat host above, the element or a wrapper\'s root', () => {
        const box = html(`
            <aparte-chat id="a"><span class="in-a"></span></aparte-chat>
            <div data-aparte-chat id="b"><span class="in-b"></span></div>`);
        expect(chatIdOf(box.querySelector('.in-a'))).toBe('a');
        expect(chatIdOf(box.querySelector('.in-b'))).toBe('b');
        expect(chatIdOf(box.querySelector('#a'))).toBe('a');
    });

    it('takes the `target` an aparté element names, before any host', () => {
        const box = html(`
            <div data-aparte-chat id="b">
                <aparte-composer target="a"><aparte-composer-toolbar><span class="tool"></span></aparte-composer-toolbar></aparte-composer>
            </div>`);
        expect(chatIdOf(box.querySelector('.tool'))).toBe('a');
    });

    it('does not read `target` off an element that is not aparté\'s', () => {
        const box = html('<div data-aparte-chat id="b"><a target="_blank" href="#"><span class="x"></span></a></div>');
        expect(chatIdOf(box.querySelector('.x'))).toBe('b');
    });

    it('passes over a host with no id, to the one that has one', () => {
        const box = html('<div data-aparte-chat id="outer"><aparte-chat><span class="x"></span></aparte-chat></div>');
        expect(chatIdOf(box.querySelector('.x'))).toBe('outer');
    });

    it('crosses a shadow root to the chat around its host', () => {
        const box = html('<div data-aparte-chat id="a"><div class="host"></div></div>');
        const root = box.querySelector('.host')!.attachShadow({ mode: 'open' });
        const inner = document.createElement('span');
        root.append(inner);
        expect(chatIdOf(inner)).toBe('a');
    });

    it('is undefined outside any named chat, and for nothing', () => {
        const box = html('<aparte-chat><span class="x"></span></aparte-chat>');
        expect(chatIdOf(box.querySelector('.x'))).toBeUndefined();
        expect(chatIdOf(null)).toBeUndefined();
    });
});

describe('dispatchChatEvent', () => {
    it('stamps the chat on the detail, bubbling and composed', () => {
        const box = html('<div data-aparte-chat id="a"><span class="x"></span></div>');
        const seen: CustomEvent[] = [];
        document.addEventListener('my-pick', (e) => seen.push(e as CustomEvent), { once: true });
        dispatchChatEvent(box.querySelector('.x')!, 'my-pick', { value: 1 });
        expect(seen[0]!.detail).toEqual({ value: 1, targetId: 'a' });
        expect(seen[0]!.bubbles).toBe(true);
        expect(seen[0]!.composed).toBe(true);
        expect(seen[0]!.cancelable).toBe(false);
    });

    it('keeps a targetId the sender gave, and adds no key when there is no chat to name', () => {
        const box = html('<div data-aparte-chat id="a"><span class="x"></span></div><span class="lone"></span>');
        const seen: unknown[] = [];
        document.addEventListener('my-pick', (e) => seen.push((e as CustomEvent).detail));
        dispatchChatEvent(box.querySelector('.x')!, 'my-pick', { targetId: 'other' });
        dispatchChatEvent(box.querySelector('.lone')!, 'my-pick', { value: 2 });
        expect(seen[0]).toEqual({ targetId: 'other' });
        expect(Object.keys(seen[1] as object)).toEqual(['value']);
    });

    it('tells a cancelable event\'s sender whether it was cancelled', () => {
        const box = html('<span class="x"></span>');
        box.addEventListener('my-pick', (e) => e.preventDefault(), { once: true });
        expect(dispatchChatEvent(box.querySelector('.x')!, 'my-pick', {}, { cancelable: true })).toBe(false);
        expect(dispatchChatEvent(box.querySelector('.x')!, 'my-pick', {}, { cancelable: true })).toBe(true);
    });
});
