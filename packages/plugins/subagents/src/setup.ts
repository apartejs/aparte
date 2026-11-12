/**
 * `setupSubagents()`: one line per sub-agent, on the config last, like every setup.
 */
import {
    aparteGlobalConfig,
    getSegmentRenderer,
    registerSegmentRenderer,
    unregisterSegmentRenderer,
    type AparteConfig,
} from '@aparte/core';
import { createLanes } from './lanes.js';
import { createLineProvider } from './line.js';
import { subagentRenderer } from './segment.js';
import { SUBAGENT_SEGMENT_TYPE, type SubagentsOptions } from './types.js';

/** The setup in effect on each config, so a second call replaces the first. */
const installed = new WeakMap<AparteConfig, () => void>();

/**
 * Show each sub-agent of a reply as one line: the line of the call that opened it — its
 * name, its task, what it is doing now, "3 tools · 12 s" — and its conversation kept on that
 * call, out of the reply and out of what the model reads. A sub-agent no call opened gets the
 * same line, from a segment of the plugin's own.
 *
 * Installs one run-event observer, one tool-line provider and the `subagent` segment's
 * renderer on `config` (the global config by default). Returns the function that takes them
 * off; calling it again on the same config replaces the first setup.
 *
 * @example
 * import { setupSubagents } from '@aparte/plugin-subagents';
 * setupSubagents();                          // the line alone
 * setupSubagents({ counts: false });         // without "3 tools · 12 s"
 * setupSubagents({ details: 'transcript' }); // its conversation under the line, closed
 */
export function setupSubagents(options: SubagentsOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    installed.get(config)?.();
    const lanes = createLanes();
    const provider = createLineProvider({ ...options });
    const stopObserving = config.observeRunEvents(lanes.observe);
    config.setToolLineProvider(provider);
    registerSegmentRenderer(subagentRenderer, config);

    let disposed = false;
    const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        stopObserving();
        lanes.dispose();
        if (config.getToolLineProvider() === provider) config.setToolLineProvider(null);
        if (getSegmentRenderer(SUBAGENT_SEGMENT_TYPE, config) === subagentRenderer) unregisterSegmentRenderer(SUBAGENT_SEGMENT_TYPE, config);
        if (installed.get(config) === dispose) installed.delete(config);
    };
    installed.set(config, dispose);
    return dispose;
}
