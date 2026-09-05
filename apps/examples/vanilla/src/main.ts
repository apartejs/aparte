import '@aparte/core'; // registers the <aparte-*> custom elements
// No stylesheet import here: core's CSS comes through the <link> in index.html (see
// src/style.css), which is render-blocking — a JS-injected sheet arrives after this
// module, and the static shell painted bare until then.
import { mountModelSelector, setupSite } from '../../_shared/site-setup';
import { wireShell } from './shell';

// The setup every example shares — the locale, the renderers and the markdown, the
// highlighter, the tool plugins, the "Thought for 1.4s" line, the model (scripted by
// default), the transport, the client that drives the turns. See ../../_shared.
// Awaited inside a function, not at the top level: the production build targets
// browsers a step behind top-level await, and esbuild refuses it there.
void main();

async function main(): Promise<void> {
    const { scenarioMode } = await setupSite();

    // The model selector, only with a local server: in the header, where the product
    // keeps its picker; the toolbar row under the composer stays empty and draws nothing.
    if (!scenarioMode) mountModelSelector(document.getElementById('model-slot'), document.querySelector('aparte-composer-toolbar'));

    // ── Layout variants (`?layout=split`, `?layout=shell`, `?layout=page`) ───────
    //
    // Same convention as `?chats=2` below: off by default, so the page stays the
    // single-chat reference, and reachable by a URL a reader can share.
    //
    //   ?layout=split — the chat in one pane of an <aparte-split>, an <iframe> in the
    //                   other, inside the shell's main area. The FRAME is the point: a
    //                   pointer that crosses an iframe is delivered to the frame's
    //                   document and lost, which is what the split's drag scrim exists
    //                   to prevent. Nothing else in this repo put a frame beside a chat,
    //                   so nothing proved it. The two [data-aparte-split-pane] buttons
    //                   join the header's actions for the stacked (narrow) case.
    //   ?layout=shell — the same thing. The application shell — sidebar, drawer, header
    //                   with its toggle — is the page's default now (index.html), so the
    //                   variant only keeps the URL the E2E suite and the docs share.
    //
    // The restructure runs HERE, before any of the chat wiring below: it moves the
    // existing <aparte-chat> rather than building a second one, so the client, the
    // optimistic bubble and every E2E helper keep driving the same element. It is also
    // before the model selector's dynamic import resolves, so that element upgrades
    // once, already in its final place.

    /** The pane beside the chat. A whole document, because an <iframe> is the case under test. */
    const PREVIEW_DOC =
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        + '<style>body{margin:0;padding:24px;font:16px/1.5 system-ui,sans-serif;background:#f7f3ec;color:#221d17}'
        + 'h1{margin:0 0 8px;font-size:1.2rem}p{margin:0;opacity:.8}</style></head>'
        + '<body><h1>Your pane</h1><p>A preview frame, an editor, a canvas. Drag the seam to resize it.</p></body></html>';

    /**
     * Wrap `chatEl` in an `<aparte-split>` with a preview frame beside it.
     *
     * Assembled DETACHED and inserted in one go. Building it in place would connect the
     * split with no children, and the element inserts its seam between the first two —
     * with none there it lands first, which is the pane track the stacked rules hide.
     */
    function buildSplit(chatEl: HTMLElement): HTMLElement {
        const split = document.createElement('aparte-split');
        split.setAttribute('position', '38');
        split.setAttribute('style', 'height:100%; --aparte-split-min: 16rem');

        const pane = document.createElement('section');
        pane.className = 'aparte-split__pane';
        const frame = document.createElement('iframe');
        frame.title = 'Preview';
        frame.setAttribute('style', 'display:block; inline-size:100%; block-size:100%; border:0');
        // `srcdoc` through setAttribute, never interpolated into innerHTML.
        frame.setAttribute('srcdoc', PREVIEW_DOC);
        pane.appendChild(frame);

        const parent = chatEl.parentElement;
        const anchor = chatEl.nextSibling;
        chatEl.remove();
        split.appendChild(chatEl);
        split.appendChild(pane);
        parent?.insertBefore(split, anchor);
        return split;
    }

    /** The two buttons that switch panes while the split is stacked. No script behind them. */
    function paneSwitcher(): DocumentFragment {
        const t = document.createElement('template');
        // `--surface` rather than a bare `.aparte-btn`: the plain form is a ghost, which
        // reads as two words of text rather than two controls when nothing sits beside it.
        t.innerHTML =
            '<button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button" data-aparte-split-pane="start">Chat</button>'
            + '<button class="aparte-btn aparte-btn--surface aparte-btn--sm" type="button" data-aparte-split-pane="end">Preview</button>';
        return t.content;
    }

    const layoutParam = new URLSearchParams(location.search).get('layout');
    //   ?layout=page — the overlay-composer anatomy: the transcript's scroll surface
    //                  spans the whole column and the composer floats over it, so the
    //                  scrollbar runs edge to edge. One attribute is the whole variant —
    //                  which is the point. The element is moved in place because core is
    //                  imported statically above: the viewport wired its observers when
    //                  the parser upgraded it, BEFORE this block ran, and the mode is
    //                  read at that moment — a disconnect/reconnect re-runs the wiring.
    if (layoutParam === 'page') {
        const chatEl = document.querySelector<HTMLElement>('aparte-chat');
        if (chatEl) {
            chatEl.setAttribute('overlay-composer', '');
            const parent = chatEl.parentElement;
            const anchor = chatEl.nextSibling;
            chatEl.remove();
            parent?.insertBefore(chatEl, anchor);
        }
    }
    if (layoutParam === 'split' || layoutParam === 'shell') {
        const chatEl = document.querySelector<HTMLElement>('aparte-chat');
        const actions = document.querySelector<HTMLElement>('.aparte-app-header__actions');
        if (chatEl) {
            buildSplit(chatEl);
            actions?.prepend(paneSwitcher());
        }
    }

    // ── Chat wiring ──────────────────────────────────────────────────────────────
    // No user-bubble handler: AparteClient echoes the user's message itself (its
    // default) and streams the assistant reply. This file used to carry the handler
    // every raw-core host wrote — and whoever forgot shipped a chat where the person
    // cannot see what they typed, which is exactly why the client took the job.
    const chat = document.querySelector('aparte-chat');

    // The site around the chat: the conversation list, new chat, the theme toggle, the
    // settings dialog — over the library's own conversation chain.
    wireShell();

    // ── Two chats on one page (`?chats=2`) ───────────────────────────────────────
    // Off by default, so the example stays the single-chat reference. It shows the
    // multi-instance wiring: each chat carries an id, each composer points at it via
    // `target`, and ONE AparteClient serves both — it resolves the target per event,
    // so a reply can only land in the chat that sent it. The E2E multi-chat suite
    // drives this; the model gate is satisfied globally by the first selector, which
    // is why the second chat needs no selector of its own.
    if (new URLSearchParams(location.search).get('chats') === '2' && chat) {
        chat.id = 'chat-a';
        chat.querySelector('aparte-composer')?.setAttribute('target', 'chat-a');

        const second = document.createElement('aparte-chat');
        second.id = 'chat-b';
        second.setAttribute('center-empty', '');
        second.innerHTML = `
          <aparte-chat-viewport></aparte-chat-viewport>
          <aparte-composer target="chat-b">
            <div class="aparte-composer-shell">
              <div class="aparte-composer-row">
                <aparte-composer-input placeholder="Second chat…"></aparte-composer-input>
                <aparte-composer-send></aparte-composer-send>
              </div>
            </div>
          </aparte-composer>`;
        chat.parentElement?.appendChild(second);
        // No per-chat user-bubble wiring: the one AparteClient echoes into whichever
        // chat the send targeted, exactly as it streams the reply there.
    }
}
