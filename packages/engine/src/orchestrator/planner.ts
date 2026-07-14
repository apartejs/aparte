import { AparteConfig } from '@aparte/core';
import type { OrchestratorContext, ArtifactKind } from './routes';
import { safeJsonParse } from '../parsers/json-repair';

/**
 * Lightweight artifact plan returned by the silent planner LLM call.
 *
 * Used by the orchestrator to (a) bias the generation prompt with concrete
 * structural hints and (b) reaffirm the artifact `type` (the classifier's
 * choice can be overridden when the planner sees a better fit, e.g.
 * "react" → "html" for a static document).
 */
export interface ArtifactPlan {
    /** Stable artifact kind (matches the renderer/MIME mapping in the orchestrator). */
    type: ArtifactKind;
    /** 1‒5 short component / building block names (e.g. "Header", "Counter", "Footer"). */
    components: string[];
    /** One short sentence describing the layout / behaviour. */
    layout: string;
}

// A no-think directive is prepended at call time only when the consumer's
// model capabilities provide one (see planArtifact). Agnostic default: none.
const SYSTEM_PROMPT = `You are a UI/code planner. Do not reason at length. Output the JSON immediately.
Given a user request that asks to build something interactive, output ONLY a single JSON object describing the plan.

Schema (no other fields, no prose):
{ "type": "react" | "html" | "js" | "css" | "svg",
  "components": ["..."],
  "layout": "..." }

Rules:
- "type" picks the best primitive for the job.
  * "react" for interactive UI with state.
  * "html" for static documents, landing pages, forms with no JS state.
  * "svg" for vector illustrations.
  * "js" for pure logic/snippets without UI.
  * "css" for stylesheet examples.
- "components" = 1 to 5 short building-block names (e.g. ["Header","Counter","Footer"]).
- "layout" = one concise sentence about structure/behaviour.
- Output the JSON object and NOTHING ELSE. No markdown fences, no explanation.`;

const VALID_TYPES: ReadonlySet<ArtifactKind> = new Set([
    'react', 'html', 'js', 'css', 'svg',
    'text', 'markdown', 'json', 'csv',
] as const);

/**
 * Run a silent (non-streamed) planning call before generation.
 *
 * Returns `null` when the planner can't produce a usable plan — the orchestrator
 * is then expected to skip the artifact generation prompt entirely (and let the
 * model answer naturally). This keeps the user experience fail-soft.
 *
 * @param ctx      The orchestrator context (user message, model id, …).
 * @param fallback The artifact kind suggested by the classifier; used as the
 *                 default `type` when the planner JSON omits/garbles it.
 * @param signal   Optional abort signal — propagates `aparte:abort`.
 */
export async function planArtifact(
    ctx: OrchestratorContext,
    fallback: ArtifactKind,
    signal?: AbortSignal,
): Promise<ArtifactPlan | null> {
    const config = AparteConfig.getModelConfig();
    const providerId = config.defaultProvider;
    if (!providerId) return null;

    const provider = AparteConfig.getAIProvider(providerId);
    if (!provider) return null;

    if (signal?.aborted) return null;

    try {
        // Cap tokens + skip thinking on this JSON-only planning call. The
        // no-think directive and skip-think prefill come from the consumer's
        // model capabilities (the engine stays model-agnostic); the agnostic
        // default injects neither.
        const noThink = ctx.capabilities?.noThinkDirective;
        const systemContent = noThink ? `${noThink}\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;
        const chatPromise = AparteConfig.getTransport().chat(provider, {
            modelId: ctx.modelId,
            stream: false,
            messages: [
                { role: 'system', content: systemContent },
                { role: 'user', content: ctx.userMessage },
            ],
            // 0.05 (Liquid default) instead of strict greedy : VL-1.6B
            // degenerates into brace-loops at temp=0 on JSON-only prompts
            // (validated 2026-05-12). 0.05 stays nearly-deterministic but
            // breaks the degenerate cycle.
            temperature: 0.05,
            maxTokens: 128,
            ...(ctx.capabilities?.skipThinkingPrefill ? { prefill: ctx.capabilities.skipThinkingPrefill } : {}),
        }, undefined, { providerId });

        const response = signal
            ? await Promise.race([
                chatPromise,
                new Promise<never>((_, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new DOMException('planArtifact aborted', 'AbortError')),
                    { once: true });
                }),
            ])
            : await chatPromise;

        if (typeof response !== 'string') return null;

        // Extract first balanced JSON object — string/escape-aware so a `}`
        // inside a string value doesn't truncate the object.
        let jsonStr: string | null = null;
        const start = response.indexOf('{');
        if (start !== -1) {
            let depth = 0;
            let inStr: null | '"' | "'" = null;
            for (let i = start; i < response.length; i++) {
                const ch = response[i];
                if (inStr) {
                    if (ch === inStr && response[i - 1] !== '\\') inStr = null;
                    continue;
                }
                if (ch === '"' || ch === "'") inStr = ch as '"' | "'";
                else if (ch === '{') depth++;
                else if (ch === '}') {
                    depth--;
                    if (depth === 0) { jsonStr = response.slice(start, i + 1); break; }
                }
            }
        }
        if (!jsonStr) return syntheticPlan(fallback);

        const parsed = safeJsonParse(jsonStr) as any;
        if (!parsed || typeof parsed !== 'object') return syntheticPlan(fallback);

        const type: ArtifactKind = VALID_TYPES.has(parsed?.type)
            ? (parsed.type as ArtifactKind)
            : fallback;

        const components = Array.isArray(parsed?.components)
            ? parsed.components
                .filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
                .slice(0, 5)
            : [];

        const layout = typeof parsed?.layout === 'string' && parsed.layout.trim().length > 0
            ? parsed.layout.trim().slice(0, 280)
            : '';

        if (components.length === 0 && layout.length === 0) return syntheticPlan(type);

        return { type, components, layout };
    } catch (err: any) {
        if (err?.name === 'AbortError') return null;
        console.warn('[Orchestrator] planner error — using synthetic plan:', err);
        return syntheticPlan(fallback);
    }
}

/** Minimal plan built from the classifier's artifact kind — used as a fallback
 *  when the LLM planner fails (e.g. thinking models with no JSON output). */
function syntheticPlan(kind: ArtifactKind): ArtifactPlan {
    return { type: kind, components: [], layout: '' };
}
