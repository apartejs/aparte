/**
 * Skeleton Provider Interface
 * 
 * Defines the contract for skeleton/loading state plugins.
 * Returns HTML strings for various loading states.
 * 
 * @example
 * // Register a skeleton provider (e.g. an Angular ngx-skeleton-loader bridge)
 * aparteGlobalConfig.setSkeletonProvider({
 *   message: () => '<ngx-skeleton-loader count="3"></ngx-skeleton-loader>',
 *   code: () => '<ngx-skeleton-loader appearance="line" count="5"></ngx-skeleton-loader>',
 *   // ...
 * });
 */

/** Skeleton types available in the provider */
export type AparteSkeletonType =
    | 'message'   // Chat message loading state
    | 'code'      // Code block loading state
    | 'thinking'  // AI thinking indicator
    | 'input'     // Input field loading
    | 'list'      // List items loading
    | 'text';     // Generic text loading

export interface AparteSkeletonProvider {
    /** Get skeleton HTML for a specific type */
    getSkeleton: (type: AparteSkeletonType) => string;
}

/** 
 * Minimal fallback skeletons - zero CSS animations, just structure
 * Used when no skeleton plugin is installed
 */
export const APARTE_DEFAULT_SKELETON_FALLBACKS: Record<AparteSkeletonType, string> = {
    message: '<div class="aparte-skeleton-fallback">Loading...</div>',
    code: '<div class="aparte-skeleton-fallback aparte-skeleton-fallback--code">Loading code...</div>',
    thinking: '<div class="aparte-skeleton-fallback aparte-skeleton-fallback--tight">Thinking...</div>',
    input: '<div class="aparte-skeleton-fallback aparte-skeleton-fallback--snug">...</div>',
    list: '<div class="aparte-skeleton-fallback">Loading items...</div>',
    text: '<div class="aparte-skeleton-fallback aparte-skeleton-fallback--tight">...</div>',
};
