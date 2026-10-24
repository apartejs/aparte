/**
 * A tool call and its result — the biggest of the nine, and the one an app most often replaces.
 *
 * One renderer, one file; the registry that consumes them is in
 * `../segment-renderers.ts`.
 */
import { escapeHtml, escapeAttr } from '../../utils/escape.js';
import { contextConfig } from '../../config/index.js';
import type {
    AparteSegmentRenderer,
    AparteToolCallSegment,
} from '../../types/index.js';
import { injectToolRendererStyles } from '../segment-renderers.js';
import { copyButtonMarkup, wireCopyButton, relabelCopyButton } from '../copy-button.js';
import { describeToolInput } from '../../utils/tool-input.js';
import { toolNameOf, toolTargetOf } from '../../utils/tool-line.js';

/**
 * The arguments as text, or `''` when there are none worth showing.
 *
 * The body moved to `utils/tool-input.ts` when the approval panel started showing the
 * same arguments: the row is the anchor and the panel is where the decision is made,
 * so a person must not be able to read the two differently. See that file for why it
 * is pretty-printed JSON.
 */
function describeInput(segment: AparteToolCallSegment): string {
    return describeToolInput(segment.toolCall?.input, contextConfig().getToolInputFormatter(segment.toolCall?.name ?? ''));
}

/**
 * The state badge: a glyph AND a word.
 *
 * One function so `render` and `update` cannot disagree.
 *
 * The word matters: a bare cross beside a tool's name reads as a button that removes
 * it, so the state is labelled rather than only drawn. The badge is also where the
 * COLOUR lives; the rest of the row stays quiet, so a finished tool call does not
 * shout louder than the reply it belongs to.
 */
function stateBadge(segment: AparteToolCallSegment): string {
    const cfg = contextConfig();
    const status = segment.status ?? 'pending';
    // Literal `t('…')` reads, typed and visible to the locale guard.
    const word = (text: string): string => escapeHtml(text);
    // Paused for a person: two bars, so the one state a reader must act on wears a glyph
    // like every other — it used to be the only bare word in the row.
    if (status === 'awaiting-approval') return `${cfg.getIcon('pause')}${word(cfg.t('approvalWaiting'))}`;
    if (status === 'pending') return word(cfg.t('toolRunning'));
    if (status === 'resolved') return `${cfg.getIcon('check')}${word(cfg.t('toolCompleted'))}`;
    if (status === 'rejected') return `${cfg.getIcon('close')}${word(cfg.t('toolRejected'))}`;
    // A stop square, not the cross rejected wears: stopped and declined are two
    // different outcomes, and they used to share the glyph and the colour.
    if (status === 'aborted') return `${cfg.getIcon('stop')}${word(cfg.t('toolStopped'))}`;
    // A crash is a third outcome: not declined, not stopped — the handler threw.
    if (status === 'failed') return `${cfg.getIcon('close')}${word(cfg.t('toolFailed'))}`;
    return '';
}

/**
 * The note after the state word: why the call ended, for the PERSON reading the row.
 *
 * `result` on a refused call is the sentence the model read, written about the reader in
 * the third person and in English; it is not shown to them any more. Who refused and what
 * they said ride on the segment (`refusal`), and why a call stopped (`abortCause`), so the
 * row says it in the reader's language. `''` when the state word is the whole story — a
 * bare refusal, a Stop — or when the segment predates those fields.
 */
function noteOf(segment: AparteToolCallSegment): string {
    const cfg = contextConfig();
    if (segment.status === 'rejected') {
        const by = segment.refusal?.by;
        if (by === 'policy') return cfg.t('toolRefusedByPolicy');
        if (by === 'earlier-refusal') return cfg.t('toolNotRunAfterRefusal');
        const said = segment.refusal?.instruction?.trim();
        return said ? cfg.t('toolRejectedSaid').replace('{instruction}', () => said) : '';
    }
    if (segment.status === 'aborted') {
        switch (segment.abortCause) {
            case 'timeout': return cfg.t('toolTimedOut');
            case 'no-handler': return cfg.t('toolUnavailable');
            case 'no-resolver': return cfg.t('toolNoApprover');
            case 'turn-limit': return cfg.t('toolTurnLimit');
            default: return '';
        }
    }
    return '';
}

