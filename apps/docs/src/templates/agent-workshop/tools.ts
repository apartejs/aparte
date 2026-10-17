/**
 * The agent's four tools: what the model is told about them (`TOOLS`), and what they do to the
 * workspace (`createToolbox`). app.ts registers them with the client; the tile (`?thumb`) runs
 * the same toolbox directly to reach its frozen state, so both show the same results.
 *
 * The names are this app's. The library cannot know that `run_command` executes and `search`
 * reads, which is why app.ts sorts them for the approval plugin.
 */
import type { AparteTool } from '@aparte/core';
import { runTests } from './repo';
import type { Workspace } from './workspace';

export type ToolName = 'read_file' | 'search' | 'write_file' | 'run_command';

const field = (description: string) => ({ type: 'string', description });

export const TOOLS: (AparteTool & { name: ToolName })[] = [
    {
        name: 'read_file',
        description: 'Read a file of the repository.',
        inputSchema: { type: 'object', properties: { path: field('Path from the repository root.') }, required: ['path'] },
    },
    {
        name: 'search',
        description: 'Search the repository for a string, like grep: every matching line, with its file and line number.',
        inputSchema: {
            type: 'object',
            properties: { query: field('The text to find.'), path: field('A folder to search in. Default: the whole repository.') },
            required: ['query'],
        },
    },
    {
        name: 'write_file',
        description: 'Change a file: replace the exact text `find` with `replace`.',
        inputSchema: {
            type: 'object',
            properties: { path: field('Path from the repository root.'), find: field('The exact text to replace.'), replace: field('What to write instead.') },
            required: ['path', 'find', 'replace'],
        },
    },
    {
        name: 'run_command',
        description: 'Run a shell command at the repository root, such as the test suite (`pnpm test`).',
        inputSchema: { type: 'object', properties: { command: field('The command line.') }, required: ['command'] },
    },
];

type Input = Record<string, unknown>;

/** What each tool does, given the workspace it works on. Each returns what the model reads. */
export function createToolbox(workspace: Workspace): Record<ToolName, (input: Input) => string> {
    const { files } = workspace;
    return {
        read_file(input) {
            const path = String(input['path'] ?? '');
            const content = files.get(path);
            if (content === undefined) return `No file at ${path}. The repository has: ${[...files.keys()].join(', ')}.`;
            workspace.open(path, 'read');
            return content;
        },
        search(input) {
            const query = String(input['query'] ?? '');
            const folder = String(input['path'] ?? '').replace(/\/$/, '');
            const hits: string[] = [];
            for (const [path, content] of files) {
                if (folder && !path.startsWith(`${folder}/`)) continue;
                content.split('\n').forEach((line, i) => {
                    if (line.includes(query)) hits.push(`${path}:${i + 1}:${line}`);
                });
            }
            return hits.length ? hits.join('\n') : `No matches for "${query}".`;
        },
        write_file(input) {
            const path = String(input['path'] ?? '');
            const find = String(input['find'] ?? '');
            const content = files.get(path);
            // Returned, not thrown: a thrown handler ends the run, a result the model can read does not.
            if (content === undefined) return `No file at ${path}.`;
            if (!find || !content.includes(find)) return `The text to replace is not in ${path}.`;
            workspace.write(path, content.replace(find, String(input['replace'] ?? '')));
            return `Replaced 1 occurrence in ${path}.`;
        },
        run_command(input) {
            const command = String(input['command'] ?? '').trim();
            const test = /^pnpm (?:run )?test(?:\s+(\S+))?$/.exec(command);
            const output = test ? runTests(files, test[1]) : `sh: ${command.split(' ')[0]}: not available in this workspace (only pnpm test runs here)`;
            workspace.log(command, output);
            return output;
        },
    };
}

/** The status line while a tool runs. */
export function statusOf(name: ToolName, input: Input): string {
    switch (name) {
        case 'read_file':
            return `Reading ${String(input['path'])}…`;
        case 'search':
            return `Searching for “${String(input['query'])}”…`;
        case 'write_file':
            return `Writing ${String(input['path'])}…`;
        case 'run_command':
            return `Running ${String(input['command'])}…`;
    }
}

/** What the tool row says after the tool's name, so a reader sees what it ran on without opening it. */
export function summaryOf(name: ToolName, input: Input): string {
    switch (name) {
        case 'read_file':
        case 'write_file':
            return String(input['path'] ?? '');
        case 'search':
            return `“${String(input['query'] ?? '')}”${input['path'] ? ` in ${String(input['path'])}` : ''}`;
        case 'run_command':
            return String(input['command'] ?? '');
    }
}
