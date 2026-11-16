/**
 * `createModelCatalogue`: the models a chat can choose from, when no provider in the page runs them.
 */
import type { AparteAIModel, AparteAIProvider, AparteAIProviderMetadata } from '../types/model-provider.js';
import { AparteError, AparteErrorCode } from '../types/errors.js';

/** What {@link createModelCatalogue} takes: who lists the models, and the models. */
export interface AparteModelCatalogueOptions extends Omit<AparteAIProviderMetadata, 'configSchema'> {
    /** The models to choose from, as `<aparte-model-selector>` lists them and a request names them. */
    models: AparteAIModel[];
}

/**
 * A provider that lists models and runs none, for a chat whose turns run elsewhere: a server
 * loop (`createAgentStreamRunner`) or an agent with its own loop. Register it and the rest of
 * the page treats its models like any provider's: `<aparte-model-selector>` lists them, the
 * one selected goes out on every request (`setModelConfig`, or the selector with `persist`),
 * and a model's capabilities gate what a model without them cannot do (tools, images).
 *
 * Nothing in it ever answers a turn: with no runner of the turns to call instead, a send ends
 * in an error that says so (`PROVIDER_MISCONFIGURED`), never in silence.
 *
 * @example
 * ```ts
 * import { aparteGlobalConfig, createModelCatalogue } from '@aparte/core';
 *
 * aparteGlobalConfig.registerAIProvider(createModelCatalogue({
 *   id: 'server',
 *   name: 'Our models',
 *   models: [
 *     { id: 'qwen3-32b', name: 'Qwen3 32B' },
 *     { id: 'gemma-3-27b', name: 'Gemma 3 27B' },
 *   ],
 * }));
 * ```
 */
export function createModelCatalogue(options: AparteModelCatalogueOptions): AparteAIProvider {
    const { models, ...metadata } = options;
    return {
        id: metadata.id,
        getMetadata: () => ({ ...metadata }),
        getModels: () => [...models],
        chat: () => Promise.reject(new AparteError(
            `"${metadata.id}" is a model catalogue: it lists models and runs none. The turns of this chat have to run elsewhere, through a stream runner (createAgentStreamRunner for a server loop).`,
            AparteErrorCode.PROVIDER_MISCONFIGURED,
            { providerId: metadata.id },
        )),
    };
}
