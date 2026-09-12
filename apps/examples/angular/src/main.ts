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
setupSite()
    .then(({ scenarioMode }) =>
        bootstrapApplication(AppComponent, {
            providers: [{ provide: SCENARIO_MODE, useValue: scenarioMode }],
        }),
    )
    .catch((err: unknown) => console.error(err));
