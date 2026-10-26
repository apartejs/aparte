/**
 * Which model the agent runs on, from the environment — the one line that differs between the
 * scripted demo, OpenAI, and any server that speaks Chat Completions.
 *
 * - nothing set: the keyless `DemoModel` (`DEMO_DELAY_MS` between its words, 30 by default);
 * - `OPENAI_API_KEY`: OpenAI, on `MODEL` or the SDK's default model;
 * - `MODEL_BASE_URL` (+ `MODEL`, `MODEL_API_KEY`): any Chat Completions server — Mistral, Groq,
 *   OpenRouter, a local Ollama or llama.cpp.
 *
 * Tracing exports to OpenAI, so it is on only when an OpenAI key is there to receive it.
 */
import { OpenAIProvider, Runner } from '@openai/agents';
import { DemoModel } from './demo-model.js';

/** `process.env`, or any record with the four names above. */
export type ModelEnv = Record<string, string | undefined>;

export function runnerFromEnv(env: ModelEnv): Runner {
    const tracingDisabled = !env.OPENAI_API_KEY;
    if (env.MODEL_BASE_URL) {
        if (!env.MODEL) throw new Error('MODEL_BASE_URL is set: set MODEL to the model to call there, such as mistral-small-latest.');
        return new Runner({
            modelProvider: new OpenAIProvider({ baseURL: env.MODEL_BASE_URL, apiKey: env.MODEL_API_KEY ?? 'unused', useResponses: false }),
            model: env.MODEL,
            tracingDisabled,
        });
    }
    if (env.OPENAI_API_KEY) return new Runner({ ...(env.MODEL ? { model: env.MODEL } : {}), tracingDisabled });
    return new Runner({ model: new DemoModel(Number(env.DEMO_DELAY_MS ?? 30)), tracingDisabled });
}
