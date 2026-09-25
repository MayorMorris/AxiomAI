const ATLANTA_CENTER = [33.85, -84.35];
const MILES_TO_METERS = 1609.34;

const METRIC_DEFS = {
  county: [
    { key: "veh_ytd_2026", label: "Vehicle Registrations YTD 2026 (Polk)", kind: "sequential" },
    { key: "wupa_total_avg_imp", label: "WUPA Total Avg News Impressions (P2+)", kind: "sequential" },
  ],
  zip: [
    { key: "veh_ytd_2026", label: "Vehicle Registrations YTD 2026", kind: "sequential" },
    { key: "yoy_delta", label: "YoY Registration Change", kind: "diverging" },
    { key: "wupa_avg_imp", label: "WUPA Avg News Impressions (P2+)", kind: "sequential" },
    { key: "wupa_tier", label: "WUPA Viewing Tier", kind: "categorical" },
  ],
};

const state = {
  map: null,
  dealersLayer: null,
  demographicsLayer: null,
  choroplethLayer: null,
  data: {},
};

async function loadData() {
  const [dealers, county, zip, demographics] = await Promise.all([
    fetch("data/dealers.geojson").then((r) => r.json()),
    fetch("data/county_choropleth.geojson").then((r) => r.json()),
    fetch("data/zip_choropleth.geojson").then((r) => r.json()),
    fetch("data/demographics.json").then((r) => r.json()),
  ]);
  return { dealers, county, zip, demographics };
}

function initMap() {
  const map = L.map("map", { zoomControl: true }).setView(ATLANTA_CENTER, 9);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
  }).addTo(map);
  return map;
}

function renderDetail(html) {
  document.querySelector("#detail-panel").innerHTML = `<h2>Details</h2>${html}`;
}

function fmtNum(n) {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-US");
}

function buildDealersLayer(dealersGeoJSON) {
  const group = L.layerGroup();
  for (const feature of dealersGeoJSON.features) {
    const [lon, lat] = feature.geometry.coordinates;
    const p = feature.properties;
    const radiusMiles = p.radius_miles || 8;

    L.circle([lat, lon], {
      radius: radiusMiles * MILES_TO_METERS,
      color: PALETTE.categorical.tier1,
      weight: 1,
      fillOpacity: 0.04,
      opacity: 0.5,
    }).addTo(group);

    const marker = L.circleMarker([lat, lon], {
      radius: 6,
      color: "#fff",
      weight: 1.5,
      fillColor: PALETTE.divergingBlueRed.positive[2],
      fillOpacity: 1,
    }).addTo(group);

    const yoy = p.yoy_delta;
    const yoyClass = yoy > 0 ? "delta-up" : yoy < 0 ? "delta-down" : "";
    const yoyStr = yoy === null || yoy === undefined ? "—" : `${yoy > 0 ? "+" : ""}${fmtNum(yoy)}`;

    const html = `
      <strong>${p.name}</strong><br>
      ${p.address}<br>
      YTD 2026: ${fmtNum(p.veh_ytd_2026)} &nbsp; YTD 2025: ${fmtNum(p.veh_ytd_2025)}<br>
      YoY: <span class="${yoyClass}">${yoyStr}</span><br>
      8-mi trade-area radius
    `;
    marker.bindPopup(html);
    marker.on("click", () => renderDetail(html));
  }
  return group;
}

function buildDemographicsLayer(zipGeoJSON, demographics) {
  const group = L.layerGroup();
  for (const zip of Object.keys(demographics)) {
    const feature = zipGeoJSON.features.find((f) => f.properties.zip === zip);
    if (!feature) continue;
    const layer = L.geoJSON(feature, {
      style: {
        color: PALETTE.categorical.tier2,
        weight: 2,
        fillColor: PALETTE.categorical.tier2,
        fillOpacity: 0.15,
        dashArray: "4 3",
      },
    }).addTo(group);
    const info = demographics[zip];
    const rows = Object.entries(info.metrics)
      .map(([k, v]) => `<tr><td>${k}</td><td>${typeof v === "number" ? fmtNum(v) : v}</td></tr>`)
      .join("");
    const html = `<strong>${info.label}</strong><table class="detail-table">${rows}</table>`;
    layer.bindPopup(`<strong>${info.label}</strong><br>Full ACS profile — click for details, or see sidebar.`);
    layer.on("click", () => renderDetail(html));
  }
  return group;
}

function legendForMetric(geo, metricDef, breaks, maxAbs) {
  const el = document.querySelector("#legend");
  if (!metricDef) {
    el.innerHTML = "";
    return;
  }
  let rows = "";
  if (metricDef.kind === "categorical") {
    rows = [
      ["Tier 1 (highest)", PALETTE.categorical.tier1],
      ["Tier 2", PALETTE.categorical.tier2],
      ["Tier 3", PALETTE.categorical.tier3],
      ["Not covered / no data", PALETTE.categorical.noData],
    ]
      .map(([label, color]) => `<div class="legend-row"><span class="swatch" style="background:${color}"></span>${label}</div>`)
      .join("");
  } else if (metricDef.kind === "diverging") {
    const steps = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];
    rows = steps
      .map((v) => `<div class="legend-row"><span class="swatch" style="background:${divergingColor(v, maxAbs)}"></span>${v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}</div>`)
      .join("");
  } else {
    const ramp = PALETTE.sequentialBlue;
    const edges = [0, ...breaks];
    rows = ramp
      .map((color, i) => {
        const lo = Math.round(edges[i] ?? edges[edges.length - 1]);
        const hi = breaks[i] !== undefined ? Math.round(breaks[i]) : null;
        const label = hi !== null ? `${lo.toLocaleString()}–${hi.toLocaleString()}` : `${lo.toLocaleString()}+`;
        return `<div class="legend-row"><span class="swatch" style="background:${color}"></span>${label}</div>`;
      })
      .join("");
  }
  el.innerHTML = `<div class="legend-title">${metricDef.label}</div>${rows}`;
}

