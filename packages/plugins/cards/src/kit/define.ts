/**
 * `defineCard()` — what every card is made of, so a card only draws.
 *
 * A card is one drawing reached three ways, all of them seams core already has:
 *
 *  - **a tool's result**: `registerToolRenderer` puts the card where the tool's row would
 *    be. The app says which tool, and how its result maps onto the card's fields — its
 *    data keeps its own shape;
 *  - **a `card` segment**: a server, a runner or the app adds
 *    `{ type: 'card', card: 'weather', data }` and the same card draws it. One segment
 *    type for every card, not `custom`: an app has ONE renderer for `custom`, and taking
 *    it would take the app's;
 *  - a block in the text, for a source that only sends text — a later step.
 *
 * While the tool runs the card shows its skeleton, with what the call's input already
 * says (the city before the forecast). Waiting for a decision, refused, stopped or failed,
 * it shrinks to one line that says so — the result of a call that did not run is not
 * drawn as if it had.
 *
 * A **variant** is the same card laid out another way — `data-variant` on its root, read
 * by its sheet and its `render` — never a second registration.
 */
import {
    aparteGlobalConfig,
    cssEscape,
    overrideSegmentRenderer,
    type AparteConfig,
    type AparteSegmentBase,
    type AparteSegmentRenderer,
    type AparteToolCallSegment,
    type AparteToolMatcher,
    type AparteToolRenderer,
} from '@aparte/core';
import { el, glyph, safeUrl } from './dom.js';
import { KIT_WORDS, word, type CardWord } from './strings.js';
import kitStyles from './cards.css?raw';

/** The segment type every card shares. */
export const CARD_SEGMENT_TYPE = 'card';

/**
 * A card added as a segment: `card` names it, `data` is in the card's own fields, and
 * `fallback` is the sentence a text-only reader gets — the history sent back to a model,
 * a build without this card.
 */
export interface AparteCardSegment extends AparteSegmentBase {
    type: 'card';
    card: string;
    data: unknown;
    variant?: string;
    fallback?: string;
}

declare module '@aparte/core' {
    interface AparteSegmentTypes {
        card: AparteCardSegment;
    }
}

/** A button under a card: a link it opens, a message it sends, or an `id` the app handles. */
export interface CardAction {
    label: string;
    /** Opened in a new tab; `http(s)`, `mailto` and `tel` only, otherwise the button is not drawn. */
    url?: string;
    /** Sent as the person's next message, through the chat's composer. */
    send?: string;
    /** Only reported, in the `aparte-card-action` event. */
    id?: string;
    /** Drawn as the card's main action. */
    primary?: boolean;
}

/**
 * A button under a card was pressed. Bubbles out of the chat; cancel it to handle the action
 * yourself instead of the link or the message. The detail is the card's name, the action and
 * the data the card was drawn from.
 *
 * @event aparte-card-action
 */
export interface CardActionEventDetail {
    card: string;
    action: CardAction;
    data: unknown;
}

/**
 * What `aparte-card-change` carries: a control inside a card was moved — a range chosen,
 * a switch flipped, a slider let go. Bubbles out of the chat; cancel the event to stop the
 * card's `onChange`.
 *
 * @event aparte-card-change
 */
export interface CardChangeEventDetail {
    card: string;
    /** The control's name, as the card gave it (`range`, `power`, `brightness`…). */
    name: string;
    value: unknown;
    /** The data the card was drawn from when the control moved. */
    data: unknown;
}

// Typed where they are dispatched: `addEventListener('aparte-card-action', (e) => e.detail.action)`
// with no cast, on an element, the document or the window (both bubble out of the chat). The
// types name the plugin's actions, so they cannot live in core's event map.
interface CardEventMap {
    'aparte-card-action': CustomEvent<CardActionEventDetail>;
    'aparte-card-change': CustomEvent<CardChangeEventDetail>;
}
declare global {
    interface HTMLElementEventMap extends CardEventMap {}
    interface DocumentEventMap extends CardEventMap {}
    interface WindowEventMap extends CardEventMap {}
}

