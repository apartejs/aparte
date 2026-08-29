/**
 * A tool call and its result — the biggest of the nine, and the one an app most often replaces.
 *
 * One renderer, one file. They lived in a single 1900-line module because there was
 * nowhere else to put them; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteToolCallSegment,
} from '../../types/index.js';
import { injectToolRendererStyles } from '../segment-renderers.js';
import { describeToolInput } from '../../utils/tool-input.js';

/**
 * The arguments as text, or `''` when there are none worth showing.
 *
 * The body moved to `utils/tool-input.ts` when the approval panel started showing the
 * same arguments: the row is the anchor and the panel is where the decision is made,
 * so a person must not be able to read the two differently. See that file for why it
 * is pretty-printed JSON.
 */
function describeInput(segment: AparteToolCallSegment): string {
    return describeToolInput(segment.toolCall?.input);
}

/**
 * The state badge: a glyph AND a word.
 *
 * One function so `render` and `update` cannot disagree — the shape this file has been
 * bitten by twice, and the reason `relabel` used to duplicate the same ternary.
 *
 * The word matters. A bare cross beside a tool's name reads as a button that removes
 * it, so the state was being mistaken for an affordance; and every current
 * implementation labels its states rather than drawing them. The badge is also where
 * the COLOUR lives now: the whole chip used to be tinted green or red, which made a
 * finished tool call shout louder than the reply it belongs to.
 */
function stateBadge(segment: AparteToolCallSegment): string {
    const cfg = contextConfig();
    const status = segment.status ?? 'pending';
    const word = (key: string): string => escapeHtml(cfg.t(key as never));
    if (status === 'awaiting-approval') return word('approvalWaiting');
    if (status === 'pending') return word('toolRunning');
    if (status === 'resolved') return `${cfg.getIcon('check')}${word('toolCompleted')}`;
    if (status === 'rejected') return `${cfg.getIcon('close')}${word('toolRejected')}`;
    // A stop square, not the cross rejected wears: stopped and declined are two
    // different outcomes, and they used to share the glyph and the colour.
    if (status === 'aborted') return `${cfg.getIcon('stop')}${word('toolStopped')}`;
    // A crash is a third outcome: not declined, not stopped — the handler threw.
    if (status === 'failed') return `${cfg.getIcon('close')}${word('toolFailed')}`;
    return '';
}

/**
 * Write one part's text, or take the part out when there is nothing to show.
 *
 * `textContent`, never `innerHTML`: the arguments are the MODEL's and the result is
 * whatever a tool returned, so both are the exact shape the escaping guard exists for.
 * The colour comes afterwards, from a provider whose output is sanitised.
 */
function setPart(element: HTMLElement, part: 'input' | 'output', text: string): void {
    const existing = element.querySelector<HTMLElement>(`[data-part="${part}"]`);  // safe-attr: selector position, and `part` is a typed literal union ('input' | 'output') — not input
    if (!text) { existing?.remove(); return; }
    if (existing) {
        const code = existing.querySelector('code');
        if (code && code.textContent !== text) code.textContent = text;
        return;
    }
    // The part appeared between two updates — a call that had no result now has one.
    const detail = element.querySelector('.aparte-tool-detail');
    if (!detail) return;
    const cfg = contextConfig();
    const wrap = document.createElement('div');
    wrap.className = 'aparte-tool-part';
    wrap.dataset['part'] = part;  // safe-attr: a typed literal union ('input' | 'output'), not input
    const label = document.createElement('span');
    label.className = 'aparte-tool-part-label';
    label.textContent = cfg.t(part === 'input' ? 'toolInput' : 'toolOutput');
    const body = document.createElement('div');
    body.className = 'aparte-tool-part-body';
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = text;
    pre.appendChild(code);
    body.appendChild(pre);
    wrap.append(label, body);
    // Input before output, whichever arrived first.
    if (part === 'input') detail.prepend(wrap);
    else detail.appendChild(wrap);
}

/**
 * Colour both parts, best-effort.
 *
 * Async and from `setup`/`update`, the same shape the `code` segment uses: `render`
 * returns escaped text so the block is readable with no provider at all, and a
 * registered highlighter upgrades it after. A failure degrades to the escaped text
 * rather than to an empty box.
 *
 * `json` for both: the input IS json, and a tool result is a string a tool chose —
 * usually json, and a highlighter given json that is not json returns it unharmed.
 */
function highlightParts(element: HTMLElement): void {
    const cfg = contextConfig();
    for (const body of element.querySelectorAll<HTMLElement>('.aparte-tool-part-body')) {
        const text = body.querySelector('code')?.textContent ?? '';
        if (!text) continue;
        void cfg.highlightCode(text, 'json').then((html) => {
            // Re-read: an update may have replaced this text while we awaited.
            if ((body.querySelector('code')?.textContent ?? '') !== text) return;
            body.innerHTML = html;
        }).catch(() => { /* the escaped text already reads correctly */ });
    }
}

/**
 * The pill, as markup.
 *
 * A function and not an inline template, so its escaping exemption can sit on a
 * DECLARATION line. Inline, the `//` comment the guard reads landed INSIDE the template
 * literal and rendered as visible text in the bubble — the exact trap this file's
 * `getStyles` block warns about, walked into one edit later.
 */
