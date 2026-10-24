// @vitest-environment jsdom
/**
 * A call the app hides is still a call: in the message, in storage, in the model's history.
 *
 * "An empty render at tool-start keeps a call out of the reply" was implemented by never
 * adding the segment. The history a later turn sends is rebuilt from the message's
 * segments (`wireTurns`), so from the next turn on the model no longer saw a call it had
 * made, nor its answer — and a reload drew the default row for a call the live chat had
 * hidden, because the render path fell back to it. Hiding is now a display: the segment
 * is added like any other and draws an empty, hidden placeholder, live and restored.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createStreamAdapter } from '../stream-adapter.js';
import { aparteGlobalConfig } from '../../config/index.js';
import { getSegmentRenderer, registerDefaultRenderers } from '../../renderers/segment-renderers.js';
import '../../components/bubble/aparte-chat-bubble.js';
import type { AparteSegment, AparteToolCallSegment, AparteMessage } from '../../types/index.js';

registerDefaultRenderers();

afterEach(() => {
    aparteGlobalConfig.reset();
    document.body.innerHTML = '';
});

function started(name: string): AparteSegment[] {
    const added: AparteSegment[] = [];
    const emit = createStreamAdapter({
        target: { addSegment: (s: AparteSegment) => { added.push(s); }, updateSegment: () => {}, updateMessage: () => {}, dispatchEvent: () => true },
        config: aparteGlobalConfig,
        messageId: 'm1',
    });
    emit({ type: 'tool-start', toolCallId: 'c1', name, input: {} });
    return added;
}

const call = (name: string, over: Partial<AparteToolCallSegment> = {}): AparteToolCallSegment => ({
    id: 'tool-c1', type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: 'c1', name, input: { q: 1 } }, result: 'done',
    ...over,
} as AparteToolCallSegment);

function draw(segment: AparteToolCallSegment): HTMLElement {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(getSegmentRenderer('tool_call')!.render(segment)).trim();
    const el = tpl.content.firstElementChild as HTMLElement;
    document.body.appendChild(el);
    return el;
}

describe('a hidden call is in the message', () => {
    it('one whose renderer draws nothing is added all the same', () => {
        aparteGlobalConfig.registerToolRenderer('secret', { render: () => '' });
        expect(started('secret').map((s) => s.id)).toEqual(['tool-c1']);
    });

    it('one the display hides is added all the same', () => {
        aparteGlobalConfig.registerToolDisplay('*', { hidden: true });
        expect(started('secret').map((s) => s.id)).toEqual(['tool-c1']);
    });
});

describe('a hidden call draws a hidden placeholder', () => {
    it('from the display, restored or live — the same element either way', () => {
        aparteGlobalConfig.registerToolDisplay('secret', { hidden: true });
        const el = draw(call('secret'));
        expect(el.hidden).toBe(true);
        expect(el.children).toHaveLength(0);
        expect(el.getAttribute('data-tool-name')).toBe('secret');
        expect(el.getAttribute('data-status')).toBe('resolved');
    });

    it('from a renderer that draws nothing — no longer the default row', () => {
        aparteGlobalConfig.registerToolRenderer('secret', { render: () => '' });
        const el = draw(call('secret'));
        expect(el.hidden).toBe(true);
        expect(el.querySelector('.aparte-tool-label')).toBeNull();
    });

    it('patches its status in place', () => {
        aparteGlobalConfig.registerToolDisplay('secret', { hidden: true });
        const el = draw(call('secret', { status: 'pending', result: undefined }));
        getSegmentRenderer('tool_call')!.update!(el, call('secret'));
        expect(el.isConnected).toBe(true);
        expect(el.getAttribute('data-status')).toBe('resolved');
    });

    it('the stylesheet keeps it out of the layout', async () => {
        const { readAparteStylesheet } = await import('../../__tests__/read-stylesheet.js');
        expect(readAparteStylesheet()).toMatch(/\.aparte-segment-tool-call\[hidden\]\s*\{\s*display:\s*none/);
    });
});

describe('which wins: a hide or a renderer', () => {
    it('a renderer more specific than the hide draws: "*" hidden does not hide a tool with its own', () => {
        aparteGlobalConfig.registerToolDisplay('*', { hidden: true });
        aparteGlobalConfig.registerToolRenderer('ask_user', { render: () => '<div class="receipt"></div>' });
        expect(aparteGlobalConfig.isToolHidden('ask_user')).toBe(false);
        expect(draw(call('ask_user')).classList.contains('receipt')).toBe(true);
        expect(aparteGlobalConfig.isToolHidden('web_search')).toBe(true);
    });

    it('a hide as specific as the renderer wins: the app said so for this tool', () => {
        aparteGlobalConfig.registerToolRenderer('ask_user', { render: () => '<div class="receipt"></div>' });
        aparteGlobalConfig.registerToolDisplay('ask_user', { hidden: true });
        expect(aparteGlobalConfig.isToolHidden('ask_user')).toBe(true);
    });

    it('a hide more specific than a "*" renderer wins', () => {
        aparteGlobalConfig.registerToolRenderer('*', { render: () => '<div class="any"></div>' });
        aparteGlobalConfig.registerToolDisplay(/^internal_/, { hidden: true });
        expect(aparteGlobalConfig.isToolHidden('internal_log')).toBe(true);
        expect(aparteGlobalConfig.isToolHidden('web_search')).toBe(false);
    });
});

describe('a turn of nothing but hidden calls', () => {
    it('renders no chrome once settled, like any turn with nothing to show', () => {
        aparteGlobalConfig.registerToolDisplay('*', { hidden: true });
        const el = document.createElement('aparte-chat-bubble') as HTMLElement & {
            setSegments(s: AparteSegment[]): void; updateMessage(u: Partial<AparteMessage>): void;
        };
        el.setAttribute('data-role', 'assistant');
        el.setAttribute('message-id', 'm1');
        document.body.appendChild(el);
        el.setSegments([call('secret')]);
        el.updateMessage({ status: 'completed' });
        expect(el.querySelector('.aparte-message')!.hasAttribute('data-empty')).toBe(true);
    });
});

describe('a hidden call reaches the model on the next turn', () => {
    it('the message the adapter built sends the call and its answer through wireTurns', async () => {
        const { wireTurns } = await import('../wire-history.js');
        aparteGlobalConfig.registerToolDisplay('*', { hidden: true });
        const segments: AparteSegment[] = [];
        const emit = createStreamAdapter({
            target: {
                addSegment: (s: AparteSegment) => { segments.push(s); },
                updateSegment: (id: string, u: Partial<AparteSegment>) => {
                    const i = segments.findIndex((s) => s.id === id);
                    if (i !== -1) segments[i] = { ...segments[i], ...u } as AparteSegment;
                },
                updateMessage: () => {}, dispatchEvent: () => true,
            },
            config: aparteGlobalConfig,
            messageId: 'm1',
        });
        emit({ type: 'tool-start', toolCallId: 'c1', name: 'lookup', input: { q: 'x' } });
        emit({ type: 'tool-resolved', toolCallId: 'c1', result: 'found' });
        const message = { id: 'm1', role: 'assistant', content: '', timestamp: 1, status: 'completed', segments } as AparteMessage;
        const history = wireTurns(message, () => '');
        expect(history).toEqual([
            { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'lookup', input: { q: 'x' } }] },
            { role: 'tool', content: 'found', toolCallId: 'c1', toolName: 'lookup' },
        ]);
    });
});
