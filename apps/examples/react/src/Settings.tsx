import { useState, type ReactNode } from 'react';
import { aparteGlobalConfig } from '@aparte/core';
import {
    applyPalette,
    applyIconSet,
    applyLanguage,
    type PaletteName,
    type IconSetName,
    type LanguageName,
} from './live-config';
import {
    DEFAULT_SETTINGS,
    applySystemPrompt,
    loadSettings,
    saveSettings,
    type ExampleSettings,
} from './settings-store';

/**
 * One labelled field with a hint.
 *
 * The hint is wired with `aria-describedby`, not nested inside the `<label>`. A
 * wrapping label swallows everything it contains into the accessible NAME, so a
 * screen reader announced "Endpoint Any OpenAI-compatible base URL — LM Studio,
 * Ollama, vLLM…" as the field's name and the description was never a description.
 * The browser test caught it by failing to find a field called "Endpoint".
 */
function Field({ id, label, hint, children }: { id: string; label: string; hint: ReactNode; children: ReactNode }) {
    return (
        <div className="field">
            <label className="field-label" htmlFor={id}>{label}</label>
            {children}
            <span className="field-hint" id={`${id}-hint`}>{hint}</span>
        </div>
    );
}

/**
 * The settings a consumer changes first, in the order they reach for them.
 *
 * Applied on change rather than behind a Save button: the system prompt goes
 * straight onto the config, and the endpoint and token are read live by the key
 * resolver on the next request — so there is nothing to commit, and a Save button
 * would imply otherwise.
 */
export default function Settings() {
    const [settings, setSettings] = useState<ExampleSettings>(loadSettings);

    /*
     * The three live levers, kept OUT of ExampleSettings on purpose: they are not
     * the app's settings, they are aparté's config, and the point of this panel is
     * to show that changing them takes effect on a chat that is already mounted —
     * so React holds only what the <select> needs to look right, and the config
     * itself is the source of truth.
     */
    const [live, setLiveState] = useState<{
        palette: PaletteName;
        icons: IconSetName;
        language: LanguageName;
    }>({ palette: 'default', icons: 'default', language: 'en' });

    const setLive = <K extends keyof typeof live>(key: K, value: (typeof live)[K]) => {
        setLiveState((prev) => ({ ...prev, [key]: value }));
        if (key === 'palette') applyPalette(value as PaletteName);
        if (key === 'icons') applyIconSet(value as IconSetName);
        if (key === 'language') applyLanguage(value as LanguageName);
    };

    const update = <K extends keyof ExampleSettings>(key: K, value: ExampleSettings[K]) => {
        const next = { ...settings, [key]: value };
        setSettings(next);
        saveSettings(next);
        // The prompt is config state; the endpoint and token are read by the
        // resolver at request time, so they need no push.
        if (key === 'systemPrompt') applySystemPrompt(aparteGlobalConfig, next);
    };

    const reset = () => {
        setSettings({ ...DEFAULT_SETTINGS });
        saveSettings({ ...DEFAULT_SETTINGS });
        applySystemPrompt(aparteGlobalConfig, DEFAULT_SETTINGS);
    };

    return (
        <div className="app settings">
            <header className="topbar">
                <div className="brand">
                    aparté <span>· react settings</span>
                </div>
                <a className="viewswitch" href="?">← back to the chat</a>
            </header>

            <div className="fields">
                <Field
                    id="system-prompt"
                    label="System prompt"
                    hint={<>Sent as the <code>system</code> turn. Supports <code>{'{{key}}'}</code> placeholders — resolve them with <code>setSystemPromptVarsProvider()</code>.</>}
                >
                    <textarea
                        id="system-prompt"
                        aria-describedby="system-prompt-hint"
                        className="field-input field-textarea"
                        rows={6}
                        spellCheck={false}
                        placeholder="Leave empty to send no system turn."
                        value={settings.systemPrompt}
                        onChange={(e) => update('systemPrompt', e.target.value)}
                    />
                </Field>

                <Field
                    id="endpoint"
                    label="Endpoint"
                    hint={<>Any OpenAI-compatible base URL — LM Studio, Ollama, vLLM, llama.cpp, a hosted API. Reaches the provider through the key resolver as <code>{'{ endpoint }'}</code>, which is the only runtime channel for it.</>}
                >
                    <input
                        id="endpoint"
                        aria-describedby="endpoint-hint"
                        className="field-input"
                        type="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Empty = the selected provider's own default"
                        value={settings.endpoint}
                        onChange={(e) => update('endpoint', e.target.value)}
                    />
                </Field>

                <Field
                    id="token"
                    label="Token"
                    hint={<>Stays in this browser — it is sent straight to the endpoint above, which is what BYOK means. For a key that must not reach the browser, use <code>AparteBackendTransport</code> instead.</>}
                >
                    <input
                        id="token"
                        aria-describedby="token-hint"
                        className="field-input"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="Empty is correct for a local server"
                        value={settings.token}
                        onChange={(e) => update('token', e.target.value)}
                    />
                </Field>

                <Field
                    id="palette"
                    label="Palette"
                    hint={<>CSS variables, set on <code>:root</code>. Not on the element: dozens of core's variables derive from <code>--aparte-primary</code> and those declarations live on <code>:root</code>, so overriding the master lower down moves the send button and leaves the avatar behind.</>}
                >
                    <select
                        id="palette"
                        aria-describedby="palette-hint"
                        className="field-input"
                        value={live.palette}
                        onChange={(e) => setLive('palette', e.target.value as PaletteName)}
                    >
                        <option value="default">Default</option>
                        <option value="violet">Violet</option>
                        <option value="paper">Paper</option>
                    </select>
                </Field>

                <Field
                    id="iconset"
                    label="Icons"
                    hint={<>An icon provider — <code>{'() => string'}</code> per name, every key optional. An empty provider is the reset, because each missing name falls back to core's own glyph.</>}
                >
                    <select
                        id="iconset"
                        aria-describedby="iconset-hint"
                        className="field-input"
                        value={live.icons}
                        onChange={(e) => setLive('icons', e.target.value as IconSetName)}
                    >
                        <option value="default">Default</option>
                        <option value="hard">Hard-edged</option>
                    </select>
                </Field>

                <Field
                    id="language"
                    label="Language"
                    hint={<>Forty strings in a plain object, handed to <code>setLocale()</code>. This one comes from <code>@aparte/locale-fr</code>; your own language needs no package.</>}
                >
                    <select
                        id="language"
                        aria-describedby="language-hint"
                        className="field-input"
                        value={live.language}
                        onChange={(e) => setLive('language', e.target.value as LanguageName)}
                    >
                        <option value="en">English</option>
                        <option value="fr">Français</option>
                    </select>
                </Field>

                <button className="chip" type="button" onClick={reset}>
                    Reset to defaults
                </button>
            </div>
        </div>
    );
}
