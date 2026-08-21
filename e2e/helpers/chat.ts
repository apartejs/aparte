/**
 * Page object over the `@aparte/core` custom-element DOM.
 *
 * Every spec used to spell out its own `aparte-composer-input
 * [contenteditable="true"]`-style selectors, so a renamed class or a moved
 * element broke a handful of files in different ways. The locators live here
 * once; specs read as behaviour. The DOM is identical across React, Vue, Svelte,
 * Angular and vanilla, so one object drives all six playgrounds.
 *
 * Scoping: pass a `root` selector to drive ONE chat on a page that mounts
 * several (the multi-chat suite) — without it, locators resolve page-wide and
 * `.first()` wins, which is what the single-chat specs want.
 */

import { expect, type Locator, type Page } from '@playwright/test';

export type BubbleRole = 'user' | 'assistant';

/** Action-bar buttons, by the `data-action` the bubble renders. */
export type BubbleAction =
    | 'copy'
    | 'retry'
    | 'edit'
    | 'feedback-positive'
    | 'feedback-negative'
    | 'info';

export class ChatPage {
    readonly page: Page;
    private readonly scope: Locator;

    constructor(page: Page, root?: string) {
        this.page = page;
        // `locator('body')` keeps the unscoped case a real Locator, so every
        // accessor below is written the same way with or without a root.
        this.scope = root ? page.locator(root) : page.locator('body');
    }

    // ── composer ────────────────────────────────────────────────────────────

    get composer(): Locator {
        return this.scope.locator('aparte-composer').first();
    }

    /** The contenteditable the user types into. */
    get editor(): Locator {
        return this.scope.locator('aparte-composer-input [contenteditable="true"]').first();
    }

    get sendButton(): Locator {
        return this.scope.locator('aparte-composer-send button').first();
    }

    /** The attachment picker button. */
    get attachButton(): Locator {
        return this.scope.locator('aparte-composer-add-attachment').first();
    }

    /** Pending attachment tiles in the composer (before send). */
    get composerAttachments(): Locator {
        return this.scope.locator('aparte-composer-attachments .aparte-thumb');
    }

    /** True while the composer is blocked by the require-model gate. */
    get gatedComposer(): Locator {
        return this.scope.locator('aparte-composer[data-model-gated]').first();
    }

    // ── transcript ──────────────────────────────────────────────────────────

    get viewport(): Locator {
        return this.scope.locator('aparte-chat-viewport').first();
    }

    get status(): Locator {
        return this.scope.locator('aparte-chat-status').first();
    }

    bubbles(role?: BubbleRole): Locator {
        return role
            ? this.scope.locator(`aparte-chat-bubble[data-role="${role}"]`)
            : this.scope.locator('aparte-chat-bubble');
    }

    /** The last assistant bubble — the one a fresh reply lands in. */
    get lastReply(): Locator {
        return this.bubbles('assistant').last();
    }

    /** An action-bar button inside `bubble`. */
    action(bubble: Locator, action: BubbleAction): Locator {
        return bubble.locator(`.aparte-action-btn[data-action="${action}"]`);
    }

    /**
     * Messages currently streaming. Note the `="true"`: core sets
     * `data-streaming="false"` when a turn ends rather than removing the
     * attribute, so a bare `[data-streaming]` matches settled bubbles too — a
     * trap worth encapsulating once here instead of in every spec.
     */
    streaming(scope: Locator = this.scope): Locator {
        return scope.locator('.aparte-message[data-streaming="true"]');
    }

    /** The ‹n/m› sibling picker of a branched message. */
    branchPicker(bubble: Locator): Locator {
        return bubble.locator('.aparte-branch-picker');
    }

    /** Attachment tiles rendered inside a sent message. */
    bubbleAttachments(bubble: Locator): Locator {
        return bubble.locator('.aparte-attachments .aparte-thumb');
    }

    /** A rendered segment by type, e.g. `segment('thinking')`. */
    segment(type: string): Locator {
        return this.scope.locator(`.segment-${type}`);
    }

