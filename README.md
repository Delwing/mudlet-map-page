# mudlet-map-page

A GitHub Action that turns a Mudlet binary map (`.dat`) into a published, browsable map site —
no hand-written HTML. You point at the `.dat`; the action decodes it to JSON at build time and
generates the host page that loads the
[`mudlet-map-browser-script`](https://www.npmjs.com/package/mudlet-map-browser-script) bundle
from a CDN.

There are two ways to use it:

- **Reusable workflow** — the turn-key path. One `uses:` line builds *and* deploys to Pages.
- **Composite action** — just builds the site into a folder; you wire up deployment (or any
  other hosting) yourself.

## Quick start (reusable workflow)

Your repo holds the `.dat`. Add `.github/workflows/pages.yml`:

```yaml
name: Map

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  pages:
    uses: Delwing/mudlet-map-page/.github/workflows/deploy-pages.yml@v1
    with:
      map-file: maps/map.dat
      title: My MUD Map
```

Then enable Pages once: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
On the next push the workflow publishes the site and prints its URL in the run summary.

The `permissions` block is required in **your caller**. A called (reusable) workflow can't be
granted more than the caller's `GITHUB_TOKEN` holds, and `id-token: write` (needed for the Pages
OIDC deploy) is never granted by default — so the reusable workflow can't request it on your
behalf. Without this block the run fails at startup on repos whose default workflow permissions
are read-only (the current GitHub default).

## Composite action (build only)

Use this when you want the generated site as a folder and control deployment yourself:

```yaml
- uses: actions/checkout@v6
- uses: actions/setup-node@v6
  with:
    node-version: 24
- uses: Delwing/mudlet-map-page@v1
  with:
    map-file: maps/map.dat
    title: My MUD Map
    output-dir: _site
# _site/ now contains index.html + data/{mapExport,colors}.json — deploy it anywhere.
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `map-file` | **yes** | — | Path to the Mudlet `.dat` in your checkout. |
| `version` | no | `1` | Bundle version for the CDN. A jsDelivr range — see [Version pinning](#version-pinning). |
| `reader-version` | no | `latest` | `mudlet-map-binary-reader` version used to decode the `.dat` at build time. No effect in `direct` mode. |
| `mode` | no | `auto` | `prebuilt`, `direct`, or `auto` — see [Loading modes](#loading-modes). |
| `direct-room-threshold` | no | `50000` | Room count above which `auto` mode switches to `direct`. Ignored unless `mode` is `auto`. |
| `output-dir` | no | `_site` | Folder the generated site is written to. |
| `title` | no | `Map` | Page title (`MAP_CONFIG.title` and the document `<title>`). |
| `logo` | no | — | Logo — a URL, or a repo file (copied in). Sets `MAP_CONFIG.logo`. See [Referencing repo files](#referencing-files-from-your-repo). |
| `npc-url` | no | — | NPC data file — a URL, or a repo file (copied in). Sets `MAP_CONFIG.npcUrl`. |
| `assets` | no | — | Extra files/dirs from your checkout to copy into the site, one per line. |
| `lang` | no | `en` | Document language and default UI language. |
| `theme` | no | `dark` | Bootstrap theme (`data-bs-theme`): `dark` or `light`. |
| `favicon` | no | — | A URL, or a repo file copied in as `/favicon.ico`. |
| `credits-author` | no | — | Help-modal credits: author name. |
| `credits-github-url` | no | — | Help-modal credits: GitHub URL. |
| `credits-remark` | no | — | Help-modal credits: remark (HTML allowed). |
| `extra-config` | no | — | Raw JSON merged into `MAP_CONFIG` last — escape hatch for anything not covered above. |

> The reusable workflow exposes the same inputs (`with:`), except `output-dir`, which it
> fixes to `_site` for the Pages upload.

## Referencing files from your repo

The published site only contains what the action puts in `output-dir` (`index.html`,
`data/`, plus anything copied in). So a `MAP_CONFIG` value pointing at a file in your repo
must be **copied into the site**, or it will 404 once deployed.

`logo`, `npc-url`, and `favicon` do this automatically: if the value is a **URL** it's used
as-is; if it's a **path that exists in your checkout** it's copied into the site (at the same
relative path; `favicon` becomes `/favicon.ico`) and referenced there.

```yaml
with:
  map-file: maps/map.dat
  logo: images/logo.png          # copied → site/images/logo.png, MAP_CONFIG.logo = images/logo.png
  npc-url: data/npc.json         # copied → site/data/npc.json,    MAP_CONFIG.npcUrl = data/npc.json
  favicon: assets/favicon.ico    # copied → site/favicon.ico
