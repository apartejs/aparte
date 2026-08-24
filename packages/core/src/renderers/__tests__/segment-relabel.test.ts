// @vitest-environment jsdom
/**
 * A config change reaches the text INSIDE a rendered segment — without rebuilding it.
 *
 * The cheap way to do this would have been to re-render the segments container on
 * every config change. An audit rejected it, and the reasons are the assertions at
 * the bottom of this file: rebuilding destroys state the DOM owns and the segment
 * data does not — a reasoning block the reader expanded by clicking `<summary>`
 * (which never writes back to `collapsed`), scroll position inside a long pane, the
 * focus on an Approve/Reject gate, a mounted sandboxed preview running model-authored
 * code — and it fires container-wide childList mutations, which the viewport reads as
 * "scroll to the bottom".
 *
 * So `relabel(element, segment)` is bound by the same rule as `update()`: attributes
 * and text only, no child node added or removed. These tests assert both halves —
 * that the label changed, and that the element is the same node it was.
 */
import { describe, it, expect, afterEach } from 'vitest';
import '../../components/bubble/aparte-chat-bubble.js';
import { aparteGlobalConfig } from '../../config/aparte-config.js';
import type { AparteSegment, AparteToolCallSegment } from '../../types/index.js';

interface BubbleEl extends HTMLElement {
    setSegments(segments: AparteSegment[]): void;
}

function mount(segments: AparteSegment[]): BubbleEl {
    const el = document.createElement('aparte-chat-bubble') as BubbleEl;
    el.setAttribute('message-id', 'm1');
    el.setAttribute('data-role', 'assistant');
    document.body.appendChild(el);
    el.setSegments(segments);
    return el;
}

/** Only the keys these renderers already read — new ones are a separate change. */
const FR = () => ({
    ...aparteGlobalConfig.getLocale(),
    thinking: 'Réflexion',
    copy: 'Copier',
    run: 'Exécuter',
    running: 'En cours…',
    approveTool: 'Approuver',
    rejectTool: 'Refuser',
});

const seg = (s: Partial<AparteSegment> & { id: string; type: string }) => s as AparteSegment;

afterEach(() => { document.body.innerHTML = ''; aparteGlobalConfig.reset(); });

describe('relabel reaches a rendered segment', () => {
    it('the reasoning block’s default label', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', isStreaming: false })]);
        const label = el.querySelector('.thinking-label')!;

        aparteGlobalConfig.setLocale(FR());

        expect(label.textContent).toBe('Réflexion');
    });

    it('but never a label the app set itself', () => {
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', label: 'Analysis' })]);

        aparteGlobalConfig.setLocale(FR());

        expect(el.querySelector('.thinking-label')!.textContent).toBe('Analysis');
    });

    it('a code block’s copy button — tooltip and glyph', () => {
        const el = mount([seg({ id: 's1', type: 'code', content: 'x', language: 'ts' })]);
        const btn = el.querySelector('.code-copy')!;

        aparteGlobalConfig.setLocale(FR());
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-mine="1"></svg>' });

        expect(btn.getAttribute('title')).toBe('Copier');
        expect(btn.innerHTML).toContain('data-mine');
    });

    it('the human approval gate — the highest-stakes strings in the library', () => {
        const el = mount([{
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 'tc1', name: 'delete_file', input: {} },
        } as AparteToolCallSegment]);
        const approve = el.querySelector('.tool-approve-btn')!;
        const reject = el.querySelector('.tool-reject-btn')!;

        aparteGlobalConfig.setLocale(FR());

        expect(approve.textContent).toBe('Approuver');
        expect(approve.getAttribute('aria-label')).toBe('Approuver');
        expect(reject.textContent).toBe('Refuser');
    });

    it('an artifact card’s copy button — and nothing else on the card', () => {
        const el = mount([{
            id: 's1', type: 'artifact', isStreaming: false,
            artifactType: 'svg', mimeType: 'image/svg+xml', title: 'A chart',
            content: '<svg/>',
        } as unknown as AparteSegment]);
        const copyBtn = el.querySelector('.aparte-art-card__btn[data-action="copy"]')!;
        const card = el.querySelector('.segment-artifact-card')!;

        aparteGlobalConfig.setLocale(FR());
        aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-mine="1"></svg>' });

        expect(copyBtn.getAttribute('title')).toBe('Copier');
        expect(copyBtn.innerHTML).toContain('data-mine');

        // The half that matters more than the label: the card must not be disturbed.
        // It opens on the Code tab by design — building the preview frame at render
        // time would execute model-authored code with no gesture — and a relabel that
        // touched the tab state, or rebuilt the pane, would be the re-render this hook
        // exists to avoid.
        expect(card.getAttribute('data-tab')).toBe('code');
        expect(el.querySelector('iframe')).toBeNull();
        // And the literals it cannot reach stay literal, on purpose.
        expect(el.querySelector('.aparte-art-card__btn[data-action="download"]')!.getAttribute('title')).toBe('Download');
    });

    it('an error card’s icon (its title is a literal, and stays one)', () => {
        const el = mount([seg({ id: 's1', type: 'error', content: 'boom' })]);

        aparteGlobalConfig.setIconProvider({ error: () => '<svg data-mine="1"></svg>' });

        expect(el.querySelector('.error-icon-wrapper')!.innerHTML).toContain('data-mine');
        // Pinned deliberately: this heading was never routed through `t()`, so the
        // hook cannot reach it. Giving it a key is an additive change of its own, and
        // this assertion is what will fail when someone does it — on purpose.
        expect(el.querySelector('.error-title')!.textContent).toBe('Error');
    });
});

describe('relabel does not rebuild', () => {
    it('keeps the very same element, so listeners and focus survive', () => {
        const el = mount([{
            id: 's1', type: 'tool_call', status: 'awaiting-approval',
            toolCall: { id: 'tc1', name: 'delete_file', input: {} },
        } as AparteToolCallSegment]);
        const before = el.querySelector('.tool-approve-btn')!;

        aparteGlobalConfig.setLocale(FR());

        // Identity, not equality: a rebuilt button would be a different node, and a
        // keyboard user sitting on this one — the human-in-the-loop gate — would have
        // been dropped to <body> by a change that had nothing to do with them.
        expect(el.querySelector('.tool-approve-btn')).toBe(before);
    });

    it('leaves a reasoning block the reader opened by hand open', () => {
        // `collapsed: true` in the data, then the reader clicks <summary>. Nothing
        // writes that back to the segment, so a re-render would close it again.
        const el = mount([seg({ id: 's1', type: 'thinking', content: 'why', collapsed: true })]);
        const details = el.querySelector('details') as HTMLDetailsElement;
        details.open = true;

        aparteGlobalConfig.setLocale(FR());

        expect(details.open, 'the reader’s own expand was reverted').toBe(true);
        expect(el.querySelector('.thinking-label')!.textContent).toBe('Réflexion');
    });

    it('does not disturb a code block’s "copied" confirmation', () => {
        const el = mount([seg({ id: 's1', type: 'code', content: 'x' })]);
        const btn = el.querySelector('.code-copy') as HTMLElement;
        btn.dataset.copied = '1';
        btn.setAttribute('title', 'Copied!');

        aparteGlobalConfig.setLocale(FR());

        expect(btn.getAttribute('title')).toBe('Copied!');
    });
});
