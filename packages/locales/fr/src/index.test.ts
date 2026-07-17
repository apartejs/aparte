import { describe, it, expect } from 'vitest';
import { fr } from './index.js';
import { DEFAULT_LOCALE, AparteConfig } from '@aparte/core';

describe('@aparte/locale-fr', () => {
    it('covers every key of the English default (no missing translation)', () => {
        const missing = Object.keys(DEFAULT_LOCALE).filter((k) => fr[k] === undefined);
        expect(missing).toEqual([]);
    });

    it('is a real French translation (not the English default)', () => {
        expect(fr.sendButton).toBe('Envoyer');
        expect(fr.inputPlaceholder).not.toBe(DEFAULT_LOCALE.inputPlaceholder);
    });

    it('applies through AparteConfig.setLocale', () => {
        AparteConfig.setLocale(fr);
        expect(AparteConfig.getLocale().sendButton).toBe('Envoyer');
        // Restore the default so the shared singleton doesn't leak into other suites.
        AparteConfig.setLocale(DEFAULT_LOCALE);
    });
});
