// ===================== Crosslist Helper side panel =====================

const state = {
  item: null,
  edits: { depop: {}, poshmark: {}, mercari: {} },
  tab: 'ebay',
  autoSwitch: true,
};

const $ = (s) => document.querySelector(s);

// Small DOM builder. Text is always set with textContent (safe against odd listing text).
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function setStatus(msg, kind) {
  const s = $('#status');
  s.textContent = msg || '';
  s.className = 'status ' + (kind || '');
}

// ---------------- storage ----------------
async function load() {
  const s = await chrome.storage.local.get(['item', 'edits', 'tab', 'autoSwitch']);
  if (s.item) state.item = s.item;
  if (s.edits) state.edits = { depop: {}, poshmark: {}, mercari: {}, ...s.edits };
  if (s.tab) state.tab = s.tab;
  if (typeof s.autoSwitch === 'boolean') state.autoSwitch = s.autoSwitch;
  $('#autoSwitch').checked = state.autoSwitch;
  if (state.item) setStatus('Loaded last item: ' + state.item.title.slice(0, 60), '');
  render();
}
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({
    item: state.item, edits: state.edits, tab: state.tab, autoSwitch: state.autoSwitch,
  }), 250);
}

// ---------------- clipboard ----------------
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = h('textarea', {}, text);
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Copied!'; btn.classList.add('done');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1100);
  }
}

// ---------------- extraction ----------------
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

function htmlToText(html) {
  html = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|h[1-6]|tr|table|section|ul|ol)>/gi, '\n');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.body ? doc.body.textContent : '';
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchDescription(url) {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return htmlToText(await r.text());
}

function cleanDescription(text) {
  // Drop lines that only make sense on eBay.
  const ebayOnly = /\bebay\b|feedback|\bbid(s|ding|der)?\b|auction|best offer|combined shipping|positive rating|watch ?list/i;
  return (text || '')
    .split('\n')
    .filter((l) => !ebayOnly.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalize(raw) {
  const sp = raw.specifics || {};
  const keys = Object.keys(sp);
  const bad = /^(does not apply|n\/a|na|none|-|not applicable)$/i;
  const ok = (k) => k && sp[k] && !bad.test(sp[k]);
  const get = (...names) => {
    for (const n of names) {
      const k = keys.find((x) => x.toLowerCase() === n.toLowerCase());
      if (ok(k)) return sp[k];
    }
    return '';
  };
  const getLike = (re) => { const k = keys.find((x) => re.test(x) && ok(x)); return k ? sp[k] : ''; };

  const it = { ...raw };
  it.brand = get('Brand');
  it.size = get('Size') || getLike(/^size\b/i) || getLike(/shoe size/i) || getLike(/bottoms size|tops size/i);
  it.sizeType = get('Size Type');
  it.color = get('Color', 'Colour', 'Main Color') || getLike(/colou?r/i);
  it.material = get('Material', 'Outer Shell Material', 'Upper Material', 'Fabric Type');
  it.pattern = get('Pattern');
  it.style = get('Style');
  it.type = get('Type', 'Product Type');
  it.theme = get('Theme');
  it.fit = get('Fit');
  it.department = get('Department', 'Gender');
  it.countryOfOrigin = get('Country/Region of Manufacture', 'Country of Manufacture', 'Country of Origin');
  it.sleeveLength = get('Sleeve Length');
  it.neckline = get('Neckline');
  it.closure = get('Closure');
  it.occasion = get('Occasion');
  it.season = get('Season');
  it.features = get('Features', 'Accents');
  it.vintage = get('Vintage');
  it.decade = get('Decade', 'Era');
  it.character = get('Character', 'Character Family');
  it.productLine = get('Product Line');
  it.model = get('Model');
  it.conditionNotes = get('Seller Notes', 'Condition Description');
  it.measurements = [
    ['Chest', get('Chest Size', 'Chest', 'Pit to Pit')],
    ['Waist', get('Waist Size', 'Waist')],
    ['Inseam', get('Inseam')],
    ['Rise', get('Rise')],
    ['Length', get('Length', 'Garment Length')],
    ['Sleeve', get('Sleeve Length (in)')],
  ].filter((m) => m[1]);
  it.description = raw.description || raw.descriptionInline || '';
  it.descriptionClean = cleanDescription(it.description);
  it.originalPrice = ((raw.originalPriceText || '').match(/[\d,]+(?:\.\d{1,2})?/) || [''])[0].replace(/,/g, '');
  return it;
}

async function extract() {
  const btn = $('#extractBtn');
  const tab = await activeTab();
  if (!tab || !/^https?:\/\/([a-z0-9-]+\.)*ebay\.(com|ca|co\.uk|com\.au)\//i.test(tab.url || '')) {
    setStatus('Switch to an eBay listing tab (ebay.com/itm/…) first, then click Extract.', 'error');
    return;
  }
  btn.disabled = true;
  setStatus('Reading the eBay page…');
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractEbayListing });
    const raw = res && res.result;
    if (!raw || raw.error) throw new Error('This does not look like an eBay listing page.');
    if (!raw.title && !raw.images.length) throw new Error('No listing found on this page. Open the item page itself.');

    setStatus('Getting the description…');
    try {
      if (raw.descUrl) raw.description = await fetchDescription(raw.descUrl);
    } catch (e) {
      raw.descError = 'Could not load the description (' + e.message + '). Copy it from the page by hand.';
    }

    state.item = normalize(raw);
    state.edits = { depop: {}, poshmark: {}, mercari: {} };
    if (state.tab !== 'ebay' && !PLATFORMS[state.tab]) state.tab = 'ebay';
    save();
    render();
    const n = Object.keys(raw.specifics).length;
    setStatus(`Done: ${raw.images.length} photos, ${n} item details${raw.descError ? ' (no description)' : ''}.`, raw.descError ? 'error' : 'ok');
  } catch (e) {
    setStatus(e.message || String(e), 'error');
  } finally {
    btn.disabled = false;
  }
}