/**
 * What the detail shows under the arguments: the result, as Output — except on a call
 * refused by someone the segment names. Its `result` is then the sentence the MODEL read
 * (a policy's included, which is written to the model: "Describe what you would do
 * instead…"), so the person reads the note and no Output. A refused segment saved before
 * `refusal` existed keeps its Output, as it always read.
 */
function outcomeOf(segment: AparteToolCallSegment): { key: 'toolOutput'; text: string } | null {
    const text = displayText(segment.result ?? '');
    if (!text) return null;
    if (segment.status === 'rejected' && segment.refusal) return null;
    return { key: 'toolOutput', text };
}

/**
 * What is behind the row's line, from its display's `details`: the raw parts (Input and
 * Output — the default), nothing (`false`, or a function that returned `''`), or what the
 * app's function drew. A function that throws is nothing too, never the raw parts: an app
 * that wrote one did so to keep its reader from them.
 */
type Behind = { kind: 'parts' } | { kind: 'none' } | { kind: 'body'; body: HTMLElement | string };

function behindOf(segment: AparteToolCallSegment): Behind {
    const details = contextConfig().getToolDisplay(segment.toolCall?.name ?? '')?.details;
    if (details === false) return { kind: 'none' };
    if (typeof details !== 'function') return { kind: 'parts' };
    try {
        const body = details(segment);
        return body ? { kind: 'body', body } : { kind: 'none' };
    } catch {
        return { kind: 'none' };
    }
}

/** The container of an app's detail, when the row holds one (stamped when it is drawn). */
const appDetailOf = (element: Element): Element | null =>
    element.querySelector(':scope > .aparte-tool-detail[data-details="app"]');

/**
 * Put what the app drew behind the line. Its own markup, so the whole detail is replaced;
 * the `<details>` around it stays, and with it what the reader opened. An update brings new
 * data, so new nodes: listeners the app attached read the call they were made for.
 */
function setBody(element: Element, body: HTMLElement | string): void {
    const detail = element.querySelector('.aparte-tool-detail');
    if (!detail) return;
    if (typeof body === 'string') detail.innerHTML = body;
    else detail.replaceChildren(body);
}

/**
 * On a language switch, what the app's function draws now, written into the nodes already
 * there. The relabel contract adds and removes no node, because the viewport reads such a
 * change as content arriving: the same shape, translated, is patched text by text and
 * attribute by attribute; an unchanged one is not touched at all. Only a detail whose SHAPE
 * changed is replaced, which a language switch rarely does.
 */
function relabelBody(detail: Element, body: HTMLElement | string): void {
    const next = document.createElement('div');
    if (typeof body === 'string') next.innerHTML = body;
    else next.append(body);
    if (sameShape(detail, next)) copyInto(detail, next);
    else detail.replaceChildren(...Array.from(next.childNodes));
}

/** Whether two trees have the same nodes, of the same kinds and tags, in the same order. */
function sameShape(a: Node, b: Node): boolean {
    if (a.childNodes.length !== b.childNodes.length) return false;
    for (let i = 0; i < a.childNodes.length; i++) {
        const x = a.childNodes[i]!;
        const y = b.childNodes[i]!;
        if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || !sameShape(x, y)) return false;
    }
    return true;
}

/** Copy `b`'s text and attributes onto `a`, node for node — two trees of the same shape. */
function copyInto(a: Node, b: Node): void {
    for (let i = 0; i < a.childNodes.length; i++) {
        const x = a.childNodes[i]!;
        const y = b.childNodes[i]!;
        if (x instanceof Element && y instanceof Element) {
            for (const { name, value } of Array.from(y.attributes)) {
                if (x.getAttribute(name) !== value) x.setAttribute(name, value);
            }
            for (const { name } of Array.from(x.attributes)) {
                if (!y.hasAttribute(name)) x.removeAttribute(name);
            }
            copyInto(x, y);
        } else if (x.nodeValue !== y.nodeValue) {
            x.nodeValue = y.nodeValue;
        }
    }
}

/** Write the note into its container — always in the pill, like the target, so `update` can patch it. */
function setNote(element: Element, segment: AparteToolCallSegment): void {
    const el = element.querySelector('.aparte-tool-note');
    if (!el) return;
    const text = noteOf(segment);
    if (el.textContent !== text) el.textContent = text;
    el.toggleAttribute('hidden', !text);
    // Its own title: one line cut by an ellipsis must still be readable whole — the
    // person's own words, among others.
    if (text) el.setAttribute('title', text);
    else el.removeAttribute('title');
}

