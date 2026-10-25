// @vitest-environment jsdom
/**
 * The separator a bubble draws above the first message the model still reads verbatim.
 *
 * A compaction writes a checkpoint (`contextSummary`) onto a message and deletes nothing, so
 * what the reader sees is the whole conversation with one line across it: how many messages
 * were summarised for the model, a way to read the summary and a way to take it back. These
 * pin the line's three states, its accessible names, that it sits OUTSIDE the message frame
 * (so a frame redraw cannot wipe it), and that a message an older compaction wrote is
 * replaced by it.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import { populateBubbleFromMessage, type SyncableBubble } from '../bubble-sync.js';
import { aparteGlobalConfig, AparteConfig } from '../../../config/index.js';
import { attachConfig } from '../../../config/config-context.js';
import type { AparteContextSummary, AparteMessage } from '../../../types/index.js';

type Bubble = HTMLElement & SyncableBubble & {
    setContextSummary(summary: AparteContextSummary | null | undefined, options?: { legacy?: boolean }): void;
    setContent(content: string): void;
    updateMessage(updates: Partial<AparteMessage>): void;
};

const summary: AparteContextSummary = { summary: 'The user is planning a trip.\n\n**Lisbon**, in May.', count: 12, createdAt: 10 };

function mount(attrs: Record<string, string> = {}, parent: HTMLElement = document.body): Bubble {
    const bubble = document.createElement('aparte-chat-bubble') as Bubble;
    bubble.setAttribute('message-id', 'u2');
    bubble.setAttribute('data-role', 'user');
    for (const [name, value] of Object.entries(attrs)) bubble.setAttribute(name, value);
    parent.appendChild(bubble);
    return bubble;
}

const separator = (b: HTMLElement): HTMLElement | null => b.querySelector<HTMLElement>(':scope > .aparte-checkpoint');
const action = (b: HTMLElement, name: string): HTMLButtonElement | null =>
    b.querySelector<HTMLButtonElement>(`[data-checkpoint-action="${name}"]`);

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('the separator above a checkpoint', () => {
    it('says how many messages were summarised, in a labelled group outside the message frame', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);

        const sep = separator(bubble)!;
        expect(sep, 'drawn').not.toBeNull();
        expect(sep.getAttribute('role')).toBe('group');
        expect(sep.getAttribute('aria-label')).toBe('Context summary');
        expect(sep.textContent).toContain('12 messages summarised for the model');
        expect(sep.closest('.aparte-message'), 'not part of the message frame').toBeNull();
        expect(sep.nextElementSibling, 'above the message').toBe(bubble.querySelector('.aparte-message'));
        expect(bubble.querySelector('.aparte-message')!.hasAttribute('data-superseded'), 'the message itself is still drawn').toBe(false);
        expect(action(bubble, 'toggle')!.textContent).toBe('Show summary');
        expect(action(bubble, 'restore')!.textContent).toBe('Restore');
    });

    it('says "1 message" for one, and draws nothing without a checkpoint', () => {
        const bubble = mount();
        expect(separator(bubble)).toBeNull();
        bubble.setContextSummary({ ...summary, count: 1 });
        expect(separator(bubble)!.textContent).toContain('1 message summarised for the model');
        bubble.setContextSummary(undefined);
        expect(separator(bubble), 'removed with its checkpoint').toBeNull();
    });

    it('is drawn from a bubble that got its checkpoint before it was connected', () => {
        const bubble = document.createElement('aparte-chat-bubble') as Bubble;
        bubble.setAttribute('message-id', 'u2');
        bubble.setContextSummary(summary);
        document.body.appendChild(bubble);
        expect(separator(bubble)).not.toBeNull();
    });

    it('is drawn by the sync helper every wrapper calls, and taken off by it when the message has none', () => {
        const bubble = mount();
        const message = { id: 'u2', role: 'user', content: 'Hi', timestamp: 1, contextSummary: summary } as AparteMessage;
        populateBubbleFromMessage(bubble, message);
        expect(separator(bubble)).not.toBeNull();

        populateBubbleFromMessage(bubble, { ...message, contextSummary: undefined });
        expect(separator(bubble), 'a bubble reused for a message with none').toBeNull();
    });

    it('is drawn from a message update that carries a checkpoint, and removed by one that clears it', () => {
        const bubble = mount();
        bubble.updateMessage({ contextSummary: summary });
        expect(separator(bubble)).not.toBeNull();
        bubble.updateMessage({ status: 'completed' });
        expect(separator(bubble), 'an unrelated update leaves it').not.toBeNull();
        bubble.updateMessage({ contextSummary: undefined });
        expect(separator(bubble)).toBeNull();
    });

    it('leaves the element in place when a re-sync changes nothing, so a focused button keeps focus', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);
        const before = separator(bubble)!;
        action(bubble, 'toggle')!.focus();
        bubble.setContextSummary({ ...summary });
        expect(separator(bubble)).toBe(before);
        expect(document.activeElement).toBe(action(bubble, 'toggle'));
    });
});

describe('the summary disclosure', () => {
    it('is a button with aria-expanded and aria-controls, and reveals the summary as text without a renderer', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);
        const toggle = action(bubble, 'toggle')!;
        const panel = bubble.querySelector<HTMLElement>('.aparte-checkpoint__summary')!;
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
        expect(panel.hidden).toBe(true);

        toggle.click();

        const opened = action(bubble, 'toggle')!;
        expect(opened.getAttribute('aria-expanded')).toBe('true');
        expect(opened.textContent).toBe('Hide summary');
        expect(opened.getAttribute('aria-controls')).toBe(bubble.querySelector('.aparte-checkpoint__summary')!.id);
        const shown = bubble.querySelector<HTMLElement>('.aparte-checkpoint__summary')!;
        expect(shown.hidden).toBe(false);
        expect(shown.textContent).toContain('The user is planning a trip.');
        expect(shown.querySelector('strong'), 'no renderer, no Markdown').toBeNull();
        expect(document.activeElement, 'focus stays on the button after the rebuild').toBe(opened);

        opened.click();
        expect(action(bubble, 'toggle')!.getAttribute('aria-expanded')).toBe('false');
        expect(bubble.querySelector<HTMLElement>('.aparte-checkpoint__summary')!.hidden).toBe(true);
    });

    it('draws the summary through the configured Markdown renderer', () => {
        aparteGlobalConfig.setMarkdownProvider((raw: string) => raw.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'));
        const bubble = mount();
        bubble.setContextSummary(summary);
        action(bubble, 'toggle')!.click();
        expect(bubble.querySelector('.aparte-checkpoint__summary strong')!.textContent).toBe('Lisbon');
    });

    it('keeps its open state through a frame redraw', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const bubble = mount({}, host);
        bubble.setContextSummary(summary);
        action(bubble, 'toggle')!.click();

        const own = new AparteConfig();
        own.setBubbleShellRenderer(() => '<div class="aparte-message my-frame"><div class="aparte-message-content"><div class="aparte-segments"></div><div class="aparte-content"></div></div></div>');
        attachConfig(host, own);
        await Promise.resolve();

        expect(bubble.querySelector('.my-frame'), 'the frame was drawn again').not.toBeNull();
        expect(separator(bubble), 'and the separator with it').not.toBeNull();
        expect(separator(bubble)!.closest('.aparte-message')).toBeNull();
        expect(action(bubble, 'toggle')!.getAttribute('aria-expanded')).toBe('true');
        expect(bubble.querySelector<HTMLElement>('.aparte-checkpoint__summary')!.textContent).toContain('Lisbon');
    });
});

describe('the separator survives the bubble being drawn again', () => {
    it('after a custom shell replaces the frame, and after another one replaces that', async () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const bubble = mount({}, host);
        bubble.setContextSummary(summary);

        const own = new AparteConfig();
        own.setBubbleShellRenderer(() => '<div class="aparte-message my-frame"><div class="aparte-message-content"><div class="aparte-segments"></div><div class="aparte-content"></div></div></div>');
        attachConfig(host, own);
        await Promise.resolve();
        expect(separator(bubble)!.textContent).toContain('12 messages');

        const other = new AparteConfig();
        other.setBubbleShellRenderer(() => '<div class="aparte-message other-frame"><div class="aparte-message-content"><div class="aparte-segments"></div><div class="aparte-content"></div></div></div>');
        attachConfig(host, other);
        await Promise.resolve();
        expect(bubble.querySelector('.my-frame')).toBeNull();
        expect(bubble.querySelector('.other-frame'), 'a second frame').not.toBeNull();
        expect(separator(bubble), 'still there').not.toBeNull();
        expect(bubble.querySelectorAll('.aparte-checkpoint')).toHaveLength(1);
    });
});

describe('Restore', () => {
    it('asks before it acts, and Cancel puts the two actions back', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);
        const done = vi.fn();
        window.addEventListener('aparte-compact-done', done);

        action(bubble, 'restore')!.click();

        const sep = separator(bubble)!;
        expect(sep.textContent).toContain('Send the original messages to the model again?');
        expect(action(bubble, 'restore-confirm')!.textContent).toBe('Restore');
        expect(action(bubble, 'restore-cancel')!.textContent).toBe('Cancel');
        expect(action(bubble, 'restore'), 'the question replaces the actions').toBeNull();
        expect(document.activeElement, 'focus moves to the answer').toBe(action(bubble, 'restore-confirm'));
        expect(done, 'nothing was restored by asking').not.toHaveBeenCalled();

        action(bubble, 'restore-cancel')!.click();
        expect(action(bubble, 'restore')).not.toBeNull();
        expect(action(bubble, 'restore-confirm')).toBeNull();
        expect(document.activeElement, 'and back on Restore').toBe(action(bubble, 'restore'));
        window.removeEventListener('aparte-compact-done', done);
    });

    it('confirming hands the keyboard to the message, not to the page, when the separator goes', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);
        action(bubble, 'restore')!.click();
        expect(document.activeElement).toBe(action(bubble, 'restore-confirm'));

        action(bubble, 'restore-confirm')!.click();

        expect(separator(bubble), 'the separator went').toBeNull();
        const frame = bubble.querySelector<HTMLElement>('.aparte-message')!;
        expect(document.activeElement, 'and the focus stayed in the transcript').toBe(frame);
        expect(frame.getAttribute('tabindex')).toBe('-1');
    });

    it('leaves the focus alone when the separator goes while nothing in it had it', () => {
        const bubble = mount();
        const other = document.createElement('button');
        document.body.appendChild(other);
        other.focus();
        bubble.setContextSummary(summary);
        bubble.setContextSummary(null);
        expect(document.activeElement).toBe(other);
    });

    it('is withdrawn by Escape', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);
        action(bubble, 'restore')!.click();
        action(bubble, 'restore-confirm')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(action(bubble, 'restore-confirm')).toBeNull();
        expect(action(bubble, 'restore')).not.toBeNull();
    });
});

describe('a compaction in progress, and one that failed', () => {
    it('says "Summarising the context…" under the shimmer recipe while data-checkpoint is pending', () => {
        const bubble = mount();
        bubble.setAttribute('data-checkpoint', 'pending');

        const sep = separator(bubble)!;
        expect(sep.getAttribute('data-state')).toBe('pending');
        const text = sep.querySelector('.aparte-checkpoint__text')!;
        expect(text.textContent).toBe('Summarising the context…');
        expect(text.classList.contains('aparte-shimmer')).toBe(true);
        expect(text.getAttribute('role')).toBe('status');
        expect(sep.querySelector('button'), 'nothing to press while it runs').toBeNull();

        bubble.removeAttribute('data-checkpoint');
        expect(separator(bubble), 'gone with the state').toBeNull();
    });

    it('says why it failed, and offers Retry which asks for a compaction of this chat', () => {
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        chat.id = 'c1';
        document.body.appendChild(chat);
        const bubble = mount({}, chat);
        const asked = vi.fn();
        window.addEventListener('aparte-compact', asked);

        bubble.setAttribute('data-checkpoint-reason', 'The provider refused');
        bubble.setAttribute('data-checkpoint', 'failed');

        const sep = separator(bubble)!;
        expect(sep.getAttribute('data-state')).toBe('failed');
        const text = sep.querySelector<HTMLElement>('.aparte-checkpoint__text')!;
        expect(text.textContent).toContain("Couldn't summarise the context");
        expect(text.title).toBe('The provider refused');
        expect(text.querySelector('.aparte-sr-only')!.textContent).toContain('The provider refused');

        action(bubble, 'retry')!.click();
        expect(asked).toHaveBeenCalledTimes(1);
        expect((asked.mock.calls[0]![0] as CustomEvent).detail).toEqual({ targetId: 'c1' });
        window.removeEventListener('aparte-compact', asked);
    });

    it('Retry goes to the compactor the chat resolves, as the person asking, and sends no command event', () => {
        const compact = vi.fn().mockResolvedValue({ ok: true, skipped: true, reason: 'nothing-to-drop' });
        aparteGlobalConfig.setCompactor({ compact, settled: async () => {} });
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        chat.id = 'c1';
        document.body.appendChild(chat);
        const bubble = mount({}, chat);
        const asked = vi.fn();
        window.addEventListener('aparte-compact', asked);

        bubble.setAttribute('data-checkpoint', 'failed');
        action(bubble, 'retry')!.click();

        expect(asked, 'the event is the fallback, not a second ask').not.toHaveBeenCalled();
        expect(compact).toHaveBeenCalledTimes(1);
        expect(compact).toHaveBeenCalledWith({ target: chat, targetId: 'c1', force: true, reason: 'retry' });
        window.removeEventListener('aparte-compact', asked);
    });

    it("Retry reads the compactor of the chat's own config before the global one", () => {
        const global = vi.fn().mockResolvedValue({ ok: true, skipped: true, reason: 'empty' });
        const own = vi.fn().mockResolvedValue({ ok: true, skipped: true, reason: 'empty' });
        aparteGlobalConfig.setCompactor({ compact: global, settled: async () => {} });
        const config = new AparteConfig();
        config.setCompactor({ compact: own, settled: async () => {} });
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        document.body.appendChild(chat);
        attachConfig(chat, config);
        const bubble = mount({}, chat);

        bubble.setAttribute('data-checkpoint', 'failed');
        action(bubble, 'retry')!.click();

        expect(own).toHaveBeenCalledTimes(1);
        expect(global).not.toHaveBeenCalled();
    });

    it('says the reason of a second failure, which changes nothing but the reason', () => {
        const bubble = mount();
        bubble.setAttribute('data-checkpoint-reason', 'First');
        bubble.setAttribute('data-checkpoint', 'failed');
        expect(separator(bubble)!.querySelector<HTMLElement>('.aparte-checkpoint__text')!.title).toBe('First');

        bubble.setAttribute('data-checkpoint-reason', 'Second');

        const text = separator(bubble)!.querySelector<HTMLElement>('.aparte-checkpoint__text')!;
        expect(text.title).toBe('Second');
        expect(text.querySelector('.aparte-sr-only')!.textContent).toContain('Second');
    });

    it('outranks a checkpoint the message already carries, and gives way to it afterwards', () => {
        const bubble = mount();
        bubble.setContextSummary(summary);
        bubble.setAttribute('data-checkpoint', 'pending');
        expect(separator(bubble)!.getAttribute('data-state')).toBe('pending');
        bubble.removeAttribute('data-checkpoint');
        expect(separator(bubble)!.getAttribute('data-state')).toBe('done');
    });
});

describe('a message an older compaction wrote', () => {
    const legacy = (): Bubble => {
        const bubble = mount({ 'data-kind': 'compaction', content: '**Conversation summary**\n\nWhat came before.' });
        return bubble;
    };

    it('is replaced by a separator with no count and no Restore, and the row itself does not paint', () => {
        const bubble = legacy();

        const sep = separator(bubble)!;
        expect(sep.getAttribute('data-state')).toBe('legacy');
        expect(sep.textContent).toContain('Earlier messages were summarised');
        expect(sep.textContent).not.toMatch(/\d+ messages/);
        expect(action(bubble, 'restore'), 'there is nothing to restore it from').toBeNull();
        expect(bubble.querySelector('.aparte-message')!.hasAttribute('data-superseded')).toBe(true);
    });

    it('opens onto the summary it carries', () => {
        const bubble = legacy();
        action(bubble, 'toggle')!.click();
        const panel = bubble.querySelector<HTMLElement>('.aparte-checkpoint__summary')!;
        expect(panel.hidden).toBe(false);
        expect(panel.textContent).toContain('What came before.');
        expect(action(bubble, 'toggle')!.getAttribute('aria-expanded')).toBe('true');
    });

    it('is told by the sync helper, with no data-kind stamp needed', () => {
        const bubble = mount({ content: 'Summary' });
        populateBubbleFromMessage(bubble, { id: 'u2', role: 'user', compaction: true, content: 'Summary', timestamp: 1 } as AparteMessage);
        expect(separator(bubble)!.getAttribute('data-state')).toBe('legacy');
        expect(bubble.querySelector('.aparte-message')!.hasAttribute('data-superseded')).toBe(true);

        populateBubbleFromMessage(bubble, { id: 'u3', role: 'user', content: 'An ordinary message', timestamp: 1 } as AparteMessage);
        expect(separator(bubble), 'a bubble reused for an ordinary message').toBeNull();
        expect(bubble.querySelector('.aparte-message')!.hasAttribute('data-superseded')).toBe(false);
    });
});
