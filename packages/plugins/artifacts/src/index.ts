/**
 * @aparte/plugin-artifacts
 *
 * An artifact is a document the model produces — a page, a component, a script, a
 * spreadsheet — and nothing a model does by nature: it is a convention an app teaches
 * it. This package is that convention, end to end, for aparté:
 *
 *  - a real `create_artifact` **tool** the model calls (`./tool.ts`), whose structured
 *    result is the document;
 *  - a **tool renderer** that draws that result as the Code/Preview card;
 *  - the `<artifact …>…</artifact>` **block grammar**, for a model that writes one in
 *    its prose, registered on core's parser (`registerStreamBlock`);
 *  - the **segment renderer** for the segment that grammar produces — the same card.
 *
 * One implementation, four registrations, all made by `setupArtifacts()`.
 *
 * Usage:
 *   import { setupArtifacts } from '@aparte/plugin-artifacts';
 *   setupArtifacts();
 */
import { aparteGlobalConfig, registerSegmentRenderer, unregisterSegmentRenderer, type AparteConfig, type AparteToolRenderer } from '@aparte/core';
import { createArtifactTool, artifactHandler, type ArtifactToolOptions } from './tool.js';
import { artifactRenderer } from './card.js';
import { artifactBlock, artifactFromToolCall, ARTIFACT_TAG, ARTIFACT_SEGMENT_TYPE } from './segment.js';
import { setRenderOptions, clearRenderOptions, type ArtifactRenderOptions } from './options.js';

export interface ArtifactsSetupOptions extends ArtifactToolOptions, ArtifactRenderOptions {
    /**
     * The tag recognised in the prose — `<artifact …>…</artifact>` by default. `false`
     * registers no grammar: only the tool produces artifacts then.
     */
    tag?: string | false;
}

/**
 * Register the tool, its renderer, the block grammar and the segment renderer on
 * `config` (the global config by default). Call once at application startup;
 * returns a function that unregisters all four.
 */
export function setupArtifacts(options: ArtifactsSetupOptions = {}, config: AparteConfig = aparteGlobalConfig): () => void {
    const tool = createArtifactTool(options);
    setRenderOptions(config, { preview: options.preview, onBinary: options.onBinary });

    config.registerTool(tool, artifactHandler);
    // The card, on the tool's result: the same renderer the segment gets, adapted to
    // the tool-call segment it is handed. `update` and `relabel` are forwarded, so a
    // preview a reader mounted survives the result landing.
    const toolRenderer: AparteToolRenderer = {
        render: (segment) => artifactRenderer.render(artifactFromToolCall(segment)),
        setup: (element, segment) => artifactRenderer.setup?.(element, artifactFromToolCall(segment)),
        update: (element, segment) => artifactRenderer.update?.(element, artifactFromToolCall(segment)),
        relabel: (element, segment) => artifactRenderer.relabel?.(element, artifactFromToolCall(segment)),
        getStyles: () => artifactRenderer.getStyles?.() ?? '',
    };
    config.registerToolRenderer(tool.name, toolRenderer);

    registerSegmentRenderer(artifactRenderer, config);
    const tag = options.tag === undefined ? ARTIFACT_TAG : options.tag;
    if (tag) config.registerStreamBlock(artifactBlock(tag));

    return () => {
        config.unregisterTool(tool.name);
        config.unregisterToolRenderer(tool.name);
        unregisterSegmentRenderer(ARTIFACT_SEGMENT_TYPE, config);
        if (tag) config.unregisterStreamBlock(tag);
        clearRenderOptions(config);
    };
}

export { createArtifactTool, artifactHandler, ARTIFACT_SYSTEM_PROMPT } from './tool.js';
export type { ArtifactToolOptions } from './tool.js';
export { artifactRenderer } from './card.js';
export type { AparteArtifactSegment } from './card.js';
export { artifactBlock, artifactSegment, artifactFromToolCall, ARTIFACT_TAG, ARTIFACT_SEGMENT_TYPE } from './segment.js';
export type { ArtifactSegment, ArtifactInput } from './segment.js';
export { deriveArtifactKind } from './kinds.js';
export { buildSafePreviewDocument, PREVIEW_CSP } from './preview-document.js';
export type { ArtifactRenderOptions, ArtifactPreviewBuilder, ArtifactBinary, ArtifactBinaryResolver } from './options.js';
export type { AparteTool, AparteToolHandler, AparteToolCall, AparteToolResult } from '@aparte/core';
