import type { ReactNode } from 'react';
import '@aparte/core/styles.css';

export const metadata = { title: 'aparté · Next' };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body style={{ margin: 0, height: '100vh' }}>{children}</body>
        </html>
    );
}
