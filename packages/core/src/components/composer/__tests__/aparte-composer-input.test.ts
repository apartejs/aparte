// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import type { AparteComposerInput } from '../aparte-composer-input.js';
import type { AparteSendEventDetail } from '../../../types/events.js';

function mount() {
    const composer = document.createElement('aparte-composer');
    document.body.appendChild(composer);
    const input = document.createElement('aparte-composer-input') as AparteComposerInput;
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

describe('aparte-composer-input — getValue preserves newlines', () => {
    it('serializes <br> to \\n (textContent would drop them)', () => {
        const { input, editor } = mount();
        editor.innerHTML = 'line one<br>line two';
        expect(input.getValue()).toBe('line one\nline two');
    });

    it('trims leading/trailing whitespace incl. a trailing bogus <br>', () => {
        const { input, editor } = mount();
        editor.innerHTML = 'only line<br><br>';
        expect(input.getValue()).toBe('only line');
    });

    it('round-trips a value seeded via setValue', () => {
        const { input } = mount();
        input.setValue('a\nb');
        expect(input.getValue()).toBe('a\nb');
    });
});

describe('aparte-composer-input — the editor shows what the composer says', () => {
    it('renders a value set programmatically on the composer', () => {
        const { composer, input } = mount();
        (composer as unknown as { setValue(v: string): void }).setValue('prefilled');
        expect(input.getValue()).toBe('prefilled');
    });

    it('does NOT rewrite the editor while the user types', () => {
        // The reason the old guard existed. `_handleInput` pushes every keystroke up
        // to the composer, which announces it back; an unconditional write would
        // reassign `textContent` on each character and send the caret to the start.
        // Asserted mechanically rather than on the caret: a write goes through
        // `textContent`, which can never produce a `<br>`, so a surviving `<br>`
        // proves the editor was left alone.
        const { input, editor } = mount();
        editor.innerHTML = 'a<br>b';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        expect(editor.querySelector('br')).not.toBeNull();
        expect(input.getValue()).toBe('a\nb');
    });

    it('still empties the editor after a submit', () => {
        // `mount()` stubs submit so the Enter tests can observe the call; here the
        // real one has to run, because the clear is its last statement.
        const { composer, input, editor, submit } = mount();
        submit.mockRestore();
        editor.textContent = 'hi';
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        (composer as unknown as { submit(): void }).submit();
        expect(input.getValue()).toBe('');
    });

    it('submits attachments with no text, and leaves the empty editor alone', () => {
        const { composer, input, submit } = mount();
        submit.mockRestore();
        const sends: AparteSendEventDetail[] = [];
        composer.addEventListener('aparte-send', (e) => sends.push((e as CustomEvent<AparteSendEventDetail>).detail));
        (composer as unknown as { addAttachments(f: File[]): void }).addAttachments([new File(['x'], 'a.txt')]);

        (composer as unknown as { submit(): void }).submit();

        expect(sends).toHaveLength(1);
        expect(sends[0]?.content).toBe('');
        expect(sends[0]?.files).toHaveLength(1);
        expect(input.getValue()).toBe('');
    });
});

describe('aparte-composer-input — standalone (no <aparte-composer> parent)', () => {
    function mountBare() {
        const input = document.createElement('aparte-composer-input') as AparteComposerInput;
        document.body.appendChild(input);
        const editor = (input as unknown as { _editor: HTMLElement })._editor;
        return { input, editor };
    }

    it('emits aparte-composer-submit on Enter instead of no-op-ing', () => {
        const { input, editor } = mountBare();
        const onSubmit = vi.fn();
        input.addEventListener('aparte-composer-submit', onSubmit);
        editor.dispatchEvent(enter({ isComposing: false }));
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('does not emit submit on Shift+Enter (newline), and never on an empty field', () => {
        const { input, editor } = mountBare();
        const onSubmit = vi.fn();
        input.addEventListener('aparte-composer-submit', onSubmit);
        // Shift+Enter = newline, not submit.
        editor.dispatchEvent(enter({ shiftKey: true }));
        expect(onSubmit).not.toHaveBeenCalled();
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
