/**
 * Every event a chat's content or its composer sends names the chat it came from (`targetId`),
 * as the turn's lifecycle events always have: a page with several chats listens once, on the
 * document, and acts on the right one.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../index.js';
import type { AparteComposer } from '../components/composer/aparte-composer.js';
import type { AparteSuggestions } from '../components/suggestions/aparte-suggestions.js';

afterEach(() => {
    document.body.replaceChildren();
});

/** A chat root the way a React, Vue or Svelte wrapper renders one. */
function chat(id: string): HTMLElement {
    const root = document.createElement('div');
    root.setAttribute('data-aparte-chat', '');
    root.id = id;
    document.body.append(root);
    return root;
}

function heard(type: string): () => unknown[] {
    const seen: unknown[] = [];
    const listener = (e: Event): void => {
        seen.push((e as CustomEvent).detail?.targetId);
    };
    document.addEventListener(type, listener);
    return () => {
        document.removeEventListener(type, listener);
        return seen;
    };
}

describe('an event names the chat it came from', () => {
    it('a link clicked in a message', () => {
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('message-id', 'm1');
        chat('chat-a').append(bubble);
        const a = document.createElement('a');
        a.href = '#here';
        bubble.append(a);
        const stop = heard('aparte-link-click');
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(stop()).toEqual(['chat-a']);
    });

    it('a toolbar button of the composer', () => {
        const composer = document.createElement('aparte-composer');
        composer.innerHTML = '<aparte-composer-toolbar><aparte-composer-action action-id="go" label="Go"></aparte-composer-action></aparte-composer-toolbar>';
        chat('chat-b').append(composer);
        const stop = heard('aparte-action-click');
        composer.querySelector<HTMLButtonElement>('aparte-composer-action button')!.click();
        expect(stop()).toEqual(['chat-b']);
    });

    it('the composer\'s state, and the composer placed outside its chat names its target', () => {
        chat('chat-c');
        const composer = document.createElement('aparte-composer') as AparteComposer;
        composer.setAttribute('target', 'chat-c');
        document.body.append(composer);
        const stop = heard('aparte-composer-change');
        composer.setValue('hello');
        expect(stop()).toContain('chat-c');
    });

    it('a suggestion chosen', () => {
        const root = chat('chat-d');
        const composer = document.createElement('aparte-composer');
        root.append(composer);
        const row = document.createElement('aparte-suggestions') as AparteSuggestions;
        root.append(row);
        row.suggestions = ['Hello'];
        const stop = heard('aparte-suggestion');
        row.querySelector<HTMLButtonElement>('.aparte-suggestion')!.click();
        expect(stop()).toEqual(['chat-d']);
    });

    it('says nothing of a chat when there is none to name', () => {
        const bubble = document.createElement('aparte-chat-bubble');
        bubble.setAttribute('message-id', 'm1');
        document.body.append(bubble);
        const a = document.createElement('a');
        a.href = '#here';
        bubble.append(a);
        const seen: object[] = [];
        document.addEventListener('aparte-link-click', (e) => seen.push((e as CustomEvent).detail), { once: true });
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect('targetId' in seen[0]!).toBe(false);
    });
});
