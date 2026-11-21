/**
 * `?harness=toast-in-dialog`: a kit dialog whose Save button shows a toast, as an app's settings
 * dialog does. `e2e/tests/toast.spec.ts` drives it: a modal dialog makes everything outside it
 * inert and draws it under its backdrop, so the toast has to be shown inside it to be read,
 * reached and heard.
 */
import { showToast } from '@aparte/core';

/** Mount the harness dialog when the URL asks for it. */
export function mountToastHarness(): void {
    if (new URLSearchParams(location.search).get('harness') !== 'toast-in-dialog') return;
    const panel = document.createElement('div');
    panel.innerHTML = `
        <button id="harness-open" type="button" class="aparte-btn" data-aparte-dialog-open="harness-dialog">Settings</button>
        <dialog id="harness-dialog" class="aparte-dialog" aria-labelledby="harness-title">
            <div class="aparte-dialog__header"><h2 id="harness-title" class="aparte-dialog__title">Settings</h2></div>
            <div class="aparte-dialog__body"><p>Change something, then save.</p></div>
            <div class="aparte-dialog__footer">
                <button id="harness-save" type="button" class="aparte-btn aparte-btn--primary">Save</button>
                <button id="harness-save-close" type="button" class="aparte-btn" data-aparte-dialog-close>Save and close</button>
                <button id="harness-close" type="button" class="aparte-btn" data-aparte-dialog-close>Close</button>
            </div>
        </dialog>`;
    panel.style.cssText = 'position:fixed;inset-block-start:16px;inset-inline-end:16px;z-index:50';
    document.body.append(panel);
    panel.querySelector('#harness-save')!.addEventListener('click', () => {
        showToast('Settings saved.', { tone: 'success', timeout: 0 });
    });
    // The commonest Save: the button that closes the dialog shows the toast in the same click.
    panel.querySelector('#harness-save-close')!.addEventListener('click', () => {
        showToast('Saved, and closed.', { tone: 'success', timeout: 0 });
    });

    // A modal dialog a component draws in its shadow root, its Save slotted from the page.
    const host = document.createElement('div');
    host.id = 'harness-shadow-host';
    host.attachShadow({ mode: 'open' }).innerHTML = '<dialog id="harness-shadow-dialog" aria-label="Shadow settings"><slot></slot></dialog>';
    host.innerHTML = '<button id="harness-shadow-save" type="button" class="aparte-btn aparte-btn--primary">Save in the shadow</button>';
    const opener = document.createElement('button');
    opener.id = 'harness-shadow-open';
    opener.type = 'button';
    opener.className = 'aparte-btn';
    opener.textContent = 'Shadow settings';
    opener.addEventListener('click', () => host.shadowRoot!.querySelector('dialog')!.showModal());
    panel.append(opener, host);
    host.querySelector('#harness-shadow-save')!.addEventListener('click', () => {
        showToast('Saved in the shadow.', { tone: 'success', timeout: 0 });
    });
}
