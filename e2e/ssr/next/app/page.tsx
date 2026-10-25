// A SERVER component: it renders <AparteChat> directly, which only works because
// @aparte/react ships a 'use client' boundary of its own. The client half — the model, the
// client, the card — is <Chat />.
import { AparteChat } from '@aparte/react';
import { Chat } from './chat';

export default function Page() {
    return (
        <main style={{ height: '100vh' }}>
            <Chat />
            <AparteChat centerWhenEmpty emptyState={<p>Ask me anything…</p>} />
        </main>
    );
}
