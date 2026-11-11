/**
 * `@aparte/plugin-artifacts/panel` — the document panel.
 *
 * A separate entry, so an app that only wants the card in the reply does not ship the
 * panel: import this one to define `<aparte-artifact-panel>` and get the wiring.
 *
 *   import { setupArtifacts } from '@aparte/plugin-artifacts';
 *   import { connectArtifactPanel } from '@aparte/plugin-artifacts/panel';
 */
export { AparteArtifactPanel } from './panel/aparte-artifact-panel.js';
export type { ArtifactPanelSource, ArtifactPanelRender, ArtifactVersionChangeEventDetail } from './panel/aparte-artifact-panel.js';
export { connectArtifactPanel } from './panel/connect.js';
export type { ConnectArtifactPanelOptions, ArtifactPanelSplit } from './panel/connect.js';
