---
"@aparte/core": patch
---

The sidebar's four regions (header, search, body, footer) indent by one new token, `--aparte-sidebar-inset` (12px); the selected conversation's mark follows the row's radius; and the tool row's chevron, its part labels and icon, the code header's language label and the branch picker's disabled arrows are coloured with the muted ink instead of faded by an `opacity`.

Measured on the built previews: the sidebar's header and footer padded 16 while its search and body padded 12, so a 260px column showed its content on two vertical axes and the app-shell demo four left edges; the 2px selection bar stood square in a 9px-rounded corner with a sliver of the page's ground between the two; the tool row's disclosure chevron at `opacity: .5` sat at 3.00:1, exactly on the WCAG floor, and it is the control that reveals a `delete_file`'s arguments; the code language label was already muted and then multiplied by .7; the disabled branch arrow read at 1.74:1 — as absent, not as disabled. Quiet is a colour: opacity on a container fades the glyph with its ground and cannot be reasoned about against any background. The mark is now painted as the first pixels of a row-sized pseudo that inherits the radius — not `overflow: hidden` on the row, which would clip the title button's focus ring.
