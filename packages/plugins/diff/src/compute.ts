/**
 * The line diff, written here: Myers' O(ND) algorithm ("An O(ND) Difference Algorithm and
 * Its Variations", 1986), the one `git diff` and GNU diff start from. It finds the fewest
 * added and removed lines that turn one text into the other, in time proportional to the
 * length of the texts times the number of changes — small for an agent's edit.
 *
 * Three steps keep a large file fast, each said where it bites:
 *  - the lines the two texts share at their start and at their end are taken off first, so
 *    the search only runs over the part that changed;
 *  - a part longer than `ANCHOR_FROM` lines is first cut at the lines that appear once in
 *    each text, in the same order (the longest such run: "patience" anchoring, as
 *    `git diff --patience` does), and each gap between two of them is diffed on its own. A
 *    large file changed all through still gives one small hunk per change, in little time;
 *  - in a gap, past `MAX_COST` changes (two texts with little in common there) the search
 *    stops, and that gap alone is shown as removed then added: still a true account of the
 *    change, no longer the shortest one. The memory the search keeps grows with the square
 *    of the changes, which is what the bound is for.
 *
 * No DOM anywhere: `diffTexts` runs on a server as well.
 */
import type { AparteDiffFile, AparteDiffHunk, AparteDiffLine } from './types.js';

/** One step of the edit: a line kept, removed from the old text, or added from the new one. */
export type Edit = 'eq' | 'del' | 'add';

/** The changes the search follows, in one gap, before it shows the rest of the gap as replaced. */
const MAX_COST = 2000;

/**
 * Past this many lines (both sides), a part is cut at its anchors before it is searched. Below
 * it the search is cheap and always finishes (it cannot need more than `MAX_COST` changes),
 * so the diff is the shortest.
 */
const ANCHOR_FROM = MAX_COST;

/** The lines unchanged around a change, as `git diff` keeps them. */
const DEFAULT_CONTEXT = 3;

/** A part of the two texts still to diff, or (a number) that many unchanged lines to write. */
type Task = { a0: number; a1: number; b0: number; b1: number } | number;

/**
 * The edit that turns `a` into `b`, one step per line, removals before additions inside a
 * run of changes.
 */
export function diffLines(a: readonly string[], b: readonly string[]): Edit[] {
    const edits: Edit[] = [];
    // A stack rather than recursion: a long file cut at its anchors, again and again, must not
    // run out of call stack. The parts are taken in order, so the edits are written in order.
    const tasks: Task[] = [{ a0: 0, a1: a.length, b0: 0, b1: b.length }];
    while (tasks.length) {
        const task = tasks.pop()!;
        if (typeof task === 'number') {
            for (let k = 0; k < task; k++) edits.push('eq');
            continue;
        }
        let { a0, a1, b0, b1 } = task;
        while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) {
            edits.push('eq');
            a0++;
            b0++;
        }
        let shared = 0;
        while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) {
            a1--;
            b1--;
            shared++;
        }
        if (shared) tasks.push(shared);
        if (a1 - a0 + (b1 - b0) > ANCHOR_FROM) {
            const anchors = anchorsOf(a, b, a0, a1, b0, b1);
            if (anchors.length) {
                // Pushed last part first, so the first comes off first.
                const parts: Task[] = [];
                let pa = a0;
                let pb = b0;
                for (const [i, j] of anchors) {
                    parts.push({ a0: pa, a1: i, b0: pb, b1: j }, 1);
                    pa = i + 1;
                    pb = j + 1;
                }
                parts.push({ a0: pa, a1, b0: pb, b1 });
                for (let k = parts.length - 1; k >= 0; k--) tasks.push(parts[k]!);
                continue;
            }
        }
        for (const edit of middle(a, b, a0, a1, b0, b1)) edits.push(edit);
    }
    return removalsFirst(edits);
}

/**
 * The lines that appear exactly once in `a[a0..a1)` and once in `b[b0..b1)`, as pairs of
 * their positions — the longest run of them in the same order on both sides (a longest
 * increasing subsequence, by patience sorting). Lines unique on both sides are almost always
 * the same line, unmoved: the safe places to cut a large diff.
 */
function anchorsOf(a: readonly string[], b: readonly string[], a0: number, a1: number, b0: number, b1: number): Array<[number, number]> {
    // Per line: its count in `a`, its count in `b`, and where it is in `b`.
    const seen = new Map<string, [number, number, number]>();
    for (let i = a0; i < a1; i++) {
        const entry = seen.get(a[i]!);
        if (entry) entry[0]++;
        else seen.set(a[i]!, [1, 0, -1]);
    }
    for (let j = b0; j < b1; j++) {
        const entry = seen.get(b[j]!);
        if (!entry) continue;
        entry[1]++;
        entry[2] = j;
    }
    const pairs: Array<[number, number]> = [];
    for (let i = a0; i < a1; i++) {
        const entry = seen.get(a[i]!)!;
        if (entry[0] === 1 && entry[1] === 1) pairs.push([i, entry[2]]);
    }
    if (!pairs.length) return pairs;
    // Patience sorting over the `b` positions: `tails[k]` ends the best run of length k + 1.
    const tails: number[] = [];
    const before = new Int32Array(pairs.length).fill(-1);
    for (let p = 0; p < pairs.length; p++) {
        const j = pairs[p]![1];
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (pairs[tails[mid]!]![1] < j) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0) before[p] = tails[lo - 1]!;
        tails[lo] = p;
    }
    const run: Array<[number, number]> = [];
    for (let p = tails[tails.length - 1]!; p >= 0; p = before[p]!) run.push(pairs[p]!);
    return run.reverse();
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
    /** Its path before, when it was renamed. Not read for a file created or deleted (a `null` side). */
    oldPath?: string;
}

/**
 * The diff of two texts, as one file's hunks with their line numbers. Lines are compared
 * without their endings, so a file saved with Windows line endings reads the same; a last
 * line that gains or loses its newline is shown changed, marked `noNewline`.
 *
 * A side that does not exist is `null`: `before: null` is a file created (`added`),
 * `after: null` a file deleted (`deleted`). `''` is a file that exists and is empty, so
 * `diffTexts('', text)` is that file filled in (`modified`). `formatUnifiedDiff` writes each
 * as git does, so the patch applies.
 *
 * @example
 * const file = diffTexts(before, after, { path: 'src/parse.ts' });
 * file.added;   // 1
 * file.hunks;   // [{ oldStart: 12, oldCount: 7, newStart: 12, newCount: 7, lines: [...] }]
 * diffTexts(null, 'hello\n', { path: 'notes.md' }).status; // 'added'
 */
export function diffTexts(before: string | null, after: string | null, options: DiffTextsOptions = {}): AparteDiffFile {
    const context = Math.max(0, Math.floor(options.context ?? DEFAULT_CONTEXT));
    const old = splitLines(before ?? '');
    const next = splitLines(after ?? '');
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
    // A file created or deleted has one path: there is nothing to have been renamed.
    if (before === null && after !== null) file.status = 'added';
    else if (after === null && before !== null) file.status = 'deleted';
    else if (options.oldPath !== undefined && options.oldPath !== file.path) {
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
