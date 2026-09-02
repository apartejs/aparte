import { resolveConfig } from '../../config/index.js';
import type { AparteComposer } from './aparte-composer.js';
import { escapeAttr } from '../../utils/escape.js';
import { subscribeConfigChange } from '../../config/config-subscribe.js';

/**
 * File picker button for <aparte-composer>.
 *
 * Opens a native file picker on click, then pushes picked files to root.addAttachments().
 * Also sets up drag & drop on the nearest <aparte-composer> root.
 *
 * It only COLLECTS files: it never reads, uploads or renders them.
 * `<aparte-composer-attachments>` draws the pending strip, and sending is the host's job
 * (`event.detail.files` on `aparte-send`) — which is why the default `<aparte-chat>` shell
 * only includes this button when the `attachments` attribute is set. With nothing reading
 * the files, an attach button is an affordance core cannot honour (ratified decision #8).
 *
 * Drag & drop is installed on the composer ROOT, not on this button, so a drop anywhere
 * over the composer attaches and the root carries `aparte-is-dragover` while a drag is
 * over it. The dashed outline is drawn on `.aparte-composer-shell` when the markup has one
 * and on the composer element itself when it does not — width from
 * `--aparte-focus-outline-width`, colour from `--aparte-primary`, radius from
 * `--aparte-radius-input`, none of them declared here. The drop handler always calls
 * `preventDefault()`, even while disabled, so the browser can never navigate away to the
 * dropped file. `disabled` on the ROOT removes the drop target and greys the button;
 * `streaming` does neither — a file queued while a reply arrives is part of preparing
 * the next message, and only the send is gated meanwhile.
 *
 * The label and the icon are not attributes — they come from the config (`t('actionUpload')`
 * and the `paperclip` icon), so a locale or icon-provider change rewrites the existing
 * button in place instead of re-rendering it.
 *
 * A child already carrying `class="aparte-caa-button"` suppresses core's own render — and
 * core then wires nothing to it: no click listener (so no picker opens), and no label,
 * icon or disabled writes. Drag & drop still works, since it is installed on the
 * root regardless. Any other child is replaced on the first render. The file input itself
 * is never a child: it is created on `document.body` per click and removed again.
 *
 * @element aparte-composer-add-attachment
 *
 * @attr {string} accept - MIME types / extensions passed to the file input (e.g. "image/*,.pdf")
 * @attr {boolean} multiple - Allow multiple file selection (default: true)
 * @attr {boolean} disabled - Greys out the picker. Drops are gated by the composer root's
 *   `disabled`, not by this one.
 *
 * @cssprop [--aparte-input-action-btn-size=var(--aparte-btn-size-lg)] - Square size of the button. On a coarse
 *   pointer the stylesheet re-sets it to `--aparte-touch-target-size` (44px) on
 *   `.aparte-action-button` itself, which wins over a value inherited from your theme.
 * @cssprop [--aparte-input-action-btn-icon-size=20px] - Size of the `<svg>` inside it.
 * @cssprop [--aparte-radius-action-btn=var(--aparte-radius-sm)] - Corner radius.
 *
 * @example
 * <!-- Opt-in: nothing consumes the files unless your host does (an AparteClient, or
 *      your own listener reading `event.detail.files` off `aparte-send`). -->
 * <aparte-composer>
 *   <div class="aparte-composer-row">
 *     <aparte-composer-add-attachment accept="image/*,.pdf"></aparte-composer-add-attachment>
 *     <aparte-composer-input></aparte-composer-input>
 *     <aparte-composer-send></aparte-composer-send>
 *   </div>
 * </aparte-composer>
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
        // Bound here, never in _render — disconnect removes it and a reconnect's
        // _render keeps the existing DOM (see aparte-composer-input for the full
        // rule). The drag/drop pair below already lives on the right side.
        this._button = this.querySelector('.aparte-caa-button');
        this._button?.addEventListener('click', this._onClick);
        this._connectToRoot();
        this._setupDragDrop();
        this._unsubscribes.push(subscribeConfigChange(this, () => this._refreshChrome()));
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

    /**
     * Re-read the label and the icon on the button that already exists.
     *
     * Deliberately not a re-render: `_render()` returns early once the button is
     * there, and rebuilding it would drop focus if the user were on it — a locale or
     * icon change is not a reason to lose the keyboard.
     * The native file input and the drag listeners live outside this element
     * (on `document.body` and on the composer root), so they are untouched either way.
     */
    private _refreshChrome(): void {
        if (!this._button) return;
        const cfg = resolveConfig(this);
        const label = cfg.t('actionUpload') || 'Attach file';
        this._button.setAttribute('aria-label', label);
        this._button.setAttribute('title', label);
        this._button.innerHTML = cfg.getIcon('paperclip');
    }

    private _render(): void {
        if (this.querySelector('.aparte-caa-button')) return;

        const label = resolveConfig(this).t('actionUpload') || 'Attach file';
        const icon = resolveConfig(this).getIcon('paperclip');
        const disabled = this.hasAttribute('disabled') || this._getRoot()?.disabled || false;

        this.innerHTML = `<button
            class="aparte-btn aparte-btn--icon aparte-caa-button aparte-action-button"
            aria-label="${escapeAttr(label)}"
            title="${escapeAttr(label)}"
            type="button"
            ${disabled ? 'disabled' : ''}
        >${icon}</button>`;

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
                // Attaching is part of preparing the next message, which stays possible
                // while a reply streams; only `disabled` blocks it. `streaming` is read so
                // the subscription still refreshes the button when a turn ends.
                void streaming;
                if (this._button) this._button.disabled = root.disabled;
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
            if (root.disabled) return; // no drop target while disabled
            prevent(e);
            root.classList.add('aparte-is-dragover');
        };
        const onDragLeave = (e: Event) => { prevent(e); root.classList.remove('aparte-is-dragover'); };
        const onDrop = (e: DragEvent) => {
            prevent(e); // always block the browser from navigating to the dropped file
            root.classList.remove('aparte-is-dragover');
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

}

if (!customElements.get('aparte-composer-add-attachment')) {
    customElements.define('aparte-composer-add-attachment', AparteComposerAddAttachment);
}
