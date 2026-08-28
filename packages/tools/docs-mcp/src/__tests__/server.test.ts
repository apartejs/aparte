/**
 * The protocol side: a real MCP client over an in-memory transport, against a server
 * fed by a fixture fetcher — the four tools exist, and each answers.
 */
import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createDocsMcpServer } from '../index.js';

const INDEX = `## Documentation Sets

- [Complete documentation](https://d/llms-full.txt): everything
- [Tools, approval and asking the user](https://d/tools.txt): tools and approval
`;
const TOOLS = `# Tool calls with human approval

> Gate a tool behind an approve/reject step.

Mark the tool with needsApproval: true.

# Another page

> Unrelated.

Nothing about approval here.
`;

async function connected() {
    const server = createDocsMcpServer({
        baseUrl: 'https://d',
        fetchText: async (url) => (url.endsWith('/llms.txt') ? INDEX : url.endsWith('/tools.txt') ? TOOLS : ''),
    });
    const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
    await server.connect(serverEnd);
    const client = new Client({ name: 'test', version: '0' });
    await client.connect(clientEnd);
    return client;
}

const textOf = (result: unknown): string => {
    const content = (result as { content: Array<{ type: string; text?: string }> }).content;
    return content.map((c) => c.text ?? '').join('\n');
};

describe('@aparte/docs-mcp over MCP', () => {
    it('lists the four tools', async () => {
        const client = await connected();
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual(['get_page', 'get_set', 'list_sets', 'search_docs']);
    });

    it('list_sets → search_docs → get_page, the way a model uses it', async () => {
        const client = await connected();
        expect(textOf(await client.callTool({ name: 'list_sets', arguments: {} }))).toContain('Tools, approval and asking the user');
        const hits = textOf(await client.callTool({ name: 'search_docs', arguments: { query: 'approve a tool call' } }));
        // Ranked: the approval page first; "Another page" mentions approval once and comes after.
        expect(hits.indexOf('## Tool calls with human approval')).toBe(0);
        expect(hits.indexOf('## Another page')).toBeGreaterThan(0);
        const page = textOf(await client.callTool({ name: 'get_page', arguments: { title: 'human approval' } }));
        expect(page).toContain('needsApproval: true');
        const set = textOf(await client.callTool({ name: 'get_set', arguments: { set: 'approval' } }));
        expect(set).toContain('# Another page');
    });

    it('says so when nothing matches, instead of an empty answer', async () => {
        const client = await connected();
        expect(textOf(await client.callTool({ name: 'search_docs', arguments: { query: 'zebra' } }))).toMatch(/Nothing matches/);
        expect(textOf(await client.callTool({ name: 'get_set', arguments: { set: 'zebra' } }))).toMatch(/No set matches/);
        expect(textOf(await client.callTool({ name: 'get_page', arguments: { title: 'zebra' } }))).toMatch(/No page titled/);
    });
});
