/**
 * The recursive file-tree renderer.
 *
 * One of the eleven files the old 844-line `segment-renderers.test.ts` became.
 */
import { describe, it, expect } from 'vitest';
import {
    getSegmentRenderer,
    registerDefaultRenderers
} from '../../segment-renderers.js';

// Register the default renderers once, so the built-in under test is resolvable.
registerDefaultRenderers();

describe('default renderer: file-tree', () => {
    it('is registered', () => {
        expect(getSegmentRenderer('file-tree')).toBeDefined();
    });

    it('renders a flat list of files with the file icon and escaped names', () => {
        const renderer = getSegmentRenderer('file-tree')!;
        const html = renderer.render({
            id: 'ft1', type: 'file-tree',
            files: [{ name: '<b>a.ts</b>', path: 'a.ts', type: 'file' }],
        } as any);
        expect(html).toContain('📄');
        expect(html).toContain('&lt;b&gt;a.ts&lt;/b&gt;');
        expect(html).not.toContain('<b>a.ts</b>');
    });

    it('renders nested children with increasing indentation and the folder icon', () => {
        const renderer = getSegmentRenderer('file-tree')!;
        const html = renderer.render({
            id: 'ft2', type: 'file-tree',
            files: [{
                name: 'src', path: 'src', type: 'directory',
                children: [{ name: 'index.ts', path: 'src/index.ts', type: 'file' }],
            }],
        } as any);
        expect(html).toContain('📁');
        expect(html).toContain('padding-left: 0px');
        expect(html).toContain('padding-left: 16px');
        expect(html).toContain('index.ts');
    });

    it('applies a file-status-* class matching the node status', () => {
        const renderer = getSegmentRenderer('file-tree')!;
        const html = renderer.render({
            id: 'ft3', type: 'file-tree',
            files: [{ name: 'new.ts', path: 'new.ts', type: 'file', status: 'added' }],
        } as any);
        expect(html).toContain('file-status-added');
    });

    it('renders the optional escaped title when provided, omits it otherwise', () => {
        const renderer = getSegmentRenderer('file-tree')!;
        const withTitle = renderer.render({ id: 'ft4', type: 'file-tree', files: [], title: '<i>Changes</i>' } as any);
        expect(withTitle).toContain('class="file-tree-title"');
        expect(withTitle).toContain('&lt;i&gt;Changes&lt;/i&gt;');

        const withoutTitle = renderer.render({ id: 'ft5', type: 'file-tree', files: [] } as any);
        expect(withoutTitle).not.toContain('file-tree-title');
    });
});