/** What a card's drawing functions are handed. */
export interface CardContext<V extends string = string> {
    config: AparteConfig;
    variant: V;
    /** Where the data came from. */
    source: 'tool' | 'segment';
    /** Set `el`'s text to a word, and again after a language switch. */
    word(el: Element, key: string, table: CardWord, vars?: Record<string, string>): void;
    /** Set `el`'s text (or `attr`) from `compute`, and again after a language switch. */
    bind(el: Element, compute: () => string, attr?: string): void;
    /**
     * A button for an action inside the card — one per item of a carousel, say — wired like
     * the card's own: the `aparte-card-action` event (with `data`), then the link or the
     * message. `null` for an action that cannot run (no label, a link that is not http(s)).
     */
    action(action: CardAction, data?: unknown, className?: string): HTMLButtonElement | null;
    /**
     * Report that a control inside the card moved: `aparte-card-change` fires, then the
     * app's `onChange` runs, and what it returns is drawn in place — the same element,
     * the focus kept. The kit's controls (`segmented`, `toggle`, `slider`) call it.
     */
    change(name: string, value: unknown): void;
    /** Whether the app handles a change (an `onChange` was given): a card draws a control only when it does. */
    readonly live: boolean;
}

/** A card: its name, its variants, its sheet, and how it draws. */
export interface CardDefinition<D, V extends string = string> {
    /** The name a `card` segment gives, and the root's `data-card`. */
    name: string;
    /** Its layouts; the first is the default. */
    variants: readonly V[];
    /** Its stylesheet. The kit's own is added in front of it. */
    styles: string;
    /** The card's data from what it is given — `null` when there is nothing it can draw. */
    normalize(raw: unknown): D | null;
    /** The inside of the card, in `ctx.variant`. */
    render(data: D, ctx: CardContext<V>): Node[];
    /** The inside while the tool runs, from what its input already says. */
    skeleton(partial: Partial<D> | null, ctx: CardContext<V>): Node[];
    /** The card's accessible name ("Weather in Lille"), from whatever is known. */
    label(data: Partial<D> | null, ctx: CardContext<V>): string;
    /** One sentence of the data, for a reader that gets no card. */
    fallback(data: D, ctx: CardContext<V>): string;
    /** The one-line state drawing's glyph. */
    icon: string;
    /** What a running call's input already says: the city before the forecast. */
    partial?(input: Record<string, unknown>): Partial<D> | null;
}

/** How an app plugs a card in. */
export interface CardSetupOptions<D, V extends string = string> {
    /** The tool (or tools) whose result this card draws. Without it, only `card` segments draw it. */
    tool?: AparteToolMatcher | AparteToolMatcher[];
    /**
     * The card's fields from the tool's result — its `structuredContent` when it has one,
     * else its text parsed as JSON, else the text. Return `null` for a result the card
     * cannot draw. Without `map`, the result must already be in the card's fields.
     */
    // `any`: the result's shape is your tool's, and `map` is where you read it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map?: (result: any, input: Record<string, unknown>, segment: AparteToolCallSegment) => unknown;
    /** What the call's input already says, shown while it runs. Defaults to the card's own reading. */
    mapInput?: (input: Record<string, unknown>) => Partial<D> | null;
    /** A variant, or a function choosing one from the data. A name the card lacks reads as its default. */
    variant?: V | ((data: D) => V);
    /** Buttons under the card, at most three. */
    actions?: (data: D) => CardAction[];
    /**
     * A control inside the card moved (a range, a switch, a slider). Return the card's new
     * fields — the shape `map` returns — and the card is drawn again in place, the same
     * element with the focus kept; return nothing to leave it as it is. While it runs the
     * card is marked busy. Only the latest change is drawn when several overlap. The new
     * data lives in the page: a conversation reloaded from storage shows what was saved.
     */
    onChange?: (change: { name: string; value: unknown }, data: D) => unknown;
    /** The config to register on (the global one by default). */
    config?: AparteConfig;
}

