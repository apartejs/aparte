import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AparteChat } from '../components/AparteChat';

describe('<AparteChat> on the server', () => {
    it('renders AparteChat to a string, with no browser API at hand', () => {
        const html = renderToString(<AparteChat centerWhenEmpty emptyState={<p>Ask me anything…</p>} />);
        expect(html).toContain('data-aparte-chat');
        expect(html).toContain('<aparte-composer');
        expect(html).toContain('Ask me anything…');
    });

    it('renders the messages it is given', () => {
        const html = renderToString(
            <AparteChat messages={[{ id: 'm1', role: 'assistant', content: 'Rendered on the server', timestamp: 0 }]} />,
        );
        expect(html).toContain('<aparte-chat-bubble');
    });
});