// ---------------- per-site field lists ----------------
function detailLines(it) {
  const L = [];
  const add = (k, v) => { if (v) L.push(`${k}: ${v}`); };
  add('Brand', it.brand);
  add('Size', [it.size, it.sizeType && !/^regular$/i.test(it.sizeType) ? it.sizeType : ''].filter(Boolean).join(' '));
  add('Condition', [it.condition, it.conditionNotes].filter(Boolean).join(' – '));
  add('Color', it.color);
  add('Material', it.material);
  add('Pattern', it.pattern);
  add('Style', it.style);
  add('Fit', it.fit);
  add('Made in', it.countryOfOrigin);
  if (it.measurements.length) L.push('Measurements: ' + it.measurements.map(([k, v]) => `${k} ${v}`).join(', '));
  return L;
}

function buildDescription(pid, it) {
  const limit = PLATFORMS[pid].descLimit;
  const head = pid === 'depop' ? it.title : '';
  const details = detailLines(it).join('\n');
  const tags = pid === 'depop' ? hashtags(it, PLATFORMS.depop.maxHashtags).join(' ') : '';
  const fixedLen = [head, details, tags].filter(Boolean).join('\n\n').length + 2;
  let body = it.descriptionClean || '';
  const room = limit - fixedLen - 2;
  if (body.length > room) body = room > 40 ? body.slice(0, room - 1).replace(/\s+\S*$/, '') + '…' : '';
  return [head, body, details, tags].filter(Boolean).join('\n\n').slice(0, limit);
}

function uniq(arr) {
  const seen = new Set();
  return arr.filter((x) => { const k = (x || '').toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; });
}

