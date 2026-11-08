import {
    placeFloating, resolveConfig,
    type AparteComposer, type AparteComposerInput, type AparteComposerToken,
} from '@aparte/core';
import { collectCommands, commandItems } from './collect.js';
import { detectTrigger, type TriggerHit } from './detect.js';
import { groupRows, matchRows, type TriggerRow } from './match.js';
import type {
    AparteCommandScope, AparteTrigger, AparteTriggerContext, AparteTriggerItem, AparteTriggerSelectEventDetail,
    AparteTriggerSource,
} from './types.js';

type Status = 'loading' | 'empty' | 'error' | null;

/** One open panel: the root list, or a submenu. */
interface Level {
    panel: HTMLElement;
    rows: TriggerRow[];
    active: number;
    status: Status;
    /** Asks again, when the list failed. */
    reload: (() => void) | null;
    /** The row that opened this panel; `null` on the root. */
    owner: HTMLElement | null;
    abort: AbortController | null;
}

const NOTICE_MS = 4000;
const HOVER_OPEN_MS = 120;
const DEFAULT_DEBOUNCE_MS = 150;
const COMPACT_WIDTH = '(max-width: 640px)';
const BACK_ID = '__aparte-back';

let nextId = 0;

/**
 * Opens a menu when a trigger character is typed in the composer: `/` for commands, `@` for
 * mentions, and any other you declare. Written inside `<aparte-composer>`, it draws nothing
 * until a trigger fires. The focus stays in the field the whole time, so typing goes on
 * narrowing the list; arrows, Enter, Tab and Escape act on the menu while it is open.
 *
 * Other plugins add commands to the list by answering `aparte-collect-commands`, which
 * needs neither side to import the other.
 *
 * @element aparte-triggers
 *
 * @fires {CustomEvent<AparteTriggerSelectEventDetail>} aparte-trigger-select - A row was chosen.
 *   Cancelable: `preventDefault()` leaves the draft untouched and runs nothing.
 * @fires {CustomEvent<AparteCollectCommandsDetail>} aparte-collect-commands - A menu with commands is opening.
 *
 * @cssprop [--aparte-triggers-max-height=320px] - Height at which a list starts to scroll.
 */
export class AparteTriggers extends HTMLElement {
    private _triggers: readonly AparteTrigger[] = [{ char: '/', at: 'message', commands: true }];
    private readonly _id = `aparte-triggers-${++nextId}`;
    private _composer: AparteComposer | null = null;
    private _hit: TriggerHit | null = null;
    private _levels: Level[] = [];
    private _dismissed: { start: number; char: string } | null = null;
    private _commands: readonly AparteTriggerItem[] = [];
    private _debounce: ReturnType<typeof setTimeout> | undefined;
    private _hover: ReturnType<typeof setTimeout> | undefined;
    /** The row the pointer was last seen on: a move inside one row is not a new row. */
    private _hoverRow: HTMLElement | null = null;
    private _composing = false;
    private _editorRole: string | null = null;

    /** What opens a menu, and with what. By default `/` at the start of a message, listing the commands plugins add. */
    get triggers(): readonly AparteTrigger[] { return this._triggers; }
    set triggers(next: readonly AparteTrigger[]) {
        this._triggers = next ?? [];
        this.close();
    }

    /** A menu is open. */
    get isOpen(): boolean { return this._levels.length > 0; }

    connectedCallback(): void {
        this.style.display = 'contents';
        const composer = this.closest<AparteComposer>('aparte-composer');
        if (!composer) {
            console.warn('[aparte-triggers] must be placed inside <aparte-composer>.');
            return;
        }
        this._composer = composer;
        composer.addEventListener('keydown', this._onKeydown, { capture: true });
        composer.addEventListener('input', this._refresh);
        composer.addEventListener('compositionstart', this._onCompositionStart);
        composer.addEventListener('compositionend', this._onCompositionEnd);
        composer.addEventListener('focusout', this._onFocusOut);
        composer.addEventListener('aparte-send', this._onSend);
        document.addEventListener('selectionchange', this._refresh);
    }

