// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { releaseDeferredHydration } from '@aparte/core';
import './aparte-ask-user.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('<aparte-ask-user>', () => {
    it('waits inside a defer-hydration root, like the elicitation panel it extends', () => {
        // A server-rendered chat: the element must not touch the DOM the framework hydrates.
        // It inherits the hold from <aparte-elicitation>, which core patches before defining.
        const root = document.createElement('div');
        root.setAttribute('defer-hydration', '');
        const el = document.createElement('aparte-ask-user');
        root.appendChild(el);
        document.body.appendChild(root);
        expect(el.style.display).toBe('');
        releaseDeferredHydration(root);
        expect(el.style.display).toBe('none');
    });
});
