---
title: Docs for AI agents — llms.txt and the MCP server
description: How a coding agent reads these docs — the llms.txt index and its per-topic files, and @aparte/docs-mcp, an MCP server that lets the agent search and read them.
sidebar:
  order: 99
  label: Docs for AI agents
---

Two consumers' coding assistants could not find things these docs already had — the
approval elicitation (one rebuilt a modal it already had), the UI kit of classes,
`systemPrompt: false`. A model that reads a site cold misses; a model that can ask finds.
This page is the two ways a model reads aparté's docs.

## `llms.txt` — the index a model can navigate

The site publishes [`/llms.txt`](/llms.txt): the library in one paragraph, where its three
families live (components, segments, the UI kit), where asking-the-user and the display-only
API are documented, and **one file per topic**, each with a sentence:

| Set | Holds |
| --- | --- |
| Getting started, frameworks and guides | Install, first render, every guide |
| Tools, approval and asking the user | Tools, the tool-call row, human-in-the-loop approval, elicitation, the ask-user plugin — ~50 KB |
| Bring your own loop (display-only) | Driving the transcript from a loop you own, the wrappers' imperative API, the backend transport |
| Theming and the UI kit | CSS variables, dark mode, the customization hooks, the kit of classes with their HTML |
| Providers and transports | Every provider, local models, writing your own |
| Reference: components, segments, events, config | The generated references |

[`/llms-small.txt`](/llms-small.txt) is the guides without the generated references (for a
small context window); [`/llms-full.txt`](/llms-full.txt) is everything. Paste a set's URL
into a model that can fetch, or give it the whole index.

## `@aparte/docs-mcp` — the docs as an MCP server

For a client that speaks the Model Context Protocol (Claude Code, Claude Desktop, Cursor and
the rest), the same text is a server with four tools:

```bash
claude mcp add aparte-docs -- npx -y @aparte/docs-mcp
```

```json
{ "mcpServers": { "aparte-docs": { "command": "npx", "args": ["-y", "@aparte/docs-mcp"] } } }
```

| Tool | Ask it for |
| --- | --- |
| `list_sets` | The topics, one sentence each — start here |
| `search_docs` | Pages ranked for plain words (`"approve a tool call"`, `"systemPrompt false"`, `"finish a turn in display-only"`), with a snippet |
| `get_page` | One page's markdown, by title |
| `get_set` | A whole topic at once |

It reads the site rather than bundling it: every `@aparte/*` package ships at one version
and the site deploys from the same commit, so the docs online are the docs of the version
you installed, and the package stays a few kilobytes. It needs the network; for an offline
or staging setup, serve a docs build and point it there with `APARTE_DOCS_URL`.

To embed the server in a host of your own, `createDocsMcpServer({ baseUrl })` returns the
`McpServer`, and `DocsSource`, `parseIndex`, `splitPages` and `searchPages` give you the
text without the protocol.
