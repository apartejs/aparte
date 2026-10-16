/**
 * What every template shares in the browser: the mode it was opened in, the site's theme, and the
 * one animation a template plays, a question typed into the composer and sent.
 *
 * Three modes, read from the URL:
 * - `full` (no parameter): the template as an app, on its own page, interactive.
 * - `thumb` (`?thumb`): a tile in the /templates/ grid. Frozen: the template shows its finished
 *   state at once (a seeded conversation, nothing typing, nothing streaming), because forty frames
 *   animating side by side is noise and work for nothing.
 * - `play` (`?play`): the landing's showcase. The template plays its scripted conversation once it
 *   is shown, then stays interactive.
 */

export type TemplateMode = 'full' | 'thumb' | 'play';

export function templateMode(): TemplateMode {
    const query = new URLSearchParams(location.search);
    if (query.has('thumb')) return 'thumb';
    if (query.has('play')) return 'play';
    return 'full';
}

export function reducedMotion(): boolean {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function applyTheme(choice: string | null): void {
    const dark = choice === 'dark' || (choice !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.aparteTheme = theme;
}

function storedTheme(): string | null {
    try {
        return localStorage.getItem('starlight-theme');
    } catch {
        return null;
    }
}

/**
 * Follow the site's theme after load (the layout applies the stored one before paint): a parent
 * page's toggle when the template is framed, another tab's change, the system's when on Auto.
 */
export function followTheme(): void {
    addEventListener('message', (event) => {
        if (event.source === parent && event.data?.aparteTheme) applyTheme(event.data.aparteTheme);
    });
    addEventListener('storage', (event) => {
        if (event.key === 'starlight-theme') applyTheme(event.newValue);
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(storedTheme()));
}

/**
 * Run `play` once the template is on screen. On its own page that is now; framed, it is when the
 * parent says so (`postMessage({ aparteVisible: true })`), because a frame cannot see whether its
 * parent has scrolled it into view, and a lazy frame loads well before it is reached.
 */
export function whenShown(play: () => void): void {
    if (window === parent) {
        play();
        return;
    }
    const onMessage = (event: MessageEvent): void => {
        if (event.source !== parent || !event.data?.aparteVisible) return;
        removeEventListener('message', onMessage);
        play();
    };
    addEventListener('message', onMessage);
}

interface Composer extends HTMLElement {
    setValue(value: string): void;
    submit(): void;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Type a question into a composer the way a person would, then send it — through the composer's
 * public API, so the turn that follows is exactly the one a typed message gets. Under reduced
 * motion the question lands at once.
 */
export async function typeAndSend(composer: Composer, text: string): Promise<void> {
    if (!reducedMotion()) {
        await sleep(600);
        for (let i = 1; i <= text.length; i++) {
            composer.setValue(text.slice(0, i));
            await sleep(32);
        }
        await sleep(350);
    }
    composer.setValue(text);
    composer.submit();
}

/** Wait until the chat is idle again (no reply streaming), with a ceiling. */
export async function settled(chat: HTMLElement, ceilingMs = 20000): Promise<void> {
    const start = Date.now();
    await sleep(200);
    while (Date.now() - start < ceilingMs) {
        if (!chat.querySelector('aparte-chat-bubble[streaming]')) return;
        await sleep(150);
    }
}
