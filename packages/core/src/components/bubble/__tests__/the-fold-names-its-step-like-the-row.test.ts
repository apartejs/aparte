// @vitest-environment jsdom
/**
 * The fold's live line names its current step the way the step's own row does.
 *
 * It read the display's label by hand, a second spelling of `toolNameOf`: a name the row
 * took from elsewhere — a tool-line provider's, a sub-agent's — never reached the fold, and
 * a label that said nothing left the line blank where the row showed the identifier.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../../config/index.js';
import { registerDefaultRenderers } from '../../../renderers/index.js';
import type { AparteSegment } from '../../../types/index.js';

type BubbleEl = HTMLElement & { addSegment(segment: AparteSegment): void };

function bubble(): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('data-role', 'assistant');
    el.setAttribute('message-id', 'a1');
    el.setAttribute('streaming', '');
    document.body.appendChild(el);
    return el;
}

const call = (id: string, name: string): AparteSegment => ({
    id: `tool-${id}`, type: 'tool_call', status: 'pending', toolCall: { id, name, input: {} },
} as AparteSegment);

/** The fold's live line, and the name on the row of the step it names. */
function names(el: HTMLElement, id: string): { fold: string | null; row: string | null } {
    return {
        fold: el.querySelector('.aparte-turn > summary > .aparte-turn__current')!.textContent,
        row: el.querySelector(`[data-segment-id="${id}"] .aparte-tool-name`)!.textContent,
    };
}

describe('the fold names its step like the row', () => {
    beforeEach(() => {
        registerDefaultRenderers();
        aparteGlobalConfig.setTurnSummary(true);
    });
    afterEach(() => {
        aparteGlobalConfig.reset();
        registerDefaultRenderers();
        document.body.innerHTML = '';
    });

    it("by the tool-line provider's label", () => {
        aparteGlobalConfig.setToolLineProvider((segment) => (segment.toolCall.name === 'delegate' ? { label: 'Explorer' } : undefined));
        const el = bubble();
        el.addSegment(call('a', 'search'));
        el.addSegment(call('b', 'delegate'));
        expect(names(el, 'tool-b')).toEqual({ fold: 'Explorer', row: 'Explorer' });
    });

    it("by the display's label, which wins over the provider's", () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { label: 'Delegated' });
        aparteGlobalConfig.setToolLineProvider(() => ({ label: 'Explorer' }));
        const el = bubble();
        el.addSegment(call('a', 'search'));
        el.addSegment(call('b', 'delegate'));
        expect(names(el, 'tool-b')).toEqual({ fold: 'Delegated', row: 'Delegated' });
    });

    it('by its identifier when a label says nothing', () => {
        aparteGlobalConfig.registerToolDisplay('delegate', { label: () => '' });
        const el = bubble();
        el.addSegment(call('a', 'search'));
        el.addSegment(call('b', 'delegate'));
        expect(names(el, 'tool-b')).toEqual({ fold: 'delegate', row: 'delegate' });
    });
});
