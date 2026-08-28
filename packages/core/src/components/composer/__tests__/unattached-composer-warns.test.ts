// @vitest-environment jsdom
/**
 * A composer attached to no chat, on a page with several, says so once.
 *
 * Without `target` and without a chat host above it, a composer answers to every
 * chat's lifecycle events — one chat's Stop evicts another's open question — and the
 * symptom is nowhere near its cause. A signal at the console, not a guard: nothing is
 * blocked, the developer is told.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-composer.js';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const flush = (): Promise<void> => new Promise((r) => queueMicrotask(r));

describe('an unattached composer', () => {
    it('warns once when the page has several chats and it belongs to none', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.body.innerHTML = `
            <aparte-chat id="a"></aparte-chat>
            <aparte-chat id="b"></aparte-chat>
            <aparte-composer></aparte-composer>`;
        await flush();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]![0]).toContain('target=');
    });

    it('stays quiet with a target, under a chat host, or on a one-chat page', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.body.innerHTML = `
            <aparte-chat id="a"></aparte-chat>
            <aparte-chat id="b"><aparte-composer></aparte-composer></aparte-chat>
            <aparte-composer target="a"></aparte-composer>`;
        await flush();
        document.body.innerHTML = `<aparte-chat id="only"></aparte-chat><aparte-composer></aparte-composer>`;
        await flush();
        expect(warn).not.toHaveBeenCalled();
    });
});
