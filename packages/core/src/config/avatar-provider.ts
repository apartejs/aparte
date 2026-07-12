/**
 * Avatar Provider Interface
 *
 * Defines the contract for plugging custom avatar rendering into chat
 * messages. Unlike the icon provider (which returns HTML strings), the
 * avatar provider receives the live host element and fills it with
 * whatever DOM the consumer wants — including framework components
 * mounted via createComponent (Angular), createRoot (React), etc.
 *
 * @example
 * AparteConfig.setAvatarProvider({
 *   render: (role, host) => {
 *     if (role === 'assistant') {
 *       const ref = createComponent(MascotComponent, { hostElement: host });
 *       ref.setInput('variant', 'classic');
 *       return () => ref.destroy();
 *     }
 *     host.textContent = 'You';
 *   },
 * });
 */
export interface AparteAvatarProvider {
    /**
     * Fill the avatar host element with custom DOM.
     *
     * @param role  - The message role this avatar represents.
     * @param host  - The `.aparte-avatar` element. Already styled (size, radius)
     *                via CSS variables. The provider owns its inner content.
     * @returns     - Optional cleanup function. Called when the message is
     *                detached or re-rendered, so live components can be
     *                disposed cleanly.
     */
    render(role: 'user' | 'assistant', host: HTMLElement): void | (() => void);
}
