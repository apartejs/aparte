/**
 * The three things every consumer changes first: the system prompt, the endpoint,
 * and the token.
 *
 * None of them had an example. The system prompt has a setter
 * (`config.setSystemPrompt`), but the other two do not — an endpoint and a token
 * reach a provider through the **key resolver**, which may return
 * `{ apiKey, endpoint }` instead of a bare string. That is the only runtime channel
 * for either, it is honoured on both the chat and the model-list path
 * (`AparteDirectTransport` does `endpoint || provider.defaultEndpoint`), and its own
 * JSDoc in core calls it "the legacy `string | Record` auth shape". A channel that
 * central, described that dismissively and demonstrated nowhere is exactly the
 * capability a reader never finds.
 *
 * Kept framework-agnostic so the other four examples use the same file, in their
 * own idiom, without a shared package: these apps are deliberately five copies of
 * one app — that IS the parity they exist to prove.
 */

export interface ExampleSettings {
    /** Sent as the `system` turn. Empty means "send none". */
    systemPrompt: string;
    /** Overrides the selected provider's `defaultEndpoint`. Empty means "use it". */
    endpoint: string;
    /** Bearer token. Empty is correct for a local server. */
    token: string;
}

/**
 * LM Studio, pre-filled — because a local server is the case this library was
 * built for, it needs no key, and a reader who has one running can send a message
 * without typing anything. `presets.LMSTUDIO.baseURL` is the same value; it is
 * spelled out here so the field shows a URL rather than a blank a reader has to
 * guess the shape of.
 */
export const DEFAULT_SETTINGS: ExampleSettings = {
    systemPrompt: '',
    endpoint: 'http://localhost:1234/v1',
    token: '',
};

const STORAGE_KEY = 'aparte.example.settings';

/** Read the stored settings, falling back to the defaults field by field. */
export function loadSettings(): ExampleSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        const parsed = JSON.parse(raw) as Partial<ExampleSettings>;
        // Field by field, so a key added later gets its default instead of
        // `undefined` reaching the config.
        return {
            systemPrompt: parsed.systemPrompt ?? DEFAULT_SETTINGS.systemPrompt,
            endpoint: parsed.endpoint ?? DEFAULT_SETTINGS.endpoint,
            token: parsed.token ?? DEFAULT_SETTINGS.token,
        };
    } catch {
        // A private window, cleared site data, or a browser refusing storage.
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings: ExampleSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Not fatal: the settings apply to this session either way.
    }
}

/**
 * Push the system prompt onto a config.
 *
 * `undefined` and not `''`: the setter treats an empty string as a template, so a
 * blank field would send an empty system turn rather than none at all.
 */
export function applySystemPrompt(config: { setSystemPrompt(t: string | undefined): void }, settings: ExampleSettings): void {
    config.setSystemPrompt(settings.systemPrompt.trim() || undefined);
}

/**
 * The key resolver: what turns the two text fields into an endpoint and a token.
 *
 * Returns the RECORD form, which is the only way to move an endpoint at runtime.
 * Empty fields are omitted rather than sent as `''`, so the provider falls back to
 * its own `defaultEndpoint` and sends no `Authorization` header — which is what a
 * local server wants.
 */
export function settingsKeyResolver(read: () => ExampleSettings) {
    return (_providerId: string): Record<string, string> | undefined => {
        const { endpoint, token } = read();
        const auth: Record<string, string> = {};
        if (endpoint.trim()) auth['endpoint'] = endpoint.trim();
        if (token.trim()) auth['apiKey'] = token.trim();
        return Object.keys(auth).length ? auth : undefined;
    };
}

/** Is the settings view the requested one? A link, so it is deep-linkable. */
export function isSettingsView(): boolean {
    return new URLSearchParams(window.location.search).get('view') === 'settings';
}
