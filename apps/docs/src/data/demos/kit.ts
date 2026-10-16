/**
 * The Kit group's variants. Each family's hero is the example its own stylesheet carries in its
 * header — the markup the maintainer chose, read from the generated kit data — so a page and the
 * sheet never show two different examples. The variants below it are written here.
 * See ./types.ts for how a demo is read.
 */
import kit from '../../generated/api/kit.json';
import type { DemoEntry } from './types';

/** Families that have a page in the Layout group, with their own demos. */
const LAYOUT = new Set(['app-shell', 'app-header', 'sidebar', 'split']);

/** The glyphs core draws, as `<aparte-icon>` takes them. */
const GLYPHS = ['copy', 'check', 'send', 'loading', 'error', 'expand', 'collapse', 'terminal', 'paperclip', 'image', 'file', 'scrollDown', 'retry', 'edit', 'thumbUp', 'thumbDown', 'prevBranch', 'nextBranch', 'tool', 'close', 'stop', 'pause', 'info', 'archive', 'unarchive', 'download', 'more', 'pin', 'trash', 'menu', 'alertTriangle'];

const FROM_SHEETS: DemoEntry[] = (kit as { id: string; name: string; example: string }[])
    .filter((family) => family.example && !LAYOUT.has(family.id))
    .map((family) => ({ id: `kit-${family.id}`, title: family.name, html: family.example }));

