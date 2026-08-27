/**
 * `@aparte/core/icons` — every glyph aparté draws, plus a set it does not.
 *
 *     import { searchIcon, trashIcon } from '@aparte/core/icons';
 *     button.innerHTML = searchIcon;
 *
 * A SEPARATE ENTRY POINT, not an addition to the main one, and the reason is mechanical.
 * `getIcon(name)` reads `APARTE_DEFAULT_ICON_FALLBACKS` by a computed key, so a bundler
 * cannot tell which of its entries a build reaches and keeps the object whole: anything
 * put there ships to everyone, used or not. Here each glyph is its own export, and a
 * consumer who never imports this module gets none of them. That is ratified decision
 * #9(b) — weight is controlled by an entry point, never by a flag.
 *
 * The glyphs are strings of SVG, so they need no runtime and no framework. Every one
 * carries `class="aparte-icon"`, which means `--aparte-icon-size` sizes it wherever it
 * lands; the stylesheet already loaded with `@aparte/core` supplies that rule.
 *
 * To put one behind a name core itself draws, hand it to an icon provider:
 *
 *     aparteGlobalConfig.setIconProvider({ retry: () => historyIcon });
 */

export * from './glyphs.js';
export * from './extended.js';
