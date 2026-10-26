/**
 * The n8n widget's icons, drawn for this package in its manner: a filled speech bubble on the
 * button in the corner, a chevron when the chat is open, a filled paper plane to send. Sized
 * by the container (`--aparte-icon-size`), like every aparté glyph.
 */

/** The closed launcher: a filled speech bubble. */
const bubble = '<svg class="aparte-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M5.5 3.5h13a3 3 0 0 1 3 3v8.5a3 3 0 0 1-3 3h-6.2l-4.8 3.6a.6.6 0 0 1-1-.5v-3.1H5.5a3 3 0 0 1-3-3V6.5a3 3 0 0 1 3-3Z"/></svg>';

/** The open launcher: a chevron that points down, where the chat goes. */
const chevron = '<svg class="aparte-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9.5 6 6 6-6"/></svg>';

/** Send: a filled paper plane. */
const plane = '<svg class="aparte-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.2 21 12.6a.7.7 0 0 0 0-1.2L3.4 3.8a.6.6 0 0 0-.9.7L5 11l8 1-8 1-2.5 6.5a.6.6 0 0 0 .9.7Z"/></svg>';

/** What `createChat` registers on its widget's config: the launcher's two, and send. */
export const N8N_ICONS: Record<string, () => string> = {
    launcherOpen: () => bubble,
    launcherClose: () => chevron,
    send: () => plane,
};
