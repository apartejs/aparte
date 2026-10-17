/**
 * The handoff to a person: the `handoff_to_human` tool the model calls, the status line while
 * someone joins, their messages under their own name and avatar, and, once they are in, the
 * composer's messages going to them instead of the model.
 *
 * Here the person is scripted, like the model. In a real widget `join()` is your support
 * backend accepting the conversation, and `toAgent()` posts the visitor's message to it.
 */
import { aparteGlobalConfig, filesToAttachments } from '@aparte/core';
import type { AparteMessage, AparteSendEventDetail, AparteToolCallSegment } from '@aparte/core';
import { AGENT, MARK_SVG } from './brand';

export const HANDOFF_TOOL = 'handoff_to_human';

interface Viewport extends HTMLElement {
    appendMessage(message: AparteMessage): void;
}

type Chat = HTMLElement & { viewport: Viewport | null };

const GREETING = `Hi, I’m ${AGENT.firstName} from ${AGENT.team}. I’ve read your conversation with Wren, so no need to repeat anything. What can I help with?`;
const REPLIES = [
    'Thanks, I’m opening your studio’s account now. Give me a minute.',
    'Got it. I’ll stay on this conversation until it’s sorted.',
];

/** The messages the person wrote: the avatar provider draws their face on these. */
const fromAgent = new Set<string>();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The avatars: the person's initials on their messages, the Kilnhouse mark on the assistant's,
 * none on the visitor's. A message carries no author, only a role, so the provider tells the
 * person's messages apart by their id.
 */
export function setupAvatars(): void {
    aparteGlobalConfig.setAvatarProvider({
        render(role, host) {
            if (role === 'user') return;
            const id = host.closest('aparte-chat-bubble')?.getAttribute('message-id') ?? '';
            const face = document.createElement('span');
            if (fromAgent.has(id)) {
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
 * Register the handoff tool and its rendering, and wire the chat for the person who joins.
 * `onJoined` runs once they are in, for the panel's header to say so.
 */
export function setupHandoff(chat: Chat, status: HTMLElement & { show(): void; hide(): void }, onJoined: () => void): void {
    let requested = false;
    let joined = false;
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
    // The call reads as a line across the transcript, the moment the conversation changed hands.
    const drawDivider = (root: HTMLElement, segment: AparteToolCallSegment): void => {
        const label = document.createElement('span');
        label.className = 'aparte-divider__label';
        label.textContent = segment.status === 'resolved' ? `Passed to ${AGENT.team}` : `Passing you to ${AGENT.team}…`;
        root.replaceChildren(label);
    };
    aparteGlobalConfig.registerToolRenderer(HANDOFF_TOOL, {
        render(segment) {
            const root = document.createElement('div');
            root.className = 'aparte-divider aparte-divider--label';
            drawDivider(root, segment);
            return root;
        },
        update: drawDivider,
    });

    const say = async (line: string, wait: string, ms: number): Promise<void> => {
        status.setAttribute('text', wait);
        status.show();
        await sleep(ms);
        status.hide();
        const id = `agent-${Date.now()}`;
        fromAgent.add(id);
        chat.viewport?.appendMessage({ id, role: 'assistant', content: line, timestamp: Date.now() });
        // The bubble's `name` is its author: the role alone would print the assistant's.
        chat.viewport?.querySelector(`aparte-chat-bubble[message-id="${id}"]`)?.setAttribute('name', AGENT.name);
    };

    // The model's turn has ended with the handoff: the person joins.
    chat.addEventListener('aparte-message-done', () => {
        if (!requested || joined) return;
        joined = true;
        void say(GREETING, `${AGENT.name} from ${AGENT.team} is joining…`, 2200).then(onJoined);
    });

    // From then on the visitor talks to the person. The client listens on the window, so a send
    // stopped here never reaches the model.
    chat.addEventListener('aparte-send', (event) => {
        if (!joined) return;
        event.stopPropagation();
        const { content, files } = (event as CustomEvent<AparteSendEventDetail>).detail;
        chat.viewport?.appendMessage({
            id: `visitor-${Date.now()}`,
            role: 'user',
            content,
            timestamp: Date.now(),
            ...(files?.length ? { attachments: filesToAttachments(files) } : {}),
        });
        const line = REPLIES[Math.min(replies++, REPLIES.length - 1)] ?? '';
        void say(line, `${AGENT.firstName} is typing…`, 1600);
    });
}
