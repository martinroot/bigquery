"use strict";

const one = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const number = new Intl.NumberFormat("en-US");
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const dayLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const percent = (value) => `${value.toFixed(1)}%`;
const dayName = (value) => dayLabel.format(new Date(`${value}T00:00:00Z`));
const devices = { all: "All devices", mobile: "Mobile", desktop: "Desktop" };
const stages = ["Visit", "Start signup", "Verify email", "Activated"];
const examples = {
  revenue: { title: "Revenue pulse", prompt: "Show revenue for the last 30 days.", id: 42, table: "product.daily_revenue", transform: "Order value and daily peak", chart: "DAILY REVENUE · USD" },
  funnel: { title: "Signup funnel", prompt: "Show signup funnel drop-off for the last 30 days.", id: 57, table: "product.signup_funnel_steps", transform: "Step conversion rates", chart: "STEP COMPLETION · UNIQUE USERS" },
  retention: { title: "Cohort retention", prompt: "Show cohort retention for the last 30 days.", id: 63, table: "product.weekly_retention", transform: "Weighted cohort return rates", chart: "WEEKLY RETENTION · % OF COHORT" },
};

const revenueCurve = [620, 570, 680, 655, 780, 720, 845, 820, 742, 885, 902, 852, 1010, 931, 1035, 1002, 1130, 1040, 1190, 1155, 1280, 1080, 1220, 1325, 1250, 1430, 1380, 1575, 1465, 1690];
const events = revenueCurve.flatMap((revenue, index) => {
  const date = new Date(Date.UTC(2026, 9, index + 2)).toISOString().slice(0, 10);
  const mobileRevenue = Math.round(revenue * (.57 + (index % 5) * .014));
  const visits = 440 + index * 14 + (index % 4) * 21;
  const mobileVisits = Math.round(visits * .65);
  const mobileStart = Math.round(mobileVisits * (.39 + (index % 3) * .025));
  const desktopStart = Math.round((visits - mobileVisits) * (.49 + (index % 3) * .015));
  const mobileVerify = Math.round(mobileStart * .57);
  const desktopVerify = Math.round(desktopStart * .78);
  return [
    { date, device: "mobile", revenue: mobileRevenue, orders: Math.round(mobileRevenue / (32 + index % 7)), funnel: [mobileVisits, mobileStart, mobileVerify, Math.round(mobileVerify * .76)] },
    { date, device: "desktop", revenue: revenue - mobileRevenue, orders: Math.round((revenue - mobileRevenue) / (46 + index % 5)), funnel: [visits - mobileVisits, desktopStart, desktopVerify, Math.round(desktopVerify * .83)] },
  ];
});
const cohortRows = [
  { date: "2026-10-05", mobile: [422, 217, 156, 125], desktop: [271, 174, 145, 114] },
  { date: "2026-10-12", mobile: [511, 283, 203, null], desktop: [310, 203, 160, null] },
  { date: "2026-10-19", mobile: [588, 336, null, null], desktop: [369, 245, null, null] },
  { date: "2026-10-26", mobile: [632, null, null, null], desktop: [402, null, null, null] },
];

const state = { preset: "funnel", days: 30, device: "all", view: "report" };

function rowsFor(days, device) {
  return events.slice(-days * 2).filter((row) => device === "all" || row.device === device);
}

function revenueReport(days, device) {
  const byDate = new Map();
  for (const { date, revenue, orders } of rowsFor(days, device)) {
    const daily = byDate.get(date) ?? { date, revenue: 0, orders: 0 };
    daily.revenue += revenue;
    daily.orders += orders;
    byDate.set(date, daily);
  }
  const points = [...byDate.values()];
  const totals = points.reduce((sum, point) => ({ revenue: sum.revenue + point.revenue, orders: sum.orders + point.orders }), { revenue: 0, orders: 0 });
  const peak = points.reduce((max, point) => point.revenue > max.revenue ? point : max);
  return {
    metrics: [["Revenue", money.format(totals.revenue)], ["Orders", number.format(totals.orders)], ["Avg. order", price.format(totals.revenue / totals.orders)]],
    insight: `Revenue peaked at ${money.format(peak.revenue)} on ${dayName(peak.date)}.`,
    columns: ["date", "revenue_usd", "orders"],
    rows: points.map(({ date, revenue, orders }) => [date, revenue, orders]),
    points,
  };
}

