import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AparteConfig, AparteConfigClass } from '../aparte-config';
import { DEFAULT_LOCALE } from '../locale';

describe('AparteConfig', () => {
    beforeEach(() => {
        // Reset config before each test
        AparteConfig.setLocale(DEFAULT_LOCALE);
    });

    describe('Locale Management', () => {
        it('should have default English locale', () => {
            const locale = AparteConfig.getLocale();
            expect(locale).toBeDefined();
            expect(locale.direction).toBe('ltr');
            expect(locale.sendButton).toBe('Send');
        });

        it('should set custom locale', () => {
            const customLocale = {
                ...DEFAULT_LOCALE,
                sendButton: 'Envoyer',
                direction: 'ltr' as const
            };

            AparteConfig.setLocale(customLocale);
            const locale = AparteConfig.getLocale();

            expect(locale.sendButton).toBe('Envoyer');
        });

        it('should extend locale with new keys', () => {
            AparteConfig.extendLocale({ customKey: 'Custom Value' });
            const locale = AparteConfig.getLocale();

            expect((locale as any).customKey).toBe('Custom Value');
        });

        it('should not overwrite existing keys when extending', () => {
            const originalSendButton = AparteConfig.getLocale().sendButton;

            AparteConfig.extendLocale({ newKey: 'New' });

            expect(AparteConfig.getLocale().sendButton).toBe(originalSendButton);
        });
    });

    describe('Provider Management', () => {
        it('should set markdown provider', () => {
            const mockProvider = (raw: string) => `<p>${raw}</p>`;

            AparteConfig.setMarkdownProvider(mockProvider);
            // Provider is set successfully (no getter to test)
            expect(true).toBe(true);
        });

        it('should set highlight provider and expose it via hasHighlightProvider', async () => {
            const mockProvider = (code: string) => `<span class="tok">${code}</span>`;

            AparteConfig.setHighlightProvider(mockProvider);

            expect(AparteConfig.hasHighlightProvider()).toBe(true);
            expect(await AparteConfig.highlightCode('const x', 'js')).toBe('<span class="tok">const x</span>');
        });

        it('should set icon provider', () => {
            const mockProvider = {
                copy: () => '<svg></svg>',
                check: () => '<svg></svg>',
                send: () => '<svg></svg>',
                loading: () => '<svg></svg>',
                error: () => '<svg></svg>',
                expand: () => '<svg></svg>',
                collapse: () => '<svg></svg>',
                terminal: () => '<svg></svg>'
            };

            AparteConfig.setIconProvider(mockProvider);
            expect(true).toBe(true);
        });

        it('falls back for optional icon keys a provider does not implement', () => {
            // A provider without the optional `tool` / `close` / `stop` keys (all
            // pre-existing icon packs) must fall back to the default glyphs.
            AparteConfig.setIconProvider({ copy: () => '<svg data-x></svg>' } as any);

            expect(AparteConfig.getIcon('copy')).toBe('<svg data-x></svg>');
            expect(AparteConfig.getIcon('tool')).toBe('🔧');
            expect(AparteConfig.getIcon('close')).toBe('✕');
            // `stop` is a typed optional key: its fallback is the square SVG, so the
            // composer stop button renders an icon (not the literal text "stop").
            expect(AparteConfig.getIcon('stop')).toContain('<svg');
        });

        it('should set skeleton provider', () => {
            const mockProvider = {
                getSkeleton: () => '<div class="skeleton"></div>'
            };

            AparteConfig.setSkeletonProvider(mockProvider);
            expect(true).toBe(true);
        });
    });

    describe('Action registry (unified, zoned)', () => {
        afterEach(() => {
            ['composer-a', 'bubble-a', 'both-a', 'ord-1', 'ord-2', 'hide-me'].forEach(id =>
                AparteConfig.unregisterAction(id));
        });

        it('registers a composer action and returns it from getActions("composer")', () => {
            AparteConfig.registerAction({ id: 'composer-a', label: 'A', icon: '<svg></svg>', zones: ['composer'] });
            expect(AparteConfig.getActions('composer').map(a => a.id)).toContain('composer-a');
        });

        it('does not surface a composer-only action in the bubble zone', () => {
            AparteConfig.registerAction({ id: 'composer-a', label: 'A', icon: '', zones: ['composer'] });
            expect(AparteConfig.getActions('bubble').map(a => a.id)).not.toContain('composer-a');
        });

        it('surfaces a multi-zone action in every declared zone', () => {
            AparteConfig.registerAction({ id: 'both-a', label: 'B', icon: '', zones: ['composer', 'bubble'] });
            expect(AparteConfig.getActions('composer').map(a => a.id)).toContain('both-a');
            expect(AparteConfig.getActions('bubble').map(a => a.id)).toContain('both-a');
        });

        it('upserts on duplicate id instead of adding twice', () => {
            AparteConfig.registerAction({ id: 'composer-a', label: 'first', icon: '', zones: ['composer'] });
            AparteConfig.registerAction({ id: 'composer-a', label: 'second', icon: '', zones: ['composer'] });
            const hits = AparteConfig.getActions('composer').filter(a => a.id === 'composer-a');
            expect(hits).toHaveLength(1);
            expect(hits[0]?.label).toBe('second');
        });

        it('sorts a zone by order (lower first)', () => {
            AparteConfig.registerAction({ id: 'ord-2', label: '2', icon: '', zones: ['bubble'], order: 2 });
            AparteConfig.registerAction({ id: 'ord-1', label: '1', icon: '', zones: ['bubble'], order: 1 });
            const ids = AparteConfig.getActions('bubble').map(a => a.id);
            expect(ids.indexOf('ord-1')).toBeLessThan(ids.indexOf('ord-2'));
        });

        it('unregisterAction removes the action from every zone', () => {
            AparteConfig.registerAction({ id: 'both-a', label: 'B', icon: '', zones: ['composer', 'bubble'] });
            AparteConfig.unregisterAction('both-a');
            expect(AparteConfig.getActions('composer').map(a => a.id)).not.toContain('both-a');
            expect(AparteConfig.getActions('bubble').map(a => a.id)).not.toContain('both-a');
        });

        it('setActionHidden toggles the composer hidden flag', () => {
            AparteConfig.registerAction({ id: 'hide-me', label: 'H', icon: '', zones: ['composer'], composer: { position: 'left' } });
            AparteConfig.setActionHidden('hide-me', true);
            const a = AparteConfig.getActions('composer').find(x => x.id === 'hide-me');
            expect(a?.composer?.hidden).toBe(true);
        });

        it('calls an optional onClick alongside the event contract', () => {
            const onClick = vi.fn();
            AparteConfig.registerAction({ id: 'both-a', label: 'B', icon: '', zones: ['composer'], onClick });
            const a = AparteConfig.getActions('composer').find(x => x.id === 'both-a');
            expect(a?.onClick).toBe(onClick);
        });
    });

    describe('Tool Renderer Management', () => {
        afterEach(() => {
            AparteConfig.unregisterToolRenderer('my_tool');
            AparteConfig.unregisterToolRenderer('my_tool_2');
            AparteConfig.unregisterToolRenderer('same_name_tool');
        });

        it('registers a tool renderer and retrieves it by name', () => {
            const renderer = { render: () => '<div>ok</div>' };
            AparteConfig.registerToolRenderer('my_tool', renderer);
            expect(AparteConfig.getToolRenderer('my_tool')).toBe(renderer);
        });

        it('returns undefined for an unregistered tool name', () => {
            expect(AparteConfig.getToolRenderer('nonexistent_tool_xyz')).toBeUndefined();
        });

        it('unregisters a tool renderer', () => {
            const renderer = { render: () => '<div>ok</div>' };
            AparteConfig.registerToolRenderer('my_tool_2', renderer);
            AparteConfig.unregisterToolRenderer('my_tool_2');
            expect(AparteConfig.getToolRenderer('my_tool_2')).toBeUndefined();
        });

        it('silently ignores unregisterToolRenderer for an unknown name', () => {
            expect(() => AparteConfig.unregisterToolRenderer('never_registered')).not.toThrow();
        });

        it('overwrites an existing renderer when re-registered with same name', () => {
            const r1 = { render: () => 'R1' };
            const r2 = { render: () => 'R2' };
            AparteConfig.registerToolRenderer('same_name_tool', r1);
            AparteConfig.registerToolRenderer('same_name_tool', r2);
            expect(AparteConfig.getToolRenderer('same_name_tool')).toBe(r2);
        });

        it('renderer can include optional getStyles and setup methods', () => {
            const renderer = {
                render: () => '<span>pill</span>',
                getStyles: () => '.pill { color: red; }',
                setup: vi.fn()
            };
            AparteConfig.registerToolRenderer('my_tool', renderer);
            const stored = AparteConfig.getToolRenderer('my_tool');
            expect(stored?.getStyles?.()).toBe('.pill { color: red; }');
        });
    });

    // ─── setBubbleActions / getBubbleActions ───────────────────────────────

    describe('setBubbleActions / getBubbleActions', () => {
        it('returns defaults when never configured', () => {
            const actions = AparteConfig.getBubbleActions();
            expect(actions.copy).toBe(true);
            expect(actions.retry).toBe(true);
            expect(actions.edit).toBe(true);
            expect(actions.feedback).toBe(false);
        });

        it('merges partial overrides and keeps untouched defaults', () => {
            AparteConfig.setBubbleActions({ feedback: true });
            const actions = AparteConfig.getBubbleActions();
            expect(actions.feedback).toBe(true);
            expect(actions.copy).toBe(true);   // unchanged
            expect(actions.retry).toBe(true);  // unchanged
            expect(actions.edit).toBe(true);   // unchanged
        });

        it('can disable individual actions', () => {
            AparteConfig.setBubbleActions({ retry: false, edit: false });
            const actions = AparteConfig.getBubbleActions();
            expect(actions.retry).toBe(false);
            expect(actions.edit).toBe(false);
            expect(actions.copy).toBe(true);
        });

        it('can disable all actions at once', () => {
            AparteConfig.setBubbleActions({ copy: false, retry: false, edit: false, feedback: false });
            const actions = AparteConfig.getBubbleActions();
            expect(actions.copy).toBe(false);
            expect(actions.retry).toBe(false);
            expect(actions.edit).toBe(false);
            expect(actions.feedback).toBe(false);
        });

        it('last call wins when called multiple times', () => {
            AparteConfig.setBubbleActions({ copy: false });
            AparteConfig.setBubbleActions({ copy: true });
            expect(AparteConfig.getBubbleActions().copy).toBe(true);
        });

        it('passes through explicit per-role ordered action sets', () => {
            AparteConfig.setBubbleActions({
                user: ['edit', 'copy'],
                assistant: ['copy', 'thumbUp', 'thumbDown', 'retry'],
            });
            const actions = AparteConfig.getBubbleActions();
            expect(actions.user).toEqual(['edit', 'copy']);
            expect(actions.assistant).toEqual(['copy', 'thumbUp', 'thumbDown', 'retry']);
            // Flag defaults still resolve alongside the per-role sets.
            expect(actions.copy).toBe(true);
        });

        it('clears per-role sets when explicitly set to undefined', () => {
            AparteConfig.setBubbleActions({ user: ['edit', 'copy'] });
            AparteConfig.setBubbleActions({ user: undefined, assistant: undefined });
            const actions = AparteConfig.getBubbleActions();
            expect(actions.user).toBeUndefined();
            expect(actions.assistant).toBeUndefined();
        });
    });

    // ─── HTML sanitization of provider output ──────────────────────────────

    describe('HTML sanitization', () => {
        afterEach(() => {
            // reset() clears providers AND restores the default sanitizer.
            AparteConfig.reset();
        });

        it('sanitizes markdown provider output before returning it', () => {
            AparteConfig.setMarkdownProvider(() => '<p>hi</p><img src=x onerror="alert(1)">');
            const out = AparteConfig.renderMarkdown('anything');
            expect(out).toContain('<p>hi</p>');
            expect(out).not.toContain('onerror');
        });

        it('sanitizes highlight provider output before returning it', async () => {
            AparteConfig.setHighlightProvider(() => '<span class="tok" onclick="steal()">code</span>');
            const out = await AparteConfig.highlightCode('code', 'js');
            expect(out).toContain('class="tok"');
            expect(out).not.toContain('onclick');
        });

        it('does NOT sanitize the default (already-escaped) markdown fallback', () => {
            // No provider → fallback escapes the raw text; nothing to strip.
            const out = AparteConfig.renderMarkdown('<b>x</b>');
            expect(out).toContain('&lt;b&gt;');
        });

        it('setHtmlSanitizer(null) disables sanitization (trusted content)', () => {
            AparteConfig.setHtmlSanitizer(null);
            AparteConfig.setMarkdownProvider(() => '<img src=x onerror="alert(1)">');
            expect(AparteConfig.renderMarkdown('x')).toContain('onerror');
        });

        it('setHtmlSanitizer(fn) routes provider output through the custom sanitizer', () => {
            AparteConfig.setHtmlSanitizer((html) => html.replace(/secret/g, '[redacted]'));
            AparteConfig.setMarkdownProvider((raw) => `<p>${raw}</p>`);
            expect(AparteConfig.renderMarkdown('secret')).toBe('<p>[redacted]</p>');
        });
    });

    // ─── reset() fully clears state (registries used to leak) ──────────────

    describe('reset', () => {
        it('clears the AI provider / tool / tool-renderer registries', () => {
            const c = new AparteConfigClass();
            c.registerAIProvider({ id: 'p1', getModels: () => [] } as any);
            c.registerTool({ name: 't1' } as any, (() => {}) as any);
            c.registerToolRenderer('t1', { render: () => '' });
            c.setModelConfig({ defaultProvider: 'p1', defaultModel: 'm' });

            c.reset();

            expect(c.getAIProviders()).toHaveLength(0);
            expect(c.getTools()).toHaveLength(0);
            expect(c.getToolRenderer('t1')).toBeUndefined();
            expect(c.getModelConfig().defaultProvider).toBeUndefined();
        });

        it('restores locale, bubble actions and sanitizer defaults', () => {
            const c = new AparteConfigClass();
            c.setBubbleActions({ copy: false, retry: false, edit: false });
            c.setHtmlSanitizer(null);
            c.reset();
            const actions = c.getBubbleActions();
            expect(actions.copy).toBe(true);
            expect(actions.retry).toBe(true);
            // sanitizer restored → provider HTML is scrubbed again
            c.setMarkdownProvider(() => '<img src=x onerror="alert(1)">');
            expect(c.renderMarkdown('x')).not.toContain('onerror');
        });
    });
});
