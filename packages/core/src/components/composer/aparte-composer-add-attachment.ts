import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';

/**
 * @element aparte-composer-add-attachment
 *
 * File picker button for <aparte-composer>.
 * Opens a native file picker on click, then pushes picked files to root.addAttachments().
 * Also sets up drag & drop on the nearest <aparte-composer> root.
 *
 * @attr accept    - MIME types / extensions passed to the file input (e.g. "image/*,.pdf")
 * @attr multiple  - Allow multiple file selection (default: true)
 */
export class AparteComposerAddAttachment extends HTMLElement {
    private _button: HTMLButtonElement | null = null;
    private _dragCleanup: (() => void) | null = null;
    private _unsubscribes: (() => void)[] = [];

    // Bound handler
    private _onClick = this._handleClick.bind(this);

    static get observedAttributes(): string[] {
        return ['accept', 'multiple', 'disabled'];
    }

    connectedCallback(): void {
        this._render();
        this._connectToRoot();
        this._setupDragDrop();
    }

    disconnectedCallback(): void {
        this._button?.removeEventListener('click', this._onClick);
        this._dragCleanup?.();
        this._unsubscribes.forEach(fn => fn());
        this._unsubscribes = [];
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
        if (name === 'disabled' && this._button) {
            this._button.disabled = value !== null;
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _getRoot(): AparteComposer | null {
        return this.closest('aparte-composer') as AparteComposer | null;
    }

    private _render(): void {
        if (this.querySelector('.aparte-caa-button')) return;

        const label = resolveConfig(this).t('actionUpload' as any) || 'Attach file';
        const icon = resolveConfig(this).getIcon('paperclip' as any) || this._defaultIcon();
        const disabled = this.hasAttribute('disabled') || this._getRoot()?.disabled || false;

        this.innerHTML = `<button
            class="aparte-caa-button aparte-action-button"
            aria-label="${label}"
            title="${label}"
            type="button"
            ${disabled ? 'disabled' : ''}
        >${icon}</button>`;

        this._button = this.querySelector('.aparte-caa-button');
        this._button?.addEventListener('click', this._onClick);
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('disabled-change', ({ disabled }) => {
                if (this._button) this._button.disabled = disabled;
            })
        );
        this._unsubscribes.push(
            root._on('streaming-change', ({ streaming }) => {
                if (this._button) this._button.disabled = streaming || root.disabled;
            })
        );
    }

    private _handleClick(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = !this.hasAttribute('multiple') || this.getAttribute('multiple') !== 'false';
        const accept = this.getAttribute('accept');
        if (accept) input.accept = accept;
        input.style.display = 'none';

        document.body.appendChild(input);
        input.addEventListener('change', () => {
            if (input.files?.length) this._getRoot()?.addAttachments(input.files);
            document.body.removeChild(input);
        }, { once: true });
        input.click();
    }

    private _setupDragDrop(): void {
        const root = this._getRoot();
        if (!root) return;

        const prevent = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
        const onDragOver = (e: Event) => {
            if (root.disabled) return; // no drop target while disabled (e.g. streaming)
            prevent(e);
            root.classList.add('is-dragover');
        };
        const onDragLeave = (e: Event) => { prevent(e); root.classList.remove('is-dragover'); };
        const onDrop = (e: DragEvent) => {
            prevent(e); // always block the browser from navigating to the dropped file
            root.classList.remove('is-dragover');
            if (root.disabled) return; // don't attach while disabled (the add button is blocked too)
            const files = e.dataTransfer?.files;
            if (files?.length) this._getRoot()?.addAttachments(files);
        };

        root.addEventListener('dragover', onDragOver);
        root.addEventListener('dragleave', onDragLeave);
        root.addEventListener('drop', onDrop);

        this._dragCleanup = () => {
            root.removeEventListener('dragover', onDragOver);
            root.removeEventListener('dragleave', onDragLeave);
            root.removeEventListener('drop', onDrop);
        };
    }

    private _defaultIcon(): string {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    }
}

if (!customElements.get('aparte-composer-add-attachment')) {
    customElements.define('aparte-composer-add-attachment', AparteComposerAddAttachment);
}