function funnelReport(days, device) {
  const totals = rowsFor(days, device).reduce((sum, row) => sum.map((value, i) => value + row.funnel[i]), [0, 0, 0, 0]);
  const rates = totals.map((value) => value / totals[0] * 100);
  const drops = totals.slice(1).map((value, i) => (1 - value / totals[i]) * 100);
  const bottleneck = drops.indexOf(Math.max(...drops));
  return {
    metrics: [["Visitors", number.format(totals[0])], ["Activated", number.format(totals.at(-1))], ["Activation rate", percent(rates.at(-1))]],
    insight: `${percent(drops[bottleneck])} of users drop off between ${stages[bottleneck].toLowerCase()} and ${stages[bottleneck + 1].toLowerCase()}, the steepest step in this window.`,
    columns: ["stage", "users", "share_of_visitors_pct", "step_drop_off_pct"],
    rows: stages.map((stage, i) => [stage, totals[i], rates[i].toFixed(2), i ? drops[i - 1].toFixed(2) : ""]),
    totals,
    rates,
  };
}

function retentionReport(days, device) {
  const startDate = events.at(-days * 2).date;
  const cohorts = cohortRows.filter(({ date }) => date >= startDate).map(({ date, mobile, desktop }) => ({
    date,
    active: device === "all" ? mobile.map((value, i) => value === null ? null : value + desktop[i]) : device === "mobile" ? mobile : desktop,
  }));
  const weekOne = cohorts.filter(({ active }) => active[1] !== null);
  const count = (rows, week) => rows.reduce((sum, row) => sum + row.active[week], 0);
  const rate = weekOne.length ? percent(count(weekOne, 1) / count(weekOne, 0) * 100) : "Pending";
  return {
    metrics: [["Cohorts", number.format(cohorts.length)], ["New users", number.format(count(cohorts, 0))], ["Week 1 retention", rate]],
    insight: weekOne.length ? `Week 1 retention is ${rate}, weighted by signup count across cohorts with a completed first week.` : "This cohort is still in its first week. Return rates appear once the following week is complete.",
    columns: ["cohort_start", "signups", "week_0_pct", "week_1_pct", "week_2_pct", "week_3_pct"],
    rows: cohorts.map(({ date, active }) => [date, active[0], ...active.map((value) => value === null ? "" : (value / active[0] * 100).toFixed(2))]),
    cohorts,
  };
}

const makeReport = { revenue: revenueReport, funnel: funnelReport, retention: retentionReport };

function metrics(items) {
  return items.map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function lineChart(points) {
  const width = 570;
  const height = 165;
  const left = 47;
  const right = 554;
  const top = 21;
  const bottom = height - 23;
  const peak = Math.max(...points.map((point) => point.revenue));
  const step = Math.ceil(peak / 400) * 100;
  const maximum = step * 4;
  const x = (index) => left + index * (right - left) / (points.length - 1);
  const y = (value) => bottom - value / maximum * (bottom - top);
  const coordinates = points.map(({ revenue }, index) => `${x(index).toFixed(2)} ${y(revenue).toFixed(2)}`);
  const line = `M ${coordinates.join(" L ")}`;
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = i * step;
    return `<line class="grid" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 7}" y="${y(value) + 3}" text-anchor="end">${money.format(value)}</text>`;
  }).join("");
  const dates = Array.from({ length: 4 }, (_, i) => {
    const index = Math.round(i * (points.length - 1) / 3);
    return `<text x="${x(index)}" y="${height - 5}" text-anchor="${i === 0 ? "start" : i === 3 ? "end" : "middle"}">${dayName(points[index].date)}</text>`;
  }).join("");
  const last = points.at(-1);
  const lastY = y(last.revenue);
  const markerY = Math.max(1, lastY - 25);
  const marker = `<circle class="dot" cx="${right}" cy="${lastY}" r="4"/><rect class="tip-bg" x="${right - 61}" y="${markerY}" width="58" height="19" rx="3"/><text class="tip" x="${right - 32}" y="${markerY + 13}" text-anchor="middle">${money.format(last.revenue)}</text>`;
  return `<svg class="chart-svg studio-line" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="revenue-chart-title"><title id="revenue-chart-title">Daily revenue, ${dayName(points[0].date)} through ${dayName(last.date)}. Last day ${money.format(last.revenue)}.</title><defs><linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#a5d181" stop-opacity=".69"/><stop offset="1" stop-color="#527348" stop-opacity=".16"/></linearGradient></defs>${grid}<path d="${line} L ${right} ${bottom} L ${left} ${bottom} Z" fill="url(#revenue-fill)"/><path class="series" d="${line}"/>${marker}${dates}</svg>`;
}

function funnelChart({ totals, rates }) {
  return `<div class="funnel-rows">${stages.map((stage, i) => `<div class="funnel-row"><span>${stage}</span><div class="bar-track" aria-hidden="true"><span style="width:${rates[i]}%"></span></div><strong>${number.format(totals[i])}</strong><small>${percent(rates[i])}</small></div>`).join("")}</div>`;
}

