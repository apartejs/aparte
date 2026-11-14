/**
 * `parseUnifiedDiff` and `formatUnifiedDiff`: the text a tool prints, read into files and
 * written back. Pure string work, so both run on a server.
 *
 * The reader follows `git diff` and `diff -u`: a file starts at `diff --git` or at a `---`
 * line followed by a `+++` one; its extended headers (`new file mode`, `deleted file mode`,
 * `rename from` / `rename to`, `Binary files … differ`) say what happened to it; a hunk is
 * read for exactly as many lines as its `@@` header counts, so a removed line that itself
 * starts with `--` is a line, not the next file. What is around the diff — a commit message,
 * an email's signature — is skipped.
 */
import type { AparteDiffFile, AparteDiffHunk, AparteDiffLine } from './types.js';

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/;
const NO_NEWLINE = '\\';

/**
 * The files of a unified diff, in the order it lists them. A text that holds no diff gives
 * an empty list. Windows line endings read the same as Unix ones.
 *
 * @example
 * const files = parseUnifiedDiff(gitDiffOutput);
 * files.map((f) => `${f.path} +${f.added} −${f.removed}`);
 */
export function parseUnifiedDiff(text: string): AparteDiffFile[] {
    const lines = text.split(/\r?\n/);
    const files: AparteDiffFile[] = [];
    let file: AparteDiffFile | null = null;
    // A file's paths as its headers say them, settled when it ends.
    let fromGit: [string, string] | null = null;
    let renameFrom: string | null = null;
    let renameTo: string | null = null;
    let minus: string | null = null;
    let plus: string | null = null;
    // Whether the file's `---` / `+++` pair was read: `minus` is null for `/dev/null` too.
    let headers = false;

    const close = () => {
        if (!file) return;
        const oldPath = renameFrom ?? (minus === null ? fromGit?.[0] : minus);
        const newPath = renameTo ?? (plus === null ? fromGit?.[1] : plus);
        if (file.status !== 'deleted') file.path = newPath ?? oldPath ?? '';
        else file.path = oldPath ?? newPath ?? '';
        if (file.status === 'modified' && oldPath && newPath && oldPath !== newPath) {
            file.status = 'renamed';
            file.oldPath = oldPath;
        }
        file.added = file.hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.kind === 'add').length, 0);
        file.removed = file.hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.kind === 'del').length, 0);
        files.push(file);
        file = null;
        fromGit = null;
        renameFrom = renameTo = minus = plus = null;
        headers = false;
    };
    const open = () => {
        close();
        file = { path: '', status: 'modified', added: 0, removed: 0, hunks: [] };
        return file;
    };

    let i = 0;
    while (i < lines.length) {
        const line = lines[i]!;
        if (line.startsWith('diff --git ')) {
            open();
            fromGit = gitPaths(line.slice('diff --git '.length));
            i++;
            continue;
        }
        if (line.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ')) {
            // A `---` that is not under its own `diff --git` (or comes after a hunk) starts a file.
            const current = file as AparteDiffFile | null;
            if (!current || current.hunks.length > 0 || headers) open();
            const target = file as unknown as AparteDiffFile;
            minus = headerPath(line.slice(4));
            plus = headerPath(lines[i + 1]!.slice(4));
            headers = true;
            if (minus === null) target.status = 'added';
            if (plus === null) target.status = 'deleted';
            i += 2;
            continue;
        }
        const current = file as AparteDiffFile | null;
        if (current) {
            const hunk = HUNK.exec(line);
            if (hunk) {
                i = readHunk(lines, i, hunk, current);
                continue;
            }
            if (line.startsWith('new file mode')) current.status = 'added';
            else if (line.startsWith('deleted file mode')) current.status = 'deleted';
            else if (line.startsWith('rename from ')) renameFrom = unquote(line.slice('rename from '.length));
            else if (line.startsWith('rename to ')) renameTo = unquote(line.slice('rename to '.length));
            else if (line.startsWith('Binary files ') || line === 'GIT binary patch') current.binary = true;
        }
        i++;
    }
    close();
    return files;
}

/** Read the hunk whose header is on line `at`, for as many lines as it counts. Returns the next line to read. */
function readHunk(lines: readonly string[], at: number, header: RegExpExecArray, file: AparteDiffFile): number {
    const hunk: AparteDiffHunk = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
    };
    const section = header[5]?.trim();
    if (section) hunk.section = section;
    let oldLeft = hunk.oldCount;
    let newLeft = hunk.newCount;
    let oldLine = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart;
    let newLine = hunk.newCount === 0 ? hunk.newStart + 1 : hunk.newStart;
    let i = at + 1;
    for (; i < lines.length; i++) {
        const raw = lines[i]!;
        // The marker belongs to the line before it, even once the counts are spent.
        if (raw.startsWith(NO_NEWLINE)) {
            const last = hunk.lines[hunk.lines.length - 1];
            if (last) last.noNewline = true;
            continue;
        }
        if (oldLeft <= 0 && newLeft <= 0) break;
        const sign = raw[0];
        let line: AparteDiffLine;
        if (sign === '-' && oldLeft > 0) {
            line = { kind: 'del', text: raw.slice(1), oldLine: oldLine++ };
            oldLeft--;
        } else if (sign === '+' && newLeft > 0) {
            line = { kind: 'add', text: raw.slice(1), newLine: newLine++ };
            newLeft--;
        } else if ((sign === ' ' || raw === '') && oldLeft > 0 && newLeft > 0) {
            // An empty line is an unchanged empty line whose space a tool trimmed.
            line = { kind: 'context', text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ };
            oldLeft--;
            newLeft--;
        } else break;
        hunk.lines.push(line);
    }
    file.hunks.push(hunk);
    return i;
}

