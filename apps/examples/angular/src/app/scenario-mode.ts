import { InjectionToken } from '@angular/core';

/**
 * Whether the scripted model answers (no server, no key) — decided once, in
 * main.ts, by the shared `setupSite()` BEFORE the app bootstraps. Handed to the
 * root component through DI rather than a module-level static: the component's
 * only use for it is deciding whether to mount the model selector (a local
 * server only has a model to pick), and DI is what an Angular consumer expects
 * to read a bootstrap-time value from — see `bootstrapApplication`'s `providers`
 * in main.ts, where this token is bound to the resolved value.
 */
export const SCENARIO_MODE = new InjectionToken<boolean>('SCENARIO_MODE');
