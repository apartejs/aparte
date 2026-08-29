// @vitest-environment jsdom
/**
 * The name and the words are the host's.
 *
 * `ask_user` used to be the only name the tool could carry, and its description and
 * system prompt the only words — a backend with an `ask_user` of its own, or a product
 * that wanted the model to read another policy in another language, had to fork the
 * tool for two strings. The receipt renderer follows the chosen name, and
 * `receipt: false` gives the old render-nothing behaviour without a second
 * registration that had to come AFTER `setupAskUser` to win.
 */
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { createAskUserTool } from './ask-user.js';
import { setupAskUser } from './index.js';

describe('createAskUserTool options', () => {
    it('keeps the defaults when nothing is passed', () => {
        const tool = createAskUserTool();
        expect(tool.name).toBe('ask_user');
        expect(tool.systemPrompt).toContain('the ask_user tool');
    });

    it('takes the name, description and system prompt from the host', () => {
        const tool = createAskUserTool({
            name: 'clarify',
            description: 'Pose une question à choix.',
            systemPrompt: 'Demande avant d’écrire un fichier.',
        });
        expect(tool.name).toBe('clarify');
        expect(tool.description).toBe('Pose une question à choix.');
        expect(tool.systemPrompt).toBe('Demande avant d’écrire un fichier.');
    });

    it('names the tool in the default prompt', () => {
        expect(createAskUserTool({ name: 'clarify' }).systemPrompt).toContain('the clarify tool');
    });

    it('systemPrompt: false registers no system message at all — the field is absent, not empty', () => {
        // `''` would still be a field, and the loop sends whatever string the field holds
        // as a system message. A model trained on a fixed contract must read nothing added.
        const tool = createAskUserTool({ systemPrompt: false });
        expect('systemPrompt' in tool).toBe(false);
        expect(tool.name).toBe('ask_user');
        expect(tool.inputSchema).toBeDefined();
    });
});

describe('setupAskUser', () => {
    it('registers the tool and its receipt under the chosen name', () => {
        const config = new AparteConfig();
        setupAskUser({ name: 'clarify' }, config);
        expect(config.getTools().map((t) => t.name)).toContain('clarify');
        expect(config.getToolRenderer('clarify')).toBeDefined();
        expect(config.getToolRenderer('ask_user')).toBeUndefined();
    });

    it('renders nothing for the call when the receipt is declined', () => {
        const config = new AparteConfig();
        setupAskUser({ receipt: false }, config);
        const renderer = config.getToolRenderer('ask_user');
        expect(renderer).toBeDefined();
        expect(renderer!.render({} as never)).toBe('');
    });
});
