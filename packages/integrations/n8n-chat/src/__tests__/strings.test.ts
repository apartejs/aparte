/**
 * Every language the widget ships downloads its own locale. Each loader is an import written
 * out in full, so a bundler can split it — and a wrong path in one of nine would only show on
 * a visitor's page in that language.
 */
import { describe, it, expect } from 'vitest';
import { loadLocale } from '../strings.js';

describe('the shipped languages', () => {
    it.each(['fr', 'es', 'pt-BR', 'de', 'it', 'ru', 'ja', 'ko', 'zh-CN'])('%s loads its own locale', async (language) => {
        const locale = await loadLocale(language);
        expect(locale?.tag.toLowerCase().split('-')[0]).toBe(language.toLowerCase().split('-')[0]);
    });

    it('English loads nothing: core holds it', () => {
        expect(loadLocale('en')).toBeUndefined();
    });
});
