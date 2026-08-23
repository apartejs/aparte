/**
 * The `AparteAIProvider` contract, checked by the COMPILER rather than at runtime.
 *
 * `AparteAIProvider` used to be a single interface: three required members and
 * fifteen optional ones, with two mutually sufficient execution surfaces inside
 * it, discriminated at runtime by `isFormatAdapter()`. The consequence is the
 * first case below — `{ id, getMetadata, getModels }` typechecked, registered
 * without complaint, and failed on the first message. Nothing at build time said
 * a word.
 *
 * Every `@ts-expect-error` here is load-bearing in both directions: TypeScript
 * fails the build when an expected error does NOT occur, so if the union ever
 * relaxes back into one permissive interface, this file stops compiling. That is
 * the point — a type guard that cannot rot. These assertions are read by
 * `pnpm typecheck:tests`; the runtime assertions below just keep vitest honest
 * about the file being executed.
 */
import { describe, it, expect } from 'vitest';
import { isFormatAdapter } from '../../transport/types.js';
import type {
    AparteAIProvider,
    AparteAIProviderMetadata,
    AparteAIModel,
} from '../model-provider.js';
import type { AparteChatRequest, AparteChatResponse, AparteStreamEvent } from '../chat.js';

const meta = (id: string): AparteAIProviderMetadata => ({ name: id, id, icon: '<svg/>', color: '#000' });
const noModels = (): AparteAIModel[] => [];

// ── The shape that used to compile and could not run ────────────────────────
// @ts-expect-error — neither execution surface: no `chat`, no format adapter.
const neitherSurface: AparteAIProvider = {
    id: 'broken',
    getMetadata: () => meta('broken'),
    getModels: noModels,
};

// A HALF format adapter is just as unusable, and just as silent before this union.
// @ts-expect-error — `buildRequest`/`defaultEndpoint` present, `parseStream` missing.
const halfAdapter: AparteAIProvider = {
    id: 'half',
    getMetadata: () => meta('half'),
    getModels: noModels,
    defaultEndpoint: 'https://example.test',
    buildRequest: (request: AparteChatRequest) => ({ path: '/v1/chat', body: request }),
    authHeaders: (key: string) => ({ Authorization: `Bearer ${key}` }),
};

// An adapter with no way to present a key cannot be called either — which is
// exactly what `isFormatAdapter` checks at runtime, now stated in the type.
// @ts-expect-error — complete format surface, but neither `authHeaders` nor `authQuery`.
const adapterWithoutAuth: AparteAIProvider = {
    id: 'no-auth',
    getMetadata: () => meta('no-auth'),
    getModels: noModels,
    defaultEndpoint: 'https://example.test',
    buildRequest: (request: AparteChatRequest) => ({ path: '/v1/chat', body: request }),
    parseStream: (body: ReadableStream<Uint8Array>) => body as unknown as ReadableStream<AparteStreamEvent>,
};

// ── The two shapes that DO work, and must keep compiling ────────────────────
const formatProvider: AparteAIProvider = {
    id: 'openai-compat',
    getMetadata: () => meta('openai-compat'),
    getModels: noModels,
    defaultEndpoint: 'https://example.test/v1',
    buildRequest: (request: AparteChatRequest) => ({ path: '/chat/completions', body: request }),
    authHeaders: (key: string) => ({ Authorization: `Bearer ${key}` }),
    parseStream: (body: ReadableStream<Uint8Array>) => body as unknown as ReadableStream<AparteStreamEvent>,
    parseText: () => '',
};

// `authQuery` instead of `authHeaders` — the Gemini `?key=` shape.
const queryAuthProvider: AparteAIProvider = {
    id: 'query-auth',
    getMetadata: () => meta('query-auth'),
    getModels: noModels,
    defaultEndpoint: 'https://example.test/v1',
    buildRequest: (request: AparteChatRequest) => ({ path: '/models:stream', body: request }),
    authQuery: (key: string) => ({ key }),
    parseStream: (body: ReadableStream<Uint8Array>) => body as unknown as ReadableStream<AparteStreamEvent>,
};

const chatProvider: AparteAIProvider = {
    id: 'transformers',
    getMetadata: () => meta('transformers'),
    getModels: noModels,
    chat: async (): Promise<AparteChatResponse> => '',
};

// Implementing BOTH is legal — nothing in the split forbids a provider that can
// be driven either way.
const bothSurfaces: AparteAIProvider = {
    id: 'both',
    getMetadata: () => meta('both'),
    getModels: noModels,
    defaultEndpoint: 'https://example.test/v1',
    buildRequest: (request: AparteChatRequest) => ({ path: '/chat', body: request }),
    authHeaders: (key: string) => ({ Authorization: `Bearer ${key}` }),
    parseStream: (body: ReadableStream<Uint8Array>) => body as unknown as ReadableStream<AparteStreamEvent>,
    chat: async (): Promise<AparteChatResponse> => '',
};

describe('AparteAIProvider — the union the compiler enforces', () => {
    it('agrees with isFormatAdapter at runtime on every valid shape', () => {
        // The type split has to describe the runtime probe, not contradict it:
        // whatever the compiler accepts as a format arm, isFormatAdapter must
        // also accept — otherwise one of the two is lying.
        expect(isFormatAdapter(formatProvider)).toBe(true);
        expect(isFormatAdapter(queryAuthProvider)).toBe(true);
        expect(isFormatAdapter(bothSurfaces)).toBe(true);
        expect(isFormatAdapter(chatProvider)).toBe(false);
    });

    it('still rejects at runtime the shapes the compiler now refuses', () => {
        // Cast because the whole point is that these no longer typecheck. They
        // are kept as runtime witnesses: each one is a provider that registers
        // and then cannot answer a message.
        for (const bad of [neitherSurface, halfAdapter, adapterWithoutAuth]) {
            expect(isFormatAdapter(bad as AparteAIProvider)).toBe(false);
        }
        expect((neitherSurface as { chat?: unknown }).chat).toBeUndefined();
    });
});