function retentionChart({ cohorts }) {
  const header = `<div role="row"><span role="columnheader">Cohort</span>${[0, 1, 2, 3].map((week) => `<span role="columnheader">W${week}</span>`).join("")}</div>`;
  const rows = cohorts.map(({ date, active }) => {
    const cells = active.map((count) => {
      if (count === null) return '<span role="cell" aria-label="Incomplete week">—</span>';
      const rate = count / active[0] * 100;
      return `<span role="cell" style="background:hsl(88 46% ${40 + rate * .45}%);color:#1b2b1e">${Math.round(rate)}%</span>`;
    });
    return `<div role="row"><span role="rowheader">${dayName(date)}</span>${cells.join("")}</div>`;
  }).join("");
  return `<div class="heat" role="table" aria-label="Weekly cohort retention">${header}${rows}</div>`;
}

const chartFor = { revenue: (report) => lineChart(report.points), funnel: funnelChart, retention: retentionChart };

const queries = {
  revenue: `SELECT event_date, SUM(revenue_usd) AS revenue_usd,
       SUM(order_count) AS orders
FROM \`product.daily_revenue\`
WHERE event_date BETWEEN {{start_date}} AND {{end_date}}
  [[AND device = {{device}}]]
GROUP BY event_date
ORDER BY event_date;`,
  funnel: `SELECT stage, stage_order, COUNT(DISTINCT user_id) AS users
FROM \`product.signup_funnel_steps\`
WHERE entry_date BETWEEN {{start_date}} AND {{end_date}}
  AND event_date <= {{end_date}}
  [[AND device = {{device}}]]
GROUP BY stage, stage_order
ORDER BY stage_order;`,
  retention: `SELECT cohort_week, week_offset, SUM(active_users) AS active_users,
       SUM(cohort_size) AS cohort_size
FROM \`product.weekly_retention\`
WHERE cohort_week BETWEEN {{start_date}} AND {{end_date}}
  AND week_offset BETWEEN 0 AND 3
  AND (week_offset = 0 OR week_closed_on <= {{end_date}})
  [[AND device = {{device}}]]
GROUP BY cohort_week, week_offset
ORDER BY cohort_week, week_offset;`,
};
const python = {
  revenue: `def build_report(rows):
    revenue = sum(row["revenue_usd"] for row in rows)
    orders = sum(row["orders"] for row in rows)
    return {
        "revenue": revenue,
        "orders": orders,
        "average_order": revenue / orders if orders else None,
        "peak": max(rows, key=lambda row: row["revenue_usd"], default=None),
        "chart": {"type": "line", "x": "event_date", "y": "revenue_usd"},
    }`,
  funnel: `def build_report(rows):
    entrants = rows[0]["users"] if rows else 0
    steps = []
    for i, row in enumerate(rows):
        users = row["users"]
        previous = rows[i - 1]["users"] if i else None
        steps.append({
            "stage": row["stage"],
            "users": users,
            "share_pct": 100 * users / entrants if entrants else None,
            "drop_off_pct": 100 * (1 - users / previous) if previous else None,
        })
    return {"chart": {"type": "funnel", "rows": steps}}`,
  retention: `def build_report(rows):
    cells = []
    for row in rows:
        signups = row["cohort_size"]
        cells.append({
            "cohort": row["cohort_week"],
            "week": row["week_offset"],
            "retention_pct": 100 * row["active_users"] / signups if signups else None,
        })
    week_one = [row for row in rows if row["week_offset"] == 1]
    observed = sum(row["cohort_size"] for row in week_one)
    returned = sum(row["active_users"] for row in week_one)
    return {
        "week_1_pct": 100 * returned / observed if observed else None,
        "chart": {"type": "heatmap", "cells": cells},
    }`,
};

function filterButtons() {
  const periods = [7, 30].map((days) => `<button type="button" data-days="${days}" aria-pressed="${days === state.days}">${days}D</button>`);
  const segments = Object.entries(devices).map(([id, name]) => `<button type="button" data-device="${id}" aria-pressed="${id === state.device}">${name}</button>`);
  return `<div class="filters" aria-label="Report filters">${periods.concat(segments).join("")}</div>`;
}

