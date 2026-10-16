/**
 * The presets `@aparte/provider-openai-compat` ships, read from the package's own source at build
 * time — the same way `core-version.ts` reads core's version — so the provider page lists what the
 * package exports rather than what someone once typed.
 */
import { presets } from '../../../../packages/providers/ai/openai-compat/src/presets';

export interface PresetRow {
    /** The key on `presets`: `OPENAI`, `OLLAMA`… */
    key: string;
    id: string;
    name: string;
    baseURL: string;
    /** A server on the reader's machine, which needs no key. */
    local: boolean;
}

export const OPENAI_PRESETS: PresetRow[] = Object.entries(presets).map(([key, preset]) => ({
    key,
    id: preset.id,
    name: preset.name ?? preset.id,
    baseURL: preset.baseURL,
    local: Boolean(preset.isLocal),
}));
