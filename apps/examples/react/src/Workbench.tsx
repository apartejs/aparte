import { AparteChat, AparteUi, useAparteChat } from '@aparte/react';
import { workbenchPanes, type WorkbenchPane } from './workbench-setup';

/**
 * One pane. Two of these sit side by side, and the only thing they share is the
 * page.
 *
 * `config` is the whole point: every registration this pane made — its provider,
 * its transport, its markdown renderer, its `ask_user` tool — lives on that
 * object, so a pane can only work if the elements inside it resolve THIS config
 * rather than the page-global singleton.
 *
 * `<aparte-elicitation>` goes in `aboveComposer` because it has to be INSIDE the
 * chat's host element: it finds its config by walking up to the nearest boundary,
 * and the boundary is the chat. Mounted outside, it would register on the global
 * and this pane would never see a panel — which is exactly the bug this view was
 * built to make visible.
 */
function Pane({ pane }: { pane: WorkbenchPane }) {
    const chat = useAparteChat();

    return (
        <section className="pane" data-pane={pane.title}>
            <header className="pane-head">
                <h2>{pane.title}</h2>
                <span className="pane-provider">{pane.providerLabel}</span>
            </header>

            <AparteChat
                ref={chat.ref}
                config={pane.config}
                messages={chat.messages}
                onMessagesChange={chat.setMessages}
                placeholder={`Ask ${pane.title}…`}
                aboveComposer={<AparteUi name="aparte-elicitation" />}
            />
        </section>
    );
}

/**
 * The workbench: two independently configured chats.
 *
 * What a human can check here that no unit test can: send in one pane and only
 * that pane answers; ask a question and the panel appears in the composer of the
 * pane that asked, not the other one; and the two panes name different providers,
 * which is the visible evidence that two configs are really in play.
 */
export default function Workbench() {
    const [left, right] = workbenchPanes();

    return (
        <div className="app workbench">
            <header className="topbar">
                <div className="brand">
                    aparté <span>· react workbench</span>
                </div>
                <a className="viewswitch" href="?">← single chat</a>
            </header>

            <div className="panes">
                <Pane pane={left} />
                <Pane pane={right} />
            </div>
        </div>
    );
}
