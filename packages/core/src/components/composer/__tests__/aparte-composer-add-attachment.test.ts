// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import '../aparte-composer.js';
import '../aparte-composer-add-attachment.js';

function mount(disabled = false) {
    const composer = document.createElement('aparte-composer');
    if (disabled) composer.setAttribute('disabled', '');
    document.body.appendChild(composer);
    const btn = document.createElement('aparte-composer-add-attachment');
    composer.appendChild(btn); // connectedCallback wires drag-drop on the root
    const add = vi.spyOn(composer as unknown as { addAttachments: (f: FileList) => void }, 'addAttachments')
        .mockImplementation(() => {});
    return { composer, add };
}

function dropFile(target: HTMLElement) {
    const e = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
    e.dataTransfer = { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] };
    target.dispatchEvent(e);
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('aparte-composer-add-attachment — drag-drop respects disabled', () => {
    it('attaches a dropped file when enabled', () => {
        const { composer, add } = mount(false);
        dropFile(composer);
        expect(add).toHaveBeenCalledTimes(1);
    });

    it('does NOT attach a dropped file while the composer is disabled', () => {
        const { composer, add } = mount(true);
        dropFile(composer);
        expect(add).not.toHaveBeenCalled();
    });
});
