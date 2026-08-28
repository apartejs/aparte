/**
 * `npx @aparte/docs-mcp` — the server over stdio, for Claude Code, Claude Desktop, Cursor
 * and every other MCP client that spawns a command. `APARTE_DOCS_URL` points it at
 * another docs origin (a local `astro build` served on localhost, a staging site).
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDocsMcpServer } from './index.js';

const server = createDocsMcpServer({ baseUrl: process.env['APARTE_DOCS_URL'] });
await server.connect(new StdioServerTransport());
