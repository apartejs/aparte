/**
 * KaTeX draws every formula twice — once as MathML for screen readers, once as HTML to
 * see — and its stylesheet is what hides the first. Missing, the formula shows twice,
 * which is easy to mistake for a bug here; say so once, where the developer looks.
 */
export function checkStyles(): void {
    if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return;
    queueMicrotask(() => {
        const probe = document.createElement('span');
        probe.className = 'katex';
        probe.innerHTML = '<span class="katex-mathml"></span>';
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        document.body.appendChild(probe);
        const hidden = getComputedStyle(probe.firstElementChild!).position === 'absolute';
        probe.remove();
        if (!hidden) {
            console.warn("[aparte] @aparte/plugin-katex: KaTeX's stylesheet is not loaded, so each formula shows twice. Import 'katex/dist/katex.min.css'.");
        }
    });
}
