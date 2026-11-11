/**
 * `@aparte/plugin-artifacts/panel` — the document panel.
 *
 * A separate entry, so an app that only wants the card in the reply does not ship the
 * panel: import this one to define `<aparte-artifact-panel>`.
 *
 *   import { setupArtifacts } from '@aparte/plugin-artifacts';
 *   import '@aparte/plugin-artifacts/panel';
 */
export { AparteArtifactPanel } from './panel/aparte-artifact-panel.js';
export type { ArtifactPanelSource, ArtifactPanelRender, ArtifactVersionChangeEventDetail } from './panel/aparte-artifact-panel.js';
