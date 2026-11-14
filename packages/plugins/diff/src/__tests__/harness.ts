/** What the element tests share: a mounted `<aparte-diff>`, and its parts by what they are. */
import '../aparte-diff.js';
import type { AparteDiff } from '../aparte-diff.js';
import type { AparteDiffInput } from '../types.js';

export function mount(diff: AparteDiffInput, attrs: Record<string, string> = {}, parent: HTMLElement = document.body): AparteDiff {
    const el = document.createElement('aparte-diff') as AparteDiff;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.diff = diff;
    parent.append(el);
    return el;
}

/** The rows of the files' lines, as `kind old new text`. */
export function rows(el: Element): string[] {
    return [...el.querySelectorAll('.aparte-diff-line')].map((row) => {
        const num = (side: string) => row.querySelector(`.aparte-diff-line__num[data-side="${side}"]`)?.textContent || '·';
        return `${row.getAttribute('data-kind')} ${num('old')} ${num('new')} ${row.querySelector('.aparte-diff-line__code')!.textContent}`;
    });
}

export function gutter(el: Element, kind: string, number: number): HTMLElement {
    const side = kind === 'del' ? 'old' : 'new';
    const row = [...el.querySelectorAll<HTMLElement>(`.aparte-diff-line[data-kind="${kind}"]`)]
        .find((r) => r.querySelector(`.aparte-diff-line__num[data-side="${side}"]`)?.textContent === String(number));
    if (!row) throw new Error(`no ${kind} row numbered ${number}`);
    return row.querySelector<HTMLElement>('.aparte-diff-line__gutter')!;
}

/** A pointer click, as a mouse makes one (`detail` 1), with its modifiers. */
export function click(target: Element, init: MouseEventInit = {}): void {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ...init }));
}

export function key(target: Element, name: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
}

export const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Forty lines, the twentieth changed: what a fold folds. */
export const FORTY = {
    path: 'src/long.ts',
    before: `${Array.from({ length: 40 }, (_, i) => `const line${i + 1} = ${i + 1};`).join('\n')}\n`,
    after: `${Array.from({ length: 40 }, (_, i) => (i === 19 ? 'const line20 = 2000;' : `const line${i + 1} = ${i + 1};`)).join('\n')}\n`,
};