type DrawState = 'ready' | 'loading' | 'waiting' | 'refused' | 'unavailable';

/** What a registered card keeps, per config. */
interface Entry {
    draw(segment: AparteCardSegment): HTMLElement;
}

/** Per config, each card's setups, the newest last: the newest draws the card's segments. */
const registries = new WeakMap<AparteConfig, Map<string, Entry[]>>();
const bindings = new WeakMap<Element, Array<{ attr?: string; compute: () => string }>>();

/**
 * Where a binding writes: an attribute, the text, or — for a glyph from core's icon provider —
 * the markup. Not a valid attribute name, so no attribute binding can be mistaken for it.
 */
const MARKUP = ':markup';

function apply(target: Element, compute: () => string, attr?: string): void {
    const text = compute();
    if (attr === MARKUP) target.innerHTML = text; // safe-text: only bindMarkup writes here, with core's icon markup
    else if (attr) target.setAttribute(attr, text);
    else target.textContent = text;
}

/**
 * A glyph from core's icon provider, written again on a relabel — the provider can change
 * after the card is drawn (`setIconProvider`), and core's relabel contract re-reads it. Only
 * for markup that is core's own (`config.getIcon`), never for a value from the data.
 */
export function bindMarkup(target: Element, compute: () => string): void {
    apply(target, compute, MARKUP);
    const list = bindings.get(target) ?? [];
    list.push({ attr: MARKUP, compute });
    bindings.set(target, list);
    target.setAttribute('data-card-bound', '');
}

/** The text a drawn card holds in the chat's language, read again on a switch. */
function relabel(root: Element): void {
    const own = bindings.get(root);
    if (own) for (const b of own) apply(root, b.compute, b.attr);
    for (const node of root.querySelectorAll('[data-card-bound]')) {
        for (const b of bindings.get(node) ?? []) apply(node, b.compute, b.attr);
    }
}

function makeContext<V extends string>(
    config: AparteConfig,
    variant: V,
    source: 'tool' | 'segment',
    card: string,
    onChange?: (name: string, value: unknown) => void,
): CardContext<V> {
    const bind = (target: Element, compute: () => string, attr?: string) => {
        apply(target, compute, attr);
        const list = bindings.get(target) ?? [];
        list.push({ attr, compute });
        bindings.set(target, list);
        target.setAttribute('data-card-bound', '');
    };
    return {
        config,
        variant,
        source,
        bind,
        word: (target, key, table, vars) => bind(target, () => word(config, key, table, vars)),
        action: (action, data, className) => actionButton(card, action, data, className),
        change: (name, value) => onChange?.(name, value),
        live: onChange !== undefined,
    };
}

/**
 * Put `next`'s inside into `element` — the element already on the page — keeping it, its
 * place, and the focus: a control the reader just pressed is pressed again in the new
 * drawing (by its `data-card-key`, else by its position).
 */
function patch(element: HTMLElement, next: HTMLElement): void {
    const active = typeof document === 'undefined' ? null : document.activeElement;
    let key: string | null = null;
    let path: number[] | null = null;
    if (active instanceof HTMLElement && element.contains(active) && active !== element) {
        key = active.getAttribute('data-card-key');
        path = [];
        for (let node: Element = active; node !== element; node = node.parentElement!) {
            path.unshift(Array.prototype.indexOf.call(node.parentElement!.children, node));
        }
    }
    for (const name of element.getAttributeNames()) if (!next.hasAttribute(name)) element.removeAttribute(name);
    for (const name of next.getAttributeNames()) element.setAttribute(name, next.getAttribute(name)!);
    element.replaceChildren(...next.childNodes);
    const moved = bindings.get(next);
    if (moved) bindings.set(element, moved);
    const from = drawnFrom.get(next);
    if (from === undefined) drawnFrom.delete(element);
    else drawnFrom.set(element, from);
    homes.set(next, element);
    if (key !== null || path) {
        let target: Element | null = key ? element.querySelector(`[data-card-key="${cssEscape(key)}"]`) : null;
        if (!target && path) {
            target = element;
            for (const i of path) target = target?.children[i] ?? null;
        }
        if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }
}

