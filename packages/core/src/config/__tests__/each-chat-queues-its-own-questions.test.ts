// @vitest-environment jsdom
/**
 * Two chats sharing one config each answer their own questions.
 *
 * `requestUserInput` serialises requests so a second question cannot take the panel away
 * from the one on screen — but the queue was per CONFIG, while `_present` routes per
 * target. Two `<aparte-chat>`s on the global config therefore shared one queue: an
 * approval waiting for an answer in chat A — which is all an approval panel ever does —
 * held chat B's question behind it, and B's tool waited for ever with nothing on screen.
 * A silent, permanent hang on the arrangement `_present`'s own docblock says is
 * supported.
 *
 * Within one chat the serialisation is the point and stays: one panel, one question.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig } from '../aparte-config.js';
import type { AparteElicitationRequest, AparteElicitationResult } from '../../elicitation/types.js';

function chat(id: string): HTMLElement {
    const el = document.createElement('div');
    el.id = id;
    el.setAttribute('data-aparte-chat', '');
    const inside = document.createElement('div');
    el.appendChild(inside);
    document.body.appendChild(el);
    return inside;
}

const ask = (target: HTMLElement, message: string): AparteElicitationRequest =>
    ({ target, message } as AparteElicitationRequest);

describe('the elicitation queue', () => {
    beforeEach(() => { document.body.innerHTML = ''; });
    afterEach(() => { document.body.innerHTML = ''; });

    it('is one per chat: an unanswered question in A does not hold B', async () => {
        const cfg = new AparteConfig();
        const a = chat('a');
        const b = chat('b');
        const presented: string[] = [];
        cfg.setElicitationPresenter((request) => {
            presented.push(String(request.message));
            // Nobody answers — exactly what an approval panel does while it waits.
            return new Promise<AparteElicitationResult>(() => {});
        });

        void cfg.requestUserInput(ask(a, 'A?'));
        void cfg.requestUserInput(ask(b, 'B?'));
        await Promise.resolve();
        await Promise.resolve();

        expect(presented).toEqual(['A?', 'B?']);
    });

    it('still holds the second question of the SAME chat behind the first', async () => {
        const cfg = new AparteConfig();
        const a = chat('a');
        const presented: string[] = [];
        let answer: ((r: AparteElicitationResult) => void) | null = null;
        cfg.setElicitationPresenter((request) => {
            presented.push(String(request.message));
            return new Promise<AparteElicitationResult>((resolve) => { answer = resolve; });
        });

        void cfg.requestUserInput(ask(a, 'first'));
        void cfg.requestUserInput(ask(a, 'second'));
        await Promise.resolve();
        expect(presented, 'one panel, one question').toEqual(['first']);

        answer!({ action: 'accept', value: 'yes' } as unknown as AparteElicitationResult);
        await vi.waitFor(() => expect(presented).toEqual(['first', 'second']));
    });

    it('keeps one shared queue for requests that name no chat', async () => {
        const cfg = new AparteConfig();
        const presented: string[] = [];
        cfg.setElicitationPresenter((request) => {
            presented.push(String(request.message));
            return new Promise<AparteElicitationResult>(() => {});
        });

        void cfg.requestUserInput({ message: 'one' } as AparteElicitationRequest);
        void cfg.requestUserInput({ message: 'two' } as AparteElicitationRequest);
        await Promise.resolve();
        await Promise.resolve();

        expect(presented, 'they all reach the same presenter, so they still take turns').toEqual(['one']);
    });
});
