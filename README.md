# Chevrolet Dealers Association of Greater Atlanta — GIS Market Map

Interactive, layer-toggleable web map covering the 19 association dealers: 8-mile
trade-area radii, vehicle registration volume, Nielsen WUPA (CBS Atlanta)
viewership tier, and a demographic sample — see `PROJECT_BRIEF.md` for the full
project spec.

**Live**: https://mayormorris.github.io/AxiomAI/ (deployed automatically from
`public/` on every push to the default branch — see
`.github/workflows/deploy-pages.yml`). Or run locally: `npm run serve`, then
visit `http://localhost:8080`.

> **One-time setup**: GitHub Pages must be switched to the "GitHub Actions"
> source before the workflow can deploy — repo Settings → Pages → Build and
> deployment → Source → **GitHub Actions**. After that, every push to the
> default branch that touches `public/` redeploys automatically.

## Stack

Static site: vanilla HTML/CSS/JS + [Leaflet](https://leafletjs.com/) (vendored
locally in `public/vendor/leaflet`, no CDN dependency) + OpenStreetMap tiles.
No backend, no build step, no API keys required to run it. Chosen over a
Mapbox GL / React stack because the dataset is small (19 dealers, 334 ZIPs, 59
counties — a few MB of GeoJSON total) and a zero-dependency static bundle is
trivial to host anywhere (GitHub Pages, S3, or open the file directly).

Data prep is a separate, reproducible Python step (`scripts/build_data.py`)
that reads the raw source package and writes ready-to-fetch GeoJSON/JSON into
`public/data/` — see below.

## Project layout

```
PROJECT_BRIEF.md          the original project spec
data/source/               raw inputs (do not hand-edit)
  atlanta_chevy_gis_package.xlsx   Dealers / ZIP_Data / County_Summary / Demographics_Sample / README tabs
  dealers.geojson                  Google-geocoded dealer points (place_id, coords)
  boundaries/                      cached TIGER-derived boundary GeoJSON (gitignored, see below)
scripts/build_data.py      joins the above into the files the map fetches
public/                    the static site
  index.html, style.css, app.js, colors.js
  vendor/leaflet/          vendored Leaflet build (no CDN)
  data/                    output of build_data.py — dealers.geojson,
                            county_choropleth.geojson, zip_choropleth.geojson,
                            demographics.json, zip_data_full.json
```

## Map features

- **Dealers & 8-mi radius** (always available, on by default) — all 19
  dealers as points with a true 8-mile trade-area circle; click for YTD
  2026/2025 registrations and YoY delta.
- **Choropleth**, switchable between two geographies and several metrics:
  - **County**: vehicle registrations (Polk), WUPA total avg news impressions.
  - **ZIP (ZCTA)**: vehicle registrations, YoY registration change
    (diverging red/blue), WUPA avg impressions, WUPA viewing tier
    (categorical).
- **Demographics sample** — outlines ZIP 30291 (Union City, home ZIP of ALM
  Chevrolet South), the one ZIP with a full ACS profile pulled in this pass;
  click it for the full metric table.
- Click any dealer, ZIP, or county for details in the sidebar; hover a
  choropleth shape for a quick tooltip.

Colors follow the org dataviz standard: one hue (blue) light→dark for
magnitude, a blue↔red diverging ramp for YoY change, and three fixed
categorical hues (blue/orange/aqua) for WUPA tiers, with muted gray reserved
for "no data." Palette is defined in `public/colors.js`.

## Data pipeline (`scripts/build_data.py`)

```
python3 scripts/build_data.py
```

Reads `data/source/atlanta_chevy_gis_package.xlsx` and `dealers.geojson`,
joins them to county/ZCTA boundary polygons, simplifies geometry for the
browser, and writes everything the map needs into `public/data/`. Re-run it
any time the source package or boundary cache changes. Notable joins:

- **Dealers**: point geometry + `place_id` come from `dealers.geojson`; YTD
  2026/2025 registration volume comes from the xlsx `Dealers` tab, keyed by
  `place_id` (`dealers.geojson` as uploaded was missing YTD figures for
  several dealers that the xlsx has — the xlsx is treated as the source of
  truth for volume).
