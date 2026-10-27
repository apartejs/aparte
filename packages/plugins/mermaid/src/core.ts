import { aparteGlobalConfig, escapeAttr, escapeHtml, renderCodeLanguages, type AparteConfig, type AparteCodeLanguageContext } from '@aparte/core';

/**
 * The part of Mermaid this plugin calls. Structural, so this module imports nothing
 * from `mermaid` — a bundle that hands over its own instance carries one copy.
 */
export interface MermaidLike {
    initialize(config: Record<string, unknown>): void;
    parse(text: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
    render(id: string, text: string): Promise<{ svg: string; diagramType?: string }>;
}

export interface MermaidOptions {
    /**
     * Redraw a diagram while its fence arrives, keeping the last version that parsed
     * (default `true`). `false` draws it once the fence has closed.
     */
    progressive?: boolean;
    /**
     * Mermaid configuration — a `flowchart` curve, `sequence` spacing, `themeVariables`
     * over the ones read from the chat's theme. The plugin keeps the keys that make
     * model-written diagrams safe to draw: `securityLevel` is `'strict'`, HTML labels
     * are off, and a diagram's own `%%{init}%%` cannot change either.
     */
    mermaid?: Record<string, unknown>;
}

/**
 * The fonts a diagram is measured and drawn in. An `<img>` cannot load the page's web
 * fonts, so Mermaid must measure its labels in the fonts the image will actually use,
 * or every box comes out the wrong size.
 */
const SYSTEM_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** The least time between two drawings of a diagram still arriving. */
const PROGRESSIVE_MS = 300;

/**
 * Draw diagrams with a Mermaid you provide — the instance, or a function that loads it
 * on the first diagram. The entry point for a bundle that controls what it ships:
 * `@aparte/plugin-mermaid` itself is this, with `() => import('mermaid')`.
 *
 * @returns a disposer that unregisters the renderer and stops watching the theme.
 * @example
 * import mermaid from 'mermaid';
 * import { setupMermaidWith } from '@aparte/plugin-mermaid/core';
 * setupMermaidWith(mermaid);
 */
export function setupMermaidWith(
    mermaid: MermaidLike | (() => Promise<MermaidLike>),
    options: MermaidOptions = {},
    config: AparteConfig = aparteGlobalConfig,
): () => void {
    const load = typeof mermaid === 'function' ? mermaid : () => Promise.resolve(mermaid);
    const renderer = createMermaidRenderer(load, options);
    const unregister = config.registerCodeLanguageRenderer(renderer);
    const unwatch = watchTheme(() => {
        renderer.epoch++;
        renderCodeLanguages(document.body, { refresh: true, language: 'mermaid' });
    });
    return () => { unwatch(); unregister(); };
}

function createMermaidRenderer(load: () => Promise<MermaidLike>, options: MermaidOptions) {
    const progressive = options.progressive !== false;
    const user = options.mermaid ?? {};
    let instance: Promise<MermaidLike> | undefined;
    /** One render at a time: `initialize` is global, and a render reads it. */
    let queue: Promise<unknown> = Promise.resolve();
    let ids = 0;
    /**
     * A diagram still arriving, by its first line, which does not move as it grows: the
     * latest source waiting to be drawn, whether a drawing is running, and the pace of
     * the last one — the next waits as long as it took, and at least `PROGRESSIVE_MS`.
     */
    interface Arriving {
        waiting: { ctx: AparteCodeLanguageContext; answer: (html: string | null) => void } | null;
        running: boolean;
        timer: ReturnType<typeof setTimeout> | undefined;
        at: number;
        took: number;
    }
    const arriving = new Map<string, Arriving>();

    const stateOf = (key: string): Arriving => {
        let state = arriving.get(key);
        if (!state) {
            state = { waiting: null, running: false, timer: undefined, at: 0, took: 0 };
            arriving.set(key, state);
            if (arriving.size > 32) arriving.delete(arriving.keys().next().value!);
        }
        return state;
    };

    const schedule = (state: Arriving): void => {
        if (state.running || state.timer !== undefined || !state.waiting) return;
        const wait = Math.max(0, state.at + Math.max(PROGRESSIVE_MS, state.took) - performance.now());
        state.timer = setTimeout(() => {
            state.timer = undefined;
            const job = state.waiting;
            state.waiting = null;
            if (!job) return;
            state.running = true;
            const started = performance.now();
            void draw(job.ctx).then(job.answer, () => job.answer(null)).finally(() => {
                state.running = false;
                state.at = performance.now();
                state.took = state.at - started;
                schedule(state);
            });
        }, wait);
    };

    const mermaidOf = (): Promise<MermaidLike> => {
        // Not poisoned: a failed load is tried again on the next diagram.
        instance ??= load().catch((error: unknown) => { instance = undefined; throw error; });
        return instance;
    };

    const serial = <T>(job: () => Promise<T>): Promise<T> => {
        const run = queue.then(job, job);
        queue = run.catch(() => undefined);
        return run;
    };

    /** Draw `ctx.source` as an image; `null` when it does not parse. */
    const draw = (ctx: AparteCodeLanguageContext): Promise<string | null> => serial(async () => {
        const m = await mermaidOf();
        m.initialize(mermaidConfig(user, ctx.host));
        if (!(await m.parse(ctx.source, { suppressErrors: true }))) return null;
        const id = `aparte-mermaid-${++ids}`;
        try {
            const { svg, diagramType } = await m.render(id, ctx.source);
            return image(svg, diagramType);
        } finally {
            // Mermaid leaves its scratch and error nodes in <body> when a render fails.
            document.getElementById(id)?.remove();
            document.getElementById(`d${id}`)?.remove();
        }
    });

    const renderer = {
        languages: ['mermaid'] as const,
        lazy: true,
        epoch: 0,
        cacheKey: (ctx: AparteCodeLanguageContext): string => `${renderer.epoch}|${themeOf(ctx.host)}`,
        render(ctx: AparteCodeLanguageContext): string | null | Promise<string | null> {
            if (!ctx.display) return null;
            const state = stateOf(ctx.source.split('\n', 1)[0] ?? '');
            // Whatever was still waiting is superseded: by a newer source, or by the end.
            state.waiting?.answer(null);
            state.waiting = null;
            if (!ctx.open) {
                return draw(ctx).then(
                    (html) => html ?? failed(ctx),
                    () => failed(ctx),
                );
            }
            if (!progressive) return null;
            return new Promise<string | null>((answer) => {
                state.waiting = { ctx, answer };
                schedule(state);
            });
        },
        relabel(drawing: HTMLElement, ctx: AparteCodeLanguageContext): void {
            const locale = ctx.config.getLocale() as Record<string, unknown>;
            const img = drawing.querySelector<HTMLImageElement>('img.aparte-diagram');
            if (img) {
                img.alt = describe(ctx.source) ?? String(locale['diagramAlt'] ?? 'Diagram');
                // A page whose CSP refuses `data:` images shows the source instead.
                img.addEventListener('error', () => img.replaceWith(errorNode(ctx)), { once: true });
            }
            const note = drawing.querySelector<HTMLElement>('[data-aparte-diagram-error]');
            if (note) note.textContent = String(locale['diagramError'] ?? 'This diagram could not be drawn.');
        },
    };
    return renderer;
}

/** The configuration every render runs with: the caller's, under the keys the plugin keeps. */
function mermaidConfig(user: Record<string, unknown>, host: HTMLElement): Record<string, unknown> {
    const palette = paletteOf(host);
    return {
        ...user,
        startOnLoad: false,
        securityLevel: 'strict',
        htmlLabels: false,
        suppressErrorRendering: true,
        theme: 'base',
        fontFamily: SYSTEM_FONTS,
        flowchart: { ...(user['flowchart'] as Record<string, unknown> | undefined), htmlLabels: false },
        themeVariables: { ...palette, ...(user['themeVariables'] as Record<string, unknown> | undefined), fontFamily: SYSTEM_FONTS },
        maxTextSize: 50_000,
        maxEdges: 500,
        // What a diagram's own `%%{init}%%` may not change.
        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'htmlLabels', 'flowchart', 'themeCSS', 'fontFamily'],
    };
}

