// @vitest-environment jsdom
/**
 * A question can be answered from outside its chat: `observeElicitations` hands each request a
 * chat presents to the app, with `respond()`.
 *
 * An approval could be answered from anywhere, through the client's `approvalResolver`. A
 * question (`ask_user`, any `requestUserInput`) could not: it goes to the presenter of its chat,
 * and an app gathering what waits for the person across conversations had nothing to answer it
 * with short of replacing the presenter. Now the chat still asks, and the app can answer too:
 * whichever answers first is the answer, and the other's question goes away.
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConfig } from '../aparte-config.js';
import type { AparteElicitationPending, AparteElicitationRequest, AparteElicitationResult } from '../../elicitation/types.js';

/** A presenter that shows the question until it is answered or told to take it down. */
function panel() {
    const shown: Array<{ request: AparteElicitationRequest; answer: (r: AparteElicitationResult) => void; takenDown: () => boolean }> = [];
    const presenter = (request: AparteElicitationRequest): Promise<AparteElicitationResult> => new Promise((resolve, reject) => {
        let down = false;
        request.signal?.addEventListener('abort', () => { down = true; reject(new DOMException('gone', 'AbortError')); });
        shown.push({ request, answer: resolve, takenDown: () => down });
    });
    return { shown, presenter };
}

const question = (extra: Partial<AparteElicitationRequest> = {}): AparteElicitationRequest => ({
    message: 'Which format?',
    schema: { type: 'enum', options: [{ value: 'csv', title: 'CSV' }, { value: 'json', title: 'JSON' }] } as never,
    conversationId: 'c-42',
    ...extra,
});

describe('a question answered from outside its chat', () => {
    it('reaches the app with what it asks, and the app\'s answer is the answer', async () => {
        const config = new AparteConfig();
        const { shown, presenter } = panel();
        config.setElicitationPresenter(presenter);
        const pending: AparteElicitationPending[] = [];
        config.observeElicitations((p) => pending.push(p));

        const answer = config.requestUserInput(question());
        expect(pending).toHaveLength(1);
        expect(pending[0]!.request.message).toBe('Which format?');
        expect(pending[0]!.request.conversationId).toBe('c-42');
        expect(shown, 'the chat still asks it').toHaveLength(1);

        pending[0]!.respond({ action: 'accept', content: 'json' });
        await expect(answer).resolves.toEqual({ action: 'accept', content: 'json' });
        expect(shown[0]!.takenDown(), "the chat's panel goes away").toBe(true);
        await pending[0]!.settled;
    });

    it('answered in the chat first, a late respond() changes nothing', async () => {
        const config = new AparteConfig();
        const { shown, presenter } = panel();
        config.setElicitationPresenter(presenter);
        let pending: AparteElicitationPending | undefined;
        config.observeElicitations((p) => { pending = p; });

        const answer = config.requestUserInput(question());
        shown[0]!.answer({ action: 'accept', content: 'csv' });
        await expect(answer).resolves.toEqual({ action: 'accept', content: 'csv' });
        await pending!.settled;
        pending!.respond({ action: 'decline' });
        await expect(answer).resolves.toEqual({ action: 'accept', content: 'csv' });
    });

    it('a stopped turn ends it for the app too: settled, and no answer taken', async () => {
        const config = new AparteConfig();
        const { presenter } = panel();
        config.setElicitationPresenter(presenter);
        let pending: AparteElicitationPending | undefined;
        config.observeElicitations((p) => { pending = p; });
        const stop = new AbortController();

        const answer = config.requestUserInput(question({ signal: stop.signal }));
        stop.abort();
        await expect(answer).rejects.toMatchObject({ name: 'AbortError', reason: 'aborted' });
        await pending!.settled;
        pending!.respond({ action: 'decline' });
        await expect(answer).rejects.toMatchObject({ name: 'AbortError' });
    });

    it("takes the chat's own panel down when the app answers", async () => {
        await import('../../components/composer/aparte-composer.js');
        await import('../../components/composer/aparte-composer-input.js');
        await import('../../components/elicitation/aparte-elicitation.js');
        const { aparteGlobalConfig } = await import('../aparte-config.js');
        const host = document.createElement('div');
        const composer = document.createElement('aparte-composer');
        composer.appendChild(document.createElement('aparte-composer-input'));
        host.append(composer, document.createElement('aparte-elicitation'));
        document.body.appendChild(host);
        let pending: AparteElicitationPending | undefined;
        const off = aparteGlobalConfig.observeElicitations((p) => { pending = p; });
        try {
            const answer = aparteGlobalConfig.requestUserInput(question({ target: composer }));
            await vi.waitFor(() => expect(composer.hasAttribute('data-panel-active')).toBe(true));

            pending!.respond({ action: 'accept', content: 'csv' });

            await expect(answer).resolves.toEqual({ action: 'accept', content: 'csv' });
            await vi.waitFor(() => expect(composer.hasAttribute('data-panel-active')).toBe(false));
        } finally {
            off();
            host.remove();
        }
    });

    it('stops reaching a listener once it is taken off, and a listener that throws harms nothing', async () => {
        const config = new AparteConfig();
        const { shown, presenter } = panel();
        config.setElicitationPresenter(presenter);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen = vi.fn();
        config.observeElicitations(() => { throw new Error('boom'); });
        const off = config.observeElicitations(seen);

        void config.requestUserInput(question());
        expect(seen).toHaveBeenCalledTimes(1);
        expect(shown).toHaveLength(1);
        off();
        void config.requestUserInput(question({ target: null }));
        shown[0]!.answer({ action: 'decline' });
        await vi.waitFor(() => expect(shown).toHaveLength(2));
        expect(seen).toHaveBeenCalledTimes(1);
        error.mockRestore();
    });
});
