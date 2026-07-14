/**
 * LLM-based memory fact extractor.
 *
 * Replaces the regex-pattern detector with a single small LLM call that
 * returns a JSON list of facts. Same shape as before — just a smarter
 * recogniser that handles paraphrasis, mixed FR/EN, multiple facts in one
 * sentence, and identity vs preference vs style classification.
 *
 * Designed to be agnostic (no Angular, no DOM, no AparteConfig coupling) so
 * it can move to `@aparte/engine` as-is when we extract the agnostic core.
 *
 * Calls the same provider that handles chat — fail-soft on any error
 * (returns []), since memory extraction must NEVER block the user reply.
 */

import type { AparteAIProvider, AparteChatMessage } from '@aparte/core';
import { safeJsonParse } from '../parsers/json-repair';

export type FactType =
    | 'identity'    // Name, location, role at fixed scope (Paul, vit à Lyon, dev backend)
    | 'preference'  // Likes / dislikes / wants in general
    | 'style'       // How Aparte should respond (concise, formel, …)
    | 'tech'        // Stack, tools, languages they use
    | 'project'     // What they're working on
    | 'fact';       // Anything else worth remembering long-term

export interface Fact {
    type: FactType;
    content: string;  // Concise statement, ≤ 120 chars, third-person ("Aime X", "Utilise Y").
}

// Designed following industry best practices (2026) :
//   - mem0 production-proven "Personal Information Organizer" framing
//   - Anthropic Skills disjunctive condition pattern (each rule independently sufficient)
//   - Anti-contamination explicit rule (LLM tends to copy from few-shot examples)
//   - Generic placeholders in examples to prevent fact leakage (X, Y, Z patterns)
//   - Tier filtering (skip facts about third parties)
//   - Validated empirically against LFM2.5-1.2B-Thinking ORIGINAL on 7-case test set
const SYSTEM_PROMPT = `You are a Personal Information Organizer for the user's long-term memory.
Your job: extract durable facts that the USER says ABOUT THEMSELVES in a single chat message.

Output a JSON object ONLY (no markdown, no commentary):
{"facts": [{"type": "<TYPE>", "content": "<concise third-person sentence, ≤120 chars>"}]}
or {"facts": []} when nothing memorable.

Types (closed set — pick exactly one per fact):
- identity   → name, location, age, role, family. Stable identifying info.
- preference → likes, dislikes, wants. ("Aime le café", "N'aime pas les notifications")
- style      → how to talk to them. ("Préfère des réponses brèves")
- tech       → tools, languages, frameworks they use. ("Utilise Angular")
- project    → things they're building or working on. ("Projet : Aparte")
- fact       → other durable facts (allergies, recurring schedule, …)

EXTRACTION RULES — each condition below is INDEPENDENT and SUFFICIENT.
Extract one fact as soon as ANY of these is true in the user's message :

- User mentions THEIR OWN name → identity ("S'appelle <name>")
- User mentions THEIR OWN city / country / where they live → identity ("Habite à <place>")
- User mentions THEIR OWN age → identity ("A <n> ans")
- User mentions THEIR OWN role / job / metier → identity ("Métier: <role>")
- User mentions THEIR OWN family / relationship → identity
- User states they LIKE something → preference ("Aime <thing>")
- User states they DON'T LIKE something → preference ("N'aime pas <thing>")
- User states they PREFER something → preference
- User states a style of response they want → style
- User states a TOOL / LANGUAGE / FRAMEWORK they use → tech ("Utilise <tool>")
- User states what they are CURRENTLY working on → project
- Any other durable fact (allergy, recurring habit) → fact

If multiple conditions are true in the same message, extract ALL applicable facts.

DO NOT EXTRACT (output {"facts": []}) when :
- User asks a factual question (capital, weather, calculation)
- User greets, thanks, or acknowledges
- User describes a transient mood ("fatigué", "stressé") or current activity ("je vais déjeuner")
- User QUOTES or PARAPHRASES someone else's message
- User mentions a THIRD PARTY (collègue, ami, parent's facts → NEVER extract these)

CRITICAL ANTI-CONTAMINATION RULES :
- Extract ONLY facts LITERALLY present in the user's current message.
- NEVER copy content from the few-shot examples below into your output.
- Placeholders X, Y, Z in examples are NOT real values — never return them.
- NEVER invent, complete, or paraphrase beyond what is literally stated.
- NEVER store passwords, tokens, precise financial info, or precise medical info.

Few-shot examples — placeholders <NAME>, <PLACE>, <TOOL>, <TOPIC> are illustrative.
NEVER output the literal text from these examples — only use the user's actual message :

Input: "Je m'appelle <NAME>."
Output: {"facts":[{"type":"identity","content":"S'appelle <NAME>"}]}

Input: "I'm <NAME>, je travaille avec <TOOL>."
Output: {"facts":[{"type":"identity","content":"S'appelle <NAME>"},{"type":"tech","content":"Utilise <TOOL>"}]}

Input: "Bonjour, ça va ?"
Output: {"facts":[]}

Input: "Quelle est la capitale de la France ?"
Output: {"facts":[]}

Input: "Mon collègue <NAME> habite à <PLACE>."
Output: {"facts":[]}

Input: "Je suis fatigué aujourd'hui."
Output: {"facts":[]}

Render content in the user's language (FR or EN), third person, ≤120 chars.
Replace placeholders <NAME>/<PLACE>/<TOOL>/<TOPIC> with the user's ACTUAL values from their message.
JSON object ONLY. No preface. No markdown fences. No commentary.`;


