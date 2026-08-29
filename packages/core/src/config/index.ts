export { aparteGlobalConfig, AparteConfig, APARTE_DEFAULT_BUBBLE_ACTIONS, APARTE_DEFAULT_HOST_HANDLERS } from './aparte-config.js';
export { resolveConfig, attachConfig, detachConfig, runWithConfig, contextConfig, APARTE_HOST_ATTR } from './config-context.js';
// Exported, not internal: a consumer writing their own element needs the same
// hook the built-ins use, or "bring your own component" means "and reimplement
// the scope rule" (ratified decision #9a — a capability is never hostage to a
// class the guide told you not to construct).
export { subscribeConfigChange, APARTE_CONFIG_CHANGE } from './config-subscribe.js';
export type { AparteConfigAware } from './config-context.js';
export type { AparteConfigChangeEventDetail, AparteMarkdownProvider, AparteStreamingMarkdownProvider, AparteStreamingMarkdownRenderer, AparteHighlightProvider, AparteSystemPromptVarsProvider, AparteModelPreference, AparteModelPreferenceProvider } from './aparte-config.js';
export type { AparteSanitizer } from './sanitize.js';
export { defaultSanitizer, isSafeUrl } from './sanitize.js';
export type { AparteIconProvider, AparteIconName } from './icon-provider.js';
export { APARTE_DEFAULT_ICON_FALLBACKS } from './icon-provider.js';
export type { AparteAvatarProvider } from './avatar-provider.js';
export type { AparteStatusRenderer } from './status-renderer.js';
export type { AparteErrorRenderer } from './error-renderer.js';
export type { AparteAttachmentRenderer } from './attachment-renderer.js';
export type {
    AparteElicitationFieldRenderer,
    AparteElicitationFieldContext,
    AparteElicitationFieldControl,
} from './elicitation-field-renderer.js';
export type { AparteSiblingNavRenderer } from './sibling-nav-renderer.js';
export type { AparteBubbleShellRenderer } from './bubble-shell-renderer.js';
export type { AparteLocale, AparteLocaleExtensions } from './locale.js';
export { APARTE_DEFAULT_LOCALE } from './locale.js';
export type { AparteAction, AparteActionZone } from './action-provider.js';
