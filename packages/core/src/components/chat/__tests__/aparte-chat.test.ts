// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';

function mount(attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('aparte-chat');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

describe('AparteChat', () => {
  it('composes a viewport and a composer', () => {
    const el = mount();
    expect(el.querySelector('aparte-chat-viewport')).not.toBeNull();
    expect(el.querySelector('aparte-composer')).not.toBeNull();
    // Canonical composer markup (shell > row > input + send).
    expect(el.querySelector('aparte-composer .aparte-composer-shell .aparte-composer-row aparte-composer-input')).not.toBeNull();
    expect(el.querySelector('aparte-composer .aparte-composer-row aparte-composer-send')).not.toBeNull();
    el.remove();
  });

  it('composes nothing of its own when [framework-managed] (a wrapper owns the children)', () => {
    // The Angular wrapper's component selector IS this tag, so core upgrades its
    // host element. Its children only render AFTER connectedCallback, so the
    // "author-provided composition wins" check below can't see them yet —
    // `framework-managed` is the wrapper's explicit hands-off signal. Without it
    // the default composition lands UNDERNEATH the framework's own.
    const el = mount({ 'framework-managed': '' });
    expect(el.querySelector('aparte-chat-viewport')).toBeNull();
    expect(el.querySelector('aparte-composer')).toBeNull();
    expect(el.innerHTML.trim()).toBe('');
    el.remove();
  });

  it('forwards placeholder to the inner composer', () => {
    const el = mount({ placeholder: 'Ask me anything…' });
    expect(el.querySelector('aparte-composer')!.getAttribute('placeholder')).toBe('Ask me anything…');
    el.remove();
  });

  it('reflects placeholder changes and clears them', () => {
    const el = mount({ placeholder: 'first' });
    el.setAttribute('placeholder', 'second');
    expect(el.querySelector('aparte-composer')!.getAttribute('placeholder')).toBe('second');
    el.removeAttribute('placeholder');
    expect(el.querySelector('aparte-composer')!.hasAttribute('placeholder')).toBe(false);
    el.remove();
  });

  it('forwards and clears disabled', () => {
    const el = mount({ disabled: '' });
    expect(el.querySelector('aparte-composer')!.hasAttribute('disabled')).toBe(true);
    el.removeAttribute('disabled');
    expect(el.querySelector('aparte-composer')!.hasAttribute('disabled')).toBe(false);
    el.remove();
  });

  it('exposes .viewport and .composer getters', () => {
    const el = mount() as HTMLElement & { viewport: Element | null; composer: Element | null };
    expect(el.viewport).toBe(el.querySelector('aparte-chat-viewport'));
    expect(el.composer).toBe(el.querySelector('aparte-composer'));
    el.remove();
  });

  it('does not duplicate children when re-connected', () => {
    const el = mount();
    document.body.removeChild(el);
    document.body.appendChild(el); // re-connect → connectedCallback runs again
    expect(el.querySelectorAll('aparte-chat-viewport')).toHaveLength(1);
    expect(el.querySelectorAll('aparte-composer')).toHaveLength(1);
    el.remove();
  });

  it('uses author-provided children instead of the default composition', () => {
    const el = document.createElement('aparte-chat');
    el.innerHTML = '<aparte-chat-viewport data-mine></aparte-chat-viewport><aparte-composer data-mine></aparte-composer>';
    document.body.appendChild(el);
    // Kept the provided ones, did not inject a second default set.
    expect(el.querySelectorAll('aparte-chat-viewport')).toHaveLength(1);
    expect(el.querySelector('aparte-chat-viewport')!.hasAttribute('data-mine')).toBe(true);
    expect(el.querySelector('aparte-composer')!.hasAttribute('data-mine')).toBe(true);
    el.remove();
  });

  it('marks itself empty with center-empty and no messages', () => {
    const el = mount({ 'center-empty': '' });
    expect(el.hasAttribute('data-empty')).toBe(true);
    el.remove();
  });

  it('does not set data-empty without center-empty', () => {
    const el = mount();
    expect(el.hasAttribute('data-empty')).toBe(false);
    el.remove();
  });

  it('clears empty when center-empty is removed', () => {
    const el = mount({ 'center-empty': '' });
    expect(el.hasAttribute('data-empty')).toBe(true);
    el.removeAttribute('center-empty');
    expect(el.hasAttribute('data-empty')).toBe(false);
    el.remove();
  });
});
