// @vitest-environment jsdom
/**
 * <aparte-context> — the measure it draws, and the panel it opens.
 *
 * The gauge reads `measureContext` over its chat's own transcript: the last reply's real
 * usage while nothing the model reads has changed, a `~` estimate of the request that would
 * be sent once it has (a compaction, a Restore). The reading is a disclosure button; its
 * panel says what fills the window and, with a compactor that can preview, offers Compact now.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, AparteConfig } from '../../../config/index.js';
import { attachConfig } from '../../../config/config-context.js';
import { AparteError, AparteErrorCode } from '../../../types/errors.js';
import '../aparte-context.js';
import type { AparteContext } from '../aparte-context.js';
import type { AparteCompactor, AparteMessage } from '../../../types/index.js';

// The numbers are formatted with the locale's tag; pinning it keeps "5.2K" from reading "5,2 k"
// on a machine whose browser language is French.
beforeEach(() => {
    aparteGlobalConfig.setLocale({ ...aparteGlobalConfig.getLocale(), tag: 'en-US' });
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    aparteGlobalConfig.reset();
});

const text = (n: number): string => 'x'.repeat(n);
const user = (id: string, content: string, extra: Partial<AparteMessage> = {}): AparteMessage => ({ id, role: 'user', content, timestamp: 1, ...extra });
const reply = (id: string, content: string, extra: Partial<AparteMessage> = {}): AparteMessage => ({ id, role: 'assistant', content, timestamp: 2, ...extra });

interface Mounted { chat: HTMLElement; gauge: AparteContext; messages: AparteMessage[] }

/** A chat whose host exposes `getMessages` (the shape a framework wrapper has), with a gauge inside it. */
function mount(messages: AparteMessage[], attrs = 'window="1000"', parent: HTMLElement = document.body): Mounted {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    chat.id = 'chat-a';
    const state = { messages };
    (chat as unknown as { getMessages: () => AparteMessage[] }).getMessages = () => state.messages;
    chat.innerHTML = `<aparte-context ${attrs}></aparte-context>`;
    parent.appendChild(chat);
    return { chat, gauge: chat.querySelector('aparte-context') as AparteContext, get messages() { return state.messages; }, set messages(m) { state.messages = m; } } as Mounted;
}

const turn = (messageId: string, inputTokens: number, outputTokens: number): void => {
    window.dispatchEvent(new CustomEvent('aparte-message-done', { detail: { messageId, role: 'assistant', usage: { inputTokens, outputTokens }, targetId: 'chat-a' } }));
};

const toggle = (g: HTMLElement): HTMLButtonElement => g.querySelector<HTMLButtonElement>('.aparte-context__toggle')!;
const panel = (g: HTMLElement): HTMLElement => g.querySelector<HTMLElement>('.aparte-context__panel')!;
const row = (g: HTMLElement, part: string): HTMLElement | null => g.querySelector<HTMLElement>(`[data-part="${part}"]`);
const valueOf = (g: HTMLElement, part: string): string => row(g, part)?.querySelector('.aparte-context__row-value')?.textContent ?? '';
/** "~1.6K" → 1600, "~100" → 100: the panel formats compactly in the locale's tag. */
const num = (s: string): number => {
    const n = Number(s.replace(/[^\d.]/g, ''));
    return /k/i.test(s) ? n * 1000 : n;
};

const compactorWith = (overrides: Partial<AparteCompactor> = {}): AparteCompactor => ({
    compact: vi.fn().mockResolvedValue({ ok: true, skipped: false, summary: 's', kept: 2, dropped: 4 }),
    settled: vi.fn().mockResolvedValue(undefined),
    preview: vi.fn().mockReturnValue({ messages: 4, tokens: 5200 }),
    ...overrides,
});

