#!/usr/bin/env python3
"""
Pulls ACS 5-Year demographic estimates for every buyer ZIP in
public/data/zip_data_full.json and writes data/source/demographics_full.json
in the same {zip: {label, metrics}} shape as the one hand-built sample in the
xlsx Demographics_Sample tab. scripts/build_data.py picks this file up
automatically (merged in, taking precedence over the sample for any ZIP both
cover) -- no other code changes needed after running this.

Requires a free Census API key: https://api.census.gov/data/key_signup.html

Usage:
    CENSUS_API_KEY=xxxxxxxx python3 scripts/pull_census_demographics.py
    python3 scripts/build_data.py   # re-run to pick up the new file

Optional env vars:
    CENSUS_ACS_YEAR   ACS 5-Year vintage to query (default 2023 -- the
                      2019-2023 5-Year release). Bump this to whatever the
                      latest available vintage is when you run this.

NOTE: this network call was written and reviewed but NOT executed -- outbound
access to api.census.gov is blocked by policy in the sandbox this repo was
built in (confirmed via direct curl: CONNECT tunnel 403). Run it somewhere
with real internet access, then check the printed summary: a `skipped`
count in the double digits across 334 ZIPs is normal (PO-box/non-residential
ZIPs the Census Bureau doesn't tabulate as ZCTAs), but if every ZIP is
skipped, something's wrong with the key, year, or variable codes below --
paste the error back rather than assuming the pipeline is broken.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_KEY = os.environ.get("CENSUS_API_KEY")
YEAR = os.environ.get("CENSUS_ACS_YEAR", "2023")
BASE_URL = f"https://api.census.gov/data/{YEAR}/acs/acs5"
ZCTA_BATCH_SIZE = 40
RETRY = 3

# --- ACS variable groups -----------------------------------------------
# B01001 = Sex by Age (used only to derive the four age-mix bands below).
# Small tables are named explicitly rather than pulled as groups so they can
# share one call.
SMALL_VARS = {
    "pop": "B01003_001E",
    "age_total": "B01002_001E",
    "age_male": "B01002_002E",
    "age_female": "B01002_003E",
    "hh_income": "B19013_001E",
    "home_value": "B25077_001E",
    "avg_hh_size": "B25010_001E",
    "hh_total_kids": "B11005_001E",
    "hh_with_kids": "B11005_002E",
}
HOUSEHOLD_TYPE_VARS = {
    "hh_total": "B11001_001E",
    "hh_married": "B11001_003E",
    "hh_male_no_spouse": "B11001_005E",
    "hh_female_no_spouse": "B11001_006E",
    "hh_alone": "B11001_008E",
    "hh_not_alone": "B11001_009E",
}
# Age bands: (label, male var suffixes, female var suffixes) -- B01001 layout
# is 003-025 = male age bins young->old, 027-049 = the same 23 bins for female.
AGE_BANDS = [
    ("Under 20", list(range(3, 8)), list(range(27, 32))),   # <5,5-9,10-14,15-17,18-19
    ("20 to 34", list(range(8, 13)), list(range(32, 37))),  # 20,21,22-24,25-29,30-34
    ("35 to 54", list(range(13, 17)), list(range(37, 41))), # 35-39..50-54
    ("55+", list(range(17, 26)), list(range(41, 50))),      # 55-59..85+
]
AGE_SEX_VARS = [f"B01001_{i:03d}E" for i in range(1, 50)]


def fetch(get_vars, zctas):
    var_str = ",".join(get_vars)
    zcta_str = ",".join(zctas)
    qs = urllib.parse.urlencode({
        "get": var_str,
        "for": f"zip code tabulation area:{zcta_str}",
        "key": API_KEY,
    }, safe=",:")
    url = f"{BASE_URL}?{qs}"
    for attempt in range(1, RETRY + 1):
        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                rows = json.loads(resp.read())
            header, *data_rows = rows
            zcta_idx = header.index("zip code tabulation area")
            return {row[zcta_idx]: dict(zip(header, row)) for row in data_rows}
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if attempt == RETRY:
                raise RuntimeError(f"Census API error {e.code} for {var_str[:60]}...: {body[:300]}")
            time.sleep(2 * attempt)
        except urllib.error.URLError as e:
            if attempt == RETRY:
                raise RuntimeError(f"Census API unreachable: {e.reason}")
            time.sleep(2 * attempt)


def chunk(seq, n):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def to_int(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def pct(numerator, denominator):
    n, d = to_int(numerator), to_int(denominator)
    if not d:
        return None
    return f"{round(100 * n / d)}%"


def build_metrics(small, household, age_sex):
    if small.get("pop") is None:
        return None  # not a populated ZCTA (e.g. PO-box-only ZIP) -- skip

    total_hh = to_int(household.get("hh_total"))
    age_total = to_int(age_sex.get("B01001_001E"))
    metrics = {
        "Population": to_int(small.get("pop")),
        "Median Age — Overall": to_int(small.get("age_total")),
        "Median Age — Male": to_int(small.get("age_male")),
        "Median Age — Female": to_int(small.get("age_female")),
        "Median Household Income (aHHI)": f"${to_int(small.get('hh_income')):,}" if to_int(small.get("hh_income")) else None,
        "Median Home Value (aHOV)": f"${to_int(small.get('home_value')):,}" if to_int(small.get("home_value")) else None,
        "Average Household Size": round(float(small["avg_hh_size"]), 1) if small.get("avg_hh_size") not in (None, "null") else None,
        "Households With Kids": pct(small.get("hh_with_kids"), small.get("hh_total_kids")),
        "Households Without Kids": pct(
            to_int(small.get("hh_total_kids")) - to_int(small.get("hh_with_kids"))
            if to_int(small.get("hh_total_kids")) is not None and to_int(small.get("hh_with_kids")) is not None
            else None,
            small.get("hh_total_kids"),
        ),
        "Family Structure — Husband/Wife": pct(household.get("hh_married"), total_hh),
        "Family Structure — Single Guardian": pct(
            (to_int(household.get("hh_male_no_spouse")) or 0) + (to_int(household.get("hh_female_no_spouse")) or 0),
            total_hh,
        ) if total_hh else None,
        "Family Structure — Singles": pct(household.get("hh_alone"), total_hh),
        "Family Structure — With Roommate": pct(household.get("hh_not_alone"), total_hh),
    }
    if age_total:
        for label, male_idxs, female_idxs in AGE_BANDS:
            band_total = sum(to_int(age_sex.get(f"B01001_{i:03d}E")) or 0 for i in male_idxs + female_idxs)
            metrics[f"Age Mix — {label}"] = f"{round(100 * band_total / age_total)}%"
    return {k: v for k, v in metrics.items() if v is not None}


def main():
    if not API_KEY:
        sys.exit("CENSUS_API_KEY is not set. Get a free key at "
                 "https://api.census.gov/data/key_signup.html and re-run as:\n"
                 "  CENSUS_API_KEY=xxxx python3 scripts/pull_census_demographics.py")

    zip_data_path = ROOT / "public" / "data" / "zip_data_full.json"
    zips = [r["zip"] for r in json.loads(zip_data_path.read_text())]
    print(f"Pulling ACS {YEAR} 5-Year estimates for {len(zips)} ZIPs...")

    results = {}
    skipped = []
    for batch in chunk(zips, ZCTA_BATCH_SIZE):
        small = fetch(list(SMALL_VARS.values()), batch)
        household = fetch(list(HOUSEHOLD_TYPE_VARS.values()), batch)
        age_sex = fetch(AGE_SEX_VARS, batch)

        for z in batch:
            small_row = {k: small.get(z, {}).get(v) for k, v in SMALL_VARS.items()} if z in small else {}
            household_row = {k: household.get(z, {}).get(v) for k, v in HOUSEHOLD_TYPE_VARS.items()} if z in household else {}
            age_row = age_sex.get(z, {})
            metrics = build_metrics(small_row, household_row, age_row)
            if metrics is None:
                skipped.append(z)
                continue
            results[z] = {"label": f"ZIP {z} (ACS {YEAR} 5-Year)", "metrics": metrics}

    out_path = ROOT / "data" / "source" / "demographics_full.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"Wrote {len(results)} ZIPs to {out_path}")
    if skipped:
        print(f"Skipped {len(skipped)} ZIPs with no ACS data (expected for PO-box/non-residential ZIPs): {skipped}")
    print("Now run: python3 scripts/build_data.py")


if __name__ == "__main__":
    main()
