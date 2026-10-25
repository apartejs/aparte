/**
 * The runner contract — where the provider's plumbing stops and the model begins.
 *
 * A runner owns loading and calling a model; the provider owns everything around it
 * (the worker, the queue, download progress, cancel, the stream into the transcript, the
 * catalogue). Two runners ship with the package (`text-generation`, `image-text-to-text`),
 * and an app can point `TransformersModelConfig.runner` at a module of its own that
 * exports `createRunner` — the worker imports it.
 *
 * Sized for the hardest known consumer, not the easiest: a runner EMITS the full stream
 * vocabulary (text, thinking, tool_use, done, error — not tokens), has a command lane for
 * what is not a generation (swapping an adapter, warming something up), reports progress
 * with a free-form `detail`, and can dispose. A research-grade provider that today
 * carries its own worker fits here without giving up anything of its own.
 *
 * A runner is given the tools the request allows (`tools`, when the model declares
 * `function_calling` and the app registered some) and the request's `toolChoice`, and can emit
 * `tool_use` for them. The built-in runners take neither: they warn when a turn needs a tool
 * call they cannot carry.
 */

import type { AparteChatMessage, AparteChatRequest, AparteStreamEvent, AparteTool } from '@aparte/core';

/** A tool as a runner sees it: what a model needs to call it, no more. */
export type RunnerTool = Pick<AparteTool, 'name' | 'description' | 'inputSchema'>;

/** The Transformers.js module, as the worker resolved it — a runner never imports its own copy. */
export type TransformersModule = typeof import('@huggingface/transformers');

/** ONNX dtype, or a per-part map (`{ decoder_model_merged: 'q4' }`). */
export type Dtype = string | Record<string, string>;
export type Device = 'webgpu' | 'wasm' | 'auto';

/** The runners this package ships. Selected with `TransformersModelConfig.task`. */
export type BuiltInRunner = 'text-generation' | 'image-text-to-text';

export interface RunnerProgress {
    status: 'downloading' | 'loading' | 'cached' | 'ready';
    file?: string;
    /** 0–100. */
    progress?: number;
    /** Anything a runner wants to say that the four statuses do not — an adapter name, a stage. */
    detail?: unknown;
}

export interface GenerationOptions {
    maxTokens?: number;
    temperature?: number;
    seed?: number;
}

/** What a runner is created with. */
export interface RunnerContext {
    transformers: TransformersModule;
    modelId: string;
    dtype?: Dtype;
    /** Where the model runs: `'webgpu'` or `'wasm'` — the host resolves `'auto'` before a runner is created. */
    device?: Device;
    /** Download / load progress, forwarded to the page. */
    progress(p: RunnerProgress): void;
    /** A developer-facing warning (dropped content, an unsupported option). Said once per message. */
    warn(message: string): void;
}

export interface RunnerGenerateInput {
    /** The conversation, WITH its content parts — the runner decides what to keep. */
    messages: AparteChatMessage[];
    options: GenerationOptions;
    /** The tools this turn may call — the app's registration, not a list the runner keeps. Absent when there are none. */
    tools?: RunnerTool[];
    /** `'auto'`, `'none'` (answer directly this turn) or a tool the model must call. Absent when the request sets none. */
    toolChoice?: AparteChatRequest['toolChoice'];
    /** The stream, in aparté's vocabulary. `done` and `error` are the host's to close on. */
    emit(event: AparteStreamEvent): void;
    /** Fired when the page cancels; wire it to the model's stop. */
    signal: AbortSignal;
}

export interface TransformersRunner {
    /** Resolve after the last emit. Emitting `done` is optional — the host closes the stream either way. */
    generate(input: RunnerGenerateInput): Promise<void>;
    /** The extended surface: anything that is not a generation, opaque to the provider. */
    command?(name: string, payload: unknown): Promise<unknown>;
    dispose?(): void | Promise<void>;
}

export type CreateRunner = (ctx: RunnerContext) => Promise<TransformersRunner>;

/** What a runner module exports. */
export interface RunnerModule {
    createRunner: CreateRunner;
}