function buildFields(pid, it) {
  const p = PLATFORMS[pid];
  const grade = conditionGrade(it.condition);
  const cond = grade ? CONDITION_MAP[grade][pid] : '';
  const colors = platformColors(pid, it.color);
  const pick = 'Pick this in the site\'s dropdown.';
  const condHint = `eBay says: "${it.condition || 'unknown'}". ${pick}`;
  const colorHint = `eBay says: "${it.color || 'unknown'}". Up to ${p.maxColors}.`;
  const shipHint = Object.entries(it.logistics || {}).map(([k, v]) => `${k}: ${v}`).join(' · ').slice(0, 200);

  if (pid === 'depop') {
    return [
      { key: 'description', label: 'Description', value: buildDescription(pid, it), limit: p.descLimit, multiline: true,
        hint: 'Depop has no title box. The first line works as the title. Max 5 hashtags.' },
      { key: 'category', label: 'Category', value: suggestCategory(pid, it), hint: 'Suggestion. ' + pick },
      { key: 'brand', label: 'Brand', value: it.brand },
      { key: 'condition', label: 'Condition', value: cond, options: p.conditions, hint: condHint },
      { key: 'size', label: 'Size', value: it.size, hint: it.sizeType ? 'Size type on eBay: ' + it.sizeType : '' },
      { key: 'color', label: 'Colour', value: colors.join(', '), options: p.colors, max: p.maxColors, hint: colorHint },
      { key: 'source', label: 'Source', value: depopSource(it), options: p.sources, max: 2, hint: 'Optional.' },
      { key: 'age', label: 'Age', value: depopAge(it), options: p.ages, hint: 'Optional.' },
      { key: 'style', label: 'Style', value: depopStyles(it).join(', '), options: p.styles, max: p.maxStyles, hint: 'Optional, up to 3.' },
      { key: 'material', label: 'Material', value: it.material, hint: 'Optional.' },
      { key: 'price', label: 'Price', value: it.price, hint: `eBay price: ${it.priceText || it.price}` },
      { key: 'shipping', label: 'Shipping (eBay info, for reference)', value: '', hint: shipHint || 'Choose a parcel size on Depop.' },
    ];
  }
  if (pid === 'poshmark') {
    const tags = uniq([it.style, it.pattern, it.theme, it.fit, it.type]).slice(0, p.maxStyles);
    return [
      { key: 'title', label: 'Title', value: (it.title || '').slice(0, p.titleLimit), limit: p.titleLimit },
      { key: 'description', label: 'Description', value: buildDescription(pid, it), limit: p.descLimit, multiline: true },
      { key: 'category', label: 'Category', value: suggestCategory(pid, it), hint: 'Suggestion. ' + pick },
      { key: 'size', label: 'Size', value: it.size, hint: it.sizeType ? 'Size type on eBay: ' + it.sizeType : '' },
      { key: 'brand', label: 'Brand', value: it.brand },
      { key: 'condition', label: 'Condition', value: cond, options: p.conditions, hint: condHint },
      { key: 'color', label: 'Color', value: colors.join(', '), options: p.colors, max: p.maxColors, hint: colorHint },
      { key: 'styleTags', label: 'Style tags', value: tags.join(', '), hint: 'Up to 3, type each one.' },
      { key: 'originalPrice', label: 'Original price', value: it.originalPrice, hint: 'Retail price when new. Leave empty if unknown.' },
      { key: 'price', label: 'Listing price', value: it.price, hint: `eBay price: ${it.priceText || it.price}. Poshmark minimum is $3.` },
    ];
  }
  // mercari
  return [
    { key: 'title', label: 'Title', value: (it.title || '').slice(0, p.titleLimit), limit: p.titleLimit },
    { key: 'description', label: 'Description', value: buildDescription(pid, it), limit: p.descLimit, multiline: true },
    { key: 'category', label: 'Category', value: suggestCategory(pid, it), hint: 'Suggestion. ' + pick },
    { key: 'brand', label: 'Brand', value: it.brand },
    { key: 'condition', label: 'Condition', value: cond, options: p.conditions, hint: condHint },
    { key: 'size', label: 'Size', value: it.size },
    { key: 'color', label: 'Color', value: colors.join(', '), options: p.colors, max: p.maxColors, hint: colorHint },
    { key: 'price', label: 'Price', value: it.price, hint: `eBay price: ${it.priceText || it.price}` },
    { key: 'shipping', label: 'Shipping weight', value: '', hint: shipHint || 'Weigh the packed item. eBay does not show this.' },
  ];
}

// ---------------- rendering ----------------
function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
  const c = $('#content');
  c.replaceChildren();
  if (!state.item) {
    c.append(h('div', { class: 'empty' },
      '1. Open an eBay listing.', h('br'), '2. Click "Extract from this eBay page".', h('br'),
      '3. Use the tabs to copy each field into Depop, Poshmark or Mercari.'));
    return;
  }
  if (state.tab === 'ebay') renderEbay(c);
  else renderPlatform(c, state.tab);
}

