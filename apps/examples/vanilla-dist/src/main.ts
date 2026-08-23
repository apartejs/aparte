import '@aparte/core'; // registers the <aparte-*> custom elements
import '@aparte/core/styles.css';
import './style.css';
import { registerDefaultRenderers } from '@aparte/core';

registerDefaultRenderers();

// Minimal surface of the <aparte-chat-viewport> we drive imperatively.
interface Viewport {
    appendMessage(m: { id: string; role: string; content: string; timestamp: number }): void;
    appendToken(id: string, chunk: string): void;
    completeMessage(id: string): void;
    addSegment(messageId: string, segment: Record<string, unknown>): void;
    updateSegment(messageId: string, segmentId: string, updates: Record<string, unknown>): void;
}

const chat = document.querySelector('aparte-chat') as (HTMLElement & { viewport?: Viewport | null }) | null;
const vp = (): Viewport | null | undefined => chat?.viewport;

let n = 0;
let pending: { messageId: string; segId: string } | null = null;

/** Stream a canned reply into a fresh assistant bubble, a few chars at a time. */
function streamReply(text: string): void {
    const id = `a-${++n}`;
    vp()?.appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });
    const tokens = text.split(/(\s+)/);
    let i = 0;
    const timer = window.setInterval(() => {
        if (i >= tokens.length) {
            window.clearInterval(timer);
            vp()?.completeMessage(id);
            return;
        }
        vp()?.appendToken(id, tokens[i++]);
    }, 22);
}

/** Human-in-the-loop: inject a tool_call segment awaiting approval. The default
 *  renderer shows Approve/Reject and dispatches `aparte-tool-decision`. */
function askApproval(): void {
    const id = `a-${++n}`;
    const segId = `seg-${n}`;
    const toolCallId = `tc-${n}`;
    vp()?.appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });
    vp()?.addSegment(id, {
        id: segId,
        type: 'tool_call',
        status: 'awaiting-approval',
        toolCall: { id: toolCallId, name: 'delete_files', input: { path: '~/notes/todo.md' } },
    });
    pending = { messageId: id, segId };
}

document.addEventListener('aparte-tool-decision', (e) => {
    if (!pending) return;
    const { approved } = (e as CustomEvent<{ approved: boolean }>).detail;
    vp()?.updateSegment(pending.messageId, pending.segId, { status: approved ? 'resolved' : 'rejected' });
    pending = null;
    streamReply(approved ? 'Approved — the file would be deleted here.' : 'Rejected — nothing happened.');
});

chat?.addEventListener('aparte-send', (e) => {
    const text = (e as CustomEvent<{ content: string }>).detail.content;
    vp()?.appendMessage({ id: `u-${++n}`, role: 'user', content: text, timestamp: Date.now() });
    if (text.trim().toLowerCase().includes('delete')) askApproval();
    else streamReply(`You said: "${text}". This demo streams a local echo — type "delete" to see a human-in-the-loop tool approval.`);
});
