# durandom.de

Personal link page. durandom = d + `/dev/urandom`.

The page boots into a live hex dump, the noise settles into the avatar drawn from hex
glyphs (glyph density and brightness follow pixel luminance), and the links rise out of
the noise. The pointer (or touch) stirs entropy: the avatar dissolves near it and re-forms.

Vite + vanilla TypeScript + Canvas 2D. No framework, no runtime dependencies.

## Run

```sh
npm ci
npm run dev        # http://127.0.0.1:5173
```

## Check, test, build

```sh
npm test           # node --test (Node >= 22.18, native type stripping)
npm run check      # tsc --noEmit
npm run build      # static output in build/
npm run preview    # serve build/ with Vite
npm run preview:worker  # build, then serve through the Worker locally (wrangler dev)
```

## Layout

| Path | What |
| --- | --- |
| `index.html` | Static page. `<!--links-->` is replaced at build time with the link list. |
| `src/links.ts` | The link list and its HTML renderer (used by `vite.config.ts`). |
| `src/grid.ts` | Pure image → luminance grid sampling (box filter, rounded mask, normalize). |
| `src/field.ts` | The hex-dump field: boot, settle, stir, glyph atlas, dirty-cell drawing. |
| `src/main.ts` | DOM wiring: sizing, avatar placement, pointer, visibility, reduced motion. |
| `public/avatar.jpg` | Avatar, 320 px (downscaled from the 460 px original). |

## Behaviour contract

- Links are real `<a>` elements in the HTML. With JS off the page shows the photo and links.
- `prefers-reduced-motion: reduce`: one static glyph frame, no animation, no stir.
- The animation stops while the tab is hidden.
- Transfer budget: under 100 KB excluding the avatar (currently about 5 KB gzipped).

To replace the avatar, downscale the new source image into place:

```sh
magick <source.jpeg> -resize 320x320 -strip -quality 82 public/avatar.jpg
```

## Deploy

Deploys are **local only**. CI (`.github/workflows/website.yml`) runs `npm ci`, test,
check and build on every push and PR, and never deploys. There are no GitHub secrets.

Deploy from a shell where direnv has loaded `.envrc`:

```sh
direnv allow       # once, after reviewing .envrc
npm run deploy     # npm run build && wrangler deploy
```

`.envrc` holds only `use vega durandom-de`. It exports `CLOUDFLARE_API_TOKEN` from vega
secrets (tool `durandom-de`). The token needs **Workers Scripts Edit** and
**Workers Routes Edit** on account `9f8d10b397a50cbce66cea20148fa14f`. The account id
itself comes from `wrangler.jsonc`.

The Worker is `durandom-de` (see `wrangler.jsonc`). It serves `build/` as static assets.
`workers_dev` and `preview_urls` are off, so the Worker has no `*.workers.dev` URL.

## DNS split

- **orrery owns DNS** for `durandom.de`. This repo never writes DNS records or zone settings.
- **This repo owns the Worker only.** It binds to the domain through Worker **routes**
  (`durandom.de/*`, `www.durandom.de/*`, zone `durandom.de`), never a Worker custom domain,
  because a custom domain makes Cloudflare write DNS records.
- The `routes` block in `wrangler.jsonc` is commented out. Enable it at cut-over, after
  orrery has set the proxied DNS records for `durandom.de` and `www.durandom.de`.
