/**
 * Consent belongs to the chat that asked for it.
 *
 * `_awaitToolDecision` listened on `document` and accepted any
 * `aparte-tool-decision` whose `detail.toolCallId` matched the awaited id. That id
 * is the tool-call id the MODEL chose, and the built-in Approve button dispatches
 * with `bubbles: true, composed: true` — so on a page with two chats, a click aimed
 * at one tool could satisfy the gate awaiting a different tool in a different
 * conversation. The consented action and the executed action came apart, which is
 * the whole failure mode an approval gate exists to prevent, and the handler behind
 * it is arbitrary consumer code.
 *
 * The request half of the same handshake was hardened with `targetId` for exactly
 * this hazard. This is its sibling.
 *
 * The check is DOM containment, not a string: a model can choose an id, it cannot
 * choose where in the tree a click happened.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';
import type { AparteToolDecisionDetail } from '../../types/tools.js';

/** The private awaiter, reached the way the tool path reaches it. */
type Awaiter = (id: string, signal: AbortSignal, target?: HTMLElement) =>
    Promise<{ approved: boolean; payload?: unknown }>;

describe('tool approval is scoped to the chat that asked', () => {
    let chatA: HTMLElement;
    let client: AparteClient;

    beforeEach(() => {
        // Real element names, not bare divs: the built-in dispatch finds its host by
        // `closest('[data-aparte-host], aparte-chat, aparte-chat-viewport')`, so a
        // fixture of plain divs would test a shape no app produces.
        document.body.innerHTML = `
            <aparte-chat-viewport id="chat-a"><div class="segment" id="tool-in-a"><button id="approve-a"></button></div></aparte-chat-viewport>
            <aparte-chat-viewport id="chat-b"><div class="segment" id="tool-in-b"><button id="approve-b"></button></div></aparte-chat-viewport>`;
        chatA = document.getElementById('chat-a')!;
        client = new AparteClient({ autoRegister: false });
    });

    afterEach(() => {
        document.body.innerHTML = '';
        aparteGlobalConfig.reset();
    });

    /** Both chats' tools carry the SAME id, because the model chose it. */
    const SHARED_ID = 'call_1';

    const awaitDecision = (target: HTMLElement, signal: AbortSignal) =>
        (client as unknown as { _awaitToolDecision: Awaiter })
            ._awaitToolDecision(SHARED_ID, signal, target);

    it('a click in the OTHER chat does not approve this one', async () => {
        const controller = new AbortController();
        let settled: { approved: boolean } | null = null;
        void awaitDecision(chatA, controller.signal).then((r) => { settled = r; });

        // The user approves the tool in chat B. Same toolCallId — the model picked it.
        document.getElementById('approve-b')!.dispatchEvent(new CustomEvent('aparte-tool-decision', {
            bubbles: true, composed: true, detail: { toolCallId: SHARED_ID, approved: true },
        }));
        await new Promise((r) => setTimeout(r, 0));

        expect(settled, 'chat A must still be waiting for its own human').toBeNull();
        controller.abort();
    });

    it('a click in THIS chat approves it', async () => {
        const controller = new AbortController();
        const pending = awaitDecision(chatA, controller.signal);

        document.getElementById('approve-a')!.dispatchEvent(new CustomEvent('aparte-tool-decision', {
            bubbles: true, composed: true, detail: { toolCallId: SHARED_ID, approved: true },
        }));

        await expect(pending).resolves.toEqual({ approved: true, payload: undefined });
    });

    it('a programmatic dispatch with no node inside the chat is still honoured', async () => {
        const controller = new AbortController();
        const pending = awaitDecision(chatA, controller.signal);

        // A host answering on the user's behalf is a documented path, and it has no
        // element inside the chat to dispatch from.
        document.dispatchEvent(new CustomEvent('aparte-tool-decision', {
            detail: { toolCallId: SHARED_ID, approved: false },
        }));

        await expect(pending).resolves.toEqual({ approved: false, payload: undefined });
    });

    it('the built-in buttons stamp the host id for a consumer own listener', async () => {
        const { toolCallRenderer } = await import('../../renderers/segments/tool-call.js');
        const el = document.createElement('div');
        chatA.appendChild(el);
        el.innerHTML = '<button data-tool-decision="approve"></button>';

        // Typed, not `Record<string, unknown>`: `targetId` is declared on the detail
        // now, so reading it through a cast would no longer prove anything — the point
        // of declaring it is that this line compiles without one.
        const seen: AparteToolDecisionDetail[] = [];
        document.addEventListener('aparte-tool-decision', (e) => seen.push((e as CustomEvent<AparteToolDecisionDetail>).detail));

        toolCallRenderer.setup?.(el, {
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: SHARED_ID, name: 'danger', input: {} },
        } as never);
        el.querySelector('button')!.click();

        await vi.waitFor(() => expect(seen.length).toBe(1));
        expect(seen[0]?.targetId, 'the host id travels with the decision').toBe('chat-a');
    });
});
