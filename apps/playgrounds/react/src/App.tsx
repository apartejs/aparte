import { useState } from 'react';
import { AparteChat, AparteUi, useAparteChat } from '@aparte/react';
import { KEY_STORAGE, sendPrompt } from './aparte';

const CHIPS = [
    { label: 'What is aparté?', prompt: 'Explain what aparté is in one sentence.' },
    { label: 'Write a haiku', prompt: 'Write a haiku about web components.' },
    { label: 'Markdown table', prompt: 'Give me a markdown table comparing 3 JS frameworks.' },
];

export default function App() {
    const chat = useAparteChat();
    const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEY_STORAGE) ?? '');

    const onKeyChange = (value: string) => {
        setApiKey(value);
        if (value.trim()) localStorage.setItem(KEY_STORAGE, value.trim());
        else localStorage.removeItem(KEY_STORAGE);
    };

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand">
                    aparté <span>· react</span>
                </div>
                <input
                    className="key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="OpenRouter API key — optional, stays in your browser"
                    value={apiKey}
                    onChange={(e) => onKeyChange(e.target.value)}
                />
            </header>

            <AparteChat
                ref={chat.ref}
                messages={chat.messages}
                onMessagesChange={chat.setMessages}
                centerWhenEmpty
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
                footerRight={
                    <AparteUi name="aparte-model-selector" props={{ 'auto-select': true, persist: true, searchable: true }} />
                }
            />
        </div>
    );
}
