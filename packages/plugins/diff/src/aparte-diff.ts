/**
 * `<aparte-diff>` — a change, as a reviewer reads it.
 *
 * Light DOM, like core: it writes its files as children, and a consumer's stylesheet reaches
 * every part. The data is the app's (`diff`, `comments`); what the element keeps is only what
 * the reader did to it — a file folded, a run of unchanged lines shown, a selection, a comment
 * being written — and the lines' colours once the highlighter gave them.
 */
import { resolveConfig, subscribeConfigChange, type AparteConfig } from '@aparte/core';
import { diffTexts, splitLines } from './compute.js';
import { highlightLines, languageOfPath } from './highlight.js';
import { parseUnifiedDiff } from './parse.js';
import { ensureStyles } from './styles.js';
import type {
    AparteDiffComment,
    AparteDiffCommentEventDetail,
    AparteDiffFile,
    AparteDiffInput,
    AparteDiffLine,
    AparteDiffSide,
    AparteDiffSource,
} from './types.js';
import { word, type WordKey } from './words.js';

/** Importable where there is no DOM: the class then extends nothing and is never defined. */
const ElementBase = (typeof HTMLElement === 'undefined' ? class {} : HTMLElement) as typeof HTMLElement;

/** A run of unchanged lines between two hunks (or before the first, after the last). */
interface Gap {
    index: number;
    /** The old lines it holds, `from` to `to`. */
    from: number;
    to: number;
    /** What to add to an old line's number to get its new one. */
    delta: number;
    section?: string;
}

/** A file as the element shows it. */
interface Shown {
    file: AparteDiffFile;
    /** Every line of each side, when the texts were given: what a fold shows. */
    oldLines: string[] | null;
    newLines: string[] | null;
    oldEndsWithNewline: boolean;
    collapsed: boolean;
    expanded: Set<number>;
    /** Each side's lines as the highlighter coloured them, by line number, and the classes its block wore. */
    html: { old: Map<number, string>; new: Map<number, string>; className: string } | null;
    /** The line whose number takes the file's one tab stop. */
    roving: string | null;
}

type Row = { type: 'line'; line: AparteDiffLine } | { type: 'gap'; gap: Gap };

/** The selection: in which file, from which line to which (row keys). */
interface Selection {
    file: number;
    anchor: string;
    focus: string;
}

/** The comment field: one per element, moved under the selection. */
interface CommentForm {
    node: HTMLFormElement;
    input: HTMLTextAreaElement;
    label: HTMLLabelElement;
    submit: HTMLButtonElement;
    cancel: HTMLButtonElement;
}

/** A file's tag beside its path, by what happened to it: its word and its badge's intent. */
const STATUS_BADGES: Partial<Record<string, [WordKey, string]>> = {
    added: ['diffStatusAdded', 'success'],
    deleted: ['diffStatusDeleted', 'danger'],
    renamed: ['diffStatusRenamed', 'info'],
};

let instances = 0;

function isSource(value: unknown): value is AparteDiffSource {
    return typeof value === 'object' && value !== null
        && typeof (value as AparteDiffSource).before === 'string' && typeof (value as AparteDiffSource).after === 'string';
}

function isFile(value: unknown): value is AparteDiffFile {
    return typeof value === 'object' && value !== null && Array.isArray((value as AparteDiffFile).hunks);
}

/** What the app gave, as files to show. */
function filesOf(input: AparteDiffInput | null): Shown[] {
    const shown = (file: AparteDiffFile, source?: AparteDiffSource): Shown => {
        const old = source ? splitLines(source.before) : null;
        const lines = file.hunks.flatMap((h) => h.lines);
        return {
            file: {
                ...file,
                added: typeof file.added === 'number' ? file.added : lines.filter((l) => l.kind === 'add').length,
                removed: typeof file.removed === 'number' ? file.removed : lines.filter((l) => l.kind === 'del').length,
            },
            oldLines: old ? old.lines : null,
            newLines: source ? splitLines(source.after).lines : null,
            oldEndsWithNewline: old ? old.endsWithNewline : true,
            collapsed: false,
            expanded: new Set(),
            html: null,
            roving: null,
        };
    };
    const one = (item: AparteDiffFile | AparteDiffSource): Shown[] => {
        if (isSource(item)) return [shown(diffTexts(item.before, item.after, { path: item.path, oldPath: item.oldPath }), item)];
        if (isFile(item)) return [shown(item)];
        return [];
    };
    if (input === null || input === undefined) return [];
    if (typeof input === 'string') return parseUnifiedDiff(input).map((file) => shown(file));
    if (Array.isArray(input)) return (input as ReadonlyArray<AparteDiffFile | AparteDiffSource>).flatMap(one);
    return one(input as AparteDiffSource);
}

