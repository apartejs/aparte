import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../copy-text.js';

/**
 * The library must work outside a secure context — `http://192.168.1.x` is the
 * archetypal deployment for a bring-your-own-key / local-model consumer — and there
 * `navigator.clipboard` is not a rejected promise, it is `undefined`. jsdom has no
 * Clipboard API either, which makes it the honest stand-in for that browser: the
 * property is defined here only by the tests that want the modern path.
 */
const nav = navigator as unknown as Record<string, unknown>;
const doc = document as unknown as Record<string, unknown>;
const savedExec = doc.execCommand;

const withClipboard = (writeText: (t: string) => Promise<void>): void => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
};
const withoutClipboard = (): void => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // Guard the guard: if this is still an object the test proves nothing.
    expect(navigator.clipboard).toBeUndefined();
};

afterEach(() => {
    delete nav.clipboard;
    if (savedExec === undefined) delete doc.execCommand;
    else doc.execCommand = savedExec;
    document.body.innerHTML = '';
});

describe('copyText() — no secure context required', () => {
    it('uses the Clipboard API when there is one', async () => {
        const writeText = vi.fn(() => Promise.resolve());
        withClipboard(writeText);
        await copyText('hello');
        expect(writeText).toHaveBeenCalledWith('hello');
    });

    it('falls back to execCommand("copy") where navigator.clipboard is undefined — plain http://', async () => {
        withoutClipboard();
        const button = document.createElement('button');
        document.body.appendChild(button);
        button.focus();
        const execCommand = vi.fn((command: string) => {
            // What the command copies is the current selection: the text must be in
            // a focused, selected control at this exact moment.
            expect(command).toBe('copy');
            const el = document.activeElement as HTMLTextAreaElement;
            expect(el.tagName).toBe('TEXTAREA');
            expect(el.value).toBe('hello');
            return true;
        });
        doc.execCommand = execCommand;

        await copyText('hello');

        expect(execCommand).toHaveBeenCalledTimes(1);
        // The scratch control is gone and focus is back on the button the user pressed.
        expect(document.querySelector('textarea')).toBeNull();
        expect(document.activeElement).toBe(button);
    });

    it('rejects when neither path exists, so a "copied" confirmation is not shown for nothing', async () => {
        withoutClipboard();
        doc.execCommand = undefined;
        await expect(copyText('x')).rejects.toThrow();
        expect(document.querySelector('textarea')).toBeNull();
    });

    it('rejects when execCommand reports a failed copy', async () => {
        withoutClipboard();
        doc.execCommand = vi.fn(() => false);
        await expect(copyText('x')).rejects.toThrow();
    });
});
