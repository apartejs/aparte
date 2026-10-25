/**
 * The wrapper's own components, as a template may spell them in kebab case. They share the
 * prefix and are not elements: `<aparte-tool-ui>` must still resolve to `AparteToolUI`.
 * (`<aparte-chat>` is not here: that tag is core's element.)
 */
const WRAPPER_COMPONENTS = new Set(['aparte-ui', 'aparte-tool-ui', 'aparte-segment-ui']);

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