function pillMarkup(segment: AparteToolCallSegment, name: string, status: string): string {
    const badge = stateBadge(segment);  // safe-text: escaped locale text plus the icon provider's SVG — the same contract as getIcon, where escaping would print the source
    return `
                <span class="aparte-tool-label">
                    <span class="aparte-tool-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="aparte-tool-name">${escapeHtml(name)}</span>
                </span>
                <span class="aparte-spinner aparte-tool-spinner" aria-hidden="true"${status === 'pending' ? '' : ' hidden'}></span>
                <span class="aparte-tool-state">${badge}</span>`;
}

export const toolCallRenderer: AparteSegmentRenderer<AparteToolCallSegment> = {
    type: 'tool_call',
    render: (segment) => {
        const name = segment.toolCall?.name ?? 'tool';
        const status = segment.status ?? 'pending';
        const toolCallId = segment.toolCall?.id ?? '';

        /*
         * A tool waiting for a person is a STATE of the pill now, not a control.
         *
         * The Approve / Reject buttons were here, and they were the only decision
         * surface in the whole library that lived in the transcript. They are at the
         * composer now, which is where every other request for the user already went —
         * so this is the ANCHOR: the thing you scroll to, and the thing the panel is
         * about. Nothing clickable, no role, no tab stop, no pointer (ratified decision
         * #8: an undeclared affordance is not half-rendered either).
         *
         * It also fixes a defect by construction rather than by guarding: a segment
         * restored from storage used to repaint live buttons wired to a listener that
         * had gone with the page.
         *
         * And removing the branch un-shadows a seam that was said to be missing. It ran
         * BEFORE the per-tool renderer lookup below, so `registerToolRenderer` could
         * never draw anything while a tool awaited approval. The lookup is now first,
         * and a tool renders its own surface at every status.
         */
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        if (customRenderer) {
            // Its stylesheet, here as well as on the live path: this is what runs when a
            // stored conversation is re-rendered, and nothing replays `tool-start` for
            // history. Idempotent, keyed by tool name.
            injectToolRendererStyles(segment.toolCall?.name ?? '', customRenderer);
            const out = customRenderer.render(segment);
            if (out) return out;
        }

        // Status/tool glyphs come from the icon provider (fallbacks: ✓ / ✕ / 🔧)
        // so icon packs and skins restyle the pill like everything else.
        /*
         * The pill's variable parts get STABLE containers, always present.
         *
         * `update` has to patch this in place — see its own comment — and it cannot
         * patch an element that is absent on one status and present on the next. So the
         * spinner is always in the DOM and CSS shows it only while `pending`, and the
         * status slot is one element whose CONTENT is the waiting label or the glyph.
         */
        const pill = pillMarkup(segment, name, status);  // safe-text: markup built by pillMarkup, whose own interpolations are each escaped or marked there
        const toggle = contextConfig().getIcon('expand');  // safe-text: the icon provider's SVG — the same contract as every other getIcon in this file, where escaping would print the source

        /*
         * What went IN and what came OUT, behind a disclosure.
         *
         * The pill named the tool and showed nothing else — not the arguments the model
         * chose, not the result it got — while the segment carried both the whole time.
         * Missing presentation, not missing data. Every comparable kit shows them:
         * AI Elements has `ToolInput` / `ToolOutput` inside a collapsible `Tool`,
         * assistant-ui has `ToolFallback.Args` / `.Result`.
         *
         * COLLAPSED, always, including while the loop waits for a decision. The
         * `thinking` block stays closed while it is being produced — the most live
         * moment there is — so a tool call has no stronger claim to unroll itself. One
         * rule, no special cases.
         *
         * A `<details>` only when there IS something behind it: a disclosure that
         * reveals nothing is an affordance that lies (ratified decision #8), and a tool
         * with no arguments and no result yet has nothing to reveal.
         */
        const input = describeInput(segment);
        const result = segment.result;
        if (!input && !result) {
            return `
            <div class="aparte-segment aparte-segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}">${pill}
            </div>
        `;
        }

        const cfg = contextConfig();
        return `
            <details class="aparte-segment aparte-segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}">
                <summary class="aparte-tool-summary"><span class="aparte-tool-toggle">${toggle}</span>${pill}</summary>
                <div class="aparte-tool-detail">
                    ${input ? `
                    <div class="aparte-tool-part" data-part="input">
                        <span class="aparte-tool-part-label">${escapeHtml(cfg.t('toolInput'))}</span>
                        <div class="aparte-tool-part-body"><pre><code>${escapeHtml(input)}</code></pre></div>
                    </div>` : ''}
                    ${result ? `
                    <div class="aparte-tool-part" data-part="output">
                        <span class="aparte-tool-part-label">${escapeHtml(cfg.t('toolOutput'))}</span>
                        <div class="aparte-tool-part-body"><pre><code>${escapeHtml(result)}</code></pre></div>
                    </div>` : ''}
                </div>
            </details>
        `;
    },
    /**
     * The pill's glyphs, and the label it wears while a person is deciding.
     *
     * The two highest-stakes strings in the library — the approval labels — are no
     * longer here: they are on the panel, which relabels itself. This still matters
     * though, because the request the pill describes stays open for as long as
     * somebody takes to decide, which is exactly long enough for a language switch.
     *
     * No child node is added or removed, per the relabel contract.
     */
    relabel: (element, segment) => {
        const cfg = contextConfig();
        // A registered renderer owns its markup, so none of the selectors below exist
        // in it; its own `relabel` — when it declares one — is the only thing that can
        // re-read the locale for it.
        const custom = cfg.getToolRenderer(segment.toolCall?.name);
        if (custom) {
            custom.relabel?.(element, segment);
            return;
        }
        const icon = element.querySelector('.aparte-tool-icon');
        if (icon) icon.innerHTML = cfg.getIcon('tool');
        // Through `stateBadge`, which is the whole point of it existing.
        //
        // This used to rebuild the badge by hand as the ICON ALONE, so any config change
        // — `setLocale`, `setIconProvider`, `registerTool`, `reset()`, anything that
        // calls `_notify()` — permanently deleted the localized state word that
        // `stateBadge` renders beside it. "✓ Done" became "✓", and `pending`'s "Running"
        // became empty. Four of five statuses regressed; only `awaiting-approval`
        // survived, because a second line below re-wrote it.
        //
        // Which is exactly what `stateBadge`'s own docblock says it prevents: "One
        // function so `render` and `update` cannot disagree". `relabel` was never folded
        // in. It is now, so there is no third spelling of the badge to keep in step —
        // and the approval-waiting special case goes with it, since `stateBadge` already
        // returns the localized `approvalWaiting` for that status.
        const statusEl = element.querySelector('.aparte-tool-state');
        if (statusEl) statusEl.innerHTML = stateBadge(segment);
    },
    /**
     * Patch in place. NEVER re-render, and never touch `open`.
     *
     * Without an `update` the bubble replaces the element wholesale — and a tool call
     * changes status several times per turn, so a disclosure the reader opened would
     * slam shut under them every time. The same rule the reasoning block has, for the
     * same reason: `collapsed` is honoured only when an update explicitly carries it.
     *
     * The one case that cannot be patched is a change of ELEMENT: a call that had
     * neither arguments nor a result rendered as a plain pill, and gaining a result
     * makes it a `<details>`. That falls back to a rebuild, which costs nothing because
     * there was no disclosure to lose.
     */
    update: (element, segment) => {
        const status = segment.status ?? 'pending';
        const input = describeInput(segment);
        const wantsDetail = !!input || !!segment.result;

        /*
         * Two cases this cannot patch, and both rebuild instead.
         *
         * A registered tool renderer owns the WHOLE markup, so none of the selectors
         * below exist in it — patching would fail silently and that segment would
         * simply stop updating. Before this file had an `update` at all, the bubble
         * rebuilt on every change, which re-invoked their render; a rebuild keeps that
         * behaviour exactly.
         *
         * And a change of ELEMENT: a call with neither arguments nor a result renders
         * as a plain pill, and gaining either makes it a `<details>`. Nothing is lost
         * there — there was no disclosure to keep open.
         */
        const custom = contextConfig().getToolRenderer(segment.toolCall?.name);
        // A registered renderer that declares `update` owns the patch — a mounted
        // preview or an opened disclosure in its markup survives the change. One
        // that does not is rebuilt, as it always was.
        if (custom?.update) {
            custom.update(element, segment);
            return;
        }
        if (custom || wantsDetail !== (element.tagName === 'DETAILS')) {
            // A `<template>`, not the bubble's own converter: this file is a renderer
            // and must not import from the component that consumes it.
            const out = toolCallRenderer.render(segment);
            const tpl = document.createElement('template');
            tpl.innerHTML = typeof out === 'string' ? out.trim() : '';
            const rebuilt = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement | null;
            if (rebuilt) {
                element.replaceWith(rebuilt);
                toolCallRenderer.setup?.(rebuilt, segment);
            }
            return;
        }

        element.setAttribute('data-status', status);
        const badge = element.querySelector('.aparte-tool-state');
        if (badge) badge.innerHTML = stateBadge(segment);
        // `hidden`, not a CSS-only rule: an attribute is a real DOM state a test can
        // read, and jsdom has no layout to ask. Same treatment as the cancel button.
        element.querySelector('.aparte-tool-spinner')?.toggleAttribute('hidden', status !== 'pending');

        setPart(element, 'input', input);
        setPart(element, 'output', segment.result ?? '');
        highlightParts(element);
    },
    setup: (element, segment) => {
        // Nothing of ours to WIRE: the transcript holds no control any more. What used
        // to be here built the two buttons' click listeners and dispatched
        // `aparte-tool-decision`; the decision is answered at the composer now.
        highlightParts(element);
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        customRenderer?.setup?.(element, segment);
    },
    // CSS lives in styles/segment/ — see that folder for why a
    // built-in's rules belong there. `getStyles` stays for a CONSUMER's renderer, which
    // has no other way onto the page.
    getStyles: () => ''
};
