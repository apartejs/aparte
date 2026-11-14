/**
 * The line diff, written here: Myers' O(ND) algorithm ("An O(ND) Difference Algorithm and
 * Its Variations", 1986), the one `git diff` and GNU diff start from. It finds the fewest
 * added and removed lines that turn one text into the other, in time proportional to the
 * length of the texts times the number of changes — small for an agent's edit.
 *
 * Two limits, both said where they bite:
 *  - the lines the two texts share at their start and at their end are taken off first, so
 *    the search only runs over the part that changed;
 *  - past `MAX_COST` changes (two texts with little in common) the search stops, and what is
 *    left of the middle is shown as removed then added: still a true account of the change,
 *    no longer the shortest one. The memory the search keeps grows with the square of the
 *    changes, which is what the bound is for.
 *
 * No DOM anywhere: `diffTexts` runs on a server as well.
 */
import type { AparteDiffFile, AparteDiffHunk, AparteDiffLine } from './types.js';

/** One step of the edit: a line kept, removed from the old text, or added from the new one. */
export type Edit = 'eq' | 'del' | 'add';

/** The changes the search follows before it shows the rest as replaced. */
const MAX_COST = 2000;

/** The lines unchanged around a change, as `git diff` keeps them. */
const DEFAULT_CONTEXT = 3;

/**
 * The edit that turns `a` into `b`, one step per line, removals before additions inside a
 * run of changes.
 */
export function diffLines(a: readonly string[], b: readonly string[]): Edit[] {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA--;
        endB--;
    }
    const edits: Edit[] = new Array<Edit>(start).fill('eq');
    for (const edit of middle(a, b, start, endA, start, endB)) edits.push(edit);
    for (let i = endA; i < a.length; i++) edits.push('eq');
    return removalsFirst(edits);
}

/** Myers' forward search over `a[a0..a1)` and `b[b0..b1)`, and the walk back along its trace. */
function middle(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number): Edit[] {
    const n = a1 - a0;
    const m = b1 - b0;
    if (n === 0) return new Array<Edit>(m).fill('add');
    if (m === 0) return new Array<Edit>(n).fill('del');
    const max = n + m;
    const offset = max + 1;
    // v[k + offset]: how far along `a` the furthest path on diagonal k reached.
    const v = new Int32Array(2 * max + 3);
    // Each step's v, over the diagonals it can read: -(d + 1)..(d + 1).
    const trace: Int32Array[] = [];
    let reached = -1;
    for (let d = 0; d <= Math.min(max, MAX_COST); d++) {
        trace.push(v.slice(offset - d - 1, offset + d + 2));
        for (let k = -d; k <= d; k += 2) {
            let x = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!) ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
            let y = x - k;
            while (x < n && y < m && a[a0 + x] === b[b0 + y]) {
                x++;
                y++;
            }
            v[offset + k] = x;
            if (x >= n && y >= m) {
                reached = d;
                break;
            }
        }
        if (reached >= 0) break;
    }
    // Too many changes to search: the whole middle, replaced.
    if (reached < 0) return [...new Array<Edit>(n).fill('del'), ...new Array<Edit>(m).fill('add')];

    const out: Edit[] = [];
    let x = n;
    let y = m;
    for (let d = reached; d >= 0; d--) {
        const snapshot = trace[d]!;
        const at = (k: number): number => snapshot[k + d + 1]!;
        const k = x - y;
        const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
        const prevK = down ? k + 1 : k - 1;
        const prevX = at(prevK);
        const prevY = prevX - prevK;
        while (x > prevX && y > prevY) {
            out.push('eq');
            x--;
            y--;
        }
        if (d > 0) out.push(down ? 'add' : 'del');
        x = prevX;
        y = prevY;
    }
    return out.reverse();
}

/** Inside each run of changes, the removals first: how `git diff` shows a replaced block. */
function removalsFirst(edits: Edit[]): Edit[] {
    const out: Edit[] = [];
    let dels = 0;
    let adds = 0;
    const flush = () => {
        for (; dels > 0; dels--) out.push('del');
        for (; adds > 0; adds--) out.push('add');
    };
    for (const edit of edits) {
        if (edit === 'del') dels++;
        else if (edit === 'add') adds++;
        else {
            flush();
            out.push('eq');
        }
    }
    flush();
    return out;
}

/** A text's lines, without their endings, and whether its last line ends with one. */
export function splitLines(text: string): { lines: string[]; endsWithNewline: boolean } {
    if (text === '') return { lines: [], endsWithNewline: true };
    const lines = text.split(/\r?\n/);
    const endsWithNewline = lines[lines.length - 1] === '';
    if (endsWithNewline) lines.pop();
    return { lines, endsWithNewline };
}

