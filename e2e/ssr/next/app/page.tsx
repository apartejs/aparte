// A SERVER component: it renders <AparteChat> directly, which only works because
// @aparte/react ships a 'use client' boundary of its own. The client half — the model, the
// client, the card, the approval switch's controller — is <Chat />.
import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import { AparteChat } from '@aparte/react';
import { Chat } from './chat';

// A plugin ships no React typing: the tag is declared once, as the approval-mode page shows.
declare module 'react' {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- JSX augmentation requires a namespace
    namespace JSX {
        interface IntrinsicElements {
            'aparte-approval-mode': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
        }
    }
}

export default function Page() {
    return (
        <main style={{ height: '100vh' }}>
            <Chat />
            <AparteChat centerWhenEmpty emptyState={<p>Ask me anything…</p>} toolbar={<aparte-approval-mode />} />
        </main>
    );
}
