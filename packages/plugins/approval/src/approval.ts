/**
 * `setupApproval` — one call installs a mode-driven approval policy on a config.
 *
 * The plugin owns the MODE (a value the person switches) and the TABLE (policy.ts);
 * core owns the mechanism — `setApprovalPolicy`, the gate, the panel that asks, the
 * refusal the model reads. Nothing is executed here and nothing is stored: a mode
 * survives exactly as long as the page, and a host that wants it remembered reads
 * `getMode()` / `onModeChange` and writes wherever it keeps its preferences.
 */
import { aparteGlobalConfig, type AparteConfig, type AparteApprovalPolicy } from '@aparte/core';
import {
    APPROVAL_MODES, createApprovalPolicy, classifyTool,
    type ApprovalMode, type ApprovalClassification, type ToolClass,
} from './policy.js';

export interface ApprovalSetupOptions {
    /** Your tool names, by what they do. Unlisted names keep their own `needsApproval`. */
    classify: ApprovalClassification;
    /** The starting mode. Default: `ask`. */
    mode?: ApprovalMode;
    /** Called after every switch, with the new and the previous mode. */
    onModeChange?: (mode: ApprovalMode, previous: ApprovalMode) => void;
}

/** What `setupApproval` returns: the mode, readable and switchable, and the way out. */
export interface ApprovalController {
    /** The four modes, in the order a switch presents them. */
    readonly modes: readonly ApprovalMode[];
    getMode(): ApprovalMode;
    /** Switch the mode; the next tool call is ruled under it. Unknown values are ignored. */
    setMode(mode: ApprovalMode): void;
    /** The class this setup gives a tool name, or `undefined`. */
    classify(name: string): ToolClass | undefined;
    /** Be told of every switch — from `setMode` or from a `<aparte-approval-mode>`. Returns the unsubscribe. */
    subscribe(listener: (mode: ApprovalMode, previous: ApprovalMode) => void): () => void;
    /** Remove the policy from the config and forget this controller. */
    dispose(): void;
}

const controllers = new WeakMap<AparteConfig, ApprovalController>();
// The policy each controller installed, so a controller whose policy is gone — a
// `config.reset()`, a `setApprovalPolicy(null)` from elsewhere — reads as no setup
// rather than as a switch wired to nothing.
const installed = new WeakMap<AparteConfig, AparteApprovalPolicy>();
/** Whether the policy on `config` is still the one this module installed there. */
const isInstalled = (config: AparteConfig): boolean =>
    config.getApprovalPolicy() === installed.get(config);

/**
 * Install the policy on `config` (the global one by default) and return its controller.
 *
 * Calling it twice on one config replaces the first setup — its policy is removed and
 * its listeners dropped — so a hot-reloading host does not stack policies.
 *
 * @example
 * ```ts
 * import { setupApproval } from '@aparte/plugin-approval';
 *
 * const approval = setupApproval(aparteGlobalConfig, {
 *   classify: {
 *     read:  ['read_file', 'search', /^list_/],
 *     write: ['write_file', 'edit_file'],
 *     exec:  ['run_command'],
 *   },
 *   mode: 'ask',
 * });
 * approval.setMode('plan');   // or drop <aparte-approval-mode> in the composer's toolbar
 * ```
 */
export function setupApproval(config: AparteConfig = aparteGlobalConfig, options: ApprovalSetupOptions): ApprovalController {
    controllers.get(config)?.dispose();

    let mode: ApprovalMode = options.mode ?? 'ask';
    const listeners = new Set<(mode: ApprovalMode, previous: ApprovalMode) => void>();
    if (options.onModeChange) listeners.add(options.onModeChange);

    const controller: ApprovalController = {
        modes: APPROVAL_MODES,
        getMode: () => mode,
        setMode(next) {
            if (!APPROVAL_MODES.includes(next) || next === mode) return;
            const previous = mode;
            mode = next;
            for (const l of listeners) l(next, previous);
        },
        classify: (name) => classifyTool(name, options.classify),
        subscribe(listener) {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
        dispose() {
            if (controllers.get(config) === controller) {
                // Only the policy this setup installed: a config whose policy was since
                // replaced by someone else keeps that replacement.
                if (isInstalled(config)) config.setApprovalPolicy(null);
                controllers.delete(config);
                installed.delete(config);
            }
            listeners.clear();
        },
    };

    const policy = createApprovalPolicy(() => mode, options.classify);
    // Bookkeeping BEFORE the config is told: `setApprovalPolicy` notifies, and a mounted
    // switch re-resolves its controller on that notify — it must find this one.
    controllers.set(config, controller);
    installed.set(config, policy);
    config.setApprovalPolicy(policy);
    return controller;
}

/**
 * The controller `setupApproval` installed on a config, or `undefined` — also when
 * its policy has since been removed from the config (a `reset()`, a
 * `setApprovalPolicy(null)`): a switch must not look wired to a policy that is gone.
 * What a `<aparte-approval-mode>` element resolves through the config it sits in.
 */
export function getApprovalController(config: AparteConfig = aparteGlobalConfig): ApprovalController | undefined {
    const controller = controllers.get(config);
    if (!controller) return undefined;
    return isInstalled(config) ? controller : undefined;
}