function renderStudio(announce = false) {
  const example = examples[state.preset];
  const report = makeReport[state.preset](state.days, state.device);
  const output = one("#studio-output");
  one("#lineage-table").textContent = example.table;
  one("#lineage-question").textContent = `Saved question #${example.id}`;
  one("#lineage-python").textContent = example.transform;
  all("[data-preset]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.preset === state.preset));
  all("[data-view]").forEach((button) => button.setAttribute("aria-pressed", button.dataset.view === state.view));
  if (state.view === "report") {
    output.innerHTML = `<div class="output-head"><div><div class="tiny">PRODUCT ANALYTICS</div><h3>${example.title}</h3></div>${filterButtons()}</div>
      <div class="output-metrics">${metrics(report.metrics)}</div>
      <div class="output-chart"><div class="tiny">${example.chart}</div>${chartFor[state.preset](report)}</div>
      <div class="insight"><b>Finding</b><span>${report.insight}</span></div>`;
  } else {
    const start = events.at(-state.days * 2).date;
    const end = events.at(-1).date;
    const isSql = state.view === "sql";
    const title = isSql ? `Metabase question #${example.id}` : "Python post-processing";
    const description = isSql
      ? `Parameters · ${start} to ${end} · ${devices[state.device]}. The device filter is optional.`
      : `Example transformation for ${example.title.toLowerCase()}. The portal would run it on the rows from question #${example.id}.`;
    output.innerHTML = `<div class="tiny">REPORT TRACE / EXAMPLE CODE</div><h3 class="trace-title">${title}</h3><p class="trace-text">${description}</p><pre class="trace-code" tabindex="0"><code></code></pre>`;
    output.querySelector("code").textContent = isSql ? queries[state.preset] : python[state.preset];
  }
  if (announce) one("#studio-status").textContent = `${example.title}, last ${state.days} days, ${devices[state.device]}.`;
}

function questionForState() {
  const segment = state.device === "all" ? "" : ` for ${state.device}`;
  return `Show ${state.preset === "revenue" ? "revenue" : state.preset === "funnel" ? "signup funnel" : "cohort retention"}${segment} for the last ${state.days} days.`;
}

function clearPromptError() {
  one("#question").removeAttribute("aria-invalid");
  const hint = one("#prompt-hint");
  hint.classList.remove("error");
  hint.textContent = "Try “mobile signup funnel, last 7 days.”";
}

function parseQuestion(prompt) {
  const presets = [
    ["revenue", /\b(revenue|sales|orders?)\b/i],
    ["funnel", /\b(funnel|onboarding|signup|activation|drop[- ]?off)\b/i],
    ["retention", /\b(retention|cohorts?|return rates?)\b/i],
  ].filter(([, pattern]) => pattern.test(prompt));
  const specifiedDays = [...prompt.matchAll(/\b(\d+)\s*(?:[- ]\s*)?(?:days?\b|d\b)/gi)].map((match) => Number(match[1]));
  const deviceOptions = Object.keys(devices).filter((device) => new RegExp(`\\b${device}\\b`, "i").test(prompt));
  if (presets.length !== 1 || specifiedDays.some((day) => day !== 7 && day !== 30) || new Set(specifiedDays).size > 1 || deviceOptions.length > 1) return null;
  return { preset: presets[0][0], days: specifiedDays[0] ?? 30, device: deviceOptions[0] ?? "all", view: "report" };
}

all("[data-preset]").forEach((button) => button.addEventListener("click", () => {
  Object.assign(state, { preset: button.dataset.preset, days: 30, device: "all", view: "report" });
  one("#question").value = examples[state.preset].prompt;
  clearPromptError();
  renderStudio(true);
}));

all("[data-view]").forEach((button) => button.addEventListener("click", () => {
  state.view = button.dataset.view;
  renderStudio();
}));

one("#studio-output").addEventListener("click", (event) => {
  const button = event.target.closest("[data-days], [data-device]");
  if (!button) return;
  if (button.dataset.days) state.days = Number(button.dataset.days);
  if (button.dataset.device) state.device = button.dataset.device;
  one("#question").value = questionForState();
  clearPromptError();
  renderStudio(true);
  const replacement = button.dataset.days ? `[data-days="${state.days}"]` : `[data-device="${state.device}"]`;
  one(replacement).focus({ preventScroll: true });
});

one("#prompt-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = one("#question");
  const parsed = parseQuestion(input.value);
  if (!parsed) {
    const hint = one("#prompt-hint");
    hint.textContent = "Choose one report type, 7 or 30 days, and at most one device.";
    hint.classList.add("error");
    input.setAttribute("aria-invalid", "true");
    one("#studio-status").textContent = hint.textContent;
    input.focus();
    return;
  }
  Object.assign(state, parsed);
  clearPromptError();
  renderStudio(true);
});
one("#question").addEventListener("input", clearPromptError);

one("#export").addEventListener("click", () => {
  const { columns, rows } = makeReport[state.preset](state.days, state.device);
  const csv = [columns, ...rows].map((row) => row.join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv, "\r\n"], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `bigquery-live-${state.preset}-${state.days}d-${state.device}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  one("#studio-status").textContent = "CSV download started.";
});

one("#copy-config").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const config = one("#config");
  try {
    await navigator.clipboard.writeText(config.textContent.trim());
    button.textContent = "Copied";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(config);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    button.textContent = "Selected · copy";
  }
});

renderStudio();
