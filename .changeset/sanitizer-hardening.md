---
"@aparte/core": patch
---

Harden the default sanitizer's residual defense-in-depth gaps:

- **Inline `style` is now a property allowlist** (colours, weights, decoration — what
  highlighters emit) instead of a scheme blocklist. Layout/positioning properties
  (`position`/`z-index`/`inset`/`width`/…) are dropped, so hostile markup can no longer build
  a full-viewport click-jacking overlay, and `url()` beacons are rejected on any property.
  Safe declarations survive even when a dangerous one sits beside them (previously the whole
  attribute was dropped all-or-nothing).
- **`id`/`name` are no longer allowlisted** — they enable DOM clobbering and LLM-authored
  markup has no legitimate need for author-controlled ids.
- The js-artifact preview's `</script>` escaper now matches `</script` followed by any
  spec terminator (whitespace/`/`/`>`), not only the exact `</script>` (still inside the
  sandboxed, `allow-scripts`-without-`allow-same-origin` iframe).
