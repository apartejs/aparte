import { describe, it, expect, vi } from 'vitest';
import { buildRetrieveSkillTool, type SkillAdapter } from '../retrieve-skill.tool';

const ctx = {};
const adapter = (over: Partial<SkillAdapter> = {}): SkillAdapter => ({
    listSkills: () => [{ name: 'pdf', description: 'PDF stuff' }, { name: 'git', description: 'Git stuff' }],
    retrieve: async (name, query) => `chunks for ${name}:${query}`,
    ...over,
});

describe('buildRetrieveSkillTool', () => {
    it('returns null when no skills are installed', async () => {
        expect(await buildRetrieveSkillTool(adapter(), [])).toBeNull();
        expect(await buildRetrieveSkillTool(adapter({ listSkills: () => [] }))).toBeNull();
    });

    it('builds an auto_when_available tool whose enum + description list the skills', async () => {
        const tool = (await buildRetrieveSkillTool(adapter()))!;
        expect(tool.descriptor.name).toBe('retrieve_skill');
        expect(tool.marker).toEqual({ mode: 'auto_when_available', reason: expect.any(String) });
        expect(tool.descriptor.parameters.properties['name']!.enum).toEqual(['pdf', 'git']);
        expect(tool.descriptor.description).toContain('pdf: PDF stuff');
    });

    it('uses a pre-fetched skills list without calling listSkills', async () => {
        const listSkills = vi.fn(() => [{ name: 'x', description: 'd' }]);
        await buildRetrieveSkillTool(adapter({ listSkills }), [{ name: 'x', description: 'd' }]);
        expect(listSkills).not.toHaveBeenCalled();
    });

    it('handler retrieves from the adapter for a valid call', async () => {
        const retrieve = vi.fn(async () => 'RESULT');
        const tool = (await buildRetrieveSkillTool(adapter({ retrieve }), [{ name: 'pdf', description: 'd' }]))!;
        const out = await tool.handler({ name: 'pdf', query: 'how to embed a font' }, ctx);
        expect(out).toBe('RESULT');
        expect(retrieve).toHaveBeenCalledWith('pdf', 'how to embed a font', 3);
    });

    it('handler rejects an unknown skill and a missing/short query', async () => {
        const tool = (await buildRetrieveSkillTool(adapter()))!;
        expect(await tool.handler({ name: 'nope', query: 'valid query' }, ctx)).toMatch(/FAILED: unknown skill/);
        expect(await tool.handler({ name: 'pdf', query: '' }, ctx)).toMatch(/FAILED: query is required/);
    });

    it('handler turns an adapter error into a FAILED result', async () => {
        const tool = (await buildRetrieveSkillTool(adapter({ retrieve: async () => { throw new Error('boom'); } })))!;
        expect(await tool.handler({ name: 'pdf', query: 'valid query' }, ctx)).toBe('FAILED: retrieve_skill error: boom');
    });
});
