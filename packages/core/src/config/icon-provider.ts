/**
 * Icon Provider Interface
 * 
 * Defines the contract for icon plugins.
 * Returns HTML strings: SVG, <i> tags, emojis, or any valid HTML.
 * 
 * @example
 * // Using default plugin
 * import { setupDefaultIcons } from '@aparte/plugin-icons-default';
 * setupDefaultIcons();
 * 
 * // Using FontAwesome
 * AparteConfig.setIconProvider({
 *   copy: () => '<i class="fas fa-copy"></i>',
 *   check: () => '<i class="fas fa-check"></i>',
 *   // ...
 * });
 */
export interface AparteIconProvider {
    /** Copy button icon */
    copy: () => string;
    /** Success/check icon */
    check: () => string;
    /** Send message icon */
    send: () => string;
    /** Loading/spinner indicator */
    loading: () => string;
    /** Error indicator */
    error: () => string;
    /** Expand/show more icon */
    expand: () => string;
    /** Collapse/show less icon */
    collapse: () => string;
    /** Terminal/command prompt icon */
    terminal: () => string;
    /** File attachment / paperclip icon (used by upload plugin) */
    paperclip: () => string;
    /** Image file icon (used by upload plugin) */
    image: () => string;
    /** Generic file icon (used by upload plugin) */
    file: () => string;
    /** Scroll to bottom button icon */
    scrollDown: () => string;
    /** Retry / regenerate icon */
    retry: () => string;
    /** Edit / pencil icon */
    edit: () => string;
    /** Thumbs up / positive feedback icon */
    thumbUp: () => string;
    /** Thumbs down / negative feedback icon */
    thumbDown: () => string;
    /** Previous branch arrow */
    prevBranch: () => string;
    /** Next branch arrow */
    nextBranch: () => string;
    /** Tool call indicator (wrench) — optional so existing providers stay valid */
    tool?: () => string;
    /** Close / failed / rejected (✕) — optional so existing providers stay valid */
    close?: () => string;
    /** Stop / halt streaming (■) — optional so existing providers stay valid */
    stop?: () => string;
}

/** Icon names available in the provider */
export type AparteIconName = keyof AparteIconProvider;

/** Default textual fallbacks - zero dependency */
export const DEFAULT_ICON_FALLBACKS: Record<AparteIconName, string> = {
    copy: 'Copy',
    check: '✓',
    send: 'Send',
    loading: '...',
    error: '!',
    expand: '▼',
    collapse: '▲',
    terminal: '>_',
    paperclip: '📎',
    image: '🖼️',
    file: '📄',
    scrollDown: '↓',
    retry: '↺',
    edit: '✎',
    thumbUp: '👍',
    thumbDown: '👎',
    prevBranch: '‹',
    nextBranch: '›',
    tool: '🔧',
    close: '✕',
    stop: '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2"/></svg>',
};