```

For any other repo files (e.g. images referenced from NPC tooltips, or files wired through
`extra-config`), list them in `assets` — paths are preserved:

```yaml
with:
  assets: |
    images/icons/
    data/labels.json
  extra-config: '{ "labelsUrl": "data/labels.json" }'
```

> NPC search is opt-in: without `npc-url`, NPCs simply aren't searchable (room-id search still
> works). The bundle ships no default endpoints, so your site never points at someone else's data.

## Loading modes

`mode` controls how map data reaches the browser:

- **`prebuilt`** — the `.dat` is decoded **once, offline** (`MudletMapReader.export()` →
  `{ mapData, colors }`), and the page loads those JSON files via `MAP_CONFIG.mapDataUrl` /
  `colorsUrl`. Visitors never download the binary decoder, so the page loads faster — but the
  JSON export can be considerably larger than the source `.dat` on big maps.
- **`direct`** — the raw `.dat` is copied into the site as-is and loaded via `MAP_CONFIG.mapUrl`;
  the bundle decodes it in-browser (needs `mudlet-map-browser-script` >= 1.0.0). No build-time
  decode step, and the `.dat` is typically smaller than its JSON export — at the cost of
  visitors paying the decode cost themselves. `reader-version` has no effect in this mode.
- **`auto`** (default) — decodes the `.dat` at build time to count rooms, then picks `direct`
  once the count exceeds `direct-room-threshold` (default `50000`), else `prebuilt`.

```
<output-dir>/
├── index.html              # host shell: #root mount, MAP_CONFIG, CDN <script>/<link>
└── data/
    ├── mapExport.json      # prebuilt mode: the .dat's room/area data
    ├── colors.json         # prebuilt mode: the .dat's environment colours
    └── map.dat              # direct mode: the raw map, copied through as-is
```

## Version pinning

`version` is passed straight into the jsDelivr URL, so it accepts a semver **range**:

| Value | Resolves to |
|-------|-------------|
| `1` (default) | Latest `1.x` — picks up new minor/patch bundles automatically. |
| `1.2` | Latest `1.2.x`. |
| `1.2.3` | Exactly that version (fully reproducible). |

`reader-version` controls only the build-time decoder. Its output (`{ mapData, colors }`) is a
stable shape, so `latest` is usually fine; pin it if you ever need byte-for-byte reproducible
builds.

## Full example

```yaml
permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  pages:
    uses: Delwing/mudlet-map-page/.github/workflows/deploy-pages.yml@v1
    with:
      map-file: maps/map.dat
      version: "1.0.3"
      title: Arkadia Map
      logo: https://example.org/logo.png
      favicon: assets/favicon.ico
      lang: pl
      credits-author: Dargoth
      credits-github-url: https://github.com/Delwing/mudlet-map-reader
      credits-remark: "Built by the community"
      # Anything not covered by a dedicated input: add/override UI languages & strings.
      extra-config: |
        {
          "languages": [{ "code": "pl" }, { "code": "en", "flag": "gb" }],
          "translations": { "en": { "search": "Find" } }
        }
```

## Releasing

The action is versioned with `v`-prefixed git tags (independent of the
`mudlet-map-browser-script` npm bundle, which uses `1.x.x` tags). To publish `@v1`:

```bash
git tag v1.0.0      # immutable release
git tag v1          # moving major alias that consumers reference
git push origin v1.0.0 v1
```

On each later `v1.x` release, re-point `v1`:

```bash
git tag -f v1 && git push -f origin v1
```

(Add a GitHub Release on top only if you want a Marketplace listing.)

## License

MIT