describe('<aparte-context> — the measure', () => {
    it('draws the last reply\'s real usage, with no tilde, while nothing changed since', () => {
        const { gauge } = mount([user('u1', text(400)), reply('a1', text(400), { usage: { inputTokens: 600, outputTokens: 100 } })]);
        window.dispatchEvent(new CustomEvent('aparte-conversation-loaded', { detail: { targetId: 'chat-a' } }));
        expect(gauge.measure).toMatchObject({ used: 700, estimated: false, window: 1000 });
        expect(gauge.querySelector('.aparte-context__text')!.textContent).not.toContain('~');
        expect(gauge.getAttribute('data-level')).toBe('ok');
    });

    it('turns to a `~` estimate of the new view after a compaction, instead of the stale usage or a blank', () => {
        const m = mount([
            user('u1', text(3800)),
            reply('a1', text(3800), { usage: { inputTokens: 600, outputTokens: 50 } }),
            user('u2', text(380)),
            reply('a2', text(380), { usage: { inputTokens: 900, outputTokens: 50 } }),
        ]);
        turn('a2', 900, 50);
        expect(m.gauge.measure).toMatchObject({ used: 950, estimated: false });
        expect(m.gauge.getAttribute('data-level')).toBe('danger');

        // A compaction: the checkpoint lands on the first kept message, then `-done` arrives.
        m.messages = [
            user('u1', text(3800)),
            reply('a1', text(3800), { usage: { inputTokens: 600, outputTokens: 50 } }),
            user('u2', text(380), { contextSummary: { summary: text(190), count: 2, createdAt: Date.now() + 10_000 } }),
            reply('a2', text(380), { usage: { inputTokens: 900, outputTokens: 50 } }),
        ];
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { summary: 's', kept: 1, dropped: 2, targetId: 'chat-a' } }));

        expect(m.gauge.hasAttribute('data-empty'), 'not blank').toBe(false);
        expect(m.gauge.measure!.estimated).toBe(true);
        expect(m.gauge.measure!.used, 'the size of the new, smaller view').toBeLessThan(300);
        expect(m.gauge.querySelector('.aparte-context__text')!.textContent!.startsWith('~')).toBe(true);
        expect(m.gauge.getAttribute('data-level')).toBe('ok');
    });

    it('a Restore reads as an estimate of the full history again', () => {
        const m = mount([
            user('u1', text(380)),
            reply('a1', text(380), { usage: { inputTokens: 100, outputTokens: 10 } }),
            user('u2', text(380)),
        ]);
        turn('a1', 100, 10);
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { restored: true, targetId: 'chat-a' } }));
        expect(m.gauge.measure!.estimated).toBe(true);
        expect(m.gauge.measure!.used).toBe(300);
    });

    it('seeds from the `used` attribute until a turn has reported, then stops being a number it cannot explain', () => {
        const { gauge } = mount([], 'window="1000" used="400"');
        expect(gauge.measure).toMatchObject({ used: 400, estimated: false });
        expect(gauge.hasAttribute('data-empty')).toBe(false);
    });

    it('a model\'s refusal as over its window turns it danger whatever the number says', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 100, outputTokens: 10 } }), user('u2', text(380))]);
        turn('a1', 100, 10);
        expect(m.gauge.getAttribute('data-level')).toBe('ok');

        window.dispatchEvent(new CustomEvent('aparte-message-error', {
            detail: { messageId: 'a2', targetId: 'chat-a', error: new AparteError('too long', AparteErrorCode.USAGE_CONTEXT_EXCEEDED) },
        }));
        expect(m.gauge.getAttribute('data-level')).toBe('danger');

        // Another failure is not an overflow.
        const other = mount([user('u1', 'x'), reply('a1', 'x', { usage: { inputTokens: 10, outputTokens: 1 } })]);
        other.chat.id = 'chat-b';
        window.dispatchEvent(new CustomEvent('aparte-message-error', {
            detail: { messageId: 'a2', targetId: 'chat-b', error: new AparteError('boom', AparteErrorCode.NET_ERROR) },
        }));
        expect(other.gauge.getAttribute('data-level')).toBe('ok');
    });

    it('an overflow for ANOTHER chat does not turn this gauge danger', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 100, outputTokens: 10 } })]);
        turn('a1', 100, 10);
        window.dispatchEvent(new CustomEvent('aparte-message-error', {
            detail: { messageId: 'a2', targetId: 'chat-z', error: new AparteError('too long', AparteErrorCode.USAGE_CONTEXT_EXCEEDED) },
        }));
        expect(m.gauge.getAttribute('data-level')).toBe('ok');
    });

    it('the next turn that reports clears an overflow danger', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 100, outputTokens: 10 } })]);
        turn('a1', 100, 10);
        window.dispatchEvent(new CustomEvent('aparte-message-error', {
            detail: { messageId: 'a2', targetId: 'chat-a', error: new AparteError('too long', AparteErrorCode.USAGE_CONTEXT_EXCEEDED) },
        }));
        expect(m.gauge.getAttribute('data-level')).toBe('danger');
        turn('a1', 100, 10);
        expect(m.gauge.getAttribute('data-level')).toBe('ok');
    });
});

