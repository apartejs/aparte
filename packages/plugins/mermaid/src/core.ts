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
const SVG_NS = 'http://www.w3.org/2000/svg';
const SYSTEM_FONTS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
/** The least time between two drawings of a diagram still arriving. */
const PROGRESSIVE_MS = 300;

/*
 * One render at a time on the whole page, whichever chat asks: Mermaid is one object,
 * `initialize` replaces its whole configuration, and a render reads it. A queue per chat
 * let one chat's diagram be drawn with another chat's options and colours.
 */
let queue: Promise<unknown> = Promise.resolve();
let ids = 0;
/** Unique to this copy of the plugin, so two bundles on one page never remove each other's nodes. */
const ID_PREFIX = `aparte-mermaid-${Math.random().toString(36).slice(2, 8)}`;

const serial = <T>(job: () => Promise<T>): Promise<T> => {
    const run = queue.then(job, job);
    queue = run.catch(() => undefined);
    return run;
};

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
    /*
     * The shadow roots diagrams were drawn in. Neither the page's observer nor a redraw
     * from <body> reaches inside one, so each is watched, and redrawn, on its own.
     */
    const shadows = new Set<ShadowRoot>();
    const redraw = (): void => {
        renderer.epoch++;
        renderCodeLanguages(document.body, { refresh: true, language: 'mermaid' });
        for (const root of shadows) {
            // A widget taken off the page is let go, not drawn again: if it comes back,
            // its next drawing hands its root over once more.
            if (!root.host.isConnected) { shadows.delete(root); continue; }
            for (const child of Array.from(root.children)) renderCodeLanguages(child, { refresh: true, language: 'mermaid' });
        }
    };
    const watch = watchTheme(redraw);
    const renderer = createMermaidRenderer(load, options, (host) => {
        const root = host.getRootNode();
        if (typeof ShadowRoot === 'undefined' || !(root instanceof ShadowRoot) || shadows.has(root)) return;
        for (const old of shadows) if (!old.host.isConnected) shadows.delete(old);
        shadows.add(root);
        watch.add(root);
    });
    const unregister = config.registerCodeLanguageRenderer(renderer);
    return () => { watch.stop(); shadows.clear(); unregister(); };
}

