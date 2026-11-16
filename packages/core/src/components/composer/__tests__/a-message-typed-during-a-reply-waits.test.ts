// @vitest-environment jsdom
/**
 * With `setQueueWhileStreaming(true)`, a message written while a reply streams waits for it.
 *
 * Enter puts the draft in a queue the composer shows above the field; each queued message is
 * sent, in order, when the turn it waited for ENDS WELL (`aparte-message-done`), through the
 * same `aparte-before-send` / `aparte-send` as a message sent by hand. After a Stop or an
 * error nothing is sent behind the person's back: what was queued comes back into the field.
 *
 * The norm it follows: Cursor queues follow-ups typed during a run and sends them in order once
 * it ends, each one removable; Codex queues them with Tab (Enter in its IDE extension).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../aparte-composer.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteSendEventDetail } from '../../../types/events.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';

async function mount(): Promise<AparteComposer> {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    chat.id = 'chat-a';
    chat.innerHTML = `
        <aparte-composer>
            <div class="aparte-composer-shell">
                <div class="aparte-composer-row"><textarea></textarea></div>
            </div>
        </aparte-composer>`;
    document.body.appendChild(chat);
    const el = chat.querySelector('aparte-composer') as AparteComposer;
    await vi.waitFor(() => expect(typeof el.streaming).toBe('boolean'));
    return el;
}

const lifecycle = (name: string, messageId = 'r1'): void => {
    window.dispatchEvent(new CustomEvent(name, { detail: { targetId: 'chat-a', messageId } }));
};

/** Listeners on `document` outlive a test: each test's go when it ends. */
let listening = new AbortController();
const on = (type: string, fn: (e: Event) => void): void => document.addEventListener(type, fn, { signal: listening.signal });

function sends(): { contents: string[]; before: string[] } {
    const log = { contents: [] as string[], before: [] as string[] };
    on('aparte-send', (e) => log.contents.push((e as CustomEvent<AparteSendEventDetail>).detail.content));
    on('aparte-before-send', (e) => log.before.push((e as CustomEvent<AparteSendEventDetail>).detail.content));
    return log;
}

const strip = (el: AparteComposer): HTMLElement | null => el.querySelector('.aparte-composer-queue');
const items = (el: AparteComposer): string[] =>
    [...el.querySelectorAll('.aparte-composer-queue__text')].map((n) => n.textContent ?? '');