    // ── model selector ──────────────────────────────────────────────────────

    get modelSelector(): Locator {
        return this.scope.locator('aparte-model-selector').first();
    }

    get modelTrigger(): Locator {
        return this.modelSelector.locator('.aparte-select-trigger').first();
    }

    get modelOptions(): Locator {
        return this.modelSelector.locator('aparte-option');
    }

    get modelDropdown(): Locator {
        return this.modelSelector.locator('.aparte-select-dropdown');
    }

    /**
     * Provider groups. With more than one provider registered the selector groups
     * models into `<aparte-optgroup collapsed>`, so their options are
     * `display:none` until a group is expanded — open the dropdown, then expand.
     */
    get modelGroups(): Locator {
        return this.modelSelector.locator('aparte-optgroup');
    }

    /**
     * Open the dropdown and expand the first (or named) provider group.
     *
     * Returns the scope holding the now-visible options: the expanded group, or
     * the whole selector when a single provider renders a flat list. Scope option
     * lookups to it — the same model id exists under every provider, and options
     * in the other, still-collapsed groups are present but hidden.
     */
    async openModelList(groupLabel?: string): Promise<Locator> {
        await this.modelTrigger.click();
        await expect(this.modelDropdown).toBeVisible();
        if ((await this.modelGroups.count()) === 0) return this.modelSelector; // flat list
        const group = groupLabel
            ? this.modelGroups.filter({ hasText: groupLabel }).first()
            : this.modelGroups.first();
        if (await group.evaluate((el) => el.hasAttribute('collapsed'))) {
            await group.locator('.aparte-optgroup-header').first().click();
        }
        await expect(group.locator('aparte-option').first()).toBeVisible();
        // Expanding a group starts a LAZY per-provider model fetch, and when it lands
        // the selector rebuilds EVERY option element (`optionsContainer.innerHTML =
        // …`). Returning while that is in flight left each caller racing a full
        // re-render: the keyboard highlight is re-anchored onto a brand-new element,
        // which mints a fresh `aparte-option-N` id — so any id read before the
        // refresh is dead, on a highlight that never actually moved. That is the
        // model-selector flake, reproduced. The group carries `loading` for the
        // duration of the fetch; wait it out. Nothing lazy to load → already 0.
        await expect(this.modelSelector.locator('aparte-optgroup[loading]')).toHaveCount(0);
        return group;
    }

    // ── actions ─────────────────────────────────────────────────────────────

    /**
     * Wait until the require-model gate opens — i.e. the selector fetched its
     * list and a model auto-selected. Until then core's `submit()` bails, so a
     * send would silently no-op.
     */
    async waitUngated(): Promise<void> {
        await expect(this.scope.locator('aparte-composer:not([data-model-gated])').first())
            .toBeAttached({ timeout: 20_000 });
    }

    /**
     * Attach files through the real picker. The component creates its `<input
     * type="file">` on demand, appends it to `document.body` and removes it after
     * the change event, so there is no stable input to target — the file-chooser
     * event is the only reliable hook.
     */
    async attachFiles(files: { name: string; mimeType: string; buffer: Buffer }[]): Promise<void> {
        const [chooser] = await Promise.all([
            this.page.waitForEvent('filechooser'),
            this.attachButton.click(),
        ]);
        await chooser.setFiles(files);
    }

