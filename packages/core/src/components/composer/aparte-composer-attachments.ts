import type { AparteComposer } from './aparte-composer.js';

/** ✗ glyph for the hover remove button. */
const REMOVE_ICON =
    '<svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">' +
    '<path d="M9.5 3.205 8.795 2.5 6 5.295 3.205 2.5 2.5 3.205 5.295 6 2.5 8.795l.705.705' +
    'L6 6.705l2.795 2.795.705-.705L6.705 6z"/></svg>';

/**
 * @element aparte-composer-attachments
 *
 * Renders a square thumbnail tile for each file attached to the root composer.
 * Image files show the actual picture; other files show an extension badge.
 * The filename and a remove (✗) button surface on hover; clicking an image
 * opens it full-size (dispatches `aparte-attachment-preview`).
 * Automatically hidden when there are no attachments.
 * Must be a descendant of <aparte-composer>.
 */
export class AparteComposerAttachments extends HTMLElement {
    private _unsubscribes: (() => void)[] = [];
    /** Object URLs minted for image previews — revoked on re-render/disconnect. */
    private _objectUrls: string[] = [];

    connectedCallback(): void {
        this._render([]);
        this._connectToRoot();
    }

    disconnectedCallback(): void {
        this._unsubscribes.forEach(fn => fn());
        this._unsubscribes = [];
        this._revokeUrls();
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private _getRoot(): AparteComposer | null {
        return this.closest('aparte-composer') as AparteComposer | null;
    }

    private _connectToRoot(): void {
        const root = this._getRoot();
        if (!root) return;

        this._unsubscribes.push(
            root._on('attachments-change', ({ attachments }) => this._render(attachments))
        );

        // Sync initial state
        this._render(root.attachments);
    }

    /** Release the previous render's blob URLs so they don't leak. */
    private _revokeUrls(): void {
        this._objectUrls.forEach(url => URL.revokeObjectURL(url));
        this._objectUrls = [];
    }

    private _render(files: File[]): void {
        this.hidden = files.length === 0;
        // Free the previous render's preview URLs before minting new ones.
        this._revokeUrls();

        this.innerHTML = files.map((file) => {
            const name = this._escape(file.name);
            const remove =
                `<button class="aparte-thumb__remove" type="button" ` +
                `aria-label="Remove ${name}">${REMOVE_ICON}</button>`;

            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                this._objectUrls.push(url);
                return `<div class="aparte-thumb aparte-thumb--image" title="${name}">` +
                    `<img class="aparte-thumb__img" src="${url}" alt="${name}" />` +
                    `<span class="aparte-thumb__name">${name}</span>${remove}</div>`;
            }
            return `<div class="aparte-thumb aparte-thumb--file" title="${name}">` +
                `<span class="aparte-thumb__ext">${this._escape(this._ext(file.name))}</span>` +
                `<span class="aparte-thumb__name">${name}</span>${remove}</div>`;
        }).join('');

        // Remove buttons — every file has exactly one tile, so the button
        // index lines up with the attachments index.
        this.querySelectorAll('.aparte-thumb__remove').forEach((btn, i) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const root = this._getRoot();
                if (root) root.removeAttachment(root.attachments[i]!);
            });
        });

        // Image tiles → open the full-size preview lightbox.
        this.querySelectorAll('.aparte-thumb--image').forEach(tile => {
            tile.addEventListener('click', () => {
                const img = tile.querySelector('.aparte-thumb__img') as HTMLImageElement | null;
                if (!img) return;
                this.dispatchEvent(new CustomEvent('aparte-attachment-preview', {
                    bubbles: true,
                    composed: true,
                    detail: { url: img.src, name: tile.getAttribute('title') ?? '' },
                }));
            });
        });
    }

    /** Uppercased file extension (≤4 chars), or 'FILE' when there is none. */
    private _ext(filename: string): string {
        const dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.slice(dot + 1).toUpperCase().slice(0, 4) : 'FILE';
    }

    private _escape(str: string): string {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
}

if (!customElements.get('aparte-composer-attachments')) {
    customElements.define('aparte-composer-attachments', AparteComposerAttachments);
}
