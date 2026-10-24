/**
 * How a tool's calls are shown, declared once and matched by name, pattern or '*'.
 *
 * Every tool lever was keyed by an exact name, so a tool whose name the app does not know
 * in advance — an MCP server's `mcp__github__get_issue` — could not be described at all,
 * and "every tool I have not described" had no spelling. `registerToolDisplay` takes a
 * name, a RegExp or `'*'`; so does `registerToolRenderer`; and the summary and input
 * formatter registrations write into the same entry rather than a second table.
 *
 * Resolution is per ENTRY: the exact name, else the first pattern registered that
 * matches, else `'*'` — so `'*'` reads "every tool nothing more specific describes".
 */
import { describe, it, expect, vi } from 'vitest';
import { AparteConfig } from '../aparte-config.js';
import type { AparteToolCallSegment } from '../../types/index.js';

const label = (config: AparteConfig, name: string) => config.getToolDisplay(name)?.label;

describe('registerToolDisplay', () => {
    it('resolves the exact name first, then the first matching pattern, then *', () => {
        const config = new AparteConfig();
        config.registerToolDisplay('*', { label: 'Tool' });
        config.registerToolDisplay(/^mcp__github__/, { label: 'GitHub' });
        config.registerToolDisplay(/^mcp__/, { label: 'MCP' });
        config.registerToolDisplay('mcp__github__get_issue', { label: 'Read an issue' });

        expect(label(config, 'mcp__github__get_issue')).toBe('Read an issue');
        expect(label(config, 'mcp__github__list_prs'), 'the first pattern registered wins').toBe('GitHub');
        expect(label(config, 'mcp__linear__get')).toBe('MCP');
        expect(label(config, 'web_search')).toBe('Tool');
    });

    it('nothing registered: no display', () => {
        expect(new AparteConfig().getToolDisplay('web_search')).toBeUndefined();
    });

    it('merges into the entry of the same matcher, and only that one', () => {
        const config = new AparteConfig();
        config.registerToolDisplay('*', { hidden: true });
        config.registerToolDisplay('read_file', { label: 'Read' });
        config.registerToolDisplay('read_file', { icon: 'file' });
        expect(config.getToolDisplay('read_file')).toEqual({ label: 'Read', icon: 'file' });
        // Per entry: the '*' hide does not leak into a tool that has its own entry.
        expect(config.getToolDisplay('read_file')?.hidden).toBeUndefined();
    });

    it('a pattern is the same entry whatever RegExp instance spells it, and a g flag is harmless', () => {
        const config = new AparteConfig();
        config.registerToolDisplay(/^mcp__/g, { label: 'MCP' });
        config.registerToolDisplay(/^mcp__/g, { icon: 'globe' });
        expect(config.getToolDisplay('mcp__a')).toEqual({ label: 'MCP', icon: 'globe' });
        expect(label(config, 'mcp__b'), 'lastIndex does not make the second lookup miss').toBe('MCP');
        config.unregisterToolDisplay(/^mcp__/g);
        expect(config.getToolDisplay('mcp__a')).toBeUndefined();
    });

    it('tells the components already on the page, so a label reaches a row that is drawn', () => {
        const config = new AparteConfig();
        const heard = vi.fn();
        config.subscribe(heard);
        config.registerToolDisplay('read_file', { label: 'Read' });
        config.unregisterToolDisplay('read_file');
        expect(heard).toHaveBeenCalledTimes(2);
    });

    it('reset() forgets every entry', () => {
        const config = new AparteConfig();
        config.registerToolDisplay('*', { label: 'Tool' });
        config.registerToolRenderer('*', { render: () => '<div></div>' });
        config.reset();
        expect(config.getToolDisplay('x')).toBeUndefined();
        expect(config.getToolRenderer('x')).toBeUndefined();
    });
});

describe('the summary and the input formatter are fields of the same entry', () => {
    const summary = (s: AparteToolCallSegment) => String(s.toolCall.input['path'] ?? '');
    const format = (input: Record<string, unknown>) => String(input['path'] ?? '');

    it('registerToolSummary writes the summary into the display', () => {
        const config = new AparteConfig();
        config.registerToolDisplay('read_file', { label: 'Read' });
        config.registerToolSummary('read_file', summary);
        expect(config.getToolDisplay('read_file')).toEqual({ label: 'Read', summary });
        expect(config.getToolSummary('read_file')).toBe(summary);
    });

    it('takes a pattern too', () => {
        const config = new AparteConfig();
        config.registerToolSummary(/_file$/, summary);
        config.registerToolInputFormatter('*', format);
        expect(config.getToolSummary('write_file')).toBe(summary);
        expect(config.getToolInputFormatter('anything')).toBe(format);
    });

    it('unregistering a field keeps the rest of the entry', () => {
        const config = new AparteConfig();
        config.registerToolDisplay('read_file', { label: 'Read' });
        config.registerToolSummary('read_file', summary);
        config.unregisterToolSummary('read_file');
        expect(config.getToolDisplay('read_file')).toEqual({ label: 'Read' });
        config.registerToolInputFormatter('read_file', format);
        config.unregisterToolInputFormatter('read_file');
        expect(config.getToolInputFormatter('read_file')).toBeUndefined();
    });
});

describe('registerToolRenderer takes the same matchers', () => {
    it('a * renderer draws every tool without one of its own', () => {
        const config = new AparteConfig();
        const any = { render: () => '<div class="any"></div>' };
        const own = { render: () => '<div class="own"></div>' };
        config.registerToolRenderer('*', any);
        config.registerToolRenderer('ask_user', own);
        expect(config.getToolRenderer('ask_user')).toBe(own);
        expect(config.getToolRenderer('web_search')).toBe(any);
        config.unregisterToolRenderer('*');
        expect(config.getToolRenderer('web_search')).toBeUndefined();
    });

    it('and a pattern', () => {
        const config = new AparteConfig();
        const mcp = { render: () => '<div></div>' };
        config.registerToolRenderer(/^mcp__/, mcp);
        expect(config.getToolRenderer('mcp__github__get_issue')).toBe(mcp);
        expect(config.getToolRenderer('read_file')).toBeUndefined();
    });
});

describe('a call with no name', () => {
    it('resolves nothing, instead of throwing once a pattern is registered', () => {
        // A segment built by hand without `toolCall` reaches the lookups with `undefined`:
        // `Map.get(undefined)` was harmless, `undefined.search(re)` is not.
        const config = new AparteConfig();
        config.registerToolRenderer(/^mcp__/, { render: () => '<div></div>' });
        config.registerToolDisplay(/^mcp__/, { hidden: true });
        expect(() => config.getToolRenderer(undefined as never)).not.toThrow();
        expect(config.getToolRenderer(undefined as never)).toBeUndefined();
        expect(config.isToolHidden(undefined as never)).toBe(false);
    });
});
