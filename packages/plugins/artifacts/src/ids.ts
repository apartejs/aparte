/**
 * Document ids: what one looks like, and how a new one is made.
 *
 * The id is the plugin's. A model receives it (in a tool result, or in the tag it reads
 * back) and copies it to change the document; it never has to invent one.
 */
import { uuid } from '@aparte/core';

/** An id is a plain token. Anything else (a model's prose, a path, markup) is not taken as one. */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `id` if it is a usable document id, else `undefined`. */
export function documentIdOf(id: unknown): string | undefined {
    return typeof id === 'string' && ID.test(id) ? id : undefined;
}

/** A new document's id: short enough for a small model to copy without a slip. */
export function newDocumentId(): string {
    return `doc_${uuid().replace(/-/g, '').slice(0, 8).toLowerCase()}`;
}