    disconnectedCallback(): void {
        this.close();
        const composer = this._composer;
        if (!composer) return;
        composer.removeEventListener('keydown', this._onKeydown, { capture: true });
        composer.removeEventListener('input', this._refresh);
        composer.removeEventListener('compositionstart', this._onCompositionStart);
        composer.removeEventListener('compositionend', this._onCompositionEnd);
        composer.removeEventListener('focusout', this._onFocusOut);
        composer.removeEventListener('aparte-send', this._onSend);
        document.removeEventListener('selectionchange', this._refresh);
        this._composer = null;
    }

    /** Close the menu. */
    close(): void {
        clearTimeout(this._debounce);
        clearTimeout(this._hover);
        this._hoverRow = null;
        this._truncate(0);
        this._hit = null;
        this._syncEditor();
        window.removeEventListener('resize', this._place);
        window.removeEventListener('scroll', this._place, true);
    }

    private get _input(): AparteComposerInput | null {
        return this._composer?.querySelector<AparteComposerInput>('aparte-composer-input') ?? null;
    }

    private get _editor(): HTMLElement | null {
        return this._input?.querySelector<HTMLElement>('.aparte-ci-editor') ?? null;
    }

    private get _rtl(): boolean {
        return getComputedStyle(this).direction === 'rtl';
    }

    /** One panel at a time, in place of its parent: a phone has no room beside a row. */
    private get _compact(): boolean {
        return typeof window.matchMedia === 'function' && window.matchMedia(COMPACT_WIDTH).matches;
    }

    private _scope(): AparteCommandScope {
        const composer = this._composer!;
        const chat = composer.closest<HTMLElement>('aparte-chat, [data-aparte-chat]');
        return {
            config: resolveConfig(this),
            composer,
            chat,
            targetId: composer.getAttribute('target') || chat?.id || undefined,
        };
    }

    // ── Listening ───────────────────────────────────────────────────────

    private readonly _onCompositionStart = (): void => { this._composing = true; };
    private readonly _onCompositionEnd = (): void => {
        this._composing = false;
        this._refresh();
    };
    private readonly _onSend = (): void => { this.close(); };
    private readonly _onFocusOut = (e: FocusEvent): void => {
        if (!this._composer?.contains(e.relatedTarget as Node | null)) this.close();
    };

    /** Read the caret again: every keystroke, and every move of the caret. */
    private readonly _refresh = (): void => {
        if (this._composing) return;
        const caret = this._input?.getCaret() ?? null;
        const hit = caret ? detectTrigger(caret.text, caret.offset, this._triggers) : null;
        if (!hit) {
            this._dismissed = null;
            if (this._hit) this.close();
            return;
        }
        if (this._dismissed?.start === hit.start && this._dismissed.char === hit.trigger.char) return;
        const previous = this._hit;
        const same = previous?.start === hit.start && previous.trigger === hit.trigger;
        if (same && previous.query === hit.query) {
            this._hit = hit;
            return;
        }
        this._hit = hit;
        if (!same) this._open();
        this._truncate(1);
        this._loadRoot(hit);
    };

    private _open(): void {
        const hit = this._hit!;
        this._truncate(0);
        const { commands } = hit.trigger;
        if (commands) {
            const scope = this._scope();
            this._commands = commandItems(collectCommands(this, scope), hit.trigger.char, scope, commands === true ? {} : commands);
        } else {
            this._commands = [];
        }
        window.addEventListener('resize', this._place);
        window.addEventListener('scroll', this._place, true);
    }

    // ── Lists ───────────────────────────────────────────────────────────

    private _root(): Level {
        if (!this._levels[0]) this._levels[0] = this._newLevel(null);
        return this._levels[0];
    }

    private _loadRoot(hit: TriggerHit): void {
        clearTimeout(this._debounce);
        this._root().abort?.abort();
        const { trigger, query } = hit;
        const local = matchRows(this._commands, query, trigger);
        if (typeof trigger.items !== 'function') {
            const items = matchRows(trigger.items ?? [], query, trigger);
            const ids = new Set(items.map((row) => row.item.id));
            const rows = [...items, ...local.filter((row) => !ids.has(row.item.id))];
            if (rows.length === 0) {
                this.close();
                this._hit = hit;
                return;
            }
            this._show(0, rows, null);
            return;
        }
        const source = trigger.items;
        const run = (): void => this._ask(0, () => source(query, this._askContext(trigger)), (rows) => [...rows, ...local]);
        const delay = query ? trigger.debounce ?? DEFAULT_DEBOUNCE_MS : 0;
        if (delay > 0) this._debounce = setTimeout(run, delay);
        else run();
        if (this._root().rows.length === 0) this._show(0, local, local.length ? null : 'loading');
    }