function photosCard(limit, label) {
  const it = state.item;
  const imgs = it.images || [];
  const n = limit ? Math.min(limit, imgs.length) : imgs.length;
  const grid = h('div', { class: 'photos' },
    imgs.map((src, i) => h('a', { href: src, target: '_blank', class: limit && i >= limit ? 'extra' : '', title: 'Open full size' },
      h('img', { src, loading: 'lazy', alt: '' }), h('span', {}, i + 1))));
  return h('div', { class: 'card' },
    h('h3', {}, `Photos (${imgs.length})`,
      h('button', { onclick: (e) => downloadPhotos(n, e.currentTarget) }, `Download ${n}`)),
    grid,
    h('div', { class: 'note' },
      `Saves to your Downloads folder in Crosslist/${it.itemId || 'item'}/. ` +
      (limit && imgs.length > limit ? `${label} allows ${limit} photos; faded ones are left out.` : '') +
      ' Then drag them into the upload box.'));
}

async function downloadPhotos(n, btn) {
  const it = state.item;
  const folder = 'Crosslist/' + (it.itemId || 'item').replace(/[^\w-]/g, '');
  for (let i = 0; i < n; i++) {
    await chrome.downloads.download({
      url: it.images[i],
      filename: `${folder}/${String(i + 1).padStart(2, '0')}.jpg`,
      conflictAction: 'overwrite',
      saveAs: false,
    });
  }
  if (btn) { btn.textContent = 'Saved!'; setTimeout(() => (btn.textContent = `Download ${n}`), 1500); }
}

function renderEbay(c) {
  const it = state.item;
  c.append(h('div', { class: 'card' },
    h('div', { class: 'title-big' }, it.title),
    h('div', { class: 'price-big' }, it.priceText || it.price),
    h('div', {}, it.condition),
    h('div', { class: 'note' }, h('a', { href: it.url, target: '_blank' }, 'Open eBay listing'),
      ` · item ${it.itemId} · read ${new Date(it.extractedAt).toLocaleString()}`)));

  c.append(photosCard(0));

  const key = [
    ['Title', it.title], ['Price', it.price], ['Condition', it.condition], ['Condition notes', it.conditionNotes],
    ['Brand', it.brand], ['Size', it.size], ['Size type', it.sizeType], ['Color', it.color], ['Material', it.material],
    ['Pattern', it.pattern], ['Style', it.style], ['Type', it.type], ['Theme', it.theme], ['Fit', it.fit],
    ['Department', it.department], ['Country of origin', it.countryOfOrigin], ['Category path', (it.breadcrumbs || []).join(' › ')],
  ].filter((r) => r[1]);
  c.append(specsCard('Key details', key));

  const all = Object.entries(it.specifics || {});
  if (all.length) c.append(specsCard(`All item specifics (${all.length})`, all));

  const desc = h('textarea', { readonly: true }); desc.value = it.descriptionClean || '';
  c.append(h('div', { class: 'card' },
    h('h3', {}, 'Description', h('button', { class: 'copy', onclick: (e) => copyText(desc.value, e.currentTarget) }, 'Copy')),
    it.descError ? h('div', { class: 'hint warn' }, it.descError) : null,
    desc,
    h('div', { class: 'note' }, 'Lines that mention eBay, feedback, bids or offers were removed.')));

  const log = Object.entries(it.logistics || {});
  if (log.length) c.append(specsCard('Shipping & returns (eBay)', log));
}

function specsCard(title, rows) {
  const table = h('table', { class: 'specs' },
    rows.map(([k, v]) => h('tr', { title: 'Click to copy', onclick: () => { copyText(v); setStatus(`Copied ${k}`, 'ok'); } },
      h('td', {}, k), h('td', {}, v))));
  return h('div', { class: 'card' },
    h('h3', {}, title, h('button', { class: 'copy', onclick: (e) => copyText(rows.map(([k, v]) => `${k}: ${v}`).join('\n'), e.currentTarget) }, 'Copy all')),
    table);
}