/**
 * Extract facts from a single user message.
 *
 * @param provider  An `AparteAIProvider`-like (just needs `.chat()` returning a string).
 * @param modelId   Active model id.
 * @param userText  The user's message.
 * @param signal    Optional abort signal.
 *
 * @returns Facts array, possibly empty. Never throws — failures fall back to [].
 */
export async function extractFacts(
    provider: Pick<AparteAIProvider, 'chat'>,
    modelId: string,
    userText: string,
    signal?: AbortSignal,
): Promise<Fact[]> {
    if (!userText || userText.trim().length < 6) return [];
    if (signal?.aborted) return [];

    const messages: AparteChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userText },
    ];

    try {
        // Local providers implement chat(); if a pure format-adapter (HTTP) is
        // passed, memory extraction just no-ops (it must never block the reply).
        if (typeof provider.chat !== 'function') return [];
        const chatPromise = provider.chat({
            modelId,
            stream: false,
            messages,
            // 0.05 (Liquid default) instead of strict greedy : VL-1.6B
            // degenerates into JSON brace-loops at temp=0 (validated 2026-05-12).
            temperature: 0.05,
        });

        const response = signal
            ? await Promise.race([
                chatPromise,
                new Promise<never>((_, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new DOMException('extractFacts aborted', 'AbortError')),
                    { once: true });
                }),
            ])
            : await chatPromise;

        if (typeof response !== 'string') return [];

        const parsed = extractFirstJsonObject(response);
        if (!parsed || !Array.isArray(parsed.facts)) return [];

        const out: Fact[] = [];
        for (const raw of parsed.facts as unknown[]) {
            if (!raw || typeof raw !== 'object') continue;
            const f = raw as Record<string, unknown>;
            const type = String(f['type'] ?? '');
            const content = String(f['content'] ?? '').trim();
            if (!isFactType(type) || content.length < 3 || content.length > 200) continue;
            out.push({ type, content: content.slice(0, 120) });
        }
        return out;
    } catch (err: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((err as any)?.name === 'AbortError') return [];
        return [];
    }
}


// ── Helpers (mirrored from classifier — duplicated so this file stays
// agnostic and can move to engine without dragging classifier with it).

function isFactType(t: string): t is FactType {
    return t === 'identity' || t === 'preference' || t === 'style'
        || t === 'tech' || t === 'project' || t === 'fact';
}

function extractFirstJsonObject(response: string): any | null {
    let jsonStr: string | null = null;
    const start = response.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < response.length; i++) {
        const ch = response[i];
        if (escape) { escape = false; continue; }
        if (inString) {
            if (ch === '\\') escape = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) { jsonStr = response.slice(start, i + 1); break; }
        }
    }
    if (!jsonStr) return null;
    return safeJsonParse(jsonStr);
}
