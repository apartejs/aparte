import { describe, it, expect } from 'vitest';
import { fr as moved } from '@aparte/locales/fr';
import { fr } from '../index.js';
import frDefault from '../index.js';

describe('@aparte/locale-fr, for one release', () => {
    it('hands out the very French @aparte/locales holds, named and as the default', () => {
        expect(fr).toBe(moved);
        expect(frDefault).toBe(moved);
        expect(fr.tag).toBe('fr-FR');
    });
});
