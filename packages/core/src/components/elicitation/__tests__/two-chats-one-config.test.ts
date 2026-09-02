import { describe, it, expect, afterEach } from 'vitest';
import '../../composer/aparte-composer.js';
import '../aparte-elicitation.js';
import { aparteGlobalConfig } from '../../../config/aparte-config';
import { AparteConfig } from '../../../config/aparte-config';
import { AparteClient } from '../../../client/aparte-client';
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

    /*
     * The mirror of the Stop case, on the other half of the same channel.
     *
     * Stop is dispatched by the composer, which knows which chat it is in. The
     * TURN's own events — `aparte-message-start` / `-done` / `-error` /
     * `-aborted` — are dispatched by `AparteClient` on the element it renders
     * into, and that element is a viewport: the `<aparte-chat>` shell carries the
     * id, its `.viewport` does not. So they went out with `targetId: undefined`,
     * which the receive side reads as "for every chat", and a turn finishing in B
     * evicted A's open question — the panel vanished under the user's cursor while
     * A's tool call was still waiting for the answer.
     */
    it("a turn finishing in one chat leaves the other chat's open question alone", async () => {
        const a = mountChat('chat-a');
        const b = mountChat('chat-b');

        const pending = ask(a.composer);
        expect(panelIn(a)).not.toBeNull();

        // B's render target: a viewport inside B's host, with no id of its own —
        // which is what every chat shape in the repo actually hands the client.
        const viewport = document.createElement('div');
        Object.assign(viewport, {
            appendMessage: () => {}, updateMessage: () => {}, addSegment: () => {},
            updateSegment: () => {}, updateLastMessage: () => {}, typeName: () => {},
            setUsage: () => {}, getMessages: () => [],
        });
        b.host.appendChild(viewport);

        const cfg = new AparteConfig();
        cfg.registerAIProvider({
            id: 'mock', getMetadata: () => ({ id: 'mock', name: 'M' }),
            getModels: () => [{ id: 'm', name: 'M' }], chat: async () => '',
        } as never);
        cfg.setModelConfig({ defaultProvider: 'mock', defaultModel: 'm' });
        cfg.setKeyProvider(() => 'k');
        cfg.setTransport({
            chat: () => new ReadableStream({
                start(c) { c.enqueue({ type: 'done' }); c.close(); },
            }),
        } as never);

        const client = new AparteClient({ config: cfg, autoRegister: false, targetResolver: () => viewport as never });
        await (client as unknown as { _handleSend: (e: Event) => Promise<void> })._handleSend(
            new CustomEvent('aparte-send', { detail: { content: 'go' } }),
        );

        expect(
            panelIn(a),
            "B's turn must not reach A — the question would vanish while A's tool call still waits",
        ).not.toBeNull();

        a.host.remove();
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
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
