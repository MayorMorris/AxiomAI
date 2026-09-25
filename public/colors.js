// Palette from the org dataviz standard (references/palette.md), validated with
// scripts/validate_palette.js. Sequential = one hue, light->dark. Diverging =
// two hues + neutral gray midpoint. Categorical hues used in fixed slot order.

const PALETTE = {
  sequentialBlue: [
    "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#104281",
  ],
  divergingBlueRed: {
    // both arms ordered weak -> strong, indexed by |value| / maxAbs
    negative: ["#9ec5f4", "#5598e7", "#256abf", "#184f95", "#0d366b"],
    midpoint: "#f0efec",
    positive: ["#f6c9c8", "#ec8f8d", "#e34948", "#b73837", "#8a2827"],
  },
  categorical: {
    tier1: "#2a78d6", // slot 1 blue
    tier2: "#eb6834", // slot 2 orange
    tier3: "#1baf7a", // slot 3 aqua
    noData: "#c3c2b7", // muted / baseline gray -- "not covered", not a data series
  },
  ink: {
    primary: "#0b0b0b",
    secondary: "#52514e",
    muted: "#898781",
    gridline: "#e1e0d9",
  },
  surface: "#fcfcfb",
};

// Quantile breakpoints for a sequential/diverging ramp over a numeric array.
function quantileBreaks(values, n) {
  const sorted = [...values].filter((v) => v !== null && v !== undefined && !Number.isNaN(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const breaks = [];
  for (let i = 1; i < n; i++) {
    const idx = Math.floor((i / n) * (sorted.length - 1));
    breaks.push(sorted[idx]);
  }
  return breaks;
}

// breaks has (ramp.length - 1) entries; value <= breaks[i] falls in bucket i
function sequentialColor(value, breaks) {
  if (value === null || value === undefined || Number.isNaN(value)) return PALETTE.categorical.noData;
  const ramp = PALETTE.sequentialBlue;
  let i = 0;
  while (i < breaks.length && value > breaks[i]) i++;
  return ramp[Math.min(i, ramp.length - 1)];
}

function divergingColor(value, maxAbs) {
  if (value === null || value === undefined || Number.isNaN(value)) return PALETTE.categorical.noData;
  if (value === 0 || maxAbs === 0) return PALETTE.divergingBlueRed.midpoint;
  const ramp = value < 0 ? PALETTE.divergingBlueRed.negative : PALETTE.divergingBlueRed.positive;
  const frac = Math.min(Math.abs(value) / maxAbs, 1);
  const idx = Math.min(ramp.length - 1, Math.floor(frac * ramp.length));
  return ramp[idx];
}

function tierColor(tier) {
  if (!tier) return PALETTE.categorical.noData;
  if (tier.startsWith("Tier 1")) return PALETTE.categorical.tier1;
  if (tier.startsWith("Tier 2")) return PALETTE.categorical.tier2;
  if (tier.startsWith("Tier 3")) return PALETTE.categorical.tier3;
  return PALETTE.categorical.noData; // "Not covered by Nielsen sample"
}
