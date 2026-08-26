/**
 * AparteCore Primitives
 * 
 * Reusable UI components that all plugins can use.
 */

// Button — the element over `.aparte-control`; the class works without it.
export { AparteButton, type AparteButtonClickEventDetail } from './button/index.js';

// Select
export { AparteSelect, AparteOption, AparteOptgroup, type AparteSelectChangeDetail, type AparteOptgroupToggleEventDetail } from './select/index.js';

// Progress Spinner
export { AparteProgressSpinner } from './progress-spinner/index.js';