    private _askContext(trigger: AparteTrigger): { signal: AbortSignal; trigger: AparteTrigger } {
        return { signal: this._abortFor(this._levels.length - 1).signal, trigger };
    }

    private _abortFor(index: number): AbortController {
        const level = this._levels[index]!;
        level.abort?.abort();
        level.abort = new AbortController();
        return level.abort;
    }

    /** Ask a source; a reply that a newer question has overtaken is dropped. */
    private _ask(
        index: number,
        ask: () => readonly AparteTriggerItem[] | Promise<readonly AparteTriggerItem[]>,
        finish: (rows: TriggerRow[]) => TriggerRow[],
    ): void {
        const level = this._levels[index];
        if (!level) return;
        const fail = (error: unknown): void => {
            if (level.abort?.signal.aborted) return;
            console.warn('[aparte-triggers] a list failed to load.', error);
            level.reload = () => this._ask(index, ask, finish);
            this._show(index, [], 'error');
        };
        let pending: ReturnType<typeof ask>;
        try {
            level.abort?.abort();
            level.abort = new AbortController();
            pending = ask();
        } catch (error) {
            fail(error);
            return;
        }
        const signal = level.abort.signal;
        Promise.resolve(pending).then((items) => {
            if (signal.aborted || this._levels[index] !== level) return;
            const rows = finish(items.map((item) => ({ item, path: [] })));
            this._show(index, rows, rows.length ? null : 'empty');
        }, fail);
    }

    private _show(index: number, rows: TriggerRow[], status: Status): void {
        const level = this._levels[index];
        if (!level) return;
        const back = index > 0 && this._compact
            ? [{ item: { id: BACK_ID, label: resolveConfig(this).t('triggersBack') }, path: [] }]
            : [];
        level.rows = [...back, ...rows];
        level.status = status;
        level.active = level.rows.findIndex((row) => !row.item.disabled && row.item.id !== BACK_ID);
        if (level.active < 0) level.active = level.rows.length ? 0 : -1;
        this._paint(level, index);
        this._place();
        this._syncEditor();
    }

    // ── Drawing ─────────────────────────────────────────────────────────

    private _newLevel(owner: HTMLElement | null): Level {
        const panel = document.createElement('div');
        panel.className = 'aparte-menu';
        panel.setAttribute('role', 'listbox');
        panel.id = `${this._id}-${this._levels.length}`;
        panel.style.cssText = 'position:fixed;inset:auto;margin:0;overflow-y:auto;max-height:var(--aparte-triggers-max-height,320px)';
        // Not `pointerdown`: only cancelling `mousedown` keeps the focus in the field.
        panel.addEventListener('mousedown', (e) => e.preventDefault());
        panel.addEventListener('click', this._onClick);
        panel.addEventListener('pointermove', this._onPointerMove);
        this.appendChild(panel);
        this._raise(panel);
        return { panel, rows: [], active: -1, status: null, reload: null, owner, abort: null };
    }

    /** In the top layer where the browser has one: nothing around the chat can clip it then. */
    private _raise(panel: HTMLElement): void {
        try {
            panel.setAttribute('popover', 'manual');
            panel.showPopover?.();
        } catch {
            // Fixed, above the page: the next best thing.
        }
    }

    private _paint(level: Level, index: number): void {
        const { panel, status } = level;
        panel.textContent = '';
        panel.setAttribute('aria-busy', String(status === 'loading'));
        const t = resolveConfig(this);
        if (status) {
            const line = document.createElement('div');
            line.className = 'aparte-menu__status';
            line.setAttribute('role', 'status');
            line.textContent = t.t(status === 'loading' ? 'triggersLoading' : status === 'empty' ? 'triggersEmpty' : 'triggersError');
            panel.appendChild(line);
            if (status === 'error') {
                level.rows = [{ item: { id: '__aparte-retry', label: t.t('triggersRetry') }, path: [] }];
                level.active = 0;
            }
        }
        const searching = !!this._hit?.query;
        const groups = searching ? [{ group: undefined, rows: level.rows }] : groupRows(level.rows);
        level.rows = groups.flatMap((group) => group.rows);
        let at = 0;
        for (const group of groups) {
            const parent = group.group ? this._groupElement(panel, group.group) : panel;
            for (const row of group.rows) parent.appendChild(this._rowElement(row, index, at++, level));
        }
    }

