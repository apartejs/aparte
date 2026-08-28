import type { AparteComposer } from './aparte-composer.js';
import { resolveConfig } from '../../config/config-context.js';
import { escapeAttr, escapeHtml } from '../../utils/escape.js';


/**
 * Renders a square thumbnail tile for each file attached to the root composer.
 *
 * Image files show the actual picture; other files show an extension badge.
 * The filename and a remove (✗) button surface on hover. Clicking an image asks
 * the app to open it full-size (`aparte-attachment-preview`) — only when the app
 * declared `attachmentPreview` via `aparteGlobalConfig.setHostHandlers()`.
 * Automatically hidden when there are no attachments. It reads the nearest
 * <aparte-composer> ancestor; without one it renders nothing and stays hidden.
 *
 * This is the PENDING strip: what the user has attached and not yet sent. It mirrors
 * `composer.attachments` and rewrites itself on every `attachments-change` — it is not the
 * strip under a sent message, which the bubble draws with the same `.aparte-thumb` tile
 * rules (minus the remove button), so a tile variable set at the theme root reaches both
 * strips, while one set on this element reaches only this one. It owns its `innerHTML` and
 * therefore projects nothing:
 * children written inside it are discarded on the first render. Removing a tile calls
 * `root.removeAttachment()` rather than mutating a list of its own, and the image previews
 * are blob URLs minted per render and revoked on the next one and on disconnect.
 *
 * @element aparte-composer-attachments
 *
 * @fires {CustomEvent<AparteAttachmentPreviewEventDetail>} aparte-attachment-preview - An attached image was clicked; the app opens it full-size, and only if it declared `attachmentPreview`.
 *
 * @cssprop [--aparte-attachments-max-height=140px] - Height cap on the strip; past it the
 *   tiles scroll instead of pushing the composer up.
 * @cssprop [--aparte-attachment-image-size=56px] - Tile edge. The stylesheet sets 56px on
 *   this element (the `:root` default is 72px, and the sent-message strip re-sets 40px on
 *   itself), so a theme-level value reaches neither strip — target
 *   `aparte-composer-attachments` to resize these tiles.
 * @cssprop [--aparte-thumb-radius=var(--aparte-radius-lg)] - Tile corner radius.
 * @cssprop [--aparte-attachment-chip-bg=var(--aparte-surface-2)] - Tile background, seen
 *   behind a non-image file.
 * @cssprop [--aparte-attachment-chip-border=var(--aparte-border)] - Tile border colour.
 * @cssprop [--aparte-thumb-name-color=#ffffff] - Filename colour on the hover overlay.
 * @cssprop [--aparte-thumb-name-scrim=linear-gradient(to top, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0))] - Background behind the filename; a bottom-up black
 *   gradient by default, so the name stays legible over any picture.
 * @cssprop [--aparte-thumb-name-padding=14px 5px 4px] - Padding of that overlay.
 * @cssprop [--aparte-thumb-remove-size=18px] - Diameter of the ✗ button.
 * @cssprop [--aparte-thumb-remove-inset=3px] - Its inset from the tile's top and right
 *   edges (physical `right`, so it does not flip in a right-to-left locale).
 * @cssprop [--aparte-thumb-remove-bg=rgba(0, 0, 0, 0.6)] - Its background.
 * @cssprop [--aparte-thumb-remove-bg-hover=rgba(0, 0, 0, 0.85)] - Its hover background.
 * @cssprop [--aparte-thumb-remove-color=#ffffff] - Its glyph colour.
 *
 * @example
 * <!-- The strip hides itself while nothing is attached. Pair it with the picker, and
 *      only if your loop actually reads the files from the send event. -->
 * <aparte-composer>
 *   <div class="aparte-composer-shell">
 *     <aparte-composer-attachments></aparte-composer-attachments>
 *     <div class="aparte-composer-row">
 *       <aparte-composer-add-attachment></aparte-composer-add-attachment>
 *       <aparte-composer-input style="flex: 1"></aparte-composer-input>
 *       <aparte-composer-send></aparte-composer-send>
 *     </div>
 *   </div>
 * </aparte-composer>
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
            const name = escapeHtml(file.name);
            const remove =
                `<button class="aparte-btn aparte-btn--icon aparte-btn--sm aparte-thumb__remove" type="button" ` +
                `aria-label="Remove ${name}">${resolveConfig(this).getIcon('close')}</button>`;

            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                this._objectUrls.push(url);
                return `<div class="aparte-thumbnail aparte-thumb aparte-thumb--image" title="${name}">` +
                    `<img class="aparte-thumb__img" src="${escapeAttr(url)}" alt="${name}" />` +
                    `<span class="aparte-thumb__name">${name}</span>${remove}</div>`;
            }
            return `<div class="aparte-thumbnail aparte-thumb aparte-thumb--file" title="${name}">` +
                `<span class="aparte-thumb__ext">${escapeHtml(this._ext(file.name))}</span>` +
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

        // Image tiles ask for the full-size preview — only when the app declared it
        // opens one (same rule as the sent-message strip in the bubble).
        if (!resolveConfig(this).getHostHandlers().attachmentPreview) return;
        this.querySelectorAll('.aparte-thumb--image').forEach(tile => {
            tile.setAttribute('role', 'button');
            tile.setAttribute('tabindex', '0');
            const open = (): void => {
                const img = tile.querySelector('.aparte-thumb__img') as HTMLImageElement | null;
                if (!img) return;
                this.dispatchEvent(new CustomEvent('aparte-attachment-preview', {
                    bubbles: true,
                    composed: true,
                    detail: { url: img.src, name: tile.getAttribute('title') ?? '' },
                }));
            };
            tile.addEventListener('click', open);
            tile.addEventListener('keydown', (e) => {
                const key = (e as KeyboardEvent).key;
                if (key !== 'Enter' && key !== ' ') return;
                e.preventDefault();
                open();
            });
        });
    }

    /** Uppercased file extension (≤4 chars), or 'FILE' when there is none. */
    private _ext(filename: string): string {
        const dot = filename.lastIndexOf('.');
        return dot > 0 ? filename.slice(dot + 1).toUpperCase().slice(0, 4) : 'FILE';
    }
}

if (!customElements.get('aparte-composer-attachments')) {
    customElements.define('aparte-composer-attachments', AparteComposerAttachments);
}
