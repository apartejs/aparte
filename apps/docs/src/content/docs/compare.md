---
title: 'Compare aparté with Loquix, assistant-ui, AI Elements & more (2026)'
description: A fair, dated comparison of AI chat UI libraries — Loquix, assistant-ui, Vercel AI Elements, deep-chat, kitn, OpenAI ChatKit — on framework lock-in, runtime, local/in-browser models, human-in-the-loop and theming.
sidebar:
  label: Compare
---

If you are choosing a chat UI library for an LLM product, the libraries below are the ones you
will shortlist. This page says what each is good at and where aparté differs — including
the cases where you should pick the other one. Claims about other projects were checked
against their public docs in **August 2026**; they move fast, so verify before deciding.

The short version: **aparté is the one that is a complete runtime *and* framework-agnostic
*and* free of third-party dependencies.** The React kits have more components. The other
web-component kits are presentational — you bring the loop. If you need neither
framework freedom nor a runtime, you have better options than aparté, and they are named
below.

## The matrix

| | aparté | assistant-ui | AI Elements | deep-chat | Loquix | kitn |
|---|---|---|---|---|---|---|
| Frameworks | Web Components + React, Vue, Svelte, Angular wrappers | React | React | Web Component (+ React wrapper) | Web Component (Lit) | Web Component |
| Runtime included (streaming, agent loop, tool calls) | **Yes** — [core](/why/) + [headless engine](/guides/engine/) | Runtime adapters (AI SDK, LangGraph, …) | Via the Vercel AI SDK | Built in, config-driven | No — presentational | No — presentational |
| Framework you must adopt | **None** — and no third-party dependency in `@aparte/core` | React | React + the AI SDK | None | None (Lit is bundled) | None |
| Human-in-the-loop: tool approval, typed questions | **Approval at the composer, [typed elicitation panel](/guides/elicitation/)** | Generic tool UI | Confirmation component | — | Rendered, not run | Rendered, not run |
| Edit / retry / branch a conversation | **[Yes, with a version picker](/guides/conversations-branching/)** | Yes | Partial | — | Partial | — |
| Persistence | [A storage interface you implement](/guides/conversation-persistence/) | A hosted cloud service (paid) | Your own | — | — | — |
| Theming | [CSS variables, light DOM](/guides/theming/), no fork | Tailwind / shadcn — fork the markup | shadcn — the code lives in your app | Config object | CSS variables | CSS variables + online editor |
| Run a model in the browser | Yes — the [transformers provider](/providers/ai/transformers/) | — | — | Yes (Web LLM) | — | — |
| Markdown, code, reasoning | Yes ([opt-in plugins](/plugins/)) | Yes | Yes | Yes | Yes | Yes |
| Mermaid, KaTeX | — | Yes | Yes | — | — | — |
| Voice | — | Yes (realtime) | Yes | Yes | — | — |
| Citations / sources | — | Partial | Yes | — | Yes | — |
| Floating / modal chat | — | Yes | — | Yes (embed) | Partial | — |
| Best fit for | Multi-framework teams that want the runtime included | React teams, all-in on React | Apps already on the Vercel AI SDK | A config-driven embed, fast | A polished presentational kit (Lit) | A minimal presentational kit |
| Licence | MIT | MIT | Apache-2.0 | MIT | MIT | MIT |

The rows read left to right as *what aparté is for*: the top half is the runtime, the
bottom half is the catalogue. aparté wins the top half and loses the bottom half, and both
halves are true.

## assistant-ui

**The React reference.** A composable primitives kit (thread, composer, message, action bar,
branch picker, chain of thought, attachments) with the widest set of runtime integrations
in the category — the Vercel AI SDK, LangGraph, LangChain, Mastra, AG-UI, A2A and more —
plus realtime voice, Mermaid and KaTeX rendering, and a hosted cloud for thread persistence.

**Pick assistant-ui when** you are on React for good, want its idioms end to end, and want
to plug into one of those runtimes rather than run a loop of your own. Its ecosystem is
larger than aparté's and will stay so.

**Pick aparté when** the same chat has to ship in more than one framework (or none), when
you do not want a UI kit to dictate your styling system, or when you want a runtime in the
library rather than an adapter to someone else's. Theming is the other line: assistant-ui
is Tailwind/shadcn, so a visual change is a fork of markup; aparté is CSS variables on light
DOM, so it is a stylesheet.

