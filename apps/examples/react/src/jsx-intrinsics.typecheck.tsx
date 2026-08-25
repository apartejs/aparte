/**
 * Type-only guard: the `aparte-*` custom elements must be usable in JSX by a
 * consumer of `@aparte/react` — under **React 19**, which this example pins
 * (the wrapper itself is developed against @types/react 18, where the legacy
 * global `JSX` namespace still resolves and hides the problem).
 *
 * Slotting a custom composer is the realistic case: it re-declares the shell
 * the wrapper renders by default. Nothing imports this file — `tsc --noEmit`
 * checking it is the whole point.
 *
 * The negative half below is the half that proves the typing does anything. Every
 * `@ts-expect-error` FAILS THE BUILD if the error stops happening, so a regression
 * that quietly widens an attribute back to `any` cannot pass here. Before this, the
 * intrinsics were nine entries typed `any`: the tags resolved and no attribute on any
 * of them was ever checked.
 */

import { AparteChat } from '@aparte/react';

export function CustomComposerChat() {
    return (
        <AparteChat
            composer={
                <div className="aparte-composer-shell">
                    <div className="aparte-composer-row">
                        <aparte-composer-input placeholder="Ask anything…" max-height={320} />
                        <aparte-composer-send />
                    </div>
                    <aparte-composer-toolbar>
                        <aparte-select placeholder="Pick a model" searchable="" value="gpt-4o-mini">
                            <aparte-option value="gpt-4o-mini">GPT-4o mini</aparte-option>
                            <aparte-option value="llama-3.1-8b" disabled="">Llama 3.1 8B</aparte-option>
                        </aparte-select>
                    </aparte-composer-toolbar>
                </div>
            }
        />
    );
}

/** Standard HTML props still reach an aparté tag: className, style, id, ref. */
export function StyledParts() {
    return (
        <aparte-chat-viewport className="my-transcript" scroll-threshold={64}>
            <aparte-chat-bubble message-id="a1" data-role="assistant" timestamp={Date.now()} streaming="" />
            <aparte-chat-status visible="" text="Searching the docs…" />
        </aparte-chat-viewport>
    );
}

/**
 * A presence attribute is `'' | undefined`, never `boolean`.
 *
 * React stringifies what it sets on a custom element, so `searchable={false}` would
 * render `searchable="false"` — and an element testing `hasAttribute` reads that as ON.
 * The wrapper's own bubble rendering already wrote `streaming={… ? '' : undefined}`;
 * the type is what makes that the only spelling.
 */
export function PresenceAttributesAreNotBooleans() {
    return (
        <>
            {/* @ts-expect-error `false` would render searchable="false", which reads as on */}
            <aparte-select searchable={false} />
            {/* @ts-expect-error same trap, and the one the bubble rendering hit first */}
            <aparte-chat-bubble streaming={true} />
        </>
    );
}

/** An attribute that does not exist is now an error, where `any` accepted anything. */
export function UnknownAttributesAreRejected() {
    return (
        <>
            {/* @ts-expect-error there is no `placehodler` — the typo used to be silent */}
            <aparte-composer-input placehodler="Ask anything…" />
            {/* @ts-expect-error `<aparte-select>` has no `multiple`; that is the file picker's */}
            <aparte-select multiple="" />
        </>
    );
}

/** And a tag aparté does not define stays unknown. */
export function UnknownTagsAreRejected() {
    // @ts-expect-error not an element this library defines
    return <aparte-model-selectorr />;
}
