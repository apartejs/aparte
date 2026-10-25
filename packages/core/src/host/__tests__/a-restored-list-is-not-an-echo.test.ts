// @vitest-environment jsdom
/**
 * What a wrapper may skip when the parent hands a list back.
 *
 * Under a two-way binding every report comes back through the parent, sometimes late — an
 * EARLIER report after the host's next write — and applying it rolls back what the host did
 * since without reporting. But a parent that keeps a list it was given and assigns it back
 * later (a reopened conversation, an undo) is not echoing anything: remembering every list ever
 * reported swallowed that assignment, in all four wrappers.
 */
import { describe, it, expect } from 'vitest';
import { AparteChatHost, type AparteChatHostBinding } from '../aparte-chat-host.js';
import type { AparteMessage } from '../../types/index.js';

const msg = (id: string): AparteMessage => ({ id, role: 'user', content: id, timestamp: 1 });

function hostWithReports() {
    let messages: AparteMessage[] = [msg('u1')];
    const reported: AparteMessage[][] = [];
    const binding: AparteChatHostBinding = {
        hostId: 'h', host: document.createElement('div'), viewport: null,
        getMessages: () => messages,
        setMessages: (m) => { messages = m; },
        onMessagesChange: (m) => { reported.push(m); },
        afterRender: (cb) => cb(),
    };
    return { host: new AparteChatHost(binding), reported };
}

describe('AparteChatHost.takeEcho', () => {
    it('a report coming back is an echo, late or not, and only once', () => {
        const { host, reported } = hostWithReports();
        host.updateMessage('u1', { content: 'one' });
        host.updateMessage('u1', { content: 'two' });
        const [l1, l2] = reported;
        // The earlier one lands after the later one was written: still the host's own.
        expect(host.takeEcho(l1!)).toBe(true);
        expect(host.takeEcho(l2!)).toBe(true);
        // Handed back again afterwards, it is the parent's word.
        expect(host.takeEcho(l1!)).toBe(false);
    });

    it('a list the parent restores after a list of its own is applied', () => {
        const { host, reported } = hostWithReports();
        host.updateMessage('u1', { content: 'one' });
        const saved = reported[0]!;
        expect(host.takeEcho(saved)).toBe(true);
        // A new conversation, then the old one reopened.
        expect(host.takeEcho([])).toBe(false);
        host.updateMessage('u1', { content: 'two' });
        expect(host.takeEcho(reported[1]!)).toBe(true);
        expect(host.takeEcho(saved)).toBe(false);
    });

    it('the latest report taken takes every older one with it', () => {
        const { host, reported } = hostWithReports();
        host.updateMessage('u1', { content: 'one' });
        host.updateMessage('u1', { content: 'two' });
        expect(host.takeEcho(reported[1]!)).toBe(true);
        expect(host.takeEcho(reported[0]!)).toBe(false);
    });
});