/** What `diffTexts` is told besides the two texts. */
export interface DiffTextsOptions {
    /** Unchanged lines kept on each side of a change (3, as `git diff`). */
    context?: number;
    /** The file's path, as the diff names it. */
    path?: string;
    /** Its path before, when it was renamed. */
    oldPath?: string;
}

/**
 * The diff of two texts, as one file's hunks with their line numbers. Lines are compared
 * without their endings, so a file saved with Windows line endings reads the same; a last
 * line that gains or loses its newline is shown changed, marked `noNewline`.
 *
 * @example
 * const file = diffTexts(before, after, { path: 'src/parse.ts' });
 * file.added;   // 1
 * file.hunks;   // [{ oldStart: 12, oldCount: 7, newStart: 12, newCount: 7, lines: [...] }]
 */
export function diffTexts(before: string, after: string, options: DiffTextsOptions = {}): AparteDiffFile {
    const context = Math.max(0, Math.floor(options.context ?? DEFAULT_CONTEXT));
    const old = splitLines(before);
    const next = splitLines(after);
    // A last line without its newline is not the same line as one with it: the key says so.
    const keys = (side: typeof old) => side.lines.map((line, i) => (i === side.lines.length - 1 && !side.endsWithNewline ? `${line}\u0000` : line));
    const edits = diffLines(keys(old), keys(next));

    const lines: AparteDiffLine[] = [];
    let o = 0;
    let n = 0;
    for (const edit of edits) {
        const line: AparteDiffLine = edit === 'eq'
            ? { kind: 'context', text: next.lines[n]!, oldLine: o + 1, newLine: n + 1 }
            : edit === 'del'
                ? { kind: 'del', text: old.lines[o]!, oldLine: o + 1 }
                : { kind: 'add', text: next.lines[n]!, newLine: n + 1 };
        const lastOld = edit !== 'add' && o === old.lines.length - 1 && !old.endsWithNewline;
        const lastNew = edit !== 'del' && n === next.lines.length - 1 && !next.endsWithNewline;
        if (lastOld || lastNew) line.noNewline = true;
        if (edit !== 'add') o++;
        if (edit !== 'del') n++;
        lines.push(line);
    }

    const file: AparteDiffFile = {
        path: options.path ?? '',
        status: 'modified',
        added: lines.filter((l) => l.kind === 'add').length,
        removed: lines.filter((l) => l.kind === 'del').length,
        hunks: hunksOf(lines, context),
    };
    if (options.oldPath !== undefined && options.oldPath !== file.path) {
        file.oldPath = options.oldPath;
        file.status = 'renamed';
    }
    return file;
}

/** The changed lines with `context` unchanged ones around them, two hunks joined when their context touches. */
export function hunksOf(lines: readonly AparteDiffLine[], context: number): AparteDiffHunk[] {
    const changed: number[] = [];
    lines.forEach((line, i) => {
        if (line.kind !== 'context') changed.push(i);
    });
    const hunks: AparteDiffHunk[] = [];
    let i = 0;
    while (i < changed.length) {
        let last = changed[i]!;
        let j = i + 1;
        // Joined while the unchanged run between two changes is no longer than both contexts.
        while (j < changed.length && changed[j]! - last - 1 <= 2 * context) last = changed[j++]!;
        const from = Math.max(0, changed[i]! - context);
        const to = Math.min(lines.length - 1, last + context);
        hunks.push(hunkOf(lines, from, to));
        i = j;
    }
    return hunks;
}

/** `lines[from..to]` as a hunk, its header counted from the lines' own numbers. */
function hunkOf(lines: readonly AparteDiffLine[], from: number, to: number): AparteDiffHunk {
    const own = lines.slice(from, to + 1);
    const oldCount = own.filter((l) => l.kind !== 'add').length;
    const newCount = own.filter((l) => l.kind !== 'del').length;
    // The lines before the hunk on each side: its start when it is empty there, else one more.
    let oldBefore = 0;
    let newBefore = 0;
    for (let k = from - 1; k >= 0; k--) {
        const line = lines[k]!;
        if (oldBefore === 0 && line.oldLine !== undefined) oldBefore = line.oldLine;
        if (newBefore === 0 && line.newLine !== undefined) newBefore = line.newLine;
        if (oldBefore && newBefore) break;
    }
    return {
        oldStart: oldCount > 0 ? oldBefore + 1 : oldBefore,
        oldCount,
        newStart: newCount > 0 ? newBefore + 1 : newBefore,
        newCount,
        lines: own.map((line) => ({ ...line })),
    };
}
