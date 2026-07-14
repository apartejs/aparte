/**
 * presets.ts — vendor DATA for well-known OpenAI-compatible endpoints.
 *
 * A preset is nothing but an `OpenAICompatProviderOptions` literal: base URL +
 * branding (icon/color/helpUrl) carried over from the retired per-vendor
 * packages. No code varies per vendor — that is the whole point.
 *
 * ```ts
 * AparteConfig.registerAIProvider(createOpenAICompatProvider(presets.MISTRAL));
 * ```
 *
 * Local servers (LM Studio, Ollama) are served through their OpenAI-compat
 * `/v1` endpoints — same format, `isLocal` just relaxes the key requirement.
 */

import type { OpenAICompatProviderOptions } from './index.js';

const OPENAI: OpenAICompatProviderOptions = {
    id: 'openai',
    baseURL: 'https://api.openai.com/v1',
    name: 'OpenAI',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>`,
    color: '#10a37f',
    description: 'GPT-4o, GPT-4 Turbo, and the O1 reasoning models',
    helpUrl: 'https://platform.openai.com/api-keys',
};

const MISTRAL: OpenAICompatProviderOptions = {
    id: 'mistral',
    baseURL: 'https://api.mistral.ai/v1',
    name: 'Mistral AI',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l4 22-4-8-4 8 4-22z"/></svg>`,
    color: '#fd7e14',
    description: 'European AI: Mistral Large, Mixtral, Codestral',
    helpUrl: 'https://console.mistral.ai/api-keys/',
};

const ZAI: OpenAICompatProviderOptions = {
    id: 'zai',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    name: 'Z.ai (Zhipu)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    color: '#6366f1',
    description: "Access Zhipu AI's free GLM models",
    hasFreeModels: true,
    helpUrl: 'https://open.bigmodel.cn',
};

const OPENROUTER: OpenAICompatProviderOptions = {
    id: 'openrouter',
    baseURL: 'https://openrouter.ai/api/v1',
    name: 'OpenRouter',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>`,
    color: '#000000',
    description: 'Access 100+ AI models through a single API',
    hasFreeModels: true,
    helpUrl: 'https://openrouter.ai/keys',
    // OpenRouter attribution headers (sent on chat + model fetch).
    extraHeaders: {
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : '',
        'X-Title': 'aparté',
    },
};

const LMSTUDIO: OpenAICompatProviderOptions = {
    id: 'lmstudio',
    baseURL: 'http://localhost:1234/v1',
    name: 'LM Studio',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1h1v3h-1zM14 1h1v3h-1zM9 20h1v3h-1zM14 20h1v3h-1zM20 9h3v1h-3zM20 14h3v1h-3zM1 9h3v1H1zM1 14h3v1H1z"/></svg>`,
    color: '#444444',
    description: 'Run LLMs locally with the LM Studio app',
    hasFreeModels: true,
    isLocal: true,
    helpUrl: 'https://lmstudio.ai/',
};

// Ollama through its OpenAI-compat endpoint (`/v1`), NOT its native `/api/chat`.
// Same chat-completions format as everyone else; the native-protocol niceties
// (inline base64 images, Ollama-shaped tool calls, keep_alive) don't apply —
// see the README's Ollama section for the behavioural delta.
const OLLAMA: OpenAICompatProviderOptions = {
    id: 'ollama',
    baseURL: 'http://localhost:11434/v1',
    name: 'Ollama',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10 10 10 0 0 1-10-10 10 10 0 0 1 10-10zM12 11l4 2-4 2-4-2 4-2zM12 6v5M12 15v3"/></svg>`,
    color: '#57534e',
    description: 'Run LLMs locally — free and fully private',
    hasFreeModels: true,
    isLocal: true,
    helpUrl: 'https://ollama.com/',
};

/** Vendor presets for {@link createOpenAICompatProvider}. Pure data. */
export const presets = { OPENAI, MISTRAL, ZAI, OPENROUTER, LMSTUDIO, OLLAMA } as const;
