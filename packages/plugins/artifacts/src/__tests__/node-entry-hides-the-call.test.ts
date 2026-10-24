/**
 * On the server, `setupArtifacts()` declares the tool's calls hidden.
 *
 * It registered a renderer that draws nothing, which keeps the same row out of sight
 * but answered `isToolHidden('create_artifact') === false` — unlike ask-user's server
 * entry, which says what it means. Both declare a hidden display now.
 */
import { describe, it, expect } from 'vitest';
import { AparteConfig } from '@aparte/core';
import { setupArtifacts } from '../index.node.js';

describe('the DOM-free entry', () => {
    it('hides create_artifact through its display, and unregisters it', () => {
        const config = new AparteConfig();
        const off = setupArtifacts({}, config);
        expect(config.isToolHidden('create_artifact')).toBe(true);
        expect(config.getToolRenderer('create_artifact')).toBeUndefined();
        off();
        expect(config.getToolDisplay('create_artifact')).toBeUndefined();
    });
});
