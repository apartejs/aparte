// @vitest-environment jsdom
/**
 * A tool renderer's stylesheet reaches the page when a STORED conversation is drawn.
 *
 * The injection lived inline in two live paths — the client's `tool-start` handler and
 * the stream adapter's — and nowhere on the path that re-renders history. So a custom
 * tool renderer came back styled while its tool ran and bare after a reload: the markup
 * returned (`toolCallRenderer` looks the renderer up and delegates), the CSS did not,
 * because nothing replays `tool-start` for a persisted message. A consumer was
 * re-injecting the styles themselves at startup, which is the shape of a defect in this
 * library rather than a concern of theirs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getSegmentRenderer, registerDefaultRenderers } from '../../segment-renderers.js';
import { aparteGlobalConfig } from '../../../config/aparte-config.js';
import type { AparteToolCallSegment } from '../../../types/index.js';

registerDefaultRenderers();

const SEGMENT = {
    id: 's1', type: 'tool_call', status: 'success',
    toolCall: { id: 'c1', name: 'web_search', input: {} },
} as unknown as AparteToolCallSegment;

afterEach(() => {
    document.getElementById('aparte-tool-renderer-web_search')?.remove();
    aparteGlobalConfig.reset();
});

describe('a tool renderer’s styles on the render path', () => {
    it('are injected when a stored tool call is drawn, with no tool-start in sight', () => {
        aparteGlobalConfig.registerToolRenderer('web_search', {
            render: () => '<div class="mine">searching</div>',
            getStyles: () => '.mine { color: rebeccapurple; }',
        });

        expect(document.getElementById('aparte-tool-renderer-web_search'), 'nothing yet').toBeNull();

        const out = getSegmentRenderer('tool_call')!.render(SEGMENT);
        expect(String(out), 'the custom renderer drew').toContain('class="mine"');

        const sheet = document.getElementById('aparte-tool-renderer-web_search');
        expect(sheet, 'and its stylesheet is on the page').not.toBeNull();
        expect(sheet!.textContent).toContain('rebeccapurple');
    });

    it('are injected once, however many times the segment is drawn', () => {
        aparteGlobalConfig.registerToolRenderer('web_search', {
            render: () => '<div class="mine">searching</div>',
            getStyles: () => '.mine { color: rebeccapurple; }',
        });
        const renderer = getSegmentRenderer('tool_call')!;
        renderer.render(SEGMENT);
        renderer.render(SEGMENT);
        renderer.render(SEGMENT);

        expect(document.querySelectorAll('#aparte-tool-renderer-web_search')).toHaveLength(1);
    });
});
