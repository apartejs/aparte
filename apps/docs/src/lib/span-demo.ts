/**
 * The demo at the top of a detector's model page (/models/privacy/, /models/secrets/): a field,
 * the message drawn back with every span the model found in it, and the masked text — what
 * would be sent to an AI instead. Everything is computed in the reader's tab as they type; the
 * page hands in its detector, loading, and the words to show for its categories.
 *
 * The markup it fills is the page's own (`styles/model-page.css` draws it): a `textarea`, the
 * `.ex` example chips, `[data-sd-found]`, `[data-sd-masked]` and the `[data-sd-state]` meter
 * inside the section, and a `[data-sd-ms]` figure further down the page. The message is put in
 * the page as text nodes, never as HTML: it is whatever the reader typed.
 */
export interface DemoSpan {
    start: number;
    end: number;
    subtype: string;
    score: number;
}

export interface Detector {
    detect(text: string): DemoSpan[];
    mask(text: string): { text: string };
}

/** What the masked text's placeholders look like: `[PRIVATE_EMAIL_3]`, `[API_KEY_1]`. */
const PLACEHOLDER = /\[[A-Z_]+_\d+\]/g;

export function mountSpanDemo(section: HTMLElement, detector: Promise<Detector>, labels: Record<string, string>): void {
    const field = section.querySelector('textarea')!;
    const found = section.querySelector<HTMLElement>('[data-sd-found]')!;
    const masked = section.querySelector<HTMLElement>('[data-sd-masked]')!;
    const state = section.querySelector<HTMLElement>('[data-sd-state]')!;
    // The figure below the fold reads the same measurement as the meter.
    const figure = document.querySelector('[data-sd-ms]');
    // "int8 · 196 KB": what the page measured at build time, printed beside the latency.
    const file = section.dataset.file ?? '';

    const empty = (box: HTMLElement) => {
        const hint = document.createElement('span');
        hint.className = 'none';
        hint.textContent = 'Type a message, or pick one below it.';
        box.replaceChildren(hint);
    };

    const drawFound = (text: string, spans: DemoSpan[]) => {
        const parts: Node[] = [];
        let at = 0;
        for (const span of spans) {
            if (span.start < at) continue;
            parts.push(document.createTextNode(text.slice(at, span.start)));
            const hit = document.createElement('mark');
            hit.className = 'hit';
            const label = labels[span.subtype] ?? span.subtype;
            hit.title = `${label} · score ${span.score.toFixed(2)}`;
            const kind = document.createElement('small');
            kind.textContent = label;
            hit.append(text.slice(span.start, span.end), kind);
            parts.push(hit);
            at = span.end;
        }
        parts.push(document.createTextNode(text.slice(at)));
        found.replaceChildren(...parts);
    };

    const drawMasked = (text: string) => {
        const parts: Node[] = [];
        let at = 0;
        for (const match of text.matchAll(PLACEHOLDER)) {
            parts.push(document.createTextNode(text.slice(at, match.index)));
            const ph = document.createElement('span');
            ph.className = 'ph';
            ph.textContent = match[0];
            parts.push(ph);
            at = match.index + match[0].length;
        }
        parts.push(document.createTextNode(text.slice(at)));
        masked.replaceChildren(...parts);
    };

    let model: Detector | null = null;
    const run = () => {
        if (!model) return;
        const text = field.value;
        if (!text.trim()) {
            empty(found);
            empty(masked);
            state.textContent = `${file} · waiting for a message`;
            return;
        }
        const t0 = performance.now();
        const spans = model.detect(text);
        const ms = performance.now() - t0;
        drawFound(text, spans);
        drawMasked(model.mask(text).text);
        const count = spans.length === 0 ? 'nothing found' : `${spans.length} found`;
        state.textContent = `${count} · ${ms.toFixed(1)} ms · ${file} · measured in this tab`;
        if (figure) figure.textContent = `${ms.toFixed(1)} ms`;
    };

    field.addEventListener('input', run);
    for (const button of section.querySelectorAll<HTMLButtonElement>('.ex')) {
        button.addEventListener('click', () => {
            field.value = button.dataset.text ?? '';
            run();
            field.focus();
        });
    }
    detector
        .then((loaded) => {
            // One call before the first measured one: the first pays for compiling the runtime
            // (40 ms where the next take 5), and the meter reports what a message costs.
            loaded.detect('warm up');
            model = loaded;
            // Arriving from the link a card or a README gives (`#demo`), the first example is
            // already read and the field has the focus: the visitor only has to type.
            if (!field.value) field.value = section.querySelector<HTMLButtonElement>('.ex')?.dataset.text ?? '';
            run();
            if (location.hash === '#demo') field.focus({ preventScroll: true });
        })
        .catch(() => {
            state.textContent = 'The model could not be loaded — the page is still readable, the demo is not.';
        });
}
