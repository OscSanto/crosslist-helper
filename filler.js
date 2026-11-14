// Content script: runs on the Depop / Poshmark / Mercari "sell" pages.
// Shows a small Crosslist box. It can fill the form with the values staged in the side panel.
// It never clicks Post / List / Next. You review and post yourself.
(() => {
  if (window.__crosslistFiller) return;
  window.__crosslistFiller = true;

  const host = location.hostname;
  const SITE = /depop\.com$/.test(host) ? 'depop' : /poshmark\./.test(host) ? 'poshmark' : /mercari\.com$/.test(host) ? 'mercari' : null;
  if (!SITE) return;
  const isSellPage = () =>
    (SITE === 'depop' && /\/products\/(create|edit)/.test(location.pathname)) ||
    (SITE === 'poshmark' && /\/(create-listing|edit-listing)/.test(location.pathname)) ||
    (SITE === 'mercari' && /^\/sell/.test(location.pathname));

  // ---------------- helpers ----------------
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
  const $ = (s, root = document) => root.querySelector(s);

  function bestMatch(items, wanted, textOf = (x) => x.textContent) {
    const w = norm(wanted);
    if (!w) return null;
    let best = null, score = 0;
    for (const it of items) {
      const t = norm(textOf(it));
      if (!t) continue;
      let s = 0;
      if (t === w) s = 5;
      else if (t.startsWith(w)) s = 4;          // "Medium" -> "MediumUnder 1lb"
      else if (t.endsWith(w) && w.length >= 2) s = 3; // "32" -> "Waist 32"
      else if (w.startsWith(t) && t.length > 2) s = 2;
      else if (t.includes(w) && w.length > 2) s = 1;
      if (s > score) { score = s; best = it; }
    }
    return best;
  }

  function setValue(el, v) {
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function pressKey(el, key) {
    const code = { Enter: 13, Escape: 27 }[key] || 0;
    for (const t of ['keydown', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(t, { key, code: key, keyCode: code, which: code, bubbles: true }));
    }
  }
  const leaves = (root) => [...root.querySelectorAll('*')].filter((e) => shown(e) && e.children.length === 0 && e.textContent.trim());

  // ---------------- Depop ----------------
  const depop = {
    byLabel(text) {
      const lab = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === text && l.htmlFor);
      return lab && document.getElementById(lab.htmlFor);
    },
    async open(el) {
      el.scrollIntoView({ block: 'center' });
      el.focus();
      el.click();
      await sleep(450);
      return document.getElementById(el.getAttribute('aria-controls'));
    },
    // Only press Escape while the menu is open: on a closed menu Escape CLEARS the chosen value.
    close(el) { if (el.getAttribute('aria-expanded') === 'true') pressKey(el, 'Escape'); el.blur(); },
    // Is `v` already chosen? Single selects mark the option; multi selects show a chip next to the input.
    async isChosen(el, v) {
      const chips = el.parentElement && el.parentElement.parentElement;
      if (chips && [...chips.querySelectorAll('*')].some((c) => c.children.length === 0 && norm(c.textContent) === norm(v))) return true;
      const shownValue = norm(el.value);
      if (shownValue.length > 1 && norm(v).startsWith(shownValue)) return true; // "Medium" vs "MediumUnder 1lb"
      const lb = await this.open(el);
      const o = lb && bestMatch([...lb.querySelectorAll('[role=option]')], v);
      const yes = !!o && o.getAttribute('aria-selected') === 'true';
      this.close(el);
      await sleep(150);
      return yes;
    },
    async select(el, value) {
      for (const v of toList(value)) {
        let ok = false;
        for (let attempt = 0; attempt < 3 && !ok; attempt++) {
          const lb = await this.open(el);
          if (!lb) throw new Error('menu did not open');
          const o = bestMatch([...lb.querySelectorAll('[role=option]')], v);
          if (!o) { this.close(el); throw new Error(`"${v}" is not an option here`); }
          if (o.getAttribute('aria-selected') !== 'true') o.click();
          await sleep(350);
          this.close(el);
          await sleep(200);
          ok = await this.isChosen(el, o.textContent.trim());
        }
        if (!ok) throw new Error(`could not select "${v}". Pick it by hand.`);
      }
    },
    async category(el, value) {
      const parts = value.split('>').map((s) => s.trim()).filter(Boolean);
      const sub = parts.pop();
      const group = norm(parts.join(' > '));
      const lb = await this.open(el);
      if (!lb) throw new Error('menu did not open');
      let pool = [...lb.querySelectorAll('[role=option]')];
      const g = [...lb.children].find((c) => {
        const head = [...c.children].find((x) => x.getAttribute('role') !== 'option');
        return head && norm(head.textContent) === group;
      });
      if (g) pool = [...g.querySelectorAll('[role=option]')];
      const o = bestMatch(pool, sub);
      if (!o) { this.close(el); throw new Error(`category "${value}" not found`); }
      o.click();
      await sleep(1200); // size + extra fields appear after this
    },
    async brand(el, value) {
      await this.open(el);
      setValue(el, value);
      await sleep(1500);
      const lb = document.getElementById(el.getAttribute('aria-controls'));
      const o = lb && bestMatch([...lb.querySelectorAll('[role=option]')], value);
      if (!o) { this.close(el); throw new Error(`"${value}" is not in Depop's brand list. Pick it by hand.`); }
      o.click();
      await sleep(300);
    },
  };

  const DEPOP_FIELDS = [
    { key: 'description', find: () => $('#description'), kind: 'text' },
    { key: 'category', find: () => $('#group-input'), kind: 'category' },
    { key: 'brand', find: () => $('#brand-input'), kind: 'brand' },
    { key: 'condition', find: () => $('#condition-input'), kind: 'select' },
    { key: 'size', find: () => $('#variants-input'), kind: 'select' },
    { key: 'color', find: () => $('#colour-input'), kind: 'select' },
    { key: 'attr_type', find: () => depop.byLabel('Type'), kind: 'select' },
    { key: 'attr_fit', find: () => depop.byLabel('Fit'), kind: 'select' },
    { key: 'attr_bodyfit', find: () => depop.byLabel('Body fit'), kind: 'select' },
    { key: 'attr_length', find: () => depop.byLabel('Length'), kind: 'select' },
    { key: 'material', find: () => depop.byLabel('Material'), kind: 'select' },
    { key: 'occasion', find: () => depop.byLabel('Occasion'), kind: 'select' },
    { key: 'sku', find: () => document.getElementById('SKU__input'), kind: 'text' },
    { key: 'source', find: () => $('#source-input'), kind: 'select' },
    { key: 'age', find: () => $('#age-input'), kind: 'select' },
    { key: 'style', find: () => $('#style-input'), kind: 'select' },
    { key: 'price', find: () => $('#priceAmount__input'), kind: 'text' },
    { key: 'package', find: () => $('#shippingMethods-input'), kind: 'select' },
  ];

  async function fillDepop(f, el, value) {
    if (f.kind === 'text') { setValue(el, value); el.blur(); return; }
    if (f.kind === 'category') return depop.category(el, value);
    if (f.kind === 'brand') return depop.brand(el, value);
    return depop.select(el, value);
  }

  // ---------------- Poshmark ----------------
  const posh = {
    section(name) {
      return [...document.querySelectorAll('.listing-editor__subsection')]
        .find((s) => norm(s.textContent).startsWith(norm(name)));
    },
    async openSel(sel) { sel.scrollIntoView({ block: 'center' }); sel.click(); await sleep(600); },
    async pickIn(sec, sel, value) {
      const opts = () => leaves(sec).filter((e) => !sel.contains(e));
      let hit = bestMatch(opts(), value);
      if (!hit) { await this.openSel(sel); hit = bestMatch(opts(), value); }
      if (!hit) throw new Error(`"${value}" is not an option here`);
      hit.click();
      await sleep(500);
    },
    async category(sec, value) {
      const parts = value.split('>').map((s) => s.trim()).filter(Boolean);
      const [dept, cat] = parts;
      const sel = sec.querySelectorAll('.dropdown__selector')[0];
      await this.openSel(sel);
      const d = [...sec.querySelectorAll('a.dropdown__menu__item')].find((a) => shown(a) && norm(a.textContent) === norm(dept));
      if (!d) throw new Error(`department "${dept}" not found`);
      d.click();
      await sleep(500);
      const menu = sec.querySelector('.dropdown__menu') || sec;
      const c = bestMatch(leaves(menu), cat);
      if (!c) throw new Error(`category "${cat}" not found`);
      c.click();
      await sleep(800);
      if (parts[2]) await this.subcategory(sec, parts[2]);
    },
    async subcategory(sec, value) {
      const sel = sec.querySelectorAll('.dropdown__selector')[1];
      if (!sel) throw new Error('pick the category first');
      await this.openSel(sel);
      const dd = sel.closest('.dropdown') || sec;
      const hit = bestMatch(leaves(dd).filter((e) => !sel.contains(e)), value);
      if (!hit) throw new Error(`subcategory "${value}" not found`);
      hit.click();
      await sleep(500);
    },
    async size(sec, value) {
      const sel = sec.querySelector('.dropdown__selector');
      await this.openSel(sel);
      const sizes = () => [...sec.querySelectorAll('button.multi-size-selector__button')].filter(shown);
      let hit = bestMatch(sizes(), value);
      if (!hit) {
        // Try the other size sets (Big & Tall, Plus, Petite...)
        const tabs = leaves(sec).filter((e) => /^(standard|big & tall|plus|petite|juniors|maternity)$/i.test(e.textContent.trim()));
        for (const t of tabs) { t.click(); await sleep(400); hit = bestMatch(sizes(), value); if (hit) break; }
      }
      if (!hit) throw new Error(`size "${value}" not found`);
      hit.click();
      await sleep(400);
      const done = leaves(sec).find((e) => e.textContent.trim() === 'Done');
      if (done) { done.click(); await sleep(300); }
    },
    async colors(sec, value) {
      const sel = sec.querySelector('.dropdown__selector');
      for (const c of toList(value).slice(0, 2)) await this.pickIn(sec, sel, c);
    },
    async tags(input, value) {
      for (const t of toList(value).slice(0, 3)) {
        setValue(input, t);
        pressKey(input, 'Enter');
        await sleep(400);
      }
    },
    skuInput() {
      const lab = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Listing SKU');
      let p = lab;
      for (let i = 0; i < 4 && p; i++) { p = p.parentElement; const inp = p && p.querySelector('input'); if (inp) return inp; }
      return null;
    },
  };

  const POSH_FIELDS = [
    { key: 'title', find: () => $('[data-vv-name=title]'), kind: 'text' },
    { key: 'description', find: () => $('[data-vv-name=description]'), kind: 'text' },
    { key: 'category', find: () => posh.section('Category'), kind: 'category' },
    { key: 'subcategory', find: () => posh.section('Category'), kind: 'subcategory' },
    { key: 'size', find: () => posh.section('Size'), kind: 'size' },
    { key: 'condition', find: () => posh.section('Condition'), kind: 'pick' },
    { key: 'brand', find: () => $('input[placeholder="Enter the Brand/Designer"]'), kind: 'text' },
    { key: 'color', find: () => posh.section('Color'), kind: 'colors' },
    { key: 'styleTags', find: () => $('[data-vv-name=style-tag-input]'), kind: 'tags' },
    { key: 'sku', find: () => posh.skuInput(), kind: 'text' },
    { key: 'originalPrice', find: () => $('[data-vv-name=originalPrice]'), kind: 'text' },
    { key: 'price', find: () => $('[data-vv-name=listingPrice]'), kind: 'text' },
  ];

  async function fillPosh(f, el, value) {
    if (f.kind === 'text') { setValue(el, value); return; }
    if (f.kind === 'category') return posh.category(el, value);
    if (f.kind === 'subcategory') return posh.subcategory(el, value);
    if (f.kind === 'size') return posh.size(el, value);
    if (f.kind === 'colors') return posh.colors(el, value);
    if (f.kind === 'tags') return posh.tags(el, value);
    if (f.kind === 'pick') return posh.pickIn(el, el.querySelector('.dropdown__selector'), value);
  }

  // ---------------- Mercari (best effort: form not mapped yet) ----------------
  function mercariField(words) {
    const re = new RegExp(words, 'i');
    const inputs = [...document.querySelectorAll('input, textarea')].filter(shown);
    return inputs.find((i) => {
      const lab = (i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)) || i.closest('label');
      return re.test([i.name, i.placeholder, i.getAttribute('aria-label'), i.getAttribute('data-testid'), lab && lab.textContent].join(' '));
    });
  }
  const MERCARI_FIELDS = [
    { key: 'title', find: () => mercariField('title|what are you selling'), kind: 'text' },
    { key: 'description', find: () => mercariField('description|describe'), kind: 'text' },
    { key: 'brand', find: () => mercariField('brand'), kind: 'text' },
    { key: 'price', find: () => mercariField('price'), kind: 'text' },
  ];

  const FIELDS = { depop: DEPOP_FIELDS, poshmark: POSH_FIELDS, mercari: MERCARI_FIELDS }[SITE];
  const fillOne = { depop: fillDepop, poshmark: fillPosh, mercari: async (f, el, v) => setValue(el, v) }[SITE];

  // ---------------- data from the side panel ----------------
  let data = {};
  let labels = {};
  async function loadData() {
    const s = await chrome.storage.local.get(['fill']);
    data = (s.fill && s.fill[SITE]) || {};
    labels = (s.fill && s.fill._labels && s.fill._labels[SITE]) || {};
    render();
  }
  chrome.storage.onChanged.addListener((ch) => { if (ch.fill) loadData(); });

  // ---------------- UI (shadow DOM so the site's CSS can't break it) ----------------
  const hostEl = document.createElement('div');
  hostEl.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
  const root = hostEl.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      * { box-sizing: border-box; font: 13px/1.35 system-ui, "Segoe UI", sans-serif; }
      .box { width: 290px; max-height: 70vh; display: flex; flex-direction: column; background: #fff; color: #1d1d1f;
             border: 1px solid #ddd; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.18); overflow: hidden; }
      .head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: #2f6fde; color: #fff; font-weight: 600; cursor: pointer; }
      .head span { flex: 1; }
      .body { overflow: auto; padding: 8px 10px; }
      button { cursor: pointer; border: 1px solid #ccc; background: #fff; border-radius: 6px; padding: 3px 8px; }
      button.main { width: 100%; padding: 7px; background: #2f6fde; color: #fff; border: none; font-weight: 600; margin-bottom: 6px; }
      .row { display: flex; align-items: center; gap: 6px; padding: 4px 0; border-top: 1px solid #eee; }
      .row .k { width: 86px; color: #666; flex: none; }
      .row .v { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ok { color: #1f8a4c; } .bad { color: #c62828; } .muted { color: #888; font-size: 11px; }
      .pill { position: fixed; z-index: 2147483647; background: #2f6fde; color: #fff; border: none; border-radius: 14px; padding: 4px 10px;
              box-shadow: 0 2px 8px rgba(0,0,0,.25); font-weight: 600; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hidden { display: none; }
      @media (prefers-color-scheme: dark) {
        .box { background: #222326; color: #ececec; border-color: #3a3b40; }
        button { background: #2d3038; color: #ececec; border-color: #44464d; }
        .row { border-color: #34353a; } .row .k { color: #9a9aa0; }
      }
    </style>
    <div class="box">
      <div class="head"><span>Crosslist Helper</span><b id="toggle">–</b></div>
      <div class="body" id="body"></div>
    </div>
    <button class="pill hidden" id="pill"></button>`;
  const body = root.getElementById('body');
  const pill = root.getElementById('pill');
  let collapsed = false;
  root.querySelector('.head').addEventListener('click', () => {
    collapsed = !collapsed;
    body.classList.toggle('hidden', collapsed);
    root.getElementById('toggle').textContent = collapsed ? '+' : '–';
  });

  const status = {};
  function render() {
    hostEl.style.display = isSellPage() ? '' : 'none';
    body.replaceChildren();
    const keys = FIELDS.filter((f) => data[f.key]);
    if (!keys.length) {
      body.innerHTML = '<div class="muted">Nothing staged for this site yet. Extract an eBay listing in the side panel first.</div>';
      return;
    }
    const all = document.createElement('button');
    all.className = 'main';
    all.textContent = 'Fill everything';
    all.onclick = fillAll;
    body.append(all);
    for (const f of keys) {
      const row = document.createElement('div');
      row.className = 'row';
      const k = document.createElement('span'); k.className = 'k'; k.textContent = labels[f.key] || f.key;
      const v = document.createElement('span'); v.className = 'v'; v.textContent = String(data[f.key]); v.title = String(data[f.key]);
      const st = document.createElement('span'); st.textContent = status[f.key] || '';
      st.className = /✓/.test(st.textContent) ? 'ok' : 'bad';
      if (/✗/.test(st.textContent)) st.title = status[f.key + '_err'] || '';
      const b = document.createElement('button'); b.textContent = 'Fill';
      b.onclick = () => fillField(f);
      row.append(k, v, st, b);
      body.append(row);
    }
    const note = document.createElement('div');
    note.className = 'muted';
    note.textContent = SITE === 'mercari'
      ? 'Mercari: only title, description, brand and price fill automatically for now. Use Copy in the side panel for the rest.'
      : 'Review everything, add photos, then post yourself. Hover a ✗ to see why it failed.';
    body.append(note);
  }

  async function fillField(f) {
    const el = f.find();
    if (!el) { status[f.key] = '✗'; status[f.key + '_err'] = 'Field not on the page (pick the category first?)'; render(); return false; }
    try {
      await fillOne(f, el, data[f.key]);
      status[f.key] = '✓';
    } catch (e) {
      status[f.key] = '✗';
      status[f.key + '_err'] = e.message || String(e);
    }
    render();
    return status[f.key] === '✓';
  }

  async function fillAll() {
    for (const f of FIELDS) {
      if (!data[f.key]) continue;
      await fillField(f);
      await sleep(150);
    }
  }

  // "I know this one" pill when you click into / hover a field we have a value for.
  function fieldFor(target) {
    for (const f of FIELDS) {
      if (!data[f.key]) continue;
      const el = f.find();
      if (el && (el === target || el.contains(target))) return { f, el };
    }
    return null;
  }
  let pillFor = null, hideTimer = null;
  function showPill(hit) {
    clearTimeout(hideTimer);
    pillFor = hit.f;
    const r = hit.el.getBoundingClientRect();
    pill.textContent = `✨ I know this: ${String(data[hit.f.key]).slice(0, 40)} — Fill`;
    pill.style.left = Math.max(8, r.left) + 'px';
    pill.style.top = Math.max(8, r.top - 34) + 'px';
    pill.classList.remove('hidden');
    hideTimer = setTimeout(() => pill.classList.add('hidden'), 6000);
  }
  pill.addEventListener('mousedown', (e) => e.preventDefault());
  pill.addEventListener('click', async () => {
    pill.classList.add('hidden');
    if (pillFor) await fillField(pillFor);
  });
  document.addEventListener('focusin', (e) => { const hit = fieldFor(e.target); if (hit) showPill(hit); }, true);
  let hoverTimer = null;
  document.addEventListener('mouseover', (e) => {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      const t = e.target.closest && e.target.closest('.dropdown__selector, [role=combobox]');
      if (!t) return;
      const hit = fieldFor(t);
      if (hit) showPill(hit);
    }, 500);
  }, true);

  // Single-page sites change URL without reloading.
  let lastPath = location.pathname;
  setInterval(() => { if (location.pathname !== lastPath) { lastPath = location.pathname; render(); } }, 1000);

  // The sites rebuild the page after it loads, which deletes anything an extension added.
  // Put the box back whenever that happens.
  const attach = () => { if (!hostEl.isConnected) (document.body || document.documentElement).append(hostEl); };
  attach();
  new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(attach, 1000);
  loadData();
})();
