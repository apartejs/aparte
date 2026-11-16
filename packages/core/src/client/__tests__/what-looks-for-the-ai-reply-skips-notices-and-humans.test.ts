// @vitest-environment jsdom
/**
 * A notice and a human message are not the AI's reply.
 *
 * Both sit on the assistant's side of the conversation: a notice ("Marie joined") by
 * convention, an advisor's message because they answer the person. Everything that looks
 * for "the AI's reply" asks `isModelReply` instead of the role — the wire, the abandoned
 * turns, the waiting dots, the model's block grammar, the replies an answer offers, the
 * CSS that keeps the last answer's actions in view.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { wireMessages } from '../wire-history.js';
import { isAwaitingReply } from '../../utils/is-awaiting-reply.js';
import { AparteErrorCode } from '../../types/errors.js';
import { readAparteStylesheet } from '../../__tests__/read-stylesheet.js';
import { codeRenderer } from '../../renderers/segments/code.js';
import { setupSuggestionBlocks } from '../../components/suggestions/suggestion-blocks.js';
import { aparteGlobalConfig } from '../../config/index.js';
import type { AparteSuggestions } from '../../components/suggestions/aparte-suggestions.js';
import type { AparteCodeSegment, AparteMessage, AparteSegment } from '../../types/index.js';
import '../../components/suggestions/aparte-suggestions.js';
import '../../components/viewport/aparte-chat-viewport.js';
import '../../components/bubble/aparte-chat-bubble.js';

const notice: AparteMessage = { id: 'n1', role: 'assistant', kind: 'notice', content: 'Marie joined the conversation', timestamp: 2 };
const human = (content: string, extra: Partial<AparteMessage> = {}): AparteMessage =>
    ({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content, timestamp: 3, ...extra });

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('the wire', () => {
    it('never sends a notice', () => {
        const wire = wireMessages([
            { id: 'u1', role: 'user', content: 'hi', timestamp: 1 },
            notice,
            { id: 'a1', role: 'assistant', content: 'hello', status: 'completed', timestamp: 3 },
        ]);
        expect(JSON.stringify(wire)).not.toContain('Marie joined');
    });

    it('drops a notice before looking for abandoned turns', () => {
        const failed: AparteMessage = {
            id: 'a1', role: 'assistant', content: '', status: 'error', timestamp: 3,
            segments: [{ id: 'e', type: 'error', code: AparteErrorCode.USAGE_CONTEXT_EXCEEDED, content: 'too long' } as AparteSegment],
        };
        // The question failed for good: it goes, though a notice sits between it and its reply.
        expect(wireMessages([{ id: 'u1', role: 'user', content: 'too long?', timestamp: 1 }, notice, failed])).toEqual([]);
    });
});

describe('the waiting dots', () => {
    it('do not treat a text-less human message as a reply in flight', () => {
        expect(isAwaitingReply(human('', { attachments: [{ id: 'f', name: 'shot.png', type: 'image/png', size: 1 } as never] }))).toBe(false);
        expect(isAwaitingReply({ ...notice, content: '' })).toBe(false);
        // The AI's empty shell still is one.
        expect(isAwaitingReply({ role: 'assistant', content: '' })).toBe(true);
    });
});

describe("the model's block grammar", () => {
    it("leaves a human's text as they wrote it", async () => {
        const vp = document.createElement('aparte-chat-viewport') as HTMLElement & {
            appendMessage(m: AparteMessage): void; getMessage(id: string): AparteMessage | undefined;
        };
        document.body.appendChild(vp);
        await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
        vp.appendMessage(human('<think>not a thought</think> and a ```js\nfence\n```'));
        expect(vp.getMessage('h1')?.segments ?? []).toEqual([]);
    });
});

describe('the replies an answer offers', () => {
    it("offers the AI answer's replies when a notice is last", async () => {
        setupSuggestionBlocks();
        const root = document.createElement('div');
        root.setAttribute('data-aparte-chat', '');
        root.innerHTML = '<aparte-chat-viewport></aparte-chat-viewport><aparte-composer></aparte-composer>';
        document.body.appendChild(root);
        const viewport = root.querySelector('aparte-chat-viewport') as HTMLElement;
        const replies = document.createElement('aparte-suggestions') as AparteSuggestions;
        replies.setAttribute('answers', '');
        root.querySelector('aparte-composer')!.appendChild(replies);

        const answer = document.createElement('aparte-chat-bubble');
        answer.setAttribute('data-role', 'assistant');
        viewport.appendChild(answer);
        const segment: AparteCodeSegment = { id: 's1', type: 'code', language: 'suggestions', content: '["Yes", "No"]', isStreaming: false };
        const holder = document.createElement('div');
        holder.innerHTML = codeRenderer.render(segment) as string;
        const el = holder.firstElementChild as HTMLElement;
        answer.appendChild(el);
        codeRenderer.setup?.(el, segment);

        const line = document.createElement('aparte-chat-bubble');
        line.setAttribute('data-role', 'assistant');
        line.setAttribute('data-kind', 'notice');
        viewport.appendChild(line);

        await vi.waitFor(() => expect([...replies.querySelectorAll('button.aparte-suggestion')].map((b) => b.textContent)).toEqual(['Yes', 'No']));
    });
});

describe("the last answer's action bar", () => {
    it('stays in view when a notice comes after it', () => {
        const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
        expect(css).toMatch(/aparte-chat-bubble:not\(\[data-kind\]\):not\(:has\(~ aparte-chat-bubble:not\(\[data-kind\]\)\)\)/);
    });
});