function renderPlatform(c, pid) {
  const p = PLATFORMS[pid];
  const it = state.item;
  const fields = buildFields(pid, it);
  const edits = state.edits[pid];
  const val = (f) => (f.key in edits ? edits[f.key] : f.value || '');

  c.append(h('div', { class: 'toolbar' },
    h('button', { onclick: () => chrome.tabs.create({ url: p.sellUrl }) }, `Open ${p.name} sell page`),
    h('button', { onclick: (e) => copyText(fields.filter((f) => val(f)).map((f) => `${f.label}: ${val(f)}`).join('\n\n'), e.currentTarget) }, 'Copy everything'),
    h('button', { title: 'Undo your edits on this tab', onclick: () => { state.edits[pid] = {}; save(); render(); } }, 'Reset')));

  c.append(photosCard(p.maxPhotos, p.name));

  const card = h('div', { class: 'card' });
  fields.forEach((f) => card.append(fieldRow(pid, f, val(f))));
  c.append(card);
}

function fieldRow(pid, f, value) {
  const input = f.multiline ? h('textarea', {}) : h('input', { type: 'text' });
  input.value = value;
  const count = f.limit ? h('span', { class: 'count' }) : null;
  const chips = f.options ? h('div', { class: 'chips' }) : null;

  const listOf = () => input.value.split(',').map((s) => s.trim()).filter(Boolean);
  const refresh = () => {
    if (count) {
      count.textContent = `${input.value.length}/${f.limit}`;
      count.classList.toggle('over', input.value.length > f.limit);
    }
    if (chips) {
      const on = listOf().map((s) => s.toLowerCase());
      chips.querySelectorAll('.chip').forEach((ch) => ch.classList.toggle('on', on.includes(ch.textContent.toLowerCase())));
    }
  };
  const commit = () => { state.edits[pid][f.key] = input.value; save(); refresh(); };
  input.addEventListener('input', commit);

  if (chips) {
    f.options.forEach((o) => chips.append(h('button', {
      class: 'chip',
      onclick: () => {
        if ((f.max || 1) > 1) {
          let list = listOf();
          const i = list.findIndex((x) => x.toLowerCase() === o.toLowerCase());
          if (i >= 0) list.splice(i, 1);
          else if (list.length < f.max) list.push(o);
          input.value = list.join(', ');
        } else {
          input.value = o;
        }
        commit();
      },
    }, o)));
  }
  refresh();

  const optionsBlock = chips
    ? h('details', { open: !value ? true : null }, h('summary', {}, `${f.label} options on ${PLATFORMS[pid].name} (click to choose)`), chips)
    : null;

  return h('div', { class: 'field' },
    h('div', { class: 'field-head' },
      h('label', {}, f.label), count,
      h('button', { class: 'copy', onclick: (e) => copyText(input.value, e.currentTarget) }, 'Copy')),
    input,
    f.hint ? h('div', { class: 'hint' }, f.hint) : null,
    optionsBlock);
}

// ---------------- tabs + auto-switch ----------------
document.querySelectorAll('#tabs button').forEach((b) =>
  b.addEventListener('click', () => { state.tab = b.dataset.tab; save(); render(); window.scrollTo(0, 0); }));

$('#extractBtn').addEventListener('click', extract);
$('#autoSwitch').addEventListener('change', (e) => { state.autoSwitch = e.target.checked; save(); });

function siteFromUrl(u) {
  if (/depop\.com/i.test(u)) return 'depop';
  if (/poshmark\./i.test(u)) return 'poshmark';
  if (/mercari\.com/i.test(u)) return 'mercari';
  if (/ebay\./i.test(u)) return 'ebay';
  return null;
}
async function followActiveTab() {
  if (!state.autoSwitch || !state.item) return;
  const t = await activeTab();
  const site = siteFromUrl((t && t.url) || '');
  if (site && site !== 'ebay' && site !== state.tab) { state.tab = site; save(); render(); }
}
chrome.tabs.onActivated.addListener(followActiveTab);
chrome.tabs.onUpdated.addListener((id, info) => { if (info.url) followActiveTab(); });

load();