## Vercel AI Elements

**The largest catalogue.** Fifty-odd shadcn components — chatbot, code (artifact, file tree,
terminal, sandbox, web preview), voice and workflow-graph families — installed by CLI, so the
source lands in your app. Requires React and the Vercel AI SDK.

**Pick AI Elements when** you build on Next.js and the AI SDK and want a finished part for
every screen an agent product has. Nobody else has that breadth.

**Pick aparté when** you are not on React, or when you want the parts to update as a
dependency rather than as copied source. One thing to know: AI Elements' file tree,
terminal and test results are **app-fed views**, not message types — the same conclusion
aparté reached when it removed those segment kinds. A tool result rendered richly —
generative UI, in the term the field settled on — is the seam both libraries converge on.

## deep-chat

**The fastest time-to-chat.** One `<deep-chat>` element, configured by attributes and
objects, connects directly to twenty-odd vendor APIs, does files, camera, microphone,
speech in and out, and can run a model in the browser.

**Pick deep-chat when** you want one tag and a config object and you are done — it is the
best of the category at that, and the only other one that runs a model client-side.

**Pick aparté when** you need composable parts rather than one element (aparté is a
viewport, a composer, bubbles and a status line you place yourself), token-level theming,
an agent loop with [tool approval](/guides/tools/), or the same chat in four frameworks with
[typed wrappers](/frameworks/). deep-chat's customisation is a large config surface; aparté's
is CSS and render hooks.

## Loquix

**A presentational web-component kit.** A few dozen Lit components across reasoning,
trust, search and template categories, with accessibility as its headline. By design it
ships no provider, no loop and no transport: it is a type-only interface you feed.

**Pick Loquix when** you already have a chat runtime you like and want a broad, accessible
set of views to render its output.

**Pick aparté when** you want the runtime too. aparté's core has no third-party dependency
(Loquix carries Lit), and its [engine](/guides/engine/) runs the agent loop, the tool calls,
the approval gate and the conversation compactor — the parts a presentational kit leaves
to you. Loquix's catalogue is wider than aparté's; its roadmap points at provider
integrations, which is the ground aparté already covers.

## kitn

**The presentational twin.** A single custom element that renders tool calls, reasoning
traces and typed cards (confirmations, choices, forms) — "you bring the model" is the
stated contract. Its theming is its strength: a small token set, dozens of presets and an
online theme editor that exports CSS.

**Pick kitn when** you want a drop-in view over a loop you run elsewhere, and a theme in
five minutes.

**Pick aparté when** the typed cards have to be *honoured*, not just drawn: aparté's
[elicitation](/guides/elicitation/) pauses the run, collects the answer and resumes it, and
the approval step gates a real tool call. kitn draws the same vocabulary without the
runtime under it.

## OpenAI ChatKit

**The platform drop-in.** A web component (with a React wrapper) served by the OpenAI
platform through a client token — streaming, tools, attachments and chain-of-thought
visualisation without writing the front end. Self-hosting goes through their Python SDK.

**Pick ChatKit when** you build on the OpenAI platform and want their hosted chat
experience with the least code.

**Pick aparté when** the model is not OpenAI's, when the key must stay yours (browser-direct
BYOK or [your own endpoint](/guides/backend-transport/)), when a model runs locally, or when
you need theming beyond what a hosted surface exposes. The lock-in there is the vendor;
aparté's [transport](/why/) is the seam that keeps it out.

## Also in the field

- **CopilotKit** — a category above: app-state sync with agents, generative UI, LangGraph
  co-agents. Not a chat component; if that is what you need, aparté is not it.
- **NLUX** — React and vanilla, with a modified MPL licence to read before adopting.
- **TanStack AI** — type-safe, framework-agnostic hooks with no UI (alpha). Closer to
  aparté's engine than to its components.
- **Chainlit** — Python full-stack; a different stack entirely.

## How to read this page

aparté is alpha (`0.x`, released in lockstep, renames land as renames — see
[Why aparté](/why/#where-it-is-in-its-life)). The comparison is written against that
version; the catalogue rows will change as components land, and the runtime rows are the
ones that define the project. If a claim above is wrong or out of date,
[open an issue](https://github.com/apartejs/aparte/issues) — a comparison that flatters
the author is worth nothing to the reader.
