/**
 * Test helper: play a file's hunks over the old text, which must give the new one. What makes
 * a diff right is not its look but that it is a true account of the change, and this checks it.
 */
import type { AparteDiffFile } from '../types.js';

export function apply(before: string, file: AparteDiffFile): string[] {
    const old = before === '' ? [] : before.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    const out: string[] = [];
    let at = 0;
    for (const hunk of file.hunks) {
        const first = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
        while (at < first) out.push(old[at++]!);
        for (const line of hunk.lines) {
            if (line.kind === 'add') out.push(line.text);
            else {
                if (old[at] !== line.text) throw new Error(`hunk line "${line.text}" does not match old line ${at + 1} "${old[at]}"`);
                if (line.kind === 'context') out.push(line.text);
                at++;
            }
        }
    }
    while (at < old.length) out.push(old[at++]!);
    return out;
}

/** The lines of a text, as `apply` returns them. */
export function linesOf(text: string): string[] {
    return text === '' ? [] : text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
}
