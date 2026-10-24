// @vitest-environment jsdom
/**
 * A renderer registered for a pattern or for '*' draws every tool it names — and puts
 * its stylesheet on the page once, not once per tool.
 *
 * The injection was keyed by tool NAME, which was the renderer's identity while a
 * renderer named one tool. A '*' renderer names them all, so the page gained a copy of
 * the same rules for every tool the model called.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import { createStreamAdapter } from '../../../client/stream-adapter.js';
import type { AparteSegment, AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();

const call = (name: string): AparteToolCallSegment => ({
    id: `s-${name}`, type: 'tool_call', messageId: 'm1', index: 0, status: 'resolved',
    toolCall: { id: `c-${name}`, name, input: {} },
} as AparteToolCallSegment);

const CSS = '.any-tool { outline: 1px dashed; }';
const sheets = () => [...document.head.querySelectorAll('style')].filter((s) => s.textContent === CSS);

afterEach(() => {
    for (const s of sheets()) s.remove();
    aparteGlobalConfig.reset();
});

describe('a renderer for many tools', () => {
    it('draws each of them, and its stylesheet lands once', () => {
        aparteGlobalConfig.registerToolRenderer('*', { render: (s) => `<div class="any-tool">${s.toolCall.name}</div>`, getStyles: () => CSS });
        const renderer = getSegmentRenderer('tool_call')!;
        expect(String(renderer.render(call('web_search')))).toContain('class="any-tool"');
        expect(String(renderer.render(call('read_file')))).toContain('class="any-tool"');
        expect(sheets()).toHaveLength(1);
    });

    it('on the live path too: a call a pattern names is added and styled once', () => {
        aparteGlobalConfig.registerToolRenderer(/^mcp__/, { render: () => '<div class="any-tool"></div>', getStyles: () => CSS });
        const added: AparteSegment[] = [];
        const emit = createStreamAdapter({
            target: { addSegment: (s: AparteSegment) => { added.push(s); }, updateSegment: () => {}, updateMessage: () => {}, dispatchEvent: () => true },
            config: aparteGlobalConfig,
            messageId: 'm1',
        });
        emit({ type: 'tool-start', toolCallId: 'a', name: 'mcp__github__get_issue', input: {} });
        emit({ type: 'tool-start', toolCallId: 'b', name: 'mcp__linear__get', input: {} });
        expect(added.map((s) => s.id)).toEqual(['tool-a', 'tool-b']);
        expect(sheets()).toHaveLength(1);
    });
});