/** A drawing that was moved into an element already on the page, and that element. */
const homes = new WeakMap<Element, HTMLElement>();

/** Per drawn card, how many times core gave it a new result: a change started before is dropped. */
const changeTurns = new WeakMap<Element, number>();

/** The changes a card is working through, and the data the last one left. */
interface Queue<D> {
    pending: Map<string, unknown>;
    running: boolean;
    data: D;
    variant: string;
}
const queues = new WeakMap<Element, Queue<unknown>>();

/** What each drawing was drawn from (see `fingerprint`), carried onto the page by `patch`. */
const drawnFrom = new WeakMap<Element, string>();

/** Core drew the card from a new result: what was waiting on the app's answer no longer applies. */
function bumpTurn(element: Element): void {
    changeTurns.set(element, (changeTurns.get(element) ?? 0) + 1);
    queues.delete(element);
}

function busy(element: Element, on: boolean): void {
    element.toggleAttribute('data-busy', on);
    if (on) element.setAttribute('aria-busy', 'true');
    else element.removeAttribute('aria-busy');
}

/** A button that runs `action`, or `null` when it cannot run. */
function actionButton(card: string, action: CardAction, data: unknown, className = ''): HTMLButtonElement | null {
    if (!action || typeof action.label !== 'string' || !action.label.trim()) return null;
    const url = action.url === undefined ? undefined : safeUrl(action.url);
    if (action.url !== undefined && !url) return null;
    if (!url && action.send === undefined && action.id === undefined) return null;
    const button = el('button', {
        class: `aparte-btn aparte-btn--sm ${action.primary ? 'aparte-btn--primary aparte-btn--solid' : 'aparte-btn--surface'} aparte-rich-card__action${className ? ` ${className}` : ''}`,
        attrs: { type: 'button' },
        text: action.label,
    });
    button.addEventListener('click', (event) => {
        // A button inside a card that is itself a link must not follow the link too.
        event.stopPropagation();
        runAction(card, button, action, url, data);
    });
    return button;
}

