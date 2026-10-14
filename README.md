# Power BI custom visuals lab

Eleven hand-written Power BI custom visuals (TypeScript + d3), built with the
official Microsoft toolchain (`powerbi-visuals-tools` / `pbiviz`, API 5.11.1),
verified headlessly, and demonstrated live on a single page.

Live page: https://pbi-visuals-lab.luccabuilds.com

## What is in here

| Visual | What it does | Data mapping |
|---|---|---|
| `dumbbell` | Two values per category on a shared axis, with the delta column | categorical (category + 2 measures) |
| `ring` | Donut of participation with a centre KPI and hover lift | categorical |
| `dotmatrix` | One cell per category with a proportional dot matrix | categorical |
| `matrixheat` | Row x column heatmap with sequential colour scale and totals | categorical with series |
| `horizon` | Horizon chart: series folded into stacked opacity bands | categorical with series |
| `radar` | Several measures on the same axes, legend toggles profiles | categorical (category + 3 measures) |
| `sankey` | Flow between origin and destination (d3-sankey) | categorical with series |
| `glyph` | Per-row micro chart: start marker, end bar, direction arrow | categorical |
| `slicer` | Ranked list that applies a real cross-filter to the report | categorical |
| `sqlfilter` | Terminal-styled query builder; clicked rows become WHERE predicates | categorical |
| `game` | Bonus: the visual draws a category and the reader guesses the value | categorical |

Every visual implements selection (cross-highlight), tooltips, context menu,
`applyJsonFilter` (where it makes sense), empty/error states and a formatting
pane card (theme preset, accent colours, decimals, plus per-visual controls).

## Repository layout

```
shared/src/          kit.ts (data adapter, themes, formatting readers, chrome),
                     base.ts (visual lifecycle), settings.ts, dom.ts, filter.ts
visuals/<slug>/      src/visual.ts + pbiviz.json + capabilities.json + tsconfig
tools/scaffold.py    generates pbiviz.json / capabilities.json / icons from one manifest
tools/build.sh       runs `pbiviz package` per visual, copies the .pbiviz to public/downloads
tools/verify.py      unpacks each .pbiviz and runs tools/harness.mjs
tools/harness.mjs    jsdom + fake Power BI host: update, resize, empty data, hover,
                     click, context menu, filter; writes public/verify-report.json
tools/make_site.py   extracts bundles into public/bundles and writes public/manifest.js
public/              the demo page (index.html, demo.js, render.js) and the .pbiviz downloads
```

## Build from scratch

```bash
npm install
python3 tools/scaffold.py      # regenerate project scaffolding from the manifest
./tools/build.sh               # package every visual (needs the dev deps)
python3 tools/verify.py        # headless verification of every packaged bundle
python3 tools/make_site.py     # refresh public/bundles + public/manifest.js
python3 -m http.server 8099 --directory public
```

`tools/debug-ctx.ts` is a data-shape diagnostic: it prints what the shared
adapter extracts for the `categorical`, `grouped` and `table` mappings, which is
the first thing to check when a visual shows its empty state.

## Verification, honestly

`tools/verify.py` loads each compiled bundle in jsdom with a fake host and
exercises `update()` (900x520), a resize pass (420x300), an empty-data pass,
pointer/click/context-menu events and filter dispatch. The report lands in
`public/verify-report.json` and is rendered in the "Verificação" section of the
page.

What is **not** verified: importing the `.pbiviz` into Power BI Desktop or the
service, and the official `pbipx` packaging — that requires Windows. The
compiler is the same on both sides, but the final check happens in your Desktop.

## Limitations

- Not certified for AppSource: no high-contrast theme support yet, no
  localisation beyond pt-BR, no keyboard navigation.
- Corporate tenants often block uncertified custom visuals. If yours does,
  the same ideas can be re-implemented in Deneb (Vega-Lite) or as SVG measures
  in DAX, which pass content filters.
- Tooltips and selection rely on the host contract; the in-page demo emulates
  that contract, so the demo is a faithful but not identical environment.

## License

MIT.
