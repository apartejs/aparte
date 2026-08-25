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

/**
 * The arguments as text, or `''` when there are none worth showing.
 *
 * Pretty-printed JSON, because that is what the model actually sent and what every
 * reference implementation shows — a prose summary would be core inventing a reading
 * of arguments it knows nothing about. `JSON.stringify` can throw on a cyclic value,
 * which a tool input should never be but a hand-built segment can be, so a failure
 * degrades to no input rather than to a broken bubble.
 */
function describeInput(segment: AparteToolCallSegment): string {
    const input = segment.toolCall?.input;
    if (!input || typeof input !== 'object' || Object.keys(input).length === 0) return '';
    try {
        return JSON.stringify(input, null, 2);
    } catch {
        return '';
    }
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
    if (status === 'aborted') return `${cfg.getIcon('close')}${word('toolStopped')}`;
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
    const detail = element.querySelector('.tool-detail');
    if (!detail) return;
    const cfg = contextConfig();
    const wrap = document.createElement('div');
    wrap.className = 'tool-part';
    wrap.dataset['part'] = part;  // safe-attr: a typed literal union ('input' | 'output'), not input
    const label = document.createElement('span');
    label.className = 'tool-part-label';
    label.textContent = cfg.t(part === 'input' ? 'toolInput' : 'toolOutput');
    const body = document.createElement('div');
    body.className = 'tool-part-body';
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
    for (const body of element.querySelectorAll<HTMLElement>('.tool-part-body')) {
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
                <span class="tool-label">
                    <span class="tool-icon">${contextConfig().getIcon('tool')}</span>
                    <span class="tool-name">${escapeHtml(name)}</span>
                </span>
                <span class="tool-spinner" aria-hidden="true"${status === 'pending' ? '' : ' hidden'}></span>
                <span class="tool-state">${badge}</span>`;
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
            <div class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}">${pill}
            </div>
        `;
        }

        const cfg = contextConfig();
        return `
            <details class="segment segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}">
                <summary class="tool-summary"><span class="tool-toggle"></span>${pill}</summary>
                <div class="tool-detail">
                    ${input ? `
                    <div class="tool-part" data-part="input">
                        <span class="tool-part-label">${escapeHtml(cfg.t('toolInput'))}</span>
                        <div class="tool-part-body"><pre><code>${escapeHtml(input)}</code></pre></div>
                    </div>` : ''}
                    ${result ? `
                    <div class="tool-part" data-part="output">
                        <span class="tool-part-label">${escapeHtml(cfg.t('toolOutput'))}</span>
                        <div class="tool-part-body"><pre><code>${escapeHtml(result)}</code></pre></div>
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
        const icon = element.querySelector('.tool-icon');
        if (icon) icon.innerHTML = cfg.getIcon('tool');
        const statusEl = element.querySelector('.tool-state');
        if (statusEl) {
            const s = segment.status;
            statusEl.innerHTML = s === 'resolved'
                ? cfg.getIcon('check')
                : (s === 'aborted' || s === 'rejected') ? cfg.getIcon('close') : '';
        }
        // The two approval labels used to be relabelled here. They live on the panel
        // now, which relabels itself. What is left on this side is the waiting label —
        // and it still matters that a language switch reaches it, because the request it
        // describes may be open for as long as a person takes to decide.
        if (statusEl && segment.status === 'awaiting-approval') {
            statusEl.textContent = cfg.t('approvalWaiting');
        }
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
        const badge = element.querySelector('.tool-state');
        if (badge) badge.innerHTML = stateBadge(segment);
        // `hidden`, not a CSS-only rule: an attribute is a real DOM state a test can
        // read, and jsdom has no layout to ask. Same treatment as the cancel button.
        element.querySelector('.tool-spinner')?.toggleAttribute('hidden', status !== 'pending');

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
    getStyles: () => `
        .segment-tool-call { display: block; padding: 2px 0; }
        /* The pill is the summary. list-style:none plus the ::-webkit- pseudo is the
           pair that actually removes the native marker across engines. (No backticks
           in this block: it is a template literal and one would close it.) */
        /* A ROW, not a badge.
           It was a rounded chip, which is what a tag looks like — and a tool call is not
           a tag, it is a step of the turn. Every current implementation draws it as a
           line: the disclosure control, the call's identity, and its state at the far
           end. The chip also had to carry a border and a fill, so it competed with the
           reply text beside it for attention it did not deserve. */
        .tool-summary {
            display: flex; align-items: center; gap: 7px;
            padding: 3px 6px; margin-inline-start: -6px;
            border-radius: var(--aparte-tool-row-radius, 6px);
            cursor: pointer; list-style: none;
        }
        .tool-summary:hover { background: var(--aparte-surface-2, rgba(128,128,128,0.07)); }
        .tool-summary::-webkit-details-marker { display: none; }
        .tool-toggle {
            width: 0; height: 0; flex: none; margin-inline-start: -1px;
            border-inline-start: 5px solid currentColor;
            border-block: 4px solid transparent;
            opacity: 0.5; transition: transform 0.15s;
        }
        .tool-summary:hover .tool-toggle { opacity: 0.9; }
        details[open] > .tool-summary .tool-toggle { transform: rotate(90deg); }
        /* A rule down the leading edge, so the disclosure reads as belonging to the
           pill above it rather than continuing the message text below. Without it
           "Output" and the assistant's next sentence sat in one undifferentiated
           column. */
        .tool-detail {
            display: flex; flex-direction: column; gap: 8px;
            /* Aligned under the row's icon, so the rule reads as descending from the
               call rather than floating beside it. */
            margin: 4px 0 6px 3px; padding: 2px 0 2px 12px;
            border-inline-start: 1px solid var(--aparte-border, rgba(128,128,128,0.25));
        }
        .tool-part-label {
            display: block; font-size: 0.68rem; text-transform: uppercase;
            letter-spacing: 0.04em; opacity: 0.55; margin-bottom: 2px;
        }
        .tool-part-body pre { margin: 0; }
        /* Always in the DOM so update can leave the node alone and toggle hidden
           instead — an attribute a test can read, where a CSS-only rule is invisible
           to jsdom. */
        .tool-spinner[hidden] { display: none; }
        /* The call's identity: its icon and its name, and no decoration of its own.
           No border, no fill, no tint at any status — the row is the container now, and
           the colour lives on the state badge alone. A resolved call used to be filled
           green, which made a finished step shout louder than the reply it belongs to. */
        .tool-label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            min-width: 0;
            font-size: 0.8rem;
            font-weight: 500;
            color: var(--aparte-text, inherit);
            user-select: none;
        }
        /* A fixed square, and the glyph centred in it. The icon was baseline-aligned
           inside an inline box, so it sat low against the name and moved with whatever
           glyph the icon provider returned. */
        .tool-icon {
            display: grid;
            place-items: center;
            width: 1em; height: 1em;
            flex: none;
            opacity: 0.7;
        }
        .tool-icon svg { width: 1em; height: 1em; display: block; }
        .tool-name { font-family: var(--aparte-code-font-family, ui-monospace, monospace); }
        /* The state, as a word with its glyph. Colour lives HERE and nowhere else.
           Pushed to the far end by DOM order plus an auto inline-start margin, which is
           the placement rule this repo already settled on: no left/right in a name, so
           a right-to-left locale mirrors it for free. */
        .tool-state {
            display: inline-flex; align-items: center; gap: 4px;
            margin-inline-start: auto;
            font-size: 0.72rem; font-weight: 500;
            color: var(--aparte-text-muted, rgba(128,128,128,0.75));
            user-select: none;
        }
        .tool-state svg { width: 0.9em; height: 0.9em; display: block; }
        [data-status="resolved"] .tool-state { color: var(--aparte-success, rgb(21,128,61)); }
        [data-status="rejected"] .tool-state,
        [data-status="aborted"] .tool-state { color: var(--aparte-error, rgb(185,28,28)); }
        /* The Approve / Reject button rules were here. They moved with the buttons -
           into aparte.css, as .aparte-approval-option, where a consumer's own rules and
           the generated CSS reference can both see them. Runtime-injected CSS is
           invisible to check:derived-vars too, which is why the elicitation panel had
           already made the same move. (No backticks in here: this whole block is a
           template literal, and one would close it.) */
        [data-status="awaiting-approval"] .tool-label {
            border-color: var(--aparte-border-strong, rgba(128,128,128,0.45));
        }
        .tool-spinner {
            width: 10px; height: 10px;
            border: 1.5px solid currentColor;
            border-top-color: transparent;
            border-radius: 50%;
            display: inline-block;
            animation: tool-spin 0.7s linear infinite;
        }
        .tool-state { font-size: 0.75rem; }
        @keyframes tool-spin { to { transform: rotate(360deg); } }
    `
};
