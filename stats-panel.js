// ===================== Stats tab (side panel) =====================
// Draws what stats-reader.js saved from your Depop Selling Hub:
//   - shop views and clicks over time, split into boosted and not boosted
//   - what boosting costs per click
//   - every listing's views, likes and clicks, and which ones have gone quiet
// Nothing here talks to Depop. It only reads chrome.storage.local.
// Load after panel.js (uses h, $, state, save, render).

const STATS_KEY = 'depopStats';
const DAY_MS = 864e5;
const STALE = { minAge: 7, maxPerDay: 2 }; // 7+ days old, under 2 new views a day, no likes

const statsUI = { sort: 'stale', show: 25 };

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY_MS);
const fmt = (n, d = 0) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
const pctTxt = (n) => (n == null || isNaN(n) ? '–' : (n * 100).toFixed(1) + '%');
const money = (n) => (n == null || isNaN(n) ? '–' : '$' + Number(n).toFixed(2));

async function loadStats() {
  const s = await chrome.storage.local.get(STATS_KEY);
  const db = s[STATS_KEY] || {};
  return { shop: db.shop || {}, items: db.items || {}, lastFullScan: db.lastFullScan || '' };
}
async function saveStats(fn) {
  const s = await chrome.storage.local.get(STATS_KEY);
  const db = s[STATS_KEY] || { shop: {}, items: {} };
  fn(db);
  await chrome.storage.local.set({ [STATS_KEY]: db });
}

// Shop snapshot -> boosted / not boosted split. Depop gives "% from boosting".
function splitShop(s) {
  if (!s || s.views7 == null) return null;
  const bv = s.views7 * s.viewsBoostShare / 100, bc = s.clicks7 * s.clicksBoostShare / 100;
  const ov = s.views7 - bv, oc = s.clicks7 - bc;
  return {
    boosted: { views: bv, clicks: bc, ctr: bv ? bc / bv : null },
    organic: { views: ov, clicks: oc, ctr: ov ? oc / ov : null },
    all: { views: s.views7, clicks: s.clicks7, ctr: s.views7 ? s.clicks7 / s.views7 : null },
    costPerClick: s.boostFees7 != null && bc ? s.boostFees7 / bc : null,
  };
}

// One listing: latest numbers, new views per day, and whether it has gone quiet.
function itemSummary(it, todayKey) {
  const days = Object.keys(it.days || {}).sort();
  const last = days.length ? it.days[days[days.length - 1]] : null;
  const since = it.listed || it.firstSeen;
  const age = since ? Math.max(0, daysBetween(since, todayKey)) : null;
  let perDay = null, perDayFrom = '';
  // Prefer the change between your last two snapshots; else the average since listing.
  if (days.length >= 2) {
    const a = days[days.length - 2], b = days[days.length - 1];
    perDay = (it.days[b].views - it.days[a].views) / Math.max(1, daysBetween(a, b));
    perDayFrom = 'since ' + a.slice(5);
  } else if (last && age != null) {
    perDay = last.views / Math.max(1, age);
    perDayFrom = 'average';
  }
  const boostedViews = last && last.viewsBoost ? last.views * last.viewsBoost / (100 + last.viewsBoost) : 0;
  const stale = it.status === 'active' && age != null && age >= STALE.minAge &&
    perDay != null && perDay < STALE.maxPerDay && last && !last.likes;
  return { days, last, age, perDay, perDayFrom, boostedViews, stale, ctr: last && last.views ? last.clicks / last.views : null };
}

