/**
 * A runner that sends the turn elsewhere receives the files the person picked, as files.
 *
 * The client inlines images and text files into the request and drops the rest (a PDF, a
 * spreadsheet) — right for a model, wrong for a runner whose backend takes uploads
 * itself: n8n's Chat Trigger reads `files` from a form, PDFs included. So a send hands
 * the picked files to the runner beside the request, untouched; `rawFileInject: 'none'`
 * keeps them out of the request's text, so the backend does not get them twice.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { AparteClient } from '../aparte-client.js';
import type { AparteStreamRunOptions } from '../stream-adapter.js';
import '../../components/viewport/aparte-chat-viewport.js';

function setup(options: { rawFileInject?: 'none' | 'all' } = {}) {
    const host = document.createElement('div');
    host.id = 'chat';
    host.innerHTML = '<aparte-chat-viewport></aparte-chat-viewport>';
    document.body.appendChild(host);
    const seen: AparteStreamRunOptions[] = [];
    const client = new AparteClient({
        autoRegister: false,
        ...options,
        streamRunner: async (opts) => {
            seen.push(opts);
            opts.emitter({ type: 'run-start' });
            opts.emitter({ type: 'text-delta', delta: 'ok' });
            opts.emitter({ type: 'run-done' });
            return undefined;
        },
    });
    client.start();
    const send = (detail: Record<string, unknown>) => host.dispatchEvent(new CustomEvent('aparte-send', {
        detail: { timestamp: Date.now(), targetId: 'chat', ...detail }, bubbles: true, composed: true,
    }));
    return { client, seen, send };
}

const pdf = new File(['%PDF-1.4'], 'menu.pdf', { type: 'application/pdf' });
const txt = new File(['- 2 baguettes'], 'order.txt', { type: 'text/plain' });

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('a runner receives the files of the send', () => {
    it('hands the picked files over as they were, PDFs included, and inlines none of them with rawFileInject none', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        // The user bubble shows the chips by object URL, which jsdom does not implement.
        vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:chip', revokeObjectURL: () => undefined }));
        const { client, seen, send } = setup({ rawFileInject: 'none' });
        send({ content: 'Can you confirm?', files: [pdf, txt] });
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect(seen[0]!.files).toEqual([pdf, txt]);
        expect(seen[0]!.baseRequest.messages.at(-1)).toEqual({ role: 'user', content: 'Can you confirm?' });
        const dropped = warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('not sent to the model'));
        expect(dropped, 'no file is said to be dropped: the runner carries them').toEqual([]);
        client.stop();
    });

    it('leaves `files` out of a send that carries none', async () => {
        const { client, seen, send } = setup();
        send({ content: 'hello' });
        await vi.waitFor(() => expect(seen).toHaveLength(1));
        expect('files' in seen[0]!).toBe(false);
        client.stop();
    });
});
