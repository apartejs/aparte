import { describe, it, expect } from 'vitest';
import { fr } from './index.js';
import { APARTE_DEFAULT_LOCALE, aparteGlobalConfig } from '@aparte/core';

describe('@aparte/locale-fr', () => {
    it('covers every key of the English default (no missing translation)', () => {
        // The locale is a closed type now, so a string key needs the open view to index it.
        const open = fr as Record<string, string | undefined>;
        const missing = Object.keys(APARTE_DEFAULT_LOCALE).filter((k) => open[k] === undefined);
        expect(missing).toEqual([]);
    });

    it('is a real French translation (not the English default)', () => {
        expect(fr.sendButton).toBe('Envoyer');
        expect(fr.inputPlaceholder).not.toBe(APARTE_DEFAULT_LOCALE.inputPlaceholder);
    });

    it('applies through aparteGlobalConfig.setLocale', () => {
        aparteGlobalConfig.setLocale(fr);
        expect(aparteGlobalConfig.getLocale().sendButton).toBe('Envoyer');
        // Restore the default so the shared singleton doesn't leak into other suites.
        aparteGlobalConfig.setLocale(APARTE_DEFAULT_LOCALE);
    });
});