export const KIT_DEMOS: DemoEntry[] = [
    ...FROM_SHEETS,

    // ── Button ────────────────────────────────────────────────────────────────
    {
        id: 'kit-button-styles',
        title: 'Five styles, on any tone',
        html: `<!-- A style (solid, soft, outline, surface, ghost) and a tone (primary, neutral, danger…) combine freely. -->
<p>
  <button class="aparte-btn aparte-btn--primary aparte-btn--solid" type="button">Solid</button>
  <button class="aparte-btn aparte-btn--primary aparte-btn--soft" type="button">Soft</button>
  <button class="aparte-btn aparte-btn--primary aparte-btn--outline" type="button">Outline</button>
  <button class="aparte-btn aparte-btn--surface" type="button">Surface</button>
  <button class="aparte-btn aparte-btn--ghost" type="button">Ghost</button>
</p>
<p>
  <button class="aparte-btn aparte-btn--success aparte-btn--soft" type="button">Success</button>
  <button class="aparte-btn aparte-btn--warning aparte-btn--soft" type="button">Warning</button>
  <button class="aparte-btn aparte-btn--danger aparte-btn--soft" type="button">Danger</button>
  <button class="aparte-btn aparte-btn--info aparte-btn--soft" type="button">Info</button>
  <button class="aparte-btn aparte-btn--neutral aparte-btn--soft" type="button">Neutral</button>
</p>`,
    },
    {
        id: 'kit-button-sizes',
        title: 'Sizes and shapes',
        html: `<p>
  <button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button">Small</button>
  <button class="aparte-btn aparte-btn--surface" type="button">Medium</button>
  <button class="aparte-btn aparte-btn--surface aparte-btn--lg" type="button">Large</button>
  <button class="aparte-btn aparte-btn--surface aparte-btn--xl" type="button">Extra large</button>
</p>
<p>
  <button class="aparte-btn aparte-btn--primary aparte-btn--solid aparte-btn--pill" type="button">Pill</button>
  <button class="aparte-btn aparte-btn--primary aparte-btn--solid aparte-btn--circle aparte-btn--icon" type="button" aria-label="Send"><aparte-icon name="send"></aparte-icon></button>
</p>
<button class="aparte-btn aparte-btn--primary aparte-btn--solid aparte-btn--block" type="button">Block, the full width</button>`,
    },

    // ── Field ─────────────────────────────────────────────────────────────────
    {
        id: 'kit-field-states',
        title: 'Sizes, an error, a disabled field',
        html: `<!-- An error is aria-invalid on the field and a message it points to. -->
<label class="aparte-field-label" for="key">API key</label>
<input id="key" class="aparte-field" value="sk-..." aria-invalid="true" aria-describedby="key-error" />
<p class="aparte-field-error" id="key-error">This key was rejected by the provider.</p>

<div class="aparte-field-row">
  <input class="aparte-field aparte-field--sm" placeholder="Small" />
  <input class="aparte-field" placeholder="Medium" />
  <input class="aparte-field aparte-field--lg" placeholder="Large" />
</div>
<input class="aparte-field" placeholder="Disabled" disabled />`,
    },
    {
        id: 'kit-field-choices',
        title: 'Choices as cards',
        html: `<fieldset class="aparte-fieldset">
  <legend class="aparte-field-label">Where the key lives</legend>
  <label class="aparte-field-choice aparte-field-choice--boxed aparte-field-choice--selected">
    <input type="radio" name="where" class="aparte-radio" checked />
    <span class="aparte-field-choice__body">In the browser<span class="aparte-field-hint">For prototypes and local models.</span></span>
  </label>
  <label class="aparte-field-choice aparte-field-choice--boxed">
    <input type="radio" name="where" class="aparte-radio" />
    <span class="aparte-field-choice__body">On your server<span class="aparte-field-hint">For production.</span></span>
  </label>
</fieldset>`,
    },

    // ── Select ────────────────────────────────────────────────────────────────
    {
        id: 'select',
        title: 'A select',
        html: `<aparte-select placeholder="Pick a format" value="md" style="max-width: 16rem">
  <aparte-option value="md">Markdown</aparte-option>
  <aparte-option value="pdf">PDF</aparte-option>
  <aparte-option value="html">Web page</aparte-option>
</aparte-select>`,
    },
    {
        id: 'select-grouped',
        title: 'Groups and a search field',
        html: `<!-- searchable adds a filter field; an optgroup labels a band of options. -->
<aparte-select placeholder="Pick a model" searchable style="max-width: 16rem">
  <aparte-optgroup label="Cloud">
    <aparte-option value="large">Large</aparte-option>
    <aparte-option value="fast">Fast</aparte-option>
  </aparte-optgroup>
  <aparte-optgroup label="In the browser">
    <aparte-option value="small">Small, offline</aparte-option>
    <aparte-option value="tiny" disabled>Tiny (not downloaded)</aparte-option>
  </aparte-optgroup>
</aparte-select>`,
    },

    // ── Icon ──────────────────────────────────────────────────────────────────
    {
        id: 'icon-set',
        title: 'Every glyph core draws',
        html: `<!-- Each tile is <aparte-icon name="…">. -->
<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr)); gap: var(--aparte-space-3)">
${GLYPHS.map((name) => `  <span class="aparte-tag"><aparte-icon name="${name}"></aparte-icon><span class="aparte-tag__label">${name}</span></span>`).join('\n')}
</div>`,
    },

    // ── Spinner ───────────────────────────────────────────────────────────────
    {
        id: 'progress-spinner',
        title: 'A spinner that can show progress',
        html: `<!-- Without value it spins; with one, the ring fills to it. --aparte-spinner-size sets its size. -->
<div style="display: flex; gap: var(--aparte-space-6); --aparte-spinner-size: 2rem">
  <aparte-progress-spinner></aparte-progress-spinner>
  <aparte-progress-spinner value="25"></aparte-progress-spinner>
  <aparte-progress-spinner value="62"></aparte-progress-spinner>
  <aparte-progress-spinner value="100"></aparte-progress-spinner>
</div>`,
    },

    // ── Mark ──────────────────────────────────────────────────────────────────
    {
        id: 'kit-mark',
        title: 'The tint of a settled choice',
        html: `<!-- The tint core puts on a chosen option, the active conversation, an answered question,
     on an element of yours. One class, one intent per outcome. -->
<p>
  <span class="aparte-tag aparte-mark">Chosen</span>
  <span class="aparte-tag aparte-mark aparte-mark--success">Approved: write_file</span>
  <span class="aparte-tag aparte-mark aparte-mark--danger">Rejected: delete_file</span>
  <span class="aparte-tag aparte-mark aparte-mark--neutral">The conversation you are in</span>
  <span class="aparte-tag aparte-mark aparte-mark--quiet">Declined: ask_user</span>
</p>
<!-- The start-edge bar is off by default; a theme puts it back with one variable. -->
<p style="--aparte-mark-bar: 3px">
  <span class="aparte-tag aparte-mark">Chosen</span>
  <span class="aparte-tag aparte-mark aparte-mark--success">Approved: write_file</span>
</p>`,
    },
];
