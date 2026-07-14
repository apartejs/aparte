/* eslint-disable @typescript-eslint/no-unused-vars --
 * Intentional stub: the LLM-classifier scaffolding (SYSTEM_PROMPT + buildClassifierMessages /
 * extractFirstJsonObject / interpret) is kept for a future wiring pass — classify() currently
 * uses a heuristic fallback. Faithful to the source, which shipped the same not-yet-wired
 * helpers. tsconfig also keeps noUnusedLocals/Params off (the source engine's own setting).
 */
import { AparteConfig } from '@aparte/core';
import type { AparteChatMessage } from '@aparte/core';
import type { OrchestratorContext, OrchestratorRoute, ArtifactKind } from './routes';
import { safeJsonParse } from '../parsers/json-repair';

// ────────────────────────────────────────────────────────────────────────────
// Schema constants
// ────────────────────────────────────────────────────────────────────────────

const VALID_ARTIFACT_TYPES: ReadonlySet<ArtifactKind> = new Set([
    'react', 'html', 'js', 'css', 'svg',
    'text', 'markdown', 'json', 'csv',
    'python', 'typescript', 'bash', 'sql',
    'pdf', 'xlsx', 'docx',
] as const);

// ────────────────────────────────────────────────────────────────────────────
// Prompt
//
// Design principles:
//
// 1. ONE call, ONE schema, ONE responsibility — choose between {chat, asset,
//    clarify}. Small models perform vastly better when each prompt has a
//    single decision to make.
//
// 2. Few-shot: 12 diverse, distractor-rich examples (FR + EN). They cover
//    the failure modes we observed in the wild:
//      - deictic references ("un autre fichier", "comme avant")
//      - meta questions about a concept ("c'est quoi la licence MIT")
//      - explicit deliverable requests with a verb ("génère", "écris")
//      - genuinely ambiguous output formats
//
// 3. The "clarify" branch is reserved STRICTLY for "I cannot pick an output
//    format". It must NEVER be used as an "I don't know about the topic"
//    escape hatch. The examples make this explicit.
//
// 4. Conversation history is provided as system context — the model resolves
//    references against it instead of guessing.
//
// 5. The model never invents new artifactType values: the enum is closed.
// ────────────────────────────────────────────────────────────────────────────

const ARTIFACT_TYPES_LIST = `
- "react"      → interactive React UI (component / mini-app with state)
- "html"       → standalone HTML page (CSS/JS inline allowed)
- "js"         → standalone JavaScript snippet (no JSX, no React)
- "css"        → CSS stylesheet
- "svg"        → SVG illustration / icon
- "text"       → plain text file (.txt) — letter, message, note, list, log…
- "markdown"   → Markdown document (.md) — README, article, structured note
- "json"       → JSON data file
- "csv"        → CSV / spreadsheet data
- "python"     → Python script (.py)
- "typescript" → TypeScript file (.ts / .tsx, non-React)
- "bash"       → Shell / Bash script (.sh)
- "sql"        → SQL queries / schema (.sql)
- "pdf"        → PDF file (.pdf) — invoice, report, certificate, document
- "xlsx"       → Excel spreadsheet (.xlsx) — table, dataset, financial sheet
- "docx"       → Word document (.docx) — letter, formatted report, contract
`.trim();

