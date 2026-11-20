// ===================== Depop stats reader =====================
// Runs on Depop's Selling Hub. It only READS the numbers already on the
// screen when YOU open these pages. It sends no requests, clicks nothing
// and doesn't scroll.
//
//   /sellinghub/selling/active/  each listing: offers, bags, likes, views,
//                                clicks and the boost increase for both
//   /sellinghub/stats/...        shop totals: 7-day views and clicks,
//                                % from boosting, boosting fees
//   /sellinghub/sold-items/      which saved listings sold
//
// One snapshot per day is kept in chrome.storage.local under "depopStats".
// Opening a page again on the same day just updates that day.
// The side panel's Stats tab draws the charts.

(() => {
  if (!/(^|\.)depop\.com$/.test(location.hostname)) return;

  const KEY = 'depopStats';
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const nrm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // "1.15K" -> 1150, "32,773" -> 32773
  function num(s) {
    const m = String(s || '').replace(/,/g, '').match(/([\d.]+)\s*([KkMm]?)/);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] || 1));
  }
  const pct = (s) => { const m = String(s || '').match(/([+-]?[\d.]+)\s*%/); return m ? parseFloat(m[1]) : null; };

  // ---------- storage ----------
  let pending = null;
  let writing = Promise.resolve();
  // Queue changes and write them together, so quick page updates don't race.
  function update(fn) {
    pending = pending || [];
    pending.push(fn);
    clearTimeout(update.t);
    update.t = setTimeout(() => {
      const fns = pending; pending = null;
      writing = writing.then(async () => {
        try {
          const s = await chrome.storage.local.get(KEY);
          const db = s[KEY] || { shop: {}, items: {} };
          db.shop = db.shop || {}; db.items = db.items || {};
          for (const f of fns) f(db);
          await chrome.storage.local.set({ [KEY]: db });
        } catch (e) {
          // Extension reloaded: this old copy of the script can't save anymore.
          if (/context invalidated/i.test(String(e))) chip('The extension was updated. Refresh this page (F5) to keep saving stats.');
        }
      });
    }, 600);
  }

  // ---------- small notice on the page ----------
  let chipEl;
  function chip(text) {
    if (!chipEl) {
      chipEl = document.createElement('div');
      chipEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;max-width:340px;' +
        'background:#1d1d1f;color:#fff;font:12px/1.4 system-ui,sans-serif;padding:6px 10px;border-radius:8px;' +
        'box-shadow:0 2px 8px rgba(0,0,0,.25);opacity:.92;pointer-events:none';
      document.documentElement.append(chipEl);
    }
    chipEl.textContent = 'Crosslist stats: ' + text;
    chipEl.style.display = text ? '' : 'none';
  }
  const hideChip = () => { if (chipEl) chipEl.style.display = 'none'; };

  // ---------- Selling > Active ----------
  // Insight tokens are, in order: offers, bags, likes, views, [+views boost %],
  // clicks, [+clicks boost %]. The % badges are missing when nothing is boosted.
  function readInsights(box) {
    const toks = [];
    box.querySelectorAll('p, span').forEach((el) => {
      if (el.children.length) return;
      const t = el.textContent.trim();
      if (/^[+-]?[\d.,]+[KkMm]?%?$/.test(t)) toks.push(t);
    });
    const counts = [], boost = {};
    for (const t of toks) {
      if (t.endsWith('%')) {
        if (counts.length === 4) boost.views = pct(t);
        else if (counts.length === 5) boost.clicks = pct(t);
      } else counts.push(num(t));
    }
    if (counts.length < 5) return null;
    const [offers, bags, likes, views, clicks] = counts;
    return { offers, bags, likes, views, clicks, viewsBoost: boost.views ?? null, clicksBoost: boost.clicks ?? null };
  }

  function readRow(row) {
    const box = row.querySelector('[data-testid="desktopInsights"]') || row.querySelector('[data-testid="mobileInsights"]');
    const a = row.querySelector('a[href*="/products/"]');
    if (!box || !a) return null;
    const href = a.getAttribute('href').split('?')[0];
    // /products/<username>-<slug>/manage/  -> <slug> (ends in a short id, so it's unique)
    const m = href.match(/\/products\/[^/-]+-([^/]+)/);
    if (!m) return null;
    const stats = readInsights(box);
    if (!stats) return null;
    const lines = row.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    const desc = lines.find((l) => l.length > 25 && !/^SKU:|^Listed on|^US?\$|^[£€$]/.test(l)) || '';
    const price = (lines.find((l) => /^(US|A|C)?\$|^[£€]/.test(l)) || '');
    const sku = ((row.innerText.match(/SKU:\s*(\S+)/) || [])[1] || '').replace(/SKU:?$/, '');
    const listed = (row.innerText.match(/Listed on\s+(\d{1,2} \w{3} \d{4})/) || [])[1] || '';
    const img = row.querySelector('img');
    return {
      id: m[1],
      href: href.replace(/manage\/?$/, ''),
      title: desc.slice(0, 90),
      match: nrm(desc).slice(0, 50),
      price: parseFloat((price.match(/[\d.,]+/) || [''])[0].replace(/,/g, '')) || null,
      sku,
      listed: listed ? toISO(listed) : '',
      img: img ? img.src : '',
      stats,
    };
  }
  function toISO(s) {
    const d = new Date(s);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const seenToday = new Set();
  function scanActive() {
    const searchBox = document.querySelector('input[placeholder*="Search listings" i]');
    const filtered = !!(searchBox && searchBox.value.trim());
    const header = [...document.querySelectorAll('h1,h2,h3,p,span')].find((e) => /^Active items\s*\(\d+\)/.test(e.textContent.trim()));
    const total = header ? num(header.textContent.match(/\((\d+)\)/)[1]) : null;

    const rows = [...document.querySelectorAll('[class*="listingRow"]')].map(readRow).filter(Boolean);
    const fresh = rows.filter((r) => !seenToday.has(r.id));
    if (!rows.length) return;
    rows.forEach((r) => seenToday.add(r.id));
    const day = today();
    const complete = !filtered && total != null && seenToday.size >= total;

    if (fresh.length || complete) {
      const seen = [...seenToday];
      update((db) => {
        for (const r of rows) {
          const it = db.items[r.id] || { firstSeen: day, days: {} };
          Object.assign(it, {
            href: r.href, title: r.title, match: r.match, price: r.price, sku: r.sku || it.sku || '',
            listed: r.listed || it.listed || '', img: r.img || it.img || '', lastSeen: day, status: 'active',
          });
          delete it.goneOn;
          it.days[day] = r.stats;
          db.items[r.id] = it;
        }
        if (total != null) db.shop[day] = { ...(db.shop[day] || {}), active: total };
        // When every active listing was seen today, anything missing has
        // sold or been removed. The Sold page decides which.
        if (complete) {
          const now = new Set(seen);
          for (const [id, it] of Object.entries(db.items)) {
            if (it.status === 'active' && !now.has(id)) { it.status = 'gone'; it.goneOn = day; }
          }
          db.lastFullScan = day;
        }
      });
    }
    if (filtered) chip('search is on, so only the shown listings are saved.');
    else if (total != null && seenToday.size < total) chip(`saved ${seenToday.size} of ${total} listings today. Scroll down to save the rest.`);
    else chip(`saved all ${seenToday.size} listings for today.`);
  }

  // ---------- Stats page ----------
  function scanStats() {
    const t = (document.querySelector('main') || document.body).innerText;
    const views = t.match(/Views\s+7 days\s+([\d.,]+[KkMm]?)\s+(\d+(?:\.\d+)?)%\s*from boosting/);
    const clicks = t.match(/Clicks\s+7 days\s+([\d.,]+[KkMm]?)\s+(\d+(?:\.\d+)?)%\s*from boosting/);
    if (!views || !clicks) return;
    const fees = t.match(/Boosting fees\s+\D{0,4}([\d.,]+)/);
    const boostSales = t.match(/Sales from boosting\s+All time\s+(\d+)/);
    const potential = t.match(/Potential revenue\s+\D{0,4}([\d.,]+)\s*\*?\s*from (\d+) active/);
    const snap = {
      views7: num(views[1]), viewsBoostShare: parseFloat(views[2]),
      clicks7: num(clicks[1]), clicksBoostShare: parseFloat(clicks[2]),
      boostFees7: fees ? parseFloat(fees[1].replace(/,/g, '')) : null,
      boostSalesAll: boostSales ? num(boostSales[1]) : null,
      potential: potential ? parseFloat(potential[1].replace(/,/g, '')) : null,
      at: new Date().toISOString(),
    };
    if (potential) snap.active = num(potential[2]);
    const sig = JSON.stringify({ ...snap, at: 0 });
    if (sig === scanStats.last) return;
    scanStats.last = sig;
    const day = today();
    // Parts of the page load late, so never overwrite a saved number with "missing".
    const found = Object.fromEntries(Object.entries(snap).filter(([, v]) => v != null && !Number.isNaN(v)));
    update((db) => { db.shop[day] = { ...(db.shop[day] || {}), ...found }; });
    chip(`saved today's shop stats (${snap.views7.toLocaleString()} views, ${snap.clicks7} clicks in 7 days).`);
  }

  // ---------- Sold ----------
  function scanSold() {
    const texts = new Map();
    document.querySelectorAll('a[href*="/sellinghub/sold-items/"]').forEach((a) => {
      const id = (a.getAttribute('href').match(/sold-items\/(\d+)/) || [])[1];
      if (!id || texts.has(id)) return;
      let el = a;
      for (let i = 0; i < 6 && el && el.innerText.length < 80; i++) el = el.parentElement;
      if (el) texts.set(id, nrm(el.innerText));
    });
    if (!texts.size) return;
    const all = [...texts.values()];
    update((db) => {
      for (const it of Object.values(db.items)) {
        // Only listings that left the Active list. A relisted copy of a sold
        // item has the same text, so active ones are never marked sold.
        if (it.status !== 'gone' || !it.match || it.match.length < 20) continue;
        if (all.some((t) => t.includes(it.match))) {
          it.status = 'sold';
          it.soldSeen = today();
        }
      }
    });
  }

  // ---------- run on the right page ----------
  function tick() {
    const p = location.pathname;
    if (/^\/sellinghub\/selling\/active/.test(p)) scanActive();
    else if (/^\/sellinghub\/stats/.test(p)) scanStats();
    else if (/^\/sellinghub\/sold-items\/?$/.test(p)) scanSold();
    else hideChip();
  }
  let timer;
  new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(tick, 800); })
    .observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(tick, 1500);
})();
