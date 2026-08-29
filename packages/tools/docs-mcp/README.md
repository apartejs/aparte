# @aparte/docs-mcp

The aparté documentation as an **MCP server**, for the coding agent that is writing your
integration. Four tools — list the topics, search, read a page, read a whole topic — over
the text the docs site publishes for models (`apartejs.dev/llms.txt` and its per-topic
files), so the answer is always the docs of the version that ships.

```bash
npx @aparte/docs-mcp
```

That is the whole install for a client that spawns a command. Claude Code:

```bash
claude mcp add aparte-docs -- npx -y @aparte/docs-mcp
```

Claude Desktop / Cursor / any client with a JSON config:

```json
{ "mcpServers": { "aparte-docs": { "command": "npx", "args": ["-y", "@aparte/docs-mcp"] } } }
```

## The four tools

| Tool | Ask it for |
| --- | --- |
| `list_sets` | The topics the docs are split into, one sentence each — start here. |
| `search_docs` | Pages ranked for plain words (`"approve a tool call"`, `"systemPrompt false"`, `"finish a turn in display-only"`), with a snippet. |
| `get_page` | One page's markdown, by title. |
| `get_set` | A whole topic at once (25–250 KB): tools & approval, bring your own loop, theming & the UI kit, providers, reference. |

## Why it reads the site rather than bundling it

Every `@aparte/*` package ships at one version and the site deploys from the same commit,
so "the docs online" are the docs of the version you installed — and the package stays a
few kilobytes with nothing to go stale. It needs the network. For an offline or staging
setup, serve a docs build yourself and point the server at it:

```bash
APARTE_DOCS_URL=http://localhost:4321 npx @aparte/docs-mcp
```

That URL is the only origin the server ever fetches from. The index it reads lists one
URL per topic, and those are absolute production URLs even in a local build — so the
server takes their **path** and asks `APARTE_DOCS_URL` for it. A local build is therefore
read locally, and an index entry naming some other host is not a request your machine
makes. Anything that does not resolve to `http`/`https` is refused.

## Embedding it

```ts
import { createDocsMcpServer } from '@aparte/docs-mcp';

const server = createDocsMcpServer({ baseUrl: 'https://apartejs.dev' });
// connect it to the transport of your choice (stdio, streamable HTTP…)
```

`DocsSource`, `parseIndex`, `splitPages` and `searchPages` are exported too, for a host
that wants the text without the protocol.

## License

MIT