    private _groupElement(panel: HTMLElement, name: string): HTMLElement {
        const group = document.createElement('div');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', name);
        const label = document.createElement('div');
        label.className = 'aparte-menu__label';
        label.setAttribute('role', 'presentation');
        label.textContent = name;
        group.appendChild(label);
        panel.appendChild(group);
        return group;
    }

    private _rowElement(row: TriggerRow, levelIndex: number, rowIndex: number, level: Level): HTMLElement {
        const { item, path } = row;
        const el = document.createElement('div');
        el.className = 'aparte-menu__item';
        el.id = `${this._id}-${levelIndex}-${rowIndex}`;
        el.dataset['level'] = String(levelIndex);
        el.dataset['row'] = String(rowIndex);
        el.setAttribute('role', 'option');
        el.setAttribute('aria-selected', String(rowIndex === level.active));
        if (item.disabled) el.setAttribute('aria-disabled', 'true');
        if (item.children) {
            el.setAttribute('aria-haspopup', 'listbox');
            el.setAttribute('aria-expanded', 'false');
        }
        const custom = item.render?.(item);
        if (custom instanceof HTMLElement) el.appendChild(custom);
        else if (typeof custom === 'string') el.innerHTML = custom; // safe-text: the consumer's own render hook, documented as HTML
        else this._fillRow(el, item, path, level.rows.some((other) => other.item.icon));
        if (item.children) {
            const chevron = document.createElement('span');
            chevron.className = 'aparte-menu__chevron';
            chevron.innerHTML = resolveConfig(this).getIcon('nextBranch') ?? '›'; // safe-text: core's own glyph
            el.appendChild(chevron);
        }
        return el;
    }

    /** `gutter`: another row has an icon, so this one keeps the room for it and the labels line up. */
    private _fillRow(el: HTMLElement, item: AparteTriggerItem, path: readonly string[], gutter: boolean): void {
        if (item.icon instanceof HTMLElement) {
            el.appendChild(item.icon);
        } else if (item.icon || gutter) {
            const icon = document.createElement('span');
            icon.style.cssText = 'display:inline-flex;justify-content:center;flex-shrink:0;width:var(--aparte-icon-size,1em)';
            const svg = item.icon ? resolveConfig(this).getIcon(item.icon) : undefined;
            if (svg) icon.innerHTML = svg; // safe-text: a glyph of core's icon set, found by name
            else icon.textContent = item.icon ?? '';
            el.appendChild(icon);
        }
        const body = document.createElement('span');
        body.className = 'aparte-menu__body';
        body.append(item.label);
        // Flattened by a search: `A › Open` and `B › Open` must not read the same.
        const detail = path.length ? path.join(' › ') : item.description;
        if (detail) {
            const line = document.createElement('span');
            line.className = 'aparte-menu__description';
            line.textContent = detail;
            body.appendChild(line);
        }
        el.appendChild(body);
    }

    private readonly _place = (): void => {
        const hit = this._hit;
        const input = this._input;
        const composer = this._composer;
        if (!hit || !input || !composer || this._levels.length === 0) return;
        const rtl = this._rtl;
        const compact = this._compact;
        const box = composer.getBoundingClientRect();
        this._levels.forEach((level, index) => {
            const { panel } = level;
            panel.hidden = compact && index < this._levels.length - 1;
            if (compact) {
                panel.style.width = `${box.width}px`;
                panel.style.maxWidth = 'none';
                placeFloating(box, panel, { side: 'above', gap: 8, rtl });
            } else if (index === 0) {
                const anchor = input.getRangeRect(hit.start, hit.start + hit.trigger.char.length) ?? box;
                placeFloating(anchor, panel, { side: 'above', gap: 8, rtl });
            } else if (level.owner) {
                placeFloating(level.owner.getBoundingClientRect(), panel, { side: 'beside', gap: 4, rtl });
            }
        });
    };

