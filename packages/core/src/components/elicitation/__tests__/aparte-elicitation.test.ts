import { describe, it, expect, afterEach, vi } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-elicitation.js';
import { aparteGlobalConfig, AparteConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

type ComposerEl = HTMLElement & { submit(): void };

function mountChat(withComposer = true): { composer: ComposerEl | null } {
    const host = document.createElement('div');
    let composer: ComposerEl | null = null;
    if (withComposer) {
        composer = document.createElement('aparte-composer') as ComposerEl;
        host.appendChild(composer);
    }
    host.appendChild(document.createElement('aparte-elicitation'));
    document.body.appendChild(host);
    return { composer };
}

function pick(value: string): void {
    const input = document.querySelector<HTMLInputElement>(`.aparte-elic-panel input[value="${value}"]`)!;
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('<aparte-elicitation> presenter', () => {
    afterEach(() => {
        aparteGlobalConfig.setElicitationPresenter(null);
        document.body.innerHTML = '';
    });

    it('registers as the presenter on connect', () => {
        mountChat();
        expect(aparteGlobalConfig.getElicitationPresenter()).toBeTypeOf('function');
    });

    it('presents an enum request and resolves accept on submit', async () => {
        const { composer } = mountChat();
        const p = requestUserInput({
            message: 'Framework?',
            schema: { type: 'enum', options: [{ value: 'react' }, { value: 'vue' }], allowOther: false },
        });
        // Panel mounted synchronously into the composer.
        expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();
        pick('vue');
        composer!.submit(); // send button → panel onSubmit
        expect(await p).toEqual({ action: 'accept', content: 'vue' });
        // Panel removed after settling.
        expect(document.querySelector('.aparte-elic-panel')).toBeNull();
    });

    it('resolves a boolean request', async () => {
        const { composer } = mountChat();
        const p = requestUserInput({ message: 'Proceed?', schema: { type: 'boolean' } });
        pick('true');
        composer!.submit();
        expect(await p).toEqual({ action: 'accept', content: true });
    });

    it('resolves decline via the Skip affordance', async () => {
        mountChat();
        const p = requestUserInput({ message: '?', schema: { type: 'string' } });
        document.querySelector<HTMLButtonElement>('.aparte-elic-skip')!.click();
        expect(await p).toEqual({ action: 'decline' });
    });

    it('resolves cancel when the assistant turn is aborted', async () => {
        mountChat();
        const p = requestUserInput({ message: '?', schema: { type: 'string' } });
        window.dispatchEvent(new CustomEvent('aparte-message-aborted'));
        expect(await p).toEqual({ action: 'cancel' });
    });

    /**
     * Two chats on one page: a question belongs to ONE of them.
     *
     * Both of these are the "first chat on the page" family that produced this
     * release's two CRITICALs, and the elicitation presenter had them too — it was
     * simply never executed, because no tool ever reached the model.
     */
    describe('two chats on one page', () => {
        /** A wrapper-shaped host: `[data-aparte-chat]` + an id, which is what React, Vue and Svelte render. */
        function mountHost(id: string, opts: { composer?: boolean; presenter?: boolean } = {}): { host: HTMLElement; composer: ComposerEl | null } {
            const host = document.createElement('div');
            host.setAttribute('data-aparte-chat', '');
            host.id = id;
            let composer: ComposerEl | null = null;
            if (opts.composer !== false) {
                composer = document.createElement('aparte-composer') as ComposerEl;
                // All four wrappers set this, and raw core now falls back to the host
                // id — but the fixture says it out loud, because the composer ALSO
                // listens for `aparte-message-aborted` and tears the panel down. A
                // composer that cannot name its chat accepts every chat's Stop.
                composer.setAttribute('target', id);
                host.appendChild(composer);
            }
            if (opts.presenter !== false) host.appendChild(document.createElement('aparte-elicitation'));
            document.body.appendChild(host);
            return { host, composer };
        }

        /** Did the promise settle by the next macrotask, or is it still waiting? */
        async function settledYet(p: Promise<unknown>): Promise<'settled' | 'pending'> {
            return Promise.race([
                p.then(() => 'settled' as const),
                new Promise<'pending'>((r) => { setTimeout(() => r('pending'), 0); }),
            ]);
        }

        it('never borrows the other chat\'s composer', async () => {
            // Chat A owns a composer. Chat B has a presenter and NO composer of its
            // own — the removed `document.querySelector` fallback made B mount its
            // panel inside A, so one conversation's question appeared under the
            // other, and answering it resolved a tool call for a chat the user was
            // not even looking at.
            const a = mountHost('chat-a', { presenter: false });
            mountHost('chat-b', { composer: false });

            const result = await requestUserInput({ message: '?', schema: { type: 'string' } });

            expect(result, 'nothing was shown, so nothing was answered').toEqual({ action: 'cancel' });
            expect(
                a.composer!.querySelector('.aparte-elic-panel'),
                'the other chat\'s composer must stay untouched',
            ).toBeNull();
        });

        it('a Stop in the other chat does not cancel this question', async () => {
            mountHost('chat-a');
            const p = requestUserInput({ message: '?', schema: { type: 'string' } });
            expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();

            // Chat B's turn ends. The two window listeners had no filter at all, so
            // this cancelled chat A's open question and told A's model the user had
            // refused — while the user was still looking at it.
            window.dispatchEvent(new CustomEvent('aparte-message-aborted', { detail: { targetId: 'chat-b' } }));

            expect(await settledYet(p), 'the question must survive another chat\'s Stop').toBe('pending');
            expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();

            // And OUR turn ending still cancels it.
            window.dispatchEvent(new CustomEvent('aparte-message-aborted', { detail: { targetId: 'chat-a' } }));
            expect(await p).toEqual({ action: 'cancel' });
        });

        it('an event with no targetId still cancels — a single-chat app sets none', async () => {
            mountHost('chat-a');
            const p = requestUserInput({ message: '?', schema: { type: 'string' } });
            window.dispatchEvent(new CustomEvent('aparte-message-aborted'));
            expect(await p).toEqual({ action: 'cancel' });
        });
    });

    /**
     * While a panel is up, the composer is answering a QUESTION.
     *
     * It used to hide only `aparte-composer-input`, with an inline
     * `style.display`, and leave everything else — so the attachment picker stayed
     * clickable while the user was being asked something. Ratified decision #8: an
     * affordance nothing can honour is not rendered. Reported from a real session
     * ("on voyait encore l'icône de upload").
     *
     * The CONTRACT is the attribute; jsdom applies no external stylesheet, so what
     * the attribute makes invisible is asserted in the browser suite instead.
     */
    describe('panel mode', () => {
        it('marks the composer, and unmarks it when the panel goes', async () => {
            const { composer } = mountChat();
            const p = requestUserInput({ message: '?', schema: { type: 'string' } });

            expect(composer!.hasAttribute('data-panel-active'), 'the composer is in panel mode').toBe(true);

            window.dispatchEvent(new CustomEvent('aparte-message-aborted'));
            await p;

            expect(composer!.hasAttribute('data-panel-active'), 'and back to composing').toBe(false);
        });

        it('does not leave an inline display on the input', async () => {
            // The old implementation wrote `style.display = 'none'` and restored `''`
            // — not the previous value — so it silently clobbered a display a
            // consumer had set, and was invisible to their own CSS.
            const { composer } = mountChat();
            const input = document.createElement('aparte-composer-input');
            input.style.display = 'flex';
            composer!.appendChild(input);

            const p = requestUserInput({ message: '?', schema: { type: 'string' } });
            window.dispatchEvent(new CustomEvent('aparte-message-aborted'));
            await p;

            expect(input.style.display, 'the consumer\'s own display survives').toBe('flex');
        });
    });

    it('resolves cancel when there is no composer to present in', async () => {
        mountChat(false);
        expect(await requestUserInput({ message: '?', schema: { type: 'string' } })).toEqual({ action: 'cancel' });
    });

    it('resolves cancel when the caller aborts via signal (tool timeout / turn abort)', async () => {
        mountChat();
        const ctrl = new AbortController();
        const p = requestUserInput({ message: '?', schema: { type: 'string' }, signal: ctrl.signal });
        expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();
        ctrl.abort();
        expect(await p).toEqual({ action: 'cancel' });
        expect(document.querySelector('.aparte-elic-panel')).toBeNull();
    });

    it('resolves cancel immediately for an already-aborted signal', async () => {
        mountChat();
        expect(await requestUserInput({
            message: '?', schema: { type: 'string' }, signal: AbortSignal.abort(),
        })).toEqual({ action: 'cancel' });
    });

    it('a turn ending does not wedge the presenter', async () => {
        mountChat();
        const first = requestUserInput({ message: 'Framework?', schema: { type: 'string' } });
        expect(document.querySelector('.aparte-elic-panel')).not.toBeNull();

        // The turn finishes while the question is still open. The COMPOSER tears the
        // panel down on this event; the presenter only ever listened for `-error` and
        // `-aborted`, so nothing settled the request.
        window.dispatchEvent(new CustomEvent('aparte-message-done'));

        // Raced rather than awaited: with the defect present this promise never
        // resolves, and a hung test reports a timeout instead of the reason.
        const settled = await Promise.race([
            first,
            new Promise((r) => setTimeout(() => r('never'), 50)),
        ]);
        expect(settled, 'a request whose panel was torn down has to settle').not.toBe('never');

        // And the slot is free again. This is the half that made the defect permanent:
        // `_pending` stayed set, so every later request was short-circuited for the
        // life of the page — one finished turn and the chat could never ask again.
        requestUserInput({ message: 'Again?', schema: { type: 'string' } });
        expect(
            document.querySelector('.aparte-elic-panel'),
            'a later question must still be presentable',
        ).not.toBeNull();
    });

    it('makes a second request wait instead of refusing it', async () => {
        // This asserted the opposite until the queue existed: the second request was
        // answered `cancel` the moment it arrived — a refusal for a question nobody
        // had been shown, which the model then read as the user having refused.
        mountChat();
        const first = requestUserInput({ message: 'first', schema: { type: 'string' } });
        const second = requestUserInput({ message: 'second', schema: { type: 'string' } });

        expect(document.querySelectorAll('.aparte-elic-panel')).toHaveLength(1);
        expect(document.querySelector('.aparte-elic-message')?.textContent).toBe('first');

        document.querySelector<HTMLButtonElement>('.aparte-elic-skip')!.click();
        expect(await first).toEqual({ action: 'decline' });

        await vi.waitFor(() =>
            expect(document.querySelector('.aparte-elic-message')?.textContent).toBe('second'));
        document.querySelector<HTMLButtonElement>('.aparte-elic-skip')!.click();
        expect(await second).toEqual({ action: 'decline' });
    });

    it('clears the presenter on disconnect', () => {
        const host = document.createElement('div');
        const elic = document.createElement('aparte-elicitation');
        host.appendChild(elic);
        document.body.appendChild(host);
        expect(aparteGlobalConfig.getElicitationPresenter()).toBeTypeOf('function');
        elic.remove();
        expect(aparteGlobalConfig.getElicitationPresenter()).toBeUndefined();
    });
});

describe('no presenter at all — the cancel is loud, not silent', () => {
    // A docs page of ours said `<aparte-elicitation>` "installs itself — nothing to
    // register". It does register itself, but only from connectedCallback, so a
    // consumer who never puts it in the DOM gets `cancel` for every question: the
    // model reads a refusal the user was never asked for. Resolving is right (a
    // question nobody can render cannot be awaited); doing it quietly was not.
    it('warns once, and still resolves cancel rather than hanging', async () => {
        const cfg = new AparteConfig();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        expect(await cfg.requestUserInput({ message: 'a', schema: { type: 'string' } }))
            .toEqual({ action: 'cancel' });
        expect(await cfg.requestUserInput({ message: 'b', schema: { type: 'string' } }))
            .toEqual({ action: 'cancel' });

        // Once per config, not once per request: a tool loop can ask repeatedly.
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]?.[0]).toContain('aparte-elicitation');
        warn.mockRestore();
    });

    it('says nothing once a presenter is registered', async () => {
        const cfg = new AparteConfig();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        cfg.setElicitationPresenter(async () => ({ action: 'decline' }));

        expect(await cfg.requestUserInput({ message: 'a', schema: { type: 'string' } }))
            .toEqual({ action: 'decline' });
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});
