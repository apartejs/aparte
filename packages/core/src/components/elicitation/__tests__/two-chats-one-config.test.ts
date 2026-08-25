import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { requestUserInput } from '../../../elicitation/index';

/*
 * Two chats, one config — the pairing nothing exercised.
 *
 * `<aparte-elicitation>` entered `<aparte-chat>`'s default composition, so two plain
 * chats on a page each register a presenter on the same global config. The registry was
 * ONE slot, which produced two failures that no test could see because the existing
 * two-chat test mounts a single presenter for both:
 *
 *   1. the second registration clobbered the first, so chat A's question opened under
 *      chat B, and answering it under B decided A's request;
 *   2. when B unmounted it cleared the slot, leaving A mounted with a working presenter
 *      that never re-registered — every later request in A rejected `no-presenter` for
 *      the life of the page, and silently, since that warning fires once per config.
 *
 * `[data-aparte-chat]` is the boundary the three non-Angular wrappers render, and one of
 * the three shapes `chatBoundaryOf` accepts. The panel opens inside the composer of the
 * chat that asked, so WHICH composer holds it is the whole assertion.
 */

interface Chat { host: HTMLElement; composer: HTMLElement; elic: HTMLElement }

function mountChat(id: string): Chat {
    const host = document.createElement('div');
    host.setAttribute('data-aparte-chat', '');
    host.id = id;
    const composer = document.createElement('aparte-composer');
    const elic = document.createElement('aparte-elicitation');
    host.append(composer, elic);
    document.body.appendChild(host);
    return { host, composer, elic };
}

const panelIn = (chat: Chat): Element | null => chat.composer.querySelector('[data-aparte-panel]');

const ask = (target: HTMLElement): Promise<unknown> =>
    requestUserInput({ message: 'Proceed?', schema: { type: 'string' }, target });

describe('two chats sharing one config', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.setElicitationPresenter(null);
        aparteGlobalConfig.reset();
    });

    it('asks in the chat that asked, not in the one that mounted last', async () => {
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');

        const pending = ask(a.composer);

        expect(panelIn(a), "the asking chat must hold the panel").not.toBeNull();
        expect(panelIn(b), "the other chat must be untouched").toBeNull();

        // Tidy: end it so the promise does not dangle into the next test.
        a.host.remove();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('routes to the SECOND chat when the second chat is the one asking', async () => {
        // The mirror of the case above. If routing were just "last registered wins" this
        // would pass while the previous test failed, so both are needed.
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');

        const pending = ask(b.composer);

        expect(panelIn(b)).not.toBeNull();
        expect(panelIn(a)).toBeNull();

        b.host.remove();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('a chat unmounting leaves the OTHER chat still able to ask', async () => {
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');

        // B goes away — an SPA closing a pane. It used to take A's ability with it.
        b.host.remove();

        const pending = ask(a.composer);

        expect(
            panelIn(a),
            'A still has its own <aparte-elicitation>; unmounting B must not silence it',
        ).not.toBeNull();

        a.host.remove();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('rejects no-presenter only once EVERY presenter is gone', async () => {
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');
        b.host.remove();
        a.host.remove();

        await expect(ask(document.body)).rejects.toMatchObject({
            name: 'AbortError',
            reason: 'no-presenter',
        });
    });

    /*
     * Stop in one chat must not tear down the other chat's open question.
     *
     * The RECEIVE side learned to identify itself by walking up to its chat host when no
     * `target` attribute is set — which is the whole of raw core, since the quick start's
     * hand-written markup sets none. The SEND side did not: `cancel()` read the attribute
     * only, so the abort carried `targetId: undefined`, and a missing id means "for
     * everyone". The scoping was inert exactly where it was needed.
     */
    it('Stop in one chat leaves the other chat\'s open question alone', async () => {
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');

        const pending = ask(b.composer);
        expect(panelIn(b)).not.toBeNull();

        // A's stop button.
        (a.composer as HTMLElement & { cancel(): void }).cancel();

        expect(
            panelIn(b),
            "A's Stop must not reach B — the question would vanish and B's turn would hang",
        ).not.toBeNull();

        // And B's own Stop still does end it.
        (b.composer as HTMLElement & { cancel(): void }).cancel();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(panelIn(b)).toBeNull();
    });

    it('withdraws only its own registration, so re-mounting is not needed', () => {
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');

        // The registry's own view: B on top while both are mounted, A after B leaves.
        expect(aparteGlobalConfig.getElicitationPresenter()).toBeTypeOf('function');
        b.host.remove();
        expect(
            aparteGlobalConfig.getElicitationPresenter(),
            'A is still mounted, so somebody can still present',
        ).toBeTypeOf('function');

        a.host.remove();
        expect(aparteGlobalConfig.getElicitationPresenter()).toBeUndefined();
    });
});
