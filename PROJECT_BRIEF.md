# Chevrolet Dealers Association of Greater Atlanta — GIS Mapping Project

## What this project is

A strategic market-planning map for the 19 Chevrolet dealerships that belong to the
Chevrolet Dealers Association of Greater Atlanta, overlaid with:

1. **8-mile buyer-intent radius** around each dealership (standard trade-area radius for
   auto dealer media/market planning).
2. **Demographic layer** — population by age, gender, average household income (aHHI),
   average home value (aHOV), and family structure, at ZIP/county level.
3. **Audience viewership layer** — Nielsen WUPA (CBS Atlanta) news-viewing tier and average
   impressions (P2+), by ZIP code.
4. **Automotive purchase/registration layer** — Mobility Global (Polk) vehicle registration
   volume, by county of registration.

The end goal is an interactive, choropleth-capable map (not just point markers) that a media
planner or dealer-association stakeholder can use to see all four layers together, toggle
between them, and drill into specific dealers, ZIPs, or counties.

## Files provided alongside this brief

- **`dealers.geojson`** — Point layer, all 19 dealers. Google-verified lat/lng (via Places
  API geocoding, not estimated). Properties include name, address, `place_id`, and
  Rolling YTD 2026/2025 registration volume where available. Ready to load into any GIS or
  mapping library with zero conversion.
- **`atlanta_chevy_gis_package.xlsx`** — five tabs, detailed below.

## Data dictionary (`atlanta_chevy_gis_package.xlsx`)

### `Dealers` tab
19 rows. One per association member. Columns: Dealer Name, Address, Latitude, Longitude,
Place ID, Rolling YTD 2026 (units), Rolling YTD 2025 (units), YoY Delta (formula), 8-mi
Radius (constant, for reference).

### `ZIP_Data` tab
334 rows — every unique buyer ZIP code across the association's footprint. Columns: ZIP
Code, Vehicles YTD 2026, Vehicles YTD 2025, YoY Delta (formula), WUPA Avg News Imp (P2+),
WUPA Viewing Tier (Tier 1/2/3 or "Not covered by Nielsen sample" for 42 ZIPs outside the
mapped Nielsen coverage), Leading Dealer in ZIP.

**Join key for a ZCTA (ZIP boundary) shapefile: the `ZIP Code` column, 5-digit, matches
Census ZCTA5CE20 / ZCTA5CE10 field.**

### `County_Summary` tab
59 rows — the same registration + viewership data aggregated to county of registration,
built by joining `ZIP_Data` up through the County field that already existed in the
source Nielsen sheet (not re-derived from a ZIP-county crosswalk). Columns: County (format:
`"X County, Georgia"`), Vehicles YTD 2026 (Polk), WUPA Total Avg News Imp (P2+), ZIP Codes
in County (mapped).

**Join key for a county boundary shapefile: strip the `", Georgia"` suffix from the
`County` column to match TIGER/Line's `NAME` field** (e.g. `"Gwinnett County, Georgia"` →
`"Gwinnett"`).

Note: 42 of the 334 ZIPs in `ZIP_Data` had no county match in the source file and are
excluded from this tab's totals — they're still present in `ZIP_Data` in full.

### `Demographics_Sample` tab
**One** fully real ZIP-level Census/ACS profile (ZIP 30291 — Union City, home ZIP of ALM
Chevrolet South): population, median age (overall/male/female), median household income
(aHHI), median home value (aHOV), average household size, and family structure breakdown
(husband/wife, single guardian, singles, with roommate) plus age-mix bands.

**This is a template, not full coverage.** Extending it to the other 18 dealer ZIPs, or all
334 buyer ZIPs, needs the same pull repeated — see "Known gaps" below.

### `README` tab
Restates all of the above plus data source citations (Mobility Global date ranges, Nielsen
methodology window, dealer list provenance).

## Known gaps / what still needs building

1. **Choropleth polygons don't exist yet.** All of the above is real, correct *data*, but
   it isn't attached to real county/ZCTA *geometry*. The map currently plots dealer points
   only. Building the polygon layers is the main remaining GIS task:
   - Georgia county boundaries: U.S. Census TIGER/Line Shapefiles
     (`https://www.census.gov/cgi-bin/geo/shapefiles/index.php` → layer `Counties`, year
     2023, state Georgia), or the lighter-weight 500k generalized cartographic boundary
     file for the same layer.
   - Georgia ZCTA boundaries: same TIGER/Line source, layer `ZIP Code Tabulation Areas`.
   - Join each to `County_Summary` / `ZIP_Data` on the keys described above.

2. **Full demographic coverage requires a Census API key.** The Census Bureau's data API
   now requires a free personal key to query in bulk
   (`https://api.census.gov/data/key_signup.html`). Once obtained, pull ACS 5-Year tables:
   - `B01002` — median age
   - `B19013` — median household income
   - `B25077` — median home value
   - `B11001` / `B09019` — household and family structure
   
   for each ZCTA (or county, if that's the resolution you want) in `ZIP_Data`. Claude Code
   can write this pull once a key is in hand — it's a straightforward scripted API call,
   not a research task.

3. **Dealer coordinates are geocoded, not rooftop-surveyed.** They're Google Places-verified
   against each dealer's listed street address, which is accurate enough for an 8-mile
   trade-area radius but not survey-grade.

## Suggested build path

1. Confirm the final deliverable shape first — a hosted interactive web app, an embedded
   widget, or static exports for a deck — since that decides the stack (Mapbox GL JS /
   Leaflet + a backend, vs. a Python/GeoPandas + matplotlib static pipeline, vs. both).
2. Pull the two boundary shapefiles (county, ZCTA) and do the joins described above.
3. Wire up layer toggles: dealers + radius (always on), county/ZIP choropleth by
   registration volume, by WUPA tier, and — once available — by demographic variable.
4. Backfill full demographic coverage using the Census API key once obtained.
5. Add dealer-level popovers/tooltips pulling from the `Dealers` tab (volume, YoY delta,
   address).

## Data sources (for citation in the final product)

- **Mobility Global**: Chevrolet dealer vehicle registrations. Rolling YTD 2026 = Aug
  2025–Jul 2026. Rolling YTD 2025 = Aug 2024–Jul 2025. Atlanta DMA.
- **Nielsen**: Local TV View, non-calibrated, average Mon–Fri local newscasts 4:30am–12am,
  08/31/2026–09/15/2026, WUPA (CBS Atlanta).
- **Dealer list & coordinates**: Chevrolet Dealers Association of Greater Atlanta ground
  map (user-provided); coordinates geocoded via Google Places during this project's
  research phase.
- **Demographics**: U.S. Census Bureau / American Community Survey 5-Year Estimates.
