/**
 * @aparte/locale-fr — deprecated, for one release: French moved to `@aparte/locales`, which
 * holds nine languages, one entry each. This package re-exports the same `fr` until 0.28.0
 * removes it, so an upgrade does not break a page that still imports it.
 *
 * @deprecated Import `fr` from `@aparte/locales/fr`. Removed in 0.28.0.
 */
export { fr, fr as default } from '@aparte/locales/fr';
