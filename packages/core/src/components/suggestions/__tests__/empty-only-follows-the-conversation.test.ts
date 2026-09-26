// @vitest-environment jsdom
/**
 * `empty-only` shows the starters while the conversation is empty, not until the first send.
 *
 * It read the composer's `aparte-send` alone: hidden on the first one, never shown again.
 * So over a thread restored through `setMessages` (nothing sent yet) the starters sat on
 * top of the transcript, and after a new chat cleared the thread they never came back.
 * The transcript is the signal now. The send stays as the other half: it hides the row on
 * the click rather than when the bubble lands, and it is all there is to read when the
 * messages are not `<aparte-chat-bubble>`s or there is no transcript at all.
 *
 * The chat is a wrapper's shape — a `[data-aparte-chat]` div around a viewport and a
 * composer — built from plain elements: what the row reads is the DOM, not their code.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../aparte-suggestions.js';
import type { AparteSuggestions } from '../aparte-suggestions.js';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function chat(id: string, transcript = ''): { root: HTMLElement; viewport: HTMLElement; composer: HTMLElement } {
    const root = document.createElement('div');
    root.id = id;
    root.setAttribute('data-aparte-chat', '');
    root.innerHTML = `<aparte-chat-viewport>${transcript}</aparte-chat-viewport><aparte-composer></aparte-composer>`;
    document.body.appendChild(root);
    return {
        root,
        viewport: root.querySelector('aparte-chat-viewport') as HTMLElement,
        composer: root.querySelector('aparte-composer') as HTMLElement,
    };
}

function starters(inside: Element): AparteSuggestions {
    const el = document.createElement('aparte-suggestions') as AparteSuggestions;
    el.setAttribute('empty-only', '');
    el.suggestions = ['Hi'];
    inside.appendChild(el);
    return el;
}

const send = (composer: Element): void => {
    composer.dispatchEvent(new CustomEvent('aparte-send', { bubbles: true, detail: { message: 'Hi' } }));
};

afterEach(() => { document.body.innerHTML = ''; });

describe('<aparte-suggestions empty-only>', () => {
    it('stays hidden over a restored thread, with nothing sent yet', () => {
        const { composer } = chat('c', '<aparte-chat-bubble></aparte-chat-bubble>');
        expect(starters(composer).hidden).toBe(true);
    });

    it('stays hidden while a thread is loading', async () => {
        const { viewport, composer } = chat('c');
        viewport.setAttribute('loading', '');
        const el = starters(composer);
        expect(el.hidden).toBe(true);

        // The fetch came back with an empty thread: that is an empty conversation.
        viewport.removeAttribute('loading');
        await flush();
        expect(el.hidden).toBe(false);
    });

    it('hides on the send, before the message lands, and comes back after a new chat', async () => {
        const { viewport, composer } = chat('c');
        const el = starters(composer);
        expect(el.hidden).toBe(false);

        send(composer);
        expect(el.hidden, 'hidden on the click').toBe(true);

        const bubble = document.createElement('aparte-chat-bubble');
        viewport.appendChild(bubble);
        await flush();
        expect(el.hidden).toBe(true);

        bubble.remove();
        await flush();
        expect(el.hidden, 'shown again on the cleared thread').toBe(false);
    });

    it('comes back after a new chat on a thread it never saw sent', async () => {
        const { viewport, composer } = chat('c', '<aparte-chat-bubble></aparte-chat-bubble>');
        const el = starters(composer);
        expect(el.hidden).toBe(true);
        viewport.replaceChildren();
        await flush();
        expect(el.hidden).toBe(false);
    });

    it('still hides on the send when the messages are not <aparte-chat-bubble>s', async () => {
        // A wrapper's `renderBubble` draws the consumer's own element per message: the
        // transcript never looks full, so the send is the signal, as it always was.
        const { viewport, composer } = chat('c');
        const el = starters(composer);
        send(composer);
        viewport.appendChild(document.createElement('my-bubble'));
        await flush();
        expect(el.hidden).toBe(true);
    });

    it('with no chat around the composer, hides on the first send, as before', () => {
        const composer = document.createElement('aparte-composer');
        document.body.appendChild(composer);
        const el = starters(composer);
        send(composer);
        expect(el.hidden).toBe(true);
    });

    it('follows the chat `target` names, not the first one on the page', async () => {
        const other = chat('other');
        const mine = chat('mine');
        const el = document.createElement('aparte-suggestions') as AparteSuggestions;
        el.setAttribute('empty-only', '');
        el.setAttribute('target', 'mine');
        el.suggestions = ['Hi'];
        document.body.appendChild(el);

        other.viewport.appendChild(document.createElement('aparte-chat-bubble'));
        await flush();
        expect(el.hidden).toBe(false);

        mine.viewport.appendChild(document.createElement('aparte-chat-bubble'));
        await flush();
        expect(el.hidden).toBe(true);
    });

    it('never lifts a hidden the page set', async () => {
        const { viewport, composer } = chat('c', '<aparte-chat-bubble></aparte-chat-bubble>');
        const el = document.createElement('aparte-suggestions') as AparteSuggestions;
        el.hidden = true;
        el.setAttribute('empty-only', '');
        el.suggestions = ['Hi'];
        composer.appendChild(el);

        viewport.replaceChildren();
        await flush();
        expect(el.hidden).toBe(true);
    });

    it('shows the row again when empty-only is removed', () => {
        const { composer } = chat('c', '<aparte-chat-bubble></aparte-chat-bubble>');
        const el = starters(composer);
        expect(el.hidden).toBe(true);
        el.removeAttribute('empty-only');
        expect(el.hidden).toBe(false);
    });
});