function runAction(card: string, button: HTMLElement, action: CardAction, url: string | null | undefined, data: unknown): void {
    const detail: CardActionEventDetail = { card, action, data };
    const proceed = button.dispatchEvent(new CustomEvent<CardActionEventDetail>('aparte-card-action', {
        detail, bubbles: true, composed: true, cancelable: true,
    }));
    if (!proceed) return;
    if (url) {
        // `mailto:` and `tel:` hand over to the mail or phone app: a new tab for them is left
        // empty in some browsers. A web page opens beside the chat.
        if (/^https?:/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer');
        else window.location.href = url;
        return;
    }
    if (action.send !== undefined) {
        type Composer = HTMLElement & { value: string; streaming: boolean; panelActive: boolean; setValue(v: string): void; submit(): void };
        // The chat the card is in, in every shape: `<aparte-chat>` (vanilla, Angular) or the
        // `<div data-aparte-chat>` the React, Vue and Svelte wrappers render.
        const composer = (button.closest('aparte-chat, [data-aparte-chat]')?.querySelector('aparte-composer')
            ?? document.querySelector('aparte-composer')) as Composer | null;
        if (!composer) {
            console.warn(`[aparte-cards] the ${card} card has no <aparte-composer> to send "${action.send}" through.`);
            return;
        }
        // While a reply streams, `submit()` stops it; while a question holds the composer, it
        // answers the question. Neither is what a card's button means.
        if (composer.streaming || composer.panelActive) return;
        const draft = composer.value;
        composer.setValue(action.send);
        composer.submit();
        // What the person was writing is theirs: it comes back once the card's message is sent.
        if (draft.trim()) composer.setValue(draft);
    }
}

function parseResult(segment: AparteToolCallSegment): unknown {
    if (segment.structuredResult !== undefined) return segment.structuredResult;
    const text = segment.result;
    if (typeof text !== 'string') return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function stateOf(segment: AparteToolCallSegment): DrawState {
    switch (segment.status) {
        case 'resolved': return 'ready';
        case 'pending': return 'loading';
        case 'awaiting-approval': return 'waiting';
        case 'rejected': return 'refused';
        default: return 'unavailable';
    }
}

/**
 * Define a card. Returns its `setup`, which plugs it into a chat and returns the function
 * that unplugs it.
 */
export function defineCard<D, V extends string>(definition: CardDefinition<D, V>) {
    const styles = `${kitStyles}\n${definition.styles}`;
    const defaultVariant = definition.variants[0]!;
    const known = new Set<string>(definition.variants);
    const warned = new WeakSet<object>();

    function chooseVariant(options: CardSetupOptions<D, V>, data: D | null, asked?: string): V {
        const wanted = asked ?? (typeof options.variant === 'function' ? (data ? options.variant(data) : undefined) : options.variant);
        return (wanted && known.has(wanted) ? wanted : defaultVariant) as V;
    }

    function root(state: DrawState, variant: V, id: string): HTMLElement {
        return el('div', {
            class: `aparte-segment aparte-card aparte-rich-card aparte-${definition.name}-card`,
            attrs: {
                'data-segment-id': id,
                'data-card': definition.name,
                'data-variant': variant,
                'data-state': state,
                role: 'group',
                'aria-busy': state === 'loading' ? 'true' : undefined,
            },
        });
    }

    function actionsOf(options: CardSetupOptions<D, V>, data: D): HTMLElement | null {
        const buttons = (options.actions?.(data) ?? [])
            .map((action) => actionButton(definition.name, action, data))
            .filter((b): b is HTMLButtonElement => b !== null)
            .slice(0, 3);
        return buttons.length ? el('div', { class: 'aparte-rich-card__actions' }, ...buttons) : null;
    }

    /** The one-line drawing of a call that has no data to show. */
    function strip(config: AparteConfig, state: Exclude<DrawState, 'ready' | 'loading'>, partial: Partial<D> | null, variant: V, id: string, source: 'tool' | 'segment' = 'tool'): HTMLElement {
        const node = root(state, variant, id);
        const ctx = makeContext(config, variant, source, definition.name);
        const key = state === 'waiting' ? 'cardsWaiting' : state === 'refused' ? 'cardsRefused' : 'cardsUnavailable';
        const title = el('span', { class: 'aparte-rich-card__strip-title' });
        ctx.bind(title, () => definition.label(partial, ctx));
        const status = el('span', { class: 'aparte-rich-card__strip-state' });
        ctx.word(status, key, KIT_WORDS[key]);
        node.append(el('div', { class: 'aparte-rich-card__strip' }, glyph(definition.icon), title, status));
        ctx.bind(node, () => definition.label(partial, ctx), 'aria-label');
        return node;
    }

    function drawTool(options: CardSetupOptions<D, V>, config: AparteConfig, segment: AparteToolCallSegment): HTMLElement {
        const state = stateOf(segment);
        const input = (segment.toolCall?.input ?? {}) as Record<string, unknown>;
        const readInput = options.mapInput ?? definition.partial;
        let partial: Partial<D> | null = null;
        try {
            partial = readInput?.(input) ?? null;
        } catch {
            partial = null;
        }
        if (state === 'loading') {
            const variant = chooseVariant(options, null);
            const node = root(state, variant, segment.id);
            const ctx = makeContext(config, variant, 'tool', definition.name);
            node.append(...definition.skeleton(partial, ctx));
            ctx.bind(node, () => `${definition.label(partial, ctx)} — ${word(config, 'cardsLoading', KIT_WORDS.cardsLoading)}`, 'aria-label');
            return node;
        }
        if (state !== 'ready') return strip(config, state, partial, chooseVariant(options, null), segment.id);
        let data: D | null = null;
        let from = '';
        try {
            const raw = parseResult(segment);
            from = fingerprint(raw);
            const live = recall(options, `tool:${segment.id}`, from);
            if (live) return drawData(options, config, live.data, live.variant, segment.id, 'tool', from);
            data = definition.normalize(options.map ? options.map(raw, input, segment) : raw);
        } catch (error) {
            console.warn(`[aparte-cards] the ${definition.name} card's map threw:`, error);
        }
        if (!data) {
            if (!warned.has(options)) {
                warned.add(options);
                console.warn(`[aparte-cards] the ${definition.name} card got a result it cannot draw — check its \`map\` (tool "${segment.toolCall?.name}").`);
            }
            return strip(config, 'unavailable', partial, chooseVariant(options, null), segment.id);
        }
        return drawData(options, config, data, chooseVariant(options, data), segment.id, 'tool', from);
    }

    /**
     * What `onChange` gave each card, by the segment it is drawn for and what it was drawn
     * from. Core draws a segment again from the message — when a turn ends, when the
     * conversation is saved, when a Markdown provider arrives late — and only a framework
     * component's drawing survives that; without this, a card would go back to its first
     * data at the next save. A new result for the segment is a new card: what was kept
     * for the old one is dropped.
     */
    const kept = new WeakMap<CardSetupOptions<D, V>, Map<string, { from: string; data: D; variant: V }>>();

    function recall(options: CardSetupOptions<D, V>, key: string, from: string): { data: D; variant: V } | undefined {
        const byKey = kept.get(options);
        const entry = byKey?.get(key);
        if (!entry) return undefined;
        if (from && entry.from === from) return entry;
        byKey!.delete(key);
        return undefined;
    }

    function remember(options: CardSetupOptions<D, V>, key: string, from: string, data: D, variant: V): void {
        // A result that cannot be told apart from another cannot be matched again.
        if (!from) return;
        const byKey = kept.get(options) ?? new Map<string, { from: string; data: D; variant: V }>();
        kept.set(options, byKey);
        byKey.delete(key);
        byKey.set(key, { from, data, variant });
        // The oldest go first: a page that changed a hundred cards still remembers the latest.
        if (byKey.size > KEPT_MAX) byKey.delete(byKey.keys().next().value!);
    }

    function drawData(options: CardSetupOptions<D, V>, config: AparteConfig, data: D, variant: V, id: string, source: 'tool' | 'segment', from: string): HTMLElement {
        const node = root('ready', variant, id);
        drawnFrom.set(node, from);
        // The element on the page: a redraw moves this drawing into the one already there.
        const onChange = (name: string, value: unknown) => void change(homes.get(node) ?? node, options, config, data, variant, id, source, from, name, value);
        const ctx = makeContext(config, variant, source, definition.name, options.onChange ? onChange : undefined);
        node.append(...definition.render(data, ctx));
        const actions = actionsOf(options, data);
        if (actions) node.append(actions);
        ctx.bind(node, () => definition.label(data, ctx), 'aria-label');
        return node;
    }

    async function change(
        node: HTMLElement,
        options: CardSetupOptions<D, V>,
        config: AparteConfig,
        data: D,
        variant: V,
        id: string,
        source: 'tool' | 'segment',
        from: string,
        name: string,
        value: unknown,
    ): Promise<void> {
        const element = node;
        const waiting = queues.get(element) as Queue<D> | undefined;
        const detail: CardChangeEventDetail = { card: definition.name, name, value, data: waiting?.data ?? data };
        const proceed = element.dispatchEvent(new CustomEvent<CardChangeEventDetail>('aparte-card-change', {
            detail, bubbles: true, composed: true, cancelable: true,
        }));
        if (!proceed || !options.onChange) return;
        /*
         * One change at a time, in order, each from the data the one before it left. Run side
         * by side, each would start from the drawing it was pressed in, and the later answer —
         * built on data that never saw the earlier change — would undo it: the light turned on,
         * then dimmed, would come back off. A control moved again before its turn keeps only
         * its latest value: three presses on a range button ask for one range.
         */
        const queue: Queue<D> = waiting ?? { pending: new Map(), running: false, data, variant };
        queues.set(element, queue);
        queue.pending.delete(name);
        queue.pending.set(name, value);
        if (queue.running) return;
        queue.running = true;
        const turn = changeTurns.get(element) ?? 0;
        busy(element, true);
        try {
            while (queue.pending.size > 0) {
                const [nextName, nextValue] = queue.pending.entries().next().value!;
                queue.pending.delete(nextName);
                let next: unknown;
                try {
                    next = await options.onChange({ name: nextName, value: nextValue }, queue.data);
                } catch (error) {
                    console.warn(`[aparte-cards] the ${definition.name} card's onChange threw:`, error);
                    continue;
                }
                // Core drew the card again from a new result while this ran: that result is newer.
                if ((changeTurns.get(element) ?? 0) !== turn) return;
                if (next === undefined || next === null) continue;
                const fresh = definition.normalize(next);
                if (!fresh) {
                    console.warn(`[aparte-cards] the ${definition.name} card's onChange returned data it cannot draw — it was left as it was.`);
                    continue;
                }
                queue.data = fresh;
                queue.variant = chooseVariant(options, fresh, queue.variant as V);
                remember(options, `${source}:${id}`, from, fresh, queue.variant as V);
                patch(element, drawData(options, config, fresh, queue.variant as V, id, source, from));
                if (queue.pending.size > 0) busy(element, true);
            }
        } finally {
            queue.running = false;
            if (queues.get(element) === queue) queues.delete(element);
            if ((changeTurns.get(element) ?? 0) === turn) busy(element, false);
        }
    }

    function setup(options: CardSetupOptions<D, V> = {}): () => void {
        const config = options.config ?? aparteGlobalConfig;
        const matchers = options.tool === undefined ? [] : Array.isArray(options.tool) ? options.tool : [options.tool];

        const toolRenderer: AparteToolRenderer = {
            render: (segment) => drawTool(options, config, segment),
            // Same element, new inside: the card the reader is looking at stays put.
            update: (element, segment) => {
                const next = drawTool(options, config, segment);
                // A new result is newer than any change still waiting on the app's answer; the
                // same result sent again (a turn ending, a save) leaves that change running.
                if (drawnFrom.get(next) !== drawnFrom.get(element)) bumpTurn(element);
                const wasBusy = element.hasAttribute('data-busy') && queues.has(element);
                patch(element, next);
                if (wasBusy) busy(element, true);
            },
            relabel: (element) => relabel(element),
            getStyles: () => styles,
        };
        // Overrides, not registrations: they stack. Two setups of the same tool — two components
        // that each declare it, a page that sets a card up twice — the newer draws, and taking
        // the older off leaves the newer in place; the last one off gives back what was there.
        const restores = matchers.map((match) => config.overrideToolRenderer(match, toolRenderer));

        const registry = registries.get(config) ?? new Map<string, Entry[]>();
        registries.set(config, registry);
        const entry: Entry = {
            draw: (segment) => {
                const from = fingerprint(segment.data);
                const live = recall(options, `segment:${segment.id}`, from);
                if (live) return drawData(options, config, live.data, live.variant, segment.id, 'segment', from);
                const data = definition.normalize(segment.data);
                const variant = chooseVariant(options, data, segment.variant);
                if (!data) return strip(config, 'unavailable', null, variant, segment.id, 'segment');
                return drawData(options, config, data, variant, segment.id, 'segment', from);
            },
        };
        const stack = registry.get(definition.name) ?? [];
        stack.push(entry);
        registry.set(definition.name, stack);
        // One override per setup, stacked like the tool's. Each registration injects the sheets
        // as they are now — a card whose module loaded after the first setup brings its own —
        // and draws again the `card` segments already on screen, so one drawn as its fallback
        // sentence before its card was set up becomes the card.
        const restoreSegments = overrideSegmentRenderer(cardSegmentRenderer(config), config);

        let stopped = false;
        return () => {
            if (stopped) return;
            stopped = true;
            for (const restore of restores) restore();
            const own = registry.get(definition.name);
            const at = own?.indexOf(entry) ?? -1;
            if (own && at >= 0) own.splice(at, 1);
            if (own && own.length === 0) registry.delete(definition.name);
            restoreSegments();
        };
    }

    /**
     * A `card` segment for this card, with its `fallback` sentence written — what a
     * server or a scenario adds to a message: `viewport.addSegment(id, weather.segment(data))`.
     */
    function segment(raw: unknown, options: { id?: string; variant?: V; config?: AparteConfig } = {}): AparteCardSegment {
        const config = options.config ?? aparteGlobalConfig;
        const data = definition.normalize(raw);
        const ctx = makeContext(config, (options.variant ?? defaultVariant) as V, 'segment', definition.name);
        return {
            id: options.id ?? `card-${definition.name}-${Math.random().toString(36).slice(2, 10)}`,
            type: CARD_SEGMENT_TYPE,
            card: definition.name,
            data: raw,
            ...(options.variant ? { variant: options.variant } : {}),
            ...(data ? { fallback: definition.fallback(data, ctx) } : {}),
        };
    }

    // One sheet per document for every card's segments: the kit's, then each card's.
    sheets.add(styles);

    return { name: definition.name, variants: definition.variants, setup, segment };
}

const sheets = new Set<string>();

/** Cards whose `onChange` data is remembered, per setup. */
const KEPT_MAX = 100;

/** What a card was drawn from, as text to compare — `''` when it cannot be written (a cycle). */
function fingerprint(raw: unknown): string {
    try {
        return JSON.stringify(raw) ?? '';
    } catch {
        return '';
    }
}

/** The renderer for `card` segments: it hands each one to the card it names. */
function cardSegmentRenderer(config: AparteConfig): AparteSegmentRenderer<AparteCardSegment> {
    return {
        type: CARD_SEGMENT_TYPE,
        render: (segment) => {
            const entry = registries.get(config)?.get(segment.card)?.at(-1);
            if (entry) return entry.draw(segment);
            // A card this page did not set up: its sentence, not nothing.
            return el('p', { class: 'aparte-segment aparte-rich-card__fallback', attrs: { 'data-segment-id': segment.id }, text: segment.fallback ?? '' });
        },
        // A card segment sent again with new data (`updateSegment`) is drawn in place.
        update: (element, segment) => {
            const entry = registries.get(config)?.get(segment.card)?.at(-1);
            if (!entry) return;
            // Drawn as its fallback sentence before its card was set up: the card replaces it.
            if (!element.hasAttribute('data-card')) {
                element.replaceWith(entry.draw(segment));
                return;
            }
            const next = entry.draw(segment);
            if (drawnFrom.get(next) !== drawnFrom.get(element)) bumpTurn(element);
            const wasBusy = element.hasAttribute('data-busy') && queues.has(element);
            patch(element, next);
            if (wasBusy) busy(element, true);
        },
        relabel: (element) => relabel(element),
        getStyles: () => [...sheets].join('\n'),
    };
}
