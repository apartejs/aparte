import { provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { setupSite } from '../../_shared/site-setup';
import { AppComponent } from './app/app.component';
import { SCENARIO_MODE } from './app/scenario-mode';

// The setup every example shares — the locale, the renderers and the markdown, the
// highlighter, the tool plugins, the "Thought for 1.4s" line, the model (scripted by
// default), the transport, the client that drives the turns. See ../../_shared.
// Chained rather than a top-level `await`: the Angular CLI's esbuild target does not
// allow top-level await ("Top-level await is not available in the configured target
// environment") even though every browser it lists supports it, so `setupSite()` is
// awaited via `.then()` instead. The highlighter and the providers still have to be
// there before `bootstrapApplication` renders the first conversation, and this also
// imports `@aparte/core` transitively (through `@aparte/angular`, which
// `app.component.ts` imports), registering every <aparte-*> custom element as a side
// effect — this file needs no import of its own for that.
//
// Zoneless, the way a new Angular app starts since 21: no zone.js in the polyfills, so
// nothing in the wrapper may rely on zone.js noticing a change. `preserveSymlinks` in
// angular.json is what makes `@aparte/angular` — a workspace link to a package built
// against Angular 19 — resolve THIS app's @angular/core instead of its own: without it
// the bundle would carry two Angular cores, the failure a consumer installing from npm
// never sees and a linked example would hide.
setupSite()
    .then(({ scenarioMode }) =>
        bootstrapApplication(AppComponent, {
            providers: [provideZonelessChangeDetection(), { provide: SCENARIO_MODE, useValue: scenarioMode }],
        }),
    )
    .catch((err: unknown) => console.error(err));