describe('a message written while a reply streams', () => {
    beforeEach(() => { document.body.innerHTML = ''; listening = new AbortController(); aparteGlobalConfig.setQueueWhileStreaming(true); });
    afterEach(() => { document.body.innerHTML = ''; listening.abort(); aparteGlobalConfig.setQueueWhileStreaming(false); });

    it('waits in a queue above the field, and the field is free again', async () => {
        const el = await mount();
        const log = sends();
        lifecycle('aparte-message-start');
        el.setValue('and add the tests');

        el.queue();

        expect(log.contents).toEqual([]);
        expect(el.value).toBe('');
        expect(el.queued.map((q) => q.content)).toEqual(['and add the tests']);
        expect(el.getState().queued).toHaveLength(1);
        expect(items(el)).toEqual(['and add the tests']);
        // Drawn in the shell, above the row the field sits in.
        expect(strip(el)?.nextElementSibling?.classList.contains('aparte-composer-row')).toBe(true);
    });

    it('is sent when the reply ends, then the next one when the reply to it ends', async () => {
        const el = await mount();
        const log = sends();
        lifecycle('aparte-message-start', 'r1');
        el.setValue('first');
        el.queue();
        el.setValue('second');
        el.queue();

        lifecycle('aparte-message-done', 'r1');
        await vi.waitFor(() => expect(log.contents).toEqual(['first']));
        expect(log.before).toEqual(['first']);
        expect(items(el)).toEqual(['second']);

        lifecycle('aparte-message-start', 'r2');
        lifecycle('aparte-message-done', 'r2');
        await vi.waitFor(() => expect(log.contents).toEqual(['first', 'second']));
        expect(el.queued).toEqual([]);
        expect(strip(el)?.hidden ?? true).toBe(true);
    });

    it('keeps its files and goes to the chat it was written in', async () => {
        const el = await mount();
        const got: AparteSendEventDetail[] = [];
        on('aparte-send', (e) => got.push((e as CustomEvent<AparteSendEventDetail>).detail));
        const file = new File(['x'], 'a.txt', { type: 'text/plain' });
        lifecycle('aparte-message-start');
        el.addAttachments([file]);
        el.setValue('see the file');
        el.queue();
        expect(el.attachments).toEqual([]);

        lifecycle('aparte-message-done');
        await vi.waitFor(() => expect(got).toHaveLength(1));
        expect(got[0]).toMatchObject({ content: 'see the file', files: [file], targetId: 'chat-a' });
    });

    it.each(['aparte-message-aborted', 'aparte-message-error'])('after %s, comes back into the field instead of being sent', async (end) => {
        const el = await mount();
        const log = sends();
        lifecycle('aparte-message-start');
        el.setValue('one');
        el.queue();
        el.setValue('two');
        el.queue();
        el.setValue('still typing');

        lifecycle(end);
        await new Promise((r) => setTimeout(r, 10));

        expect(log.contents).toEqual([]);
        expect(el.queued).toEqual([]);
        expect(el.value).toBe('one\n\ntwo\n\nstill typing');
    });

    it('can be taken back to the field, or removed', async () => {
        const el = await mount();
        lifecycle('aparte-message-start');
        el.setValue('keep me');
        el.queue();
        el.setValue('drop me');
        el.queue();

        el.querySelectorAll<HTMLButtonElement>('.aparte-composer-queue__remove')[1]!.click();
        expect(el.queued.map((q) => q.content)).toEqual(['keep me']);

        el.querySelector<HTMLButtonElement>('.aparte-composer-queue__edit')!.click();
        expect(el.queued).toEqual([]);
        expect(el.value).toBe('keep me');
    });

    it('names its buttons after the message they act on', async () => {
        const el = await mount();
        lifecycle('aparte-message-start');
        el.setValue('a long follow-up');
        el.queue();
        for (const button of el.querySelectorAll('.aparte-composer-queue button')) {
            const described = document.getElementById(button.getAttribute('aria-describedby') ?? '');
            expect(button.getAttribute('aria-label')).toBeTruthy();
            expect(described?.textContent).toBe('a long follow-up');
        }
        expect(strip(el)?.getAttribute('aria-label')).toBe('Sent when the reply ends');
    });

    it('held by aparte-before-send when its turn comes: back into the field, not lost', async () => {
        const el = await mount();
        const log = sends();
        on('aparte-before-send', (e) => e.preventDefault());
        lifecycle('aparte-message-start');
        el.setValue('later');
        el.queue();

        lifecycle('aparte-message-done');
        await vi.waitFor(() => expect(log.before).toEqual(['later']));
        expect(log.contents).toEqual([]);
        expect(el.value).toBe('later');
        expect(el.queued).toEqual([]);
    });

    it('queue() with no reply in flight is a send', async () => {
        const el = await mount();
        const log = sends();
        el.setValue('now');
        el.queue();
        expect(log.contents).toEqual(['now']);
        expect(el.queued).toEqual([]);
    });

    it('Enter queues in the field while a reply streams; without the setting it does nothing', async () => {
        const el = await mount();
        const input = document.createElement('aparte-composer-input');
        el.querySelector('.aparte-composer-row')!.replaceChildren(input);
        await import('../aparte-composer-input.js');
        await vi.waitFor(() => expect(input.querySelector('[contenteditable]')).toBeTruthy());
        const editor = input.querySelector<HTMLElement>('[contenteditable]')!;
        lifecycle('aparte-message-start');
        el.setValue('via Enter');

        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(el.queued.map((q) => q.content)).toEqual(['via Enter']);

        aparteGlobalConfig.setQueueWhileStreaming(false);
        el.setValue('not queued');
        editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        expect(el.queued).toHaveLength(1);
        expect(el.value).toBe('not queued');
        expect(el.streaming, 'Enter never stops the reply').toBe(true);
    });
});
