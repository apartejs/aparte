/**
 * Aparte Theming
 * CSS Custom Properties interfaces for theming
 */

// ─────────────────────────────────────────────────────────────────────────────
// Theme Variables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSS Custom Properties available for theming
 * All properties are optional - defaults are applied in components
 */
export interface AparteThemeVariables {
    // Primary colors
    '--aparte-primary'?: string;
    '--aparte-primary-hover'?: string;
    '--aparte-secondary'?: string;
    '--aparte-neutral'?: string;

    // Bubble styling
    '--aparte-message-content-bg-user'?: string;
    '--aparte-message-content-bg-assistant'?: string;
    '--aparte-message-content-text-user'?: string;
    '--aparte-message-content-text-assistant'?: string;
    '--aparte-message-content-radius'?: string;
    '--aparte-message-content-radius-corner'?: string;
    '--aparte-message-content-padding'?: string;
    '--aparte-message-content-max-width'?: string;
    '--aparte-message-content-font-size'?: string;

    // Input styling
    '--aparte-input-bg'?: string;
    '--aparte-input-border'?: string;
    '--aparte-input-text'?: string;
    '--aparte-input-placeholder'?: string;
    '--aparte-input-focus-border'?: string;
    '--aparte-input-focus-ring'?: string;
    '--aparte-input-radius'?: string;
    '--aparte-input-font-size'?: string;
    '--aparte-input-disabled-bg'?: string;

    // Layout
    '--aparte-viewport-padding'?: string;
    '--aparte-message-gap'?: string;
    '--aparte-input-padding'?: string;

    // Typography
    '--aparte-font-family'?: string;
    '--aparte-timestamp-font-size'?: string;

    // Status indicator
    '--aparte-status-color'?: string;
    '--aparte-status-font-size'?: string;
    '--aparte-status-dot-size'?: string;
    '--aparte-status-padding'?: string;

    // Button styling
    '--aparte-button-radius'?: string;
    '--aparte-button-text'?: string;
}
