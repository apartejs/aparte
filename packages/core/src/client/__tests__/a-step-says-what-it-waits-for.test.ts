// @vitest-environment jsdom
/**
 * A step says what it waits for: `step-start` carries `detail`, `step-update` changes it in place,
 * and the step's label is handed both, with the reply's id.
 *
 * A server waiting for a slot of a local engine knows who holds it ("Login refactor is running
 * pnpm test"); the words belong to the page. A step carried its name alone, and its label saw only
 * the name: an app kept the last holder in a module of its own, read it from the label, ended and
 * restarted the step to have the words asked again, and two chats waiting showed the last one told.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/bubble/aparte-chat-bubble.js';
import { createStreamAdapter, type AparteStreamRunEvent } from '../stream-adapter.js';
import { AparteConfig, aparteGlobalConfig } from '../../config/index.js';
import type { AparteStepLabelContext } from '../../config/step-label.js';

afterEach(() => {
    document.body.innerHTML = '';
    aparteGlobalConfig.reset();
});

function target() {
    const steps: [string, string | null, Record<string, unknown> | undefined][] = [];
    return {
        steps,
        setStep: (id: string, name: string | null, detail?: Record<string, unknown>) => { steps.push([id, name, detail]); },
        addSegment: () => {}, updateSegment: () => {}, updateMessage: () => {}, dispatchEvent: () => true,
    };
}

describe('a step with data', () => {
    it('hands its detail to the target, and an update hands the new one without opening a step', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'run-start' });
        emit({ type: 'step-start', name: 'slot-wait', detail: { holder: 'Login refactor' } } as AparteStreamRunEvent);
        emit({ type: 'step-update', name: 'slot-wait', detail: { holder: 'Docs pass' } } as AparteStreamRunEvent);
        emit({ type: 'step-end', name: 'slot-wait' });
        expect(t.steps).toEqual([
            ['m1', 'slot-wait', { holder: 'Login refactor' }],
            ['m1', 'slot-wait', { holder: 'Docs pass' }],
            ['m1', null, undefined],
        ]);
    });

    it('a second step-start of the same name still opens a nested step, as before', () => {
        const t = target();
        const emit = createStreamAdapter({ target: t, config: new AparteConfig(), messageId: 'm1' });
        emit({ type: 'step-start', name: 'read' });
        emit({ type: 'step-start', name: 'read' });
        emit({ type: 'step-end', name: 'read' });
        expect(t.steps.at(-1)?.[1]).toBe('read');
        emit({ type: 'step-end', name: 'read' });
        expect(t.steps.at(-1)?.[1]).toBeNull();
    });

    it('is drawn with a label that reads the detail and the reply\'s id, and drawn again when it changes', () => {
        const told: AparteStepLabelContext[] = [];
        aparteGlobalConfig.registerStepLabel('slot-wait', (ctx) => {
            told.push(ctx);
            return `Waiting for the engine: ${String(ctx.detail?.['holder'])} is running`;
        });
        const bubble = document.createElement('aparte-chat-bubble') as HTMLElement & { setStep(name: string | null, detail?: Record<string, unknown>): void };
        bubble.setAttribute('data-role', 'assistant');
        bubble.setAttribute('message-id', 'a1');
        bubble.setAttribute('streaming', '');
        document.body.appendChild(bubble);
        bubble.setStep('slot-wait', { holder: 'Login refactor' });
        const words = () => bubble.querySelector('.aparte-waiting-step')?.textContent ?? '';
        expect(words()).toBe('Waiting for the engine: Login refactor is running');
        expect(told.at(-1)).toMatchObject({ name: 'slot-wait', messageId: 'a1', detail: { holder: 'Login refactor' } });
        bubble.setStep('slot-wait', { holder: 'Docs pass' });
        expect(words()).toBe('Waiting for the engine: Docs pass is running');
    });
});
