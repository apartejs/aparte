// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';

function mount() {
    const composer = document.createElement('aparte-composer');
    document.body.appendChild(composer);
    const input = document.createElement('aparte-composer-input');
    composer.appendChild(input);
    // connectedCallback fires synchronously on append into a connected tree.
    const editor = (input as unknown as { _editor: HTMLElement })._editor;
    const submit = vi.spyOn(composer as unknown as { submit: () => void }, 'submit').mockImplementation(() => {});
    return { composer, input, editor, submit };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

const enter = (init: KeyboardEventInit) =>
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });

describe('aparte-composer-input — IME-aware submit-on-enter', () => {
    it('does NOT submit when Enter confirms an IME composition (isComposing)', () => {
        const { editor, submit } = mount();
        editor.dispatchEvent(enter({ isComposing: true }));
        expect(submit).not.toHaveBeenCalled();
    });

    it('submits on a bare Enter outside composition', () => {
        const { editor, submit } = mount();
        editor.dispatchEvent(enter({ isComposing: false }));
        expect(submit).toHaveBeenCalledTimes(1);
    });

    it('does not submit on Shift+Enter (inserts a newline)', () => {
        const { editor, submit } = mount();
        editor.dispatchEvent(enter({ shiftKey: true }));
        expect(submit).not.toHaveBeenCalled();
    });
});

describe('aparte-composer-input — height auto-adjust', () => {
    it('leaves an explicit px height (never `auto`) so it opts out of parent flex stretch', () => {
        const { editor } = mount();
        // The synchronous mount-time adjust sets an inline px height. `auto`
        // would let a stretching parent inflate the editor.
        expect(editor.style.height.endsWith('px')).toBe(true);
    });

    it('re-measures after mount (deferred reflow), not only on the first keystroke', async () => {
        const { input } = mount();
        // Spy AFTER the synchronous mount adjust — we want the deferred reflow.
        const spy = vi.spyOn(input as unknown as { _adjustHeight: () => void }, '_adjustHeight');
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        expect(spy).toHaveBeenCalled();
    });
});