    /** The field says what is open and which row the keyboard is on: the focus never leaves it. */
    private _syncEditor(): void {
        const editor = this._editor;
        if (!editor) return;
        const level = this._levels[this._levels.length - 1];
        if (!level) {
            if (editor.getAttribute('role') === 'combobox') {
                editor.setAttribute('role', this._editorRole ?? 'textbox');
                for (const name of ['aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete']) editor.removeAttribute(name);
            }
            return;
        }
        if (editor.getAttribute('role') !== 'combobox') this._editorRole = editor.getAttribute('role');
        editor.setAttribute('role', 'combobox');
        editor.setAttribute('aria-expanded', 'true');
        editor.setAttribute('aria-autocomplete', 'list');
        editor.setAttribute('aria-controls', level.panel.id);
        const active = level.panel.querySelector(`[aria-selected="true"]`);
        if (active) editor.setAttribute('aria-activedescendant', active.id);
        else editor.removeAttribute('aria-activedescendant');
    }

    // ── Moving ──────────────────────────────────────────────────────────

    private _setActive(levelIndex: number, rowIndex: number, reveal: boolean): void {
        const level = this._levels[levelIndex];
        if (!level || level.active === rowIndex) return;
        level.panel.querySelector('[aria-selected="true"]')?.setAttribute('aria-selected', 'false');
        level.active = rowIndex;
        const row = level.panel.querySelector(`[data-row="${rowIndex}"]`);
        row?.setAttribute('aria-selected', 'true');
        if (reveal) row?.scrollIntoView?.({ block: 'nearest' });
        this._syncEditor();
    }

    private _move(step: number): void {
        const index = this._levels.length - 1;
        const level = this._levels[index]!;
        const count = level.rows.length;
        if (count === 0) return;
        let next = level.active;
        for (let i = 0; i < count; i++) {
            next = (next + step + count) % count;
            if (!level.rows[next]!.item.disabled) break;
        }
        this._setActive(index, next, true);
    }

    private _truncate(keep: number): void {
        for (const level of this._levels.splice(keep)) {
            level.abort?.abort();
            level.owner?.setAttribute('aria-expanded', 'false');
            level.panel.remove();
        }
    }

    private _openChild(levelIndex: number, row: TriggerRow, el: HTMLElement): void {
        this._truncate(levelIndex + 1);
        const { children } = row.item;
        if (!children) return;
        el.setAttribute('aria-expanded', 'true');
        const level = this._newLevel(el);
        this._levels.push(level);
        const index = this._levels.length - 1;
        const path = [...row.path, row.item.label];
        const toRows = (items: readonly AparteTriggerItem[]): TriggerRow[] => items.map((item) => ({ item, path: path.slice(path.length) }));
        if (typeof children !== 'function') {
            this._show(index, toRows(children), null);
            return;
        }
        const trigger = this._hit!.trigger;
        this._show(index, [], 'loading');
        this._ask(index, () => (children as AparteTriggerSource)('', this._askContext(trigger)), (rows) => rows);
    }

    private _back(): boolean {
        if (this._levels.length < 2) return false;
        this._truncate(this._levels.length - 1);
        this._place();
        this._syncEditor();
        return true;
    }

    // ── Input ───────────────────────────────────────────────────────────

    private readonly _onKeydown = (e: KeyboardEvent): void => {
        if (e.isComposing || e.keyCode === 229 || this._levels.length === 0) return;
        const index = this._levels.length - 1;
        const level = this._levels[index]!;
        const active = level.rows[level.active];
        const rtl = this._rtl;
        const into = rtl ? 'ArrowLeft' : 'ArrowRight';
        const out = rtl ? 'ArrowRight' : 'ArrowLeft';
        switch (e.key) {
            case 'ArrowDown': this._move(1); break;
            case 'ArrowUp': this._move(-1); break;
            case 'Enter':
            case 'Tab':
                if (e.shiftKey || !active) return;
                this._choose(index, level.active);
                break;
            case 'Escape':
                this._dismissed = { start: this._hit!.start, char: this._hit!.trigger.char };
                this.close();
                break;
            case into: {
                if (!active?.item.children) return;
                const el = level.panel.querySelector<HTMLElement>(`[data-row="${level.active}"]`);
                if (el) this._openChild(index, active, el);
                break;
            }
            case out:
                if (!this._back()) return;
                break;
            case 'Backspace':
                if (this._hit?.query || !this._back()) return;
                break;
            default:
                return;
        }
        e.preventDefault();
        e.stopPropagation();
    };

