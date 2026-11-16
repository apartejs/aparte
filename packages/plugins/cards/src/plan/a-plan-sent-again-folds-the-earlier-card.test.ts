/**
 * A plan sent again folds the earlier card: an agent that calls its plan tool at each step draws
 * a card per call, and the earlier ones stayed whole, their step "in progress" still turning above
 * the card that said it was done. The latest card of a plan (by its title, in one chat) is the
 * plan; an earlier one keeps its header, what it said then, and gives up its steps and its motion.
 * Its ring stops too once the reply is over, whatever the plan last said.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { aparteGlobalConfig, createStreamAdapter, type AparteMessage, type AparteSegment, type AparteStreamRunEvent } from '@aparte/core';
import { setupPlanCard } from './index.js';

type Viewport = HTMLElement & { appendMessage(m: AparteMessage): void; addSegment(segment: AparteSegment): void };

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

async function streaming(): Promise<{ viewport: Viewport; emit: (e: AparteStreamRunEvent) => void }> {
    const chat = document.createElement('div');
    chat.setAttribute('data-aparte-chat', '');
    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    chat.appendChild(viewport);
    document.body.appendChild(chat);
    await vi.waitFor(() => expect(typeof viewport.appendMessage).toBe('function'));
    viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
    const emit = createStreamAdapter({ target: viewport, config: aparteGlobalConfig, messageId: 'a1', observe: false });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    return { viewport, emit };
}

const steps = ['Find the bug', 'Fix it', 'Run the tests'];
const call = (id: string, title: string, ...statuses: string[]): AparteStreamRunEvent[] => [
    { type: 'tool-start', toolCallId: id, name: 'update_plan', input: { title, todos: steps.map((content, i) => ({ content, status: statuses[i] ?? 'pending' })) } },
    { type: 'tool-resolved', toolCallId: id, result: 'ok' },
];

const cards = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('.aparte-plan-card')];
const folded = (root: ParentNode) => cards(root).map((c) => c.hasAttribute('data-plan-superseded'));

describe('a plan sent again', () => {
    it('folds the earlier card of the same plan, and leaves the latest whole', async () => {
        stop = setupPlanCard({ tool: 'update_plan', map: (_result, input) => input });
        const { viewport, emit } = await streaming();
        for (const e of call('c1', 'Fix #42', 'done', 'in-progress')) emit(e);
        await vi.waitFor(() => expect(cards(viewport)).toHaveLength(1));
        await vi.waitFor(() => expect(folded(viewport)).toEqual([false]));

        for (const e of call('c2', 'Fix #42', 'done', 'done', 'done')) emit(e);
        await vi.waitFor(() => expect(cards(viewport)).toHaveLength(2));
        await vi.waitFor(() => expect(folded(viewport)).toEqual([true, false]));
    });

    it('leaves a plan of another title whole', async () => {
        stop = setupPlanCard({ tool: 'update_plan', map: (_result, input) => input });
        const { viewport, emit } = await streaming();
        for (const e of [...call('c1', 'Fix #42', 'in-progress'), ...call('c2', 'Release 1.12', 'in-progress')]) emit(e);
        await vi.waitFor(() => expect(cards(viewport)).toHaveLength(2));
        await new Promise((r) => setTimeout(r, 0));
        expect(folded(viewport)).toEqual([false, false]);
    });

    it('stops turning in a folded card, and in any card once the reply is over', () => {
        const path = ['src/plan/plan.css', 'packages/plugins/cards/src/plan/plan.css'].find((p) => existsSync(p))!;
        const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ');
        expect(css).toContain('.aparte-plan-card[data-plan-superseded] .aparte-plan__spinner');
        expect(css).toContain('.aparte-message[data-streaming="false"] .aparte-plan__spinner');
        expect(css).toMatch(/\.aparte-plan-card\[data-plan-superseded\] \.aparte-plan__steps[^{]*\{ display: none; \}/);
    });
});