/**
 * Write one part's text, or take the part out when there is nothing to show.
 *
 * `textContent`, never `innerHTML`: the arguments are the MODEL's and the result is
 * whatever a tool returned, so both are the exact shape the escaping guard exists for.
 * The colour comes afterwards, from a provider whose output is sanitised.
 */
function setPart(element: HTMLElement, part: 'input' | 'output', text: string, labelKey: 'toolInput' | 'toolOutput'): void {
    const existing = element.querySelector<HTMLElement>(`[data-part="${part}"]`);  // safe-attr: selector position, and `part` is a typed literal union ('input' | 'output') — not input
    if (!text) { existing?.remove(); return; }
    if (existing) {
        const code = existing.querySelector('code');
        if (code && code.textContent !== text) code.textContent = text;
        const label = existing.querySelector('.aparte-tool-part-label');
        const word = contextConfig().t(labelKey);
        if (label && label.textContent !== word) label.textContent = word;
        existing.querySelector('.aparte-tool-part-body')?.setAttribute('aria-label', word);
        return;
    }
    // The part appeared between two updates — a call that had no result now has one.
    const detail = element.querySelector('.aparte-tool-detail');
    if (!detail) return;
    const cfg = contextConfig();
    const wrap = document.createElement('div');
    wrap.className = 'aparte-tool-part';
    wrap.dataset['part'] = part;  // safe-attr: a typed literal union ('input' | 'output'), not input
    const head = document.createElement('div');
    head.className = 'aparte-tool-part-head';
    const label = document.createElement('span');
    label.className = 'aparte-tool-part-label';
    label.textContent = cfg.t(labelKey);
    const tpl = document.createElement('template');
    tpl.innerHTML = copyButtonMarkup('aparte-tool-copy');
    head.append(label, tpl.content);
    const body = document.createElement('div');
    body.className = 'aparte-tool-part-body';
    // A scrolling region past --aparte-tool-part-max-height: focusable and named, so a
    // keyboard can reach what overflows (the reasoning block's precedent).
    body.setAttribute('role', 'region');
    body.tabIndex = 0;
    body.setAttribute('aria-label', label.textContent);
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = text;
    pre.appendChild(code);
    body.appendChild(pre);
    wrap.append(head, body);
    // Input before output, whichever arrived first.
    if (part === 'input') detail.prepend(wrap);
    else detail.appendChild(wrap);
    wireParts(wrap);
}

/**
 * Wire each part's copy button, once: from `setup` for the parts the row was drawn with,
 * from `setPart` for one that appears on an update. It copies what the part holds at the
 * click — an update may have rewritten it since.
 */
function wireParts(root: Element): void {
    for (const button of root.querySelectorAll<HTMLElement>('.aparte-tool-copy')) {
        if (button.dataset['wired']) continue;
        button.dataset['wired'] = '1';
        const part = button.closest('.aparte-tool-part');
        wireCopyButton(button, () => part?.querySelector('.aparte-tool-part-body')?.textContent ?? '');
    }
}

/** Past this size a part is shown as it came: parsing and colouring it would cost the frame. */
const JSON_PART_LIMIT = 200_000;

/** The value when `text` is a JSON object or array, else `undefined` — a scalar is not "JSON" to a reader. */
function jsonStructureOf(text: string): object | undefined {
    const trimmed = text.trim();
    if (trimmed.length > JSON_PART_LIMIT || !(trimmed.startsWith('{') || trimmed.startsWith('['))) return undefined;
    try {
        const value: unknown = JSON.parse(trimmed);
        return value !== null && typeof value === 'object' ? value : undefined;
    } catch {
        return undefined;
    }
}

/** A part's text as shown: a JSON object or array pretty-printed, as the input is; anything else as it came. */
function displayText(raw: string): string {
    const value = jsonStructureOf(raw);
    return value === undefined ? raw : JSON.stringify(value, null, 2);
}

/**
 * Colour the parts that are JSON, best-effort.
 *
 * Async and from `setup`/`update`, the same shape the `code` segment uses: `render`
 * returns escaped text so the block is readable with no provider at all, and a
 * registered highlighter upgrades it after. A failure degrades to the escaped text
 * rather than to an empty box.
 *
 * `json` only for a part that IS JSON. Both parts used to go as `json` whatever they
 * held — a prose result, a shell transcript, a formatter's sentence came back tinted as
 * if it were an object. Anything else stays the text it is, and the highlighter is not
 * asked.
 */
