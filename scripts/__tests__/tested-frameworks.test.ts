/**
 * The versions the docs print as tested are read from what actually runs: the examples, the
 * Angular wrapper's test setup, and the four meta-framework fixtures. This pins what they read
 * today, so a fixture moved to another major shows up here before it shows up on a page.
 */
import { describe, it, expect } from 'vitest';
import { TESTED_FRAMEWORKS } from '../../apps/docs/src/data/tested-frameworks';

describe('tested-frameworks', () => {
    it('reads a version for every framework and meta-framework the pages name', () => {
        expect(TESTED_FRAMEWORKS).toEqual({
            react: '19',
            vue: '3.5',
            svelte: ['4', '5'],
            angular: ['19', '21'],
            next: '15',
            nuxt: '3',
            sveltekit: '2',
            angularSsr: '21',
        });
    });
});
