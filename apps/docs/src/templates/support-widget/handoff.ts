/**
 * The handoff to a person: the `handoff_to_human` tool the model calls, the status line while
 * someone joins, the line across the transcript when they do, their messages under their own
 * name and face, and, once they are in, the AI turned off so the visitor's messages are theirs.
 *
 * Here the person is scripted, like the model. In a real widget `join()` is your support
 * backend accepting the conversation, and the `aparte-send` listener posts the visitor's
 * message to it — `detail.messageId` is the id to mark it read with.
 */
import { aparteGlobalConfig } from '@aparte/core';
import type { AparteAuthor, AparteMessage, AparteSendEventDetail } from '@aparte/core';
import { AGENT, MARK_SVG } from './brand';

export const HANDOFF_TOOL = 'handoff_to_human';

interface Viewport extends HTMLElement {
    appendMessage(message: AparteMessage): void;
    updateMessage(id: string, updates: Partial<AparteMessage>): void;
}

type Chat = HTMLElement & { viewport: Viewport | null };

/** Who joins: a message carries its author, so the bubble names them and the avatar knows them. */
const PERSON: AparteAuthor = { id: 'care-rosa', name: AGENT.name, type: 'human' };

const GREETING = `Hi, I’m ${AGENT.firstName} from ${AGENT.team}. I’ve read your conversation with Wren, so no need to repeat anything. What can I help with?`;
const REPLIES = [
    'Thanks, I’m opening your studio’s account now. Give me a minute.',
    'Got it. I’ll stay on this conversation until it’s sorted.',
];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The avatars: the person's initials on their messages, the Kilnhouse mark on the assistant's,
 * none on the visitor's. The provider is told who wrote the message.
 */
export function setupAvatars(): void {
    aparteGlobalConfig.setAvatarProvider({
        render(role, host, context) {
            if (role === 'user') return;
            const face = document.createElement('span');
            if (context?.author?.type === 'human') {
                face.className = 'sw-face sw-face--agent';
                face.textContent = AGENT.initials;
            } else {
                face.className = 'sw-face sw-face--assistant';
                face.innerHTML = MARK_SVG;
            }
            host.append(face);
        },
    });
}

/**
 * Register the handoff tool, and wire the chat for the person who joins. `onJoined` runs once
 * they are in, for the panel's header to say so.
 */
export function setupHandoff(chat: Chat, status: HTMLElement & { show(): void; hide(): void }, onJoined: () => void): void {
    let requested = false;
    let joined = false;
    /** In the conversation, the AI off: from the line on, not from the moment they start joining. */
    let present = false;
    let replies = 0;

    aparteGlobalConfig.registerTool(
        {
            name: HANDOFF_TOOL,
            description: `Hand the conversation to a person on the ${AGENT.team} team.`,
            inputSchema: { type: 'object', properties: { reason: { type: 'string' } } },
        },
        async (call) => {
            requested = true;
            return { toolCallId: call.id, content: `${AGENT.team} has the conversation. A person will reply here.` };
        },
    );
    // The call itself is the model's business: the visitor sees the line when the person joins.
    aparteGlobalConfig.registerToolDisplay(HANDOFF_TOOL, { hidden: true });

    const say = async (line: string, wait: string, ms: number): Promise<void> => {
        status.setAttribute('text', wait);
        status.show();
        await sleep(ms);
        status.hide();
        chat.viewport?.appendMessage({ id: `care-${Date.now()}`, role: 'assistant', author: PERSON, content: line, timestamp: Date.now() });
    };

    // The model's turn has ended with the handoff: the person joins, and the AI steps back.
    chat.addEventListener('aparte-message-done', () => {
        if (!requested || joined) return;
        joined = true;
        void (async () => {
            status.setAttribute('text', `${AGENT.name} from ${AGENT.team} is joining…`);
            status.show();
            await sleep(2200);
            aparteGlobalConfig.setAutoReply(false);
            present = true;
            // A line across the transcript, the moment the conversation changed hands.
            chat.viewport?.appendMessage({ id: `care-joined-${Date.now()}`, role: 'assistant', kind: 'notice', content: `${AGENT.name} joined the conversation`, timestamp: Date.now() });
            await say(GREETING, `${AGENT.firstName} is typing…`, 900);
            onJoined();
        })();
    });

    // From then on the AI is off: the client shows the visitor's message and starts no turn,
    // and the person reads it. The id is the one the client wrote on the send, once it has.
    chat.addEventListener('aparte-send', (event) => {
        if (!present) return;
        const detail = (event as CustomEvent<AparteSendEventDetail>).detail;
        void (async () => {
            await sleep(700);
            if (detail.messageId) chat.viewport?.updateMessage(detail.messageId, { note: `Read by ${AGENT.firstName}` });
            const line = REPLIES[Math.min(replies++, REPLIES.length - 1)] ?? '';
            await say(line, `${AGENT.firstName} is typing…`, 1600);
        })();
    });
}
