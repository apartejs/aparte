/**
 * Run `cb` once React has committed the render in flight: on the next animation frame — or,
 * in a hidden tab, on the next task, since a hidden document runs no animation frame while
 * React still commits there. Waiting on a frame there held a compaction's save until the
 * reader came back, and lost it if they closed the tab first.
 */
export function afterReactRender(cb: () => void): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') setTimeout(cb, 0);
    else requestAnimationFrame(() => cb());
}