function highlightParts(element: HTMLElement): void {
    const cfg = contextConfig();
    for (const body of element.querySelectorAll<HTMLElement>('.aparte-tool-part-body')) {
        const text = body.querySelector('code')?.textContent ?? '';
        if (!text || jsonStructureOf(text) === undefined) continue;
        void cfg.highlightCode(text, 'json').then((html) => {
            // Re-read: an update may have replaced this text while we awaited.
            if ((body.querySelector('code')?.textContent ?? '') !== text) return;
            body.innerHTML = html;
        }).catch(() => { /* the escaped text already reads correctly */ });
    }
}

/**
 * What the call targets, from the summary registered for its tool — `''` when there is
 * none, or when it throws: a summary reads model-chosen input, and a bad one must cost
 * the row its one line, not the bubble its render.
 */
function toolTarget(segment: AparteToolCallSegment): string {
    return toolTargetOf(segment, contextConfig());
}

/**
 * Write the target into its container, which is always in the pill for the same reason
 * the spinner is: `update` patches in place, and the arguments a summary reads can still
 * be arriving when the row is first drawn. `relabel` calls it too, so a summary
 * registered after the row was drawn reaches it on the next config change.
 */
function setTarget(element: Element, segment: AparteToolCallSegment): void {
    const el = element.querySelector('.aparte-tool-target');
    if (!el) return;
    const text = toolTarget(segment);
    if (el.textContent !== text) el.textContent = text;
    el.toggleAttribute('hidden', !text);
}

/**
 * The name the row shows: the label the app declared (`registerToolDisplay`), else the
 * identifier — the app's wire format, which core never turns into words on its own. A
 * label that throws or says nothing costs the row its label, not its render.
 */
function nameOf(segment: AparteToolCallSegment): { text: string; isLabel: boolean } {
    return toolNameOf(segment, contextConfig());
}

/** The row's glyph: the display's icon key when the provider knows it, else `tool`. */
function iconOf(segment: AparteToolCallSegment): string {
    const cfg = contextConfig();
    const key = cfg.getToolDisplay(segment.toolCall?.name ?? '')?.icon;
    return (key ? cfg.getIcon(key) : undefined) || cfg.getIcon('tool');
}

/** Whether the tool's display asks for the quiet line, a person's (`quiet`). */
const isQuiet = (segment: AparteToolCallSegment): boolean =>
    contextConfig().getToolDisplay(segment.toolCall?.name ?? '')?.quiet === true;

/**
 * What the row shows of its state, quiet or not — one answer for `render`, `update` and
 * `relabel`, so the three cannot disagree. The default row: the spinner while it runs and
 * every word. A quiet one: the label shimmers while it runs, and the word for "running" and
 * "done" leaves the screen (the label's tense says it) but stays for a screen reader. A
 * wait, a refusal, a failure and a stop show as on any row: those a person must know.
 */
function quietOf(segment: AparteToolCallSegment): { shimmer: boolean; spinner: boolean; stateHidden: boolean } {
    const status = segment.status ?? 'pending';
    const quiet = isQuiet(segment);
    return {
        shimmer: quiet && status === 'pending',
        spinner: !quiet && status === 'pending',
        stateHidden: quiet && (status === 'pending' || status === 'resolved'),
    };
}

/** Apply `quietOf` to a row already drawn. */
function setQuiet(element: Element, segment: AparteToolCallSegment): void {
    const quiet = quietOf(segment);
    // `hidden`, not a CSS-only rule: an attribute is a real DOM state a test can read, and
    // jsdom has no layout to ask. Same treatment as the cancel button.
    element.querySelector('.aparte-tool-spinner')?.toggleAttribute('hidden', !quiet.spinner);
    element.querySelector('.aparte-tool-name')?.classList.toggle('aparte-shimmer', quiet.shimmer);
    element.querySelector('.aparte-tool-state')?.classList.toggle('aparte-sr-only', quiet.stateHidden);
}

/** Write the name into its container: a label function may read the status, so `update` calls it too. */
function setName(element: Element, segment: AparteToolCallSegment): void {
    const el = element.querySelector('.aparte-tool-name');
    if (!el) return;
    const { text, isLabel } = nameOf(segment);
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('aparte-tool-name--label', isLabel);
}