describe('<aparte-context> — the disclosure', () => {
    const open = (): Mounted => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 20 } })]);
        turn('a1', 200, 20);
        return m;
    };

    it('is a button that says it is collapsed, and controls a hidden panel', () => {
        const { gauge } = open();
        const button = toggle(gauge);
        expect(button.tagName).toBe('BUTTON');
        expect(button.type).toBe('button');
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.getAttribute('aria-controls')).toBe(panel(gauge).id);
        expect(panel(gauge).hidden).toBe(true);
        // The accessible name carries the label and the reading.
        expect(button.textContent).toMatch(/Context window: 220 \/ 1\s?k/i);
    });

    it('opens on click and closes on a second click', () => {
        const { gauge } = open();
        toggle(gauge).click();
        expect(toggle(gauge).getAttribute('aria-expanded')).toBe('true');
        expect(panel(gauge).hidden).toBe(false);
        toggle(gauge).click();
        expect(toggle(gauge).getAttribute('aria-expanded')).toBe('false');
        expect(panel(gauge).hidden).toBe(true);
    });

    it('opens from the bar or the ring too, a larger target for a pointer', () => {
        const { gauge } = open();
        gauge.querySelector<HTMLElement>('[role="meter"]')!.click();
        expect(panel(gauge).hidden).toBe(false);
    });

    it('opens by keyboard: the toggle is a real button, so Enter and Space click it', () => {
        // jsdom does not synthesise the click from a key; what is asserted is that the control
        // is the one the browser does it for — a button, in the tab order, not a div with a handler.
        const { gauge } = open();
        const button = toggle(gauge);
        expect(button.tabIndex).toBe(0);
        button.focus();
        expect(document.activeElement).toBe(button);
        expect(button.disabled).toBe(false);
    });

    it('Escape closes it and hands the focus back to the toggle', () => {
        const { gauge } = open();
        toggle(gauge).click();
        toggle(gauge).focus();
        toggle(gauge).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
        expect(panel(gauge).hidden).toBe(true);
        expect(toggle(gauge).getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(toggle(gauge));
    });

    it('Escape from inside is answered on the gauge itself: an ancestor that also answers Escape never sees it', () => {
        // A launcher or a dialog around the gauge listens for Escape on its own element, and
        // that runs BEFORE a listener on the document. A press consumed only there has already
        // closed the card round the panel it was meant for.
        const { chat, gauge } = open();
        const above: KeyboardEvent[] = [];
        chat.addEventListener('keydown', (e) => above.push(e));
        toggle(gauge).click();
        toggle(gauge).focus();
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true });
        toggle(gauge).dispatchEvent(escape);
        expect(panel(gauge).hidden).toBe(true);
        expect(escape.defaultPrevented).toBe(true);
        expect(above).toEqual([]);
    });

    it('leaves Escape alone while the panel is closed', () => {
        const { chat, gauge } = open();
        const above: KeyboardEvent[] = [];
        chat.addEventListener('keydown', (e) => above.push(e));
        const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true });
        toggle(gauge).dispatchEvent(escape);
        expect(escape.defaultPrevented).toBe(false);
        expect(above).toEqual([escape]);
    });

    it('Escape pressed elsewhere on the page closes it too', () => {
        const { gauge } = open();
        toggle(gauge).click();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel(gauge).hidden).toBe(true);
    });

    it('a click outside closes it; one inside the panel does not', () => {
        const { gauge } = open();
        toggle(gauge).click();
        panel(gauge).click();
        expect(panel(gauge).hidden, 'a click on the panel itself leaves it open').toBe(false);
        document.body.click();
        expect(panel(gauge).hidden).toBe(true);
    });

    it('does not open on hover', () => {
        const { gauge } = open();
        toggle(gauge).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        toggle(gauge).dispatchEvent(new MouseEvent('mouseenter'));
        expect(panel(gauge).hidden).toBe(true);
    });

    it('holds no document listener while it is closed', () => {
        const add = vi.spyOn(document, 'addEventListener');
        const remove = vi.spyOn(document, 'removeEventListener');
        const { gauge } = open();
        expect(add).not.toHaveBeenCalledWith('click', expect.anything());
        toggle(gauge).click();
        expect(add).toHaveBeenCalledWith('click', expect.anything());
        expect(add).toHaveBeenCalledWith('keydown', expect.anything());
        document.body.click();
        expect(remove).toHaveBeenCalledWith('click', expect.anything());
        expect(remove).toHaveBeenCalledWith('keydown', expect.anything());
    });

    it('shares the toggle and the panel between the bar and the ring', () => {
        const { gauge } = open();
        gauge.setAttribute('variant', 'ring');
        expect(toggle(gauge)).not.toBeNull();
        toggle(gauge).click();
        expect(panel(gauge).hidden).toBe(false);
        expect(gauge.querySelector('.aparte-context__ring')).not.toBeNull();
    });

    it('survives a variant change while open: the panel is rebuilt, and still opened', () => {
        const { gauge } = open();
        toggle(gauge).click();
        gauge.setAttribute('variant', 'ring');
        expect(toggle(gauge).getAttribute('aria-expanded')).toBe('true');
        expect(panel(gauge).hidden).toBe(false);
        expect(row(gauge, 'total')).not.toBeNull();
    });

    it('closes itself when the gauge has nothing left to show (a new chat)', () => {
        const { gauge } = open();
        toggle(gauge).click();
        gauge.querySelector('.aparte-context')!.dispatchEvent(new CustomEvent('aparte-reset-done', { bubbles: true, composed: true }));
        expect(gauge.hasAttribute('data-empty')).toBe(true);
        expect(gauge.querySelector('.aparte-context__panel')).toBeNull();
    });
});

