import {
    InjectionToken,
    makeEnvironmentProviders,
    provideAppInitializer,
    type EnvironmentProviders,
} from '@angular/core';
import {
    AparteConfig,
    type AparteAIProvider,
    type AparteClientOptions,
    type AparteIconProvider,
    type AparteLocale,
    type AparteMarkdownProvider,
    type AparteModelConfig,
    type AparteSkeletonProvider,
} from '@aparte/core';
import { APARTE_CLIENT_OPTIONS } from './aparte-ai.service';

/**
 * Any function that initialises a plugin — sync or async, so it can wrap a
 * dynamic `import()` of a package YOU choose:
 * `() => import('@aparte/plugin-model-selector')`.
 */
export type ApartePluginLoader = () => void | Promise<void>;

/**
 * Config for {@link provideAparte}. Deliberately **instance-agnostic**: every
 * plugin/locale slot takes a provider OBJECT or a LOADER function you supply —
 * this package never hardcodes (nor depends on) a catalog of `@aparte/*` package
 * names, so it stays a leaf with only `@aparte/core` + Angular as peers.
 */
export interface ProvideAparteOptions {
    /** AI providers to register (e.g. from `@aparte/provider-openai-compat`). */
    providers?: AparteAIProvider[];

    /** Optional plugin wiring — objects or loaders, never package-name strings. */
    plugins?: {
        /** Action plugins, as loaders: `[() => import('@aparte/plugin-model-selector')]`. */
        actions?: ApartePluginLoader[];
        /** An icon provider object, or a loader that registers one. */
        icons?: AparteIconProvider | ApartePluginLoader;
        /** A skeleton provider object, or a loader that registers one. */
        skeleton?: AparteSkeletonProvider | ApartePluginLoader;
        /** A loader that applies a theme. */
        theme?: ApartePluginLoader;
        /** A markdown provider `(raw: string) => string`, or a loader that registers one. */
        markdown?: AparteMarkdownProvider | ApartePluginLoader;
    };

    /** Model selection configuration. */
    modelConfig?: AparteModelConfig;

    /** A locale OBJECT (e.g. `fr` from `@aparte/locale-fr`) — not a package-name string. */
    locale?: AparteLocale;

    /** Theme mode; `'auto'` follows the system preference. */
    themeMode?: 'light' | 'dark' | 'auto';

    /** Options for the `AparteClient` mounted by {@link AparteAiService}. */
    clientOptions?: AparteClientOptions;
}

/** Holds the resolved aparté config, for consumers that want to inject it. */
export const APARTE_CONFIG_TOKEN = new InjectionToken<ProvideAparteOptions>('APARTE_CONFIG');

async function loadIconPlugin(plugin: AparteIconProvider | ApartePluginLoader): Promise<void> {
    if (typeof plugin === 'object' && plugin !== null) {
        AparteConfig.setIconProvider(plugin);
        return;
    }
    try {
        await (plugin as ApartePluginLoader)();
    } catch (err) {
        console.warn('[aparte] Failed to load icon plugin', err);
    }
}

async function loadSkeletonPlugin(plugin: AparteSkeletonProvider | ApartePluginLoader): Promise<void> {
    if (typeof plugin === 'object' && plugin !== null) {
        AparteConfig.setSkeletonProvider(plugin);
        return;
    }
    try {
        await (plugin as ApartePluginLoader)();
    } catch (err) {
        console.warn('[aparte] Failed to load skeleton plugin', err);
    }
}

async function loadMarkdownPlugin(plugin: AparteMarkdownProvider | ApartePluginLoader): Promise<void> {
    // A markdown provider takes the raw string; a loader takes nothing.
    if (plugin.length >= 1) {
        AparteConfig.setMarkdownProvider(plugin as AparteMarkdownProvider);
        return;
    }
    try {
        await (plugin as ApartePluginLoader)();
    } catch (err) {
        console.warn('[aparte] Failed to load markdown plugin', err);
    }
}

async function runLoader(loader: ApartePluginLoader, label: string): Promise<void> {
    try {
        await loader();
    } catch (err) {
        console.warn(`[aparte] Failed to load ${label} plugin`, err);
    }
}

async function loadPlugins(options: ProvideAparteOptions): Promise<void> {
    const plugins = options.plugins;
    if (!plugins) return;
    const pending: Promise<void>[] = [];

    for (const action of plugins.actions ?? []) pending.push(runLoader(action, 'action'));
    if (plugins.icons) pending.push(loadIconPlugin(plugins.icons));
    if (plugins.skeleton) pending.push(loadSkeletonPlugin(plugins.skeleton));
    if (plugins.theme) pending.push(runLoader(plugins.theme, 'theme'));
    if (plugins.markdown) pending.push(loadMarkdownPlugin(plugins.markdown));

    await Promise.all(pending);
}

/** Reflect the theme mode on the document root. */
function applyThemeMode(mode: 'light' | 'dark' | 'auto'): void {
    if (mode !== 'auto') {
        document.documentElement.setAttribute('data-aparte-theme', mode);
        return;
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    document.documentElement.setAttribute('data-aparte-theme', query.matches ? 'dark' : 'light');
    query.addEventListener('change', (e) => {
        document.documentElement.setAttribute('data-aparte-theme', e.matches ? 'dark' : 'light');
    });
}

/**
 * Configure aparté for a standalone Angular app. Registers your AI providers,
 * model config, locale and optional plugins on the global `AparteConfig`, and
 * provides {@link APARTE_CLIENT_OPTIONS} for {@link AparteAiService}.
 *
 * The components (`AparteChatComponent`, `AparteUiComponent`) are standalone and
 * work WITHOUT this — it is config sugar. You can equally call `AparteConfig.*`
 * yourself, exactly like the React/Vue/Svelte wrappers do.
 *
 * @example
 * bootstrapApplication(App, {
 *   providers: [
 *     provideAparte({
 *       providers: [createOpenAICompatProvider(presets.OPENROUTER)],
 *       clientOptions: { keyResolver },
 *     }),
 *   ],
 * });
 */
export function provideAparte(options: ProvideAparteOptions = {}): EnvironmentProviders {
    return makeEnvironmentProviders([
        { provide: APARTE_CONFIG_TOKEN, useValue: options },
        { provide: APARTE_CLIENT_OPTIONS, useValue: options.clientOptions ?? {} },
        provideAppInitializer(async () => {
            if (options.providers?.length) {
                AparteConfig.registerAIProvider(...options.providers);
            }
            if (options.modelConfig) {
                AparteConfig.setModelConfig(options.modelConfig);
            }
            if (options.locale) {
                AparteConfig.setLocale(options.locale);
            }
            await loadPlugins(options);
            if (options.themeMode) {
                applyThemeMode(options.themeMode);
            }
        }),
    ]);
}
