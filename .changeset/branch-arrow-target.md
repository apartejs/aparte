---
'@aparte/core': patch
---

The action bar no longer overlaps the branch picker's next arrow, which is back to a full 24px target.

The bar pulls itself 6px toward the start of the line so its first icon lines up with the text above; after a visible branch picker that ran it 1.5px over the picker's last arrow (axe target-size: 22.5px instead of 24px). The pull now applies only when the bar opens the row.
