import { escapeAttr } from './escape.js';

/**
 * The one class every control core renders wears, and the only place the shared
 * icon-button look is attached.
 *
 * It replaces `.aparte-action-button`, which said "action" while sitting on the
 * attach button, the composer action, and nothing in the bubble's action bar —
 * where `.aparte-action-btn`, one letter apart, meant something else entirely.
 */
export const APARTE_CONTROL_CLASS = 'aparte-control';

/**
 * How a control names its own class.
 *
 * **The rule: for an element `<aparte-X>`, its internal parts are `.aparte-X__part`.**
 * Derivable from the tag, so nothing has to be invented when a component is added and
 * nothing has to be looked up when one is themed.
 *
 * It was invented five times before it was written down. The composer's parts wore
 * `.aparte-cs-button`, `.aparte-cc-button`, `.aparte-caa-button`, `.aparte-cact-button`
 * and `.aparte-ci-editor` — initialisms of the tag that only their author could expand,
 * on classes that are *contractual*: each element does `if (this.querySelector(...)) return;`,
 * so that exact string is how a consumer suppresses core's own render. A published
 * contract nobody can spell is not a contract.
 *
 * A conventional abbreviation is fine and stays (`btn` in `--aparte-radius-action-btn`,
 * `nav`, `img`): the line is whether a reader who has never seen the code can expand it.
 */
export interface AparteControlSpec {
  /** Element-scoped class, e.g. `aparte-composer-send__button`. */
  part: string;
  /** Accessible name. Lands on both `aria-label` and `title`. */
  label: string;
  /**
   * Icon markup — provider SVG, or a consumer's trusted `icon` attribute.
   * Interpolated verbatim: escaping it would print the source instead of the glyph.
   * Every caller in core passes provider output or markup already documented as trusted.
   */
  icon?: string;
  disabled?: boolean;
  hidden?: boolean;
  /**
   * Wear the shared icon-button look on top of `part`.
   *
   * Opt-in, and deliberately not the default: `.aparte-control` sets a transparent
   * background, and its rule sits *after* the send button's in the stylesheet — so
   * applying it to every control would have quietly stripped the one filled button in
   * the composer of its primary background. A borderless icon button and a filled
   * primary button are two looks; only the first is shared.
   */
  look?: 'icon';
  /** Extra classes, typically BEM modifiers of `part` (`…__action--save`). */
  modifiers?: readonly string[];
  /** `data-*` attributes. Values are escaped. */
  data?: Readonly<Record<string, string>>;
}

/** The full class attribute for a control: its part, the shared look if asked, its modifiers. */
export function controlClassList(spec: AparteControlSpec): string {
  return [spec.part, ...(spec.look === 'icon' ? [APARTE_CONTROL_CLASS] : []), ...(spec.modifiers ?? [])].join(' ');
}

/**
 * A control as markup, for the render paths that build a subtree with `innerHTML`.
 *
 * `type="button"` is not optional and is the reason this exists as much as the naming
 * is: a `<button>` inside a form defaults to `type="submit"`, and **fourteen** of core's
 * controls had shipped without it — so a composer or a bubble dropped inside a
 * consumer's `<form>` submitted it on every copy, retry or branch click.
 */
export function controlMarkup(spec: AparteControlSpec): string {
  const attrs = Object.entries(spec.data ?? {})
    .map(([k, v]) => ` data-${k}="${escapeAttr(v)}"`)
    .join('');
  // Escaped rather than exempted. Every caller in core passes a module constant, so
  // nothing attacker-controlled reaches it today — but `part` is a plain string on a
  // published interface, and an exemption is a promise about callers that do not exist yet.
  const cls = escapeAttr(controlClassList(spec));
  const icon = spec.icon ?? '';  // safe-text: provider SVG, or markup the consumer declared trusted — see the field's doc.
  return (
    `<button type="button" class="${cls}"`
    + ` aria-label="${escapeAttr(spec.label)}" title="${escapeAttr(spec.label)}"${attrs}`
    + `${spec.disabled ? ' disabled' : ''}${spec.hidden ? ' hidden' : ''}`
    + `>${icon}</button>`
  );
}

/**
 * A control as a DOM node, for the paths that append rather than stamp.
 *
 * Attributes are set rather than interpolated, so a consumer-provided label cannot
 * inject markup — which is why the bubble's custom actions build DOM in the first place.
 */
export function createControl(spec: AparteControlSpec): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = controlClassList(spec);
  button.setAttribute('aria-label', spec.label);
  button.setAttribute('title', spec.label);
  for (const [k, v] of Object.entries(spec.data ?? {})) button.dataset[k] = v;
  if (spec.disabled) button.disabled = true;
  if (spec.hidden) button.hidden = true;
  // safe-text: same contract as controlMarkup — provider SVG or declared-trusted markup.
  if (spec.icon) button.innerHTML = spec.icon;
  return button;
}
