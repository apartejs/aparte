/**
 * What the app decided at `setupArtifacts()`, read back by the card at render time.
 *
 * The card is resolved through core's ambient config (`contextConfig()`), not through
 * a closure, so the settings live beside the config they were given for: one entry per
 * `AparteConfig`, the global one by default. A chat with its own config that never
 * called `setupArtifacts` reads the global settings, which is what its renderers do
 * too.
 */
import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import type { ArtifactSegment } from './segment.js';
import type { ArtifactToolOptions } from './tool.js';

/** Builds the `srcdoc` of the sandboxed preview frame for a previewable kind. */
export type ArtifactPreviewBuilder = (kind: string, body: string, title: string) => string;

/** The bytes a binary artifact (pdf, xlsx, docx) resolved to. */
export interface ArtifactBinary {
    /** The file. */
    buffer: BlobPart;
    /** Its MIME type, for the download. */
    mime: string;
    /** The name the download gets. */
    filename: string;
    /**
     * Optional HTML rendering of the file (a spreadsheet as a table, a PDF's text),
     * shown in the card's preview pane after sanitisation. Absent: the pane says so.
     */
    previewHtml?: string | null;
}

/**
 * Turn a binary artifact's source (the JS the model wrote to produce a workbook, a
 * PDF, a document) into bytes. Core owns no sandbox and no file generator: this is the
 * app's, and without it a binary artifact shows its source with no download and no
 * preview — declared nowhere, offered nowhere (ratified decision #8).
 */
export type ArtifactBinaryResolver = (artifact: ArtifactSegment) => Promise<ArtifactBinary>;

export interface ArtifactRenderOptions {
    /**
     * The Preview tab for previewable kinds (html, react, svg, js, css). `true`
     * (default) mounts a sandboxed frame on a gesture with the built-in document
     * builder; a function replaces the builder; `false` offers no preview at all.
     */
    preview?: boolean | ArtifactPreviewBuilder;
    /** See {@link ArtifactBinaryResolver}. */
    onBinary?: ArtifactBinaryResolver;
}

const settings = new WeakMap<AparteConfig, ArtifactRenderOptions>();

export function setRenderOptions(config: AparteConfig, options: ArtifactRenderOptions): void {
    settings.set(config, options);
}

/** The options for this config, else the global config's, else the defaults. */
export function renderOptions(config: AparteConfig): ArtifactRenderOptions {
    return settings.get(config) ?? settings.get(aparteGlobalConfig) ?? {};
}

/** For tests and a teardown: forget what a config was told. */
export function clearRenderOptions(config: AparteConfig): void {
    settings.delete(config);
}

/**
 * Everything `setupArtifacts()` accepts — the tool's options, the card's, and the tag.
 *
 * ONE declaration, here, because there are two `setupArtifacts()`: the browser barrel's
 * and the node one. Each used to declare its own `ArtifactsSetupOptions`, and they were
 * not the same shape — the node copy omitted `ArtifactRenderOptions`, so `preview` and
 * `onBinary` were type errors against the SSR entry while being valid against the
 * browser one. A consumer typing a shared setup object got a different contract
 * depending on which condition resolved, from a name that reads as one thing.
 *
 * The server ignores `preview` and `onBinary` (it registers no renderer), and that is
 * correct: the same options object is meant to be written once and passed on both
 * sides. An option nobody reads there is inert, whereas a type error there is a wall.
 */
export interface ArtifactsSetupOptions extends ArtifactToolOptions, ArtifactRenderOptions {
    /**
     * The tag recognised in the prose — `<artifact …>…</artifact>` by default. `false`
     * registers no grammar: only the tool produces artifacts then.
     */
    tag?: string | false;
}
