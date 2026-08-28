/**
 * What the package's entry point exposes — the contract a consumer can import, as
 * opposed to what a module happens to export.
 */
import { describe, it, expect } from 'vitest';
import * as plugin from './index.js';
import { ASK_USER_DECLINED } from './ask-user.js';

describe('@aparte/plugin-ask-user — the barrel', () => {
    it('exports ASK_USER_DECLINED, the sentence the handler returns when the user declines', () => {
        // A consumer that converts tool results to prose (or back) matches this exact
        // string; until it was exported they copied the literal, and a rewording here
        // would have silently broken them. The receipt recognises the same constant.
        expect(plugin.ASK_USER_DECLINED).toBe(ASK_USER_DECLINED);
        expect(typeof plugin.ASK_USER_DECLINED).toBe('string');
        expect(plugin.ASK_USER_DECLINED.length).toBeGreaterThan(0);
    });
});
