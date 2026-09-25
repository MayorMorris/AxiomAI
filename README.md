# Chevrolet Dealers Association of Greater Atlanta — GIS Market Map

Interactive, layer-toggleable web map covering the 19 association dealers: 8-mile
trade-area radii, vehicle registration volume, Nielsen WUPA (CBS Atlanta)
viewership tier, and a demographic sample — see `PROJECT_BRIEF.md` for the full
project spec.

**[Open the map](public/index.html)** (or `npm run serve`, then visit
`http://localhost:8080`).

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

## Known gaps (carried over from `PROJECT_BRIEF.md`, still open)

1. **Full demographic coverage needs a Census API key.** Only ZIP 30291 has
   real ACS data today (`Demographics_Sample` tab — a template, not full
   coverage). Once you have a key from
   `https://api.census.gov/data/key_signup.html`, pull ACS 5-Year tables
   `B01002` (median age), `B19013` (median household income), `B25077`
   (median home value), `B11001`/`B09019` (household/family structure) for
   each ZCTA in `public/data/zip_data_full.json`, write them into
   `data/source/` in the same shape as `Demographics_Sample`, and extend
   `build_data.py`'s `build_demographics()` to loop over all of them instead
   of the one sample row. `app.js`'s demographics layer already iterates
   `Object.keys(demographics)`, so it will pick up additional ZIPs with no
   further changes.
2. **28 ZIPs have no ZCTA boundary** (see above) — inherent gap in the
   ZCTA layer, not fixable by rejoining; they remain in the tabular data.
3. **Dealer coordinates are Google Places-geocoded, not survey-grade** —
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