- **ZIP choropleth**: `ZIP_Data` tab joined to ZCTA polygons on the 5-digit
  ZIP / `ZCTA5CE10` key, as specified in `PROJECT_BRIEF.md`. 306 of 334 ZIPs
  matched a boundary; the other 28 are non-residential/PO-box ZIPs with no
  ZCTA equivalent in the Census extract — they're still in
  `public/data/zip_data_full.json` in full, just not mappable as a polygon.
- **County choropleth**: `County_Summary` tab joined to county polygons on
  name **and state** — the association's ZIP footprint spans the Atlanta DMA
  into edge counties of Alabama and North Carolina, not Georgia alone, so
  matching on name only would have collided (e.g. three states each have a
  "Clay County"). All 59 counties matched.
- The trailing `TOTAL` / footnote rows present in both the `ZIP_Data` and
  `County_Summary` tabs are filtered out during load, not treated as data
  rows.

### Boundary source data

`data/source/boundaries/*_raw.json` (gitignored — regenerate rather than
commit, they're 3–30MB) are cached from:

- ZCTA polygons: `https://raw.githubusercontent.com/OpenDataDE/State-zip-code-GeoJSON/master/ga_georgia_zip_codes_geo.min.json`
- County polygons: `https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json`

Both are TIGER/Line-derived. `PROJECT_BRIEF.md` points at the Census
TIGER/Line source directly (`census.gov/cgi-bin/geo/shapefiles`); this build
used the two GitHub-hosted GeoJSON mirrors above instead because outbound
access to `census.gov` was blocked in the sandbox this was built in. If you
have Census access, pulling the shapefiles directly and re-running
`ogr2ogr`/`geopandas` to regenerate `data/source/boundaries/*_raw.json` in
the same schema (needs `ZCTA5CE10`/`ZCTA5CE20` and `STATE`/`NAME` property
keys) will work as a drop-in replacement — the join logic in
`build_data.py` doesn't care which mirror the polygons came from.

## Full demographic coverage (Census API pull)

`scripts/pull_census_demographics.py` pulls ACS 5-Year estimates (population,
median age, household income, home value, household size, household/family
structure, age-mix bands) for every ZIP in `public/data/zip_data_full.json`,
via the same variables/methodology as the `Demographics_Sample` tab — the
derivation logic was checked against the sample's own numbers (feeding it the
sample's underlying ACS values reproduces the sample exactly).

```
CENSUS_API_KEY=xxxx python3 scripts/pull_census_demographics.py   # writes data/source/demographics_full.json
python3 scripts/build_data.py                                     # merges it into public/data/demographics.json
```

Get a free key at `https://api.census.gov/data/key_signup.html`. **This
script has not been run end-to-end** — outbound access to `api.census.gov`
is blocked by policy in the sandbox this repo was built in (confirmed via
direct `curl`: the CONNECT tunnel gets a 403), so it could only be written
and checked against mocked data, not executed against the live API. Run it
somewhere with real internet access; a handful of the 334 ZIPs coming back
skipped is expected (PO-box/non-residential ZIPs aren't tabulated as ZCTAs),
but if most or all are skipped, something's off with the key, the
`CENSUS_ACS_YEAR` vintage (default 2023 — bump it if a newer 5-Year release
is out), or a variable code — paste the error back rather than assuming the
rest of the pipeline is broken. `app.js`'s demographics layer already
iterates every ZIP in the file, so no code changes are needed once it's
populated.

## Other known gaps (carried over from `PROJECT_BRIEF.md`, still open)

1. **28 ZIPs have no ZCTA boundary** (see above) — inherent gap in the
   ZCTA layer, not fixable by rejoining; they remain in the tabular data.
2. **Dealer coordinates are Google Places-geocoded, not survey-grade** —
   accurate enough for an 8-mile radius, per the brief.

## Data sources

- **Mobility Global**: dealer vehicle registrations. Rolling YTD 2026 = Aug
  2025–Jul 2026. Rolling YTD 2025 = Aug 2024–Jul 2025. Atlanta DMA.
- **Nielsen**: Local TV View, non-calibrated, avg Mon–Fri local newscasts
  4:30am–12am, 08/31/2026–09/15/2026, WUPA (CBS Atlanta).
- **Dealer list & coordinates**: Chevrolet Dealers Association of Greater
  Atlanta; coordinates geocoded via Google Places.
- **Demographics**: U.S. Census Bureau / ACS 5-Year Estimates.
- **Boundaries**: U.S. Census TIGER/Line, via the GitHub mirrors noted above.
