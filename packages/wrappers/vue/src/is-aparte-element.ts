/**
 * The wrapper's own components in kebab case. They share the prefix and are not elements, so
 * they are left to Vue: `<aparte-ui>` and `<aparte-tool-u-i>` resolve to `AparteUi` and
 * `AparteToolUI`; `<aparte-tool-ui>` resolves to nothing (Vue reads it as `AparteToolUi`), and
 * left to Vue it gets Vue's "failed to resolve" warning rather than becoming an inert element —
 * write the components in PascalCase. (`<aparte-chat>` is not here: that tag is core's element.)
 */
const WRAPPER_COMPONENTS = new Set([
    'aparte-ui',
    'aparte-tool-ui', 'aparte-tool-u-i',
    'aparte-segment-ui', 'aparte-segment-u-i',
]);

/**
 * Whether a template tag is one of aparté's elements, for Vue's `isCustomElement`: Vue then
 * leaves `<aparte-icon>` and the rest to the browser instead of looking for a component of that
 * name. A prefix, not a list, so a plugin's element (`<aparte-approval-mode>`) is included.
 *
 * @example
 * // vite.config.ts
 * vue({ template: { compilerOptions: { isCustomElement: isAparteElement } } })
 */
export function isAparteElement(tag: string): boolean {
    return tag.startsWith('aparte-') && !WRAPPER_COMPONENTS.has(tag);
}
