/**
 * Skeleton Provider Interface
 * 
 * Defines the contract for skeleton/loading state plugins.
 * Returns HTML strings for various loading states.
 * 
 * @example
 * // Using default plugin
 * import { setupDefaultSkeletons } from '@aparte/plugin-skeleton-default';
 * setupDefaultSkeletons();
 * 
 * // Using Angular ngx-skeleton-loader bridge
 * AparteConfig.setSkeletonProvider({
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
export const DEFAULT_SKELETON_FALLBACKS: Record<AparteSkeletonType, string> = {
    message: '<div class="aparte-skeleton-fallback" style="padding:16px;color:#9ca3af;">Loading...</div>',
    code: '<div class="aparte-skeleton-fallback" style="padding:16px;background:#1e293b;color:#64748b;border-radius:8px;">Loading code...</div>',
    thinking: '<div class="aparte-skeleton-fallback" style="padding:8px;color:#9ca3af;">Thinking...</div>',
    input: '<div class="aparte-skeleton-fallback" style="padding:12px;color:#9ca3af;">...</div>',
    list: '<div class="aparte-skeleton-fallback" style="padding:16px;color:#9ca3af;">Loading items...</div>',
    text: '<div class="aparte-skeleton-fallback" style="padding:8px;color:#9ca3af;">...</div>',
};
