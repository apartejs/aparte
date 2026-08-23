import { describe, it, expect, vi, afterEach } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import { AparteConfig } from '../../config/index.js';

/**
 * `aparte-compact` was the one window handler of five without a scope guard.
 *
 * In the two-client layout the JSDoc itself documents
 * (`scopeToTargetId: 'chat-left'` / `'chat-right'`), a single compact event made
 * BOTH clients run: two paid summarisation calls, both against whichever chat
 * the DOM scan happened to find first, and a global `aparte-reset` that wiped
 * both viewports — destroying the conversation nobody asked to compact.
 */
function makeClient(scope: string) {
    const cfg = new AparteConfig();
    const client = new AparteClient({ config: cfg, autoRegister: false, scopeToTargetId: scope });
    const compact = vi.fn(async () => {});
    (client as unknown as { compact: unknown }).compact = compact;
    client.start();
    return { client, compact };
}

const clients: AparteClient[] = [];
afterEach(() => { for (const c of clients.splice(0)) c.stop(); });

function pair() {
    const left = makeClient('chat-left');
    const right = makeClient('chat-right');
    clients.push(left.client, right.client);
    return { left, right };
}

describe('AparteClient — aparte-compact and instance scope', () => {
    it('compacts only the chat the event names', () => {
        const { left, right } = pair();

        window.dispatchEvent(new CustomEvent('aparte-compact', { detail: { targetId: 'chat-left' } }));

        expect(left.compact, 'the named chat should compact').toHaveBeenCalledTimes(1);
        expect(right.compact, 'the other chat compacted too — two paid calls, and its history was replaced')
            .not.toHaveBeenCalled();
    });

    it('ignores an untargeted compact when the client is scoped', () => {
        const { left, right } = pair();

        window.dispatchEvent(new CustomEvent('aparte-compact', { detail: {} }));

        expect(left.compact).not.toHaveBeenCalled();
        expect(right.compact).not.toHaveBeenCalled();
    });

    it('still compacts an unscoped client', () => {
        const cfg = new AparteConfig();
        const client = new AparteClient({ config: cfg, autoRegister: false });
        const compact = vi.fn(async () => {});
        (client as unknown as { compact: unknown }).compact = compact;
        client.start();
        clients.push(client);

        window.dispatchEvent(new CustomEvent('aparte-compact'));
        expect(compact).toHaveBeenCalledTimes(1);
    });
});
