/**
 * `@aparte/plugin-artifacts` — the DOM-free entry, for Node and SSR.
 *
 * The browser barrel carries the card, which builds DOM and reads a stylesheet; an
 * SSR build that evaluates the import on the server needs neither. What is here is
 * what a server can legitimately use: the tool, its handler, the block grammar (the
 * parser runs anywhere), the preview document builder and the types. Calling
 * `setupArtifacts()` here registers the tool and the grammar, and declares the tool's
 * calls hidden: no card is drawn there, and the calls stay in the history.
 *
 * `buildSafePreviewDocument` and `PREVIEW_CSP` are pure string work over `escapeHtml` /
 * `escapeAttr`, both of which core's own node barrel carries — they were missing here
 * for no reason but the omission, and the consequence was not a missing feature but a
 * hard `SyntaxError: does not provide an export named 'buildSafePreviewDocument'` the
 * moment an SSR build evaluated the import. `ArtifactsSetupOptions` is imported from
 * `./options.js` rather than declared again: this file used to declare a SECOND
 * interface of that name, without the render half, so the same name meant two shapes
 * depending on which export condition resolved.
 */
import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { createArtifactTool, artifactHandler } from './tool.js';
import { artifactBlock, ARTIFACT_TAG } from './segment.js';
import type { ArtifactsSetupOptions } from './options.js';

/** Register the tool, its handler and the grammar on the server. No card — it builds DOM — so its calls are hidden. */
export function setupArtifacts(options: ArtifactsSetupOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    const tool = createArtifactTool(options);
    config.registerTool(tool, artifactHandler);
    config.registerToolDisplay(tool.name, { hidden: true });
    const tag = options.tag === undefined ? ARTIFACT_TAG : options.tag;
    if (tag) config.registerStreamBlock(artifactBlock(tag));
    return () => {
        config.unregisterTool(tool.name);
        config.unregisterToolDisplay(tool.name);
        if (tag) config.unregisterStreamBlock(tag);
    };
}

export { createArtifactTool, artifactHandler, ARTIFACT_SYSTEM_PROMPT } from './tool.js';
export type { ArtifactToolOptions } from './tool.js';
export { artifactBlock, artifactSegment, artifactFromToolCall, ARTIFACT_TAG, ARTIFACT_SEGMENT_TYPE } from './segment.js';
export type { ArtifactSegment, ArtifactInput } from './segment.js';
export { deriveArtifactKind } from './kinds.js';
export { buildSafePreviewDocument, PREVIEW_CSP } from './preview-document.js';
export type { ArtifactRenderOptions, ArtifactPreviewBuilder, ArtifactBinary, ArtifactBinaryResolver, ArtifactsSetupOptions, ArtifactOpenEventDetail } from './options.js';
export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