/** A `---` / `+++` path: without its `a/` or `b/`, its date, its quotes; `null` for `/dev/null`. */
function headerPath(value: string): string | null {
    let path = value.includes('\t') ? value.slice(0, value.indexOf('\t')) : value;
    path = unquote(path.trimEnd());
    if (path === '/dev/null') return null;
    return stripSide(path);
}

function stripSide(path: string): string {
    return /^[ab]\//.test(path) ? path.slice(2) : path;
}

/** The two paths of a `diff --git a/x b/y` line. */
function gitPaths(rest: string): [string, string] | null {
    if (rest.startsWith('"')) {
        const first = quotedEnd(rest);
        const a = unquote(rest.slice(0, first));
        const b = unquote(rest.slice(first).trim());
        return [stripSide(a), stripSide(b)];
    }
    // Unquoted: a path with a space is ambiguous, so the split that gives the same path twice wins.
    const half = (rest.length - 1) / 2;
    if (Number.isInteger(half) && rest[half] === ' ' && rest.slice(2, half) === rest.slice(half + 3)) {
        return [stripSide(rest.slice(0, half)), stripSide(rest.slice(half + 1))];
    }
    const at = rest.lastIndexOf(' b/');
    if (at > 0) return [stripSide(rest.slice(0, at)), stripSide(rest.slice(at + 1))];
    return null;
}

/** Where the quoted token at the start of `text` ends. */
function quotedEnd(text: string): number {
    for (let i = 1; i < text.length; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '"') return i + 1;
    }
    return text.length;
}

/** A path git quoted (C escapes, octal bytes of UTF-8), as it reads. Unquoted paths are returned as they are. */
function unquote(value: string): string {
    if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
    const body = value.slice(1, -1);
    const bytes: number[] = [];
    const named: Record<string, number> = { n: 10, t: 9, r: 13, '"': 34, '\\': 92, a: 7, b: 8, f: 12, v: 11 };
    for (let i = 0; i < body.length; i++) {
        const ch = body[i]!;
        if (ch !== '\\') {
            for (const byte of new TextEncoder().encode(ch)) bytes.push(byte);
            continue;
        }
        const next = body[i + 1] ?? '';
        const octal = /^[0-7]{3}/.exec(body.slice(i + 1));
        if (octal) {
            bytes.push(parseInt(octal[0], 8));
            i += 3;
        } else {
            bytes.push(named[next] ?? next.charCodeAt(0));
            i += 1;
        }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
}

/** A path as git writes it in a header: quoted when it holds a quote, a backslash or a control character. */
function quote(path: string): string {
    // eslint-disable-next-line no-control-regex
    if (!/["\\\u0000-\u001f\u007f]/.test(path)) return path;
    return `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
}

/** `-12,7` — the count left out when it is 1, as git writes it. */
function range(start: number, count: number): string {
    return count === 1 ? `${start}` : `${start},${count}`;
}

/**
 * Files as a unified diff, the way `git diff` writes it: what `parseUnifiedDiff` reads back,
 * and what `git apply` takes. With `diffTexts`, a server can send a patch as text.
 *
 * @example
 * formatUnifiedDiff(diffTexts(before, after, { path: 'src/parse.ts' }));
 * // diff --git a/src/parse.ts b/src/parse.ts
 * // --- a/src/parse.ts
 * // +++ b/src/parse.ts
 * // @@ -12,7 +12,7 @@
 * // …
 */
export function formatUnifiedDiff(files: AparteDiffFile | readonly AparteDiffFile[]): string {
    const out: string[] = [];
    for (const file of Array.isArray(files) ? files : [files as AparteDiffFile]) {
        const status = file.status ?? (file.oldPath && file.oldPath !== file.path ? 'renamed' : 'modified');
        const oldPath = file.oldPath ?? file.path;
        out.push(`diff --git ${quote(`a/${oldPath}`)} ${quote(`b/${file.path}`)}`);
        if (status === 'renamed') out.push(`rename from ${quote(oldPath)}`, `rename to ${quote(file.path)}`);
        if (file.binary) {
            out.push(`Binary files ${status === 'added' ? '/dev/null' : `a/${oldPath}`} and ${status === 'deleted' ? '/dev/null' : `b/${file.path}`} differ`);
            continue;
        }
        if (file.hunks.length === 0) continue;
        out.push(`--- ${status === 'added' ? '/dev/null' : quote(`a/${oldPath}`)}`);
        out.push(`+++ ${status === 'deleted' ? '/dev/null' : quote(`b/${file.path}`)}`);
        for (const hunk of file.hunks) {
            out.push(`@@ -${range(hunk.oldStart, hunk.oldCount)} +${range(hunk.newStart, hunk.newCount)} @@${hunk.section ? ` ${hunk.section}` : ''}`);
            for (const line of hunk.lines) {
                out.push(`${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '}${line.text}`);
                if (line.noNewline) out.push('\\ No newline at end of file');
            }
        }
    }
    return out.length ? `${out.join('\n')}\n` : '';
}
