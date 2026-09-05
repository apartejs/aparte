/**
 * The site around the chat, shared by the five examples: the conversation data, the
 * theme toggle, the search glyph and the settings dialog. Small DOM helpers on
 * purpose — a framework renders the markup, then hands the elements here.
 */
import {
    AparteConversationManager,
    aparteGlobalConfig,
    type AparteConversationListItem,
} from '@aparte/core';
import { moonIcon, searchIcon, sunIcon } from '@aparte/core/icons';
import { createSampleAdapter } from './sample-adapter';
import { DEFAULT_SETTINGS, applySystemPrompt, isSettingsView, loadSettings, saveSettings, type ExampleSettings } from './settings-store';

/**
 * The manager over the sample adapter (which answers after a delay on purpose),
 * registered for every <aparte-*> element on the page. Call `init()` yourself, so
 * the list can say it is on its way meanwhile.
 */
export function createSiteManager(): AparteConversationManager {
    const manager = new AparteConversationManager(createSampleAdapter());
    aparteGlobalConfig.setConversationManager(manager);
    return manager;
}

/** The rows the list draws, from the manager's conversations. */
export function listItemsOf(manager: AparteConversationManager): AparteConversationListItem[] {
    return manager.conversations.map(({ id, title, updatedAt, pinnedAt, archivedAt }) => ({ id, title, updatedAt, pinnedAt, archivedAt }));
}

/** The document's title carries the conversation's name — the product keeps it out of the header. */
export function documentTitleFor(manager: AparteConversationManager): string {
    const active = manager.active;
    return active?.title ? `${active.title} · aparté` : 'aparté';
}

/** The four starters under the welcome heading. Each one matches a scripted scenario. */
export const WELCOME_SUGGESTIONS = [
    { label: 'What can you do?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
    { label: 'Ask me a question', prompt: 'Design a colour scheme for my landing page. Ask me what you need to know first.' },
];

/** The search row's glyph, from the extended set — a static SVG string, never user input. */
export function drawSearchIcon(slot: HTMLElement | null): void {
    if (slot) slot.innerHTML = searchIcon;
}

/**
 * Light or dark, on `data-aparte-theme` at the root — the one attribute core's theme
 * reads. With no attribute the OS decides, and the button's first state reflects it.
 */
export function wireThemeToggle(button: HTMLElement | null): void {
    if (!button) return;
    const root = document.documentElement;
    const isDark = (): boolean => {
        const forced = root.getAttribute('data-aparte-theme');
        return forced ? forced === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    };
    const paint = (): void => {
        const dark = isDark();
        // Static SVG strings from the package's extended icon set — never user input.
        button.innerHTML = dark ? sunIcon : moonIcon;
        button.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
    };
    button.addEventListener('click', () => {
        root.setAttribute('data-aparte-theme', isDark() ? 'light' : 'dark');
        paint();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
    paint();
}

/**
 * The settings dialog: the kit's <dialog> wearing the recipe, opened by a header
 * button through `data-aparte-dialog-open` (core installs the triggers) and by
 * `?view=settings` on load, so it stays a link a reader can share.
 *
 * Applied on change: the system prompt goes onto the config, and the endpoint and
 * token are read live by the key resolver on the next request — so there is nothing
 * to commit and a Save button would imply otherwise. Two of the three text fields
 * exist BECAUSE they have no setter: an endpoint and a token reach a provider only
 * through the key resolver, as `{ apiKey, endpoint }`.
 *
 * The provider and the selector are registered once, at start: a change of model
 * source is applied by reloading the page, which is also what makes it visible.
 */
export function wireSettingsDialog(view: HTMLDialogElement | null): void {
    if (!view) return;
    if (isSettingsView()) view.showModal();

    const sourceEls = [...view.querySelectorAll<HTMLInputElement>('input[name="model-source"]')];
    const promptEl = view.querySelector<HTMLTextAreaElement>('#system-prompt')!;
    const endpointEl = view.querySelector<HTMLInputElement>('#endpoint')!;
    const tokenEl = view.querySelector<HTMLInputElement>('#token')!;
    const startedWith = loadSettings().modelSource;

    // The system prompt, the endpoint and the token belong to the local server: the
    // scripted model reads none of them, so under it they are disabled rather than
    // editable and unread.
    const syncLocalFields = (): void => {
        const local = sourceEls.find((el) => el.checked)?.value === 'local';
        for (const el of [promptEl, endpointEl, tokenEl]) {
            el.disabled = !local;
            el.closest('.settings-group')?.toggleAttribute('data-disabled', !local);
        }
    };

    const render = (settings: ExampleSettings): void => {
        for (const el of sourceEls) el.checked = el.value === settings.modelSource;
        syncLocalFields();
        promptEl.value = settings.systemPrompt;
        endpointEl.value = settings.endpoint;
        tokenEl.value = settings.token;
    };
    render(loadSettings());

    const commit = (): void => {
        syncLocalFields();
        const next: ExampleSettings = {
            modelSource: sourceEls.find((el) => el.checked)?.value === 'local' ? 'local' : 'scripted',
            systemPrompt: promptEl.value,
            endpoint: endpointEl.value,
            token: tokenEl.value,
        };
        saveSettings(next);
        applySystemPrompt(aparteGlobalConfig, next);
        if (next.modelSource !== startedWith) location.reload();
    };
    // `input`, not `change`: a reader who types and navigates away without blurring
    // the field would otherwise lose what they typed.
    for (const el of [promptEl, endpointEl, tokenEl, ...sourceEls]) el.addEventListener('input', commit);

    view.querySelector<HTMLButtonElement>('#settings-reset')?.addEventListener('click', () => {
        render({ ...DEFAULT_SETTINGS });
        commit();
    });
}
