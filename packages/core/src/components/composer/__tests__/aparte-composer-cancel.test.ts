// @vitest-environment jsdom
/**
 * `<aparte-composer-cancel>` — the Stop button.
 *
 * It shipped published, documented, and with **0% of its functions and branches**
 * covered. Its only appearance in the suite was a snapshot of exported names.
 * Ratified decision #8 puts the stop button in tier (a) — honoured by core alone,
 * therefore ON by default — so it is one of the few affordances a consumer gets
 * without asking, and nothing exercised it.
 *
 * The browser suite does cover stopping a turn, but through `chat.sendButton`:
 * `<aparte-composer-send>` turns into a Stop button while streaming, so the e2e
 * path never touches this element. That is exactly how a default-on affordance
 * ends up untested — another button does its job in the happy path.
 *
 * The streaming state is driven the way it really is, by dispatching the lifecycle
 * events on `window`, rather than by poking a private field: `streaming` is a
 * getter, and going through the events exercises the composer's own targetId
 * filtering at the same time.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-cancel.js';
import type { AparteComposer } from '../aparte-composer.js';

const startTurn = (targetId?: string): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-start', {
        detail: { targetId, messageId: 'm1', role: 'assistant' },
    }));
};
const endTurn = (targetId?: string): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', {
        detail: { targetId, messageId: 'm1', role: 'assistant' },
    }));
};

function mount(): { composer: AparteComposer; cancel: HTMLElement; button: HTMLButtonElement } {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    document.body.appendChild(composer);
    const cancel = document.createElement('aparte-composer-cancel');
    composer.appendChild(cancel);
    return { composer, cancel, button: cancel.querySelector<HTMLButtonElement>('.aparte-composer-cancel__button')! };
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('aparte-composer-cancel', () => {
    it('renders a labelled button that starts hidden', () => {
        const { button } = mount();
        expect(button).toBeTruthy();
        // Hidden, not absent: it has to be in the DOM already so a turn starting can
        // reveal it without a re-render.
        expect(button.hidden).toBe(true);
        expect(button.getAttribute('aria-label')).toBeTruthy();
        expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'));
    });

    it('appears while streaming and hides again when the turn ends', () => {
        const { composer, button } = mount();
        startTurn();
        expect(composer.streaming).toBe(true);
        expect(button.hidden).toBe(false);
        endTurn();
        expect(button.hidden).toBe(true);
    });

    it('is already visible when it connects into an ALREADY-streaming composer', () => {
        // The framework case: a wrapper can mount the button mid-turn, so the
        // initial sync matters as much as the subscription.
        const composer = document.createElement('aparte-composer') as AparteComposer;
        document.body.appendChild(composer);
        startTurn();

        const cancel = document.createElement('aparte-composer-cancel');
        composer.appendChild(cancel);
        expect(cancel.querySelector<HTMLButtonElement>('.aparte-composer-cancel__button')!.hidden).toBe(false);
    });

    it('cancels the turn on click, and does not submit the form it may sit in', () => {
        const { composer, button } = mount();
        const cancel = vi.spyOn(composer, 'cancel').mockImplementation(() => {});
        startTurn();

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        button.dispatchEvent(event);

        expect(cancel).toHaveBeenCalledTimes(1);
        // preventDefault matters: the primitive is documented as droppable into a
        // consumer's own markup, which may well be a <form>.
        expect(event.defaultPrevented).toBe(true);
    });

    it('ignores a turn belonging to another chat on the page', () => {
        const composer = document.createElement('aparte-composer') as AparteComposer;
        composer.setAttribute('target', 'chat-a');
        document.body.appendChild(composer);
        const cancel = document.createElement('aparte-composer-cancel');
        composer.appendChild(cancel);

        startTurn('chat-b');
        expect(cancel.querySelector<HTMLButtonElement>('.aparte-composer-cancel__button')!.hidden).toBe(true);
        startTurn('chat-a');
        expect(cancel.querySelector<HTMLButtonElement>('.aparte-composer-cancel__button')!.hidden).toBe(false);
    });

    it('renders without a composer ancestor instead of throwing', () => {
        // `_getRoot()` returns null outside a composer. The element is exported, so
        // someone will mount it standalone; it must degrade, not crash.
        const cancel = document.createElement('aparte-composer-cancel');
        expect(() => document.body.appendChild(cancel)).not.toThrow();
        const button = cancel.querySelector<HTMLButtonElement>('.aparte-composer-cancel__button')!;
        expect(button).toBeTruthy();
        expect(() => button.click()).not.toThrow();
    });

    it('stops reacting to the composer once removed', () => {
        const { cancel, button } = mount();
        cancel.remove();
        startTurn();
        // Still hidden: the subscription was released in disconnectedCallback, so a
        // re-parented or torn-down button cannot leak a live listener.
        expect(button.hidden).toBe(true);
    });

    it('re-renders idempotently when moved between parents', () => {
        const { cancel } = mount();
        const second = document.createElement('aparte-composer') as AparteComposer;
        document.body.appendChild(second);
        second.appendChild(cancel);
        // `_render()` returns early when its button already exists, so a move must
        // not stack a second one.
        expect(cancel.querySelectorAll('.aparte-composer-cancel__button')).toHaveLength(1);
        startTurn();
        expect(cancel.querySelector<HTMLButtonElement>('.aparte-composer-cancel__button')!.hidden).toBe(false);
    });
});
