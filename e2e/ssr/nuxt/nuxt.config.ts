import { defineNuxtConfig } from 'nuxt/config';
import { isAparteElement } from '@aparte/vue';

export default defineNuxtConfig({
    compatibilityDate: '2025-01-01',
    devtools: { enabled: false },
    telemetry: false,
    css: ['@aparte/core/styles.css'],
    // The aparte-* tags are core's elements, not Vue components.
    vue: { compilerOptions: { isCustomElement: isAparteElement } },
    app: { head: { title: 'aparté · Nuxt' } },
    // A production build reports no hydration mismatch unless asked to: the spec checks for one.
    vite: { define: { __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true' } },
});