function styleForFeature(metricDef, value, breaks, maxAbs) {
  let fillColor;
  if (!metricDef) {
    fillColor = PALETTE.categorical.noData;
  } else if (metricDef.kind === "sequential") {
    fillColor = sequentialColor(value, breaks);
  } else if (metricDef.kind === "diverging") {
    fillColor = divergingColor(value, maxAbs);
  } else {
    fillColor = tierColor(value);
  }
  return {
    fillColor,
    fillOpacity: 0.75,
    color: PALETTE.ink.secondary,
    weight: 0.6,
  };
}

function renderChoropleth() {
  const geo = document.querySelector("#select-geo").value;
  const metricKey = document.querySelector("#select-metric").value;

  if (state.choroplethLayer) {
    state.map.removeLayer(state.choroplethLayer);
    state.choroplethLayer = null;
  }

  if (geo === "none" || !metricKey) {
    legendForMetric(null);
    return;
  }

  const geojson = geo === "county" ? state.data.county : state.data.zip;
  const metricDef = METRIC_DEFS[geo].find((m) => m.key === metricKey);
  const values = geojson.features.map((f) => f.properties[metricKey]).filter((v) => typeof v === "number");
  const breaks = metricDef.kind === "sequential" ? quantileBreaks(values, PALETTE.sequentialBlue.length) : [];
  const maxAbs = metricDef.kind === "diverging" ? Math.max(...values.map((v) => Math.abs(v)), 1) : 0;

  const layer = L.geoJSON(geojson, {
    style: (feature) => styleForFeature(metricDef, feature.properties[metricKey], breaks, maxAbs),
    onEachFeature: (feature, lyr) => {
      const p = feature.properties;
      const name = geo === "county" ? `${p.county} County, ${p.state}` : `ZIP ${p.zip}`;
      const detailRows =
        geo === "county"
          ? `
            <tr><td>Vehicle Registrations YTD 2026</td><td>${fmtNum(p.veh_ytd_2026)}</td></tr>
            <tr><td>WUPA Total Avg News Impressions</td><td>${fmtNum(p.wupa_total_avg_imp)}</td></tr>
            <tr><td>ZIP codes mapped</td><td>${fmtNum(p.zip_count)}</td></tr>
          `
          : `
            <tr><td>Vehicle Registrations YTD 2026</td><td>${fmtNum(p.veh_ytd_2026)}</td></tr>
            <tr><td>Vehicle Registrations YTD 2025</td><td>${fmtNum(p.veh_ytd_2025)}</td></tr>
            <tr><td>YoY Delta</td><td>${fmtNum(p.yoy_delta)}</td></tr>
            <tr><td>WUPA Avg News Impressions</td><td>${fmtNum(p.wupa_avg_imp)}</td></tr>
            <tr><td>WUPA Viewing Tier</td><td>${p.wupa_tier || "—"}</td></tr>
            <tr><td>Leading Dealer</td><td>${p.leading_dealer || "—"}</td></tr>
          `;
      const html = `<strong>${name}</strong><table class="detail-table">${detailRows}</table>`;
      lyr.bindTooltip(name, { sticky: true });
      lyr.on("click", () => renderDetail(html));
    },
  }).addTo(state.map);

  state.choroplethLayer = layer;
  legendForMetric(geo, metricDef, breaks, maxAbs);

  // keep dealer markers clickable above the choropleth fill
  if (state.map.hasLayer(state.dealersLayer)) state.dealersLayer.eachLayer((l) => l.bringToFront && l.bringToFront());
}

function populateMetricSelect() {
  const geo = document.querySelector("#select-geo").value;
  const select = document.querySelector("#select-metric");
  select.innerHTML = "";
  if (geo === "none") {
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const m of METRIC_DEFS[geo]) {
    const opt = document.createElement("option");
    opt.value = m.key;
    opt.textContent = m.label;
    select.appendChild(opt);
  }
}

async function main() {
  const data = await loadData();
  state.data = data;
  state.map = initMap();

  state.dealersLayer = buildDealersLayer(data.dealers);
  state.dealersLayer.addTo(state.map);

  state.demographicsLayer = buildDemographicsLayer(data.zip, data.demographics);

  document.querySelector("#toggle-dealers").addEventListener("change", (e) => {
    if (e.target.checked) {
      state.dealersLayer.addTo(state.map);
      state.dealersLayer.eachLayer((l) => l.bringToFront && l.bringToFront());
    } else {
      state.map.removeLayer(state.dealersLayer);
    }
  });

  document.querySelector("#toggle-demographics").addEventListener("change", (e) => {
    if (e.target.checked) state.demographicsLayer.addTo(state.map);
    else state.map.removeLayer(state.demographicsLayer);
  });

  document.querySelector("#select-geo").addEventListener("change", () => {
    populateMetricSelect();
    renderChoropleth();
  });
  document.querySelector("#select-metric").addEventListener("change", renderChoropleth);

  populateMetricSelect();
  renderChoropleth();
}

main().catch((err) => {
  console.error(err);
  document.querySelector("#map").innerHTML = `<p style="padding:2rem;color:#b73837;">Failed to load map data: ${err.message}</p>`;
});