function createMermaidRenderer(load: () => Promise<MermaidLike>, options: MermaidOptions, seen: (host: HTMLElement) => void) {
    const progressive = options.progressive !== false;
    const user = options.mermaid ?? {};
    let instance: Promise<MermaidLike> | undefined;
    /**
     * A diagram still arriving, by the part of the reply it is in — a rebuild replaces its
     * placeholder, never its part: the latest source waiting to be drawn, whether a
     * drawing is running, and the pace of the last one — the next waits as long as it
     * took, and at least `PROGRESSIVE_MS`.
     */
    interface Arriving {
        waiting: { ctx: AparteCodeLanguageContext; answer: (html: string | null) => void } | null;
        running: boolean;
        timer: ReturnType<typeof setTimeout> | undefined;
        at: number;
        took: number;
    }
    const arriving = new WeakMap<Element, Arriving>();
    const watched = new WeakSet<HTMLImageElement>();

    const stateOf = (host: HTMLElement): Arriving => {
        const part = host.closest('[data-segment-id]') ?? host.closest('pre')?.parentElement ?? host.parentElement ?? host;
        let state = arriving.get(part);
        if (!state) {
            state = { waiting: null, running: false, timer: undefined, at: 0, took: 0 };
            arriving.set(part, state);
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

    /** Draw `ctx.source` as an image; `null` when it does not parse. */
    const draw = (ctx: AparteCodeLanguageContext): Promise<string | null> => serial(async () => {
        const m = await mermaidOf();
        m.initialize(mermaidConfig(user, ctx.host));
        if (!(await m.parse(ctx.source, { suppressErrors: true }))) return null;
        const id = `${ID_PREFIX}-${++ids}`;
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
        /** The colours themselves, not the theme's name: two skins may share one name. */
        cacheKey(ctx: AparteCodeLanguageContext): string {
            seen(ctx.host);
            return `${renderer.epoch}|${colourKey(ctx.host)}`;
        },
        render(ctx: AparteCodeLanguageContext): string | null | Promise<string | null> {
            if (!ctx.display) return null;
            seen(ctx.host);
            const state = stateOf(ctx.host);
            const waiting = state.waiting;
            if (!ctx.open) {
                // The end of the diagram that was arriving: its waiting frame is not drawn.
                // Another diagram of the same part, drawn again, leaves it waiting.
                if (waiting && ctx.source.startsWith(waiting.ctx.source)) {
                    waiting.answer(null);
                    state.waiting = null;
                }
                return draw(ctx).then(
                    (html) => html ?? failed(ctx),
                    () => failed(ctx),
                );
            }
            // A newer source supersedes the one still waiting.
            waiting?.answer(null);
            state.waiting = null;
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
                // A page whose CSP refuses `data:` images shows the source instead. Once per
                // image, and holding the source only: a relabel runs on every locale change.
                if (!watched.has(img)) {
                    watched.add(img);
                    const source = ctx.source;
                    img.addEventListener('error', () => img.replaceWith(errorNode(source)), { once: true });
                }
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

/**
 * The SVG as an image: no script and no style of it can reach the page.
 *
 * Read by the HTML parser, as Mermaid wrote it: it serialises its SVG as HTML (a no-break
 * space comes out as `&nbsp;`, and its `#hearts;` codes as `&hearts;`), which an XML
 * parser refuses — and a French label, `Étape 1 : début`, then never drew. Anything
 * the parser had to put beside the `<svg>` means it was not one clean SVG.
 */
function image(svg: string, diagramType?: string): string | null {
    const template = document.createElement('template');
    template.innerHTML = svg.trim();
    const root = template.content.firstElementChild;
    if (!root || template.content.children.length !== 1 || root.localName !== 'svg' || root.namespaceURI !== SVG_NS
        || root.getElementsByTagName('foreignObject').length > 0) return null;
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

function errorNode(source: string): Node {
    const pre = document.createElement('pre');
    pre.className = 'aparte-code-error';
    pre.textContent = source;
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

/** The tokens a diagram is coloured from, with the colour each falls back to. */
const TOKENS = {
    bg: ['--aparte-bg', '#ffffff'],
    text: ['--aparte-text', '#1a1a1a'],
    muted: ['--aparte-text-muted', '#666666'],
    border: ['--aparte-border', '#d0d0d0'],
    surface: ['--aparte-surface-2', '#f4f4f4'],
    surfaceLow: ['--aparte-surface-1', '#fafafa'],
    primary: ['--aparte-primary', '#3b5bdb'],
} as const;

/**
 * What a diagram's colours depend on at `host`: the theme, the colour scheme, and the
 * tokens as declared there. Cheap — one style read, no probe — since the engine asks it
 * on every pass; two skins with the same theme name still differ in their tokens.
 */
function colourKey(host: HTMLElement): string {
    const theme = themeOf(host);
    if (typeof getComputedStyle !== 'function') return theme;
    const style = getComputedStyle(host);
    return [theme, style.colorScheme, ...Object.values(TOKENS).map(([token]) => style.getPropertyValue(token).trim())].join('|');
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
        const bg = read(...TOKENS.bg);
        const text = read(...TOKENS.text);
        const muted = read(...TOKENS.muted);
        const border = read(...TOKENS.border);
        const surface = read(...TOKENS.surface);
        const surfaceLow = read(...TOKENS.surfaceLow);
        const primary = read(...TOKENS.primary);
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

/**
 * Call `changed` when the chat's theme or the system's colour scheme changes — on the
 * page, and in each shadow root handed to `add`.
 */
function watchTheme(changed: () => void): { add: (root: ShadowRoot) => void; stop: () => void } {
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return { add: () => {}, stop: () => {} };
    const observer = new MutationObserver(changed);
    const options: MutationObserverInit = { attributes: true, subtree: true, attributeFilter: ['data-aparte-theme'] };
    observer.observe(document.documentElement, options);
    const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener('change', changed);
    return {
        add: (root) => observer.observe(root, options),
        stop: () => { observer.disconnect(); media?.removeEventListener('change', changed); },
    };
}
