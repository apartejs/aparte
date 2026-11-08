// @vitest-environment jsdom
/**
 * The small options of 1.1, each off by default: why a reply got a thumbs-down, a caret where
 * the words arrive, the date above each day, a draft kept per conversation, upload progress.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../components/bubble/aparte-chat-bubble.js';
import '../components/composer/aparte-composer.js';
import '../components/composer/aparte-composer-input.js';
import '../components/composer/aparte-composer-attachments.js';
import '../components/viewport/aparte-chat-viewport.js';
import { aparteGlobalConfig } from '../config/index.js';
import { AparteConversationManager } from '../conversations/conversation-manager.js';
import { AparteConversationController, type AparteChatBinding } from '../conversations/conversation-controller.js';
import type { AparteComposer } from '../components/composer/aparte-composer.js';
import type { AparteChatViewport } from '../components/viewport/aparte-chat-viewport.js';
import type { AparteConversation, AparteStorageAdapter } from '../conversations/types.js';

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the reason for a thumbs-down', () => {
    function bubble(): HTMLElement {
        aparteGlobalConfig.setBubbleActions({ feedback: true, assistant: ['thumbDown', 'thumbUp'] });
        const el = document.createElement('aparte-chat-bubble');
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'a1');
        document.body.appendChild(el);
        (el as unknown as { setContent(c: string): void }).setContent('hello');
        return el;
    }
    const down = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-action="feedback-negative"]')!.click();

    it('is not asked unless the app listed reasons', () => {
        const el = bubble();
        down(el);
        expect(el.querySelector('.aparte-feedback-reasons')).toBeNull();
    });

    it('is asked after the thumb, which has already been reported', () => {
        const el = bubble();
        aparteGlobalConfig.setBubbleActions({ feedbackReasons: ['Wrong', 'Too long'] });
        const heard: string[] = [];
        el.addEventListener('aparte-feedback', () => heard.push('thumb'));
        down(el);
        expect(heard).toEqual(['thumb']);
        const panel = el.querySelector('.aparte-feedback-reasons')!;
        expect([...panel.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Wrong', 'Too long', 'Not now']);
    });

    it('says the reason, once, and goes', () => {
        const el = bubble();
        aparteGlobalConfig.setBubbleActions({ feedbackReasons: ['Wrong'] });
        const reasons: unknown[] = [];
        el.addEventListener('aparte-feedback-reason', (e) => reasons.push((e as CustomEvent).detail));
        down(el);
        el.querySelector<HTMLElement>('.aparte-feedback-reasons button')!.click();
        expect(reasons).toEqual([{ messageId: 'a1', reason: 'Wrong' }]);
        expect(el.querySelector('.aparte-feedback-reasons')).toBeNull();
    });

    it('can be dismissed, and says nothing then', () => {
        const el = bubble();
        aparteGlobalConfig.setBubbleActions({ feedbackReasons: ['Wrong'] });
        const reasons = vi.fn();
        el.addEventListener('aparte-feedback-reason', reasons);
        down(el);
        [...el.querySelectorAll<HTMLElement>('.aparte-feedback-reasons button')].pop()!.click();
        expect(el.querySelector('.aparte-feedback-reasons')).toBeNull();
        expect(reasons).not.toHaveBeenCalled();
    });

    it('opens one row, however many presses', () => {
        const el = bubble();
        aparteGlobalConfig.setBubbleActions({ feedbackReasons: ['Wrong'] });
        down(el);
        down(el);
        expect(el.querySelectorAll('.aparte-feedback-reasons')).toHaveLength(1);
    });
});

describe('the streaming caret', () => {
    const bubble = (): HTMLElement => {
        const el = document.createElement('aparte-chat-bubble');
        el.setAttribute('data-role', 'assistant');
        document.body.appendChild(el);
        return el;
    };

    it('is off by default', () => {
        const el = bubble();
        el.setAttribute('streaming', '');
        expect(el.querySelector('.aparte-message')!.hasAttribute('data-caret')).toBe(false);
    });

    it('follows the stream when asked for', () => {
        aparteGlobalConfig.setStreamingCaret(true);
        const el = bubble();
        el.setAttribute('streaming', '');
        expect(el.querySelector('.aparte-message')!.hasAttribute('data-caret')).toBe(true);
        el.removeAttribute('streaming');
        expect(el.querySelector('.aparte-message')!.hasAttribute('data-caret')).toBe(false);
    });
});

describe('date separators', () => {
    const DAY = 86_400_000;
    const noon = new Date(2026, 5, 15, 12).getTime();

    function viewport(...stamps: Array<number | undefined>): AparteChatViewport {
        vi.useFakeTimers({ now: noon, toFake: ['Date'] });
        const el = document.createElement('aparte-chat-viewport') as AparteChatViewport;
        document.body.appendChild(el);
        el.setMessages(stamps.map((timestamp, i) => ({ id: `m${i}`, role: i % 2 ? 'assistant' : 'user', content: 'x', timestamp })) as never);
        return el;
    }
    const dates = (el: HTMLElement) => [...el.querySelectorAll('aparte-chat-bubble')].map((b) => b.getAttribute('data-date'));

    afterEach(() => vi.useRealTimers());

    const settled = async (el: HTMLElement) => {
        await Promise.resolve();
        return dates(el);
    };

    it('are off by default', async () => {
        expect(await settled(viewport(noon, noon))).toEqual([null, null]);
    });

    it('go on the first message of each day, in words for the nearest two', async () => {
        aparteGlobalConfig.setDateSeparators(true);
        const el = viewport(noon - 3 * DAY, noon - 3 * DAY, noon - DAY, noon, noon);
        await Promise.resolve();
        expect(dates(el)).toEqual([expect.stringContaining('2026'), null, 'Yesterday', 'Today', null]);
    });

    it('step over a message that has no date', async () => {
        aparteGlobalConfig.setDateSeparators(true);
        expect(await settled(viewport(noon, undefined, noon))).toEqual(['Today', null, null]);
    });
});

describe('a draft kept per conversation', () => {
    function setup(keepDrafts: boolean, adapterMore: Partial<AparteStorageAdapter> = {}) {
        const conversations: AparteConversation[] = ['a', 'b'].map((id) => ({ id, title: id, createdAt: 1, updatedAt: 1, messages: [] })) as never;
        const adapter = { loadAll: async () => conversations, save: async () => {}, delete: async () => {}, ...adapterMore } as AparteStorageAdapter;
        const manager = new AparteConversationManager(adapter);
        const host = document.createElement('div');
        host.id = 'chat';
        host.innerHTML = '<aparte-composer><aparte-composer-input></aparte-composer-input></aparte-composer>';
        document.body.appendChild(host);
        const binding: AparteChatBinding = {
            hostId: 'chat', host, setMessages: () => {}, appendMessage: () => {}, getMessages: () => [], clearMessages: () => {},
        };
        const controller = new AparteConversationController(binding, { manager, keepDrafts });
        controller.bind();
        return { controller, manager, composer: host.querySelector('aparte-composer') as AparteComposer };
    }

    it('gives back what was typed on return', async () => {
        const { controller, manager, composer } = setup(true);
        await manager.init();
        await controller.setConversationId('a');
        composer.setValue('half a thought');
        await controller.setConversationId('b');
        expect(composer.value).toBe('');
        await controller.setConversationId('a');
        expect(composer.value).toBe('half a thought');
    });

    it('is forgotten once sent', async () => {
        const { controller, manager, composer } = setup(true);
        await manager.init();
        await controller.setConversationId('a');
        composer.setValue('send me');
        composer.submit();
        await controller.setConversationId('b');
        await controller.setConversationId('a');
        expect(composer.value).toBe('');
    });

    it('stays where it is unless asked for', async () => {
        const { controller, manager, composer } = setup(false);
        await manager.init();
        await controller.setConversationId('a');
        composer.setValue('left alone');
        await controller.setConversationId('b');
        expect(composer.value).toBe('left alone');
    });

    it('goes through the adapter when it can', async () => {
        const saveDraft = vi.fn(async () => {});
        const loadDraft = vi.fn(async (id: string) => (id === 'b' ? 'from the store' : undefined));
        const { controller, manager, composer } = setup(true, { saveDraft, loadDraft });
        await manager.init();
        await controller.setConversationId('a');
        composer.setValue('typed');
        await controller.setConversationId('b');
        expect(saveDraft).toHaveBeenCalledWith('a', 'typed');
        expect(composer.value).toBe('from the store');
    });
});

describe('upload progress', () => {
    function composer(): { el: AparteComposer; file: File } {
        URL.createObjectURL = () => 'blob:x';
        URL.revokeObjectURL = () => {};
        const el = document.createElement('aparte-composer') as AparteComposer;
        el.innerHTML = '<aparte-composer-attachments></aparte-composer-attachments><aparte-composer-input></aparte-composer-input>';
        document.body.appendChild(el);
        const file = new File(['x'], 'a.txt', { type: 'text/plain' });
        el.addAttachments([file]);
        return { el, file };
    }
    const bar = (el: HTMLElement) => el.querySelector<HTMLElement>('.aparte-thumb .aparte-progress');

    it('draws a bar, with a value when it has one', () => {
        const { el, file } = composer();
        el.setAttachmentState(file, { status: 'uploading', progress: 40 });
        expect(bar(el)!.getAttribute('aria-valuenow')).toBe('40');
        expect(bar(el)!.getAttribute('aria-label')).toBe('a.txt');
        expect(bar(el)!.style.getPropertyValue('--aparte-progress-value')).toBe('40');
        el.setAttachmentState(file, { status: 'uploading' });
        expect(bar(el)!.classList.contains('aparte-progress--indeterminate')).toBe(true);
    });

    it('holds the send while a file is on its way', () => {
        const { el, file } = composer();
        const sends = vi.fn();
        el.addEventListener('aparte-send', sends);
        el.setAttachmentState(file, { status: 'uploading', progress: 10 });
        expect(el.hasAttribute('data-uploading')).toBe(true);
        el.submit();
        expect(sends).not.toHaveBeenCalled();
        el.setAttachmentState(file, { status: 'done' });
        expect(bar(el)).toBeNull();
        expect(el.hasAttribute('data-uploading')).toBe(false);
        el.submit();
        expect(sends).toHaveBeenCalledOnce();
    });

    it('marks a failure, and removing the file lifts the hold', () => {
        const { el, file } = composer();
        el.setAttachmentState(file, { status: 'error' });
        expect(el.querySelector('.aparte-thumb')!.hasAttribute('data-failed')).toBe(true);
        el.setAttachmentState(file, { status: 'uploading' });
        el.removeAttachment(file);
        expect(el.hasAttribute('data-uploading')).toBe(false);
    });

    it('survives a redraw of the tiles', () => {
        const { el, file } = composer();
        el.setAttachmentState(file, { status: 'uploading', progress: 70 });
        el.addAttachments([new File(['y'], 'b.txt', { type: 'text/plain' })]);
        expect(bar(el)!.getAttribute('aria-valuenow')).toBe('70');
    });
});
