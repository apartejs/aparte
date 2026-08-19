// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '../aparte-chat.js';
import '../../viewport/aparte-chat-viewport.js';
import '../../composer/aparte-composer.js';
import type { AparteComposer } from '../../composer/aparte-composer.js';

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

  // ─── attachments (opt-in) ───────────────────────────────────────────────────
  // File attachments are a capability the HOST must consume: with an AparteClient
  // they ride to the model via `rawFileInject`, but a "bring your own loop" app
  // that ignores `detail.files` drops them silently. So the default shell offers
  // no picker at all, and `attachments` is the explicit opt-in.
  describe('attachments', () => {
    const pendingFiles = (el: HTMLElement): File[] =>
      (el.querySelector('aparte-composer') as AparteComposer).attachments;

    it('does not mount the attachment primitives by default', () => {
      const el = mount();
      expect(el.querySelector('aparte-composer-attachments')).toBeNull();
      expect(el.querySelector('aparte-composer-add-attachment')).toBeNull();
      el.remove();
    });

    it('mounts both primitives in canonical positions with [attachments]', () => {
      const el = mount({ attachments: '' });
      // The chips strip sits above the row; the picker button opens it.
      const strip = el.querySelector('.aparte-composer-shell > aparte-composer-attachments');
      expect(strip).not.toBeNull();
      expect(strip!.nextElementSibling!.classList.contains('aparte-composer-row')).toBe(true);
      // The picker leads the row, before the input.
      const row = el.querySelector('.aparte-composer-row')!;
      expect(row.firstElementChild!.tagName.toLowerCase()).toBe('aparte-composer-add-attachment');
      expect(row.children[1]!.tagName.toLowerCase()).toBe('aparte-composer-input');
      el.remove();
    });

    it('inserts them when the attribute is set after mount', () => {
      const el = mount();
      el.setAttribute('attachments', '');
      expect(el.querySelectorAll('aparte-composer-attachments')).toHaveLength(1);
      expect(el.querySelector('.aparte-composer-row')!.firstElementChild!.tagName.toLowerCase())
        .toBe('aparte-composer-add-attachment');
      // Idempotent: a redundant set must not duplicate them.
      el.setAttribute('attachments', 'attachments');
      expect(el.querySelectorAll('aparte-composer-attachments')).toHaveLength(1);
      expect(el.querySelectorAll('aparte-composer-add-attachment')).toHaveLength(1);
      el.remove();
    });

    it('removes them — and drops files already picked — when the attribute goes', () => {
      const el = mount({ attachments: '' });
      const composer = el.querySelector('aparte-composer') as AparteComposer;
      composer.addAttachments([new File(['x'], 'staged.txt', { type: 'text/plain' })]);
      expect(pendingFiles(el)).toHaveLength(1);

      el.removeAttribute('attachments');
      expect(el.querySelector('aparte-composer-attachments')).toBeNull();
      expect(el.querySelector('aparte-composer-add-attachment')).toBeNull();
      // Keeping them staged would send files with no UI showing them — the very
      // silent drop this opt-in exists to prevent.
      expect(pendingFiles(el)).toHaveLength(0);
      el.remove();
    });

    it('never touches an author-provided composition', () => {
      const el = document.createElement('aparte-chat');
      el.setAttribute('attachments', '');
      el.innerHTML = '<aparte-chat-viewport></aparte-chat-viewport><aparte-composer><div class="aparte-composer-shell"><div class="aparte-composer-row"><aparte-composer-input></aparte-composer-input></div></div></aparte-composer>';
      document.body.appendChild(el);
      expect(el.querySelector('aparte-composer-add-attachment')).toBeNull();

      // Toggling afterwards must not start editing someone else's markup either.
      el.removeAttribute('attachments');
      el.setAttribute('attachments', '');
      expect(el.querySelector('aparte-composer-add-attachment')).toBeNull();
      el.remove();
    });

    it('never touches a [framework-managed] host', () => {
      const el = mount({ 'framework-managed': '' });
      el.setAttribute('attachments', '');
      expect(el.innerHTML.trim()).toBe('');
      el.remove();
    });
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
