import { AparteChat, AparteUi, useAparteChat } from '@aparte/react';
import { sendPrompt } from './aparte';

const CHIPS = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];

export default function App() {
    const chat = useAparteChat();
    // `?view=overlay` — the overlay-composer anatomy, driven through the wrapper
    // prop. Read once: the mode is wired when the viewport mounts.
    // `?view=overlay` (the react example's own convention) or `?layout=page` (the
    // vanilla example's name for the same variant) - the first person to try it
    // typed the vanilla form here, and nothing said why the page ignored it.
    const params = new URLSearchParams(window.location.search);
    const overlay = params.get('view') === 'overlay' || params.get('layout') === 'page';

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    aparté <span>· react</span>
                </div>
                <a className="viewswitch" href="?view=settings">Settings</a>
            </header>

            <AparteChat
                ref={chat.ref}
                messages={chat.messages}
                onMessagesChange={chat.setMessages}
                centerWhenEmpty
                overlayComposer={overlay}
                attachments
                placeholder="Ask anything…"
                emptyState={
                    <div className="welcome">
                        <h2>Start a conversation</h2>
                        <div className="suggestions">
                            {CHIPS.map((c) => (
                                <button key={c.label} className="chip" onClick={() => sendPrompt(c.prompt)}>
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                }
                toolbar={
                    <AparteUi name="aparte-model-selector" props={{ 'auto-select': true, persist: true, searchable: true, style: 'margin-inline-start:auto' }} />
                }
            />
        </div>
    );
}
