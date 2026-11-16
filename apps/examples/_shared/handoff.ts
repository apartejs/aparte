/**
 * `?handoff`: a person takes the conversation over from the AI, and hands it back.
 *
 * The advisor is simulated here — timers stand in for a support desk — and every write goes
 * through what a real app has: `setAutoReply` on the config, and the chat's own
 * `appendMessage` / `updateMessage`. "Talk to a person" turns the AI off for the open
 * conversation, draws a notice and Marie's greeting under her name and picture; what the
 * person writes then is shown, saved and announced (`aparte-send`, with its `messageId`) and
 * no turn starts, so Marie marks it read and answers. "Hand back to the assistant" turns the
 * AI on again, and its next reply has read what Marie wrote.
 *
 * Which conversations Marie holds is the app's state, not the library's: a real app asks its
 * server when a conversation opens (`aparte-conversation-loaded`) and applies the answer. Here
 * sessionStorage plays the server, so the takeover survives a reload (`?persist` keeps the
 * conversations themselves).
 *
 * "Marie writes" and "Marie sends a photo" push a message at any moment, the AI's reply
 * streaming included: the browser suite proves the reply stays whole around them.
 */
import { aparteGlobalConfig, contentToText } from '@aparte/core';
import type { AparteAuthor, AparteChatRequest, AparteMessage, AparteSendEventDetail } from '@aparte/core';
import type { Scenario } from '@aparte/provider-scenario';

const params = new URLSearchParams(location.search);
const HANDOFF = params.has('handoff');
/** How long Marie takes: short under `?fast`, for the browser suite. */
const DELAY = params.has('fast') ? 150 : 1200;

/** Marie's picture: her initial on a disc, a data URL like an avatar a desk would serve. */
const AVATAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#7c3aed"/><text x="16" y="21" font-family="sans-serif" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">M</text></svg>')}`;
const PHOTO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#e7e5e4"/><rect x="30" y="18" width="60" height="44" rx="3" fill="#b45309"/><path d="M60 18v44" stroke="#78350f" stroke-width="4"/></svg>')}`;

const MARIE: AparteAuthor = { id: 'marie', name: 'Marie', type: 'human', avatar: AVATAR };
const GREETING = 'Hi, I’m Marie from the support team. I’ve read the conversation so far: how can I help?';
/** What Marie promises. The scripted model quotes it back only if her message reached it. */
const PROMISE = 'ships today';
const ANSWER = `I’ve checked with the warehouse: your order ${PROMISE}.`;
const PUSHED = 'Quick note while it answers: your parcel is packed.';

/** The scripted model's answer once the conversation is handed back. */
export const HANDOFF_SCENARIOS: Record<string, Scenario> = {
    'handoff-back': { turn: `Welcome back. I can see Marie confirmed your order ${PROMISE}. Anything else I can do?` },
};

/** Route the person's message to `handoff-back` when the request holds what Marie promised. */
export function routeHandoff(request: AparteChatRequest): string | undefined {
    if (!HANDOFF || request.messages.at(-1)?.role !== 'user') return undefined;
    const read = request.messages.some((m) => m.role === 'assistant' && contentToText(m.content).includes(PROMISE));
    return read ? 'handoff-back' : undefined;
}

interface Writer {
    appendMessage(message: AparteMessage): void;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
}

/**
 * What writes into the chat. A wrapper puts the methods on its root element; the bare
 * `<aparte-chat>` element leaves them to its viewport. `[data-aparte-chat]` finds either.
 */
function writer(): Writer | null {
    const chat = document.querySelector<HTMLElement & Partial<Writer> & { viewport?: Writer | null }>('[data-aparte-chat]');
    if (!chat) return null;
    return typeof chat.appendMessage === 'function' ? (chat as Writer) : chat.viewport ?? null;
}

/** The conversation open in the chat, from the manager every example sets on the config. */
const openConversation = (): string | null => aparteGlobalConfig.getConversationManager()?.activeId ?? null;

/** The conversations Marie holds — the app's server, played by sessionStorage. */
const STORE = 'aparte-examples:handoff';
function held(): Set<string> {
    try { return new Set(JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as string[]); } catch { return new Set(); }
}
function hold(id: string, on: boolean): void {
    const ids = held();
    if (on) ids.add(id); else ids.delete(id);
    try { sessionStorage.setItem(STORE, JSON.stringify([...ids])); } catch { /* private mode: held for this page only */ }
}

const later = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let seq = 0;
const uid = (kind: string): string => `${kind}-${Date.now()}-${seq++}`;

const notice = (content: string): AparteMessage => ({ id: uid('notice'), role: 'assistant', kind: 'notice', content, timestamp: Date.now() });
const fromMarie = (content: string, extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id: uid('marie'), role: 'assistant', author: MARIE, content, timestamp: Date.now(), ...extra });

async function takeOver(): Promise<void> {
    const id = openConversation();
    if (!id) return;
    hold(id, true);
    aparteGlobalConfig.setAutoReply(false, id);
    writer()?.appendMessage(notice('Marie joined the conversation'));
    await later(DELAY);
    writer()?.appendMessage(fromMarie(GREETING));
}

function handBack(): void {
    const id = openConversation();
    if (!id) return;
    hold(id, false);
    writer()?.appendMessage(notice('The assistant is back'));
    aparteGlobalConfig.setAutoReply(true, id);
}

/** Wire the simulator, under `?handoff`. */
export function setupHandoff(): void {
    if (!HANDOFF) return;

    // A conversation opens: apply what the "server" says about it.
    window.addEventListener('aparte-conversation-loaded', (event) => {
        const { conversationId } = (event as CustomEvent<{ conversationId: string }>).detail;
        aparteGlobalConfig.setAutoReply(!held().has(conversationId), conversationId);
    });

    // The person writes while Marie holds the conversation: she reads it, then answers. The id
    // is read once every listener has run — whoever shows the message writes it on the send.
    window.addEventListener('aparte-send', (event) => {
        const id = openConversation();
        if (!id || !held().has(id)) return;
        const detail = (event as CustomEvent<AparteSendEventDetail>).detail;
        void later(DELAY).then(async () => {
            if (detail.messageId) writer()?.updateMessage(detail.messageId, { note: 'Read by Marie' });
            await later(DELAY);
            writer()?.appendMessage(fromMarie(ANSWER));
        });
    });

    const panel = document.createElement('div');
    panel.className = 'handoff-sim';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Advisor simulator');
    const actions: [string, () => void][] = [
        ['Talk to a person', () => void takeOver()],
        ['Marie writes', () => writer()?.appendMessage(fromMarie(PUSHED))],
        ['Marie sends a photo', () => writer()?.appendMessage(fromMarie('', {
            attachments: [{ id: uid('photo'), name: 'parcel.svg', type: 'image/svg+xml', url: PHOTO }],
        }))],
        ['Hand back to the assistant', handBack],
    ];
    for (const [label, act] of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'aparte-btn aparte-btn--surface';
        button.textContent = label;
        button.addEventListener('click', act);
        panel.append(button);
    }
    document.body.append(panel);
}