const firstOld = (h: { oldStart: number; oldCount: number }) => (h.oldCount > 0 ? h.oldStart : h.oldStart + 1);
const firstNew = (h: { newStart: number; newCount: number }) => (h.newCount > 0 ? h.newStart : h.newStart + 1);

/** A row's key: a removed line by its old number, any other by its new one. */
function keyOf(line: AparteDiffLine): string {
    return line.kind === 'del' ? `o${line.oldLine}` : `n${line.newLine}`;
}

/** The side a selection counts on: the old file's for a removed line, the new file's for the rest. */
function sideOf(line: AparteDiffLine): AparteDiffSide {
    return line.kind === 'del' ? 'old' : 'new';
}

function numberOn(line: AparteDiffLine, side: AparteDiffSide): number | undefined {
    return side === 'old' ? line.oldLine : line.newLine;
}

/** The rows of a file: its hunks' lines, and the runs between them, folded or shown. */
function rowsOf(shown: Shown): Row[] {
    const { file, oldLines } = shown;
    const rows: Row[] = [];
    const push = (gap: Gap) => {
        const count = gap.to - gap.from + 1;
        if (count <= 0 && !gap.section) return;
        if (oldLines && count > 0 && shown.expanded.has(gap.index)) {
            for (let k = gap.from; k <= gap.to; k++) {
                const line: AparteDiffLine = { kind: 'context', text: oldLines[k - 1] ?? '', oldLine: k, newLine: k + gap.delta };
                if (k === oldLines.length && !shown.oldEndsWithNewline) line.noNewline = true;
                rows.push({ type: 'line', line });
            }
            return;
        }
        rows.push({ type: 'gap', gap });
    };
    let nextOld = 1;
    let nextNew = 1;
    file.hunks.forEach((hunk, index) => {
        push({ index, from: nextOld, to: firstOld(hunk) - 1, delta: firstNew(hunk) - firstOld(hunk), section: hunk.section });
        for (const line of hunk.lines) rows.push({ type: 'line', line });
        nextOld = firstOld(hunk) + hunk.oldCount;
        nextNew = firstNew(hunk) + hunk.newCount;
    });
    // After the last hunk: only when the whole text is known, since nothing else says how long it is.
    if (oldLines && file.hunks.length) push({ index: file.hunks.length, from: nextOld, to: oldLines.length, delta: nextNew - nextOld });
    return rows;
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * A change, as a reviewer reads it: each file under a header with its path and its counts
 * (`+3 −1`), each line with its old and new numbers and a `+` or `−` (said as a word to a
 * screen reader), the unchanged runs between hunks folded behind "Show 24 unchanged lines".
 * Set `diff` to a unified diff's text, to a file's two texts (`{ path, before, after }`: every
 * unchanged line can then be shown), or to a list of files.
 *
 * With `commentable`, a reader comments on a line or a range: a click on a line number (Shift+click
 * to stretch it), or from the keyboard — the numbers of a file are one tab stop, the arrows move,
 * Shift+arrows stretch, Enter or Space open the field, Escape lets go. Sending it fires
 * `aparte-diff-comment`; keeping the comments and sending them on is the app's, and the ones it
 * hands back through `comments` are shown under their lines with where each stands.
 *
 * The lines are coloured by the chat's highlighter when one is installed (`@aparte/plugin-shiki`),
 * in the language the path's extension names. The code reads left to right in a right-to-left page.
 *
 * @element aparte-diff
 *
 * @attr {boolean} commentable - Let the reader pick a line or a range and write a comment on it. Off by default: without it nothing is clickable.
 *
 * @fires {CustomEvent<AparteDiffCommentEventDetail>} aparte-diff-comment - A comment was written and sent: `{ path, side, startLine, endLine, text, code }`. Bubbles out of the chat; cancel it to keep the field open with its text.
 *
 * @cssprop [--aparte-diff-added-bg=var(--aparte-success-surface)] - The background of an added line.
 * @cssprop [--aparte-diff-removed-bg=var(--aparte-error-surface)] - The background of a removed line.
 * @cssprop [--aparte-diff-added-ink=var(--aparte-success-ink)] - The `+` of an added line, and the count of added lines.
 * @cssprop [--aparte-diff-removed-ink=var(--aparte-error-ink)] - The `−` of a removed line, and the count of removed lines.
 * @cssprop [--aparte-diff-selected-bg=var(--aparte-surface-hover)] - The background of the lines picked for a comment.
 *
 * @example A file's two texts, open to comments
 * ```html
 * <aparte-diff commentable></aparte-diff>
 * <script type="module">
 *   import '@aparte/plugin-diff';
 *
 *   const diff = document.querySelector('aparte-diff');
 *   diff.diff = { path: 'src/parse.ts', before: oldText, after: newText };
 *   const comments = [];
 *   diff.addEventListener('aparte-diff-comment', (event) => {
 *     comments.push({ ...event.detail, state: 'pending' });
 *     diff.comments = comments;
 *   });
 * </script>
 * ```
 */
export class AparteDiff extends ElementBase {
    static get observedAttributes(): string[] { return ['commentable']; }

    private _input: AparteDiffInput | null = null;
    private _shown: Shown[] = [];
    /** Each file's element, as last drawn. */
    private _files: HTMLElement[] = [];
    private _comments: AparteDiffComment[] = [];
    private readonly _id = `aparte-diff-${++instances}`;
    private _generation = 0;
    private _highlighted = false;
    private _stopConfig: (() => void) | null = null;
    private _selection: Selection | null = null;
    private _form: CommentForm | null = null;
    /** Whether the reader opened the field (it then follows the selection through a redraw). */
    private _writing = false;
    /** Each line row's line. */
    private readonly _lineOf = new WeakMap<Element, AparteDiffLine>();

    // ── What the app sets ──────────────────────────────────────────────────

    /** The change to show: a unified diff's text, `{ path, before, after }`, or a list of files (`AparteDiffFile` or texts). */
    get diff(): AparteDiffInput | null { return this._input; }
    set diff(value: AparteDiffInput | null) {
        this._input = value ?? null;
        this._shown = filesOf(this._input);
        this._generation++;
        this._highlighted = false;
        this._selection = null;
        this._writing = false;
        this._form?.node.remove();
        if (this.isConnected) {
            this._render();
            void this._highlight();
        }
    }

    /** The comments to show under their lines, with their state. The element only shows them. */
    get comments(): AparteDiffComment[] { return this._comments; }
    set comments(value: AparteDiffComment[]) {
        this._comments = Array.isArray(value) ? [...value] : [];
        if (this.isConnected) this._render();
    }

    /** Whether a reader can comment on a line. Reflects the `commentable` attribute. */
    get commentable(): boolean { return this.hasAttribute('commentable'); }
    set commentable(value: boolean) { this.toggleAttribute('commentable', Boolean(value)); }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    connectedCallback(): void {
        ensureStyles(this.ownerDocument);
        this.addEventListener('click', this._onClick);
        this.addEventListener('keydown', this._onKeydown);
        this.addEventListener('keyup', this._onKeyup);
        this._stopConfig?.();
        this._stopConfig = subscribeConfigChange(this, () => this._onConfigChange());
        this._render();
        void this._highlight();
    }

    disconnectedCallback(): void {
        this.removeEventListener('click', this._onClick);
        this.removeEventListener('keydown', this._onKeydown);
        this.removeEventListener('keyup', this._onKeyup);
        this._stopConfig?.();
        this._stopConfig = null;
    }

    attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
        if (name !== 'commentable' || (previous === null) === (value === null)) return;
        if (value === null) {
            this._selection = null;
            this._writing = false;
            this._form?.node.remove();
        }
        if (this.isConnected) this._render();
    }

    // ── Drawing ────────────────────────────────────────────────────────────

    private get _config(): AparteConfig {
        return resolveConfig(this);
    }

    private _word(key: WordKey, vars?: Record<string, string | number>): string {
        return word(this._config, key, vars);
    }

    private _onConfigChange(): void {
        this._render();
        // A highlighter installed after the lines were drawn colours them now.
        if (!this._highlighted) void this._highlight();
    }

    /** Draw every file again from the state, the reader's selection, field and focus kept. */
    private _render(): void {
        const doc = this.ownerDocument;
        const active = doc.activeElement;
        const focus = active && this.contains(active) ? this._focusKey(active) : null;
        // Nothing given yet draws nothing; a change with no file in it says so.
        this._files = this._shown.map((_, i) => this._renderFile(i));
        if (this._input === null) {
            this.replaceChildren();
            return;
        }
        if (!this._shown.length) {
            this.replaceChildren(this._message('aparte-diff-empty', 'diffEmpty'));
            return;
        }
        this.replaceChildren(...this._files);
        this._paintSelection();
        if (this._writing) this._placeForm(false);
        if (focus) this._restoreFocus(focus);
    }

    private _renderFile(index: number): HTMLElement {
        const doc = this.ownerDocument;
        const shown = this._shown[index]!;
        const { file } = shown;
        const status = file.status ?? (file.oldPath && file.oldPath !== file.path ? 'renamed' : 'modified');
        const root = el(doc, 'div', 'aparte-diff-file');
        root.dataset['path'] = file.path;
        root.dataset['file'] = String(index);

        const head = el(doc, 'div', 'aparte-diff-file__head');
        const toggle = el(doc, 'button', 'aparte-btn aparte-btn--ghost aparte-btn--sm aparte-diff-file__toggle');
        toggle.type = 'button';
        toggle.setAttribute('aria-expanded', String(!shown.collapsed));
        toggle.setAttribute('aria-controls', `${this._id}-f${index}`);
        const chevron = el(doc, 'span', 'aparte-diff-file__chevron');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = this._config.getIcon('expand'); // safe-text: the icon provider's own markup
        const path = el(doc, 'span', 'aparte-diff-file__path', status === 'renamed' && file.oldPath ? `${file.oldPath} → ${file.path}` : file.path);
        toggle.append(chevron, path);
        head.append(toggle);
        const badge = STATUS_BADGES[status];
        if (badge) head.append(el(doc, 'span', `aparte-badge aparte-badge--sm aparte-badge--${badge[1]} aparte-diff-file__status`, this._word(badge[0])));
        if (!file.binary) {
            const stat = el(doc, 'span', 'aparte-diff-file__stat');
            const added = el(doc, 'span', 'aparte-diff-file__added', `+${file.added}`);
            const removed = el(doc, 'span', 'aparte-diff-file__removed', `−${file.removed}`);
            added.setAttribute('aria-hidden', 'true');
            removed.setAttribute('aria-hidden', 'true');
            const said = el(doc, 'span', 'aparte-sr-only', `${this._word('diffAdded', { n: file.added })}, ${this._word('diffRemoved', { n: file.removed })}`);
            stat.append(added, removed, said);
            head.append(stat);
        }

        const lines = el(doc, 'div', 'aparte-diff-file__lines');
        lines.id = `${this._id}-f${index}`;
        lines.setAttribute('dir', 'ltr');
        lines.hidden = shown.collapsed;
        if (file.binary) lines.append(this._message('aparte-diff-binary', 'diffBinary'));
        else if (!file.hunks.length) {
            if (status !== 'renamed') lines.append(this._message('aparte-diff-empty', 'diffEmpty'));
        } else this._fillLines(lines, index);
        root.append(head, lines);
        return root;
    }

    private _message(className: string, key: WordKey): HTMLElement {
        const p = el(this.ownerDocument, 'p', className, this._word(key));
        p.setAttribute('dir', 'auto');
        return p;
    }

    /** The rows of file `index`, its comments under their lines. */
    private _fillLines(lines: HTMLElement, index: number): void {
        const shown = this._shown[index]!;
        const commentable = this.commentable;
        const rows = rowsOf(shown);
        const lineRows: HTMLElement[] = [];
        for (const row of rows) {
            if (row.type === 'gap') {
                lines.append(this._gapRow(row.gap, index, Boolean(shown.oldLines)));
                continue;
            }
            const node = this._lineRow(row.line, index, commentable);
            lineRows.push(node);
            lines.append(node);
            if (row.line.noNewline) {
                const eof = el(this.ownerDocument, 'div', 'aparte-diff-eof', this._word('diffNoNewline'));
                eof.setAttribute('dir', 'auto');
                lines.append(eof);
            }
        }
        if (commentable && lineRows.length) {
            const roving = lineRows.find((r) => r.dataset['key'] === shown.roving) ?? lineRows[0]!;
            shown.roving = roving.dataset['key']!;
            (roving.querySelector('.aparte-diff-line__gutter') as HTMLElement).tabIndex = 0;
        }
        this._placeComments(lines, shown, lineRows);
    }

    private _gapRow(gap: Gap, file: number, expandable: boolean): HTMLElement {
        const doc = this.ownerDocument;
        const row = el(doc, 'div', 'aparte-diff-fold');
        row.setAttribute('dir', 'auto');
        const count = gap.to - gap.from + 1;
        if (count > 0) {
            if (expandable) {
                const show = el(doc, 'button', 'aparte-btn aparte-btn--ghost aparte-btn--sm aparte-diff-fold__show', this._word('diffShowUnchanged', { n: count }));
                show.type = 'button';
                show.dataset['file'] = String(file);
                show.dataset['gap'] = String(gap.index);
                row.append(show);
            } else row.append(el(doc, 'span', 'aparte-diff-fold__count', this._word('diffUnchanged', { n: count })));
        }
        if (gap.section) row.append(el(doc, 'span', 'aparte-diff-fold__section', gap.section));
        return row;
    }

    private _lineRow(line: AparteDiffLine, file: number, commentable: boolean): HTMLElement {
        const doc = this.ownerDocument;
        const shown = this._shown[file]!;
        const row = el(doc, 'div', 'aparte-diff-line');
        row.dataset['kind'] = line.kind;
        row.dataset['key'] = keyOf(line);
        this._lineOf.set(row, line);
        const gutter = commentable ? el(doc, 'button', 'aparte-diff-line__gutter') : el(doc, 'span', 'aparte-diff-line__gutter');
        gutter.append(
            this._number('old', line.oldLine),
            this._number('new', line.newLine),
        );
        const code = el(doc, 'code', 'aparte-diff-line__code');
        if (commentable) {
            const button = gutter as HTMLButtonElement;
            button.type = 'button';
            button.tabIndex = -1;
            const n = numberOn(line, sideOf(line))!;
            button.setAttribute('aria-label', this._word(line.kind === 'add' ? 'diffLineAdded' : line.kind === 'del' ? 'diffLineRemoved' : 'diffLine', { n }));
            button.setAttribute('aria-pressed', 'false');
            code.id = `${this._id}-${file}-${keyOf(line)}`;
            button.setAttribute('aria-describedby', code.id);
        }
        const marker = el(doc, 'span', 'aparte-diff-line__marker', line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' ');
        marker.setAttribute('aria-hidden', 'true');
        row.append(gutter, marker);
        if (line.kind !== 'context') row.append(el(doc, 'span', 'aparte-sr-only', this._word(line.kind === 'add' ? 'diffMarkerAdded' : 'diffMarkerRemoved')));
        if (!this._colour(code, shown, line)) code.textContent = line.text;
        row.append(code);
        return row;
    }

    /** Put the highlighter's colours in a line's code, with its block's classes; `false` when it has none for it. */
    private _colour(code: Element, shown: Shown, line: AparteDiffLine): boolean {
        const html = this._htmlOf(shown, line);
        if (html === undefined) return false;
        code.innerHTML = html; // safe-text: the highlighter's output, through the config's sanitizer
        code.className = shown.html!.className ? `aparte-diff-line__code ${shown.html!.className}` : 'aparte-diff-line__code';
        return true;
    }

    private _number(side: AparteDiffSide, value: number | undefined): HTMLElement {
        const num = el(this.ownerDocument, 'span', 'aparte-diff-line__num', value === undefined ? '' : String(value));
        num.dataset['side'] = side;
        return num;
    }

    private _htmlOf(shown: Shown, line: AparteDiffLine): string | undefined {
        if (!shown.html) return undefined;
        if (line.kind === 'del') return shown.html.old.get(line.oldLine!);
        if (line.kind === 'add') return shown.html.new.get(line.newLine!);
        return shown.html.new.get(line.newLine!) ?? shown.html.old.get(line.oldLine!);
    }

    /** The comments the app handed back, each under the line it ends on, or at the end of its file when that line is folded. */
    private _placeComments(lines: HTMLElement, shown: Shown, rows: HTMLElement[]): void {
        const { file } = shown;
        const after = new Map<HTMLElement, Element>();
        for (const comment of this._comments) {
            const ours = comment.path === file.path || (comment.side === 'old' && comment.path === file.oldPath);
            if (!ours) continue;
            const row = rows.find((r) => {
                const line = this._lineOf.get(r)!;
                if (comment.side === 'old' ? line.kind === 'add' : line.kind === 'del') return false;
                return numberOn(line, comment.side) === comment.endLine;
            });
            const node = this._commentNode(comment);
            if (!row) {
                lines.append(node);
                continue;
            }
            (after.get(row) ?? row).after(node);
            after.set(row, node);
        }
    }

    private _commentNode(comment: AparteDiffComment): HTMLElement {
        const doc = this.ownerDocument;
        const node = el(doc, 'div', 'aparte-diff-comment');
        node.setAttribute('dir', 'auto');
        if (comment.state) node.dataset['state'] = comment.state;
        const head = el(doc, 'div', 'aparte-diff-comment__head');
        head.append(el(doc, 'span', 'aparte-diff-comment__lines', this._rangeWords(comment.side, comment.startLine, comment.endLine)));
        if (comment.state === 'pending' || comment.state === 'sent') {
            const pending = comment.state === 'pending';
            head.append(el(doc, 'span', `aparte-badge aparte-badge--sm aparte-badge--${pending ? 'warning' : 'success'} aparte-diff-comment__state`, this._word(pending ? 'diffCommentPending' : 'diffCommentSent')));
        }
        node.append(head, el(doc, 'p', 'aparte-diff-comment__text', comment.text));
        return node;
    }

    /** "Line 12", "Lines 12–14", "Removed line 5". */
    private _rangeWords(side: AparteDiffSide, start: number, end: number): string {
        if (start === end) return this._word(side === 'old' ? 'diffLineRemoved' : 'diffLine', { n: start });
        return this._word(side === 'old' ? 'diffLinesRemoved' : 'diffLines', { start, end });
    }

    // ── Colours ────────────────────────────────────────────────────────────

    /** Colour every file not coloured yet, each side once, and put the colours in the lines on screen. */
    private async _highlight(): Promise<void> {
        const config = this._config;
        if (!config.hasHighlightProvider()) return;
        this._highlighted = true;
        const generation = this._generation;
        await Promise.all(this._shown.map(async (shown, index) => {
            if (shown.html) return;
            const language = languageOfPath(shown.file.path);
            const side = (which: AparteDiffSide): { lines: string[]; numbers: number[] } => {
                const full = which === 'old' ? shown.oldLines : shown.newLines;
                if (full) return { lines: full, numbers: full.map((_, i) => i + 1) };
                const own = shown.file.hunks.flatMap((h) => h.lines).filter((l) => l.kind === 'context' || l.kind === (which === 'old' ? 'del' : 'add'));
                return { lines: own.map((l) => l.text), numbers: own.map((l) => numberOn(l, which)!) };
            };
            const old = side('old');
            const next = side('new');
            const [oldHtml, newHtml] = await Promise.all([highlightLines(config, old.lines, language), highlightLines(config, next.lines, language)]);
            if (generation !== this._generation || (!oldHtml && !newHtml)) return;
            shown.html = {
                old: new Map((oldHtml?.lines ?? []).map((html, i) => [old.numbers[i]!, html])),
                new: new Map((newHtml?.lines ?? []).map((html, i) => [next.numbers[i]!, html])),
                className: newHtml?.className ?? oldHtml?.className ?? '',
            };
            this._paintColours(index);
        }));
    }

    private _paintColours(index: number): void {
        const shown = this._shown[index]!;
        const lines = this._linesOf(index);
        if (!lines) return;
        for (const row of lines.querySelectorAll('.aparte-diff-line')) {
            const line = this._lineOf.get(row);
            if (line) this._colour(row.querySelector('.aparte-diff-line__code')!, shown, line);
        }
    }

    private _linesOf(index: number): HTMLElement | null {
        return this._files[index]?.querySelector<HTMLElement>(':scope > .aparte-diff-file__lines') ?? null;
    }

    /** The line row of file `index` with the key `key`, if it is drawn. */
    private _rowOf(index: number, key: string): HTMLElement | undefined {
        const lines = this._linesOf(index);
        return lines ? [...lines.querySelectorAll<HTMLElement>(':scope > .aparte-diff-line')].find((row) => row.dataset['key'] === key) : undefined;
    }

    // ── What the reader does ───────────────────────────────────────────────

    private readonly _onClick = (event: MouseEvent): void => {
        const target = event.target as Element | null;
        if (!target || !this.contains(target)) return;
        const toggle = target.closest('.aparte-diff-file__toggle');
        if (toggle) {
            const index = Number(toggle.closest<HTMLElement>('.aparte-diff-file')!.dataset['file']);
            const shown = this._shown[index]!;
            shown.collapsed = !shown.collapsed;
            toggle.setAttribute('aria-expanded', String(!shown.collapsed));
            this._linesOf(index)!.hidden = shown.collapsed;
            return;
        }
        const show = target.closest<HTMLElement>('.aparte-diff-fold__show');
        if (show) {
            this._expand(Number(show.dataset['file']), Number(show.dataset['gap']));
            return;
        }
        const gutter = target.closest<HTMLElement>('button.aparte-diff-line__gutter');
        if (gutter && this.commentable) this._pick(gutter.closest<HTMLElement>('.aparte-diff-line')!, event.shiftKey);
    };

    private readonly _onKeydown = (event: KeyboardEvent): void => {
        const target = event.target as Element | null;
        if (!target || !this.commentable) return;
        if (this._form?.node.contains(target)) {
            if (event.key === 'Escape') {
                // The field's own Escape: a pane around the diff that closes on Escape stays open.
                event.preventDefault();
                event.stopPropagation();
                this._letGo(true);
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && target === this._form.input) {
                event.preventDefault();
                this._send();
            }
            return;
        }
        const gutter = target.closest<HTMLElement>('button.aparte-diff-line__gutter');
        if (!gutter || !this.contains(gutter)) return;
        const row = gutter.closest<HTMLElement>('.aparte-diff-line')!;
        const rows = this._rowsAround(row);
        const at = rows.indexOf(row);
        const moves: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: rows.length - 1 };
        const move = moves[event.key];
        if (move !== undefined) {
            event.preventDefault();
            const next = rows[Math.max(0, Math.min(rows.length - 1, move))]!;
            if (event.shiftKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) this._stretch(row, next);
            this._focusRow(next);
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this._pick(row, event.shiftKey, true);
            return;
        }
        if (event.key === 'Escape' && this._selection) {
            event.preventDefault();
            this._letGo(true);
        }
    };

    /** A button acts on Space's keyup: the keydown already did. */
    private readonly _onKeyup = (event: KeyboardEvent): void => {
        if (event.key === ' ' && (event.target as Element | null)?.closest?.('button.aparte-diff-line__gutter')) event.preventDefault();
    };

    /** The line rows of the file `row` is in. */
    private _rowsAround(row: HTMLElement): HTMLElement[] {
        return [...row.closest('.aparte-diff-file__lines')!.querySelectorAll<HTMLElement>(':scope > .aparte-diff-line')];
    }

    private _fileOf(row: Element): number {
        return Number(row.closest<HTMLElement>('.aparte-diff-file')!.dataset['file']);
    }

    /** Move the file's tab stop to `row`'s number, and the focus with it. */
    private _focusRow(row: HTMLElement): void {
        const shown = this._shown[this._fileOf(row)]!;
        for (const other of this._rowsAround(row)) (other.querySelector('.aparte-diff-line__gutter') as HTMLElement).tabIndex = -1;
        const gutter = row.querySelector<HTMLElement>('.aparte-diff-line__gutter')!;
        gutter.tabIndex = 0;
        shown.roving = row.dataset['key']!;
        gutter.focus();
    }

    /** Shift+arrow: the selection runs from where it started (or from `from`) to `to`. */
    private _stretch(from: HTMLElement, to: HTMLElement): void {
        const file = this._fileOf(from);
        const selection = this._selection;
        if (!selection || selection.file !== file) this._selection = { file, anchor: from.dataset['key']!, focus: to.dataset['key']! };
        else selection.focus = to.dataset['key']!;
        this._paintSelection();
        if (this._writing) this._placeForm(false);
    }

    /** A click (or Enter, Space) on a line number: that line, or the selection stretched to it; then the field. */
    private _pick(row: HTMLElement, stretch: boolean, keyboard = false): void {
        const file = this._fileOf(row);
        const key = row.dataset['key']!;
        const selection = this._selection;
        if (stretch && selection && selection.file === file) selection.focus = key;
        else if (!(keyboard && selection && selection.file === file && this._selectedRows().includes(row))) {
            this._selection = { file, anchor: key, focus: key };
        }
        const shown = this._shown[file]!;
        shown.roving = key;
        for (const other of this._rowsAround(row)) (other.querySelector('.aparte-diff-line__gutter') as HTMLElement).tabIndex = other === row ? 0 : -1;
        this._paintSelection();
        this._writing = true;
        this._placeForm(true);
    }

    private _selectedRows(): HTMLElement[] {
        const selection = this._selection;
        const lines = selection && this._linesOf(selection.file);
        if (!selection || !lines) return [];
        const rows = [...lines.querySelectorAll<HTMLElement>(':scope > .aparte-diff-line')];
        const a = rows.findIndex((r) => r.dataset['key'] === selection.anchor);
        const b = rows.findIndex((r) => r.dataset['key'] === selection.focus);
        if (a < 0 || b < 0) return [];
        return rows.slice(Math.min(a, b), Math.max(a, b) + 1);
    }

    private _paintSelection(): void {
        const selected = new Set(this._selectedRows());
        for (const row of this.querySelectorAll<HTMLElement>('.aparte-diff-line')) {
            const on = selected.has(row);
            row.toggleAttribute('data-selected', on);
            const gutter = row.querySelector('button.aparte-diff-line__gutter');
            gutter?.setAttribute('aria-pressed', String(on));
        }
    }

    /** What the selection covers: its side, its first and last line there, and those lines' text. */
    private _range(): Omit<AparteDiffCommentEventDetail, 'text'> | null {
        const rows = this._selectedRows();
        const selection = this._selection;
        if (!rows.length || !selection) return null;
        const anchor = rows.find((r) => r.dataset['key'] === selection.anchor)!;
        const side = sideOf(this._lineOf.get(anchor)!);
        const lines = rows.map((r) => this._lineOf.get(r)!).filter((l) => numberOn(l, side) !== undefined && (side === 'old' ? l.kind !== 'add' : l.kind !== 'del'));
        const numbers = lines.map((l) => numberOn(l, side)!);
        return {
            path: side === 'old' ? (this._shown[selection.file]!.file.oldPath ?? this._shown[selection.file]!.file.path) : this._shown[selection.file]!.file.path,
            side,
            startLine: Math.min(...numbers),
            endLine: Math.max(...numbers),
            code: lines.map((l) => l.text).join('\n'),
        };
    }

    /** The field, under the selection's last line, named for what it covers. */
    private _placeForm(focus: boolean): void {
        const rows = this._selectedRows();
        const range = this._range();
        if (!rows.length || !range) return;
        const form = this._form ?? this._buildForm();
        form.label.textContent = range.startLine === range.endLine
            ? this._word('diffCommentLine', { n: range.startLine })
            : this._word('diffCommentLines', { start: range.startLine, end: range.endLine });
        form.input.placeholder = this._word('diffCommentPlaceholder');
        form.submit.textContent = this._word('diffCommentSubmit');
        form.cancel.textContent = this._word('diffCommentCancel');
        form.submit.disabled = !form.input.value.trim();
        rows[rows.length - 1]!.after(form.node);
        if (focus) form.input.focus();
    }

    private _buildForm(): CommentForm {
        const doc = this.ownerDocument;
        const node = el(doc, 'form', 'aparte-diff-form');
        node.setAttribute('dir', 'auto');
        const label = el(doc, 'label', 'aparte-diff-form__label');
        const input = el(doc, 'textarea', 'aparte-field aparte-field--sm aparte-field--textarea aparte-diff-form__input');
        input.id = `${this._id}-comment`;
        input.rows = 3;
        input.setAttribute('dir', 'auto');
        label.htmlFor = input.id;
        const actions = el(doc, 'div', 'aparte-diff-form__actions');
        const cancel = el(doc, 'button', 'aparte-btn aparte-btn--ghost aparte-btn--sm aparte-diff-form__cancel');
        cancel.type = 'button';
        const submit = el(doc, 'button', 'aparte-btn aparte-btn--primary aparte-btn--solid aparte-btn--sm aparte-diff-form__submit');
        submit.type = 'submit';
        actions.append(cancel, submit);
        node.append(label, input, actions);
        input.addEventListener('input', () => {
            submit.disabled = !input.value.trim();
        });
        node.addEventListener('submit', (event) => {
            event.preventDefault();
            this._send();
        });
        cancel.addEventListener('click', () => this._letGo(true));
        this._form = { node, input, label, submit, cancel };
        return this._form;
    }

    private _send(): void {
        const form = this._form;
        const range = this._range();
        const text = form?.input.value.trim() ?? '';
        if (!form || !range || !text) return;
        const detail: AparteDiffCommentEventDetail = { ...range, text };
        const kept = this.dispatchEvent(new CustomEvent<AparteDiffCommentEventDetail>('aparte-diff-comment', {
            detail, bubbles: true, composed: true, cancelable: true,
        }));
        if (!kept) return;
        form.input.value = '';
        this._letGo(true);
    }

    /** Close the field and drop the selection; the focus goes back to the line it ended on. */
    private _letGo(returnFocus: boolean): void {
        const last = this._selectedRows().at(-1);
        this._selection = null;
        this._writing = false;
        this._form?.node.remove();
        this._paintSelection();
        if (returnFocus && last) this._focusRow(last);
    }

    /** Show the unchanged run `gap` of file `index`, and carry on from its first line. */
    private _expand(index: number, gap: number): void {
        const shown = this._shown[index]!;
        const before = rowsOf(shown).find((r): r is { type: 'gap'; gap: Gap } => r.type === 'gap' && r.gap.index === gap);
        shown.expanded.add(gap);
        const lines = this._linesOf(index);
        if (!lines) return;
        lines.replaceChildren();
        this._fillLines(lines, index);
        this._paintSelection();
        if (this._writing && this._selection?.file === index) this._placeForm(false);
        if (!before) return;
        const first = this._rowOf(index, `n${before.gap.from + before.gap.delta}`);
        if (!first) return;
        if (this.commentable) this._focusRow(first);
        else {
            first.tabIndex = -1;
            first.focus();
        }
    }

    // ── Focus across a redraw ──────────────────────────────────────────────

    private _focusKey(active: Element): string | null {
        if (this._form && active === this._form.input) return 'form';
        const file = active.closest<HTMLElement>('.aparte-diff-file')?.dataset['file'];
        if (file === undefined) return null;
        if (active.closest('.aparte-diff-file__toggle')) return `toggle:${file}`;
        const show = active.closest<HTMLElement>('.aparte-diff-fold__show');
        if (show) return `gap:${file}:${show.dataset['gap']}`;
        const row = active.closest<HTMLElement>('.aparte-diff-line');
        return row ? `line:${file}:${row.dataset['key']}` : null;
    }

    private _restoreFocus(key: string): void {
        if (key === 'form') {
            if (this._form?.node.isConnected) this._form.input.focus();
            return;
        }
        const [kind, file, rest] = key.split(':');
        const index = Number(file);
        const scope = this._files[index];
        const target = kind === 'toggle' ? scope?.querySelector<HTMLElement>('.aparte-diff-file__toggle')
            : kind === 'gap' ? [...scope?.querySelectorAll<HTMLElement>('.aparte-diff-fold__show') ?? []].find((b) => b.dataset['gap'] === rest)
                : this._rowOf(index, rest ?? '')?.querySelector<HTMLElement>('.aparte-diff-line__gutter');
        if (target instanceof HTMLButtonElement) target.focus();
    }
}

if (typeof customElements !== 'undefined' && !customElements.get('aparte-diff')) customElements.define('aparte-diff', AparteDiff);

declare global {
    interface HTMLElementTagNameMap {
        'aparte-diff': AparteDiff;
    }
}
