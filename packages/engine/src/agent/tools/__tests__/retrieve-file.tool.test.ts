import { describe, it, expect, vi } from 'vitest';
import { buildRetrieveFileTool, type FileAdapter, type AttachedFile } from '../retrieve-file.tool';

const ctx = {};
const files: AttachedFile[] = [
    { id: 'f1', name: 'report.pdf', type: 'pdf', summary: 'quarterly report' },
    { id: 'f2', name: 'notes.txt' },
];
const adapter = (over: Partial<FileAdapter> = {}): FileAdapter => ({
    listFiles: () => files,
    retrieve: async (id, q) => `fast:${id}:${q}`,
    ...over,
});

describe('buildRetrieveFileTool', () => {
    it('returns null when no files are attached', async () => {
        expect(await buildRetrieveFileTool(adapter(), [])).toBeNull();
        expect(await buildRetrieveFileTool(adapter({ listFiles: () => [] }))).toBeNull();
    });

    it('lists file ids in the enum + describes them', async () => {
        const tool = (await buildRetrieveFileTool(adapter(), files))!;
        expect(tool.descriptor.name).toBe('retrieve_file');
        expect(tool.descriptor.parameters.properties['file_id']!.enum).toEqual(['f1', 'f2']);
        expect(tool.descriptor.description).toContain('report.pdf');
        expect(tool.descriptor.description).toContain('[pdf]');
    });

    it('fast mode retrieves top-K chunks', async () => {
        const retrieve = vi.fn(async () => 'FAST');
        const tool = (await buildRetrieveFileTool(adapter({ retrieve }), files))!;
        expect(await tool.handler({ file_id: 'f1', query: 'revenue?' }, ctx)).toBe('FAST');
        expect(retrieve).toHaveBeenCalledWith('f1', 'revenue?', 3);
    });

    it('deep_analyze mode calls deepAnalyze when available', async () => {
        const deepAnalyze = vi.fn(async () => 'DEEP');
        const tool = (await buildRetrieveFileTool(adapter({ deepAnalyze }), files))!;
        expect(await tool.handler({ file_id: 'f1', query: 'the exact figure', deep_analyze: true }, ctx)).toBe('DEEP');
        expect(deepAnalyze).toHaveBeenCalledWith('f1', 'the exact figure');
    });

    it('deep_analyze falls back to fast retrieve when the adapter has no deepAnalyze', async () => {
        const retrieve = vi.fn(async () => 'FALLBACK');
        const tool = (await buildRetrieveFileTool(adapter({ retrieve }), files))!; // no deepAnalyze
        expect(await tool.handler({ file_id: 'f2', query: 'summary', deep_analyze: true }, ctx)).toBe('FALLBACK');
        expect(retrieve).toHaveBeenCalledOnce();
    });

    it('rejects an unknown file_id and a missing query', async () => {
        const tool = (await buildRetrieveFileTool(adapter(), files))!;
        expect(await tool.handler({ file_id: 'zzz', query: 'valid query' }, ctx)).toMatch(/FAILED: unknown file_id/);
        expect(await tool.handler({ file_id: 'f1', query: '' }, ctx)).toMatch(/FAILED: query is required/);
    });

    it('turns an adapter error into a FAILED result', async () => {
        const tool = (await buildRetrieveFileTool(adapter({ retrieve: async () => { throw new Error('io'); } }), files))!;
        expect(await tool.handler({ file_id: 'f1', query: 'valid query' }, ctx)).toBe('FAILED: retrieve_file error: io');
    });
});