    /**
     * Pick a model with the keyboard: open the list, walk the roving highlight to
     * the option whose label matches, then Enter.
     *
     * Clicking works too, but the selector re-renders whenever the config
     * notifies, so a click can chase a moving target ("element is not stable").
     * Keyboard selection is both a real user path and immune to that churn.
     */
    async selectModelByKeyboard(label: string | RegExp, maxSteps = 20): Promise<void> {
        await this.openModelList();
        const matcher = typeof label === 'string' ? (t: string) => t.includes(label) : (t: string) => label.test(t);
        const seen: string[] = [];
        for (let i = 0; i < maxSteps; i++) {
            await this.page.keyboard.press('ArrowDown');
            const active = this.modelSelector.locator('aparte-option[data-active]');
            // Bound this READ. `count()` then `textContent()` is a race on an element
            // the selector re-renders under us: when the highlight vanishes in
            // between, an unbounded `textContent()` waits for it to come back and
            // burns the whole 45s test timeout in one iteration (seen once on
            // react-webkit). A vanished highlight is just "not it yet" — take the
            // empty string and press ArrowDown again.
            const text = await active.first().textContent({ timeout: 1_000 }).catch(() => '');
            if (text) seen.push(text.trim());
            if (matcher(text ?? '')) {
                await this.page.keyboard.press('Enter');
                await expect(this.modelDropdown).toBeHidden();
                return;
            }
        }
        throw new Error(
            `no option matching ${String(label)} within ${maxSteps} keyboard steps.`
            + ` Highlighted along the way: ${seen.length ? seen.join(' | ') : '(nothing — the list never took focus)'}`,
        );
    }

    /** Type into the composer without sending (for gate / draft assertions). */
    async type(text: string): Promise<void> {
        await this.editor.click();
        await this.editor.pressSequentially(text);
    }

    /**
     * Send `text` through the real UI (click → `submit()` → `aparte-send` →
     * client). Returns once the user bubble exists; it does NOT wait for the
     * reply, so mid-stream state stays observable. Use {@link sendAndSettle} for
     * the happy path.
     */
    async send(text: string, opts: { gated?: boolean } = {}): Promise<void> {
        if (opts.gated !== false) await this.waitUngated();
        const priorUserBubbles = await this.bubbles('user').count();
        await this.type(text);
        await this.sendButton.click();
        await expect(this.bubbles('user')).toHaveCount(priorUserBubbles + 1, { timeout: 20_000 });
    }

    /** Send and wait for a NEW assistant bubble to finish streaming. */
    async sendAndSettle(text: string, opts: { gated?: boolean; expect?: string | RegExp } = {}): Promise<void> {
        const priorReplies = await this.bubbles('assistant').count();
        await this.send(text, opts);
        const replies = this.bubbles('assistant');
        await expect(replies).toHaveCount(priorReplies + 1, { timeout: 20_000 });
        if (opts.expect !== undefined) {
            await expect(replies.last()).toContainText(opts.expect, { timeout: 20_000 });
        }
        await expect(replies.last().locator('.aparte-message-streaming')).toHaveCount(0, { timeout: 20_000 });
    }

    /** Roles of the rendered bubbles in DOM order, e.g. ['user','assistant']. */
    async roles(): Promise<(string | null)[]> {
        return this.bubbles().evaluateAll((els) => els.map((e) => e.getAttribute('data-role')));
    }

    /**
     * Start recording every dispatch of a core CustomEvent on `document`, and
     * return a reader for what has been captured so far.
     *
     * Installation is awaited, so the listener is guaranteed to be in place
     * before the action that triggers it — the reason this records into an array
     * instead of awaiting a one-shot promise (which would either race the action
     * or block the test).
     */
    async recordEvents<T = unknown>(name: string): Promise<() => Promise<T[]>> {
        const key = `__aparteRec_${name.replace(/[^a-z0-9]/gi, '_')}`;
        await this.page.evaluate(
            ({ eventName, storeKey }) => {
                const store = window as unknown as Record<string, unknown[] | undefined>;
                if (store[storeKey]) return;
                const bucket: unknown[] = [];
                store[storeKey] = bucket;
                document.addEventListener(eventName, (e) => bucket.push((e as CustomEvent).detail));
            },
            { eventName: name, storeKey: key },
        );
        return () =>
            this.page.evaluate(
                (storeKey) => ((window as unknown as Record<string, unknown[] | undefined>)[storeKey] ?? []),
                key,
            ) as Promise<T[]>;
    }
}
