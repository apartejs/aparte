---
"@aparte/plugin-cards": minor
---

The place card can show a real map: pass `mapTiles` (your tile server's address, `{z}/{x}/{y}` in it) and `mapAttribution` to `setupPlaceCard`. Nothing changes without them.

```ts
setupPlaceCard({
  mapTiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution: '© OpenStreetMap contributors',
});
```

A place with coordinates and no photo then sits on nine tiles, centred under its marker, with the
credit in a corner; `mapZoom` sets how close (16 by default). A photo still wins over the map, a
place without coordinates keeps the drawn map, and so does a card whose tile fails to load.
Off by default because each tile is a request to a third party that sees the visitor and the
place: the provider (OpenStreetMap, MapTiler, Stadia, your own) is the app's choice. Tiles keep
the page's referrer, which OpenStreetMap's usage policy asks for. `--aparte-place-map-filter`
takes a CSS filter to dim them in a dark theme.