// ---------- tiny SVG charts ----------
const SVGNS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}
// series: [{ name, color, values: [number|null] }], labels: x labels
function lineChart(labels, series, opts = {}) {
  const W = 300, H = opts.height || 110, L = 34, R = 6, T = 8, B = 18;
  const vals = series.flatMap((s) => s.values).filter((v) => v != null);
  const max = (Math.max(0, ...vals) || 1) * 1.1; // works for click rates (0.03) and views (30,000)
  const x = (i) => L + (labels.length < 2 ? (W - L - R) / 2 : i * (W - L - R) / (labels.length - 1));
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': opts.label || 'chart' });
  for (const f of [0, 0.5, 1]) {
    el.append(svg('line', { x1: L, x2: W - R, y1: y(max / 1.1 * f), y2: y(max / 1.1 * f), class: 'grid' }));
    const t = svg('text', { x: L - 4, y: y(max / 1.1 * f) + 3, class: 'axis', 'text-anchor': 'end' });
    t.textContent = opts.yfmt ? opts.yfmt(max / 1.1 * f) : fmt(max / 1.1 * f);
    el.append(t);
  }
  labels.forEach((lab, i) => {
    if (labels.length > 2 && i !== 0 && i !== labels.length - 1) return;
    const t = svg('text', { x: x(i), y: H - 4, class: 'axis', 'text-anchor': i === 0 ? 'start' : 'end' });
    t.textContent = lab;
    el.append(t);
  });
  for (const s of series) {
    const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
    if (pts.length > 1) el.append(svg('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    for (const p of pts) el.append(svg('circle', { cx: p[0], cy: p[1], r: 2.5, fill: s.color }));
  }
  return el;
}
function sparkline(values) {
  const W = 70, H = 20;
  const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark' });
  const v = values.filter((n) => n != null);
  if (v.length < 2) return el;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((n, i) => `${(i * (W - 2) / (v.length - 1) + 1).toFixed(1)},${(H - 2 - (n - min) / span * (H - 4)).toFixed(1)}`);
  el.append(svg('polyline', { points: pts.join(' '), fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
  return el;
}
const legend = (series) => h('div', { class: 'legend' }, series.map((s) =>
  h('span', {}, h('i', { style: `background:${s.color}` }), s.name)));

// ---------- the tab ----------
function renderStats(c) {
  const box = h('div', {}, h('div', { class: 'empty' }, 'Loading stats…'));
  c.append(box);
  loadStats().then((db) => box.replaceWith(statsView(db)));
}

function openDepop(path) {
  chrome.tabs.create({ url: 'https://www.depop.com' + path });
}

function statsView(db) {
  const wrap = h('div', {});
  const todayKey = dayKey();
  const shopDays = Object.keys(db.shop).sort();
  const withViews = shopDays.filter((d) => db.shop[d].views7 != null);
  const latestShop = withViews.length ? db.shop[withViews[withViews.length - 1]] : null;
  const items = Object.entries(db.items).map(([id, it]) => ({ id, it, s: itemSummary(it, todayKey) }));
  const active = items.filter((x) => x.it.status === 'active');
  const savedToday = items.filter((x) => x.it.days && x.it.days[todayKey]).length;
  const activeToday = db.shop[todayKey] && db.shop[todayKey].active;

  // 1. Today
  const shopDone = !!(db.shop[todayKey] && db.shop[todayKey].views7 != null);
  const listDone = activeToday != null && savedToday >= activeToday;
  wrap.append(h('div', { class: 'card' },
    h('h3', {}, 'Today'),
    h('div', { class: 'checks' },
      h('div', { class: shopDone ? 'ok' : '' }, shopDone ? '✓ ' : '○ ', 'Shop stats', shopDone ? '' : ' — open Depop Stats'),
      h('div', { class: listDone ? 'ok' : '' }, listDone ? '✓ ' : '○ ',
        `Listings: ${savedToday}${activeToday != null ? ' of ' + activeToday : ''} saved`,
        listDone ? '' : ' — open Selling and scroll to the bottom')),
    h('div', { class: 'toolbar' },
      h('button', { onclick: () => openDepop('/sellinghub/stats/') }, 'Open Depop Stats'),
      h('button', { onclick: () => openDepop('/sellinghub/selling/active/') }, 'Open Selling'),
      h('button', { onclick: () => openDepop('/sellinghub/sold-items/') }, 'Open Sold')),
    h('div', { class: 'note' }, 'Numbers are saved only when you open these pages yourself. The extension sends nothing to Depop and nothing leaves this browser. Once a day is enough.'),
    noteRow(db, todayKey),
    reminderToggle()));

  if (!withViews.length && !items.length) {
    wrap.append(h('div', { class: 'empty' }, 'No stats yet. Open Depop Stats and your Selling list (buttons above), then come back here.'));
    return wrap;
  }

  // 2. Boosting vs not boosted
  if (latestShop) wrap.append(boostCard(db, withViews, latestShop));

  // 3. Listings
  wrap.append(listingsCard(items, active, todayKey, db));

  // 4. Export
  wrap.append(h('div', { class: 'card' },
    h('h3', {}, 'Your data'),
    h('div', { class: 'toolbar' },
      h('button', { onclick: () => downloadText('depop-listing-stats.csv', itemsCsv(db), 'text/csv') }, 'Listings CSV'),
      h('button', { onclick: () => downloadText('depop-shop-stats.csv', shopCsv(db), 'text/csv') }, 'Shop CSV'),
      h('button', { onclick: () => downloadText('depop-stats-backup.json', JSON.stringify(db, null, 1), 'application/json') }, 'Backup (JSON)')),
    h('div', { class: 'note' }, `${withViews.length} shop snapshot(s), ${items.length} listing(s) saved. Kept only in this browser.`)));
  return wrap;
}

function noteRow(db, todayKey) {
  const input = h('input', { type: 'text', placeholder: 'Note for today, e.g. "listed 20 items" or "boost off"', value: (db.shop[todayKey] && db.shop[todayKey].note) || '' });
  input.addEventListener('change', () => saveStats((d) => {
    d.shop = d.shop || {};
    d.shop[todayKey] = { ...(d.shop[todayKey] || {}), note: input.value.trim() };
  }));
  return h('div', { style: 'margin-top:8px' }, input);
}

function reminderToggle() {
  const cb = h('input', { type: 'checkbox' });
  chrome.storage.local.get('statsReminder').then((s) => { cb.checked = s.statsReminder !== false; });
  cb.addEventListener('change', () => chrome.storage.local.set({ statsReminder: cb.checked }));
  return h('label', { class: 'auto', style: 'margin-top:6px' }, cb, 'Show "!" on the toolbar icon until today’s stats are saved');
}

function boostCard(db, days, latest) {
  const sp = splitShop(latest);
  const better = sp.organic.ctr != null && sp.boosted.ctr != null
    ? (sp.boosted.ctr >= sp.organic.ctr
      ? 'Boosted viewers click as often as everyone else. Boosting is bringing interested buyers.'
      : `Boosted viewers click ${(sp.organic.ctr / sp.boosted.ctr).toFixed(1)}× less than everyone else. Boosting buys views, but many of them scroll past.`)
    : '';
  const recent = days.slice(-30);
  const series = [
    { name: 'Not boosted', color: 'var(--accent)', values: recent.map((d) => splitShop(db.shop[d]).organic.views) },
    { name: 'Boosted', color: 'var(--depop)', values: recent.map((d) => splitShop(db.shop[d]).boosted.views) },
  ];
  const ctrSeries = [
    { name: 'Not boosted', color: 'var(--accent)', values: recent.map((d) => splitShop(db.shop[d]).organic.ctr) },
    { name: 'Boosted', color: 'var(--depop)', values: recent.map((d) => splitShop(db.shop[d]).boosted.ctr) },
  ];
  const labels = recent.map((d) => d.slice(5));
  const notes = recent.filter((d) => db.shop[d].note).map((d) => h('div', {}, h('b', {}, d.slice(5) + ': '), db.shop[d].note));

  return h('div', { class: 'card' },
    h('h3', {}, 'Boosted vs not boosted', h('span', { class: 'count' }, 'last 7 days')),
    h('table', { class: 'stat' },
      h('tr', {}, h('th', {}, ''), h('th', {}, 'Views'), h('th', {}, 'Clicks'), h('th', {}, 'Click rate')),
      h('tr', {}, h('td', {}, 'Not boosted'), h('td', {}, fmt(sp.organic.views)), h('td', {}, fmt(sp.organic.clicks)), h('td', {}, pctTxt(sp.organic.ctr))),
      h('tr', {}, h('td', {}, 'Boosted'), h('td', {}, fmt(sp.boosted.views)), h('td', {}, fmt(sp.boosted.clicks)), h('td', {}, pctTxt(sp.boosted.ctr))),
      h('tr', { class: 'total' }, h('td', {}, 'All'), h('td', {}, fmt(sp.all.views)), h('td', {}, fmt(sp.all.clicks)), h('td', {}, pctTxt(sp.all.ctr)))),
    h('div', { class: 'kv' },
      h('div', {}, 'Boosting fees (7 days)', h('b', {}, money(latest.boostFees7))),
      h('div', {}, 'Cost per boosted click', h('b', {}, money(sp.costPerClick))),
      h('div', {}, 'Sales from boosting (all time)', h('b', {}, fmt(latest.boostSalesAll)))),
    better ? h('div', { class: 'notes' }, better) : null,
    recent.length > 1 ? [
      h('div', { class: 'chart-title' }, 'Views in the 7 days before each snapshot'),
      lineChart(labels, series, { label: 'Views over time' }), legend(series),
      h('div', { class: 'chart-title' }, 'Click rate'),
      lineChart(labels, ctrSeries, { label: 'Click rate over time', height: 90, yfmt: (v) => (v * 100).toFixed(1) + '%' }),
    ] : h('div', { class: 'note' }, 'Open Depop Stats on another day to start the chart. Each point is Depop\'s 7-day total on that day.'),
    notes.length ? h('div', { class: 'note' }, notes) : null,
    h('div', { class: 'note' }, 'Split uses Depop\'s "% from boosting". Boosting fees come from Revenue breakdown (last 7 days).'));
}

function listingsCard(items, active, todayKey, db) {
  const sorters = {
    stale: (a, b) => (b.s.stale - a.s.stale) || ((a.s.perDay ?? 1e9) - (b.s.perDay ?? 1e9)),
    views: (a, b) => ((b.s.last && b.s.last.views) || 0) - ((a.s.last && a.s.last.views) || 0),
    ctr: (a, b) => (b.s.ctr || 0) - (a.s.ctr || 0),
    newest: (a, b) => (b.it.listed || b.it.firstSeen || '').localeCompare(a.it.listed || a.it.firstSeen || ''),
  };
  const list = active.slice().sort(sorters[statsUI.sort] || sorters.stale);
  const stale = active.filter((x) => x.s.stale).length;
  const sold = items.filter((x) => x.it.status === 'sold');
  const gone = items.filter((x) => x.it.status === 'gone');

  const sel = h('select', {},
    [['stale', 'Quiet first'], ['views', 'Most views'], ['ctr', 'Best click rate'], ['newest', 'Newest']]
      .map(([v, t]) => h('option', { value: v, selected: statsUI.sort === v }, t)));
  sel.addEventListener('change', () => { statsUI.sort = sel.value; render(); });

  const rows = list.slice(0, statsUI.show).map(({ it, s }) => {
    const views = Object.keys(it.days || {}).sort().map((d) => it.days[d].views);
    const l = s.last || {};
    return h('a', { class: 'lrow' + (s.stale ? ' stale' : ''), href: 'https://www.depop.com' + it.href, target: '_blank', title: it.title },
      it.img ? h('img', { src: it.img, alt: '' }) : h('span', { class: 'noimg' }),
      h('div', { class: 'lmain' },
        h('div', { class: 'ltitle' }, it.title || it.href),
        h('div', { class: 'lnums' },
          h('span', { title: 'Views (all time)' }, '👁 ' + fmt(l.views)),
          h('span', { title: 'Clicks' }, '↗ ' + fmt(l.clicks)),
          h('span', { title: 'Likes' }, '♡ ' + fmt(l.likes)),
          l.bags ? h('span', { title: 'In bags' }, '🛍 ' + fmt(l.bags)) : null,
          l.offers ? h('span', { title: 'Offers' }, '$ ' + fmt(l.offers)) : null,
          h('span', { title: 'Click rate' }, pctTxt(s.ctr))),
        h('div', { class: 'lmeta' },
          s.age != null ? `${s.age}d old · ` : '',
          s.perDay != null ? `${fmt(s.perDay, 1)} views/day (${s.perDayFrom})` : '',
          s.boostedViews ? ` · ≈${fmt(s.boostedViews)} from boost` : '',
          s.stale ? h('b', {}, ' · quiet: refresh or relist?') : '')),
      sparkline(views));
  });

  return h('div', { class: 'card' },
    h('h3', {}, `Listings (${active.length} active)`, sel),
    stale ? h('div', { class: 'tip warn' }, `${stale} listing(s) are ${STALE.minAge}+ days old, getting under ${STALE.maxPerDay} new views a day and have no likes. Try new photos, a lower price, or a refresh (Edit → Save). Do it yourself, one at a time.`) : null,
    rows.length ? rows : h('div', { class: 'note' }, 'Open Selling on Depop and scroll to the bottom to save your listings.'),
    list.length > statsUI.show ? h('button', { class: 'small', onclick: () => { statsUI.show += 25; render(); } }, `Show more (${list.length - statsUI.show})`) : null,
    sold.length || gone.length ? h('div', { class: 'note' },
      sold.length ? `Sold since tracking: ${sold.length}. ` : '',
      gone.length ? `Left your Active list: ${gone.length} (open Sold to tell sold from removed).` : '') : null,
    h('div', { class: 'note' }, '"Views/day" compares your last two snapshots. "From boost" is estimated from Depop\'s "increase in views from boosting".'));
}

// ---------- export ----------
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function itemsCsv(db) {
  const out = [['date', 'listing', 'title', 'sku', 'price', 'listed', 'status', 'views', 'views_boost_increase_pct', 'clicks', 'clicks_boost_increase_pct', 'likes', 'bags', 'offers']];
  for (const [id, it] of Object.entries(db.items || {})) {
    for (const d of Object.keys(it.days || {}).sort()) {
      const s = it.days[d];
      out.push([d, id, it.title, it.sku, it.price, it.listed, it.status, s.views, s.viewsBoost, s.clicks, s.clicksBoost, s.likes, s.bags, s.offers]);
    }
  }
  return out.map((r) => r.map(csvCell).join(',')).join('\n');
}
function shopCsv(db) {
  const out = [['date', 'views_7d', 'views_from_boost_pct', 'clicks_7d', 'clicks_from_boost_pct', 'boost_fees_7d', 'boost_sales_all_time', 'potential_revenue', 'active', 'note']];
  for (const d of Object.keys(db.shop || {}).sort()) {
    const s = db.shop[d];
    out.push([d, s.views7, s.viewsBoostShare, s.clicks7, s.clicksBoostShare, s.boostFees7, s.boostSalesAll, s.potential, s.active, s.note]);
  }
  return out.map((r) => r.map(csvCell).join(',')).join('\n');
}
function downloadText(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Redraw when the Depop pages save new numbers.
chrome.storage.onChanged.addListener((ch) => {
  if (ch[STATS_KEY] && state.tab === 'stats') {
    clearTimeout(renderStats.t);
    renderStats.t = setTimeout(() => { const y = window.scrollY; render(); window.scrollTo(0, y); }, 400);
  }
});