/**
 * The pill, as markup.
 *
 * A function and not an inline template, so its escaping exemption can sit on a
 * DECLARATION line. Inline, the `//` comment the guard reads landed INSIDE the template
 * literal and rendered as visible text in the bubble — the exact trap this file's
 * `getStyles` block warns about, walked into one edit later.
 */
function pillMarkup(segment: AparteToolCallSegment): string {
    const badge = stateBadge(segment);  // safe-text: escaped locale text plus the icon provider's SVG — the same contract as getIcon, where escaping would print the source
    const icon = iconOf(segment);  // safe-text: the icon provider's SVG — the same contract as getIcon, where escaping would print the source
    const target = toolTarget(segment);
    const note = noteOf(segment);
    const name = nameOf(segment);
    const quiet = quietOf(segment);
    return `
                <span class="aparte-tool-label">
                    <span class="aparte-tool-icon">${icon}</span>
                    <span class="aparte-tool-name${name.isLabel ? ' aparte-tool-name--label' : ''}${quiet.shimmer ? ' aparte-shimmer' : ''}">${escapeHtml(name.text)}</span>
                    <span class="aparte-tool-target"${target ? '' : ' hidden'}>${escapeHtml(target)}</span>
                </span>
                <span class="aparte-spinner aparte-tool-spinner" aria-hidden="true"${quiet.spinner ? '' : ' hidden'}></span>
                <span class="aparte-tool-state${quiet.stateHidden ? ' aparte-sr-only' : ''}">${badge}</span>
                <span class="aparte-tool-note"${note ? ` title="${escapeAttr(note)}"` : ' hidden'}>${escapeHtml(note)}</span>`;
}

/**
 * A call that draws nothing — hidden by its display, or drawn as nothing by its renderer.
 *
 * Still an element, empty and `hidden`, with the row's identity: updates find their row by
 * id, and an empty render made every one of them miss and rebuild the whole message,
 * closing whatever the reader had opened. The call itself stays in the message and in the
 * model's history; only its row is empty.
 */
function placeholderMarkup(segment: AparteToolCallSegment): string {
    return `<div class="aparte-segment aparte-segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(segment.status ?? 'pending')}" data-tool-call-id="${escapeAttr(segment.toolCall?.id ?? '')}" data-tool-name="${escapeAttr(segment.toolCall?.name ?? 'tool')}" hidden></div>`;
}

const isPlaceholder = (element: Element): boolean =>
    (element as HTMLElement).hidden && element.classList.contains('aparte-segment-tool-call') && element.childElementCount === 0;

/**
 * Core's own row, the line and what is behind it, once a hide and a registered renderer
 * have been ruled out. `behind` comes from the caller so the app's `details` is asked once
 * per draw: `update` has already asked it when it decides to rebuild.
 */
