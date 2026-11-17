// @vitest-environment jsdom
/**
 * The actions under a message follow who wrote it.
 *
 * Regenerate, the model's stats and the thumbs speak about a generation: an advisor's
 * message offers none of them (copy stays). An app's own action can say which authors it
 * is for (`bubble.authorTypes`). And a message a human message or a notice follows offers
 * no regenerate and no edit: either would drop what the advisor wrote from the path.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '../aparte-chat-bubble.js';
import '../../viewport/aparte-chat-viewport.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { readAparteStylesheet } from '../../../__tests__/read-stylesheet.js';
import type { AparteMessage } from '../../../types/index.js';

type Viewport = HTMLElement & { appendMessage(m: AparteMessage): void };

async function viewport(): Promise<Viewport> {
    const vp = document.createElement('aparte-chat-viewport') as unknown as Viewport;
    document.body.appendChild(vp);
    await vi.waitFor(() => expect(typeof vp.appendMessage).toBe('function'));
    return vp;
}
const actionsOf = (vp: HTMLElement, id: string) =>
    [...vp.querySelectorAll(`aparte-chat-bubble[message-id="${id}"] .aparte-action-bar [data-action]`)]
        .filter((b) => !(b as HTMLElement).hidden)
        .map((b) => b.getAttribute('data-action'));

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

describe('actions and the author', () => {
    it("offers no regenerate and no thumbs on a human's message, and keeps copy", async () => {
        aparteGlobalConfig.setBubbleActions({ copy: true, retry: true, feedback: true });
        const vp = await viewport();
        vp.appendMessage({ id: 'a1', role: 'assistant', content: 'From the AI.', status: 'completed', timestamp: 1 });
        vp.appendMessage({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'From Marie.', timestamp: 2 });

        expect(actionsOf(vp, 'a1')).toEqual(['copy', 'retry', 'feedback-positive', 'feedback-negative']);
        expect(actionsOf(vp, 'h1')).toEqual(['copy']);
    });

    it('shows an action only on the author types it names', async () => {
        aparteGlobalConfig.registerAction({ id: 'escalate', label: 'Escalate', zones: ['bubble'], bubble: { roles: ['assistant'], authorTypes: ['human'] } });
        const vp = await viewport();
        vp.appendMessage({ id: 'a1', role: 'assistant', content: 'From the AI.', status: 'completed', timestamp: 1 });
        vp.appendMessage({ id: 'h1', role: 'assistant', author: { name: 'Marie', type: 'human' }, content: 'From Marie.', timestamp: 2 });

        const custom = (id: string) => vp.querySelector(`aparte-chat-bubble[message-id="${id}"] [data-action="custom:escalate"]`);
        expect(custom('h1')).not.toBeNull();
        expect(custom('a1')).toBeNull();
    });

    it('hides regenerate and edit on a message a human message or a notice follows', () => {
        const css = readAparteStylesheet().replace(/\/\*[\s\S]*?\*\//g, '');
        expect(css).toMatch(/aparte-chat-bubble:has\(~ aparte-chat-bubble:is\(\[data-kind="notice"\], \[data-role="assistant"\]\[data-author-type="human"\]\)\) \.aparte-action-bar :is\(\[data-action="retry"\], \[data-action="edit"\]\)/);
    });
});
