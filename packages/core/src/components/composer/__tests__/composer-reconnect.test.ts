// @vitest-environment jsdom
/**
 * A composer survives a disconnect/reconnect with its wiring intact.
 *
 * Moving a chat is an ordinary gesture — into an `<aparte-split>` pane, into an
 * app shell, any reparenting — and a move is a disconnect + reconnect of the
 * whole subtree. Every composer child used to bind its listeners inside
 * `_render()`, behind the "DOM already there" early return, while
 * `disconnectedCallback` removed them: after one move the editor was deaf (the
 * draft landed in the DOM, `root.value` never heard of it, the send button
 * stayed disabled with text visibly in the box) and every button had lost its
 * click. The vanilla example's `?layout=split` and `?layout=shell` variants move
 * the chat exactly this way — nothing sent a message there, so nothing saw it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-input.js';
import '../aparte-composer-send.js';
import type { AparteComposer } from '../aparte-composer.js';
import type { AparteComposerInput } from '../aparte-composer-input.js';

function mount() {
    const composer = document.createElement('aparte-composer') as AparteComposer;
    document.body.appendChild(composer);
    const input = document.createElement('aparte-composer-input') as AparteComposerInput;
    const send = document.createElement('aparte-composer-send');
    composer.appendChild(input);
    composer.appendChild(send);
    return { composer, input, send };
}

/** Disconnect + reconnect, the way a split/shell restructure moves the chat. */
function reconnect(el: HTMLElement): void {
    const parent = el.parentElement!;
    const anchor = el.nextSibling;
    el.remove();
    parent.insertBefore(el, anchor);
}

function typeInto(input: AparteComposerInput, text: string): void {
    const editor = input.querySelector('.aparte-ci-editor') as HTMLTextAreaElement | HTMLElement;
    if ('value' in editor) (editor as HTMLTextAreaElement).value = text;
    else editor.textContent = text;
    editor.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

describe('composer wiring across a reconnect', () => {
    it('the editor still reaches root.value after a move', () => {
        const { composer, input } = mount();
        typeInto(input, 'before');
        expect(composer.value, 'sanity: wired on first connect').toBe('before');

        reconnect(composer);
        typeInto(input, 'after the move');
        expect(composer.value, 'the reconnected editor still writes the draft').toBe('after the move');
    });

    it('the send button still hears its click after a move', () => {
        const { composer, send } = mount();
        const submit = vi.spyOn(composer, 'submit').mockImplementation(() => {});

        reconnect(composer);
        const button = send.querySelector('button') as HTMLButtonElement;
        button.disabled = false; // the click path is under test, not the gate
        button.click();
        expect(submit, 'the reconnected button still submits').toHaveBeenCalledTimes(1);
    });

    it('a move never doubles a binding: one input event, one value write', () => {
        const { composer, input } = mount();
        reconnect(composer);
        reconnect(composer);

        const spy = vi.fn();
        (composer as unknown as { _on: (e: string, cb: () => void) => void })._on('value-change', spy);
        typeInto(input, 'once');
        expect(spy, 'two moves later, one input still emits exactly one change').toHaveBeenCalledTimes(1);
    });
});
