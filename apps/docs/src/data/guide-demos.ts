/**
 * The scenarios a GUIDE shows, each as one string.
 *
 * A guide needs something an element's `@example` cannot give it. That example is written
 * for the element's own reference page and shows the element's forms — `<aparte-chat>`'s is
 * two chats, one auto-filled and one hand-composed, which is right there and reads as a
 * duplicated composer anywhere else. A guide needs one STATE, chosen for the sentence it
 * sits under: a reply with siblings, a tool call waiting on a person.
 *
 * Each entry is read exactly twice — `<Demo>` prints it as the code block, and
 * `/preview/demo/[id]` mounts it in the frame. One string, so the picture and the code
 * cannot disagree; the same invariant the generated element pages already hold.
 *
 * The snippets run, which is what makes them worth more than the inert code blocks they
 * sit beside: a scenario that stops working stops rendering, visibly, on the page that
 * teaches it.
 *
 * A `<script>` here is a CLASSIC script — `PreviewDocument` revives it after the library
 * has loaded, so it can call methods on an upgraded element but it cannot `import`. That
 * is why every scenario below is driven through a public method (`setSiblings`,
 * `setSegments`) rather than through a module export.
 */
export interface GuideDemo {
    /** URL segment and `<Demo id>`. */
    id: string;
    /** Announced as the frame's title. */
    title: string;
    /** The scenario: markup, plus an optional classic script that drives it. */
    html: string;
}

export const GUIDE_DEMOS: GuideDemo[] = [
    {
        id: 'branch-picker',
        title: 'A reply with siblings, and the branch picker',
        html: `<!-- Retry does not overwrite: it forks a sibling. The picker is what walks them,
     and it appears on its own as soon as a message has more than one. -->
<aparte-chat-bubble
  message-id="a1"
  data-role="assistant"
  name="Assistant"
  content="You could cache the result — it is the same query every time."
></aparte-chat-bubble>

<script>
  // \`setSiblings\` is a method, not an attribute: the count comes from the tree,
  // so markup alone can never place this control.
  document.querySelector('aparte-chat-bubble').setSiblings(2, 0);
</script>`,
    },
    {
        id: 'tool-approval',
        title: 'A tool call paused for a person',
        html: `<!-- A tool marked \`needsApproval\` stops the turn BEFORE its handler runs. Core draws
     the pause: the row is the anchor, and the decision is asked at the composer. -->
<aparte-chat-bubble message-id="a1" data-role="assistant" name="Assistant"></aparte-chat-bubble>

<script>
  document.querySelector('aparte-chat-bubble').setSegments([
    {
      id: 's1',
      type: 'tool_call',
      status: 'awaiting-approval',
      toolCall: { id: 't1', name: 'delete_file', input: { path: 'src/legacy/old-client.ts' } },
    },
  ]);
</script>`,
    },
];
