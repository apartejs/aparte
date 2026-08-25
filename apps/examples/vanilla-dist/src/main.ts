import '@aparte/core'; // registers the <aparte-*> custom elements
import '@aparte/core/styles.css'; // through the export, not a CSS @import
// The APP SHELL's stylesheet is a <link> in index.html — see the comment there.
import { registerDefaultRenderers, aparteGlobalConfig } from '@aparte/core';

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

/**
 * Human-in-the-loop, with no client and no loop.
 *
 * The pill in the transcript is the ANCHOR — which tool is waiting — and the choices
 * are asked at the composer through `requestUserInput`, the same function the built-in
 * gate calls. That is the whole of what a host owes it, and doing it from the PUBLISHED
 * dist is the point of this example: the capability is not hostage to `AparteClient`.
 */
async function askApproval(): Promise<void> {
    const id = `a-${++n}`;
    const segId = `seg-${n}`;
    vp()?.appendMessage({ id, role: 'assistant', content: '', timestamp: Date.now() });
    vp()?.addSegment(id, {
        id: segId,
        type: 'tool_call',
        status: 'awaiting-approval',
        toolCall: { id: `tc-${n}`, name: 'delete_files', input: { path: '~/notes/todo.md' } },
    });

    try {
        const answer = await aparteGlobalConfig.requestUserInput({
            kind: 'approval',
            message: 'Run delete_files?',
            // Ours to write: core cannot know what this app can honour.
            options: [
                { value: 'allow', label: 'Approve', tone: 'affirm' },
                { value: 'deny', label: 'Reject', tone: 'deny' },
            ],
        });
        const picked = answer.action === 'accept'
            ? (answer.content as { option?: string; instruction?: string })
            : {};
        const approved = !picked.instruction && picked.option === 'allow';
        vp()?.updateSegment(id, segId, { status: approved ? 'resolved' : 'rejected' });
        streamReply(approved
            ? 'Approved — the file would be deleted here.'
            : picked.instruction
                ? `Understood: ${picked.instruction}`
                : 'Rejected — nothing happened.');
    } catch {
        // Ended without an answer: the panel was taken away, or nothing could ask.
        vp()?.updateSegment(id, segId, { status: 'aborted' });
    }
}

chat?.addEventListener('aparte-send', (e) => {
    const text = (e as CustomEvent<{ content: string }>).detail.content;
    vp()?.appendMessage({ id: `u-${++n}`, role: 'user', content: text, timestamp: Date.now() });
    if (text.trim().toLowerCase().includes('delete')) askApproval();
    else streamReply(`You said: "${text}". This demo streams a local echo — type "delete" to see a human-in-the-loop tool approval.`);
});