// NOTE : the leading `/no_think` directive is appended at call time *only* for
// LFM2.5-Thinking. It tells the Thinking variant to skip its <think>…</think>
// reasoning block on this prompt. On non-Thinking models (Base, VL-1.6B) the
// token is unrecognised noise that confuses the model — see classify() below
// where we prepend it conditionally.
const SYSTEM_PROMPT = `You are Aparte's routing classifier. Your only job is to decide how to handle the user's most recent message in a chat.
Do not reason at length. Output the JSON immediately.

You output ONE JSON object — no prose, no markdown fences, no extra brackets.

Schemas (pick exactly one):

A) Conversational reply (default for greetings, factual questions, explanations, math, translation, summarization, opinions — anything that does NOT produce a deliverable artifact):
{"route":"chat","reason":"<one sentence: why this is a chat reply, not an artifact>"}

B) Deliverable artifact (the user asks you to PRODUCE something — any code snippet, file, document, illustration, data, UI component — short or long, simple or complex):
{"route":"asset","artifactType":"<see enum below>","description":"<concise rephrasing of WHAT to produce>","reason":"<one sentence: why this type was chosen>"}

  artifactType rules (pick the MOST SPECIFIC type):
  - "react" for any React component (JSX, hooks). NEVER use "js" for React code.
  - "js" for plain JavaScript only (no JSX, no React).
  - "html" for a standalone web page.
  - "python" for any Python script, including scripts using libraries (reportlab, pandas, etc.).
  - "typescript" for TypeScript that is NOT a React component.
  - "bash" for shell scripts.
  - "sql" for SQL queries or schema.
  - "csv" for tabular data shown inline. "json" for structured data. "text" for plain text.
  - "pdf"  when the user explicitly wants a downloadable PDF file (facture, report, certificate, "génère un PDF…").
  - "xlsx" when the user explicitly wants a downloadable Excel file ("fichier Excel", "tableur", "spreadsheet"). Prefer "csv" if the user just wants tabular data inline.
  - "docx" when the user explicitly wants a downloadable Word document ("fichier Word", ".docx", "document Word").

Allowed artifactType values (closed enum):
${ARTIFACT_TYPES_LIST}

C) Output-format clarification (ONLY when the user wants a deliverable but the format is genuinely ambiguous between two very different shapes):
{"route":"clarify","question":"<short question about the OUTPUT FORMAT>","options":[{"title":"<format A>"},{"title":"<format B>"}]}

Critical rules:
1. Use "asset" for ANY code or content request — snippet, example, full file, component. Short OR long, it is always an artifact.
2. Use "chat" ONLY for pure knowledge/explanation questions with no deliverable. ("c'est quoi un README ?" → chat. "explique la licence MIT" → chat.)
3. NEVER use "clarify" to ask about the topic. Only for genuine format ambiguity: "JSON or CSV?", "React or plain HTML?".
4. Resolve deictic references from conversation history. "un autre fichier", "comme avant" → inherit previous artifactType.
5. The "description" field restates WHAT to produce. It will be passed to the generator verbatim.
6. Output a SINGLE valid JSON object. No trailing brackets. No markdown.

Few-shot examples:

User: bonjour
Output: {"route":"chat"}

User: explique-moi la licence MIT
Output: {"route":"chat"}

User: c'est quoi un README ?
Output: {"route":"chat"}

User: c'est quoi un décorateur en Python ?
Output: {"route":"chat"}

User: comment fonctionne asyncio en Python ?
Output: {"route":"chat"}

User: pourquoi utiliser TypeScript plutôt que JavaScript ?
Output: {"route":"chat"}

User: comment fonctionne un closure en JavaScript ?
Output: {"route":"chat"}

User: donne-moi un exemple de fetch avec async/await
Output: {"route":"asset","artifactType":"js","description":"snippet JavaScript illustrant fetch avec async/await"}

User: montre-moi comment trier un tableau en JS
Output: {"route":"asset","artifactType":"js","description":"snippet JavaScript illustrant le tri d'un tableau"}

User: montre-moi un exemple de décorateur en Python
Output: {"route":"asset","artifactType":"python","description":"exemple Python illustrant l'utilisation d'un décorateur"}

User: génère un exemple React illustrant les closures
Output: {"route":"asset","artifactType":"react","description":"composant React illustrant le concept de closure avec useState"}

User: montre un exemple React qui illustre useEffect
Output: {"route":"asset","artifactType":"react","description":"composant React illustrant useEffect avec un exemple concret"}

User: écris un script Python qui lit un fichier CSV avec pandas
Output: {"route":"asset","artifactType":"python","description":"script Python lisant un fichier CSV avec pandas"}

User: génère-moi un fichier licence MIT stp
Output: {"route":"asset","artifactType":"text","description":"fichier texte contenant le texte standard de la licence MIT"}

User: écris-moi un README pour un projet Node
Output: {"route":"asset","artifactType":"markdown","description":"README structuré pour un projet Node.js"}

User: build me a React counter with + and - buttons
Output: {"route":"asset","artifactType":"react","description":"interactive React counter with increment and decrement buttons"}

User: montre-moi un composant React avec useState
Output: {"route":"asset","artifactType":"react","description":"snippet React illustrant useState avec un compteur"}

User: dessine un soleil en SVG
Output: {"route":"asset","artifactType":"svg","description":"illustration SVG d'un soleil stylisé"}

User: fais-moi un tableau CSV des départements français
Output: {"route":"asset","artifactType":"csv","description":"tableau CSV listant les départements français (numéro, nom, région)"}

User: je veux un fichier texte avec juste "bonjour" dedans
Output: {"route":"asset","artifactType":"text","description":"fichier texte ne contenant que le mot bonjour"}

[history: assistant just produced a JSON file]
User: un autre fichier stp
Output: {"route":"asset","artifactType":"json","description":"un autre fichier JSON dans la même veine que le précédent"}

User: génère-moi un fichier de configuration pour mon projet
Output: {"route":"clarify","question":"Quel format de configuration ?","options":[{"title":"JSON"},{"title":"YAML (en texte)"}]}

User: crée-moi une page HTML avec un menu de navigation
Output: {"route":"asset","artifactType":"html","description":"page HTML autonome avec menu de navigation","reason":"l'utilisateur demande une page web complète"}

User: crée un générateur de PDF en Python avec reportlab
Output: {"route":"asset","artifactType":"python","description":"script Python utilisant reportlab pour générer un PDF","reason":"demande explicite d'un script Python avec une bibliothèque spécifique"}

User: écris un script bash pour sauvegarder mes fichiers
Output: {"route":"asset","artifactType":"bash","description":"script shell de sauvegarde de fichiers","reason":"demande d'un script bash"}

User: génère une requête SQL pour lister les utilisateurs
Output: {"route":"asset","artifactType":"sql","description":"requête SQL SELECT sur une table utilisateurs","reason":"demande explicite de SQL"}

User: génère un PDF de facture pour ACME avec 3 articles
Output: {"route":"asset","artifactType":"pdf","description":"PDF de facture pour ACME avec 3 articles, en-tête, lignes et total"}

User: fais-moi un fichier Excel avec les départements français
Output: {"route":"asset","artifactType":"xlsx","description":"fichier Excel avec les départements français (numéro, nom, région) sur une feuille"}

User: génère un document Word de lettre de motivation pour un poste de développeur
Output: {"route":"asset","artifactType":"docx","description":"document Word contenant une lettre de motivation pour un poste de développeur"}

Now classify the user's latest message. Output ONLY the JSON.`;

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ CLASSIFIER DISABLED (2026-05-20).
 *
 * File generation no longer routes through this dedicated LLM routing call.
 * The validated POC flow lets the MODEL decide via a `generate_file`
 * tool_call (see apps/home/src/app/core/tools/generate-file-tool.ts and the
 * block comment in apps/home/.../orchestrator.service.ts).
 *
 * `classify()` is kept as an exported symbol (the engine barrel re-exports it,
 * and tests still reference the type) but its LLM-calling body is COMMENTED
 * OUT below. It now returns the deterministic fallback directly :
 *   - documents attached → 'rag'
 *   - otherwise          → 'direct'
 *
 * To restore the classifier : un-comment the original body below and re-wire
 * the `classify()` call in orchestrator.service.ts.
 *
 * @param signal Optional AbortSignal (retained for signature compatibility).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function classify(ctx: OrchestratorContext, signal?: AbortSignal): Promise<OrchestratorRoute> {
    const fallback = (): OrchestratorRoute => ctx.hasDocuments
        ? { type: 'rag', queryText: ctx.userMessage }
        : { type: 'direct' };

    // ── Classifier disabled — return the deterministic route directly. ──────
    return fallback();

    /* ── LEGACY classifier body (commented out — do NOT delete) ─────────────
    if (signal?.aborted) return fallback();

    const config = AparteConfig.getModelConfig();
    const providerId = config.defaultProvider;
    if (!providerId) return fallback();

    const provider = AparteConfig.getAIProvider(providerId);
    if (!provider) return fallback();

    try {
        const messages = buildClassifierMessages(ctx);

        // Classifier is a JSON-only decision task — cap output tightly. For
        // LFM2.5-Thinking we prefill `</think>\n\n` so the model skips the
        // thinking block (otherwise 500-1500 tokens are wasted reasoning
        // before emitting the 30-byte JSON). Base / VL-1.6B don't think and
        // emit valid JSON directly from a clean prompt — no prefill needed.
        const isThinking = /thinking/i.test(ctx.modelId ?? '');
        const prefill = isThinking ? '</think>\n\n' : undefined;
        const chatPromise = AparteConfig.getTransport().chat(provider, {
            modelId: ctx.modelId,
            stream: false,
            messages,
            temperature: 0.05,
            maxTokens: 64,
            ...(prefill ? { prefill } : {}),
        }, undefined, { providerId });

        const response = signal
            ? await Promise.race([
                chatPromise,
                new Promise<never>((_, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new DOMException('classify aborted', 'AbortError')),
                    { once: true });
                }),
            ])
            : await chatPromise;

        if (typeof response !== 'string') return fallback();

        // For Thinking with the `</think>\n\n` prefill, the streamer skips
        // the prefill and the response already starts with the JSON `{`. No
        // re-attachment needed for either path now (VL uses no prefill).
        const parsed = extractFirstJsonObject(response);
        if (!parsed) return fallback();

        return interpret(parsed, ctx) ?? fallback();
    } catch (err: any) {
        if (err?.name === 'AbortError') return fallback();
        console.warn('[Orchestrator] classifier error — falling back:', err);
        return fallback();
    }
    ── END legacy classifier body ─────────────────────────────────────────── */
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function buildClassifierMessages(ctx: OrchestratorContext): AparteChatMessage[] {
    // `/no_think` is a LFM2.5-Thinking control token (skip <think>...</think>
    // reasoning on this call). Prepend ONLY for Thinking ; on Base / VL-1.6B
    // it becomes parasitic prompt noise that confuses output.
    const isThinking = /thinking/i.test(ctx.modelId ?? '');
    const systemContent = isThinking ? `/no_think\n${SYSTEM_PROMPT}` : SYSTEM_PROMPT;
    const messages: AparteChatMessage[] = [
        { role: 'system', content: systemContent },
    ];

    // Inject condensed history so the model can resolve deictic references.
    if (ctx.recentTurns && ctx.recentTurns.length > 0) {
        const lines = ctx.recentTurns
            .filter(t => t.role === 'user' || t.role === 'assistant')
            .map(t => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text.slice(0, 400)}`)
            .join('\n');
        if (lines) {
            messages.push({
                role: 'system',
                content: `Conversation history (most recent last) — use it ONLY to resolve references like "un autre", "comme avant":\n${lines}`,
            });
        }
    }

    messages.push({ role: 'user', content: ctx.userMessage });
    return messages;
}

/** Find the first balanced top-level JSON object in a noisy LLM response. */
function extractFirstJsonObject(response: string): any | null {
    let jsonStr: string | null = null;
    const start = response.indexOf('{');
    if (start !== -1) {
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
    }
    if (!jsonStr) return null;
    return safeJsonParse(jsonStr);
}

/** Map a parsed classifier payload to a strongly-typed route. */
function interpret(parsed: any, ctx: OrchestratorContext): OrchestratorRoute | null {
    if (!parsed || typeof parsed !== 'object') return null;

    const route = String(parsed.route ?? '').toLowerCase();

    if (route === 'asset' || route === 'code') {
        const artifactType = parsed.artifactType;
        const description = typeof parsed.description === 'string' && parsed.description.trim()
            ? parsed.description.trim()
            : ctx.userMessage;
        if (VALID_ARTIFACT_TYPES.has(artifactType)) {
            return { type: 'code', description, artifactType: artifactType as ArtifactKind };
        }
        return null;
    }

    if (route === 'clarify') {
        const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';
        const options = Array.isArray(parsed.options)
            ? parsed.options
                .filter((o: any) => o && typeof o.title === 'string' && o.title.trim())
                .map((o: any) => ({
                    title: String(o.title).trim(),
                    description: typeof o.description === 'string' ? o.description : undefined,
                }))
            : [];
        if (question && options.length >= 2) {
            return {
                type: 'clarify',
                question,
                options,
                multiple: parsed.multiple === true,
            };
        }
        return null;
    }

    if (route === 'chat' || route === 'direct') {
        return ctx.hasDocuments
            ? { type: 'rag', queryText: ctx.userMessage }
            : { type: 'direct' };
    }

    return null;
}
