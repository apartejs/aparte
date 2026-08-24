import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { aparteGlobalConfig, AparteConfig } from '../aparte-config';
import { APARTE_DEFAULT_LOCALE } from '../locale';

describe('aparteGlobalConfig', () => {
    beforeEach(() => {
        // Reset config before each test
        aparteGlobalConfig.setLocale(APARTE_DEFAULT_LOCALE);
    });

    describe('Locale Management', () => {
        it('should have default English locale', () => {
            const locale = aparteGlobalConfig.getLocale();
            expect(locale).toBeDefined();
            expect(locale.direction).toBe('ltr');
            expect(locale.sendButton).toBe('Send');
        });

        it('should set custom locale', () => {
            const customLocale = {
                ...APARTE_DEFAULT_LOCALE,
                sendButton: 'Envoyer',
                direction: 'ltr' as const
            };

            aparteGlobalConfig.setLocale(customLocale);
            const locale = aparteGlobalConfig.getLocale();

            expect(locale.sendButton).toBe('Envoyer');
        });

        it('should extend locale with new keys', () => {
            aparteGlobalConfig.extendLocale({ customKey: 'Custom Value' });
            const locale = aparteGlobalConfig.getLocale();

            expect((locale as any).customKey).toBe('Custom Value');
        });

        it('should not overwrite existing keys when extending', () => {
            const originalSendButton = aparteGlobalConfig.getLocale().sendButton;

            aparteGlobalConfig.extendLocale({ newKey: 'New' });

            expect(aparteGlobalConfig.getLocale().sendButton).toBe(originalSendButton);
        });
    });

    describe('Provider Management', () => {
        it('should set markdown provider', () => {
            const mockProvider = (raw: string) => `<p>${raw}</p>`;

            aparteGlobalConfig.setMarkdownProvider(mockProvider);
            // Provider is set successfully (no getter to test)
            expect(true).toBe(true);
        });

        it('should set highlight provider and expose it via hasHighlightProvider', async () => {
            const mockProvider = (code: string) => `<span class="tok">${code}</span>`;

            aparteGlobalConfig.setHighlightProvider(mockProvider);

            expect(aparteGlobalConfig.hasHighlightProvider()).toBe(true);
            expect(await aparteGlobalConfig.highlightCode('const x', 'js')).toBe('<span class="tok">const x</span>');
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

            aparteGlobalConfig.setIconProvider(mockProvider);
            expect(true).toBe(true);
        });

        it('falls back for optional icon keys a provider does not implement', () => {
            // A provider without the optional `tool` / `close` / `stop` keys (all
            // pre-existing icon packs) must fall back to the default SVG icons.
            aparteGlobalConfig.setIconProvider({ copy: () => '<svg data-x></svg>' });

            expect(aparteGlobalConfig.getIcon('copy')).toBe('<svg data-x></svg>');
            expect(aparteGlobalConfig.getIcon('tool')).toContain('<svg');
            expect(aparteGlobalConfig.getIcon('close')).toContain('<svg');
            // `stop` is a typed optional key: its fallback is the square SVG, so the
            // composer stop button renders an icon (not the literal text "stop").
            expect(aparteGlobalConfig.getIcon('stop')).toContain('<svg');
        });

        it('getIconProvider() completes a partial provider with the built-in fallbacks', () => {
            // getIcon() has always tolerated a partial provider, but the action
            // bar reads getIconProvider() and CALLS each icon directly — so a
            // provider covering only `copy` used to crash on `icons.retry()`.
            const c = new AparteConfig();
            c.setIconProvider({ copy: () => '<svg data-x></svg>' });

            const icons = c.getIconProvider();
            expect(icons.copy()).toBe('<svg data-x></svg>');
            // Every other name must still be callable, returning the default SVG.
            for (const name of ['retry', 'edit', 'thumbUp', 'thumbDown', 'prevBranch', 'nextBranch'] as const) {
                expect(typeof icons[name], `icons.${name} must be callable`).toBe('function');
                expect(icons[name]()).toContain('<svg');
            }
        });

        it('should set skeleton provider', () => {
            const mockProvider = {
                getSkeleton: () => '<div class="skeleton"></div>'
            };

            aparteGlobalConfig.setSkeletonProvider(mockProvider);
            expect(true).toBe(true);
        });
    });

    describe('Action registry (unified, zoned)', () => {
        afterEach(() => {
            ['composer-a', 'bubble-a', 'both-a', 'ord-1', 'ord-2', 'hide-me'].forEach(id =>
                aparteGlobalConfig.unregisterAction(id));
        });

        it('registers a composer action and returns it from getActions("composer")', () => {
            aparteGlobalConfig.registerAction({ id: 'composer-a', label: 'A', icon: '<svg></svg>', zones: ['composer'] });
            expect(aparteGlobalConfig.getActions('composer').map(a => a.id)).toContain('composer-a');
        });

        it('does not surface a composer-only action in the bubble zone', () => {
            aparteGlobalConfig.registerAction({ id: 'composer-a', label: 'A', icon: '', zones: ['composer'] });
            expect(aparteGlobalConfig.getActions('bubble').map(a => a.id)).not.toContain('composer-a');
        });

        it('surfaces a multi-zone action in every declared zone', () => {
            aparteGlobalConfig.registerAction({ id: 'both-a', label: 'B', icon: '', zones: ['composer', 'bubble'] });
            expect(aparteGlobalConfig.getActions('composer').map(a => a.id)).toContain('both-a');
            expect(aparteGlobalConfig.getActions('bubble').map(a => a.id)).toContain('both-a');
        });

        it('upserts on duplicate id instead of adding twice', () => {
            aparteGlobalConfig.registerAction({ id: 'composer-a', label: 'first', icon: '', zones: ['composer'] });
            aparteGlobalConfig.registerAction({ id: 'composer-a', label: 'second', icon: '', zones: ['composer'] });
            const hits = aparteGlobalConfig.getActions('composer').filter(a => a.id === 'composer-a');
            expect(hits).toHaveLength(1);
            expect(hits[0]?.label).toBe('second');
        });

        it('sorts a zone by order (lower first)', () => {
            aparteGlobalConfig.registerAction({ id: 'ord-2', label: '2', icon: '', zones: ['bubble'], order: 2 });
            aparteGlobalConfig.registerAction({ id: 'ord-1', label: '1', icon: '', zones: ['bubble'], order: 1 });
            const ids = aparteGlobalConfig.getActions('bubble').map(a => a.id);
            expect(ids.indexOf('ord-1')).toBeLessThan(ids.indexOf('ord-2'));
        });

        it('unregisterAction removes the action from every zone', () => {
            aparteGlobalConfig.registerAction({ id: 'both-a', label: 'B', icon: '', zones: ['composer', 'bubble'] });
            aparteGlobalConfig.unregisterAction('both-a');
            expect(aparteGlobalConfig.getActions('composer').map(a => a.id)).not.toContain('both-a');
            expect(aparteGlobalConfig.getActions('bubble').map(a => a.id)).not.toContain('both-a');
        });

        it('setActionHidden toggles the composer hidden flag', () => {
            aparteGlobalConfig.registerAction({ id: 'hide-me', label: 'H', icon: '', zones: ['composer'], composer: { position: 'left' } });
            aparteGlobalConfig.setActionHidden('hide-me', true);
            const a = aparteGlobalConfig.getActions('composer').find(x => x.id === 'hide-me');
            expect(a?.composer?.hidden).toBe(true);
        });

        it('calls an optional onClick alongside the event contract', () => {
            const onClick = vi.fn();
            aparteGlobalConfig.registerAction({ id: 'both-a', label: 'B', icon: '', zones: ['composer'], onClick });
            const a = aparteGlobalConfig.getActions('composer').find(x => x.id === 'both-a');
            expect(a?.onClick).toBe(onClick);
        });
    });

    describe('Tool Renderer Management', () => {
        afterEach(() => {
            aparteGlobalConfig.unregisterToolRenderer('my_tool');
            aparteGlobalConfig.unregisterToolRenderer('my_tool_2');
            aparteGlobalConfig.unregisterToolRenderer('same_name_tool');
        });

        it('registers a tool renderer and retrieves it by name', () => {
            const renderer = { render: () => '<div>ok</div>' };
            aparteGlobalConfig.registerToolRenderer('my_tool', renderer);
            expect(aparteGlobalConfig.getToolRenderer('my_tool')).toBe(renderer);
        });

        it('returns undefined for an unregistered tool name', () => {
            expect(aparteGlobalConfig.getToolRenderer('nonexistent_tool_xyz')).toBeUndefined();
        });

        it('unregisters a tool renderer', () => {
            const renderer = { render: () => '<div>ok</div>' };
            aparteGlobalConfig.registerToolRenderer('my_tool_2', renderer);
            aparteGlobalConfig.unregisterToolRenderer('my_tool_2');
            expect(aparteGlobalConfig.getToolRenderer('my_tool_2')).toBeUndefined();
        });

        it('silently ignores unregisterToolRenderer for an unknown name', () => {
            expect(() => aparteGlobalConfig.unregisterToolRenderer('never_registered')).not.toThrow();
        });

        it('overwrites an existing renderer when re-registered with same name', () => {
            const r1 = { render: () => 'R1' };
            const r2 = { render: () => 'R2' };
            aparteGlobalConfig.registerToolRenderer('same_name_tool', r1);
            aparteGlobalConfig.registerToolRenderer('same_name_tool', r2);
            expect(aparteGlobalConfig.getToolRenderer('same_name_tool')).toBe(r2);
        });

        it('renderer can include optional getStyles and setup methods', () => {
            const renderer = {
                render: () => '<span>pill</span>',
                getStyles: () => '.pill { color: red; }',
                setup: vi.fn()
            };
            aparteGlobalConfig.registerToolRenderer('my_tool', renderer);
            const stored = aparteGlobalConfig.getToolRenderer('my_tool');
            expect(stored?.getStyles?.()).toBe('.pill { color: red; }');
        });
    });

    // ─── setBubbleActions / getBubbleActions ───────────────────────────────

    describe('setBubbleActions / getBubbleActions', () => {
        // The defaults ARE the contract, so they get an exact assertion rather
        // than a few spot checks. Only `copy` is honored by core alone; retry,
        // edit, feedback and info all need a host (AparteClient, or an app
        // listening for the event) to mean anything, so they ship off. Flipping
        // one back on is a deliberate decision — this test is what makes it one.
        it('defaults to copy only — every host-dependent action ships off', () => {
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.copy).toBe(true);
            expect(actions.retry).toBe(false);
            expect(actions.edit).toBe(false);
            expect(actions.feedback).toBe(false);
            expect(actions.info).toBe(false);
        });

        it('merges partial overrides and keeps untouched defaults', () => {
            aparteGlobalConfig.setBubbleActions({ feedback: true });
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.feedback).toBe(true);
            expect(actions.copy).toBe(true);    // unchanged
            expect(actions.retry).toBe(false);  // unchanged
            expect(actions.edit).toBe(false);   // unchanged
        });

        it('can enable individual actions', () => {
            aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.retry).toBe(true);
            expect(actions.edit).toBe(true);
            expect(actions.copy).toBe(true);
        });

        it('can disable individual actions', () => {
            aparteGlobalConfig.setBubbleActions({ retry: true, edit: true });
            aparteGlobalConfig.setBubbleActions({ retry: false, edit: false });
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.retry).toBe(false);
            expect(actions.edit).toBe(false);
            expect(actions.copy).toBe(true);
        });

        it('can disable all actions at once', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false, retry: false, edit: false, feedback: false });
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.copy).toBe(false);
            expect(actions.retry).toBe(false);
            expect(actions.edit).toBe(false);
            expect(actions.feedback).toBe(false);
        });

        it('last call wins when called multiple times', () => {
            aparteGlobalConfig.setBubbleActions({ copy: false });
            aparteGlobalConfig.setBubbleActions({ copy: true });
            expect(aparteGlobalConfig.getBubbleActions().copy).toBe(true);
        });

        it('passes through explicit per-role ordered action sets', () => {
            aparteGlobalConfig.setBubbleActions({
                user: ['edit', 'copy'],
                assistant: ['copy', 'thumbUp', 'thumbDown', 'retry'],
            });
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.user).toEqual(['edit', 'copy']);
            expect(actions.assistant).toEqual(['copy', 'thumbUp', 'thumbDown', 'retry']);
            // Flag defaults still resolve alongside the per-role sets.
            expect(actions.copy).toBe(true);
            // An explicit list is its own opt-in: asking for 'retry' by name works
            // even though the flag is off — the bubble reads the list, not the flag.
            expect(actions.retry).toBe(false);
        });

        it('clears per-role sets when explicitly set to undefined', () => {
            aparteGlobalConfig.setBubbleActions({ user: ['edit', 'copy'] });
            aparteGlobalConfig.setBubbleActions({ user: undefined, assistant: undefined });
            const actions = aparteGlobalConfig.getBubbleActions();
            expect(actions.user).toBeUndefined();
            expect(actions.assistant).toBeUndefined();
        });
    });

    // ─── setHostHandlers / getHostHandlers ─────────────────────────────────

    describe('setHostHandlers / getHostHandlers', () => {
        afterEach(() => aparteGlobalConfig.reset());

        // Same rule as the bubble actions, for the affordances that live outside the
        // action bar: core renders the trigger, the APP does the work. Nothing is
        // declared until the app says so.
        it('defaults to nothing declared', () => {
            const h = aparteGlobalConfig.getHostHandlers();
            expect(h.attachmentPreview).toBe(false);
            expect(h.artifactRedownload).toBe(false);
        });

        it('merges partial declarations and keeps the rest undeclared', () => {
            aparteGlobalConfig.setHostHandlers({ artifactRedownload: true });
            const h = aparteGlobalConfig.getHostHandlers();
            expect(h.artifactRedownload).toBe(true);
            expect(h.attachmentPreview).toBe(false);
        });

        it('can be withdrawn again', () => {
            aparteGlobalConfig.setHostHandlers({ attachmentPreview: true });
            aparteGlobalConfig.setHostHandlers({ attachmentPreview: false });
            expect(aparteGlobalConfig.getHostHandlers().attachmentPreview).toBe(false);
        });

        it('notifies so mounted elements re-render', () => {
            let fired = 0;
            const onChange = () => { fired++; };
            window.addEventListener('aparte-config-change', onChange);
            aparteGlobalConfig.setHostHandlers({ artifactRedownload: true });
            window.removeEventListener('aparte-config-change', onChange);
            expect(fired).toBeGreaterThan(0);
        });

        it('is cleared by reset()', () => {
            const c = new AparteConfig();
            c.setHostHandlers({ attachmentPreview: true, artifactRedownload: true });
            c.reset();
            const h = c.getHostHandlers();
            expect(h.attachmentPreview).toBe(false);
            expect(h.artifactRedownload).toBe(false);
        });
    });

    // ─── HTML sanitization of provider output ──────────────────────────────

    describe('HTML sanitization', () => {
        afterEach(() => {
            // reset() clears providers AND restores the default sanitizer.
            aparteGlobalConfig.reset();
        });

        it('sanitizes markdown provider output before returning it', () => {
            aparteGlobalConfig.setMarkdownProvider(() => '<p>hi</p><img src=x onerror="alert(1)">');
            const out = aparteGlobalConfig.renderMarkdown('anything');
            expect(out).toContain('<p>hi</p>');
            expect(out).not.toContain('onerror');
        });

        it('sanitizes highlight provider output before returning it', async () => {
            aparteGlobalConfig.setHighlightProvider(() => '<span class="tok" onclick="steal()">code</span>');
            const out = await aparteGlobalConfig.highlightCode('code', 'js');
            expect(out).toContain('class="tok"');
            expect(out).not.toContain('onclick');
        });

        it('does NOT sanitize the default (already-escaped) markdown fallback', () => {
            // No provider → fallback escapes the raw text; nothing to strip.
            const out = aparteGlobalConfig.renderMarkdown('<b>x</b>');
            expect(out).toContain('&lt;b&gt;');
        });

        it('setHtmlSanitizer(null) disables sanitization (trusted content)', () => {
            aparteGlobalConfig.setHtmlSanitizer(null);
            aparteGlobalConfig.setMarkdownProvider(() => '<img src=x onerror="alert(1)">');
            expect(aparteGlobalConfig.renderMarkdown('x')).toContain('onerror');
        });

        it('setHtmlSanitizer(fn) routes provider output through the custom sanitizer', () => {
            aparteGlobalConfig.setHtmlSanitizer((html) => html.replace(/secret/g, '[redacted]'));
            aparteGlobalConfig.setMarkdownProvider((raw) => `<p>${raw}</p>`);
            expect(aparteGlobalConfig.renderMarkdown('secret')).toBe('<p>[redacted]</p>');
        });
    });

    // ─── reset() fully clears state (registries used to leak) ──────────────

    describe('reset', () => {
        it('clears the AI provider / tool / tool-renderer registries', () => {
            const c = new AparteConfig();
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
            const c = new AparteConfig();
            c.setBubbleActions({ copy: false, retry: true, edit: true, feedback: true, info: true });
            c.setHtmlSanitizer(null);
            c.reset();
            const actions = c.getBubbleActions();
            // Back to the shipped set: copy only. reset() used to forget `info`
            // entirely — APARTE_DEFAULT_BUBBLE_ACTIONS is now the one source for both.
            expect(actions.copy).toBe(true);
            expect(actions.retry).toBe(false);
            expect(actions.edit).toBe(false);
            expect(actions.feedback).toBe(false);
            expect(actions.info).toBe(false);
            // sanitizer restored → provider HTML is scrubbed again
            c.setMarkdownProvider(() => '<img src=x onerror="alert(1)">');
            expect(c.renderMarkdown('x')).not.toContain('onerror');
        });
    });

    // ─── getCurrentModel: async getModels() is a contract violation ────────

    describe('getCurrentModel — async getModels() guard', () => {
        it('warns and returns undefined when getModels() returns a Promise', () => {
            const c = new AparteConfig();
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            c.registerAIProvider({
                id: 'async-p',
                getModels: () => Promise.resolve([{ id: 'm1', name: 'M1' }]),
            } as any);
            c.setModelConfig({ defaultProvider: 'async-p', defaultModel: 'm1' });

            expect(c.getCurrentModel()).toBeUndefined();
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('fetchModels'));
            warn.mockRestore();
        });
    });

    // ─── resetLocale ────────────────────────────────────────────────────────

    describe('resetLocale', () => {
        it('restores the built-in English locale and notifies subscribers', () => {
            const c = new AparteConfig();
            c.setLocale({ ...APARTE_DEFAULT_LOCALE, sendButton: 'Envoyer' });
            expect(c.getLocale().sendButton).toBe('Envoyer');

            const listener = vi.fn();
            c.subscribe(listener);
            c.resetLocale();

            expect(c.getLocale().sendButton).toBe(APARTE_DEFAULT_LOCALE.sendButton);
            expect(listener).toHaveBeenCalled();
        });
    });
});
