/**
 * `@aparte/plugin-titler` — auto-title conversations with an aparte-titler model.
 *
 * Core titles a conversation from its first user message, and the default is the
 * message as typed. This plugin replaces that default with the words an
 * [aparte-titler](https://apartejs.dev/models/titler/) model picks out of it — 3 to 6
 * words, in the browser, no API call — through the manager's title provider seam.
 *
 * ```ts
 * import { loadTitler } from '@aparte/titler-latin';
 * import { setupTitler } from '@aparte/plugin-titler';
 *
 * setupTitler(manager, { titler: loadTitler });
 * ```
 *
 * The plugin loads nothing on its own: it calls the loader you hand it, once, the
 * first time a title is needed. Any object with `title(message, budget?)` works — the
 * runtime's `Titler`, or one of your own.
 */
import type { AparteConversationManager, AparteConversationTitleProvider } from '@aparte/core';

/** What the plugin needs of a titler: `@aparte/titler`'s `Titler` has exactly this. */
export interface TitlerLike {
    /** The title: the `budget` best-scored words of the message, in message order. */
    title(message: string, budget?: number): string;
}

export interface TitlerOptions {
    /**
     * The model: a `Titler`, a promise of one (`loadTitler()`), or a loader called
     * once, when the first title is needed — the shape that keeps the model out of
     * the page's critical path.
     */
    titler: TitlerLike | Promise<TitlerLike> | (() => TitlerLike | Promise<TitlerLike>);
    /** Words to keep. Omitted, the model's own default applies (6). */
    budget?: number;
}

/**
 * The title provider alone — for a manager built with the `titleProvider` option, or
 * to compose with another provider. The model is resolved once and cached.
 */
export function createTitleProvider(options: TitlerOptions): AparteConversationTitleProvider {
    let loaded: Promise<TitlerLike> | undefined;
    const model = (): Promise<TitlerLike> => {
        loaded ??= Promise.resolve(typeof options.titler === 'function' ? options.titler() : options.titler);
        return loaded;
    };
    return async (text) => {
        const titler = await model();
        return options.budget === undefined ? titler.title(text) : titler.title(text, options.budget);
    };
}

/**
 * Register the model as the manager's title provider. Returns a teardown that gives
 * the manager back the provider it had — unless another one was set since, which is
 * then left alone.
 */
export function setupTitler(manager: AparteConversationManager, options: TitlerOptions): () => void {
    const previous = manager.getTitleProvider();
    const provider = createTitleProvider(options);
    manager.setTitleProvider(provider);
    return () => {
        if (manager.getTitleProvider() === provider) manager.setTitleProvider(previous);
    };
}