describe('<aparte-context> — the panel', () => {
    it('lists system prompt, tools, summary, messages, other, free and the total', () => {
        const c = new AparteConfig();
        c.setSystemPrompt(text(380));
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        chat.id = 'chat-a';
        document.body.appendChild(chat);
        attachConfig(chat, c);
        (chat as unknown as { getMessages: () => AparteMessage[] }).getMessages = () => [
            user('u1', text(380), { contextSummary: { summary: text(190), count: 3, createdAt: 1 } }),
            reply('a1', text(380), { usage: { inputTokens: 400, outputTokens: 100 } }),
        ];
        chat.innerHTML = '<aparte-context window="1000"></aparte-context>';
        const gauge = chat.querySelector('aparte-context') as AparteContext;
        turn('a1', 400, 100);
        toggle(gauge).click();

        const parts = Array.from(panel(gauge).querySelectorAll('[data-part]')).map((r) => r.getAttribute('data-part'));
        expect(parts).toEqual(['system', 'tools', 'summary', 'messages', 'other', 'free', 'total']);
        const labels = Array.from(panel(gauge).querySelectorAll('.aparte-context__row-label')).map((l) => l.textContent);
        expect(labels).toEqual(['System prompt', 'Tools', 'Summary', 'Messages', 'Other', 'Free', 'Total']);
        expect(num(valueOf(gauge, 'system'))).toBe(100);
        expect(valueOf(gauge, 'system').startsWith('~'), 'a part is an estimate').toBe(true);
        expect(num(valueOf(gauge, 'free'))).toBe(500);
        expect(valueOf(gauge, 'total')).toMatch(/^500 \/ 1\s?k$/i);
    });

    it('never shows parts that sum above the total: they are scaled down to the reading', () => {
        // 3800 characters of messages estimate to 1000 tokens against a reported 400.
        const { gauge } = mount([
            user('u1', text(3800)),
            reply('a1', text(3800), { usage: { inputTokens: 300, outputTokens: 100 } }),
        ], 'window="2000"');
        turn('a1', 300, 100);
        toggle(gauge).click();

        const shown = ['system', 'tools', 'summary', 'messages', 'other'].map((p) => num(valueOf(gauge, p)));
        const total = shown.reduce((a, b) => a + b, 0);
        expect(total).toBeLessThanOrEqual(400 + 1);
        expect(num(valueOf(gauge, 'other'))).toBe(0);
        expect(num(valueOf(gauge, 'free'))).toBe(1600);
    });

    it('shows what the estimates cannot attribute as "other"', () => {
        const { gauge } = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 700, outputTokens: 0 } })], 'window="2000"');
        turn('a1', 700, 0);
        toggle(gauge).click();
        // Two messages of 100 tokens against 700 reported: 500 the heuristic cannot see.
        expect(num(valueOf(gauge, 'messages'))).toBe(200);
        expect(num(valueOf(gauge, 'other'))).toBe(500);
    });

    it('offers no Compact now without a compactor, or when the compactor has nothing to preview', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        toggle(m.gauge).click();
        expect(m.gauge.querySelector('[data-context-action="compact"]')).toBeNull();

        aparteGlobalConfig.setCompactor(compactorWith({ preview: vi.fn().mockReturnValue(null) }));
        expect(m.gauge.querySelector('[data-context-action="compact"]'), 'nothing to do, nothing offered').toBeNull();

        aparteGlobalConfig.setCompactor({ compact: vi.fn(), settled: vi.fn() } as unknown as AparteCompactor);
        expect(m.gauge.querySelector('[data-context-action="compact"]'), 'a compactor with no preview says nothing').toBeNull();
    });

    it('says what compacting would free, and Compact now asks the compactor as a person', async () => {
        const compactor = compactorWith();
        aparteGlobalConfig.setCompactor(compactor);
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        toggle(m.gauge).click();

        expect(panel(m.gauge).querySelector('.aparte-context__reclaim')!.textContent).toMatch(/^Compacting now would free ~5\.2K tokens$/);
        expect(compactor.preview).toHaveBeenCalledWith({ target: m.chat, targetId: 'chat-a' });
        const button = m.gauge.querySelector<HTMLButtonElement>('[data-context-action="compact"]')!;
        expect(button.textContent).toBe('Compact now');
        expect(button.classList.contains('aparte-btn')).toBe(true);

        button.click();
        expect(compactor.compact).toHaveBeenCalledTimes(1);
        expect(compactor.compact).toHaveBeenCalledWith({ target: m.chat, targetId: 'chat-a', force: true, reason: 'manual' });
        // While it runs the element says so, and the button is gone from the panel.
        expect(m.gauge.getAttribute('data-compact')).toBe('running');
        expect(m.gauge.querySelector('[data-context-action="compact"]')).toBeNull();
        expect(panel(m.gauge).querySelector('.aparte-context__status')!.textContent).toBe('Summarising the context…');

        await Promise.resolve(); await Promise.resolve();
        expect(m.gauge.hasAttribute('data-compact')).toBe(false);
    });

    it('reads the chat\'s own config\'s compactor before the global one', () => {
        const global = compactorWith();
        const own = compactorWith();
        aparteGlobalConfig.setCompactor(global);
        const c = new AparteConfig();
        c.setCompactor(own);
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        chat.id = 'chat-a';
        document.body.appendChild(chat);
        attachConfig(chat, c);
        (chat as unknown as { getMessages: () => AparteMessage[] }).getMessages = () => [user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })];
        chat.innerHTML = '<aparte-context window="1000"></aparte-context>';
        const gauge = chat.querySelector('aparte-context') as AparteContext;
        turn('a1', 200, 0);
        toggle(gauge).click();
        gauge.querySelector<HTMLButtonElement>('[data-context-action="compact"]')!.click();
        expect(own.compact).toHaveBeenCalledTimes(1);
        expect(global.compact).not.toHaveBeenCalled();
    });

    it('reads everything from the chat it watches when the gauge stands outside it, a chat that carries its own config', () => {
        // A header gauge with `target=`: it is not under the chat's host, so its own position
        // resolves the GLOBAL config. The chat's prompt, its tools and its compactor
        // are the chat's, and the client and the plugin already read them from there.
        const own = new AparteConfig();
        const compactor = compactorWith();
        own.setCompactor(compactor);
        own.setSystemPrompt(text(380));
        const chat = document.createElement('div');
        chat.setAttribute('data-aparte-chat', '');
        chat.id = 'chat-a';
        document.body.appendChild(chat);
        attachConfig(chat, own);
        (chat as unknown as { getMessages: () => AparteMessage[] }).getMessages = () => [
            user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } }), user('u2', text(380)),
        ];
        const header = document.createElement('header');
        header.innerHTML = '<aparte-context target="chat-a" window="1000"></aparte-context>';
        document.body.appendChild(header);
        const gauge = header.querySelector('aparte-context') as AparteContext;
        turn('a1', 200, 0);
        toggle(gauge).click();

        expect(num(valueOf(gauge, 'system')), "the chat's system prompt, 100 tokens").toBe(100);
        const button = gauge.querySelector<HTMLButtonElement>('[data-context-action="compact"]');
        expect(button, "Compact now is offered: the chat's compactor can preview").not.toBeNull();
        button!.click();
        expect(compactor.compact).toHaveBeenCalledWith(expect.objectContaining({ target: chat, force: true, reason: 'manual' }));
    });

    it('a compactor registered after the panel opened makes Compact now appear', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        toggle(m.gauge).click();
        expect(m.gauge.querySelector('[data-context-action="compact"]')).toBeNull();
        aparteGlobalConfig.setCompactor(compactorWith());
        expect(m.gauge.querySelector('[data-context-action="compact"]')).not.toBeNull();
    });

    it('a render that changes nothing leaves the buttons, and the focus on one, alone', () => {
        aparteGlobalConfig.setCompactor(compactorWith());
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        toggle(m.gauge).click();
        const button = m.gauge.querySelector<HTMLButtonElement>('[data-context-action="compact"]')!;
        button.focus();
        window.dispatchEvent(new CustomEvent('aparte-config-change'));
        expect(m.gauge.querySelector('[data-context-action="compact"]')).toBe(button);
        expect(document.activeElement).toBe(button);
    });

    it('shows a failed compaction on the element and in the panel, with Retry', async () => {
        const compactor = compactorWith({ compact: vi.fn().mockResolvedValue({ ok: false, error: 'The provider refused' }) });
        aparteGlobalConfig.setCompactor(compactor);
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        toggle(m.gauge).click();
        m.gauge.querySelector<HTMLButtonElement>('[data-context-action="compact"]')!.click();
        await Promise.resolve(); await Promise.resolve();

        expect(m.gauge.getAttribute('data-compact')).toBe('failed');
        const status = panel(m.gauge).querySelector<HTMLElement>('.aparte-context__status')!;
        expect(status.textContent).toContain("Couldn't summarise the context");
        expect(status.title).toBe('The provider refused');
        const retry = m.gauge.querySelector<HTMLButtonElement>('[data-context-action="retry"]')!;
        expect(retry.textContent).toBe('Retry');

        retry.click();
        expect(compactor.compact).toHaveBeenLastCalledWith({ target: m.chat, targetId: 'chat-a', force: true, reason: 'retry' });
        expect(m.gauge.getAttribute('data-compact')).toBe('running');
    });

    it('reflects the compaction events of its own chat only', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        window.dispatchEvent(new CustomEvent('aparte-compact-start', { detail: { targetId: 'chat-z', messageId: 'u2' } }));
        expect(m.gauge.hasAttribute('data-compact')).toBe(false);

        window.dispatchEvent(new CustomEvent('aparte-compact-start', { detail: { targetId: 'chat-a', messageId: 'u2' } }));
        expect(m.gauge.getAttribute('data-compact')).toBe('running');

        window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: 'nope', targetId: 'chat-a', messageId: 'u2' } }));
        expect(m.gauge.getAttribute('data-compact')).toBe('failed');

        window.dispatchEvent(new CustomEvent('aparte-compact-start', { detail: { targetId: 'chat-a', messageId: 'u2' } }));
        window.dispatchEvent(new CustomEvent('aparte-compact-done', { detail: { skipped: true, reason: 'nothing-to-drop', targetId: 'chat-a' } }));
        expect(m.gauge.hasAttribute('data-compact'), 'a skip ends the wait').toBe(false);
    });

    it('without a compactor, Retry falls back to the aparte-compact command', () => {
        const m = mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 200, outputTokens: 0 } })]);
        turn('a1', 200, 0);
        window.dispatchEvent(new CustomEvent('aparte-compact-error', { detail: { error: 'nope', targetId: 'chat-a' } }));
        toggle(m.gauge).click();
        const asked = vi.fn();
        window.addEventListener('aparte-compact', asked);
        m.gauge.querySelector<HTMLButtonElement>('[data-context-action="retry"]')!.click();
        expect(asked).toHaveBeenCalledTimes(1);
        expect((asked.mock.calls[0]![0] as CustomEvent).detail).toEqual({ targetId: 'chat-a' });
        window.removeEventListener('aparte-compact', asked);
    });
});

describe('<aparte-context auto-compact> — the deprecated request', () => {
    it('marks its request as automatic and carries the window it measured against', () => {
        const compacts: Array<Record<string, unknown>> = [];
        window.addEventListener('aparte-compact', (e) => compacts.push((e as CustomEvent).detail));
        mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 900, outputTokens: 50 } })], 'window="1000" auto-compact');
        turn('a1', 900, 50);
        expect(compacts).toEqual([{ targetId: 'chat-a', auto: true, window: 1000 }]);
    });

    it('still asks per turn, one request at a time', () => {
        const compacts: unknown[] = [];
        window.addEventListener('aparte-compact', (e) => compacts.push((e as CustomEvent).detail));
        mount([user('u1', text(380)), reply('a1', text(380), { usage: { inputTokens: 900, outputTokens: 50 } })], 'window="1000" auto-compact');
        turn('a1', 900, 50);
        turn('a1', 920, 50);
        expect(compacts).toHaveLength(1);
    });
});
