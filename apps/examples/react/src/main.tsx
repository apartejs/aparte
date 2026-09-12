import { createRoot } from 'react-dom/client';
import { setupSite } from '../../_shared/site-setup';
import { isWorkbenchView } from './workbench-setup';
import './style.css';
import App from './App';
import Workbench from './Workbench';

/**
 * Two views, chosen by the URL rather than by a click, so both are deep-linkable
 * (and a browser test can land on one directly).
 *
 * `setupSite()` configures the page-GLOBAL config, which is what the chat site uses.
 * The workbench builds its own two configs instead and must not inherit a provider
 * or a transport from the global — so it deliberately does not call it.
 */
const workbench = isWorkbenchView();
const root = document.getElementById('root');
if (root) {
    if (workbench) {
        createRoot(root).render(<Workbench />);
    } else {
        // Awaited before the first render: the highlighter and the providers have to
        // be there before a conversation opens. A `.then`, not a top-level await: the
        // production build targets browsers a step behind it, and esbuild refuses it.
        void setupSite().then(({ scenarioMode }) => createRoot(root).render(<App scenarioMode={scenarioMode} />));
    }
}
