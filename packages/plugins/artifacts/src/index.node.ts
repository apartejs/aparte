/**
 * `@aparte/plugin-artifacts` — the DOM-free entry, for Node and SSR.
 *
 * The browser barrel carries the card, which builds DOM and reads a stylesheet; an
 * SSR build that evaluates the import on the server needs neither. What is here is
 * what a server can legitimately use: the tool, its handler, the block grammar (the
 * parser runs anywhere) and the types. Calling `setupArtifacts()` here registers the
 * tool and the grammar without a renderer, which is the correct outcome: nothing is
 * being rendered there.
 */
import { aparteGlobalConfig, type AparteConfig } from '@aparte/core';
import { createArtifactTool, artifactHandler, type ArtifactToolOptions } from './tool.js';
import { artifactBlock, ARTIFACT_TAG } from './segment.js';

export interface ArtifactsSetupOptions extends ArtifactToolOptions {
    /** The tag recognised in the prose — `artifact` by default; `false` registers no grammar. */
    tag?: string | false;
}

/** Register the tool, its handler and the grammar on the server. No renderer: it builds DOM. */
export function setupArtifacts(options: ArtifactsSetupOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    const tool = createArtifactTool(options);
    config.registerTool(tool, artifactHandler);
    config.registerToolRenderer(tool.name, { render: () => '' });
    const tag = options.tag === undefined ? ARTIFACT_TAG : options.tag;
    if (tag) config.registerStreamBlock(artifactBlock(tag));
    return () => {
        config.unregisterTool(tool.name);
        config.unregisterToolRenderer(tool.name);
        if (tag) config.unregisterStreamBlock(tag);
    };
}

export { createArtifactTool, artifactHandler, ARTIFACT_SYSTEM_PROMPT } from './tool.js';
export type { ArtifactToolOptions } from './tool.js';
export { artifactBlock, artifactSegment, artifactFromToolCall, ARTIFACT_TAG, ARTIFACT_SEGMENT_TYPE } from './segment.js';
export type { ArtifactSegment, ArtifactInput } from './segment.js';
export { deriveArtifactKind } from './kinds.js';
export type { ArtifactRenderOptions, ArtifactPreviewBuilder, ArtifactBinary, ArtifactBinaryResolver } from './options.js';
export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
