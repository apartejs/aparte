/**
 * Type-only guard: the `aparte-*` custom elements must be usable in JSX by a
 * consumer of `@aparte/react` — under **React 19**, which this playground pins
 * (the wrapper itself is developed against @types/react 18, where the legacy
 * global `JSX` namespace still resolves and hides the problem).
 *
 * Slotting a custom composer is the realistic case: it re-declares the shell
 * the wrapper renders by default. Nothing imports this file — `tsc --noEmit`
 * checking it is the whole point.
 */

import { AparteChat } from '@aparte/react';

export function CustomComposerChat() {
    return (
        <AparteChat
            composer={
                <div className="aparte-composer-shell">
                    <div className="aparte-composer-row">
                        <aparte-composer-input />
                        <aparte-composer-send />
                    </div>
                </div>
            }
        />
    );
}
