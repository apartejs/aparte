# Aparte Agent Layer

> **Statut** : scaffolding V1.x (mai 2026). Pas branché en V1 ship.
> **Pattern** : agent loop AG-UI compliant (SOTA 2026).

---

## TL;DR

Cette couche implémente le pattern **agent loop** standard (Claude Code, Cursor, Replit Agent) :

```
while (hasToolCalls) {
  llmResponse = await llm.call(messages, tools);
  toolCalls = parseToolCalls(llmResponse);
  if (toolCalls.length === 0) break;
  for (call of toolCalls) {
    result = await registry.get(call.name).handler(call.args);
    messages.push({ role: 'tool', content: result });
  }
}
```

Évents émis selon **protocole AG-UI** ([ag-ui-protocol/ag-ui](https://github.com/ag-ui-protocol/ag-ui)) :
`RUN_STARTED`, `TEXT_MESSAGE_START/CONTENT/END`, `TOOL_CALL_START/ARGS/END/RESULT`,
`RUN_FINISHED`, `RUN_ERROR`.

**Conséquence iso** : la MÊME logique `runAgent()` tourne en browser (apps/home UI) et
en Node (tests-node). Les consumers de l'event stream diffèrent :
- Browser → render UI progressive (timeline tool calls, streamed text)
- Node → record events, assert sur la timeline

---

## Fichiers

```
agent/
├── events.ts                 ← types AG-UI (RunStarted, TextMessage*, ToolCall*, ...)
├── tool.ts                   ← Tool descriptor + Registry
├── agent-loop.ts             ← while(tool_use) pure logic
├── parsers/
│   └── pythonic-parser.ts    ← LFM2.5 Pythonic + Hermes fallback
└── tools/                    ← (V1.x) wrap existing apps/home services as Tools
    ├── retrieve-skill.tool.ts     (TODO)
    ├── retrieve-file.tool.ts      (TODO)
    ├── run-code.tool.ts            (TODO — wraps sandbox)
    ├── ask-question.tool.ts        (TODO — wraps @aparte/plugin-ask-question)
    └── generate-file.tool.ts       (TODO — wraps generate-file/handler)
```

---

## Intégration apps/home (V1.x)

À implémenter une fois validé :

```
                    User message
                         │
                         ▼
            OrchestratorService.process(request)
                         │
                  (V1 path — kept for fallback)
                         │
                         ▼
            requestInterceptor → modify → stream

    OR (V1.x — agent loop path) :

            AgentService.run(userMessage)
                         │
                         ▼
            runAgent(...)
                         │
            ┌────────────┴──────────────┐
            │ emits AG-UI events         │
            ▼                            ▼
    Angular consumer            Browser DOM render
    (RxJS / Signal)             (timeline + tool calls)
```

---

## Tests Node (iso)

```
            runAgent() — same agent-loop.ts module
                         │
                         ▼
            event recorder
                         │
                         ▼
            assert timeline :
            RUN_STARTED → TOOL_CALL_START(name=run_code) → TOOL_CALL_RESULT
              → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT(*) → TEXT_MESSAGE_END
              → RUN_FINISHED
```

Tests-node fournit un `AgentProvider` Node-friendly (Transformers.js Node).
Apps/home fournit un `AgentProvider` Angular-wrapped.
**Le runAgent est inchangé entre les 2.**

---

## Tool taxonomy — markers (added 2026-05-11)

Chaque tool a un `marker` qui gouverne quand il est exposé au LLM (cf. `tool.ts`) :

| Marker mode | Comportement | Cas d'usage |
|---|---|---|
| `mandatory_always` | Toujours dans `tools[]`. User ne peut désactiver. | `ask_question`, `run_code` |
| `auto_when_available` | Dans `tools[]` si `isAvailable(ctx) === true`. Reason exposé en UI. | `retrieve_file` (si fichiers), `retrieve_skill` (si skills) |
| `user_optional` | Dans `tools[]` seulement si user a coché via settings (preferences.enabledTools). `defaultEnabled` = fallback. | `remember_fact` (V1.x), futurs tools opt-in |
| `disabled` | Jamais exposé. Garde le tool en registry (debug, deprecation). | placeholders V2 |

**Filtering** : `ToolRegistry.getActiveDescriptors(ctx)` applique markers + `isAvailable(ctx)` + `ctx.preferences.enabledTools`. **C'est ça qui est passé au LLM**, pas `descriptors()` brut (qui reste pour debug/export complet).

```
Settings UI mock (cf. apps/home/SKILLS-ARCHITECTURE.md) :

┌──────────────────────────────────────────────────────┐
│ Core capabilities                                    │
│   ✓ ask_question      [Mandatory · Always-on]       │
│   ✓ run_code          [Mandatory · Always-on]       │
│   ✓ retrieve_file     [Auto · When files attached]  │
│   ✓ retrieve_skill    [Auto · When skill active]    │
│ Advanced                                              │
│   ☐ remember_fact     [Opt-in · Disabled V1.0]      │
│   ☐ MCP servers       [Disabled · V2+]               │
└──────────────────────────────────────────────────────┘
```

### Mandatory base tools V1

| Tool | Marker | Why mandatory |
|---|---|---|
| `ask_question` | mandatory_always | Disambiguation = capability fondamentale |
| `run_code` | mandatory_always | Capability layer (vs skills = knowledge layer) |

Tous les autres sont conditionnels (auto_when_available) ou opt-in (user_optional).

---

## TODO V1.x

- [x] Tool taxonomy + markers (2026-05-11)
- [x] Tool factory pattern + adapter interface
- [x] `retrieve_skill` factory (SkillAdapter)
- [x] `retrieve_file` factory (FileAdapter)
- [x] `run_code` factory (SandboxAdapter + FilesApi)
- [x] `ask_question` factory (AskQuestionResolver)
- [ ] Implement adapters in apps/home (wrap existing services)
  - skill-adapter.ts (wraps `services/skills/skill-retrieve.service.ts`)
  - file-adapter.ts (wraps `services/rag.service.ts`)
  - sandbox-adapter.ts (wraps `sandbox/file-gen.service.ts` + Web Worker)
  - ask-question-adapter.ts (dispatches `@aparte/plugin-ask-question` events)
- [ ] Implement AgentProvider for Transformers.js (apps/home browser)
- [x] Implement AgentProvider for Transformers.js Node (tests-node bridge)
- [ ] AgentService Angular shell (DI, RxJS streams)
- [ ] Chat component refactor — consume AG-UI events instead of raw stream
- [x] tests-node test: record events on simple conversation, assert timeline
- [ ] Migration : route classifier "complex" → AgentService (hybrid)
- [ ] Full migration : retire request-mutator paradigm

---

## Sources

- [AG-UI Protocol — GitHub](https://github.com/ag-ui-protocol/ag-ui)
- [AG-UI Events Reference](https://docs.ag-ui.com/concepts/events)
- [Anatomy of an Agent Loop — Steve Kinney](https://stevekinney.com/writing/agent-loops)
- [Claude Agent SDK — How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)
- [LFM2.5 Pythonic tool call format](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Thinking)