function drawDefault(segment: AparteToolCallSegment, behind: Behind): HTMLElement | string {
    const name = segment.toolCall?.name ?? 'tool';
    const status = segment.status ?? 'pending';
    const toolCallId = segment.toolCall?.id ?? '';

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
    const pill = pillMarkup(segment);  // safe-text: markup built by pillMarkup, whose own interpolations are each escaped or marked there
    // The quiet line, for a stylesheet: the target in the chat's font, the chevron at the end.
    const quiet = isQuiet(segment) ? ' data-quiet' : '';
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
     * COLLAPSED by default, including while the loop waits for a decision. The
     * `thinking` block stays closed while it is being produced — the most live
     * moment there is — so a tool call has no stronger claim to unroll itself. An
     * app that shows a developer what the agent did opens them the way reasoning is
     * opened: the segment's `collapsed` (a segment default), or the tool's display.
     *
     * A `<details>` only when there IS something behind it: a disclosure that
     * reveals nothing is an affordance that lies (ratified decision #8), and a tool
     * with no arguments and no result yet has nothing to reveal — nor one whose
     * display says `details: false`, the line alone for a reader who should not be
     * one click from raw JSON.
     */
    const input = behind.kind === 'parts' ? describeInput(segment) : '';
    const outcome = behind.kind === 'parts' ? outcomeOf(segment) : null;
    if (behind.kind === 'none' || (behind.kind === 'parts' && !input && !outcome)) {
        return `
        <div class="aparte-segment aparte-segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}" data-tool-name="${escapeAttr(name)}"${quiet}><div class="aparte-tool-line">${pill}</div>
        </div>
    `;
    }

    const cfg = contextConfig();
    const copy = copyButtonMarkup('aparte-tool-copy');  // safe-text: markup built by copyButtonMarkup, whose own interpolations are each escaped or marked there
    // Closed unless asked: the segment's own `collapsed` (a segment default reaches it
    // at insertion), else the tool's display. Read here only — `update` never forces it.
    const open = segment.collapsed !== undefined ? !segment.collapsed : cfg.getToolDisplay(name)?.open === true;
    if (behind.kind === 'body') {
        // The app's own detail, which may be an element: the row is built as one so
        // nothing of it goes through a string.
        const tpl = document.createElement('template');
        tpl.innerHTML = `
        <details class="aparte-segment aparte-segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}" data-tool-name="${escapeAttr(name)}"${quiet}${open ? ' open' : ''}>
            <summary class="aparte-tool-summary"><span class="aparte-tool-toggle">${toggle}</span>${pill}</summary>
            <div class="aparte-tool-detail" data-details="app"></div>
        </details>`.trim();
        const row = tpl.content.firstElementChild as HTMLElement;
        setBody(row, behind.body);
        return row;
    }
    return `
        <details class="aparte-segment aparte-segment-tool-call" data-segment-id="${escapeHtml(segment.id)}" data-status="${escapeAttr(status)}" data-tool-call-id="${escapeAttr(toolCallId)}" data-tool-name="${escapeAttr(name)}"${quiet}${open ? ' open' : ''}>
            <summary class="aparte-tool-summary"><span class="aparte-tool-toggle">${toggle}</span>${pill}</summary>
            <div class="aparte-tool-detail">
                ${input ? `
                <div class="aparte-tool-part" data-part="input">
                    <div class="aparte-tool-part-head"><span class="aparte-tool-part-label">${escapeHtml(cfg.t('toolInput'))}</span>${copy}</div>
                    <div class="aparte-tool-part-body" role="region" tabindex="0" aria-label="${escapeAttr(cfg.t('toolInput'))}"><pre><code>${escapeHtml(input)}</code></pre></div>
                </div>` : ''}
                ${outcome ? `
                <div class="aparte-tool-part" data-part="output">
                    <div class="aparte-tool-part-head"><span class="aparte-tool-part-label">${escapeHtml(cfg.t(outcome.key))}</span>${copy}</div>
                    <div class="aparte-tool-part-body" role="region" tabindex="0" aria-label="${escapeAttr(cfg.t(outcome.key))}"><pre><code>${escapeHtml(outcome.text)}</code></pre></div>
                </div>` : ''}
            </div>
        </details>
    `;
}

export const toolCallRenderer: AparteSegmentRenderer<AparteToolCallSegment> = {
    type: 'tool_call',
    render: (segment) => {
        const name = segment.toolCall?.name ?? 'tool';

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
        if (contextConfig().isToolHidden(name)) return placeholderMarkup(segment);
        const customRenderer = contextConfig().getToolRenderer(name);
        if (customRenderer) {
            // Its stylesheet, here as well as on the live path: this is what runs when a
            // stored conversation is re-rendered, and nothing replays `tool-start` for
            // history. Idempotent, keyed by renderer.
            injectToolRendererStyles(name, customRenderer);
            // Drawing nothing hides the call, the same element as a display's `hidden`
            // — it used to bring back the default row here while the live path dropped
            // the call, so a reload showed what the live chat had hidden.
            return customRenderer.render(segment) || placeholderMarkup(segment);
        }

        return drawDefault(segment, behindOf(segment));
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
        if (isPlaceholder(element)) return;
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
        if (icon) icon.innerHTML = iconOf(segment);
        setName(element, segment);
        setTarget(element, segment);
        setNote(element, segment);
        // The part labels are locale text too; the parts themselves stay (relabel adds none).
        const inputLabel = element.querySelector('[data-part="input"] .aparte-tool-part-label');
        if (inputLabel) inputLabel.textContent = cfg.t('toolInput');
        element.querySelector('[data-part="input"] .aparte-tool-part-body')?.setAttribute('aria-label', cfg.t('toolInput'));
        const outcome = outcomeOf(segment);
        const outputLabel = element.querySelector('[data-part="output"] .aparte-tool-part-label');
        if (outputLabel && outcome) outputLabel.textContent = cfg.t(outcome.key);
        if (outcome) element.querySelector('[data-part="output"] .aparte-tool-part-body')?.setAttribute('aria-label', cfg.t(outcome.key));
        for (const button of element.querySelectorAll<HTMLElement>('.aparte-tool-copy')) relabelCopyButton(button);
        // An app's detail may hold words in the reader's language too: its function is
        // asked again, and what it draws now is written into the nodes already there.
        const appDetail = appDetailOf(element);
        if (appDetail) {
            const behind = behindOf(segment);
            if (behind.kind === 'body') relabelBody(appDetail, behind.body);
        }
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
        setQuiet(element, segment);
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
        const hidden = contextConfig().isToolHidden(segment.toolCall?.name ?? 'tool');
        // A hidden call stays hidden: its placeholder only follows the status.
        if (hidden && isPlaceholder(element)) {
            element.setAttribute('data-status', status);
            return;
        }
        /*
         * Three cases this cannot patch, and each rebuilds instead.
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
         *
         * And a change of what is BEHIND the line, the app's detail for core's parts or
         * the other way: patched, the parts would be written around the app's markup.
         * That happens when a display gains or drops `details` while a turn is still
         * streaming, before the bubble redraws.
         */
        const custom = contextConfig().getToolRenderer(segment.toolCall?.name);
        // A registered renderer that declares `update` owns the patch — a mounted
        // preview or an opened disclosure in its markup survives the change. One
        // that does not is rebuilt, as it always was.
        // Never on a placeholder: it is not the renderer's markup, and a call it drew as
        // nothing may draw something now — a rebuild asks it.
        if (custom?.update && !hidden && !isPlaceholder(element)) {
            custom.update(element, segment);
            return;
        }
        const rebuild = (out: HTMLElement | string): void => {
            // A `<template>`, not the bubble's own converter: this file is a renderer
            // and must not import from the component that consumes it.
            const tpl = document.createElement('template');
            tpl.innerHTML = typeof out === 'string' ? out.trim() : '';
            const rebuilt = (typeof out === 'string' ? tpl.content.firstElementChild : out) as HTMLElement | null;
            if (rebuilt) {
                element.replaceWith(rebuilt);
                toolCallRenderer.setup?.(rebuilt, segment);
            }
        };
        if (custom || hidden || isPlaceholder(element)) {
            rebuild(toolCallRenderer.render(segment));
            return;
        }
        // Asked here, past the hide and the renderer, so an app's `details` is never asked
        // for a call it cannot draw — and once: a rebuild draws with this same answer.
        const behind = behindOf(segment);
        const input = behind.kind === 'parts' ? describeInput(segment) : '';
        const outcome = behind.kind === 'parts' ? outcomeOf(segment) : null;
        const wantsDetail = behind.kind === 'body' || !!input || !!outcome;
        const holdsAppDetail = !!appDetailOf(element);
        if (wantsDetail !== (element.tagName === 'DETAILS') || (wantsDetail && (behind.kind === 'body') !== holdsAppDetail)) {
            rebuild(drawDefault(segment, behind));
            return;
        }

        element.setAttribute('data-status', status);
        const badge = element.querySelector('.aparte-tool-state');
        if (badge) badge.innerHTML = stateBadge(segment);
        setQuiet(element, segment);
        setName(element, segment);
        setTarget(element, segment);
        setNote(element, segment);

        if (behind.kind === 'body') {
            setBody(element, behind.body);
            return;
        }
        setPart(element, 'input', input, 'toolInput');
        setPart(element, 'output', outcome?.text ?? '', outcome?.key ?? 'toolOutput');
        highlightParts(element);
    },
    setup: (element, segment) => {
        if (isPlaceholder(element)) return;
        // The one control of ours is each part's copy button. The approval buttons that
        // used to be wired here dispatched `aparte-tool-decision`; the decision is
        // answered at the composer now, and the transcript holds no decision control.
        wireParts(element);
        highlightParts(element);
        const customRenderer = contextConfig().getToolRenderer(segment.toolCall?.name);
        customRenderer?.setup?.(element, segment);
    },
    // CSS lives in styles/segment/ — see that folder for why a
    // built-in's rules belong there. `getStyles` stays for a CONSUMER's renderer, which
    // has no other way onto the page.
    getStyles: () => ''
};