    private _rowOf(target: EventTarget | null): { levelIndex: number; rowIndex: number; el: HTMLElement } | null {
        const el = (target as Element | null)?.closest?.<HTMLElement>('[role="option"]');
        if (!el) return null;
        return { levelIndex: Number(el.dataset['level']), rowIndex: Number(el.dataset['row']), el };
    }

    private readonly _onClick = (e: MouseEvent): void => {
        const found = this._rowOf(e.target);
        if (found) this._choose(found.levelIndex, found.rowIndex);
    };

    /** `pointermove`, not `pointerover`: a panel opening under a still pointer must not take the row. */
    private readonly _onPointerMove = (e: PointerEvent): void => {
        const found = this._rowOf(e.target);
        if (!found || this._compact) return;
        const { levelIndex, rowIndex, el } = found;
        const level = this._levels[levelIndex];
        if (!level || this._hoverRow === el) return;
        this._hoverRow = el;
        this._setActive(levelIndex, rowIndex, false);
        clearTimeout(this._hover);
        const row = level.rows[rowIndex];
        this._hover = setTimeout(() => {
            if (!this._levels[levelIndex] || level.active !== rowIndex) return;
            if (row?.item.children && !row.item.disabled) this._openChild(levelIndex, row, el);
            else {
                this._truncate(levelIndex + 1);
                this._syncEditor();
            }
        }, HOVER_OPEN_MS);
    };

    private _choose(levelIndex: number, rowIndex: number): void {
        const level = this._levels[levelIndex];
        const row = level?.rows[rowIndex];
        const hit = this._hit;
        const input = this._input;
        if (!level || !row || !hit || !input || row.item.disabled) return;
        const { item } = row;
        if (item.id === BACK_ID) {
            this._back();
            return;
        }
        if (level.status === 'error') {
            level.status = 'loading';
            this._show(levelIndex, [], 'loading');
            level.reload?.();
            return;
        }
        if (item.children) {
            const el = level.panel.querySelector<HTMLElement>(`[data-row="${rowIndex}"]`);
            if (el) this._openChild(levelIndex, row, el);
            return;
        }
        const proceed = this.dispatchEvent(new CustomEvent<AparteTriggerSelectEventDetail>('aparte-trigger-select', {
            bubbles: true, composed: true, cancelable: true, detail: { trigger: hit.trigger, item, query: hit.query },
        }));
        this.close();
        if (!proceed) return;
        const end = input.getCaret()?.offset ?? hit.end;
        this._apply(item, hit, input, end);
    }

    private _apply(item: AparteTriggerItem, hit: TriggerHit, input: AparteComposerInput, end: number): void {
        const token: AparteComposerToken = {
            label: item.label,
            text: `${hit.trigger.char}${item.label}`,
            ...(hit.trigger.kind ? { kind: hit.trigger.kind } : {}),
            ...(item.data !== undefined ? { data: item.data } : {}),
        };
        if (typeof item.insert === 'string') input.replaceRange(hit.start, end, item.insert);
        else if (item.insert) input.insertToken(hit.start, end, item.insert);
        else if (item.run) input.replaceRange(hit.start, end, '');
        else input.insertToken(hit.start, end, token);
        if (!item.run) return;
        const context: AparteTriggerContext = {
            ...this._scope(),
            item,
            query: hit.query,
            input,
            notify: (text) => this._notify(text),
        };
        Promise.resolve().then(() => item.run!(context)).catch((error: unknown) => {
            console.error(`[aparte-triggers] "${item.id}" failed.`, error);
        });
    }

    private _notify(text: string): void {
        if (!this._composer) return;
        const panel = document.createElement('div');
        panel.className = 'aparte-menu';
        panel.setAttribute('role', 'status');
        panel.style.cssText = 'position:fixed;inset:auto;margin:0';
        const line = document.createElement('div');
        line.className = 'aparte-menu__status';
        line.textContent = text;
        panel.appendChild(line);
        this.appendChild(panel);
        this._raise(panel);
        placeFloating(this._composer.getBoundingClientRect(), panel, { side: 'above', gap: 8, rtl: this._rtl });
        setTimeout(() => panel.remove(), NOTICE_MS);
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-triggers')) {
    customElements.define('aparte-triggers', AparteTriggers);
}
