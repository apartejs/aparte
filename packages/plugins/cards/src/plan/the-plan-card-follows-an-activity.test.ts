/**
 * The plan card drawn from an agent's activity: `setupPlanCard({ activity: 'plan' })` draws the
 * content of every `plan` activity, in any shape `readPlan` reads, and each time the agent sends
 * it again the SAME card is patched — never a second card, never a rebuilt one. The tool path
 * still works beside it, and taking the card off leaves the activity drawing nothing again.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { aparteGlobalConfig, createStreamAdapter, type AparteMessage, type AparteSegment, type AparteStreamRunEvent } from '@aparte/core';
import { setupPlanCard } from './index.js';

type Viewport = HTMLElement & {
    appendMessage(m: AparteMessage): void;
    addSegment(segment: AparteSegment): void;
    updateSegment(segmentId: string, updates: Partial<AparteSegment>): void;
};

let stop: () => void = () => {};
beforeEach(() => aparteGlobalConfig.extendLocale({ tag: 'en-US' }));
afterEach(() => {
    stop();
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

async function streaming(): Promise<{ viewport: Viewport; emit: (e: AparteStreamRunEvent) => void }> {
    const viewport = document.createElement('aparte-chat-viewport') as Viewport;
    document.body.appendChild(viewport);
    await vi.waitFor(() => expect(typeof viewport.appendMessage).toBe('function'));
    viewport.appendMessage({ id: 'a1', role: 'assistant', content: '', timestamp: 1, status: 'streaming' });
    const emit = createStreamAdapter({ target: viewport, config: aparteGlobalConfig, messageId: 'a1', observe: false });
    emit({ type: 'run-start' });
    emit({ type: 'turn-start' });
    return { viewport, emit };
}

/** Claude Code's todo list, as an agent reports it while it works. */
const todos = (...statuses: string[]) => ({
    todos: ['Read the parser', 'Find the callers', 'Run the tests'].map((content, i) => ({ content, activeForm: `${content}…`, status: statuses[i] ?? 'pending' })),
});
const plan = (statuses: string[], type = 'plan') => ({ type: 'activity' as const, id: 'p1', activityType: type, content: todos(...statuses) });

const card = (root: ParentNode) => root.querySelector<HTMLElement>('.aparte-plan-card');
const statuses = (root: ParentNode) => [...root.querySelectorAll('.aparte-plan__step')].map((n) => n.getAttribute('data-status'));

describe('the plan card follows an activity', () => {
    it('draws the activity’s content as the card, and patches the same card as the agent ticks it', async () => {
        stop = setupPlanCard({ activity: 'plan' });
        const { viewport, emit } = await streaming();
        emit(plan(['in-progress']));
        await vi.waitFor(() => expect(card(viewport)).not.toBeNull());
        const first = card(viewport)!;
        expect(statuses(first)).toEqual(['in-progress', 'pending', 'pending']);
        expect(first.querySelector('.aparte-plan__count')?.textContent).toBe('0 of 3 done');
        // A mark on the element itself: a card drawn anew would not carry it.
        (first as HTMLElement & { mark?: boolean }).mark = true;

        emit(plan(['done', 'in-progress']));
        await vi.waitFor(() => expect(statuses(viewport)).toEqual(['done', 'in-progress', 'pending']));
        emit(plan(['done', 'done', 'done']));
        await vi.waitFor(() => expect(statuses(viewport)).toEqual(['done', 'done', 'done']));
        expect(card(viewport)).toBe(first);
        expect((card(viewport) as HTMLElement & { mark?: boolean }).mark).toBe(true);
        expect(viewport.querySelectorAll('.aparte-plan-card')).toHaveLength(1);
        expect(first.querySelector('.aparte-plan__count')?.textContent).toBe('3 of 3 done');
    });

    it('takes a list of activity types, and reads a Markdown checklist as well as a todo list', async () => {
        stop = setupPlanCard({ activity: ['plan', 'todo'] });
        const { viewport, emit } = await streaming();
        emit({ type: 'activity', id: 't1', activityType: 'todo', content: '- [x] Read the parser\n- [ ] Fix it' });
        await vi.waitFor(() => expect(statuses(viewport)).toEqual(['done', 'pending']));
    });

    it('draws nothing for content that holds no plan yet, then the card once it does', async () => {
        stop = setupPlanCard({ activity: 'plan' });
        const { viewport, emit } = await streaming();
        emit({ type: 'activity', id: 'p1', activityType: 'plan', content: { steps: [] } });
        await vi.waitFor(() => expect(viewport.querySelector('[data-segment-id="activity-p1"]')).not.toBeNull());
        expect(card(viewport)).toBeNull();
        emit(plan(['in-progress']));
        await vi.waitFor(() => expect(statuses(viewport)).toEqual(['in-progress', 'pending', 'pending']));
    });

    it('keeps the card it drew when an update cannot be read', async () => {
        stop = setupPlanCard({ activity: 'plan' });
        const { viewport, emit } = await streaming();
        emit(plan(['done']));
        await vi.waitFor(() => expect(card(viewport)).not.toBeNull());
        const first = card(viewport)!;
        emit({ type: 'activity', id: 'p1', activityType: 'plan', content: 42 });
        await new Promise((r) => setTimeout(r, 30));
        expect(card(viewport)).toBe(first);
        expect(statuses(first)).toEqual(['done', 'pending', 'pending']);
    });

    it('draws a tool’s result and an activity side by side when both are set', async () => {
        stop = setupPlanCard({ tool: 'update_plan', map: (_result, input) => input, activity: 'plan' });
        const { viewport, emit } = await streaming();
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'update_plan', input: todos('done') });
        emit({ type: 'tool-resolved', toolCallId: 'c1', result: 'ok' });
        emit(plan(['in-progress']));
        await vi.waitFor(() => expect(viewport.querySelectorAll('.aparte-plan-card')).toHaveLength(2));
        const [fromTool, fromActivity] = [...viewport.querySelectorAll('.aparte-plan-card')];
        expect(statuses(fromTool!)).toEqual(['done', 'pending', 'pending']);
        expect(statuses(fromActivity!)).toEqual(['in-progress', 'pending', 'pending']);
    });

    it('leaves another activity type alone, and draws nothing once taken off', async () => {
        stop = setupPlanCard({ activity: 'plan' });
        const { viewport, emit } = await streaming();
        emit(plan(['done'], 'search-progress'));
        await vi.waitFor(() => expect(viewport.querySelector('[data-segment-id="activity-p1"]')).not.toBeNull());
        expect(card(viewport)).toBeNull();
        stop();
        stop = () => {};
        expect(aparteGlobalConfig.getActivityRenderer('plan')).toBeUndefined();
    });
});
