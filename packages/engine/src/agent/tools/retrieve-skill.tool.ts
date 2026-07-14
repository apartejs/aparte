/**
 * retrieve-skill.tool.ts — Tool factory : agent calls a skill's content.
 *
 * Pattern : engine defines the tool DESCRIPTOR + handler shape.
 * Each consumer (apps/home / tests-node / future apps) provides an adapter.
 *
 *   apps/home    → wraps services/skills/skill-retrieve.service.ts
 *   tests-node   → uses a mock SkillAdapter or wraps SkillRetriever from lib/
 *
 * The descriptor follows Anthropic Skills format (description includes
 * trigger keywords, when-to-call hints, plus the installed skills list
 * injected dynamically).
 */

import type { Tool } from '../tool';

/**
 * Adapter interface — consumer implements this.
 * Returns top-K chunks from the skill, formatted as a string for the LLM.
 */
export interface SkillAdapter {
    /**
     * List installed skills. Returned in descriptor.parameters.name.enum.
     */
    listSkills(): Promise<Array<{ name: string; description: string }>> | Array<{ name: string; description: string }>;

    /**
     * Retrieve K most relevant chunks from a skill by semantic similarity.
     * @returns Formatted string ready to feed back as tool result.
     */
    retrieve(skillName: string, query: string, topK?: number): Promise<string>;
}

/**
 * Build the retrieve_skill Tool. Call once at agent setup with the adapter
 * implementation appropriate for the runtime (browser / Node / mock).
 *
 * @param adapter   SkillAdapter implementation
 * @param skills    Pre-fetched list of installed skills (used to inject the
 *                  enum + descriptions into the tool description; pass empty
 *                  array if no skills installed — agent will not see this tool)
 * @returns Tool ready to register OR null if no skills installed
 */
export async function buildRetrieveSkillTool(
    adapter: SkillAdapter,
    skills?: Array<{ name: string; description: string }>,
): Promise<Tool | null> {
    const installed = skills ?? await adapter.listSkills();
    if (!installed.length) return null;

    const enumValues = installed.map(s => s.name);
    const skillList = installed.map(s => `  - ${s.name}: ${s.description}`).join('\n');

    return {
        marker: { mode: 'auto_when_available', reason: 'When at least one skill is installed and active' },
        // No isAvailable check here because we already filter at build time
        // (returns null if no skills). Once built, the tool is always available.
        descriptor: {
            name: 'retrieve_skill',
            description: `Retrieve detailed content from an installed reference skill. Use this when the user's question relates to one of the skills listed below. Each skill description tells you WHEN to call it — match keywords from the user's query against the skill descriptions.

Available skills :
${skillList}

Call ONCE per relevant skill. Pass a focused query (one sub-question, not the full user message). If no skill matches the user's topic, DO NOT call this tool — answer directly.`,
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        enum: enumValues,
                        description: `Skill name to interrogate. One of : ${enumValues.join(', ')}`,
                    },
                    query: {
                        type: 'string',
                        description: 'Focused sub-question to search within the skill\'s reference content. Should be a short query (3-15 words), not the user\'s full message.',
                    },
                },
                required: ['name', 'query'],
            },
        },

        handler: async (args, _ctx) => {
            const name = String(args['name'] ?? '');
            const query = String(args['query'] ?? '');
            if (!name || !enumValues.includes(name)) {
                return `FAILED: unknown skill "${name}". Available: ${enumValues.join(', ')}`;
            }
            if (!query || query.length < 2) {
                return `FAILED: query is required (got "${query}")`;
            }
            try {
                return await adapter.retrieve(name, query, 3);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                return `FAILED: retrieve_skill error: ${msg}`;
            }
        },
    };
}