/** The SVG as an image: no script and no style of it can reach the page. */
function image(svg: string, diagramType?: string): string | null {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement;
    if (root.nodeName !== 'svg' || doc.querySelector('parsererror') || doc.querySelector('foreignObject')) return null;
    const box = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
    const width = Math.ceil(box[2] ?? 0);
    const height = Math.ceil(box[3] ?? 0);
    if (!(width > 0 && height > 0)) return null;
    root.setAttribute('width', String(width));
    root.setAttribute('height', String(height));
    root.removeAttribute('style');
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(root))}`;
    const type = diagramType ? ` data-diagram-type="${escapeHtml(diagramType)}"` : '';
    return `<img class="aparte-diagram" src="${escapeAttr(src)}" width="${escapeAttr(String(width))}" height="${escapeAttr(String(height))}" alt=""${type} decoding="async" draggable="false">`;
}

/** The note and the source, for a diagram that does not parse. Its text is set by `relabel`. */
function failed(ctx: AparteCodeLanguageContext): string {
    return `<span class="aparte-code-error" role="note" data-aparte-diagram-error></span><pre class="aparte-code-error">${escapeHtml(ctx.source)}</pre>`;
}

function errorNode(ctx: AparteCodeLanguageContext): Node {
    const pre = document.createElement('pre');
    pre.className = 'aparte-code-error';
    pre.textContent = ctx.source;
    return pre;
}

/** The title or description a diagram gives itself for assistive technology, if any. */
function describe(source: string): string | undefined {
    return /^\s*accTitle\s*:\s*(.+)$/m.exec(source)?.[1]?.trim()
        ?? /^\s*accDescr\s*:\s*(.+)$/m.exec(source)?.[1]?.trim();
}

/** Which theme the chat around `host` is in: its own attribute, else the system's. */
function themeOf(host: HTMLElement): string {
    const attr = host.closest('[data-aparte-theme]')?.getAttribute('data-aparte-theme');
    if (attr) return attr;
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * The chat's colours as Mermaid can read them. A token may be `color-mix()` or `oklch()`,
 * which Mermaid's colour library cannot parse, so each is resolved by the browser — a
 * probe's computed colour — and normalised to hex by a canvas.
 */
function paletteOf(host: HTMLElement): Record<string, unknown> {
    if (typeof getComputedStyle !== 'function') return {};
    const probe = document.createElement('span');
    probe.style.display = 'none';
    // Beside the source, never in it: an incremental provider may still be writing there.
    (host.parentElement ?? document.body).appendChild(probe);
    const canvas = document.createElement('canvas').getContext?.('2d') ?? null;
    const read = (token: string, fallback: string): string => {
        probe.style.color = `var(${token}, ${fallback})`;
        const computed = getComputedStyle(probe).color || fallback;
        if (!canvas) return computed;
        canvas.fillStyle = '#000';
        canvas.fillStyle = computed;
        return String(canvas.fillStyle);
    };
    try {
        const bg = read('--aparte-bg', '#ffffff');
        const text = read('--aparte-text', '#1a1a1a');
        const muted = read('--aparte-text-muted', '#666666');
        const border = read('--aparte-border', '#d0d0d0');
        const surface = read('--aparte-surface-2', '#f4f4f4');
        const surfaceLow = read('--aparte-surface-1', '#fafafa');
        const primary = read('--aparte-primary', '#3b5bdb');
        return {
            darkMode: luminance(bg) < 0.5,
            background: bg,
            primaryColor: surface,
            primaryTextColor: text,
            primaryBorderColor: primary,
            secondaryColor: surfaceLow,
            tertiaryColor: surfaceLow,
            mainBkg: surface,
            nodeBorder: border,
            clusterBkg: surfaceLow,
            clusterBorder: border,
            lineColor: muted,
            textColor: text,
            titleColor: text,
            edgeLabelBackground: bg,
            noteBkgColor: surfaceLow,
            noteTextColor: text,
            noteBorderColor: border,
            actorBkg: surface,
            actorBorder: primary,
            actorTextColor: text,
            signalColor: muted,
            signalTextColor: text,
        };
    } finally {
        probe.remove();
    }
}

function luminance(color: string): number {
    const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
    if (!hex) return 1;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Call `changed` when the chat's theme or the system's colour scheme changes; returns the stop. */
function watchTheme(changed: () => void): () => void {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => { /* nothing watched */ };
    const observer = new MutationObserver(changed);
    observer.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-aparte-theme'] });
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', changed);
    return () => { observer.disconnect(); media?.removeEventListener('change', changed); };
}
